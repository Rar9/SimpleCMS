/**
 * @file src/routes/api/content-structure/+server.ts
 * @description Unified API endpoint for managing content structure metadata
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { contentManager } from '@src/content/ContentManager';
import { dbAdapter } from '@src/databases/db';

// Redis
import { isRedisEnabled, getCache, setCache, clearCache } from '@src/databases/redis';

// System Logger
import { logger } from '@utils/logger.svelte';

const CACHE_TTL = 300; // 5 minutes

export const GET: RequestHandler = async ({ url }) => {
  try {
    const action = url.searchParams.get('action');
    logger.debug('GET request received', { action });

    // Try to get from Redis cache first
    if (!browser && isRedisEnabled()) {
      const cacheKey = `api:content-structure:${action || 'default'}`;
      const cached = await getCache(cacheKey);
      if (cached) {
        logger.debug('Returning cached data', { action });
        return json(cached);
      }
    }

    let response;

    switch (action) {
      case 'getStructure': {
        // Return full structure with metadata
        const { contentStructure: contentNodes } = await contentManager.getCollectionData();





        // Process collections with UUIDs
        // Process categories with UUIDs
        response = {

          contentStructure: contentNodes
        };

        // Cache the response if Redis is enabled
        if (!browser && isRedisEnabled()) {
          const cacheKey = `api:content-structure:${action}`;
          await setCache(cacheKey, response, CACHE_TTL);
        }

        return json({ data: response });
      }

      case 'getContentStructure': {
        // Return content nodes from database
        const contentNodesDB = await dbAdapter.getContentStructure();
        logger.info('Returning content structure from database');
        response = {
          success: true,
          contentNodes: contentNodesDB
        };
        break;
      }

      default:
        throw error(400, 'Invalid action');
    }

    // Cache in Redis if available
    if (!browser && isRedisEnabled()) {
      const cacheKey = `api:content-structure:${action || 'default'}`;
      await setCache(cacheKey, response, CACHE_TTL);
    }
    return json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error in GET /api/content-structure:', message);
    throw error(500, `Failed to process content structure request: ${message}`);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();
    const action = data.action;
    logger.debug('POST request received', { data, action });

    switch (action) {
      case 'updateMetadata': {
        // Updates metadata for categories and collections
        const { items } = data;

        if (!items || !Array.isArray(items)) {
          throw error(400, 'Items array is required');
        }

        const updatePromises = items.map(async (item: SystemContent) => {
          // Validate path format
          if (!item.path.startsWith('/collections/')) {
            throw error(400, `Invalid path format: ${item.path}. Path must start with /collections/`);
          }

          if (item._id) {
            // Get existing item to check if path has changed
            const existingItem = await dbAdapter.getContentStructureById(item._id);
            if (existingItem && existingItem.path !== item.path) {
              logger.info(`Path changed for item ${item._id} from ${existingItem.path} to ${item.path}`);
              // Handle path change - additional cleanup may be needed
              await dbAdapter.cleanupContentStructure(existingItem.path);
            }
            return await dbAdapter.updateContentStructure(item._id, item);
          } else {
            // If item does not have an ID, it's a new item that does not have metadata.
            // Add default icon if it's missing
            const itemWithDefaults = {
              ...item,
              icon: item.icon || (item.isCollection ? 'bi:file-text' : 'bi:folder'),
              order: item.order || 999
            };

            return await dbAdapter.createContentStructure(itemWithDefaults);
          }
        });
        await Promise.all(updatePromises);

        await contentManager.updateCollections(true);
        logger.info('Content structure metadata updated successfully');
        return json({
          success: true,
          message: 'Content structure metadata updated successfully'
        });
      }
      case 'recompile': {
        // Clear Redis cache if available
        if (!browser && isRedisEnabled()) {
          await clearCache('api:content-structure:*');
        }

        // Reset the content manager's internal state and force recompilation
        await contentManager.updateCollections(true);
        logger.info('Collections recompiled successfully');
        return json({
          success: true,
          message: 'Collections recompiled successfully'
        });
      }
      default:
        throw error(400, 'Invalid action');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error in POST /api/content-structure:', message);
    throw error(500, `Failed to process content structure request: ${message}`);
  }
};

export const PUT: RequestHandler = async ({ request }) => {
  try {
    const { _id, updates } = await request.json();

    if (!_id || !updates) {
      throw error(400, '_id and updates are required');
    }

    const updatedNode = await dbAdapter.updateContentStructure(_id, updates);
    if (!updatedNode) throw error(404, 'Node not found');
    // Update collections to reflect the changes
    await contentManager.updateCollections(true);
    logger.info(`Content node \x1b[34m${_id}\x1b[0m updated successfully`);
    return json({
      success: true,
      message: 'Content Structure updated successfully',
      data: updatedNode
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error in PUT /api/content-structure:', errorMessage);
    throw error(500, `Failed to update content structure: ${errorMessage}`);
  }
};
