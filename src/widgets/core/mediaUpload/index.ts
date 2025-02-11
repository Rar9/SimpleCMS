/**
@file src/widgets/core/mediaUpload/index.ts
@description - MediaUpload index file  

Features:
- Media upload for images, videos, audio, and documents
- Drag and drop support for file upload
- Preview of uploaded files
- File sorting and reordering
- Array of uploaded files
*/

import { publicEnv } from '@root/config/public';

// Media
//import { MediaService } from '@utils/media/MediaService';
import type { MediaType, MediaAccess } from '@utils/media/mediaModels';
import { Permission } from '@utils/media/mediaModels';

import { getFieldName, getGuiFields, get_elements_by_id, meta_data } from '@utils/utils';
//import { dbAdapter } from '@src/databases/db';
import { type Params, GuiSchema, GraphqlSchema } from './types';
import { type ModifyRequestParams } from '@widgets/widgetManager.svelte';

// ParaglideJS
import * as m from '@src/paraglide/messages';

// System Logger
import { logger } from '@utils/logger.svelte';

const WIDGET_NAME = 'MediaUpload' as const;

// Extend meta_data type
interface ExtendedMetaData {
  media_files?: {
    removed: string[];
  };
}

// Type guard to ensure media has an ID
function hasMediaId(media: MediaType): media is MediaType & { _id: string } {
  return media._id !== undefined && typeof media._id === 'string';
}

// Type guard for string data
function isValidString(data: unknown): data is string {
  return typeof data === 'string' && data.length > 0;
}

// Type guard for info with contentLanguage
interface AggregationInfo {
  field: MediaBase;
  contentLanguage?: string;
  filter?: string;
  sort?: number;
}

function getLanguage(info: AggregationInfo): string {
  return info.contentLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE;
}

// Helper function to safely get element by ID
async function safeGetElementById(id: unknown, callback: (data: MediaType) => void): Promise<void> {
  if (isValidString(id)) {
    await get_elements_by_id.add('media_files', id, callback);
  }
}

// Helper function to ensure valid ID
function ensureValidId(id: unknown): string {
  if (!isValidString(id)) {
    throw new Error('Invalid ID provided');
  }
  return id;
}

// Helper function to get MediaService instance
function getMediaService(): MediaService {
  try {
    const service = new MediaService(dbAdapter);
    logger.info('MediaService initialized successfully');
    return service;
  } catch (err) {
    const message = `Failed to initialize MediaService: ${err instanceof Error ? err.message : String(err)}`;
    logger.error(message);
    throw new Error(message);
  }
}

const widget = (params: Params) => {
  // Define the display function
  const display =
    params.display ||
    (({ data }) => {
      const url =
        data instanceof FileList ? URL.createObjectURL(data[0]) : data instanceof File ? URL.createObjectURL(data) : data?.thumbnail?.url || '';

      switch (params.type) {
        case 'video':
          return `<video class='max-w-[200px] inline-block' src="${url}" controls></video>`;
        case 'audio':
          return `<audio class='max-w-[200px] inline-block' src="${url}" controls></audio>`;
        case 'document':
          return `<a class='max-w-[200px] inline-block' href="${url}" target="_blank">${data?.name || 'Document'}</a>`;
        default:
          return `<img class='max-w-[200px] inline-block' src="${url}" alt="Media preview" />`;
      }
    });

  // Define the widget object
  const widget = {
    Name: WIDGET_NAME,
    GuiFields: getGuiFields(params, GuiSchema)
  };

  // Define the field object
  const field = {
    // default fields
    display,
    label: params.label,
    db_fieldName: params.db_fieldName,
    translated: params.translated,
    required: params.required,
    icon: params.icon,
    width: params.width,
    helper: params.helper,

    // permissions
    permissions: params.permissions,

    // widget specific
    folder: params.folder || 'unique',
    multiupload: params.multiupload,
    sizelimit: params.sizelimit,
    extensions: params.extensions,
    metadata: params.metadata,
    tags: params.tags,
    categories: params.categories,
    responsive: params.responsive,
    customDisplayComponent: params.customDisplayComponent,
    watermark: {
      url: params.watermark?.url || '',
      position: params.watermark?.position || 'center',
      opacity: params.watermark?.opacity || 1,
      scale: params.watermark?.scale || 1,
      offsetX: params.watermark?.offsetX || 0,
      offsetY: params.watermark?.offsetY || 0,
      rotation: params.watermark?.rotation || 0
    }
  };

  // Return the field and widget objects
  return { ...field, widget };
};

// Assign Name, GuiSchema and GraphqlSchema to the widget function
widget.Name = WIDGET_NAME;
widget.GuiSchema = GuiSchema;
widget.GraphqlSchema = GraphqlSchema;
widget.toString = () => '';

// Widget icon and helper text
widget.Icon = 'material-symbols:image-outline';
widget.Description = m.widget_ImageUpload_description();

widget.modifyRequest = async ({ data, type, id }: ModifyRequestParams<typeof widget>) => {
  try {
    const _data = data.get();
    const extendedMetaData = meta_data as unknown as ExtendedMetaData;
    const validId = ensureValidId(id);

    switch (type) {
      case 'GET':
        data.update(null);
        await safeGetElementById(_data, (newData) => data.update(newData));
        break;
      case 'POST':
      case 'PATCH':
        if (_data instanceof File) {
          const mediaService = getMediaService();
          const access: MediaAccess = {
            userId: validId,
            permissions: [Permission.Read, Permission.Write, Permission.Delete]
          };

          const savedMedia = await mediaService.saveMedia(_data, validId, access);
          if (!hasMediaId(savedMedia)) {
            throw new Error('Failed to get media ID from saved media');
          }

          data.update(savedMedia._id);

          const removedFiles = extendedMetaData?.media_files?.removed;
          if (Array.isArray(removedFiles)) {
            const index = removedFiles.indexOf(savedMedia._id);
            if (index !== -1) {
              removedFiles.splice(index, 1);
            }
          }

          if (dbAdapter) {
            await dbAdapter.updateOne('media_files', { _id: savedMedia._id }, { $addToSet: { used_by: validId } });
            logger.info(`Updated media file usage reference: ${savedMedia._id}`);
          }
        } else if (_data && typeof _data === 'object' && '_id' in _data) {
          const mediaId = String(_data._id);
          data.update(mediaId);
        }
        break;
      case 'DELETE':
        if (isValidString(_data)) {
          const mediaService = getMediaService();
          await mediaService.deleteMedia(_data);
          logger.info(`Deleted media file: ${_data}`);
        } else if (dbAdapter) {
          await dbAdapter.updateMany('media_files', {}, { $pull: { used_by: validId } });
          logger.info('Removed all media file references');
        }
        break;
    }
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`Error in mediaUpload widget: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
};

// Widget Aggregations
widget.aggregations = {
  filters: async (info: AggregationInfo) => {
    const field = info.field as ReturnType<typeof widget>;
    const fieldName = getFieldName(field);
    const language = getLanguage(info);

    return [
      {
        $match: {
          [`${fieldName}.header.${language}`]: {
            $regex: info.filter || '',
            $options: 'i'
          }
        }
      }
    ];
  },
  sorts: async (info: AggregationInfo) => {
    const field = info.field as ReturnType<typeof widget>;
    const fieldName = getFieldName(field);
    const language = getLanguage(info);

    return [{ $sort: { [`${fieldName}.${language}`]: info.sort || 1 } }];
  }
} as Aggregations;

// Export widget function and extend with FieldType
export default widget;
export type FieldType = ReturnType<typeof widget>;
