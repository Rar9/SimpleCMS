import { processModule } from '@root/src/content/utils';
import type { PageLoad } from './$types';
import lodash from 'lodash';

export const load: PageLoad = async ({ params, data }) => {

  const selectedCollection = await processModule(data.collection.module as string);
  console.log('selectedCollection', selectedCollection, data);

  if (!selectedCollection || !selectedCollection?.schema) return;
  // console.log('selectedCollection', selectedCollection, page.params.collection);

  const collectionData = lodash.omit(data.collection, ['module']);

  const collection = {
    ...selectedCollection?.schema,
    ...collectionData
  };

  return {
    ...data,
    collection,

  };
};
