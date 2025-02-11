/**
 * @file src/content/index.ts
 * @description Index file for Content Management.
 *
 * Features:
 * - Caching and efficient data structures
 * - Content loading, caching, and updates from folder structure
 * - Widget initialization
 * - Error handling
 */

import axios from 'axios';
import { error } from '@sveltejs/kit';
import { browser, building, dev } from '$app/environment';
//import { getCollectionFiles } from '@api/getCollections/getCollectionFiles';
import { v4 as uuidv4 } from 'uuid';
//import { getCollectionModels } from '@src/databases/db';
//import { dbAdapter } from '@src/databases/db';

// Stores
import { contentStructure, collections, unAssigned, collection, collectionValue, mode } from '@root/src/stores/collectionStore.svelte';
import type { Unsubscriber } from 'svelte/store';

// Components
import { initializeWidgets } from '@widgets';

// Types
import type { Schema, ContentTypes, Category } from './types';

// System Logger
import { logger } from '@utils/logger.svelte';

// Constants for batch processing
const BATCH_SIZE = 50; // Number of collections to process per batch
const CONCURRENT_BATCHES = 5; // Number of concurrent batches

// Cache and efficient data structures
let importsCache: Record<ContentTypes, Schema> = {} as Record<ContentTypes, Schema>;
let unsubscribe: Unsubscriber | undefined;
let collectionModelsCache: Record<ContentTypes, Schema> | null = null;
const categoryLookup = new Map<string, CategoryNode>();
const collectionsByCategory = new Map<string, Set<Schema>>();

interface CategoryNode {
  id: number;
  name: string;
  icon: string;
  order: number;
  collections: Schema[];
  subcategories?: Map<string, CategoryNode>;
}

interface CollectionData {
  id: string;
  name: string;
  icon: string;
  collections: Schema[];
  subcategories: Record<string, CollectionData>;
}

// Function to create categories from folder structure
async function createCategoriesFromPath(collections: Schema[]): Promise<Category[]> {
  categoryLookup.clear();
  collectionsByCategory.clear();

  // Process collections in batches
  const batches = chunks(collections, BATCH_SIZE);

  // Process batches with concurrency limit
  for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
    const currentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
    await Promise.all(currentBatches.map(processBatch));
  }

  // Flatten and sort the category hierarchy
  const categoriesObject = flattenAndSortCategories();
  // Convert the object to an array
  const result = Object.values(categoriesObject);
  logger.debug('Created categories:', result);
  return result;
}

// Helper function to create chunks
function chunks<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));
}

// Process a batch of collections
async function processBatch(collections: Schema[]): Promise<void> {
  for (const col of collections) {
    if (!col.path) {
      logger.warn(`Collection ${col.name} has no path`);
      continue;
    }

    // Split path into segments for nested categories
    const pathSegments = col.path.split('/');
    let currentPath = '';
    let currentMap = categoryLookup;

    // Create or update category nodes for each path segment
    for (let i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      if (!currentMap.has(segment)) {
        const randomId = uuidv4();

        const config = await getCurrentPath();
        const newNode: CategoryNode = {
          id: parseInt(randomId.toString().slice(0, 8), 16),
          name: segment,
          icon: config.config.icon,
          order: config.config.order,
          collections: [],
          subcategories: new Map()
        };

        currentMap.set(segment, newNode);
        categoryLookup.set(currentPath, newNode);
        collectionsByCategory.set(currentPath, new Set());
      }

      // If this is the last segment, add the collection
      if (i === pathSegments.length - 1) {
        const categoryNode = categoryLookup.get(currentPath);
        if (categoryNode) {
          categoryNode.collections.push(col);
          collectionsByCategory.get(currentPath)?.add(col);
        }
      }

      const nextNode = currentMap.get(segment);
      if (nextNode?.subcategories) {
        currentMap = nextNode.subcategories;
      }
    }
  }
}

// Helper function to flatten and sort the category hierarchy
function flattenAndSortCategories(): Record<string, CollectionData> {
  const result: Record<string, CollectionData> = {};

  // Convert Map entries to array and sort
  const sortedCategories = Array.from(categoryLookup.entries()).sort(([, a], [, b]) => a.order - b.order);

  for (const [path, category] of sortedCategories) {
    // Sort collections within category
    const collections = Array.from(collectionsByCategory.get(path) || []).sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return a.order !== undefined ? -1 : b.order !== undefined ? 1 : 0;
    });

    result[path] = {
      id: category.id.toString(),
      name: category.name,
      icon: category.icon,
      collections,
      subcategories: {}
    };
  }

  return result;
}

// Function to get collections with cache support
export async function getCollections(): Promise<Partial<Record<ContentTypes, Schema>>> {
  logger.debug('Starting getCollections');

  // Initialize widgets
  initializeWidgets();

  // Return cached collections if available
  if (collectionModelsCache) {
    logger.debug(`Returning cached collections. Count: ${Object.keys(collectionModelsCache).length}`);
    return collectionModelsCache;
  }

  return new Promise<Partial<Record<ContentTypes, Schema>>>((resolve) => {
    unsubscribe = collections.subscribe((cols) => {
      if (Object.keys(cols).length > 0) {
        unsubscribe?.();
        collectionModelsCache = cols;
        resolve(cols);
      }
    });
  });
}

