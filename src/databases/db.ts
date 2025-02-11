/**
 * @file src/databases/db.ts
 * @description
 * Database and authentication initialization and management module.
 *
 * This module is responsible for:
 * - Loading and initializing database and authentication adapters based on the configured DB_TYPE
 * - Establishing database connections with a retry mechanism
 * - Managing initialization of authentication models, media models, and collection models
 * - Setting up default roles and permissions
 * - Configuring Google OAuth2 client if credentials are provided
 *
 * Key Features:
 * - Dynamic Adapter Loading: Supports MongoDB and SQL-based adapters (MariaDB, PostgreSQL) with dynamic import.
 * - Initialization Management: Manages initialization state to prevent redundant setup processes.
 * - Theme Initialization: Handles default theme setup and ensures it's marked as default if not already.
 * - Authentication and Authorization: Configures and initializes authentication adapters.
 * - Google OAuth2 Integration: Optionally sets up Google OAuth2 client if the client ID and secret are provided.
 */
import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';

import fs from 'node:fs/promises';

import { error } from '@sveltejs/kit';
import { connectToMongoDB } from './mongodb/dbconnect';

// Auth
import { Auth } from '@src/auth';

// Content Manager
import { contentManager } from '@src/content/ContentManager';
import { getPermissionByName, getAllPermissions, syncPermissions } from '@src/auth/permissionManager';

// Adapters Interfaces
import type { dbInterface } from './dbInterface';
import type { authDBInterface } from '@src/auth/authDBInterface';

// MongoDB Adapters
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// Database and authentication adapters
export let dbAdapter: dbInterface | null = null; // Database adapter
export let authAdapter: authDBInterface | null = null; // Authentication adapter
export let auth: Auth | null = null; // Authentication instance
export let isConnected = false; // Database connection state
let isInitialized = false; // Initialization state
let initializationPromise: Promise<void> | null = null; // Initialization promise

