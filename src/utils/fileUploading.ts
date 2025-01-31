/**
 * @file src/utils/fileUploading.ts
 * @description ..
 **/

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.svelte';
import { publicEnv } from '@root/config/public';

const getRootPath = () => {
  // Use import.meta.path directly for Bun compatibility
  const __dirname = path.dirname(import.meta.path);
  return path.resolve(__dirname, '../../');
};

export async function uploadFile(file: File, folder?: string) {
  // Construct the directory path based on the optional `folder` parameter
  const directoryPath = folder
    ? path.join(getRootPath(), publicEnv.MEDIA_FOLDER, folder)
    : path.join(getRootPath(), publicEnv.MEDIA_FOLDER);

  try {
    // Ensure the target directory exists, create if it doesn't
    await fs.mkdir(directoryPath, { recursive: true });

    const filePath = path.join(directoryPath, file.name);

    // Write the file to the specified directory
    await fs.writeFile(filePath, new DataView(await file.arrayBuffer()));

    logger.info('File saved successfully:', filePath);
  } catch (err) {
    logger.error(`Error writing file: ${err}`);
  }
}

export async function createDirectory(folder: string) {
  const directoryPath = path.join(getRootPath(), publicEnv.MEDIA_FOLDER, folder);
  await fs.mkdir(directoryPath, { recursive: true });
  logger.info(`Sub-Directory created: ${folder}`);
}

export async function deleteDirectory(folder: string) {
  const directoryPath = path.join(getRootPath(), publicEnv.MEDIA_FOLDER, folder);
  await fs.rmdir(directoryPath);
  logger.info(`Sub-Directory deleted: ${folder}`);
}