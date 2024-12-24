/**
 * @file src/databases/mongodb/mongoDBAdapter.ts
 * @description MongoDB adapter for CMS database operations, user preferences, and virtual folder management.
 *
 * This module provides an implementation of the `dbInterface` for MongoDB, handling:
 * - MongoDB connection management with a robust retry mechanism
 * - CRUD operations for collections, documents, drafts, revisions, and widgets
 * - Management of media storage, retrieval, and virtual folders
 * - User authentication and session management
 * - Management of system preferences including user screen sizes and widget layouts
 * - Theme management
 * - Content Structure Management
 *
 * Key Features:
 * - Automatic reconnection with exponential backoff for MongoDB
 * - Schema definitions and model creation for various collections (e.g., Drafts, Revisions, Widgets, Media)
 * - Robust handling of media files with specific schemas for different media types
 * - Management of authentication-related models (e.g., User, Token, Session)
 * - Default and custom theme management with database storage
 * - User preferences storage and retrieval, including layout and screen size information
 * - Virtual folder management for organizing media
 * - Flexible Content Structure management for pages and collections
 *
 * Usage:
 * This adapter is utilized when the CMS is configured to use MongoDB, providing a
 * database-agnostic interface for various database operations within the CMS.
 * The adapter supports complex queries, schema management, and handles error logging
 * and connection retries. It integrates fully with the CMS for all data management needs.
 */

import { browser } from '$app/environment';
import path from 'path';
import type { Unsubscriber } from 'svelte/store';
import type { ScreenSize } from '@root/src/stores/screenSizeStore.svelte';
import type { UserPreferences, WidgetPreference } from '@root/src/stores/userPreferences.svelte';
import type { VirtualFolderUpdateData } from '@src/types/virtualFolder';

// Database
import mongoose, { Schema } from 'mongoose';
import type { Document, Model, FilterQuery, UpdateQuery } from 'mongoose';
import type { dbInterface, Draft, Revision, Theme, Widget, DocumentContent } from '../dbInterface';

// Authentication Models
import { UserSchema } from '@src/auth/mongoDBAuth/userAdapter';
import { TokenSchema } from '@src/auth/mongoDBAuth/tokenAdapter';
import { SessionSchema } from '@src/auth/mongoDBAuth/sessionAdapter';

// Database Models
import { ContentStructureModel } from './models/contentStructure';
import type { ContentStructureNode } from './models/contentStructure';
import { DraftModel } from './models/draft';
import { RevisionModel } from './models/revision';
import { ThemeModel } from './models/theme';
import { WidgetModel, widgetSchema } from './models/widget';
import { mediaSchema } from './models/media';
import { SystemVirtualFolderModel } from './models/systemVirtualFolder';
import { SystemPreferencesModel } from './models/systemPreferences';

// Types
import type { CollectionConfig } from '@src/content/types';
import type { MediaBase, MediaType } from '@utils/media/mediaModels';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logging
import { logger } from '@utils/logger.svelte';

// Widget Manager
import { initializeWidgets, getWidgets } from '@components/widgets/widgetManager.svelte';

export class MongoDBAdapter implements dbInterface {
  private unsubscribe: Unsubscriber | undefined;
  private collectionsInitialized = false;

	// Connect to MongoDB

	// Helper method to recursively scan directories for compiled content structure files
	private async scanDirectoryForContentStructure(dirPath: string): Promise<string[]> {
		const collectionFiles: string[] = [];
		try {
			const entries = await import('fs').then((fs) => fs.promises.readdir(dirPath, { withFileTypes: true }));
			logger.debug(`Scanning directory: \x1b[34m${dirPath}\x1b[0m`);
			for (const entry of entries) {
				const fullPath = path.posix.join(dirPath, entry.name);
				if (entry.isDirectory()) {
					// Recursively scan subdirectories
					logger.debug(`Found subdirectory: \x1b[34m${entry.name}\x1b[0m`);
					const subDirFiles = await this.scanDirectoryForContentStructure(fullPath);
					collectionFiles.push(...subDirFiles);
				} else if (entry.isFile() && entry.name.endsWith('.js')) {
					logger.debug(`Found compiled collection file:  \x1b[34m${entry.name}\x1b[0m`);
					collectionFiles.push(fullPath);
				}
			}
		} catch (error) {
			logger.error(`Error scanning directory ${dirPath}: ${error.message}`);
		}
		return collectionFiles;
	}

