/**
 * @file utils/media/MediaService.ts
 * @description Provides a service class for media operations.
 */

import mime from 'mime-types';
import { error } from '@sveltejs/kit';

// Database Interface
import type { dbInterface } from '@src/databases/dbInterface';
//import { isConnected } from '@src/databases/db';

// Media
import type { MediaType, MediaBase, MediaAccess } from './mediaModels';
import { MediaTypeEnum } from './mediaModels';
import { saveFileToDisk, saveResizedImages } from './mediaStorage';
import { hashFileContent, getSanitizedFileName } from './mediaProcessing';
import { validateMediaFile } from './mediaUtils';

// Permission Management
import { validateUserPermission as checkMediaAccess } from '@src/auth/permissionManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// Media Cache
import { mediaCache } from '@src/databases/mediaCache';
import { v4 as uuidv4 } from 'uuid';
// Extended MediaBase interface to include thumbnails
interface MediaBaseWithThumbnails extends MediaBase {
  thumbnails?: {
    thumbnail?: {
      url: string;
      width: number;
      height: number;
    };
    [key: string]:
    | {
      url: string;
      width: number;
      height: number;
    }
    | undefined;
  };
}

export class MediaService {
  private db: dbInterface;
  private initialized: boolean = false;

  constructor(db: dbInterface) {
    this.db = db;
    this.checkDatabaseConnection();
  }

  // Check if database is connected
  private checkDatabaseConnection() {
    if (!this.db) {
      const message = 'Database adapter is not available';
      logger.error(message);
      throw error(500, message);
    }

    if (!isConnected) {
      const message = 'Database is not connected';
      logger.error(message);
      throw error(500, message);
    }

    this.initialized = true;
  }

  // Ensure service is initialized before operations
  private ensureInitialized() {
    if (!this.initialized) {
      this.checkDatabaseConnection();
    }
  }

  // Saves a media file and its associated data
  public async saveMedia(file: File, userId: string, access: MediaAccess): Promise<MediaType> {
    this.ensureInitialized();

    try {
      // Validate the file
      const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'];
      const validation = validateMediaFile(file, allowedTypes);

      if (!validation.isValid) {
        throw Error(validation.message);
      }

      // Process the file
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // Use the original arrayBuffer for hashing since it's already the correct type
      const hash = await hashFileContent(arrayBuffer);
      const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
      const mimeType = file.type || mime.lookup(file.name) || 'application/octet-stream';
      const path = 'global'; // Define your storage path logic

      // Combine path and file info into one string
      const urlPath = `${hash}_${fileNameWithoutExt}.${ext}`;

      // Create media object
      const media: MediaBaseWithThumbnails = {
        type: this.getMediaType(mimeType),
        hash,
        name: file.name,
        path,
        url: urlPath,
        mimeType,
        size: file.size,
        user: userId,
        createdAt: new Date(Date.now()),
        updatedAt: new Date(Date.now()),
        metadata: {},
        versions: [],
        access
      };

      const url = urlPath;
      // Save the file
      await saveFileToDisk(buffer, url);

      // Save resized images if applicable
      if (media.type === MediaTypeEnum.Image) {
        const thumbnails = await saveResizedImages(buffer, hash, fileNameWithoutExt, 'media_collection', ext, path);
        media.thumbnails = thumbnails;
      }

      const media_collection = {
        _id: uuidv4(),
        hash: media.hash,
        filename: media.name,
        path: path,
        type: media.type,
        size: media.size,

        thumbnail: {
          url: media.thumbnails?.thumbnail?.url,
          name: media.name,
          type: media.type,
          size: media.size,
          width: media.thumbnails?.thumbnail?.width,
          height: media.thumbnails?.thumbnail?.height
        }
      };

      // Save media to the database
      const mediaId = await this.db.insertOne('Media', media_collection);

      // Retrieve the saved media with its ID
      const savedMedia = await this.db.findOne('Media', { _id: mediaId });

      // Cache the saved media
      if (savedMedia) {
        await mediaCache.set(mediaId, savedMedia);
      }

      logger.info('Media saved successfully', { mediaId });

      return savedMedia!;
    } catch (err) {
      const message = `Error saving media: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      throw error(500, message);
    }
  }

  // Updates a media item with new data
  public async updateMedia(id: string, updates: Partial<MediaBase>): Promise<void> {
    this.ensureInitialized();

    try {
      await this.db.updateOne('media_collection', { _id: this.db.convertId(id) }, updates);
      // Invalidate cache
      await mediaCache.delete(id);
      logger.info('Media updated successfully', { id });
    } catch (err) {
      const message = `Error updating media: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      throw error(500, message);
    }
  }

