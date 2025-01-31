<!-- 
@file src/routes/(app)/[language]/[collection]/+page.svelte  
@component
**This component handles the content and logic for a specific page within the application**

Features:
It dynamically fetches and displays data based on the current language and collection route parameters. 
It also handles navigation, mode switching (view, edit, create, media), and SEO metadata for the page.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	// Stores
	import { page } from '$app/state';
	import { contentLanguage } from '@stores/store.svelte';
	import { collection, collectionValue, mode } from '@root/src/stores/collectionStore.svelte';

	// Components
	import Fields from '@components/Fields.svelte';
	import EntryList from '@components/EntryList.svelte';
	import MediaGallery from '@src/routes/(app)/mediagallery/+page.svelte';

	// System Logger
	import { logger } from '@utils/logger.svelte';
	import type { User } from '@root/src/auth/types.js';
	import { deserializeCollection } from '@root/src/utils/serialize';
	import { publicEnv } from '@root/config/public';
	import type { AvailableLanguageTag } from '@root/src/paraglide/runtime';

	interface Props {
		data: { collection: string; contentLanguage: string; user: User };
	}
	const { data }: Props = $props();

	let isLoading = $state(false);

	$effect(() => {
		if (!page.params.collection) return;

		const selectedCollection = deserializeCollection(data.collection);
		console.log('selectedCollection', selectedCollection);
		// console.log('selectedCollection', selectedCollection, page.params.collection);
		if (selectedCollection._id !== collection.value?._id) {
			collection.set(selectedCollection);
		}
	});

	$effect(() => {
		if (!(publicEnv.AVAILABLE_CONTENT_LANGUAGES as ReadonlyArray<AvailableLanguageTag>).includes(data.contentLanguage as AvailableLanguageTag)) {
			// If data.contentLanguage is invalid and contentLanguage is not already set to a valid value, fall back to 'en'
			if (!contentLanguage.value || !(publicEnv.AVAILABLE_CONTENT_LANGUAGES as ReadonlyArray<AvailableLanguageTag>).includes(contentLanguage.value)) {
				contentLanguage.set('en');
			}
		} else {
			contentLanguage.set(data.contentLanguage as AvailableLanguageTag);
		}
	});

	// Handle language changes
	$effect(() => {
		if (!collection?.value?.name) return;

		const newLanguage = contentLanguage.value;
		const currentPath = page.url.pathname;
		const newPath = `/${newLanguage}${collection.value.path.toString()}`;
		console.log('language change', 'currentPath', currentPath, 'newPath', newPath);
		if (currentPath !== newPath) goto(newPath);
	});

	// Handle browser history navigation

	// Update SEO metadata
	$effect(() => {
		if (!browser || !collection?.value?.name) return;

		const title = `${collection.value.name.toString()} - Your Site Title`;
		const description = `View and manage entries for ${collection.value.name.toString()}.`;

		document.title = title;

		const metaDescription = document.querySelector('meta[name="description"]');
		if (metaDescription) {
			metaDescription.setAttribute('content', description);
		} else {
			const meta = document.createElement('meta');
			meta.name = 'description';
			meta.content = description;
			document.head.appendChild(meta);
		}
	});
</script>

<div class="content h-full">
	{#if isLoading}
		<div class="loading flex h-full items-center justify-center">
			<span class="loading-spinner">Loading...</span>
		</div>
	{:else if collection.value}
		{#if mode.value === 'view' || mode.value === 'modify'}
			<EntryList />
		{:else if ['edit', 'create'].includes(mode.value)}
			<div id="fields_container" class="fields max-h-[calc(100vh-60px)] overflow-y-auto max-md:max-h-[calc(100vh-120px)]">
				<Fields fields={collection.value.fields} fieldsData={collection.value.fields} customData={collectionValue.value} root={false} />
			</div>
		{:else if mode.value === 'media' && page.params.collection}
			<MediaGallery />
		{/if}
	{:else}
		<div class="error text-error-500" role="alert">Error: Collection data not available.</div>
	{/if}
</div>