// Function to update collections
export const updateCollections = async (recompile: boolean = false): Promise<void> => {
  logger.debug('Starting updateCollections');

  if (recompile) {
    importsCache = {} as Record<ContentTypes, Schema>;
  }

  try {
    const imports = await getImports(recompile);
    logger.debug(`Imports fetched. Count: ${Object.keys(imports).length}`);

    const _categories = await createCategoriesFromPath(Object.values(imports));

    const _collections: Partial<Record<ContentTypes, Schema>> = {};
    for (const category of _categories) {
      for (const col of category.collections) {
        if (col.name) {
          _collections[col.name] = col;
        }
      }
    }

    logger.debug(`Collections processed. Count: ${Object.keys(_collections).length}`);
    logger.debug('Setting categories:', _categories);

    // Set the stores
    contentStructure.set(_categories);
    collections.set(_collections as Record<ContentTypes, Schema>);
    unAssigned.set(Object.values(imports).filter((x) => !Object.values(_collections).includes(x)));

    // Only try to fetch collection models if we're server-side and not in development mode
    if (typeof window === 'undefined' && !dev) {
      try {
        await getCollectionModels().catch((err) => {
          logger.warn(`Failed to fetch collection models: ${err}. This is expected during initial setup.`);
        });
      } catch (dbError) {
        logger.warn(`Database not ready: ${dbError}. This is expected during initial setup.`);
      }
    }

    collection.set({} as Schema);
    collectionValue.set({});
    mode.set('view');

    logger.info(`Collections updated successfully. Count: ${Object.keys(_collections).length}`);
  } catch (err) {
    logger.error(`Error in updateCollections: ${err}`);
    // Don't throw error here, just log it and continue
    // This allows the collections to still be loaded even if DB isn't ready
  }
};

// Initialize collections
//(async () => {
//  try {
//    await updateCollections();
//    logger.info('Collections initialized successfully');
//  } catch (err) {
//    logger.warn(`Note: Initialization encountered an issue: ${err}. This is expected during initial setup.`);
//  }
//})();

// Function to get imports based on environment
async function getImports(recompile: boolean = false): Promise<Record<ContentTypes, Schema>> {
  logger.debug('Starting getImports function');

  // Return from cache if available
  if (!recompile && Object.keys(importsCache).length > 0) {
    logger.debug('Returning from cache');
    return importsCache;
  }

  try {
    const processModule = async (name: string, module: ProcessedModule, modulePath: string) => {
      const collection = (module as { schema: Schema })?.schema ?? {};
      if (collection) {
        const randomId = uuidv4();
        collection.name = name as ContentTypes;
        collection.icon = collection.icon || 'iconoir:info-empty';
        collection.id = parseInt(randomId.toString().slice(0, 8), 16);

        // Extract path from module location
        const pathSegments = modulePath.split('/config/collections/')[1]?.split('/') || [];
        // Get the collection path without the filename
        const collectionPath = pathSegments.slice(0, -1).join('/');
        collection.path = collectionPath;
        logger.debug(`Set path for collection ${name} to ${collection.path}`);

        importsCache[name as ContentTypes] = collection as Schema;
      } else {
        logger.error(`Error importing collection: ${name}`);
      }
    };

    // Development/Building mode
    if (dev || building) {
      logger.debug(`Running in {${dev ? 'dev' : 'building'}} mode`);
      // Look for TypeScript files in config/collections directory
      const modules = import.meta.glob(
        [
          '../../config/collections/**/*.ts',
          '!../../config/collections/**/index.ts', // Exclude any index files
          '!../../config/collections/**/types.ts', // Exclude type definitions
          '!../../config/collections/**/utils/**/*.ts' // Exclude utility files
        ],
        {
          eager: false,
          import: 'default'
        }
      );

      // Process modules in batches
      const entries = Object.entries(modules);
      const batches = chunks(entries, BATCH_SIZE);

      for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
        const currentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
        await Promise.all(
          currentBatches.map(async (batch) => {
            await Promise.all(
              batch.map(async ([modulePath, moduleImport]) => {
                const name = modulePath.split('/').pop()?.replace(/\.ts$/, '') || '';
                const module = await moduleImport();
                await processModule(name, module, modulePath);
              })
            );
          })
        );
      }
    } else {
      // Production mode
      logger.debug('Running in production mode');
      let files: string[] = [];
      try {
        files = browser ? (await axios.get('/api/getCollections')).data : await getCollectionFiles();
        if (!Array.isArray(files)) {
          logger.error(`Files is not an array: ${JSON.stringify(files)}`);
          files = [];
        }
      } catch (error) {
        logger.error(`Error fetching collection files: ${error instanceof Error ? error.message : String(error)}`);
        files = [];
      }

      // Process files in batches
      const batches = chunks(files, BATCH_SIZE);

      for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
        const currentBatches = batches.slice(i, i + CONCURRENT_BATCHES);
        await Promise.all(
          currentBatches.map(async (batch) => {
            await Promise.all(
              batch.map(async (file) => {
                const name = file.replace(/\.js$/, '');
                try {
                  const collectionModule =
                    typeof window !== 'undefined'
                      ? (await axios.get(`/api/getCollection?fileName=${file}?_t=${Math.floor(Date.now() / 1000)}`)).data
                      : await import(/* @vite-ignore */ `${import.meta.env.collectionsFolderJS}${file}`);

                  await processModule(name, collectionModule, file);
                } catch (moduleError) {
                  logger.error(`Error processing module ${name}: ${moduleError instanceof Error ? moduleError.message : String(moduleError)}`);
                }
              })
            );
          })
        );
      }
    }

    logger.debug('Imported collections:', { collections: Object.keys(importsCache) });
    return importsCache;
  } catch (err) {
    logger.error(`Error in getImports: ${err instanceof Error ? err.message : String(err)}`);
    throw error(500, `Failed to get imports: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export { contentStructure as categories };

async function getCurrentPath() {
  const contentNodes = await dbAdapter.getContentNodes();
  const currentPath = window.location.pathname;
  const config = contentNodes.find((node) => node.path === currentPath) || {
    fields: {},
    isCollection: false,
    name: '',
    icon: '',
    path: currentPath
  };
  return { config, currentPath };
}
