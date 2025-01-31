/**
 * @file src/databases/dbInterface.ts
 * @description Database interface definition for the CMS.
 *
 * This module defines the dbInterface, which serves as a contract for database adapters.
 * It specifies methods for:
 * - Database connection and setup
 * - Basic CRUD operations
 * - Draft and revision management
 * - Widget management
 * - Theme management
 * - System preferences management
 *
 * The interface ensures consistency across different database implementations
 * (e.g., MongoDB, MariaDB, PostgreSQL) by defining a common set of methods
 * that must be implemented by each adapter.
 *
 * It also defines a generic CollectionModel interface for use by database adapters.
 *
 * Usage:
 * This interface should be implemented by all database adapters in the CMS.
 * It provides a unified API for database operations, allowing for easy
 * swapping of database backends without changing the application logic.
 */

import type { CollectionData } from '@src/content/types';
import type { ScreenSize } from '@root/src/stores/screenSizeStore.svelte';
import type { UserPreferences, WidgetPreference } from '@root/src/stores/userPreferences.svelte';

// Define a Theme type for better type safety
export interface Theme {
  _id: string; // The ID of the theme
  name: string; // The name of the theme
  path: string; // The path to the theme file
  isDefault: boolean; // Whether the theme is the default theme
  createdAt: Date; // Creation timestamp of the theme
  updatedAt: Date; // Last update timestamp of the theme
}

export interface Widget {
  _id: string; // The ID of the widget
  name: string; // The name of the widget
  isActive: boolean; // Whether the widget is active
  createdAt: Date; // Creation timestamp of the widget
  updatedAt: Date; // Last update timestamp of the widget
}

export interface SystemPreferences {
  _id: string; // The ID of the SystemPreferences
  name: string; // The name of the SystemPreferences
  isActive: boolean; // Whether the SystemPreferences is active
  createdAt: Date; // Creation timestamp of the SystemPreferences
  updatedAt: Date; // Last update timestamp of the SystemPreferences
}

// Virtual folders for media
export interface SystemVirtualFolder {
  _id: string;
  name: string;
  parent: string | null;
  path: string;
  icon?: string;
  order?: number;
  updatedAt?: Date;
}

// Document types
export type DocumentContent = Record<string, unknown>;

// Query types
export type Query = Record<string, unknown>;
export type Update = Record<string, unknown>;
export type Insert = Record<string, unknown>;

// Database types
export interface DatabaseId {
  toString(): string;
}

// Draft Interface
export interface Draft {
  _id: string; // Unique identifier for the draft
  originalDocumentId: string; // ID of the original document
  collectionId: string; // ID of the collection the draft belongs to
  createdBy: string; // ID of the user who created the draft
  content: DocumentContent; // Content of the draft
  createdAt: Date; // Creation timestamp of the draft
  updatedAt: Date; // Last update timestamp of the draft
  status: 'draft' | 'published'; // Status of the draft
}

// Revision Interface
export interface Revision {
  _id: string; // Unique identifier for the revision
  collectionId: string; // ID of the collection
  documentId: string; // ID of the document
  createdBy: string; // ID of the user who created the revision
  content: DocumentContent; // Content of the revision
  createdAt: Date; // Creation timestamp of the revision
  version: number; // Version number of the revision
}

// Collection interface
export interface CollectionModel {
  modelName: string;
  find(query: Query): Promise<DocumentContent[]>;
  updateOne(query: Query, update: Update): Promise<DocumentContent>;
  updateMany(query: Query, update: Update): Promise<DocumentContent[]>;
  insertMany(docs: DocumentContent[]): Promise<DocumentContent[]>;
  deleteOne(query: Query): Promise<number>;
  deleteMany(query: Query): Promise<number>;
  countDocuments(query?: Query): Promise<number>;
}

// Content structure schema for categories and collections
export interface ContentStructureNode {
  _id: string; // UUID from compiled collection
  name: string;
  path: string; // Always starts with /collections/
  icon: string; // Default icon for collections
  order: number;
  translations: Array<{ languageTag: string; translationName: string }>;
  parentPath: string | null;
  nodeType: 'category' | 'collection';
  updatedAt: Date;
  children?: ContentStructureNode[];
}

// Collection Node
export interface CollectionNode extends ContentStructureNode {
  nodeType: 'collection';
  label: string;
  permissions: Record<string, unknown>;
  livePreview: boolean;
  strict: boolean;
  revision: boolean;
  description: string;
  slug: string;
  status: 'draft' | 'published' | 'unpublished' | 'scheduled' | 'cloned';
  links: string[];
}

// Media types
export interface MediaItem {
  _id: string;
  filename: string;
  path: string;
  size: number;
  type: string;
  folder_id?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Define the dbInterface with specific return types
export interface dbInterface {
  name: string;

  // Database Connection and Setup Methods
  connect(): Promise<void>; // Connect to the database and return a promise that resolves when connected.
  getCollectionModels(): Promise<Record<string, CollectionModel>>; // Return a promise that resolves with an object containing all the CollectionModels.
  setupAuthModels(): Promise<void>; // Set up the auth models.
  setupMediaModels(): Promise<void>; // Set up the media models.
  setupWidgetModels(): Promise<void>; // set up the widget models.

