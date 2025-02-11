/**
 * @file src/databases/mongodb/models/contentStructure.ts
 * @description MongoDB schema and model for Content Structure.
 *
 * This module defines a schema and model for Content Structure in the MongoDB database.
 * Content Structure represents the hierarchical organization of content in the CMS.
 */
import mongoose, { Schema, Model, Document } from 'mongoose';
import type { Translation, Category, CollectionData } from '@src/content/types';
import { v4 as uuidv4 } from 'uuid';


// System Logger
import { logger } from '@utils/logger.svelte';
import { publicEnv } from '@root/config/public';

interface ContentStructureNode {
  _id: string;
  name: string;
  path: string;
  icon: string;
  order: number;
  nodeType: 'category' | 'collection';
  parentPath: string | null;
}



// Document interfaces
interface CategoryDocument extends ContentStructureNode {
  nodeType: 'category';

}

interface CollectionDocument extends ContentStructureNode {
  nodeType: 'collection';
  label: string;
  permissions: Record<string, any>;
  livePreview: boolean;
  strict: boolean;
  revision: boolean;
  description: string;
  slug: string;
  status: 'draft' | 'published' | 'unpublished' | 'scheduled' | 'cloned';
  links: string[];


}

type ContentStructureDocument = CategoryDocument | CollectionDocument;

// Model interface
interface ContentStructureModel extends Model<ContentStructureDocument> {
  upsertCategory(category: Category): Promise<CategoryDocument>;
  upsertCollection(collection: CollectionData): Promise<CollectionDocument>;
  getNodeByPath(path: string): Promise<ContentStructureDocument | null>;
  getChildren(parentPath: string): Promise<ContentStructureDocument[]>;
}

// Schema definitions
const translationSchema = new Schema<Translation>({
  languageTag: { type: String, required: true },
  translationName: { type: String, required: true },
  isDefault: { type: Boolean, default: false }
}, { _id: false });


// Base fields shared between categories and collections
const baseFields = {
  _id: { type: String, required: true },
  name: { type: String, required: true },
  path: { type: String, required: true },
  icon: { type: String, default: 'bi:folder' },
  order: { type: Number, default: 999 },
  nodeType: { type: String, required: true, enum: ['category', 'collection'] },
  translations: [translationSchema],
  parentPath: { type: String, default: null },
};

// Category-specific schema
const categorySchema = new Schema<CategoryDocument>({
  ...baseFields,
});

// Collection-specific schema
const collectionSchema = new Schema<CollectionDocument>({
  ...baseFields,
  label: String,
  permissions: Schema.Types.Mixed,
  livePreview: Boolean,
  strict: Boolean,
  revision: Boolean,
  description: String,
  slug: String,
  status: {
    type: String,
    enum: ['draft', 'published', 'unpublished', 'scheduled', 'cloned']
  },
  links: [String]
});

// Combined schema using discriminator
const contentStructureSchema = new Schema<ContentStructureDocument>({
  ...baseFields,
  nodeType: { type: String, required: true, enum: ['category', 'collection'] },
  parentPath: { type: String, default: null }
}, {
  timestamps: true,
  collection: 'system_content_structure',
  discriminatorKey: 'type',
});


// Indexes
contentStructureSchema.index({ path: 1 }, { unique: true });
contentStructureSchema.index({ parentPath: 1 });
contentStructureSchema.index({ type: 1 });

// Static methods for the ContentStructure model
contentStructureSchema.statics = {
  async upsertCategory(category: Category): Promise<CategoryDocument> {
    const parentPath = category.path.split('/').slice(0, -1).join('/') || null;

    return this.findOneAndUpdate(
      { path: category.path },
      {
        $set: {
          ...category,
          nodeType: 'category',
          parentPath
        },
      },
      { upsert: true, new: true }
    ).lean();
  },

  async upsertCollection(collection: CollectionData): Promise<CollectionDocument> {
    const parentPath = collection.path.split('/').slice(0, -1).join('/') || null;

    return this.findOneAndUpdate(
      { path: collection.path },
      {
        $set: {
          ...collection,
          nodeType: 'collection',
          parentPath
        }
      },
      { upsert: true, new: true }
    ).lean();
  },

  async getNodeByPath(path: string): Promise<ContentStructureDocument | null> {
    return this.findOne({ path });
  },

  async getChildren(parentPath: string): Promise<ContentStructureDocument[]> {
    return this.find({ parentPath }).sort({ order: 1 });
  }
};

// Create the base model
const BaseContentStructure = mongoose.model<ContentStructureDocument, ContentStructureModel>(
  'system_content_structure',
  contentStructureSchema
);

// Create discriminators for categories and collections
BaseContentStructure.discriminator('category', categorySchema);
BaseContentStructure.discriminator('collection', collectionSchema);

// Export the model
export const ContentStructureModel = BaseContentStructure;

// Function to process file structure
