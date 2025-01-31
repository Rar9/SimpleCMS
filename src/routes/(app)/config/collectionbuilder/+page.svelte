<!-- 
 @file src/routes/(app)/config/collection/+page.svelte
 @component
 **This component sets up and displays the collection page with nested category support**

 Features:
 - Collection Name
 - Collection Icon
 - Collection Description
 - Collection Status
 - Collection Slug
 - Collection Description
 - Collection Permissions
 - Collection Fields
 - Collection Categories
 
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { v4 as uuidv4 } from 'uuid';
	import { checkCollectionNameConflict } from '@utils/utils';
	import type { CollectionData } from '@src/content/types';

	// Stores
	import { collectionValue, mode } from '@src/stores/collectionStore.svelte';
	import { contentStructure } from '@root/src/stores/collectionStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Board from './Board.svelte';
	import ModalCategory from './ModalCategory.svelte';
	import ModalNameConflict from './ModalNameConflict.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getToastStore, getModalStore, type ModalSettings, type ModalComponent } from '@skeletonlabs/skeleton';

	interface CategoryModalResponse {
		newCategoryName: string;
		newCategoryIcon: string;
	}

	interface ApiResponse {
		error?: string;
		[key: string]: any;
	}

	interface NameConflictResponse {
		canProceed: boolean;
		newName?: string;
	}

	interface ConflictResult {
		exists: boolean;
		conflictPath?: string;
		suggestions?: string[];
	}

	interface ExistingCategory {
		name: string;
		icon: string;
	}

	// State variables

	let data = $props<{ contentStructure: Record<string, CollectionData> }>();
	let currentConfig = $derived(data.nestedContentStructure);
	let isLoading = $state(false);
	let apiError = $state<string | null>(null);

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Modal Trigger - New Category
	function modalAddCategory(existingCategory?: ExistingCategory): void {
		const modalComponent: ModalComponent = {
			ref: ModalCategory,
			props: {
				existingCategory
			}
		};

		const modalSettings: ModalSettings = {
			type: 'component',
			title: existingCategory ? 'Edit Category' : 'Add New Category',
			body: existingCategory ? 'Modify Category Details' : 'Enter Unique Name and an Icon for your new category column',
			component: modalComponent,
			response: async (response: CategoryModalResponse | boolean) => {
				if (!response || typeof response === 'boolean') return;

				try {
					if (existingCategory) {
						await updateExistingCategory(existingCategory, response);
					} else {
						await addNewCategory(response);
					}
				} catch (error) {
					console.error('Error handling modal response:', error);
					showToast('Error updating categories', 'error');
				}
			}
		};

		modalStore.trigger(modalSettings);
	}

	async function updateExistingCategory(existingCategory: ExistingCategory, response: CategoryModalResponse): Promise<void> {
		const newConfig = { ...currentConfig };
		Object.entries(newConfig).forEach(([_, category]) => {
			if (category.name === existingCategory.name) {
				category.name = response.newCategoryName;
				category.icon = response.newCategoryIcon;
			}
			// Also check subcategories
			if (category.subcategories) {
				Object.entries(category.subcategories).forEach(([_, subCategory]) => {
					if (subCategory.name === existingCategory.name) {
						subCategory.name = response.newCategoryName;
						subCategory.icon = response.newCategoryIcon;
					}
				});
			}
		});

		contentStructure.set(newConfig);
	}

	async function addNewCategory(response: CategoryModalResponse): Promise<void> {
		const newConfig = { ...currentConfig };
		const categoryKey = response.newCategoryName.toLowerCase().replace(/\s+/g, '-');
		const newCategoryId = uuidv4();

		newConfig[categoryKey] = {
			id: newCategoryId,
			name: response.newCategoryName,
			icon: response.newCategoryIcon,
			subcategories: {}
		};

		contentStructure.set(newConfig);
	}

	// Check for name conflicts before saving
	async function checkNameConflicts(name: string): Promise<NameConflictResponse> {
		const collectionsPath = 'config/collections';
		const conflict: ConflictResult = await checkCollectionNameConflict(name, collectionsPath);

		if (conflict.exists) {
			return new Promise((resolve) => {
				const modalComponent = {
					ref: ModalNameConflict,
					props: {
						conflictingName: name,
						conflictPath: conflict.conflictPath,
						suggestions: conflict.suggestions,
						onConfirm: (newName: string) => {
							modalStore.close();
							resolve({ canProceed: true, newName });
						}
					}
				};

				const modalSettings: ModalSettings = {
					type: 'component',
					component: modalComponent,
					title: 'Collection Name Conflict',
					buttonTextCancel: 'Cancel',
					buttonTextConfirm: 'Use Suggestion'
				};

				modalStore.trigger(modalSettings);
			});
		}

		return { canProceed: true };
	}

	// Handle collection save with conflict checking
	function handleSave(event: CustomEvent<{ name: string; data: Record<string, CollectionData> }>): void {
		const { name, data } = event.detail;
		const items = Object.entries(data).map(([key, item]) => ({
			...item,
			path: key,
			isCollection: false // Assuming these are categories, adjust as necessary
		}));

		checkNameConflicts(name).then(async (nameCheck) => {
			if (!nameCheck.canProceed) {
				showToast('Collection save cancelled due to name conflict', 'error');
				return;
			}

			const finalName = nameCheck.newName || name;
			try {
				isLoading = true;
				const response = await fetch('/api/content-structure', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						action: 'updateMetadata',
						items
					})
				});

				const result: ApiResponse = await response.json();

				if (response.ok) {
					showToast('Categories updated successfully', 'success');

					contentStructure.set(currentConfig);

					// Create and dispatch a proper CustomEvent
					const saveEvent = new CustomEvent('save', {
						detail: { name: finalName, data }
					});
					dispatchEvent(saveEvent);
				} else {
					throw new Error(result.error || 'Failed to update categories');
				}
			} catch (error) {
				console.error('Error saving categories:', error);
				showToast(error instanceof Error ? error.message : 'Failed to save categories', 'error');
				apiError = error instanceof Error ? error.message : 'Unknown error occurred';
			} finally {
				isLoading = false;
			}
		});
	}

	function handleAddCollectionClick(): void {
		mode.set('create');
		collectionValue.set({
			name: 'new',
			icon: '',
			description: '',
			status: 'unpublished',
			slug: '',
			fields: []
		});
		goto('/config/collectionbuilder/new');
	}

	// Show corresponding Toast messages
	function showToast(message: string, type: 'success' | 'info' | 'error' = 'info'): void {
		const backgrounds = {
			success: 'variant-filled-primary',
			info: 'variant-filled-tertiary',
			error: 'variant-filled-error'
		};
		toastStore.trigger({
			message: message,
			background: backgrounds[type],
			timeout: 3000,
			classes: 'border-1 !rounded-md'
		});
	}
