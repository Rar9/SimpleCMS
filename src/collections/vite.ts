/**
 * @file src/collections/vite.ts
 * @description Vite plugin for generating TypeScript types for collections
 */

import fs from 'fs';

export async function generateCollectionTypes(server) {
    try {
        const { collections } = await server.ssrLoadModule('@src/stores/collectionStore.svelte.ts');


        const collectionTypes: Record<string, { fields: string[]; type: string }> = {};

        // Access the store's value property and ensure it exists
        const collectionsData = collections?.value || {};

        if (!collectionsData || typeof collectionsData !== 'object') {
            throw new Error(`Invalid collections data: ${JSON.stringify(collectionsData)}`);
        }

        for (const [key, collection] of Object.entries(collectionsData)) {

            if (!collection?.fields) {
                console.warn(`Collection ${key} has no fields:`, collection);
                continue;
            }

            const fields = collection.fields.map(field => ({
                name: field.db_fieldName || field.label,
                type: field.type || 'string'
            }));

            collectionTypes[key] = {
                fields: fields.map(f => f.name),
                type: `{${fields.map(f => `${f.name}: ${f.type}`).join('; ')}}`
            };
        }


        let types = await fs.promises.readFile('src/collections/types.ts', 'utf-8');
        types = types.replace(/\n*export\s+type\s+CollectionTypes\s?=\s?.*?};/gms, '');
        types += '\nexport type CollectionTypes = ' + JSON.stringify(collectionTypes, null, 2) + ';\n';

        await fs.promises.writeFile('src/collections/types.ts', types);

        return collectionTypes;
    } catch (error) {
        console.error('Error generating collection types:', error);
        throw error;
    }
}