	// Sync content structure with database
	async syncContentStructure(): Promise<void> {
		if (browser) {
			logger.debug('Skipping content structure sync in browser environment');
			return;
		}

    try {
      // Initialize widgets globally
      if (!globalThis.widgets) {
        logger.debug('Initializing widgets globally...');
        await initializeWidgets();
        globalThis.widgets = getWidgets();
        logger.debug('Available widgets:', Object.keys(globalThis.widgets));
      }

			// Use posix paths for cross-platform compatibility and reference 'compiledCollections'
			const compiledCollectionsPath = path.posix.resolve(process.cwd(), 'compiledCollections');
			logger.debug('Compiled collections path:', compiledCollectionsPath);

			// Check if compiledCollections directory exists
			try {
				await import('fs').then((fs) => fs.promises.access(compiledCollectionsPath));
			} catch (error: unknown) {
				logger.error(`Compiled collections directory not found at ${compiledCollectionsPath}:`, { error });
				return;
			}

			// Track all valid collection UUIDs
			const validCollectionUUIDs = new Set<string>();
			const validPaths = new Set<string>();

			// Scan all collections recursively
			const collectionFiles = await this.scanDirectoryForContentStructure(compiledCollectionsPath);
			logger.debug(
				`Found \x1b[34m${collectionFiles.length}\x1b[0m compiled collection files in \x1b[34m${compiledCollectionsPath}\x1b[0m and subdirectories:`,
				collectionFiles
			);

			// Process collections first
			for (const filePath of collectionFiles) {
				try {
					logger.debug(`Processing compiled collection file: \x1b[34m${filePath}\x1b[0m`);

					// Read the file content to get UUID
					const content = await import('fs').then((fs) => fs.promises.readFile(filePath, 'utf8'));
					const uuidMatch = content.match(/\/\/\s*UUID:\s*([a-f0-9-]{36})/i);
					const uuid = uuidMatch ? uuidMatch[1] : null;

					if (!uuid) {
						logger.error(`Missing UUID in compiled schema for ${filePath}`);
						continue;
					}

					logger.debug(`Found UUID in file: \x1b[34m${uuid}\x1b[0m`);
					validCollectionUUIDs.add(uuid);

					// Import the collection using the file path
					const collection = await import(/* @vite-ignore */ filePath + `?update=${Date.now()}`);
					const collectionConfig = collection.default || collection.schema;

					logger.debug(`Collection config for ${filePath}:`, JSON.stringify(collectionConfig, null, 2));

					if (collectionConfig) {
						// Get the relative path from the collections directory
						const relativePath = path.posix.relative(compiledCollectionsPath, filePath);
						const dirPath = path.posix.dirname(relativePath);
						// change to ensure you get the correct path from collections
						const contentNodePath = `/collections/${dirPath}`;
						validPaths.add(contentNodePath);

						logger.debug(`Creating/Updating content structure node with path: \x1b[34m${contentNodePath}\x1b[0m`);

						// Create or update the content structure for the collection
						await this.createOrUpdateContentStructure({
							_id: uuid,
							name: collectionConfig.name,
							path: contentNodePath,
							icon: collectionConfig.icon || 'bi:file-text',
							isCollection: true,
							collectionConfig
						});

						// Create or update the schema model for this collection
						await this.createCollectionModel(collectionConfig);
						logger.debug(`Successfully created/synced collection model for \x1b[34m${collectionConfig.name}\x1b[0m`);
					}
				} catch (error) {
					logger.error(`Error processing collection ${filePath}:`, error);
				}
			}

			// Then process folders
			const processedPaths = new Set<string>();
			for (const fullPath of validPaths) {
				const parts = fullPath.split('/').filter(Boolean);
				let currentPath = '';

				for (let i = 0; i < parts.length; i++) {
					currentPath = `/${parts.slice(0, i + 1).join('/')}`;

					if (!processedPaths.has(currentPath)) {
						processedPaths.add(currentPath);

						// Don't create a node for the actual collection path
						if (!validPaths.has(currentPath)) {
							const folderName = parts[i];
							const existingNode = await ContentStructureModel.findOne({ path: currentPath }, '_id').lean().exec();
							const nodeId = existingNode ? existingNode._id : crypto.randomUUID();

							await this.createOrUpdateContentStructure({
								_id: nodeId,
								name: folderName,
								path: currentPath,
								icon: 'bi:folder',
								isCollection: false
							});
							logger.debug(`Created folder structure node: ${currentPath}`);
						}
					}
				}
			}

			// Clean up invalid collection nodes
			const invalidNodes = await ContentStructureModel.find({
				isCollection: true,
				_id: { $nin: Array.from(validCollectionUUIDs) }
			}, '_id').lean().exec();

			if (invalidNodes.length > 0) {
				logger.info(`Found \x1b[34m${invalidNodes.length}\x1b[0m invalid content structure nodes. Cleaning up...`);
				await ContentStructureModel.deleteMany({
					isCollection: true,
					_id: { $nin: Array.from(validCollectionUUIDs) }
				});
			}

			logger.info('Content structure sync completed successfully');
		} catch (error) {
			logger.error('Error syncing content structure:', error);
		}
	}

	// Create or update content structure node
	async createOrUpdateContentStructure(contentData: {
		_id: string;
		name: string;
		path: string;
		icon?: string;
		isCollection?: boolean;
		collectionConfig?: unknown;
	}): Promise<void> {
		try {
			const existingNode = await ContentStructureModel.findOne({ path: contentData.path }).exec();
			if (existingNode) {
				// Update existing node
				existingNode.name = contentData.name;
				existingNode.path = contentData.path;
				existingNode.icon = contentData.icon;
				existingNode.isCollection = contentData.isCollection;
				existingNode.collectionConfig = contentData.collectionConfig;

				await existingNode.save();
				logger.info(`Updated content structure node: \x1b[34m${contentData.path}\x1b[0m`);
			} else {
				// Create new node
				const newNode = new ContentStructureModel(contentData);
				await newNode.save();
				logger.info(`Created content structure node: \x1b[34m${contentData.path}\x1b[0m`);
			}
		} catch (error) {
			logger.error(`Error creating/updating content structure node: ${error.message}`);
			throw new Error(`Error creating/updating content structure node`);
		}
	}

	// Generate a unique ID
	generateId(): string {
		return new mongoose.Types.ObjectId().toString(); //required for MongoDB id as ObjectId
	}

  // Convert a string ID to a MongoDB ObjectId
  convertId(id: string): mongoose.Types.ObjectId {
    return new mongoose.Types.ObjectId(id);
  }

	// Get collection models
	async getCollectionModels(): Promise<Record<string, Model<Document>>> {
		if (this.collectionsInitialized) {
			logger.debug('Collections already initialized, returning existing models.');
			return mongoose.models as Record<string, Model<Document>>;
		}
		try {
			// Initialize base models without waiting for collections
			const baseModels: Record<string, Model<Document>> = {};
			// Mark collections as initialized to prevent circular dependency
			this.collectionsInitialized = true;
			// Return base models - collections will be added later as needed
			return baseModels;
		} catch (error) {
			logger.error('Failed to get collection models: ' + error.message);
			return {};
		}

	}
	// Set up authentication models
	setupAuthModels(): void {
		try {
			this.setupModel('auth_tokens', TokenSchema);
			this.setupModel('auth_users', UserSchema);
			this.setupModel('auth_sessions', SessionSchema);
			logger.info('Authentication models set up successfully.');
		} catch (error) {
			logger.error('Failed to set up authentication models: ' + error.message);
			throw Error('Failed to set up authentication models');
		}
	}