// Load database and authentication adapters
async function loadAdapters() {
  try {
    logger.debug(`Loading ${privateEnv.DB_TYPE} adapters...`);
    if (privateEnv.DB_TYPE === 'mongodb') {
      const { MongoDBAdapter } = await import('./mongodb/mongoDBAdapter');
      dbAdapter = new MongoDBAdapter();
      const userAdapter = new UserAdapter();
      const sessionAdapter = new SessionAdapter();
      const tokenAdapter = new TokenAdapter();
      authAdapter = {
        // User Management Methods
        createUser: userAdapter.createUser.bind(userAdapter),
        updateUserAttributes: userAdapter.updateUserAttributes.bind(userAdapter),
        deleteUser: userAdapter.deleteUser.bind(userAdapter),
        getUserById: userAdapter.getUserById.bind(userAdapter),
        getUserByEmail: userAdapter.getUserByEmail.bind(userAdapter),
        getAllUsers: userAdapter.getAllUsers.bind(userAdapter),
        getUserCount: userAdapter.getUserCount.bind(userAdapter),

        // Session Management Methods
        createSession: sessionAdapter.createSession.bind(sessionAdapter),
        updateSessionExpiry: sessionAdapter.updateSessionExpiry.bind(sessionAdapter),
        deleteSession: sessionAdapter.deleteSession.bind(sessionAdapter),
        deleteExpiredSessions: sessionAdapter.deleteExpiredSessions.bind(sessionAdapter),
        validateSession: sessionAdapter.validateSession.bind(sessionAdapter),
        invalidateAllUserSessions: sessionAdapter.invalidateAllUserSessions.bind(sessionAdapter),
        getActiveSessions: sessionAdapter.getActiveSessions.bind(sessionAdapter),

        // Token Management Methods
        createToken: tokenAdapter.createToken.bind(tokenAdapter),
        validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
        consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
        getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
        deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),

        // Permission Management Methods
        getAllPermissions,
        getPermissionByName
      } as authDBInterface;
      logger.debug('MongoDB adapters loaded successfully.');
    } else if (privateEnv.DB_TYPE === 'mariadb' || privateEnv.DB_TYPE === 'postgresql') {
      logger.debug('Implement & Loading SQL adapters...');
      // Implement SQL adapters loading here
      throw new Error(`SQL adapter loading not yet implemented for ${privateEnv.DB_TYPE}`);
    } else {
      throw error(500, `Unsupported DB_TYPE: ${privateEnv.DB_TYPE}`);
    }
  } catch (err) {
    const message = `Error in loadAdapters: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
}

// Initialize default theme
async function initializeDefaultTheme(dbAdapter: dbInterface): Promise<void> {
  try {
    logger.debug('Initializing \x1b[34mdefault theme\x1b[0m...');
    const themes = await dbAdapter.getAllThemes();
    logger.debug(`Found \x1b[34m${themes.length}\x1b[0m themes`);

    if (themes.length === 0) {
      await dbAdapter.storeThemes([DEFAULT_THEME]);
      logger.debug('Default \x1b[34mSveltyCMS theme\x1b[0m created successfully.');
    } else {
      logger.info('Themes already exist in the database. Skipping default theme initialization.');
    }
  } catch (err) {
    const message = `Error in initializeDefaultTheme: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
}

// Initialize the media folder
async function initializeMediaFolder() {
  const mediaFolderPath = publicEnv.MEDIA_FOLDER;
  try {
    // Check if the media folder exists
    await fs.access(mediaFolderPath);
    logger.info(`Media folder already exists: \x1b[34m${mediaFolderPath}\x1b[0m`);
  } catch {
    // If the folder does not exist, create it
    logger.info(`Media folder not found. Creating new folder: \x1b[34m${mediaFolderPath}\x1b[0m`);
    await fs.mkdir(mediaFolderPath, { recursive: true });
    logger.info(`Media folder created successfully: \x1b[34m${mediaFolderPath}\x1b[0m`);
  }
}

// Initialize virtual folders
async function initializeVirtualFolders() {
  if (!dbAdapter) {
    throw error(500, 'Database adapter not initialized');
  }
  try {
    const virtualFolders = await dbAdapter.getVirtualFolders();
    if (virtualFolders.length === 0) {
      // Create a default root folder
      const rootFolder = await dbAdapter.createVirtualFolder({
        name: publicEnv.MEDIA_FOLDER,
        parent: undefined,
        path: publicEnv.MEDIA_FOLDER,
        type: 'folder'
      });

      // Log only the essential information
      logger.info('Default root virtual folder created:', {
        name: rootFolder.name,
        path: rootFolder.path,
        id: rootFolder._id?.toString() || 'No ID'
      });
    } else {
      logger.info(`Found \x1b[34m${virtualFolders.length}\x1b[0m virtual folders.`);
    }
  } catch (err) {
    const message = `Error in initializeVirtualFolders: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw error(500, message);
  }
}

// Initialize adapters
async function initializeAdapters(): Promise<void> {
  if (isInitialized) {
    logger.debug('Adapters already initialized, skipping initialization.');
    return;
  }
  try {
    // Load adapters and connect to MongoDB concurrently
    await Promise.all([loadAdapters(), connectToMongoDB()]);
    if (!dbAdapter) {
      throw error(500, 'Database adapter not initialized');
    }
    // Initialize database models
    await dbAdapter.setupAuthModels();
    await dbAdapter.setupMediaModels();
    await dbAdapter.setupWidgetModels();

    // Initialize remaining components
    await initializeMediaFolder();
    await initializeDefaultTheme(dbAdapter);
    await initializeVirtualFolders();
    await initializeRevisions();
    await syncPermissions();
    // Initialize ContentManager
    logger.debug('Initializing ContentManager...');
    await contentManager.initialize();

    if (!authAdapter) {
      throw error(500, 'Authentication adapter not initialized');
    }
    // Initialize authentication
    auth = new Auth(authAdapter);
    logger.debug('Authentication adapter initialized.');
    isInitialized = true;
    isConnected = true;
    logger.debug('Adapters initialized successfully');
  } catch (err) {
    const message = `Error in initializeAdapters: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    isInitialized = false; // Reset initialization flag on error
    isConnected = false; // Reset connection flag on error
    throw error(500, message);
  }
}

// Initialize revisions
async function initializeRevisions() {
  if (!dbAdapter) {
    throw error(500, 'Database adapter not initialized');
  }

  // Implement any revision-specific initialization logic here
  logger.info('Revisions initialized successfully');
}

// Ensure initialization runs once
if (!initializationPromise) {
  initializationPromise = initializeAdapters()
    .then(() => logger.info('Initialization completed successfully.'))
    .catch((err) => {
      const message = `Initialization promise rejected with error: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      initializationPromise = null;
      throw err;
    });
}

interface CollectionModel {
  name: string;
  schema: object;
}

// Export collections
const collectionsModels: { [key: string]: CollectionModel } = {};

// Export collections

// Export functions and state
export { collectionsModels, initializationPromise as dbInitPromise };
