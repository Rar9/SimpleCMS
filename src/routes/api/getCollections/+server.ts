/**
 * @file src/routes/api/getCollections/+server.ts
 * @description
 * API endpoint for retrieving collection files or a specific collection file.
 */

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getCollectionFiles } from './getCollectionFiles';
import { logger } from '@src/utils/logger';
import path from 'path';
import fs from 'fs/promises';

// Set the collections folder path, use environment variable if available
const collectionsFolder = process.env.VITE_COLLECTIONS_FOLDER || './collections';

export const GET: RequestHandler = async ({ url }) => {
	// Get the fileName query parameter
	const fileNameQuery = url.searchParams.get('fileName');

	if (fileNameQuery) {
		// If fileName is provided, handle single file request
		return await handleSingleFileRequest(fileNameQuery);
	} else {
		// If no fileName, return all collection files
		return await handleAllFilesRequest();
	}
};

// Safely parse collection file content
function safeParseCollectionFile(content: string) {
	try {
		// Remove any potential executable code patterns
		const sanitizedContent = content
			.replace(/\bfunction\b/g, '"function"')
			.replace(/\beval\b/g, '"eval"')
			.replace(/\bnew\b/g, '"new"')
			.replace(/\bclass\b/g, '"class"');

		// Parse the content as JSON
		const parsed = JSON.parse(sanitizedContent);

		// Validate the structure
		if (typeof parsed !== 'object' || parsed === null) {
			throw new Error('Invalid collection file structure');
		}

		return { default: parsed };
	} catch (err) {
		logger.error('Error parsing collection file:', err);
		throw new Error('Invalid collection file format');
	}
}

async function handleSingleFileRequest(fileNameQuery: string) {
	// Extract just the filename to prevent directory traversal
	const fileName = path.basename(fileNameQuery);
	// Construct the full file path
	const filePath = path.join(path.resolve(collectionsFolder), fileName);

	// Security check: Ensure the file is within the collections folder
	if (!filePath.startsWith(path.resolve(collectionsFolder))) {
		logger.warn(`Attempted directory traversal: ${fileName}`);
		return error(400, 'Invalid file name');
	}

	try {
		// Ensure only .js files are processed
		if (path.extname(fileName) !== '.js') {
			throw new Error('Invalid file type');
		}

		// Read the file content
		const fileContent = await fs.readFile(filePath, 'utf-8');

		// Safely parse the file content
		const result = safeParseCollectionFile(fileContent);

		logger.info(`Retrieved collection file: ${fileName}`);
		// Return the file content as JSON
		return json(result, {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		logger.error(`Failed to read the file: ${fileName}`, err);
		return error(500, `Failed to read the file: ${(err as Error).message}`);
	}
}

async function handleAllFilesRequest() {
	try {
		// Get all collection files
		const files = await getCollectionFiles();
		logger.info('Collection files retrieved successfully');

		// Return the list of files as JSON
		return json(files, {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		logger.error('Error retrieving collection files:', err);
		return error(500, `Error retrieving collection files: ${(err as Error).message}`);
	}
}
