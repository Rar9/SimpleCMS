/**
 * @file src/content/ContentManager.ts
 * @description Content Manager for SvelteCMS
 *
 * Features:
 * - Singleton pattern for centralized content management
 * - Category & collection loading, caching, and updates from folder structure
 * - Widget initialization
 * - Dynamic schema generation based on widget configurations
 * - Caching and efficient data structures (Memory + optional Redis)
 * - Error handling
 */

import { dbAdapter, dbInitPromise } from '@src/databases/db';
import fs from 'fs/promises';

import { v4 as uuidv4 } from 'uuid';

// Types
import type { Schema, ContentTypes, Category, CollectionData } from './types';
import type { CollectionModel, ContentStructureNode, SystemContent } from '@src/databases/dbInterface';

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';
import { ensureWidgetsInitialized, } from '@src/widgets';

// System Logger
import { logger } from '@utils/logger.svelte';
import { processModule } from './utils';


interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

// Constants
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const REDIS_TTL = 300; // 5 minutes in seconds for Redis
const MAX_CACHE_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;



class ContentManager {
  private static instance: ContentManager | null = null;
  private collectionCache: Map<string, CacheEntry<Schema>> = new Map();
  private fileHashCache: Map<string, CacheEntry<string>> = new Map();
  private contentStructureCache: Map<string, CacheEntry<Category>> = new Map();
  private collectionAccessCount: Map<string, number> = new Map();
  private initialized: boolean = false;

  private loadedCollections: Schema[] = [];
  private collectionModels: Map<string, CollectionModel> = new Map()
  private collectionMap: Map<string, Schema> = new Map();
  private contentStructure: Record<string, Category> = {};
  private nestedContentStructure: ContentStructureNode[] = [];
  private dbInitPromise: Promise<void> | null = null;

  private constructor() {
    this.dbInitPromise = dbInitPromise;
  }

  static getInstance(): ContentManager {
    if (!ContentManager.instance) {
      ContentManager.instance = new ContentManager();
    }
    return ContentManager.instance;
  }

  // Wait for initialization to complete
  async waitForInitialization(): Promise<void> {
    if (this.dbInitPromise) {
      await this.dbInitPromise;
    }
  }

  // Initialize the collection manager
  public async initialize(): Promise<void> {

    if (this.initialized) return;
    logger.debug("Initializing ContentManager...");

    try {
      // First, ensure widgets are initialized
      await ensureWidgetsInitialized();

      // Then load collections
      await this.waitForInitialization();

      await this.updateCollections(true);
      logger.debug("Content Manager Collections updated");
      this.initialized = true;
    } catch (error) {
      logger.error('Initialization failed:', error);
      throw error;
    }
  }


  public async getCollectionData() {
    if (!this.initialized) {
      await this.initialize();
    }
    return {
      collectionMap: this.collectionMap,
      contentStructure: this.contentStructure,
      nestedContentStructure: this.nestedContentStructure
    };
  }
  // Load collections
  private async loadCollections(): Promise<Schema[]> {
    try {
      // Server-side collection loading
      const collections: Schema[] = [];
      const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
      const files = await this.getCompiledCollectionFiles(compiledDirectoryPath);

      for (const filePath of files) {
        try {
          const content = await this.readFile(filePath);
          const moduleData = await processModule(content);

          if (!moduleData?.schema) continue;

          const schema = moduleData.schema as Schema;
          const filePathName = filePath.split('/').pop()?.replace(/\.(ts|js)$/, '');
          if (!filePathName) continue;

          const path = this.extractPathFromFilePath(filePath);

          const processed: Schema = {
            ...schema,
            _id: schema._id!, // Always use the ID from the compiled schema
            name: schema.name || filePathName,
            label: schema.label || filePathName,
            path: path,
            icon: schema.icon || 'iconoir:info-empty',
            fields: schema.fields || [],
            permissions: schema.permissions || {},
            livePreview: schema.livePreview || false,
            strict: schema.strict || false,
            revision: schema.revision || false,
            description: schema.description || '',
            slug: schema.slug || filePathName.toLowerCase()
          };

          const model = await dbAdapter?.createCollectionModel(processed as CollectionData);
          if (!model) logger.error(`Database model creation for  ${schema.name} ${schema.path} Failed`)
          else {
            collections.push(processed);
            this.collectionModels.set(schema._id, model)
            this.collectionMap.set(schema._id, processed);
          }

          await this.setCacheValue(filePath, processed, this.collectionCache);
        } catch (err) {
          logger.error(`Failed to process file ${filePath}:`, err);
          continue;
        }
      }

      // Cache in Redis if available
      if (isRedisEnabled()) {
        await setCache('cms:all_collections', collections, REDIS_TTL);
      }

      this.loadedCollections = collections;
      logger.debug("Content Manager Collections loaded");
      return collections;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Failed to load collections', { error: errorMessage });
      throw new Error(`Failed to load collections: ${errorMessage}`);
    }
  }

