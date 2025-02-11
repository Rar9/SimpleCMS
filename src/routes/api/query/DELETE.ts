/**
 * @file src/routes/api/query/DELETE.ts
 * @description Handler for DELETE operations on collections.
 *
 * This module provides functionality to:
 * - Delete multiple documents from a specified collection
 * - Handle associated link deletions
 * - Perform pre-deletion modifications via modifyRequest
 *
 * Features:
 * - Multiple document deletion support
 * - Associated link cleanup
 * - Pre-deletion request modification
 * - Performance monitoring
 * - Comprehensive error handling and logging
 */

import type { Schema } from '@root/src/content/types';
import type { User } from '@src/auth/types';

// Interface for document ID
export interface DocumentId {
  _id: string;
}

// Database
import { dbAdapter } from '@src/databases/db';

// Utils
import { modifyRequest } from './modifyRequest';

// System Logger
import { logger } from '@utils/logger.svelte';
import { contentManager } from '@root/src/content/ContentManager';

// Function to handle DELETE requests for a specified collection
export const _DELETE = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
  const start = performance.now();
  try {
    logger.debug(`DELETE request received for schema: ${schema.id}, user_id: ${user._id}`);

    // Ensure the database adapter is initialized

    // Validate schema ID
    if (!schema._id) {
      logger.error('Invalid or undefined schema ID.');
      return new Response('Invalid or undefined schema ID.', { status: 400 });
    }

    // Fetch collection models via the dbAdapter
    const collection = contentManager.getCollectionModelById(schema._id);
    if (!collection) {
      logger.error(`Collection not found for schema ID: ${schema._id}`);
      return new Response('Collection not found', { status: 404 });
    }

    // Parse and validate the IDs from the form data
    const ids = data.get('ids');
    if (!ids) {
      logger.error('No IDs provided for deletion');
      return new Response('No IDs provided for deletion', { status: 400 });
    }

    // Convert IDs using the dbAdapter, ensuring it's non-null
    const idsArray = JSON.parse(ids as string) as string[]

    if (!idsArray.length) {
      logger.error('No valid IDs provided for deletion');
      return new Response('No valid IDs provided for deletion', { status: 400 });
    }

    // Process deletions with performance tracking
    const modifyStart = performance.now();
    await Promise.all(
      idsArray.map(async (id: string, index: number) => {
        const itemStart = performance.now();
        try {
          // Modify request for the current ID
          await modifyRequest({
            collection,
            data: [{ _id: id }],
            user,
            fields: schema.fields,
            type: 'DELETE'
          });

          // Handle associated link deletions
          const linkedDeletions = (schema.links || []).map((link) =>
            dbAdapter!.deleteMany(link.toString(), {
              _link_id: id,
              _linked_collection: schema._id
            })
          );
          await Promise.all(linkedDeletions);

          const itemDuration = performance.now() - itemStart;
          logger.debug(`Item ${index + 1}/${idsArray.length} processed in ${itemDuration.toFixed(2)}ms`);
        } catch (itemError) {
          const errorMessage = itemError instanceof Error ? itemError.message : 'Unknown error';
          logger.error(`Error processing item ${index + 1}: ${errorMessage}`);
          // Continue with other items
        }
      })
    );

    const modifyDuration = performance.now() - modifyStart;
    logger.debug(`Request modifications completed in ${modifyDuration.toFixed(2)}ms`);

    // Perform the deletion in the main collection
    const deleteStart = performance.now();
    const deletedCount = await collection.deleteMany({ _id: { $in: idsArray } });
    const deleteDuration = performance.now() - deleteStart;

    logger.info(`Deleted ${deletedCount} documents in ${deleteDuration.toFixed(2)}ms for schema ID: ${schema._id}`);

    const totalDuration = performance.now() - start;
    logger.info(`DELETE operation completed in ${totalDuration.toFixed(2)}ms`);

    // Return the result as a JSON response
    return new Response(
      JSON.stringify({
        deletedCount,
        performance: {
          total: totalDuration,
          modify: modifyDuration,
          delete: deleteDuration
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    );
  } catch (error) {
    const duration = performance.now() - start;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error(`DELETE operation failed after ${duration.toFixed(2)}ms for schema ID: ${schema.id}: ${errorMessage}`, {
      stack: errorStack
    });
    return new Response(errorMessage, { status: 500 });
  }
};