</script>

<!-- Page Title with Back Button -->
<PageTitle name={m.collection_pagetitle()} icon="fluent-mdl2:build-definition" showBackButton={true} backUrl="/config" />

<div class="my-2 flex w-full justify-around gap-2 lg:ml-auto lg:mt-0 lg:w-auto lg:flex-row">
	<!-- add new Category-->
	<button
		onclick={() => modalAddCategory()}
		type="button"
		aria-label="Add New Category"
		class="variant-filled-tertiary btn flex items-center justify-between gap-1 rounded font-bold dark:variant-filled-primary"
		disabled={isLoading}
	>
		<iconify-icon icon="bi:collection" width="18" class="text-white"></iconify-icon>
		{m.collection_addcategory()}
	</button>

	<!-- add new Collection-->
	<button
		onclick={handleAddCollectionClick}
		type="button"
		aria-label="Add New Collection"
		class="variant-filled-surface btn flex items-center justify-between gap-1 rounded font-bold"
		disabled={isLoading}
	>
		<iconify-icon icon="material-symbols:category" width="18"></iconify-icon>
		{m.collection_addcollection()}
	</button>

	<button
		type="button"
		onclick={() => handleSave(new CustomEvent('save', { detail: { name: 'categories', data: currentConfig } }))}
		aria-label="Save"
		class="variant-filled-primary btn gap-2 lg:ml-4"
		disabled={isLoading}
	>
		{#if isLoading}
			<iconify-icon icon="eos-icons:loading" width="24" class="animate-spin text-white"></iconify-icon>
		{:else}
			<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
		{/if}
		{m.button_save()}
	</button>
</div>

{#if apiError}
	<div class="mb-4 rounded bg-error-500/10 p-4 text-error-500" role="alert">
		{apiError}
	</div>
{/if}

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<div class="wrapper mb-2">
		<p class="mb-4 text-center dark:text-primary-500">{m.collection_text_description()}</p>

		<!-- display collections -->
		<Board contentNodes={contentStructure.value} onEditCategory={modalAddCategory} />
	</div>
</div>
