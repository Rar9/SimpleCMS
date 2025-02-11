/**
 * @file src/routes/(app)/dashboard/+page.server.ts
 * @description Server-side logic for the dashboard page.
 */

import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals }) => {
  // Check if user is authenticated
  const user = locals.user;

  if (!user) {
    logger.warn('User not authenticated, redirecting to login.');
    redirect(301, '/login');
  }

  logger.debug(`User authenticated successfully: ${user._id}`);

  const { _id, ...rest } = user;

  // Return user data with proper typing
  return {
    user: {
      id: _id.toString(),
      ...rest
    }
  };
};
