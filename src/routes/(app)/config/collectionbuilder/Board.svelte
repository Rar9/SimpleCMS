<!-- 
@files src/routes/(app)/config/collection/Board.svelte
@component
**Board component for managing nested collections**
-->
<script lang="ts">
	// Component
	import Column from './Column.svelte';

	// Store
	import { contentStructure } from '@src/stores/collectionStore.svelte';

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import type { ContentStructureNode } from '@root/src/databases/dbInterface';
	type DndItem = ContentStructureNode & { id: string; isCategory: boolean; children: DndItem[] };

	interface Props {
		contentNodes: ContentStructureNode[];
		onEditCategory: (category: string) => void;
	}

	let { contentNodes = $bindable(), onEditCategory }: Props = $props();

	// State variables
	let structuredItems = $derived.by<DndItem[]>(() => createStructuredItems(contentNodes));
	let isDragging = $state(false);
	let dragError = $state<string | null>(null);

	// Convert contentNodes to format needed for dnd-actions
	function createStructuredItems(nodes: ContentStructureNode[]): DndItem[] {
		return nodes.map((node) => ({
			...node,
			children: createStructuredItems(node.children ?? []),
			id: node._id,
			isCategory: node.nodeType === 'category'
		}));
	}

	function handleDndConsider(e: CustomEvent<DndEvent<DndItem>>) {
		isDragging = true;
		try {
			dragError = null;
		} catch (error) {
			console.error('Error handling DnD consider:', error);
			dragError = error instanceof Error ? error.message : 'Error handling drag operation';
		}
	}

	function convertToConfig(nodes: DndItem[]): ContentStructureNode[] {
		return nodes.map((node) => ({
			_id: node.id,
			nodeType: node.isCategory ? 'category' : 'collection',
			name: node.name,
			icon: node.icon,
			children: node.children?.length > 0 ? convertToConfig(node.children ?? []) : undefined,
			path: node.path,
			parentPath: node.parentPath,
			translations: node.translations,
			order: node.order,
			updatedAt: node.updatedAt
		}));
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>) {
		try {
			const newConfig = convertToConfig(structuredItems);
			contentStructure.set(newConfig);

			dragError = null;
		} catch (error) {
			console.error('Error handling DnD finalize:', error);
			dragError = error instanceof Error ? error.message : 'Error finalizing drag operation';
		} finally {
			isDragging = false;
		}
	}

	function handleUpdate(newItems: DndItem[]) {
		try {
			const newConfig = convertToConfig(newItems);
			contentStructure.set(newConfig);

			dragError = null;
		} catch (error) {
			console.error('Error handling update:', error);
			dragError = error instanceof Error ? error.message : 'Error updating items';
		}
	}

	$effect(() => {
		console.log('Structured items', structuredItems);
	});
	const flipDurationMs = 300;
</script>

<div class="h-auto w-auto max-w-full overflow-y-auto p-1" role="region" aria-label="Collection Board" aria-busy={isDragging}>
	{#if dragError}
		<div class="mb-4 rounded bg-error-500/10 p-4 text-error-500" role="alert">
			{dragError}
		</div>
	{/if}

	<div
		use:dndzone={{ items: structuredItems, flipDurationMs, centreDraggedOnCursor: true }}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
		class="min-h-[2em]"
		role="list"
		aria-label="Collection Categories"
	>
		{#each structuredItems as item (item.id)}
			<div animate:flip={{ duration: flipDurationMs }} class="my-1 w-full" role="listitem" aria-label={item.name}>
				<Column
					name={item.name}
					icon={item.icon}
					items={item.children ?? []}
					onUpdate={(newItems) => {
						const updatedItems = structuredItems.map((i) => (i.id === item.id ? { ...i, items: newItems } : i));
						handleUpdate(updatedItems);
					}}
					isCategory={item.isCategory}
					{onEditCategory}
				/>
			</div>
		{/each}
	</div>
</div>