	// Helper method to set up models if they don't already exist
	private setupModel(name: string, schema: Schema) {
		if (!mongoose.models[name]) {
			mongoose.model(name, schema);
			logger.debug(`\x1b[34m${name}\x1b[0m model created.`);
		} else {
			logger.debug(`\x1b[34m${name}\x1b[0m model already exists.`);
		}
	}

	// Set up media models
	setupMediaModels(): void {
		const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote', 'media_collection'];
		mediaSchemas.forEach((schemaName) => {
			this.setupModel(schemaName, mediaSchema);
		});
		logger.info('Media models set up successfully.');
	}

	// Set up widget models
	setupWidgetModels(): void {
		// This will ensure that the Widget model is created or reused
		if (!mongoose.models.Widget) {
			mongoose.model('Widget', widgetSchema);
			logger.info('Widget model created.');
		} else {
			logger.info('Widget model already exists.');
		}
		logger.info('Widget models set up successfully.');
	}

	// Implementing findOne method
	async findOne<T extends DocumentContent = DocumentContent>(collection: string, query: FilterQuery<T>): Promise<T | null> {
		try {
			const model = mongoose.models[collection] as Model<T>;
			if (!model) {
				logger.error(`Collection ${collection} does not exist.`);
				throw new Error(`Collection ${collection} does not exist.`);
			}
			return await model.findOne(query).lean().exec();
		} catch (error) {
			logger.error(`Error in findOne for collection ${collection}:`, { error });
			throw new Error(`Error in findOne for collection ${collection}`);
		}
	}

	// Implementing findMany method
	async findMany<T extends DocumentContent = DocumentContent>(collection: string, query: FilterQuery<T>): Promise<T[]> {
		try {
			const model = mongoose.models[collection] as Model<T>;
			if (!model) {
				logger.error(`findMany failed. Collection ${collection} does not exist.`);
				throw new Error(`findMany failed. Collection ${collection} does not exist.`);
			}
			return await model.find(query).lean().exec();
		} catch (error) {
			logger.error(`Error in findMany for collection ${collection}:`, { error });
			throw new Error(`Error in findMany for collection ${collection}`);
		}
	}

	// Implementing insertOne method
	async insertOne<T extends DocumentContent = DocumentContent>(collection: string, doc: Partial<T>): Promise<T> {
		try {
			const model = mongoose.models[collection] as Model<T>;
			if (!model) {
				logger.error(`insertOne failed. Collection ${collection} does not exist.`);
				throw new Error(`insertOne failed. Collection ${collection} does not exist.`);
			}
			return await model.create(doc);
		} catch (error) {
			logger.error(`Error inserting document into ${collection}:`, { error });
			throw new Error(`Error inserting document into ${collection}`);
		}
	}

	// Implementing insertMany method
	async insertMany<T extends DocumentContent = DocumentContent>(collection: string, docs: Partial<T>[]): Promise<T[]> {
		try {
			const model = mongoose.models[collection] as Model<T>;
			if (!model) {
				logger.error(`insertMany failed. Collection ${collection} does not exist.`);
				throw new Error(`insertMany failed. Collection ${collection} does not exist.`);
			}
			return await model.insertMany(docs);
		} catch (error) {
			logger.error(`Error inserting many documents into ${collection}:`, { error });
			throw new Error(`Error inserting many documents into ${collection}`);
		}
	}

	// Implementing updateOne method
	async updateOne<T extends DocumentContent = DocumentContent>(
		collection: string,
		query: FilterQuery<T>,
		update: UpdateQuery<T>
	): Promise<T> {
		try {
			const model = mongoose.models[collection] as Model<T>;
			if (!model) {
				logger.error(`updateOne failed. Collection ${collection} does not exist.`);
				throw new Error(`updateOne failed. Collection ${collection} does not exist.`);
			}

			const result = await model.findOneAndUpdate(query, update, { new: true, strict: false }).lean().exec();

			if (!result) {
				throw new Error(`No document found to update with query: ${JSON.stringify(query)}`);
			}

			return result;
		} catch (error) {
			logger.error(`Error updating document in ${collection}:`, { error });
			throw new Error(`Error updating document in ${collection}`);
		}
	}

	// Implementing updateMany method
	async updateMany<T extends DocumentContent = DocumentContent>(
		collection: string,
		query: FilterQuery<T>,
		update: UpdateQuery<T>
	): Promise<T[]> {
		try {
			const model = mongoose.models[collection] as Model<T>;
			if (!model) {
				logger.error(`updateMany failed. Collection ${collection} does not exist.`);
				throw new Error(`updateMany failed. Collection ${collection} does not exist.`);
			}

			const result = await model.updateMany(query, update, { strict: false }).lean().exec();
			return Object.values(result) as T[]; // Adjust based on actual result structure
		} catch (error) {
			logger.error(`Error updating many documents in ${collection}:`, { error });
			throw new Error(`Error updating many documents in ${collection}`);
		}
	}

	// Implementing deleteOne method
	async deleteOne(collection: string, query: FilterQuery<Document>): Promise<number> {
		try {
			const model = mongoose.models[collection] as Model<Document>;
			if (!model) {
				throw new Error(`Collection ${collection} not found`);
			}

			const result = await model.deleteOne(query).exec();
			return result.deletedCount ?? 0;
		} catch (error) {
			logger.error(`Error deleting document from ${collection}:`, { error });
			throw new Error(`Error deleting document from ${collection}`);
		}
	}

	// Implementing deleteMany method
	async deleteMany(collection: string, query: FilterQuery<Document>): Promise<number> {
		try {
			const model = mongoose.models[collection] as Model<Document>;
			if (!model) {
				throw new Error(`Collection ${collection} not found`);
			}

			const result = await model.deleteMany(query).exec();
			return result.deletedCount ?? 0;
		} catch (error) {
			logger.error(`Error deleting many documents from ${collection}:`, { error });
			throw new Error(`Error deleting many documents from ${collection}`);
		}
	}

