/**
 * @file src/routes/api/query/+server.ts
 * @description Main API endpoint for handling CRUD operations on collections.
 *
 * This module provides a centralized handler for various database operations:
 * - GET: Retrieve entries from a collection
 * - POST: Create new entries in a collection
 * - PATCH: Update existing entries in a collection
 * - DELETE: Remove entries from a collection
 * - SETSTATUS: Update the status of entries in a collection
 *
 * Features:
 * - User authentication and authorization
 * - Permission checking based on user roles and collection schemas
 * - Support for pagination, filtering, and sorting
 * - Content language handling with defaults
 * - Comprehensive error handling and logging
 */

import { publicEnv } from '@root/config/public';
import type { RequestHandler } from '@sveltejs/kit';

// Types
import type { User } from '@src/auth/types';
import type { Schema } from '@root/src/content/types';

// Interface for cookies
export interface CookieData {
  get: (name: string) => string | undefined;
  [key: string]: unknown;
}

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Collection Manager
import { contentManager } from '@src/content/ContentManager';

// Import handlers
import { _GET } from './GET';
import { _POST } from './POST';
import { _PATCH } from './PATCH';
import { _DELETE } from './DELETE';
import { _SETSTATUS } from './SETSTATUS';

// System Logger
import { logger } from '@utils/logger.svelte';

// Constants
const DEFAULT_LANGUAGE = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';

// Helper function to check user permissions
async function checkUserPermissions(data: FormData, cookies: CookieData) {
  try {
    // Retrieve the session ID from cookies
    const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
    // Retrieve the user ID from the form data
    const user_id = data.get('user_id') as string;

    if (!auth) {
      throw Error('Auth is not initialized');
    }

    // Authenticate user based on user ID or session ID
    const user = user_id ? ((await auth.checkUser({ user_id: user_id })) as User) : ((await auth.validateSession({ session_id })) as User);

    if (!user) {
      throw Error('Unauthorized');
    }

    // Retrieve the collection name from the form data
    const collectionId = data.get('collectionId') as string;

    if (!collectionId) {
      throw Error('Collection name is required');
    }

    // Get the schema for the specified collection from ContentManager
    const collectionSchema = contentManager.getCollectionById(collectionId);

    if (!collectionSchema) {
      throw Error('Collection not found');
    }

    // Check read and write permissions for the user
    const has_read_access = collectionSchema?.permissions?.[user.role]?.read !== false;
    const has_write_access = collectionSchema?.permissions?.[user.role]?.write !== false;

    logger.debug(`Permission check completed`);

    return { user, collection_schema: collectionSchema, has_read_access, has_write_access };
  } catch (error) {
    logger.error(`Permission check failed`);
    throw error;
  }
}

// Helper function to parse request parameters
function parseRequestParameters(data: FormData) {
  const page = parseInt(data.get('page') as string) || 1;
  const limit = parseInt(data.get('limit') as string) || 0;
  const filter = JSON.parse((data.get('filter') as string) || '{}');
  const sort = JSON.parse((data.get('sort') as string) || '{}');

  // Ensure contentLanguage is always set
  let contentLanguage = data.get('contentLanguage') as string;
  if (!contentLanguage || contentLanguage.trim() === '') {
    contentLanguage = DEFAULT_LANGUAGE;
    logger.debug(`Using default language: ${DEFAULT_LANGUAGE}`);
  }

  return { page, limit, filter, sort, contentLanguage };
}

// Main POST handler
export const POST: RequestHandler = async ({ request, cookies }) => {
  // Retrieve data from the request form
  const data = await request.formData();
  // Retrieve the method from the form data
  const method = data.get('method') as string;

  logger.debug('Received request', { method, user_id: data.get('user_id') });

  try {
    // Check user permissions
    const { user, collection_schema, has_read_access, has_write_access } = await checkUserPermissions(data, cookies);
    logger.debug('User permissions checked', { user: user._id, has_read_access, has_write_access, contentTypes: collection_schema.name });

    // If user does not have read access, return 403 Forbidden response
    if (!has_read_access) {
      logger.warn('Forbidden access attempt', { user: user._id });
      return new Response('Forbidden', { status: 403 });
    }

    // Parse request parameters
    const { page, limit, filter, sort, contentLanguage } = parseRequestParameters(data);

    logger.debug('Request parameters parsed', {
      page,
      limit,
      filter,
      sort,
      contentLanguage,
      contentTypes: collection_schema.name
    });

    let response;

    // Handle different methods (GET, POST, PATCH, DELETE, SETSTATUS)
    switch (method) {
      case 'GET':
        response = await _GET({ contentLanguage, filter, schema: collection_schema, sort, user, limit, page });
        break;
      case 'POST':
      case 'PATCH':
      case 'DELETE':
      case 'SETSTATUS': {
        // If user does not have write access, return 403 Forbidden response
        if (!has_write_access) {
          logger.warn('Forbidden write access attempt', { user: user._id });
          return new Response('Forbidden', { status: 403 });
        }

        // Select the appropriate handler based on the method
        const handler = {
          POST: _POST,
          PATCH: _PATCH,
          DELETE: _DELETE,
          SETSTATUS: _SETSTATUS
        }[method];

        // Call the handler and get its response
        logger.info('Processing request', { method, user: user._id });
        response = await handler({
          data,
          schema: collection_schema,
          user
        });
        break;
      }
      default:
        // If method is not allowed, return 405 Method Not Allowed response
        logger.warn('Method not allowed', { method });
        return new Response('Method not allowed', { status: 405 });
    }

    logger.info(`Request completed`);

    return response;
  } catch (error) {
    // Handle error by checking its type
    const status = error.message === 'Unauthorized' ? 401 : error.message.includes('Forbidden') ? 403 : 500;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error(`Error processing request`, { error: errorMessage });
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        status,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    );
  }
};