  // Update collections  
  async updateCollections(recompile: boolean = false): Promise<void> {
    try {
      if (recompile) {
        // Clear both memory and Redis caches
        this.collectionCache.clear();
        this.fileHashCache.clear();
        if (isRedisEnabled()) {
          await clearCache('cms:all_collections');
        }
      }
      await this.loadCollections();
      await this.createCategories();
      logger.info('Collections updated successfully');
      // Convert category array to record structure
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`Error in updateCollections: ${errorMessage}`);
      throw new Error(`Failed to update collections: ${errorMessage}`);
    }
  }

  public getCollectionById(id: string): Schema | null {
    try {
      if (!this.initialized) {
        logger.error('Content Manager not initialized');
        return null;
      }
      const collection = this.collectionMap.get(id)
      if (!collection) {
        logger.error(`Content with id: ${id} not found`)
        return null
      }
      return collection;
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error in getCollectionById: ${errorMessage}`);
      throw error
    }

  }

  public getCollectionModelById(id: string) {
    try {
      const collectionModel = this.collectionModels.get(id)
      // Create models using UUID as the key
      return collectionModel;
    } catch (error) {
      const message = `Error fetching collection models: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(message);
      throw error
    }
  }


  public async getCollection(path: string): Promise<(Schema & { module: string | undefined }) | null> {
    try {
      if (!this.initialized) {
        logger.error('Content Manager not initialized');
      }

      const compiledDirectoryPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections';
      const collectionFile = await this.readFile(`${compiledDirectoryPath}/${path}.js`);

      const schema = this.collectionMap.get(this.contentStructure[path]._id);

      if (!schema || !collectionFile) return null;

      return { module: collectionFile, ...schema };


    } catch (error) {
      logger.error('Error getting collection', error);
      throw error;
    }
  }

  // Create categories with Redis caching
  private async createCategories(): Promise<void> {
    try {

      if (!dbAdapter) throw new Error('Database adapter not initialized');


      const structure: ContentStructureNode[] = await dbAdapter.getContentStructure();
      // Convert the array to a Map using the `path` property as the key
      const structureMap = new Map<string, ContentStructureNode>(
        structure.map(node => [node.path, node])
      );

      for (const collection of this.loadedCollections) {
        if (!collection.path) {
          logger.warn(`Collection ${collection.name} has no path`);
          continue;
        }

        const oldNode = structureMap.get(collection.path);
        if (oldNode) logger.warn(`Collection ${collection.name} Node already exists. Updating Node`);

        const parentPath = collection.path === "/" ? null : collection.path.split("/").slice(0, -1).join("/") || "/";

        const currentNode = await dbAdapter?.upsertContentStructureNode({
          _id: oldNode?._id ?? collection._id,
          name: oldNode?.name ?? collection.name as string,
          icon: oldNode?.icon ?? (collection.icon || 'bi:file'),
          path: oldNode?.path ?? collection.path,
          order: oldNode?.order ?? 999,
          nodeType: "collection",
          parentPath: oldNode?.parentPath ?? parentPath,
          translations: oldNode?.translations ?? collection.translations ?? [],
          updatedAt: oldNode?.updatedAt ?? new Date(),

        });
        this.contentStructure[currentNode.path] = currentNode;

        if (parentPath) {
          const parentParts = parentPath.split("/").filter(Boolean);
          const thisParent = parentPath === "/" ? null : parentPath.split("/").slice(0, -1).join() || "/"
          for (const part of parentParts) {
            const oldNode = structureMap.get(parentPath);
            const currentCategoryNode = await dbAdapter?.upsertContentStructureNode({
              _id: oldNode?._id ?? uuidv4(),
              name: oldNode?.name ?? part,
              icon: oldNode?.icon ?? "bi:folder",
              path: parentPath,
              order: 999,
              nodeType: "category",
              parentPath: thisParent,
              translations: oldNode?.translations ?? [],
              updatedAt: oldNode?.updatedAt ?? new Date()

            })
            this.contentStructure[currentCategoryNode.path] = currentCategoryNode;
            structureMap.set(currentCategoryNode.path, currentCategoryNode);
          }
        }
      }

      this.nestedContentStructure = this.generateNestedStructure();
      logger.debug("Content Manager SysContentStructure loaded");
      // Cache in Redis if available
      if (isRedisEnabled()) {
        await setCache('cms:categories', structureMap, REDIS_TTL);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Failed to create categories', { error: errorMessage });
      throw new Error(`Failed to create categories: ${errorMessage}`);
    }
  }

  // Generate nested JSON structure
  public generateNestedStructure(): ContentStructureNode[] {
    try {

      // Create a Map for quick lookups
      const nodeMap = new Map<string, any>();

      // Add all nodes to the Map
      Object.values(this.contentStructure).forEach(node => {
        nodeMap.set(node.path, { ...node, children: [] }); // Initialize children as an empty array
      });

      // Build the nested structure
      const nestedStructure: ContentStructureNode[] = [];

      for (const node of nodeMap.values()) {
        if (node.parentPath === null) {
          // This is a root node, add it to the nested structure
          nestedStructure.push(node);
        } else {
          // Find the parent node and add this node to its children
          const parentNode = nodeMap.get(node.parentPath);
          if (parentNode) {
            parentNode.children!.push(node);
          }
        }
      }

      return nestedStructure;
    } catch (error) {
      logger.error('Error generating nested JSON:', error);
      throw error;
    }
  }


  // Cache management methods with Redis support
  private async getCacheValue<T>(key: string, cache: Map<string, CacheEntry<T>>): Promise<T | null> {
    // Try Redis first if available
    if (isRedisEnabled()) {
      const redisValue = await getCache<T>(`cms:${key}`);
      if (redisValue) {
        // Update local cache
        cache.set(key, {
          value: redisValue,
          timestamp: Date.now()
        });
        return redisValue;
      }
    }
    // Fallback to memory cache
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private async setCacheValue<T>(key: string, value: T, cache: Map<string, CacheEntry<T>>): Promise<void> {
    // Set in Redis if available
    if (isRedisEnabled()) {
      await setCache(`cms:${key}`, value, REDIS_TTL);
    }
    // Set in memory cache
    cache.set(key, {
      value,
      timestamp: Date.now()
    });
    this.trimCache(cache);
  }

  private async clearCacheValue(key: string): Promise<void> {
    // Clear from Redis if available
    if (isRedisEnabled()) {
      await clearCache(`cms:${key}`);
    }
    // Clear from all memory caches
    this.collectionCache.delete(key);
    this.categoryCache.delete(key);
    this.fileHashCache.delete(key);
  }

  private trimCache<T>(cache: Map<string, CacheEntry<T>>): void {
    if (cache.size > MAX_CACHE_SIZE) {
      // Remove least recently used entries
      const entriesToRemove = Array.from(cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, cache.size - MAX_CACHE_SIZE);

      // Clear associated Redis cache if enabled
      if (isRedisEnabled()) {
        const keysToClear = entriesToRemove.map(([key]) => `cms:${key}`);
        clearCache(keysToClear).catch(err => {
          logger.warn('Failed to clear Redis cache entries:', err);
        });
      }

      // Remove from memory cache
      entriesToRemove.forEach(([key]) => cache.delete(key));
    }
  }

  // Extract path from file path
  private extractPathFromFilePath(filePath: string): string {
    const compiledCollectionsPath = import.meta.env.VITE_COLLECTIONS_FOLDER || 'compiledCollections/';
    const relativePath = filePath.startsWith(compiledCollectionsPath)
      ? filePath.substring(compiledCollectionsPath.length)
      : filePath;

    // Split path and remove empty parts
    const parts = relativePath.split('/').filter((part) => part !== '');

    // Remove file extension from last segment if it exists
    if (parts.length > 0) {
      parts[parts.length - 1] = parts[parts.length - 1].replace(/\.(ts|js)$/, '');
    }

    // Handle nested directory structures 
    if (parts.length > 1) {
      // Join all parts except the last one with slashes
      const directoryPath = parts.slice(0, -1).join('/');
      // Use the last part as the collection name
      const collectionName = parts[parts.length - 1];
      return `/${directoryPath}/${collectionName}`;
    }

    // Default case for single-level collections
    return `/${parts.join('/')}`;
  }

  // Get compiled Categories and Collection files
  private async getCompiledCollectionFiles(compiledDirectoryPath: string): Promise<string[]> {
    if (!fs) throw new Error('File system operations are only available on the server');

    const getAllFiles = async (dir: string): Promise<string[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const resolvedPath = `${dir}/${entry.name}`;
          return entry.isDirectory() ? getAllFiles(resolvedPath) : resolvedPath;
        })
      );
      return files.flat();
    };

    try {
      const allFiles = await getAllFiles(compiledDirectoryPath);
      logger.debug('All files found recursively', {
        Categories: compiledDirectoryPath,
        Collections: allFiles.filter((file) => file.endsWith('.js'))
      });

      // Filter the list to only include .js files
      const filteredFiles = allFiles.filter((file) => file.endsWith('.js'));

      // Return the full paths
      return filteredFiles;
    } catch (error) {
      logger.error(`Error getting compiled collection files: ${error.message}`);
      throw error;
    }
  }
  // Read file with retry mechanism
  private async readFile(filePath: string): Promise<string> {
    // Server-side file reading
    if (!fs) throw new Error('File system operations are only available on the server');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.error(`File not found: ${filePath}`);
      } else {
        logger.error(`Error reading file: ${filePath}`, error);
      }
      throw error;
    }
  }
  //Get a content node map
  public async getContentStructureMap(): Promise<Map<string, SystemContent>> {
    const contentNodes = await (dbAdapter?.getContentStructure() || Promise.resolve([]));
    const contentNodesMap = new Map<string, SystemContent>();
    contentNodes.forEach((node) => {
      contentNodesMap.set(node.path, node);
    });

    return contentNodesMap;
  }

  // Error recovery
  private async retryOperation<T>(operation: () => Promise<T>, maxRetries: number = MAX_RETRIES, delay: number = RETRY_DELAY): Promise<T> {
    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
        logger.warn(`Retry ${i + 1}/${maxRetries} for operation after error: ${lastError.message}`);
      }
    }
    throw lastError;
  }

  // Lazy loading with Redis support
  private async lazyLoadCollection(name: ContentTypes): Promise<Schema | null> {
    const cacheKey = `collection_${name}`;
    // Try getting from cache (Redis or memory)
    const cached = await this.getCacheValue(cacheKey, this.collectionCache);
    if (cached) {
      this.collectionAccessCount.set(name, (this.collectionAccessCount.get(name) || 0) + 1);
      return cached;
    }
    // Load if not cached
    const path = `config/collections/${name}.ts`;
    try {
      logger.debug(`Attempting to read file for collection: \x1b[34m${name}\x1b[0m at path: \x1b[33m${path}\x1b[0m`);
      const content = await this.readFile(path);
      logger.debug(`File content for collection \x1b[34m${name}\x1b[0m: ${content.substring(0, 100)}...`); // Log only the first 100 characters
      const schema = await this.processCollectionFile(path, content);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to lazy load collection ${name}:`, { error: errorMessage });
      throw new Error(`Failed to lazy load collection: ${errorMessage}`);
    }
    return null;
  }
}

// Export singleton instance
export const contentManager = ContentManager.getInstance();

// Export types
export type { Schema, ContentTypes, Category, CollectionData };

