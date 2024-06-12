import mongoose from 'mongoose';

import { getCollections } from '@collections';
import widgets from '@components/widgets';
import { getFieldName } from '@utils/utils';
import deepmerge from 'deepmerge';

// Registers collection schemas dynamically in Mongoose.
export async function registerCollections() {
	const collections = await getCollections();
	const typeDefsSet = new Set<string>();
	const resolvers: { [key: string]: any } = { Query: {} };
	const collectionSchemas: string[] = [];

	// Loop over each collection to register Mongoose models and build typeDefs and resolvers
	for (const collection of collections) {
		// Register Mongoose model if not already registered
		if (!mongoose.models[collection.name]) {
			const schemaDefinition: any = {};
			collection.fields.forEach((field) => {
				schemaDefinition[getFieldName(field)] = {
					type: mongoose.Schema.Types.Mixed,
					required: field.required || false
				};
			});
			const schema = new mongoose.Schema(schemaDefinition, { timestamps: true });
			mongoose.model(collection.name, schema);
		}

		// Initialize collection resolvers
		resolvers[collection.name as string] = {};

		// Initialize GraphQL type definition for the collection
		let collectionSchema = `
            type ${collection.name} {
                _id: String
                createdAt: String
                updatedAt: String
        `;

		// Loop over each field to build the schema and resolvers
		for (const field of collection.fields) {
			const schema = widgets[field.widget.Name].GraphqlSchema?.({ field, label: getFieldName(field, true), collection });

			// Merge resolvers if available
			if (schema?.resolver) {
				deepmerge(resolvers, schema.resolver);
			}

			// Build the GraphQL type definition
			if (schema) {
				const _types = schema.graphql.split(/(?=type.*?{)/);
				for (const type of _types) {
					typeDefsSet.add(type);
				}
				// Handle extracted fields
				if ('extract' in field && field.extract && 'fields' in field && field.fields.length > 0) {
					const _fields = field.fields;
					for (const _field of _fields) {
						collectionSchema += `${getFieldName(_field, true)}: ${
							widgets[_field.widget.Name].GraphqlSchema?.({
								field: _field,
								label: getFieldName(_field, true),
								collection
							}).typeName
						}\n`;
						deepmerge(resolvers[collection.name as string], {
							[getFieldName(_field, true)]: (parent) => parent[getFieldName(_field)]
						});
					}
				} else {
					collectionSchema += `${getFieldName(field, true)}: ${schema.typeName}\n`;
					deepmerge(resolvers[collection.name as string], {
						[getFieldName(field, true)]: (parent) => parent[getFieldName(field)]
					});
				}
			}
		}
		collectionSchemas.push(collectionSchema + '}\n');
	}

	return {
		typeDefs: Array.from(typeDefsSet).join('\n') + collectionSchemas.join('\n'),
		resolvers,
		collections
	};
}

// Builds resolvers for querying collection data.
export async function collectionsResolvers(redisClient, privateEnv) {
	const { resolvers, collections } = await registerCollections();

	for (const collection of collections) {
		resolvers.Query[collection.name as string] = async () => {
			try {
				// Try to fetch the result from Redis first
				if (privateEnv.USE_REDIS === true) {
					const cachedResult = await redisClient.get(collection.name);
					if (cachedResult) {
						return JSON.parse(cachedResult);
					}
				}

				// Fetch result from the database
				const model = mongoose.models[collection.name];
				if (!model) {
					throw new Error(`Model not found for collection: ${collection.name}`);
				}

				const dbResult = await model
					.find({ status: { $ne: 'unpublished' } })
					.sort({ createdAt: -1 })
					.lean();

				// Convert dates to ISO strings
				dbResult.forEach((doc: any) => {
					doc.createdAt = new Date(doc.createdAt).toISOString();
					doc.updatedAt = new Date(doc.updatedAt).toISOString();
				});

				// Store the DB result in Redis for future requests
				if (privateEnv.USE_REDIS === true) {
					await redisClient.set(collection.name, JSON.stringify(dbResult), 'EX', 60 * 60); // Cache for 1 hour
				}

				return dbResult;
			} catch (error) {
				console.error(`Error fetching data for ${collection.name}:`, error);
				throw error;
			}
		};
	}

	return resolvers.Query;
}
