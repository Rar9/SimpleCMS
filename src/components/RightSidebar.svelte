<!-- 
@file src/components/RightSidebar.svelte
@component
**RightSidebar component displaying collection fields, publish options and translation status.**

```tsx
<RightSidebar />	
```	
#### Props
- `collection` {object} - Collection object

-->

<script lang="ts">
	import { saveFormData } from '../utils/data';

	// Stores
	import { page } from '$app/stores';
	import { saveLayerStore, shouldShowNextButton, validationStore } from '@stores/store.svelte';
	import { collection, mode, modifyEntry, collectionValue } from '@src/stores/collectionStore.svelte';
	import { handleSidebarToggle } from '@src/stores/sidebarStore.svelte';
	import { convertTimestampToDateString, getFieldName, meta_data } from '@utils/utils';

	// Type definitions
	interface GetDataField {
		[key: string]: () => string | number | boolean | null | undefined;
	}

	// Get data from page store
	const { user } = $page.data;

	// Components
	import Toggles from './system/inputs/Toggles.svelte';
	import ScheduleModal from './ScheduleModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		const modalComponent: ModalComponent = {
			ref: ScheduleModal,
			slot: '<p>Edit Form</p>'
		};

		const modalSettings: ModalSettings = {
			type: 'component',
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			component: modalComponent,
			response: (r: { date: string; action: string } | boolean) => {
				if (typeof r === 'object') {
					schedule = r.date;
					if (r.action === 'schedule') {
						collectionValue.update((cv) => ({
							...cv,
							status: 'scheduled',
							_scheduled: new Date(r.date).getTime()
						}));
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	let next = $state(() => {});
	saveLayerStore.subscribe((value) => {
		next = value;
		shouldShowNextButton.set(false);
	});

	// Map the status to boolean
	let isPublished = $state(collectionValue.value?.status === 'published');
	let schedule = $state(collectionValue.value?._scheduled ? new Date(Number(collectionValue.value._scheduled)).toISOString().slice(0, 16) : '');

	// Function to toggle the status
	function toggleStatus() {
		isPublished = !isPublished;
		collectionValue.update((cv) => ({
			...cv,
			status: isPublished ? 'published' : 'unpublished',
			updatedAt: new Date()
		}));
	}

	// Convert timestamps to date strings
	let dates = $derived({
		created: convertTimestampToDateString(typeof collectionValue.value.createdAt === 'number' ? collectionValue.value.createdAt : 0),
		updated: convertTimestampToDateString(typeof collectionValue.value.updatedAt === 'number' ? collectionValue.value.updatedAt : 0)
	});

	// Type guard to check if the widget has a validateWidget method
	function hasValidateWidget(widgetInstance: any): widgetInstance is { validateWidget: () => Promise<string | null> } {
		return typeof widgetInstance?.validateWidget === 'function';
	}

	// Save form data with validation
	async function saveData() {
		let validationPassed = true;
		const getData: GetDataField = {};

		// Clear any existing meta_data
		meta_data.clear();

		// Validate all fields and collect data
		for (const field of collection.value.fields) {
			const fieldName = getFieldName(field);
			const fieldValue = collectionValue.value[fieldName] as string | number | boolean | null | undefined;

			// Use the widget property directly since it's now a widget instance
			const widgetInstance = field.widget;

			if (hasValidateWidget(widgetInstance)) {
				const error = await widgetInstance.validateWidget();
				if (error) {
					validationStore.setError(fieldName, error);
					validationPassed = false;
				} else {
					validationStore.clearError(fieldName);
					getData[fieldName] = () => fieldValue;
				}
			} else {
				getData[fieldName] = () => fieldValue;
			}
		}

		// Add system fields
		if (mode.value === 'create') {
			getData['createdAt'] = () => (dates.created ? Math.floor(new Date(dates.created).getTime() / 1000) : Math.floor(Date.now() / 1000));
			getData['updatedAt'] = getData['createdAt'];
			getData['createdBy'] = () => user?.username ?? '';
		} else {
			getData['updatedAt'] = () => Math.floor(Date.now() / 1000);
			getData['updatedBy'] = () => user?.username ?? '';
			if (dates.created) {
				getData['createdAt'] = () => Math.floor(new Date(dates.created).getTime() / 1000);
			}
		}

		// Add ID if in edit mode
		if (mode.value === 'edit' && collectionValue.value._id) {
			getData['_id'] = () => collectionValue.value._id as string;
		}

		// Add status
		getData['status'] = () => (collectionValue.value.status as string) || 'unpublished';

		// Add schedule if set
		if (schedule) {
			getData['_scheduled'] = () => new Date(schedule).getTime();
		}

		// If validation passed, save the data
		if (validationPassed) {
			try {
				console.debug('Saving data...', `${JSON.stringify({ mode: mode.value, data: getData, collection: collection.value?.name })}`);

				await saveFormData({
					data: getData,
					_collection: collection.value,
					_mode: mode.value,
					id: collectionValue.value._id as string | undefined,
					user
				});

				mode.set('view');
				handleSidebarToggle();
			} catch (err) {
				console.error('Failed to save data:', err);
			}
		}
	}
</script>

<!-- Desktop Right Sidebar -->
<!-- Check if user has create or write permission -->
{#if ['edit', 'create'].includes(mode.value) || collection.value?.permissions?.[user.role]?.write !== false}
	<div class="flex h-full w-full flex-col justify-between px-1 py-2">
		{#if $shouldShowNextButton && mode.value === 'create'}
			<button type="button" onclick={next} aria-label="Next" class="variant-filled-primary btn w-full gap-2">
				<iconify-icon icon="carbon:next-filled" width="24" class="font-extrabold text-white"></iconify-icon>
				{m.button_next()}
			</button>
		{:else}
			<header class="flex flex-col items-center justify-center gap-2">
				<!-- Save button -->
				<button
					type="button"
					onclick={saveData}
					disabled={collection.value?.permissions?.[user.role]?.write === false}
					class="variant-filled-primary btn w-full gap-2"
					aria-label="Save entry"
				>
					<iconify-icon icon="material-symbols:save" width="24" class="font-extrabold text-white"></iconify-icon>
					{m.button_save()}
				</button>

				<!-- Publish/Unpublish -->
				<div class="gradient-secondary btn w-full gap-2">
					<Toggles
						label={isPublished ? 'published' : 'unpublished'}
						labelColor={isPublished ? 'text-primary-500' : 'text-error-500'}
						iconOn="ic:baseline-check-circle"
						iconOff="material-symbols:close"
						bind:value={isPublished}
						onChange={toggleStatus}
					/>
				</div>

				{#if mode.value === 'edit'}
					<!-- Clone button -->
					<button
						type="button"
						onclick={() => $modifyEntry('cloned')}
						disabled={collection.value?.permissions?.[user.role]?.create === false && collection.value.permissions?.[user.role]?.write === false}
						class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn w-full gap-2 text-white"
						aria-label="Clone entry"
					>
						<iconify-icon icon="bi:clipboard-data-fill" width="24"></iconify-icon>Clone<span class="text-primary-500">{collection.value?.name}</span>
					</button>

					<!-- Delete button -->
					<button
						type="button"
						onclick={() => $modifyEntry('deleted')}
						disabled={collection.value?.permissions?.[user.role]?.delete === false}
						class="variant-filled-error btn w-full"
						aria-label="Delete entry"
					>
						<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>Delete
					</button>
				{/if}
			</header>

			<!-- Publish Options -->
			<main class="mt-2 flex w-full flex-col items-center justify-center gap-2 text-left dark:text-white">
				<p class="w-full border-b text-center font-bold uppercase text-tertiary-500 dark:text-primary-500">{m.siedabar_publish_options()}</p>

				<!-- Scheduled on -->
				<div class="mt-2 flex w-full flex-col items-start justify-center">
					{#if schedule}
						<p class="mb-1">{m.sidebar_will_publish_on()}</p>
					{/if}
					<button
						onclick={openScheduleModal}
						aria-label="Schedule publication"
						class="variant-filled-surface btn w-full text-tertiary-500 dark:text-primary-500"
					>
						{schedule ? new Date(schedule).toLocaleString() : 'Schedule publication'}
					</button>
				</div>

				<!-- Created At -->
				<div class="mt-2 flex w-full flex-col items-start justify-center">
					<p class="mb-1">{m.adminarea_createat()}</p>
					<input
						type="datetime-local"
						bind:value={dates.created}
						class="input variant-filled-surface text-tertiary-500 dark:text-primary-500"
						aria-label="Set creation date"
					/>
				</div>

				<!-- User Info -->
				<div class="mt-2 flex w-full flex-col items-start justify-center">
					<p class="mb-1">{m.sidebar_createdby()}:</p>
					<div class="variant-filled-surface w-full p-2 text-center text-tertiary-500 dark:text-primary-500">
						{collectionValue.value.createdBy || user.username}
					</div>

					{#if collectionValue.value.updatedBy}
						<p class="mt-1">Last updated by:</p>

						<div class="variant-filled-surface w-full p-2 text-center text-tertiary-500 dark:text-primary-500">
							{collectionValue.value.updatedBy || user.username}
						</div>
					{/if}
				</div>
			</main>

			{#if mode.value === 'create'}
				<p class="mb-2 text-center text-tertiary-500 dark:text-primary-500">
					{new Date().toLocaleString(languageTag(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
				</p>
			{:else if dates}
				<footer class="mb-1 mt-2">
					{#each Object.entries(dates) as [key, value]}
						<div class="flex items-center justify-center gap-2 text-[12px]">
							<!-- Labels -->
							<div class="capitalize">{key}:</div>
							<!-- Data -->
							<div class="font-bold text-tertiary-500 dark:text-primary-500">{value}</div>
						</div>
					{/each}
				</footer>
			{/if}
		{/if}
	</div>
{/if}
