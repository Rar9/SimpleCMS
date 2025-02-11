/**
 * @file src/routes/api/query/POST.ts
 * @description Handler for POST operations on collections.
 *
 * This module provides functionality to:
 * - Create new documents in a specified collection
 * - Handle file uploads
 * - Manage links between collections
 * - Process custom widget modifications
 *
 * Features:
 * - Dynamic parsing of form data, including file handling
 * - Automatic status setting for new documents
 * - Unique ID generation for new documents
 * - Link creation between collections
 * - Integration with modifyRequest for custom widget processing
 * - Comprehensive error handling and logging
 */

// Types
import type { Schema } from '@root/src/content/types';
import type { User } from '@src/auth/types';

// Interface for request body data
export interface RequestBody {
  [key: string]: unknown;
}

// Database
import { dbAdapter } from '@src/databases/db';

// Utils
import { modifyRequest } from './modifyRequest';

// System Logger
import { logger } from '@utils/logger.svelte';
import { contentManager } from '@root/src/content/ContentManager';

// Function to handle POST requests for a specified collection
export const _POST = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
  const start = performance.now();
  try {
    logger.debug(`POST request received for schema: ${schema.id}, user_id: ${user._id}`);

    // Ensure the database adapter is initialized
    if (!dbAdapter) {
      logger.error('Database adapter is not initialized.');
      return new Response('Internal server error: Database adapter not initialized', { status: 500 });
    }

    // Validate schema ID
    if (!schema._id) {
      logger.error('Invalid or undefined schema ID.');
      return new Response('Invalid or undefined schema ID.', { status: 400 });
    }

    const collection = contentManager.getCollectionModelById(schema._id); // Get collection models from the database
    // Check if the collection exists
    if (!collection) {
      logger.error(`Collection not found for schema ID: ${schema._id}`);
      return new Response('Collection not found', { status: 404 });
    }

    // Parse form data with performance tracking
    const parseStart = performance.now();
    const body: RequestBody = {};
    const fileIDS: string[] = [];

    // Parse the form data and build the body object
    for (const [key, value] of data.entries()) {
      try {
        body[key] = JSON.parse(value as string, (_, val) => {
          if (val?.instanceof === 'File') {
            fileIDS.push(val.id);
            return data.get(val.id) as File;
          }
          return val;
        });
      } catch {
        body[key] = value;
      }
    }
    const parseDuration = performance.now() - parseStart;
    logger.debug(`Form data parsed in ${parseDuration.toFixed(2)}ms for ${Object.keys(body).length} fields`);

    // Remove file entries from body
    fileIDS.forEach((id) => delete body[id]);

    // Set the status to 'published' and assign a new ObjectId
    body['status'] = 'published';
    body._id = dbAdapter.generateId();
    logger.debug(`Document prepared for insertion with ID: ${body._id}`);

    // Modify request with performance tracking
    const modifyStart = performance.now();
    await modifyRequest({ data: [body], fields: schema.fields, collection, user, type: 'POST' });
    const modifyDuration = performance.now() - modifyStart;
    logger.debug(`Request modified in ${modifyDuration.toFixed(2)}ms for document ID: ${body._id}`);

    // Handle links with performance tracking
    const linkStart = performance.now();
    if (body._links) {
      for (const _collection in body._links) {
        const linkedCollection = collections[_collection];
        if (!linkedCollection) continue;

        const newLinkId = dbAdapter.generateId();
        await dbAdapter.insertMany(_collection, [
          {
            _id: newLinkId,
            _link_id: body._id,
            _linked_collection: schema._id
          }
        ]);
        body._links[_collection] = newLinkId;
      }
    }
    const linkDuration = performance.now() - linkStart;
    logger.debug(`Links processed in ${linkDuration.toFixed(2)}ms`);

    // Insert the new document with performance tracking
    const insertStart = performance.now();
    const result = await collection.insertMany([body]);
    const insertDuration = performance.now() - insertStart;

    const totalDuration = performance.now() - start;
    logger.info(`Document inserted in ${insertDuration.toFixed(2)}ms, total operation time: ${totalDuration.toFixed(2)}ms`);

    // Return the result with performance metrics
    return new Response(
      JSON.stringify({
        success: true,
        result,
        performance: {
          total: totalDuration,
          parse: parseDuration,
          modify: modifyDuration,
          links: linkDuration,
          insert: insertDuration
        }
      }),
      {
        status: 201,
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
    logger.error(`POST operation failed after ${duration.toFixed(2)}ms for schema ID: ${schema.id}: ${errorMessage}`, { stack: errorStack });
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        performance: {
          total: duration
        }
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    );
  }
};
