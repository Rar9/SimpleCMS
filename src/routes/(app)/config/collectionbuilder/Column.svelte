<!-- 
@files src/routes/(app)/config/collection/Column.svelte
@component
**This component displays a collection with nested items support**

-->
<script lang="ts">
	import Column from './Column.svelte';
	import { goto } from '$app/navigation';
	import type { CollectionData } from '@src/content/types';

	// Stores
	import { mode, contentStructure } from '@root/src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	import ModalAddCategory from './ModalCategory.svelte';

	interface Props {
		name: string;
		icon: string;
		items?: DndItem[];
		level?: number;
		onUpdate: (items: DndItem[]) => void;
		isCategory?: boolean;
		onEditCategory: (category: Pick<CollectionData, 'name' | 'icon'>) => void;
	}

	interface DndItem {
		id: string;
		name: string;
		icon: string;
		isCategory: boolean;
		children?: DndItem[];
	}

	interface CategoryUpdateResponse {
		newCategoryName: string;
		newCategoryIcon: string;
	}

	let { name, icon, items = $bindable([]), level = 0, onUpdate, isCategory = false, onEditCategory }: Props = $props();

	// State variables
	let isDragging = $state(false);
	let updateError = $state<string | null>(null);
	let isUpdating = $state(false);

	const modalStore = getModalStore();
	const flipDurationMs = 200;

	// Computed values
	let paddingLeft = $derived(level === 0 ? '0' : `${level * 1.5}rem`);

	function handleDndConsider(e: CustomEvent<DndEvent<DndItem>>) {
		isDragging = true;
		try {
			items = e.detail.items;
			updateError = null;
		} catch (error) {
			console.error('Error handling DnD consider:', error);
			updateError = error instanceof Error ? error.message : 'Error handling drag operation';
		}
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>) {
		try {
			items = e.detail.items;
			onUpdate(items);
			updateError = null;
		} catch (error) {
			console.error('Error handling DnD finalize:', error);
			updateError = error instanceof Error ? error.message : 'Error finalizing drag operation';
		} finally {
			isDragging = false;
		}
	}

	async function handleCollectionClick(item: Pick<DndItem, 'name'>) {
		try {
			mode.set('edit');
			await goto(`/config/collectionbuilder/${item.name}`);
		} catch (error) {
			console.error('Error navigating to collection:', error);
			updateError = error instanceof Error ? error.message : 'Error navigating to collection';
		}
	}

	function handleCategoryEdit() {
		onEditCategory({ name, icon });
	}

	// Modal handling
	async function editCategory(category: Pick<CollectionData, 'name' | 'icon'>): Promise<void> {
		const modalComponent: ModalComponent = {
			ref: ModalAddCategory,
			props: {
				existingCategory: category
			}
		};

		const modalSettings: ModalSettings = {
			type: 'component',
			title: m.column_edit_category(),
			body: m.column_modify_category(),
			component: modalComponent,
			response: async (response: CategoryUpdateResponse | boolean) => {
				if (!response || typeof response === 'boolean') return;

				isUpdating = true;
				updateError = null;

				try {
					// Update local store only, saving will happen when save button is clicked
					contentStructure.update((cats) => {
						const newCategories = { ...cats };
						Object.entries(newCategories).forEach(([key, value]) => {
							if (value.name === category.name) {
								newCategories[key] = {
									...value,
									name: response.newCategoryName,
									icon: response.newCategoryIcon
								};
							}
						});
						return newCategories;
					});
				} catch (error) {
					console.error('Error updating category:', error);
					updateError = error instanceof Error ? error.message : 'Failed to update category';

					// Revert store changes on error
					contentStructure.update((cats) => {
						const newCategories = { ...cats };
						Object.entries(newCategories).forEach(([key, value]) => {
							if (value.name === response.newCategoryName) {
								newCategories[key] = {
									...value,
									name: category.name,
									icon: category.icon
								};
							}
						});
						return newCategories;
					});
				} finally {
					isUpdating = false;
				}
			}
		};

		modalStore.trigger(modalSettings);
	}
</script>

<div class="my-0.5 w-full" style="padding-left: {paddingLeft}" role="listitem" aria-busy={isDragging || isUpdating}>
	{#if updateError}
		<div class="mb-2 rounded bg-error-500/10 p-2 text-error-500" role="alert">
			{updateError}
		</div>
	{/if}

	{#if isCategory}
		<div class="flex items-center justify-between rounded bg-surface-300/10 p-2">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:drag" width="18" class="cursor-move opacity-50" role="button" aria-label="Drag to reorder"></iconify-icon>
				<iconify-icon {icon} width="18" class="text-error-500" aria-hidden="true"></iconify-icon>
				<span class="font-bold text-tertiary-500 dark:text-primary-500">{name}</span>
			</div>

			<button onclick={handleCategoryEdit} aria-label={`Edit category ${name}`} disabled={isUpdating}>
				<iconify-icon icon="mdi:pen" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			</button>
		</div>
	{:else}
		<div class="flex items-center justify-between rounded bg-surface-300/10 p-2">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:drag" width="18" class="cursor-move opacity-50" role="button" aria-label="Drag to reorder"></iconify-icon>
				<iconify-icon {icon} width="18" class="text-error-500" aria-hidden="true"></iconify-icon>
				<span class="text-black dark:text-white">{name}</span>
			</div>
			<button onclick={() => handleCollectionClick({ name })} aria-label={`Edit collection ${name}`} disabled={isUpdating}>
				<iconify-icon icon="mdi:pen" width="18"></iconify-icon>
			</button>
		</div>
	{/if}

	{#if items?.length > 0}
		<section
			use:dndzone={{ items, flipDurationMs, centreDraggedOnCursor: true }}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}
			role="list"
			aria-label={`${isCategory ? 'Category' : 'Collection'} children`}
		>
			{#each items as item (item.id)}
				<div animate:flip={{ duration: flipDurationMs }} class="mx-0.5 p-0.5">
					<Column
						name={item.name}
						icon={item.icon}
						items={item.children ?? []}
						level={level + 0.25}
						isCategory={item.isCategory}
						onUpdate={(newItems) => {
							item.children = newItems;
							onUpdate(items);
						}}
						{onEditCategory}
					/>
				</div>
			{/each}
		</section>
	{/if}
</div>