	// Implementing countDocuments method
	async countDocuments(collection: string, query: FilterQuery<Document> = {}): Promise<number> {
		try {
			const model = mongoose.models[collection] as Model<Document>;
			if (!model) {
				logger.error(`countDocuments failed. Collection ${collection} does not exist.`);
				throw new Error(`countDocuments failed. Collection ${collection} does not exist.`);
			}

			return await model.countDocuments(query).exec();
		} catch (error) {
			logger.error(`Error counting documents in ${collection}:`, { error });
			throw new Error(`Error counting documents in ${collection}`);
		}
	}

	// Helper method to check if collection exists in MongoDB
	private async collectionExists(collectionName: string): Promise<boolean> {
		try {
			const collections = await mongoose.connection.db.listCollections({ name: collectionName.toLowerCase() }).toArray();
			return collections.length > 0;
		} catch (error) {
			logger.error(`Error checking if collection exists: ${error}`);
			return false;
		}
	}

	// Create schema for the collection table and collection_uuid table
	async createCollectionModel(collection: CollectionConfig): Promise<Model<Document>> {
		try {
			// The collection.name is already the UUID in our case
			const collectionUuid = collection.name;
			logger.debug(`Using UUID for collection: \x1b[34m${collectionUuid}\x1b[0m`);

			// Ensure collection name is prefixed with collection_
			const collectionName = `collection_${collectionUuid}`;
			logger.debug(`Creating collection model with name: \x1b[34m${collectionName}\x1b[0m`);

			// Return existing model if it exists
			if (mongoose.models[collectionName]) {
				logger.debug(`Model \x1b[34m${collectionName}\x1b[0m already exists in Mongoose, returning existing model`);
				return mongoose.models[collectionName];
			}

			// Clear existing model from Mongoose's cache if it exists
			if (mongoose.modelNames().includes(collectionName)) {
				delete mongoose.models[collectionName];
				delete (mongoose as any).modelSchemas[collectionName];
			}

			logger.debug(`Collection \x1b[34m${collectionName}\x1b[0m does not exist in Mongoose, creating new model`);

			// Base schema definition for the main collection
			const schemaDefinition: Record<string, unknown> = {
				_id: { type: String }, // MongoDB will handle the _id index automatically
				status: { type: String, default: 'draft' },
				createdAt: { type: Date, default: Date.now },
				updatedAt: { type: Date, default: Date.now },
				createdBy: { type: Schema.Types.Mixed, ref: 'auth_users' },
				updatedBy: { type: Schema.Types.Mixed, ref: 'auth_users' }
			};

			// Process fields if they exist
			if (collection.schema?.fields && Array.isArray(collection.schema.fields)) {
				logger.debug(`Processing ${collection.schema.fields.length} fields for \x1b[34m${collectionName}\x1b[0m`);
				for (const field of collection.schema.fields) {
					try {
						// Generate fieldKey from label if db_fieldName is not present
						const fieldKey = field.db_fieldName ||
							(field.label ? field.label.toLowerCase().replace(/[^a-z0-9_]/g, '_') : null) ||
							field.Name;

						if (!fieldKey) {
							logger.error(`Field missing required identifiers:`, JSON.stringify(field, null, 2));
							continue;
						}

						const isRequired = field.required || false;
						const isTranslated = field.translate || false;
						const isSearchable = field.searchable || false;
						const isUnique = field.unique || false;

						// Base field schema with improved type handling
						const fieldSchema: any = {
							type: Schema.Types.Mixed,  // Default to Mixed type
							required: isRequired,
							translate: isTranslated,
							searchable: isSearchable,
							unique: isUnique
						};

						// Add field specific validations or transformations if needed
						if (field.type === 'string') {
							fieldSchema.type = String;
						} else if (field.type === 'number') {
							fieldSchema.type = Number;
						} else if (field.type === 'boolean') {
							fieldSchema.type = Boolean;
						} else if (field.type === 'date') {
							fieldSchema.type = Date;
						}

						schemaDefinition[fieldKey] = fieldSchema;
					} catch (error) {
						logger.error(`Error processing field:`, error);
						logger.error(`Field data:`, JSON.stringify(field, null, 2));
					}
				}
			} else {
				logger.warn(`No fields defined in schema for collection: ${collectionName}`);
			}

			// Optimized schema options for the main collection
			const schemaOptions: mongoose.SchemaOptions = {
				strict: collection.schema?.strict !== false,
				timestamps: true,
				collection: collectionName.toLowerCase(),
				autoIndex: true,
				minimize: false,
				toJSON: { virtuals: true, getters: true },
				toObject: { virtuals: true, getters: true },
				id: false,
				versionKey: false
			};


			// Create schema for the main collection
			const schema = new mongoose.Schema(schemaDefinition, schemaOptions);

			// Add indexes for the main collection
			schema.index({ createdAt: -1 });
			schema.index({ status: 1, createdAt: -1 });
			// Remove the _id index as MongoDB handles this automatically

			// Performance optimization: create indexes in background
			schema.set('backgroundIndexing', true);

			// Create the model for the main collection
			const model = mongoose.model(collectionName, schema);
			logger.debug(`Collection model creation successful for: \x1b[34m${collectionName}\x1b[0m`);
			logger.info(`Collection model \x1b[34m${collectionName}\x1b[0m is ready`);

			return model;
		} catch (error) {
			logger.error('Error creating collection model:', error instanceof Error ? error.stack : error);
			logger.error('Collection config that caused error:', JSON.stringify(collection, null, 2));
			throw error;
		}
	}

  // Methods for Draft and Revision Management

	// Create a new draft
	async createDraft(
		content: Record<string, unknown>,
		collectionId: string,
		original_document_id: string,
		user_id: string
	): Promise<Draft> {
		return DraftModel.createDraft(content, collectionId, original_document_id, user_id);
	}

	// Update a draft
	async updateDraft(draft_id: string, content: Record<string, unknown>): Promise<Draft> {
		return DraftModel.updateDraft(draft_id, content);
	}

	// Publish a draft
	async publishDraft(draft_id: string): Promise<Draft> {
		return DraftModel.publishDraft(draft_id);
	}

	// Get drafts by user
	async getDraftsByUser(user_id: string): Promise<Draft[]> {
		return DraftModel.getDraftsByUser(user_id);
	}

