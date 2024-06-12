
import { privateEnv } from '@root/config/private';

// Graphql Yoga
import { createSchema, createYoga } from 'graphql-yoga';
import type { RequestEvent } from '@sveltejs/kit';
import mongoose from 'mongoose';
import { getCollections } from '@collections';
import widgets from '@components/widgets';
import { getFieldName } from '@utils/utils';
import deepmerge from 'deepmerge';

// Redis
import { createClient } from 'redis';

let redisClient: any = null;

if (privateEnv.USE_REDIS === true) {
    // Create Redis client
    redisClient = createClient({
        url: `redis://${privateEnv.REDIS_HOST}:${privateEnv.REDIS_PORT}`,
        password: privateEnv.REDIS_PASSWORD
    });

    redisClient.on('error', (err: Error) => {
        console.error('Redis error: ', err);
    });
}

let typeDefs = /* GraphQL */ ``;
const types = new Set();

// Initialize an empty resolvers object
let resolvers: { [key: string]: any } = {
    Query: {}
};

const collectionSchemas: string[] = [];

async function setupGraphQL() {
    console.log('Getting collections...');
    const collections = await getCollections();
    console.log(`Found ${collections.length} collections`);

    // Loop over each collection to define typeDefs and resolvers
    for (const collection of collections) {
        console.log(`Processing collection: ${collection.name}`);
        resolvers[collection.name as string] = {};
        // Default same for all Content
        let collectionSchema = `
        type ${collection.name} {
            _id: String
            createdAt: Float
            updatedAt: Float
        `;

        for (const field of collection.fields) {
            console.log(`Processing field: ${getFieldName(field, true)}`);
            const schema = widgets[field.widget.Name].GraphqlSchema?.({ field, label: getFieldName(field, true), collection });

            if (schema.resolver) {
                resolvers = deepmerge(resolvers, schema.resolver);
            }

            if (schema) {
                const _types = schema.graphql.split(/(?=type.*?{)/);
                for (const type of _types) {
                    types.add(type);
                }
                if ('extract' in field && field.extract && 'fields' in field && field.fields.length > 0) {
                    // for helper widgets which extract its fields and does not exist in db itself like imagearray
                    const _fields = field.fields;
                    for (const _field of _fields) {
                        collectionSchema += `${getFieldName(_field, true)}: ${
                            widgets[_field.widget.Name].GraphqlSchema?.({
                                field: _field,
                                label: getFieldName(_field, true),
                                collection
                            }).typeName
                        }\n`;
                        console.log('---------------------------');
                        console.log(collectionSchema);
                        resolvers[collection.name as string] = deepmerge(
                            {
                                [getFieldName(_field, true)]: (parent) => {
                                    return parent[getFieldName(_field)];
                                }
                            },
                            resolvers[collection.name as string]
                        );
                    }
                } else {
                    collectionSchema += `${getFieldName(field, true)}: ${schema.typeName}\n`;

                    resolvers[collection.name as string] = deepmerge(
                        {
                            [getFieldName(field, true)]: (parent) => {
                                return parent[getFieldName(field)];
                            }
                        },
                        resolvers[collection.name as string]
                    );
                }
            }
        }
        collectionSchemas.push(collectionSchema + '}\n');
    }

    // Add typeDefs and resolvers to typeDefs
    typeDefs += Array.from(types).join('\n');
    typeDefs += collectionSchemas.join('\n');
    typeDefs += `
    type Query {
        ${collections.map((collection: any) => `${collection.name}: [${collection.name}]`).join('\n')}
    }
    `;

    // Log the final typeDefs for debugging
    console.log('Final TypeDefs:');
    console.log(typeDefs);

    // Loop over each collection to define resolvers for querying data
    for (const collection of collections) {
        console.log(`Adding resolver for ${collection.name}...`);
        // Add a resolver function for collections
        resolvers.Query[collection.name as string] = async () => {
            try {
                if (privateEnv.USE_REDIS === true) {
                    // Try to fetch the result from Redis first
                    const cachedResult = await new Promise((resolve, reject) => {
                        redisClient.get(collection.name, (err, result) => {
                            if (err) reject(err);
                            resolve(result ? JSON.parse(result) : null);
                        });
                    });

                    if (cachedResult !== null) {
                        // If the result was found in Redis, return it
                        return cachedResult;
                    }
                }

                // If the result was not found in Redis, fetch it from the database
                const dbResult = await mongoose.models[collection.name as string].find({ status: { $ne: 'unpublished' } }).lean();

                if (privateEnv.USE_REDIS === true) {
                    // Store the DB result in Redis for future requests
                    redisClient.set(collection.name, JSON.stringify(dbResult), 'EX', 60 * 60); // Cache for 1 hour
                }

                // Convert the array of objects to a JSON object
                return dbResult;
            } catch (error) {
                console.error(`Error fetching data for ${collection.name}:`, error);
                throw error;
            }
        };
    }

    console.log('Creating Yoga app...');
    const yogaApp = createYoga<RequestEvent>({
        // Import schema and resolvers
        schema: createSchema({
            typeDefs,
            resolvers
        }),
        // Define explicitly the GraphQL endpoint
        graphqlEndpoint: '/api/graphql',
        // Use SvelteKit's Response object
        fetchAPI: globalThis
    });

    console.log('Exporting Yoga app...');
    // Ensure the exported functions return a Response object
    return yogaApp;
}

const yogaAppPromise = setupGraphQL();

const handler = async (event: RequestEvent) => {
    const yogaApp = await yogaAppPromise;
    const response = await yogaApp.handleRequest(event.request, event);
    return new Response(response.body, {
        status: response.status,
        headers: response.headers,
    });
};

export { handler as GET, handler as POST };
