/**
 * @file: src/routes/api/save-categories/+server.ts
 * @description: API endpoint for saving category configuration data with backup support
 *
 * Features:
 * - Save category configuration data with backup
 * - Backup existing category files before saving
 * - Execute a server restart after saving configuration
 * - Comprehensive error handling and logging
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { promisify } from 'util';
import { backupCategoryFiles } from './backup-utils';
import { _generateCategoriesFileContent } from '../updateCategories/+server';

// System Logger
import { logger } from '@utils/logger';

// Import the CategoryData type from the shared types
import type { CategoryData } from '@src/collections/types';

const execAsync = promisify(exec);

export const POST: RequestHandler = async ({ request }) => {
	const categoryData = await request.json();

	try {
		// Validate category data
		if (!categoryData || typeof categoryData !== 'object') {
			throw new Error('Invalid category data format. Expected a Record<string, CategoryData>.');
		}

		// Validate the structure of the category data
		for (const [key, value] of Object.entries(categoryData)) {
			if (!value || typeof value !== 'object' || !value.name || !value.icon) {
				throw new Error(`Invalid category data for key "${key}". Each category must have a name and icon.`);
			}
		}

		// Backup the current category configuration before saving
		await backupCategoryFiles();
		logger.info('Category files backed up successfully');

		// Save the category data
		await saveCategoryFile(categoryData);

		// Trigger the restart
		await triggerServerRestart();

		logger.info('Categories saved and server restart triggered successfully');
		return json({ success: true }, { status: 200 });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Error saving categories:', { error: errorMessage });
		return json({ success: false, error: `Failed to save categories: ${errorMessage}` }, { status: 500 });
	}
};

// Save category file
async function saveCategoryFile(categoryData: Record<string, CategoryData>): Promise<void> {
	const categoriesPath = path.join(process.cwd(), 'src', 'collections', 'categories.ts');

	try {
		// Generate the categories file content using the shared function
		const content = _generateCategoriesFileContent(categoryData);

		// Write the file directly
		await fs.writeFile(categoriesPath, content, 'utf-8');
		logger.info('Categories file written successfully');
	} catch (error) {
		logger.error('Error saving categories file:', error);
		throw Error('Failed to save categories file');
	}
}

// Trigger a server restart
async function triggerServerRestart(): Promise<void> {
	try {
		const { stdout, stderr } = await execAsync('your-restart-command');
		logger.info('Server restart command executed successfully', { stdout });
		if (stderr) {
			logger.warn('Server restart command stderr', { stderr });
		}
	} catch (error) {
		logger.error('Error executing server restart command:', error);
		throw Error('Failed to execute server restart command');
	}
}
