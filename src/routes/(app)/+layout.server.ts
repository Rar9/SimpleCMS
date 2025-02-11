/**
 * @file src/routes/(app)/+layout.server.ts
 * @description
 * This file is the server-side logic for the all collection data
 */

import type { LayoutServerLoad } from './$types';
import { contentManager } from '@src/content/ContentManager';
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// Server-side load function for the layout
export const load: LayoutServerLoad = async ({ locals }) => {
  const { theme } = locals;

  try {
    await contentManager.initialize();

    const { contentStructure, nestedContentStructure } = await contentManager.getCollectionData();

    // logger.debug('Loaded layout data:', {
    //   collectionCount: collections.length
    // });
    // ]

    return {
      theme: theme || DEFAULT_THEME,
      contentStructure: contentStructure,
      nestedContentStructure

    };
  } catch (error) {
    console.error('Failed to load layout data:', error);
    logger.error('Failed to load layout data:', error);

    // Return fallback data
    return {
      theme: theme || DEFAULT_THEME,
      contentStructure: [],
      error: 'Failed to load collection data'
    };
  }
};
