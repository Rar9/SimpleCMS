/**
 * @file src/routes/(app)/config/collectionbuilder/+page.server.ts
 * @description Server-side logic for Collection Builder page authentication and authorization.
 *
 * Handles user authentication and role-based access control for the Collection Builder page.
 * Redirects unauthenticated users to the login page and restricts access based on user permissions.
 *
 * Responsibilities:
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Checks user permissions for collection builder access.
 * - Returns user data if authentication and authorization are successful.
 * - Handles cases of unauthenticated users or insufficient permissions.
 */

import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { checkUserPermission } from '@src/auth/permissionCheck';
import { permissionConfigs } from '@src/auth/permissionManager';

// System Logger
import { logger } from '@utils/logger.svelte';
import { contentManager } from '@root/src/content/ContentManager';

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const { user } = locals;

    if (!user) {
      logger.warn('User not authenticated, redirecting to login');
      throw redirect(302, '/login');
    }

    logger.debug(`User authenticated successfully for user: ${user._id}`);

    // Check user permission for collection builder
    const collectionBuilderConfig = permissionConfigs.collectionbuilder;
    const permissionCheck = await checkUserPermission(user, collectionBuilderConfig);

    if (!permissionCheck.hasPermission) {
      const message = `User ${user._id} does not have permission to access collection builder`;
      logger.warn(message);
      throw error(403, 'Insufficient permissions');
    }


    const { contentStructure, nestedContentStructure } = await contentManager.getCollectionData()

    // Return user data
    const { _id, ...rest } = user;
    return {
      user: {
        id: _id.toString(),
        ...rest
      },
      nestedContentStructure,
      contentStructure
    };
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      // This is likely a redirect or an error we've already handled
      throw err;
    }
    const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
};