  // Deletes a media item
  public async deleteMedia(id: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.db.deleteOne('media_collection', { _id: this.db.convertId(id) });
      // Remove from cache
      await mediaCache.delete(id);
      logger.info('Media deleted successfully', { id });
    } catch (err) {
      const message = `Error deleting media: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      throw error(500, message);
    }
  }

  // Sets access permissions for a media item
  public async setMediaAccess(id: string, access: MediaAccess[]): Promise<void> {
    this.ensureInitialized();

    try {
      await this.db.updateOne('media_collection', { _id: this.db.convertId(id) }, { access });
      // Invalidate cache
      await mediaCache.delete(id);
      logger.info('Media access updated successfully', { id, access });
    } catch (err) {
      const message = `Error setting media access: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      throw error(500, message);
    }
  }

  // Retrieves a media item by its ID, enforcing access control
  public async getMedia(id: string, userId: string, userRoles: string[]): Promise<MediaType> {
    this.ensureInitialized();

    try {
      // Check cache first
      const cachedMedia = await mediaCache.get(id);
      if (cachedMedia) {
        logger.info('Media retrieved from cache', { id });
        return cachedMedia;
      }

      const media = await this.db.findOne('media_collection', { _id: this.db.convertId(id) });

      if (!media) {
        throw Error('Media not found');
      }

      const hasAccess = checkMediaAccess(userRoles, 'some_permission');

      if (!hasAccess) {
        throw Error('Access denied');
      }

      // Cache the media for future requests
      await mediaCache.set(id, media);

      return media;
    } catch (err) {
      const message = `Error retrieving media: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      throw error(500, message);
    }
  }

  // Bulk delete media items
  public async bulkDeleteMedia(ids: string[]): Promise<void> {
    this.ensureInitialized();

    try {
      const convertedIds = ids.map((id) => this.db.convertId(id));
      await this.db.deleteMany('media_collection', { _id: { $in: convertedIds } });
      // Remove from cache
      await Promise.all(ids.map((id) => mediaCache.delete(id)));
      logger.info('Bulk media deletion successful', { count: ids.length });
    } catch (err) {
      const message = `Error in bulk delete media: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      throw error(500, message);
    }
  }

  // Search media items
  public async searchMedia(query: string, page: number = 1, limit: number = 20): Promise<{ media: MediaType[]; total: number }> {
    this.ensureInitialized();

    try {
      const searchCriteria = {
        $or: [{ name: { $regex: query, $options: 'i' } }, { 'metadata.tags': { $regex: query, $options: 'i' } }]
      };

      const [media, total] = await Promise.all([
        this.db.findMany('media_collection', searchCriteria),
        this.db.countDocuments('media_collection', searchCriteria)
      ]);

      // Apply pagination in memory since findMany doesn't support it
      const startIndex = (page - 1) * limit;
      const paginatedMedia = media.slice(startIndex, startIndex + limit);

      return { media: paginatedMedia, total };
    } catch (err) {
      const message = `Error searching media: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      throw error(500, message);
    }
  }

  // List media items
  public async listMedia(page: number = 1, limit: number = 20): Promise<{ media: MediaType[]; total: number }> {
    this.ensureInitialized();

    try {
      const [media, total] = await Promise.all([this.db.findMany('media_collection', {}), this.db.countDocuments('media_collection', {})]);

      // Apply pagination in memory since findMany doesn't support it
      const startIndex = (page - 1) * limit;
      const paginatedMedia = media.slice(startIndex, startIndex + limit);

      return { media: paginatedMedia, total };
    } catch (err) {
      const message = `Error listing media: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      throw error(500, message);
    }
  }

  // Determines the media type based on the MIME type
  private getMediaType(mimeType: string): MediaTypeEnum {
    if (mimeType.startsWith('image/')) {
      return MediaTypeEnum.Image;
    } else if (mimeType.startsWith('video/')) {
      return MediaTypeEnum.Video;
    } else if (mimeType.startsWith('audio/')) {
      return MediaTypeEnum.Audio;
    } else if (mimeType === 'application/pdf') {
      return MediaTypeEnum.Document;
    } else {
      throw Error(`Unsupported media type: ${mimeType}`);
    }
  }
}