  // Additional Methods for Data Operations
  findOne(collection: string, query: Query): Promise<DocumentContent | null>; // Find one document from a collection
  findMany(collection: string, query: Query): Promise<DocumentContent[]>; // Find multiple documents from a collection
  insertOne(collection: string, doc: Insert): Promise<DocumentContent>; // Insert one document into a collection
  insertMany(collection: string, docs: Insert[]): Promise<DocumentContent[]>; // Insert many documents into a collection
  updateOne(collection: string, query: Query, update: Update): Promise<DocumentContent>; // Update only one document in a collection
  updateMany(collection: string, query: Query, update: Update): Promise<DocumentContent[]>; // Update many documents in a collection
  deleteOne(collection: string, query: Query): Promise<number>; // Delete documents in a collection
  deleteMany(collection: string, query: Query): Promise<number>; // Delete documents in a collection
  countDocuments(collection: string, query?: Query): Promise<number>; // Count documents in a collection
  convertId(id: string): DatabaseId; // Convert id to string
  generateId(): string; // Generate an ID using ObjectId

  // Methods for Draft and Revision Management
  createDraft(content: DocumentContent, collectionId: string, original_document_id: string, user_id: string): Promise<Draft>; // Create a new draft
  updateDraft(draft_id: string, content: DocumentContent): Promise<Draft>; // Update an existing draft
  publishDraft(draft_id: string): Promise<Draft>; // Publish a draft
  getDraftsByUser(user_id: string): Promise<Draft[]>; // Get drafts by user
  createRevision(collectionId: string, documentId: string, userId: string, data: DocumentContent): Promise<Revision>; // Create a new revision
  getRevisions(collectionId: string, documentId: string): Promise<Revision[]>; // Get revisions for a document
  restoreRevision(collectionId: string, revisionId: string): Promise<void>; // Restore a specific revision
  deleteRevision(revisionId: string): Promise<void>; // Delete a specific revision

  // Methods for Widget Management
  installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void>; // Install a widget from a URL or a local file.
  getAllWidgets(): Promise<Widget[]>; // Get all installed widgets.
  getActiveWidgets(): Promise<string[]>; // Get active widgets.
  activateWidget(widgetName: string): Promise<void>; // Activate a widget
  deactivateWidget(widgetName: string): Promise<void>; // Deactivate a widget
  updateWidget(widgetName: string, updateData: Record<string, unknown>): Promise<void>; // Update a widget

  // Theme-related methods
  setDefaultTheme(themeName: string): Promise<void>; // Set the default theme.
  storeThemes(themes: Theme[]): Promise<void>; // Store a list of themes.
  getDefaultTheme(): Promise<Theme | null>; // Get the default theme.
  getAllThemes(): Promise<Theme[]>; // Get all themes.

  // System Preferences
  getSystemPreferences(user_id: string): Promise<UserPreferences | null>; // Get system preferences.
  updateSystemPreferences(user_id: string, screenSize: ScreenSize, preferences: WidgetPreference[]): Promise<void>; // Update system preferences.
  clearSystemPreferences(user_id: string): Promise<void>; // Clear system preferences.

  // Virtual Folder Methods for direct database interactions
  createVirtualFolder(folderData: {
    name: string;
    parent?: string;
    path: string;
    icon?: string;
    order?: number;
    type?: 'folder' | 'collection';
  }): Promise<SystemVirtualFolder>;
  getVirtualFolders(): Promise<SystemVirtualFolder[]>;
  getVirtualFolderContents(folderId: string): Promise<DocumentContent[]>;
  updateVirtualFolder(
    folderId: string,
    updateData: { name?: string; parent?: string; icon?: string; order?: number }
  ): Promise<SystemVirtualFolder | null>;
  deleteVirtualFolder(folderId: string): Promise<boolean>;

  // Content Structure Methods for direct database interactions
  upsertContentStructureNode(contentData: ContentStructureNode | CollectionNode): Promise<ContentStructureNode>;
  getContentStructure(): Promise<ContentStructureNode[]>;
  getContentStructureChildren(parentPath: string): Promise<Document[]>;
  updateContentStructure(contentId: string, updateData: Partial<CollectionData>): Promise<Document | null>;
  deleteContentStructure(contentId: string): Promise<boolean>;

  // Collections
  createCollectionModel(collection: CollectionData): Promise<CollectionModel>;
  // Media Management
  getAllMedia(): Promise<MediaItem[]>; // Get all media.
  getMediaInFolder(folder_id: string): Promise<MediaItem[]>; // Get media in folder.
  deleteMedia(media_id: string): Promise<boolean>; // Delete media.
  getLastFiveMedia(): Promise<MediaItem[]>; // Get last five media.

  // Method for Disconnecting
  disconnect(): Promise<void>; // Disconnect from server.
}
