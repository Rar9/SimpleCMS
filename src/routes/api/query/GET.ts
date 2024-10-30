/**
 * @file src/routes/api/query/GET.ts
 * @description Handler for GET operations on collections.
 *
 * This module provides functionality to:
 * - Retrieve documents from a specified collection
 * - Apply sorting, filtering, and pagination
 * - Handle custom widget aggregations
 * - Perform post-retrieval modifications via modifyRequest
 *
 * Features:
 * - Support for custom widget-based filtering and sorting
 * - Pagination with skip and limit
 * - Optimized queries for better database compatibility
 * - Total count and pages count calculation
 * - Content language handling
 * - Error handling and logging
 * - Performance monitoring with visual indicators
 */

// Types
import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';
import type { CollectionModel } from '@src/databases/dbInterface';

// Database
import { dbAdapter, getCollectionModels } from '@src/databases/db';

// Utils
import { modifyRequest } from '@src/routes/api/query/modifyRequest';
import widgets from '@components/widgets';
import { getFieldName, get_elements_by_id } from '@utils/utils';

// System Logger
import { logger } from '@utils/logger';

// Performance monitoring utilities
const getPerformanceEmoji = (responseTime: number): string => {
	if (responseTime < 100) return '🚀'; // Super fast
	if (responseTime < 500) return '⚡'; // Fast
	if (responseTime < 1000) return '⏱️'; // Moderate
	if (responseTime < 3000) return '🕰️'; // Slow
	return '🐢'; // Very slow
};

// Function to handle GET requests for a specified collection
export async function _GET({
	schema,
	sort = {},
	filter = {},
	contentLanguage,
	user,
	limit = 0,
	page = 1
}: {
	schema: Schema;
	user: User;
	sort?: { [key: string]: number };
	filter?: { [key: string]: string };
	contentLanguage: string;
	limit?: number;
	page?: number;
}) {
	const start = performance.now();
	try {
		logger.debug(`GET request received for schema: ${schema.name}, user_id: ${user._id}`);

		// Ensure the database adapter is initialized
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			return new Response('Internal server error: Database adapter not initialized', { status: 500 });
		}

		// Validate schema name
		if (!schema.name) {
			logger.error(`Invalid or undefined schema name: ${schema.name}`);
			return new Response('Invalid or undefined schema name.', { status: 400 });
		}

		const collections = await getCollectionModels(); // Get collection models from the database
		logger.debug(`Collection models retrieved: ${Object.keys(collections).join(', ')}`);

		const collection = collections[schema.name] as CollectionModel; // Get the specific collection based on the schema name
		// Check if the collection exists
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found', { status: 404 });
		}

		const aggregations: any[] = [];
		const skip = (page - 1) * limit; // Calculate the number of documents to skip for pagination

		// Build aggregation pipelines for sorting and filtering
		for (const field of schema.fields) {
			const widget = widgets[field.widget.Name];
			const fieldName = getFieldName(field);
			if ('aggregations' in widget) {
				const _filter = filter[fieldName];
				const _sort = sort[fieldName];

				if (widget.aggregations?.filters && _filter) {
					try {
						const _aggregations = await widget.aggregations.filters({
							field,
							contentLanguage,
							filter: _filter
						});
						aggregations.push(..._aggregations);
					} catch (error) {
						logger.error(`Error in widget filter aggregation for field ${fieldName}: ${error}`);
					}
				}
				if (widget.aggregations?.sorts && _sort) {
					try {
						const _aggregations = await widget.aggregations.sorts({
							field,
							contentLanguage,
							sort: _sort
						});
						aggregations.push(..._aggregations);
					} catch (error) {
						logger.error(`Error in widget sort aggregation for field ${fieldName}: ${error}`);
					}
				}
			}
		}

		// Execute queries separately for better compatibility
		let entries = [],
			total = 0;
		try {
			// Get total count first
			const countResult = await collection.aggregate([...aggregations, { $count: 'total' }]);
			total = countResult[0]?.total ?? 0;

			// Then get paginated entries
			entries = await collection.aggregate([...aggregations, { $skip: skip }, ...(limit ? [{ $limit: limit }] : [])]);

			const queryDuration = performance.now() - start;
			const queryEmoji = getPerformanceEmoji(queryDuration);
			logger.debug(`Queries executed in ${queryDuration.toFixed(2)}ms ${queryEmoji}. Entries: ${entries.length}, Total: ${total}`);
		} catch (error) {
			logger.error(`Error executing queries: ${error}`);
			return new Response('Error executing database query', { status: 500 });
		}

		// Modify request with the retrieved entries
		try {
			await modifyRequest({
				data: entries,
				collection,
				fields: schema.fields,
				user,
				type: 'GET'
			});
			logger.debug(`Request modified for ${entries.length} entries`);
		} catch (error) {
			logger.error(`Error in modifyRequest: ${error}`);
		}

		// Get all collected IDs and modify request
		try {
			await get_elements_by_id.getAll(dbAdapter);
			logger.debug('get_elements_by_id.getAll executed successfully');
		} catch (error) {
			logger.error(`Error in get_elements_by_id.getAll: ${error}`);
		}

		// Calculate pages count
		const pagesCount = limit > 0 ? Math.ceil(total / limit) : 1;

		const duration = performance.now() - start;
		const emoji = getPerformanceEmoji(duration);
		logger.info(`GET request completed in ${duration.toFixed(2)}ms ${emoji}. Total: ${total}, Pages: ${pagesCount}`);

		// Return the response with entry list and pages count
		return new Response(
			JSON.stringify({
				success: true,
				entryList: entries,
				pagesCount,
				performance: {
					total: duration
				}
			}),
			{
				headers: {
					'Content-Type': 'application/json',
					'X-Content-Type-Options': 'nosniff'
				}
			}
		);
	} catch (error) {
		const duration = performance.now() - start;
		const emoji = getPerformanceEmoji(duration);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		const errorStack = error instanceof Error ? error.stack : '';
		logger.error(`Error in GET request after ${duration.toFixed(2)}ms ${emoji}: ${errorMessage}`, { stack: errorStack });
		return new Response(
			JSON.stringify({
				success: false,
				error: errorMessage,
				performance: {
					total: duration
				}
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					'X-Content-Type-Options': 'nosniff'
				}
			}
		);
	}
}