	// Create a new revision
	async createRevision(collectionId: string, documentId: string, userId: string, data: Record<string, unknown>): Promise<Revision> {
		try {
			const revision = new RevisionModel({
				collectionId: this.convertId(collectionId),
				documentId: this.convertId(documentId),
				content: data,
				createdBy: this.convertId(userId)
			});
			return await revision.save();
		} catch (error) {
			logger.error(`Error creating revision: ${error.message}`);
			throw Error(`Error creating revision`);
		}
	}

	// Get revisions for a document
	async getRevisions(collectionId: string, documentId: string): Promise<Revision[]> {
		try {
			return await RevisionModel.find({
				collectionId: this.convertId(collectionId),
				documentId: this.convertId(documentId)
			}).sort({ createdAt: -1 }).lean().exec();
		} catch (error) {
			logger.error(
				`Error retrieving revisions for document ID ${documentId} in collection ID ${collectionId}: ${error.message}`
			);
			throw Error(`Failed to retrieve revisions`);
		}
	}

	// Delete a specific revision
	async deleteRevision(revisionId: string): Promise<void> {
		try {
			const result = await RevisionModel.deleteOne({ _id: revisionId }).exec();
			if (result.deletedCount === 0) {
				throw Error(`Revision not found with ID: ${revisionId}`);
			}

      logger.info(`Revision ${revisionId} deleted successfully.`);
    } catch (error) {
      logger.error(`Error deleting revision ${revisionId}: ${error.message}`);
      throw Error(`Failed to delete revision`);
    }
  }

  // Restore a specific revision to its original document
  async restoreRevision(collectionId: string, revisionId: string): Promise<void> {
    try {
      // Fetch the revision with the correct typing
      const revision = await RevisionModel.findOne({ _id: revisionId }).exec();

      if (!revision) {
        throw Error(`Revision not found with ID: ${revisionId}`);
      }

      // Destructure the necessary properties
      const { documentId, content } = revision;

      if (!documentId || !content) {
        throw Error(`Revision ${revisionId} is missing required fields.`);
      }

      // Convert IDs to ObjectId if necessary
      const documentObjectId = this.convertId(documentId);

      // Update the original document with the revision content
      const updateResult = await this.updateOne(collectionId, { _id: documentObjectId }, { $set: content });

			// `updateOne` now throws an error if no document is found, so this check might be redundant
			// Keeping it for clarity.
			if (!updateResult) {
				throw Error(`Failed to restore revision: Document not found or no changes applied.`);
			}

      logger.info(`Revision ${revisionId} restored successfully to document ID: ${documentId}`);
    } catch (error) {
      logger.error(`Error restoring revision ${revisionId}: ${error.message}`);
      throw Error(`Failed to restore revision`);
    }
  }

  // Methods for Widget Management

