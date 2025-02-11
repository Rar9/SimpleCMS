<!--
@file src/components/Collections.svelte
@component
**Collections component to display & filter collections and categories using TreeView.**

Features:
- Display collections and categories using TreeView from Skeleton.
- Search functionality with clear button.
- Support for nested categories with expand/collapse.
- Responsive sidebar integration.
- Media gallery support.
-->

<script lang="ts">
	import { goto } from '$app/navigation';

	// Types
	// Types
	import type { Schema } from '@src/content/types';
	import type { ContentStructureNode } from '@src/databases/dbInterface';

	// Stores
	import { get } from 'svelte/store';
	import { contentLanguage, shouldShowNextButton } from '@stores/store.svelte';
	import { mode, contentStructure, collection } from '@src/stores/collectionStore.svelte';
	import { handleSidebarToggle, sidebarState, toggleSidebar } from '@src/stores/sidebarStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';

	// Components
	import TreeView from '@components/system/TreeView.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface CollectionTreeNode extends ContentStructureNode {
		id: string;
		isExpanded: boolean;
		onClick: () => void;
		children?: CollectionTreeNode[];
		badge?: {
			count?: number;
			status?: 'draft' | 'published' | 'archived';
			color?: string;
		};
	}

	let collectonStructureNodes: CollectionTreeNode[] = $derived.by(() => {
		function mapNode(node: ContentStructureNode): CollectionTreeNode {
			const isCategory = node.nodeType === 'category';
			// Get translation for current language or fallback to default name
			const translation = node.translations?.find((trans) => trans.languageTag === contentLanguage.value);
			const label = translation?.translationName || node.name;

			const children =
				isCategory && node.children
					? node.children.map((child: ContentStructureNode) => ({
							...mapNode(child),
							// Ensure children use their own translations
							name: child.translations?.find((t) => t.languageTag === contentLanguage.value)?.translationName || child.name
						}))
					: undefined;
			const isNodeExpanded = collection.value?._id === node._id;
			return {
				...node,
				name: label,
				id: node._id,
				icon: node.icon,
				isExpanded: isNodeExpanded,
				onClick: () => handleCollectionSelect(node),
				children,
				badge: isCategory
					? {
							count: node.children?.filter((child) => child.nodeType === 'collection').length || 0
						}
					: undefined
			};
		}

		return contentStructure.value.map((node) => mapNode(node));
	});

	let virtualFolderNodes: CollectionTreeNode[] = $derived.by(() => {
		return [];
	});

	let search = $state('');
	let isMediaMode = $state(false);

	// Update isMediaMode when mode changes
	$effect(() => {
		isMediaMode = mode.value === 'media';
		if (collectonStructureNodes.length > 0) {
			// The search prop in TreeView will handle the filtering
			search = search.toLowerCase().trim();
		}
	});

	// Handle collection selection
	function handleCollectionSelect(selectedCollection: ContentStructureNode | Schema) {
		if ('nodeType' in selectedCollection && selectedCollection.nodeType === 'collection') {
			mode.set('view');
			collection.set(null);
			goto(`/${contentLanguage.value}${selectedCollection.path?.toString()}`);
		}
		shouldShowNextButton.set(true);
	}

	function clearSearch() {
		search = '';
	}
</script>

<div class="mt-2">
	{#if !isMediaMode}
		<!-- Search Input -->
		<div
			class="{sidebarState.sidebar.value.left === 'full'
				? 'mb-2 w-full'
				: 'mb-1 max-w-[125px]'} input-group input-group-divider grid grid-cols-[1fr_auto]"
		>
			<input
				type="text"
				placeholder="Search collections..."
				bind:value={search}
				class="input {sidebarState.sidebar.value.left === 'full' ? 'h-12' : 'h-10'} outline-none transition-all duration-500 ease-in-out"
			/>
			<button onclick={clearSearch} class="variant-filled-surface w-12" aria-label="Clear search">
				<iconify-icon icon="ic:outline-search-off" width="24"></iconify-icon>
			</button>
		</div>

		<!-- Collections TreeView -->
		{#if collectonStructureNodes.length > 0}
			<TreeView
				k={0}
				nodes={collectonStructureNodes}
				selectedId={collection.value?._id ?? undefined}
				compact={sidebarState.sidebar.value.left !== 'full'}
				{search}
			></TreeView>
		{:else}
			<div class="p-4 text-center text-gray-500">{m.collection_no_collections_found()}</div>
		{/if}

		<!-- Media Gallery Button -->
		<button
			class="btn mt-1 flex w-full rounded {sidebarState.sidebar.value.left === 'full'
				? 'flex-row '
				: 'flex-col'} items-center border border-surface-500 py-{sidebarState.sidebar.value.left === 'full'
				? '3'
				: '1'} hover:!bg-surface-400 hover:text-white dark:bg-surface-500"
			onclick={() => {
				mode.set('media');
				goto('/mediagallery');
				if (get(screenSize) === 'sm') {
					toggleSidebar('left', 'hidden');
				}
				if (sidebarState.sidebar.value.left !== 'full') handleSidebarToggle();
			}}
		>
			{#if sidebarState.sidebar.value.left === 'full'}
				<iconify-icon icon="bi:images" width="24" class="text-primary-600 rtl:ml-2"></iconify-icon>
				<p class="uppercase dark:text-white">{m.Collections_MediaGallery()}</p>
			{:else}
				<p class="darktext-white text-xs uppercase">{m.Collections_MediaGallery()}</p>
				<iconify-icon icon="bi:images" width="20" class="text-primary-500"></iconify-icon>
			{/if}
		</button>
	{/if}

	{#if isMediaMode}
		<!-- Back to Collections Button -->
		<button
			class="btn mt-1 flex w-full items-center bg-surface-400 py-2 hover:!bg-surface-500 hover:text-white dark:bg-surface-600"
			onclick={() => {
				mode.set('view');
				if (get(screenSize) === 'sm') {
					toggleSidebar('left', 'hidden');
				}
			}}
		>
			<iconify-icon icon="bi:collection" width="24" class="px-2 py-1 text-error-500"></iconify-icon>
			<p class="mr-auto text-center uppercase">Collections</p>
		</button>

		<!-- Display Virtual Folders as TreeView -->
		<TreeView k={1} nodes={virtualFolderNodes} selectedId={collection.value?._id} compact={sidebarState.sidebar.value.left !== 'full'} {search}
		></TreeView>
	{/if}
</div>
