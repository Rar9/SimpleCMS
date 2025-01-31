/**
 * @file src/routes/+page.server.ts
 * @description
 * Server-side logic for the root route, handling redirection to the first collection with the correct language.
 */

import { publicEnv } from '@root/config/public';
import { redirect, error, type HttpError } from '@sveltejs/kit';

// Collection Manager
import { contentManager } from '@src/content/ContentManager';

// System Logger
import { logger } from '@utils/logger.svelte';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  // Unauthenticated users should be redirected to the login page
  if (!locals.user) {
    logger.debug('User is not authenticated, redirecting to login');
    throw redirect(302, '/login');
  }

  try {
    // Get the list of collections with their UUIDs
    await contentManager.initialize();
    const { contentStructure } = await contentManager.getCollectionData();
    const collections = Object.values(contentStructure);


    // If there are no collections, throw a 404 error
    if (!collections?.length) {
      logger.error('No collections available for redirection');
      throw error(404, 'No collections found');
    }

    // If the current route is not the root route, simply return the user data
    if (url.pathname !== '/') {
      logger.debug(`Already on route ${url.pathname}`);
      return { user: locals.user, permissions: locals.permissions };
    }

    // Get the first collection and use its UUID
    if (url.pathname === '/') {
      const firstCollection = collections.find((collection) => collection.nodeType === 'collection');
      const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
      if (!firstCollection) throw new Error('No collections found');

      // Construct redirect URL using UUID instead of name
      const redirectUrl = `/${defaultLanguage}${firstCollection.path}`;

      logger.info(`Redirecting to \x1b[34m${redirectUrl}\x1b[0m`);
      throw redirect(302, redirectUrl);


    }


  } catch (err) {
    // If the error has a status, rethrow it
    if ((err as HttpError)?.status) throw err;

    logger.error('Unexpected error in load function', err);
    throw error(500, 'An unexpected error occurred');
  }
};