  // Install a new widget
  async installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void> {
    try {
      const widget = new WidgetModel({
        ...widgetData,
        isActive: widgetData.isActive ?? false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await widget.save();
      logger.info(`Widget ${widgetData.name} installed successfully.`);
    } catch (error) {
      logger.error(`Error installing widget: ${error.message}`);
      throw Error(`Error installing widget`);
    }
  }

	// Fetch all widgets
	async getAllWidgets(): Promise<Widget[]> {
		try {
			return await WidgetModel.find().lean().exec();
		} catch (error) {
			logger.error(`Error fetching all widgets: ${error.message}`);
			throw Error(`Error fetching all widgets`);
		}
	}

	// Fetch active widgets
	async getActiveWidgets(): Promise<string[]> {
		try {
			const widgets = await WidgetModel.find({ isActive: true }, 'name').lean().exec();
			return widgets.map((widget) => widget.name);
		} catch (error) {
			logger.error(`Error fetching active widgets: ${error.message}`);
			throw Error(`Error fetching active widgets`);
		}
	}

  // Activate a widget
  async activateWidget(widgetName: string): Promise<void> {
    try {
      const result = await WidgetModel.updateOne({ name: widgetName }, { $set: { isActive: true, updatedAt: new Date() } }).exec();
      if (result.modifiedCount === 0) {
        throw Error(`Widget with name ${widgetName} not found or already active.`);
      }
      logger.info(`Widget ${widgetName} activated successfully.`);
    } catch (error) {
      logger.error(`Error activating widget: ${error.message}`);
      throw Error(`Error activating widget`);
    }
  }

  // Deactivate a widget
  async deactivateWidget(widgetName: string): Promise<void> {
    try {
      const result = await WidgetModel.updateOne({ name: widgetName }, { $set: { isActive: false, updatedAt: new Date() } }).exec();
      if (result.modifiedCount === 0) {
        throw Error(`Widget with name ${widgetName} not found or already inactive.`);
      }
      logger.info(`Widget ${widgetName} deactivated successfully.`);
    } catch (error) {
      logger.error(`Error deactivating widget: ${error.message}`);
      throw Error(`Error deactivating widget`);
    }
  }

  // Update a widget
  async updateWidget(widgetName: string, updateData: Partial<Widget>): Promise<void> {
    try {
      const result = await WidgetModel.updateOne({ name: widgetName }, { $set: { ...updateData, updatedAt: new Date() } }).exec();
      if (result.modifiedCount === 0) {
        throw Error(`Widget with name ${widgetName} not found or no changes applied.`);
      }
      logger.info(`Widget ${widgetName} updated successfully.`);
    } catch (error) {
      logger.error(`Error updating widget: ${error.message}`);
      throw Error(`Error updating widget`);
    }
  }

	// Methods for Theme Management
	// Set the default theme
	async setDefaultTheme(themeName: string): Promise<void> {
		try {
			// First, unset the current default theme
			await ThemeModel.updateMany({}, { $set: { isDefault: false } });
			// Then, set the new default theme
			const result = await ThemeModel.updateOne({ name: themeName }, { $set: { isDefault: true } });

      if (result.modifiedCount === 0) {
        throw Error(`Theme with name ${themeName} not found.`);
      }

      logger.info(`Theme ${themeName} set as default successfully.`);
    } catch (error) {
      logger.error(`Error setting default theme: ${error.message}`);
      throw Error(`Error setting default theme`);
    }
  }

  // Fetch the default theme
  async getDefaultTheme(): Promise<Theme | null> {
    try {
      logger.debug('Attempting to fetch the default theme from the database...');
      let theme = await ThemeModel.findOne({ isDefault: true }).lean<Theme>().exec();

      if (theme) {
        logger.info(`Default theme found: ${theme.name}`);
        return theme;
      }

      const count = await ThemeModel.countDocuments();
      if (count === 0) {
        logger.warn('Theme collection is empty. Inserting default theme.');
        await this.storeThemes([DEFAULT_THEME]);
        theme = await ThemeModel.findOne({ isDefault: true }).lean<Theme>().exec();
      }

      if (!theme) {
        logger.warn('No default theme found in database. Using DEFAULT_THEME constant.');
        return DEFAULT_THEME as Theme;
      }

      return theme;
    } catch (error) {
      logger.error(`Error fetching default theme: ${error.message}`);
      throw Error(`Error fetching default theme`);
    }
  }

  // Store themes in the database
  async storeThemes(themes: Theme[]): Promise<void> {
    try {
      // If there's a default theme in the new themes, unset the current default
      if (themes.some((theme) => theme.isDefault)) {
        await ThemeModel.updateMany({}, { $set: { isDefault: false } });
      }

			await ThemeModel.insertMany(
				themes.map((theme) => ({
					_id: this.convertId(theme._id),
					name: theme.name,
					path: theme.path,
					isDefault: theme.isDefault ?? false,
					createdAt: theme.createdAt ?? new Date(),
					updatedAt: theme.updatedAt ?? new Date()
				})),
				{ ordered: false }
			); // Use ordered: false to ignore duplicates
			logger.info(`Stored \x1b[34m${themes.length}\x1b[0m themes in the database.`);
		} catch (error) {
			logger.error(`Error storing themes: ${error.message}`);
			throw Error(`Error storing themes`);
		}
	}
	// Fetch all themes
	async getAllThemes(): Promise<Theme[]> {
		try {
			const themes = await ThemeModel.find().exec();
			logger.info(`Fetched \x1b[34m${themes.length}\x1b[0m themes.`);
			return themes;
		} catch (error) {
			logger.error(`Error fetching all themes: ${error.message}`);
			throw Error(`Error fetching all themes`);
		}
	}

	// Methods for System Preferences Management
	// Set user preferences
	async setUserPreferences(userId: string, preferences: UserPreferences): Promise<void> {
		logger.debug(`Setting user preferences for userId: \x1b[34m${user_id}\x1b[0m`);

    try {
      await SystemPreferencesModel.updateOne({ userId }, { $set: { preferences } }, { upsert: true }).exec();
      logger.info(`User preferences set successfully for userId: \x1b[34m${user_id}\x1b[0m`);
    } catch (error) {
      logger.error(`Failed to set user preferences for user \x1b[34m${user_id}\x1b[0m: ${error.message}`);
      throw Error(`Failed to set user preferences`);
    }
  }

	//Retrieve system preferences for a user
	async getSystemPreferences(user_id: string): Promise<UserPreferences | null> {
		try {
			const preferencesDoc = await SystemPreferencesModel.findOne({ userId: user_id }).exec();
			if (preferencesDoc) {
				logger.info(`Retrieved system preferences for userId: \x1b[34m${user_id}\x1b[0m `);
				return preferencesDoc.preferences as UserPreferences;
			}
			logger.info(`No system preferences found for userId: \x1b[34m${user_id}\x1b[0m`);
			return null;
		} catch (error) {
			logger.error(`Failed to retrieve system preferences for user \x1b[34m${user_id}\x1b[0m: ${error.message}`);
			throw Error(`Failed to retrieve system preferences`);
		}
	}
	// Update system preferences for a user
	async updateSystemPreferences(user_id: string, screenSize: ScreenSize, preferences: WidgetPreference[]): Promise<void> {
		try {
			await SystemPreferencesModel.findOneAndUpdate({ userId: user_id }, { $set: { screenSize, preferences } }, { new: true, upsert: true }).exec();
			logger.info(`System preferences updated for userId: \x1b[34m${user_id}\x1b[0m`);
		} catch (error) {
			logger.error(`Failed to update system preferences for user \x1b[34m${user_id}\x1b[0m: ${error.message}`);
			throw Error(`Failed to update system preferences`);
		}
	}
	// Clear system preferences for a user
	async clearSystemPreferences(user_id: string): Promise<void> {
		try {
			const result = await SystemPreferencesModel.deleteOne({ userId: user_id }).exec();
			if (result.deletedCount === 0) {
				logger.warn(`No system preferences found to delete for userId: \x1b[34m${user_id}\x1b[0m`);
			} else {
				logger.info(`System preferences cleared for userId: \x1b[34m${user_id}\x1b[0m`);
			}
		} catch (error) {
			logger.error(`Failed to clear system preferences for user \x1b[34m${user_id}\x1b[0m: ${error.message}`);
			throw Error(`Failed to clear system preferences`);
		}
	}

	// Methods for Virtual Folder Management
	// Create a virtual folder in the database
	async createVirtualFolder(folderData: { name: string; parent?: string; path: string, icon?: string, order?: number, type?: 'folder' | 'collection' }): Promise<Document> {
		try {
			const folder = new SystemVirtualFolderModel({
				_id: this.generateId(),
				name: folderData.name,
				parent: folderData.parent ? this.convertId(folderData.parent) : null,
				path: folderData.path,
				icon: folderData.icon,
				order: folderData.order,
				type: folderData.type || 'folder'  // Default to 'folder' if not specified
			});
			await folder.save();
			logger.info(`Virtual folder '\x1b[34m${folderData.name}\x1b[0m' created successfully.`);
			return folder;
		} catch (error) {
			logger.error(`Error creating virtual folder: ${error.message}`);
			throw Error(`Error creating virtual folder`);
		}
	}

	// Get all virtual folders
	async getVirtualFolders(): Promise<Document[]> {
		try {
			const folders = await SystemVirtualFolderModel.find({}).lean().exec();
			logger.info(`Fetched \x1b[34m${folders.length}\x1b[0m virtual folders.`);
			return folders;
		} catch (error) {
			logger.error(`Error fetching virtual folders: ${error.message}`);
			throw Error(`Error fetching virtual folders`);
		}
	}

  // Get contents of a virtual folder
  async getVirtualFolderContents(folderId: string): Promise<Document[]> {
    try {
      const objectId = this.convertId(folderId);
      const folder = await SystemVirtualFolderModel.findById(objectId);
      if (!folder) throw Error('Folder not found');

      const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
      const mediaPromises = mediaTypes.map((type) => mongoose.model(type).find({ folderId: objectId }).lean());
      const results = await Promise.all(mediaPromises);
      logger.info(`Fetched contents for virtual folder ID: \x1b[34m${folderId}\x1b[0m`);
      return results.flat();
    } catch (error) {
      logger.error(`Error fetching contents for virtual folder \x1b[34m${folderId}\x1b[0m: ${error.message}`);
      throw Error(`Failed to fetch virtual folder contents`);
    }
  }

  // Update a virtual folder
  async updateVirtualFolder(folderId: string, updateData: VirtualFolderUpdateData): Promise<Document | null> {
    try {
      const updatePayload: VirtualFolderUpdateData & { updatedAt: Date } = {
        ...updateData,
        updatedAt: new Date()
      };

			if (updateData.parent) {
				updatePayload.parent = this.convertId(updateData.parent).toString();
			}
			const updatedFolder = await SystemVirtualFolderModel.findByIdAndUpdate(folderId, updatePayload, { new: true }).exec();
			if (!updatedFolder) {
				throw Error(`Virtual folder with ID \x1b[34m${folderId}\x1b[0m not found.`);
			}
			logger.info(`Virtual folder \x1b[34m${folderId}\x1b[0m updated successfully.`);
			return updatedFolder;
		} catch (error) {
			logger.error(`Error updating virtual folder \x1b[34m${folderId}\x1b[0m: ${error.message}`);
			throw Error(`Failed to update virtual folder`);
		}
	}

	// Delete a virtual folder
	async deleteVirtualFolder(folderId: string): Promise<boolean> {
		try {
			const result = await SystemVirtualFolderModel.findByIdAndDelete(this.convertId(folderId)).exec();
			if (!result) {
				logger.warn(`Virtual folder with ID \x1b[34m${folderId}\x1b[0m not found.`);
				return false;
			}
			logger.info(`Virtual folder \x1b[34m${folderId}\x1b[0m deleted successfully.`);
			return true;
		} catch (error) {
			logger.error(`Error deleting virtual folder \x1b[34m${folderId}\x1b[0m: ${error.message}`);
			throw Error(`Failed to delete virtual folder`);
		}
	}

	// Move media to a virtual folder
	async moveMediaToFolder(mediaId: string, folderId: string): Promise<boolean> {
		try {
			const objectId = this.convertId(folderId);
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
			// Create update query for all media types
			const updateResult = await Promise.all(mediaTypes.map(type => this.updateOne(type, { _id: this.convertId(mediaId) }, { folderId: objectId })));
			// Check if any media types updated
			const mediaUpdated = updateResult.some(result => result);
			if (mediaUpdated) {
				logger.info(`Media \x1b[34m${mediaId}\x1b[0m moved to folder \x1b[34m${folderId}\x1b[0m successfully.`);
				return true;
			}
			logger.warn(`Media \x1b[34m${mediaId}\x1b[0m not found in any media type collections.`);
			return false;
		} catch (error) {
			logger.error(`Error moving media \x1b[34m${mediaId}\x1b[0m to folder \x1b[34m${folderId}\x1b[0m: ${error.message}`);
			throw Error(`Failed to move media to folder`);
		}
	}

	// Content Structure Methods
	async createContentStructure(contentData: {
		name: string;
		parent?: string;
		path: string;
		icon?: string;
		order?: number;
		isCollection?: boolean;
		collectionId?: string;
		translations?: { languageTag: string; translationName: string; }[];
		_id?: string;  // Make _id optional in the interface
	}): Promise<Document> {
		try {
			// If _id is provided, use it directly when creating the model
			const node = new ContentStructureModel({
				...contentData,
				_id: contentData._id  // Use provided _id  
			});
			await node.save();
			logger.info(`Content structure node \x1b[34m${contentData.name}\x1b[0m created successfully with ID \x1b[34m${node._id}\x1b[0m.`);
			return node;
		} catch (error) {
			logger.error(`Error creating content structure node: ${error.message}`);
			throw Error(`Error creating content structure node`);
		}
	}

	async getContentStructure(): Promise<Document[]> {
		try {
			const nodes = await ContentStructureModel.find().sort({ path: 1 }).exec();
			logger.info(`Fetched \x1b[34m${nodes.length}\x1b[0m content structure nodes.`);
			return nodes;
		} catch (error) {
			logger.error(`Error fetching content structure: ${error.message}`);
			throw Error(`Error fetching content structure`);
		}
	}

	async getContentStructureChildren(parentPath: string): Promise<Document[]> {
		try {
			const escapedPath = parentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`^${escapedPath}/[^/]+$`);
			const children = await ContentStructureModel.find({ path: { $regex: regex } }).sort({ order: 1 }).exec();
			logger.info(`Fetched ${children.length} children of content structure for path '${parentPath}'.`);
			return children;
		} catch (error) {
			logger.error(`Error fetching content structure children: ${error.message}`);
			throw Error(`Error fetching content structure children`);
		}
	}

	async getContentStructureById(id: string): Promise<Document | null> {
		try {
			const node = await ContentStructureModel.findById(id).exec();
			return node ? node.toObject() : null;
		} catch (error) {
			logger.error(`Error getting content structure by ID ${id}:`, error);
			return null;
		}
	}

	async updateContentStructure(contentId: string, updateData: Partial<ContentStructureNode>): Promise<Document | null> {
		try {
			// Only allow updates to name and fileName, exclude _id, uuid, and other fields
			const { name, fileName } = updateData;
			const allowedUpdates: Partial<ContentStructureNode> = {};

			if (name !== undefined) allowedUpdates.name = name;
			if (fileName !== undefined) allowedUpdates.fileName = fileName;

			const updatedNode = await ContentStructureModel.findByIdAndUpdate(
				contentId,
				allowedUpdates,
				{ new: true }
			).exec();

			if (updatedNode) {
				logger.info(`Content structure node '${contentId}' updated successfully.`);
			} else {
				logger.warn(`No content structure node found with ID '${contentId}'.`);
			}
			return updatedNode;
		} catch (error) {
			logger.error(`Error updating content structure node: ${error.message}`);
			throw Error(`Error updating content structure node`);
		}
	}

	async deleteContentStructure(contentId: string): Promise<boolean> {
		try {
			const result = await ContentStructureModel.deleteOne({ _id: contentId }).exec();
			if (result.deletedCount === 0) {
				logger.warn(`Content structure node with ID ${contentId} not found.`);
				return false;
			}
			logger.info(`Content structure node ${contentId} deleted successfully.`);
			return true;
		} catch (error) {
			logger.error(`Error deleting content structure node: ${error.message}`);
			throw Error(`Error deleting content structure node`);
		}
	}

	// Methods for Media Management
	// Fetch all media
	async getAllMedia(): Promise<MediaType[]> {
		try {
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
			const results = await Promise.all(mediaTypes.map(type => this.findMany<Document & MediaBase>(type, {})))
			const allMedia = results.flat().map((item) => ({
				...item,
				_id: item._id?.toString(),
				type: item.type || 'unknown'
			}));
			logger.info(`Fetched all media, total count: \x1b[34m${allMedia.length}\x1b[0m`);
			return allMedia as MediaType[];
		} catch (error) {
			logger.error(`Error fetching all media: ${error.message}`);
			throw Error(`Error fetching all media`);
		}
	}

	// Delete media
	async deleteMedia(mediaId: string): Promise<boolean> {
		try {
			const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
			const deleteResults = await Promise.all(mediaTypes.map(type => this.deleteOne(type, { _id: this.convertId(mediaId) })));
			// Check if any media was deleted
			const mediaDeleted = deleteResults.some(result => result > 0);
			if (mediaDeleted) {
				logger.info(`Media \x1b[34m${mediaId}\x1b[0m deleted successfully.`);
				return true;
			}
			logger.warn(`Media \x1b[34m${mediaId}\x1b[0m not found in any media type collections.`);
			return false;
		} catch (error) {
			logger.error(`Error deleting media \x1b[34m${mediaId}\x1b[0m: ${error.message}`);
			throw Error(`Error deleting media`);
		}
	}

  // Fetch media in a specific folder
  async getMediaInFolder(folder_id: string): Promise<MediaType[]> {
    try {
      const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos'];
      const objectId = this.convertId(folder_id);
      const mediaPromises = mediaTypes.map((type) => mongoose.model(type).find({ folderId: objectId }).lean());
      const results = await Promise.all(mediaPromises);
      const mediaInFolder = results.flat();
      logger.info(`Fetched \x1b[34m${mediaInFolder.length}\x1b[0m media items in folder ID: \x1b[34m${folder_id}\x1b[0m`);
      return mediaInFolder;
    } catch (error) {
      logger.error(`Error fetching media in folder \x1b[34m${folder_id}\x1b[0m: ${error.message}`);
      throw Error(`Failed to fetch media in folder`);
    }
  }

  // Fetch the last five collections
  async getLastFiveCollections(): Promise<Document[]> {
    try {
      const collectionTypes = Object.keys(mongoose.models);
      const recentCollections: Document[] = [];

      for (const collectionType of collectionTypes) {
        const model = mongoose.models[collectionType];
        if (model) {
          const collections = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
          recentCollections.push(...collections);
        }
      }

      return recentCollections.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)).slice(0, 5);
    } catch (error) {
      logger.error(`Failed to fetch last five collections: ${error.message}`);
      throw Error(`Failed to fetch last five collections`);
    }
  }

  // Fetch logged-in users
  async getLoggedInUsers(): Promise<Document[]> {
    try {
      const sessionModel = mongoose.models['auth_sessions'];
      if (!sessionModel) {
        throw Error('auth_sessions collection does not exist.');
      }
      const activeSessions = await sessionModel.find({ active: true }).lean().exec();
      logger.info(`Fetched \x1b[34m${activeSessions.length}\x1b[0m active sessions.`);
      return activeSessions;
    } catch (error) {
      logger.error(`Error fetching logged-in users: ${error.message}`);
      throw Error(`Failed to fetch logged-in users`);
    }
  }

  // Fetch CMS data
  async getCMSData(): Promise<{
    collections: number;
    media: number;
    users: number;
    drafts: number;
  }> {
    // Implement your CMS data fetching logic here
    // This is a placeholder and should be replaced with actual implementation
    logger.debug('Fetching CMS data...');
    return {};
  }

  // Fetch the last five media documents
  async getLastFiveMedia(): Promise<MediaType[]> {
    try {
      const mediaSchemas = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
      const recentMedia: MediaType[] = [];

      for (const schemaName of mediaSchemas) {
        const model = mongoose.models[schemaName];
        if (model) {
          const media = await model.find().sort({ createdAt: -1 }).limit(5).lean().exec();
          recentMedia.push(...(media as MediaType[]));
        }
      }

			return recentMedia.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)).slice(0, 5);
		} catch (error) {
			logger.error(`Failed to fetch last five media documents: ${error.message}`);
			throw Error(`Failed to fetch last five media documents`);
		}
	}
	// Methods for Disconnecting

	// Disconnect from MongoDB
	async disconnect(): Promise<void> {
		try {
			await mongoose.disconnect();
			logger.info('MongoDB adapter connection closed.');
		} catch (error) {
			logger.error(`Error disconnecting from MongoDB: ${error.message}`);
			throw Error(`Error disconnecting from MongoDB`);
		}
	}

}
