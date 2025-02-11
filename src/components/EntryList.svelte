<!--
@file:  src/components/EntryList.svelte
@component
**EntryList component to display collections data.**

```tsx
<EntryList />
```

#### Props
- `collection` - The collection object to display data from.
- `mode` - The current mode of the component. Can be 'view', 'edit', 'create', 'delete', 'modify', or 'media'.

Features:
- Search
- Pagination
- Multi-select
- Sorting
- Status
- Icons
- Filter
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';

	// Utils
	import { debounce, getFieldName, meta_data } from '@utils/utils';
	import { deleteData, getData, setStatus } from '@utils/data';

	// Stores
	import { contentLanguage, systemLanguage } from '@stores/store.svelte';
	import { mode, collectionValue, modifyEntry, statusMap, collection, contentStructure } from '@src/stores/collectionStore.svelte';
	import { handleSidebarToggle, sidebarState, toggleSidebar } from '@src/stores/sidebarStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import EntryListMultiButton from './EntryList_MultiButton.svelte';
	import TranslationStatus from '@components/TranslationStatus.svelte';
	import TableIcons from '@components/system/table/TableIcons.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import TablePagination from '@components/system/table/TablePagination.svelte';
	import Status from '@components/system/table/Status.svelte';
	import Loading from './Loading.svelte';

	// Skeleton
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Svelte-dnd-action
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import { v4 as uuidv4 } from 'uuid';

	const flipDurationMs = 300;

	// DND event handlers with proper types
	function handleDndConsider(event: CustomEvent<{ items: { label: string; name: string; id: string; visible: boolean }[] }>) {
		displayTableHeaders = event.detail.items;
	}
	function handleDndFinalize(event: CustomEvent<{ items: { label: string; name: string; id: string; visible: boolean }[] }>) {
		displayTableHeaders = event.detail.items;
	}
	let isLoading = $state(false);
	let loadingTimer: any; // recommended time of around 200-300ms
	// Buttons
	let globalSearchValue = $state('');
	let expand = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	// Retrieve entryListPaginationSettings from local storage or set default values for each collection
	const entryListPaginationSettingsKey = `entryListPaginationSettings_${String(collection.value?.id)}`;
	let entryListPaginationSettings: any =
		browser && localStorage.getItem(entryListPaginationSettingsKey)
			? JSON.parse(localStorage.getItem(entryListPaginationSettingsKey) as string)
			: {
					collectionId: collection.value?.id,
					density: 'normal',
					sorting: { sortedBy: '', isSorted: 0 },
					currentPage: 1,
					rowsPerPage: 10,
					filters: {},
					displayTableHeaders: []
				};

	// Initialize displayTableHeaders with proper typing
	interface TableHeader {
		label: string;
		name: string;
		id: string;
		visible: boolean;
	}
	let displayTableHeaders = $state<TableHeader[]>(
		entryListPaginationSettings?.displayTableHeaders?.length > 0 ? entryListPaginationSettings.displayTableHeaders : []
	);
	let density = $state<string>(entryListPaginationSettings?.density || 'normal');
	let selectAllColumns = $state(true);
	let data = $state<{ entryList: any[]; pagesCount: number } | undefined>(undefined);
	let tableHeaders = $state<{ label: string; name: string; id: string; visible: boolean }[]>([]);
	let tableData = $state<any[]>([]);
	// Tick row logic
	let SelectAll = $state(false);
	const selectedMap: { [key: string]: boolean } = $state({});
	// Filter and debounce
	let filters = $state<{ [key: string]: string }>(entryListPaginationSettings.filters || {});
	const waitFilter = debounce(300); // Debounce filter function for 300ms
	// Sorting initialization
	let sorting = $state<{ sortedBy: string; isSorted: 0 | 1 | -1 }>({
		sortedBy: '',
		isSorted: 1
	});
	$effect(() => {
		if (tableData.length > 0) {
			sorting.sortedBy = Object.keys(tableData[0])[0];
		}
	});
	// Pagination
	let pagesCount = $state<number>(entryListPaginationSettings.pagesCount || 1); // Initialize pagesCount
	let currentPage = $state<number>(entryListPaginationSettings.currentPage || 1); // Set initial currentPage value
	let rowsPerPage = $state<number>(entryListPaginationSettings.rowsPerPage || 10); // Set initial rowsPerPage value
	let totalItems = $state<number>(0); // Initialize totalItems
	// Declare isFirstPage and isLastPage variables
	let isFirstPage: boolean;
	let isLastPage: boolean;
	// Derived stores for reactive values
	const currentLanguage = $derived(contentLanguage.value);
	const currentSystemLanguage = $derived(systemLanguage.value);
	const currentMode = $derived(mode.value);
	const currentCollection = $derived(collection.value);
	const currentScreenSize = $derived(screenSize.value);

	// This function refreshes the data displayed in a table by fetching new data from an API endpoint and updating the tableData and options variables.
	async function refreshTableData(fetch = true) {
		// Clear loading timer
		if (loadingTimer) {
			clearTimeout(loadingTimer);
		}
		// If the collection id is empty, return
		if (!currentCollection?._id) return;
		// If fetch is true, set isLoading to true
		if (fetch) {
			// Set loading to true
			loadingTimer = setTimeout(() => {
				isLoading = true;
			}, 400);
			// Fetch data using getData function
			try {
				data = await getData({
					collectionId: currentCollection?._id as string,
					page: currentPage,
					limit: rowsPerPage,
					contentLanguage: currentLanguage,
					filter: JSON.stringify(filters),
					sort: JSON.stringify(
						sorting.isSorted
							? {
									[sorting.sortedBy]: sorting.isSorted
								}
							: {}
					)
				});
				// Set loading to false
				isLoading = false;
				clearTimeout(loadingTimer);
			} catch (error) {
				const err = error as Error;
				console.log(`'Error fetching data: ${err.message}`);
				isLoading = false;
				clearTimeout(loadingTimer);
				return;
			}
		}
		// Update tableData and options
		if (data && data.entryList && Array.isArray(data.entryList)) {
			tableData = await Promise.all(
				data.entryList.map(async (entry) => {
					const obj: { [key: string]: any } = {};
					for (const field of currentCollection.fields) {
						if (field.callback && typeof field.callback === 'function') {
							field.callback({ data });
							handleSidebarToggle();
						}
						// Status
						obj.status = entry.status ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1) : 'N/A';
						// Collection fields
						if (field.display) {
							obj[field.label] = await field.display({
								data: entry[getFieldName(field)],
								collection: (currentCollection?.id ?? '').toString(),
								field,
								entry,
								contentLanguage: currentLanguage
							});
						}
					}
					// Add createdAt and updatedAt properties localized to the system language
					obj.createdAt = entry.createdAt ? new Date(Number(entry.createdAt) * 1000).toLocaleString(currentSystemLanguage) : 'N/A';
					obj.updatedAt = entry.updatedAt ? new Date(Number(entry.updatedAt) * 1000).toLocaleString(currentSystemLanguage) : 'N/A';
					obj._id = entry._id;
					return obj;
				})
			);
		}

		// For rendering Table data
		tableHeaders =
			currentCollection?.fields.map((field) => ({
				id: uuidv4(),
				label: field.label,
				name: getFieldName(field),
				visible: true
			})) ?? [];
		tableHeaders.push(
			{ label: 'createdAt', name: 'createdAt', id: uuidv4(), visible: true },
			{ label: 'updatedAt', name: 'updatedAt', id: uuidv4(), visible: true },
			{ label: 'status', name: 'status', id: uuidv4(), visible: true }
		);

		// Update displayTableHeaders based on entryListPaginationSettings
		if (entryListPaginationSettings.displayTableHeaders.length > 0) {
			displayTableHeaders = entryListPaginationSettings.displayTableHeaders.map((header: TableHeader) => ({
				...header,
				id: uuidv4() // Add unique id for each header (optional)
			}));
		} else if (tableHeaders.length > 0) {
			// If no saved settings, use tableHeaders with initial visibility
			displayTableHeaders = tableHeaders.map((header) => ({
				...header,
				visible: true, // Assuming all columns are initially visible
				id: uuidv4() // Add unique id for each header (optional)
			}));
		}
		SelectAll = false;
		// Update pagesCount after fetching data
		pagesCount = data?.pagesCount || 1;
		// Update isFirstPage and isLastPage based on currentPage and pagesCount
		isFirstPage = currentPage === 1;
		isLastPage = currentPage === pagesCount;
		// Adjust currentPage to the last page if it exceeds the new total pages count after changing the rows per page.
		if (currentPage > (data?.pagesCount || 0)) {
			currentPage = data?.pagesCount || 1;
		}
	}
	// React to changes in density setting and update local storage for each collection
	$effect(() => {
		entryListPaginationSettings = {
			...entryListPaginationSettings,
			collectionId: currentCollection?.id,
			filters,
			sorting,
			density,
			currentPage,
			rowsPerPage,
			displayTableHeaders
		};
		browser && localStorage.setItem(entryListPaginationSettingsKey, JSON.stringify(entryListPaginationSettings));
	});
	// Trigger refreshTableData based on collection, filters, sorting, and currentPage
	$effect(() => {
		if (currentCollection) refreshTableData();
	});
	// Trigger refreshTableData when contentLanguage changes, but don't fetch data
	$effect(() => {
		// refreshTableData(false);
		filters = {};
	});
	// Reset currentPage to 1 when the collection changes
	$effect(() => {
		if (currentCollection) {
			currentPage = 1;
		}
	});
	// Reset collectionValue when mode changes
	$effect(() => {
		if (currentMode === 'view') {
			untrack(() => {
				meta_data.clear();
				collectionValue.set({});
			});
		}
	});
	// Tick All Rows
	function process_selectAll(selectAll: boolean) {
		if (selectAll) {
			// Iterate only over visible entries
			tableData.forEach((_entry, index) => {
				selectedMap[index] = true;
			});
		} else {
			// Clear all selections
			Object.keys(selectedMap).forEach((key) => {
				selectedMap[key] = false;
			});
		}
	}

	// Update Tick All Rows
	$effect(() => {
		process_selectAll(SelectAll);
	});
	// Update Tick Single Row
	$effect(() => {
		Object.values(selectedMap).includes(true) ? mode.set('modify') : mode.set('view');
	});
	// Tick Row - modify STATUS of an Entry
	modifyEntry.set(async (status?: keyof typeof statusMap): Promise<void> => {
		if (!status) return Promise.resolve();
		// Initialize an array to store the IDs of the items to be modified
		const modifyList: Array<string> = [];
		// Loop over the selectedMap object
		for (const [index, isSelected] of Object.entries(selectedMap)) {
			// If the item is ticked, add its ID to the modifyList
			isSelected && modifyList.push(tableData[Number(index)]._id);
		}
		// If no rows are selected, return
		if (modifyList.length === 0) return Promise.resolve();
		// Function to handle confirmation modal response
		const handleConfirmation = async (confirm: boolean) => {
			if (!confirm) return;
			// Initialize a new FormData object
			const formData = new FormData();
			// Append the IDs of the items to be modified to formData
			formData.append('ids', JSON.stringify(modifyList));
			// Append the status to formData
			formData.append('status', statusMap[status]);
			try {
				// Call the appropriate API endpoint based on the status
				switch (status) {
					case 'deleted':
						// If the status is 'deleted', call the delete endpoint
						await deleteData({ data: formData, collectionId: currentCollection?._id as string });
						break;
					case 'published':
					case 'unpublished':
					case 'testing':
						// If the status is 'testing', call the publish endpoint
						await setStatus({ data: formData, collectionId: currentCollection?._id as string });
						break;
					case 'cloned':
					case 'scheduled':
						// Trigger a toast message indicating that the feature is not yet implemented
						toastStore.trigger({
							message: 'Feature not yet implemented.',
							background: 'variant-filled-error',
							timeout: 3000
						});
						break;
				}
				// Refresh the collection
				refreshTableData();
				// Set the mode to 'view'
				mode.set('view');
			} catch (error) {
				const err = error as Error;
				console.log(`'Error : ${err.message}`);
			}
		};
		// If more than one row is selected or the status is 'delete', show confirmation modal
		if (modifyList.length > 1 || status === 'deleted') {
			const modalData: ModalSettings = {
				type: 'confirm',
				title: m.entrylist_title(),
				body: m.entrylist_body({
					status: `<span class="text-text-tertiary-500 dark:text-primary-500">${status.charAt(0).toUpperCase()}${status.slice(1)}</span>`
				}),
				buttonTextCancel: m.button_cancel(),
				buttonTextConfirm: m.button_confirm(),
				response: handleConfirmation
			};
			modalStore.trigger(modalData); // Trigger the confirmation modal
		} else {
			// If only one row is selected and status is not 'delete', directly proceed with modification
			handleConfirmation(true);
		}
	});

	let categoryName = $derived.by(() => {
		if (!currentCollection?._id || !contentStructure.value) return '';

		// Helper function to find parent category name
		return currentCollection.path?.split('/').filter(Boolean).join(' >');
	});

	let isCollectionEmpty = $derived(tableData.length === 0);
</script>

<!--Table -->
{#if isLoading}
	<Loading />
{:else}
	<!-- Header -->
	<div class="mb-2 flex justify-between dark:text-white">
		<!-- Row 1 for Mobile -->
		<div class="flex items-center justify-between">
			<!-- Hamburger -->
			{#if sidebarState.sidebar.value.left === 'hidden'}
				<button
					type="button"
					onkeydown={() => {}}
					onclick={() => toggleSidebar('left', currentScreenSize === 'lg' ? 'full' : 'collapsed')}
					aria-label="Open Sidebar"
					class="variant-ghost-surface btn-icon mt-1"
				>
					<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
				</button>
			{/if}
			<!-- Collection type with icon -->
			<!-- TODO: Translate Collection Name -->
			<div class="mr-1 flex flex-col {!sidebarState.sidebar.value.left ? 'ml-2' : 'ml-1 sm:ml-2'}">
				{#if categoryName}<div class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300 rtl:text-left">
						{categoryName}
					</div>
				{/if}
				<div class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-2xl lg:text-xl">
					{#if currentCollection?.icon}<span>
							<iconify-icon icon={currentCollection.icon} width="24" class="mr-1 text-error-500 sm:mr-2"></iconify-icon></span
						>
					{/if}
					{#if currentCollection?.name}
						<div class="flex max-w-[65px] whitespace-normal leading-3 sm:mr-2 sm:max-w-none md:mt-0 md:leading-none xs:mt-1">
							{currentCollection.name}
						</div>
					{/if}
				</div>
			</div>
		</div>
		<div class="flex items-center justify-between gap-1">
			<!-- Expand/Collapse -->
			<button
				type="button"
				onkeydown={() => {}}
				onclick={() => (expand = !expand)}
				class="variant-ghost-surface btn-icon sm:hidden"
				aria-label="Expand/Collapse"
			>
				<iconify-icon icon="material-symbols:filter-list-rounded" width="30"> </iconify-icon>
			</button>
			<!-- Translation Content Language -->
			<div class="mt-1 sm:hidden">
				<TranslationStatus />
			</div>

			<!-- Table Filter with Translation Content Language -->
			<div class="relative mt-1 hidden items-center justify-center gap-2 sm:flex">
				<TableFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density />
				<TranslationStatus />
			</div>

			<!-- MultiButton -->
			<div class="mt-2 w-full sm:mt-0 sm:w-auto">
				<EntryListMultiButton {isCollectionEmpty} />
			</div>
		</div>
	</div>
	<!-- Table -->
	{#if tableData.length > 0}
		{#if expand}
			<div class="mb-2 flex items-center justify-center">
				<TableFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density />
			</div>
		{/if}
		{#if columnShow}
			<!-- Column order -->
			<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
				<div class="text-white dark:text-primary-500">
					{m.entrylist_dnd()}
				</div>
				<!-- Select All Columns -->
				<div class="my-2 flex w-full items-center justify-center gap-1">
					<div class="flex- items-center justify-between">
						<label class="mr-2">
							<input
								type="checkbox"
								bind:checked={selectAllColumns}
								onchange={() => {
									// Check if all columns are currently visible
									const allColumnsVisible = displayTableHeaders.every((header) => header.visible);

									// Toggle visibility of all columns based on the current state of selectAllColumns
									displayTableHeaders = displayTableHeaders.map((header) => ({
										...header,
										visible: !allColumnsVisible
									}));

									// Update selectAllColumns based on the new visibility state of all columns
									selectAllColumns = !allColumnsVisible;
								}}
							/>
							{m.entrylist_all()}
						</label>

						<!-- Clear local storage and reload tableHeader -->
						<button
							class="btn"
							onclick={() => {
								// Remove the entryListPaginationSettings from local storage
								localStorage.removeItem(entryListPaginationSettingsKey);

								// Reset the entryListPaginationSettings to the default state
								entryListPaginationSettings = {
									collectionId: collection.value?.id,
									density: 'normal',
									sorting: { sortedBy: '', isSorted: 0 },
									currentPage: 1,
									rowsPerPage: 10,
									filters: {},
									displayTableHeaders: []
								};

								// Reset displayTableHeaders to an empty array
								displayTableHeaders = [];

								// Reset selectAllColumns to true
								selectAllColumns = true;

								// Refresh the table data
								refreshTableData();
							}}
						>
							<iconify-icon icon="material-symbols-light:device-reset" width="30" class="text-tertiary-500"></iconify-icon>
							Reset
						</button>
					</div>

					<section
						use:dndzone={{
							items: displayTableHeaders,
							flipDurationMs
						}}
						onconsider={handleDndConsider}
						onfinalize={handleDndFinalize}
						class="flex flex-wrap justify-center gap-1 rounded-md p-2"
					>
						{#each displayTableHeaders as header (header.id)}
							<button
								class="chip {header.visible ? 'variant-filled-secondary' : 'variant-ghost-secondary'} w-100 mr-2 flex items-center justify-center"
								animate:flip={{ duration: flipDurationMs }}
								onclick={() => {
									// Toggle the visibility of the header
									header.visible = !header.visible;

									// Check if all columns are currently visible
									const allColumnsVisible = displayTableHeaders.every((header) => header.visible);

									// Update selectAllColumns based on the visibility of all columns
									selectAllColumns = allColumnsVisible;
								}}
							>
								{#if header.visible}
									<span><iconify-icon icon="fa:check"></iconify-icon></span>
								{/if}
								<span class="ml-2 capitalize">{header.name}</span>
							</button>
						{/each}
					</section>
				</div>
			</div>
		{/if}
		<div class="table-container max-h-[calc(100dvh-120px)] overflow-auto">
			<table class="table table-interactive table-hover {density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}">
				<!-- Table Header -->
				<thead class="text-tertiary-500 dark:text-primary-500">
					{#if filterShow}
						<tr class="divide-x divide-surface-400">
							<th>
								<!-- Clear All Filters Button -->
								{#if Object.keys(filters).length > 0}
									<button
										onclick={() => {
											// Clear all filters
											filters = {};
										}}
										aria-label="Clear All Filters"
										class="variant-outline btn-icon"
									>
										<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
									</button>
								{/if}
							</th>
							<!-- Filter -->
							{#each tableHeaders as header}
								<th>
									<div class="flex items-center justify-between">
										<FloatingInput
											type="text"
											icon="material-symbols:search-rounded"
											label={m.entrylist_filter()}
											name={header.name}
											onInput={(value: string) => {
												if (value) {
													waitFilter(() => {
														filters[header.name] = value;
													});
												} else {
													delete filters[header.name];
													filters = filters;
												}
											}}
										/>
									</div>
								</th>
							{/each}
						</tr>
					{/if}
					<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
						<TableIcons
							checked={SelectAll}
							onCheck={(checked) => {
								SelectAll = checked;
								tableData.forEach((_, index) => {
									selectedMap[index] = checked;
								});
							}}
						/>
						{#each displayTableHeaders.filter((header) => header.visible) as header}
							<th
								onclick={() => {
									//sorting
									sorting = {
										sortedBy: header.name,
										isSorted: (() => {
											if (header.name !== sorting.sortedBy) {
												return 1;
											}
											if (sorting.isSorted === 0) {
												return 1;
											} else if (sorting.isSorted === 1) {
												return -1;
											} else {
												return 0;
											}
										})()
									};
								}}
							>
								<div class="relative flex items-center justify-center text-center">
									<!-- TODO: fix if content is translated -->
									{#if data?.entryList[0]?.translated}
										<iconify-icon icon="bi:translate" width="14" class="absolute right-0 top-0 text-sm text-white"></iconify-icon>
										{header.label}
									{:else}
										{header.label}
									{/if}
									<iconify-icon
										icon="material-symbols:arrow-upward-rounded"
										width="22"
										class="origin-center duration-300 ease-in-out"
										class:up={sorting.isSorted === 1}
										class:invisible={sorting.isSorted == 0 || sorting.sortedBy != header.name}
									></iconify-icon>
								</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each tableData as row, index}
						<tr class="divide-x divide-surface-400">
							<TableIcons
								checked={selectedMap[index] ?? false}
								onCheck={(checked) => {
									selectedMap[index] = checked;
								}}
							/>
							{#each displayTableHeaders.filter((header) => header.visible) as header}
								<td
									onclick={() => {
										collectionValue.set(data?.entryList[index]);
										console.debug('Edit datas: ', `${JSON.stringify(data?.entryList[index])}`);
										mode.set('edit');
										handleSidebarToggle();
									}}
									class="text-center font-bold"
								>
									{#if header.name === 'status'}
										<!-- Use the Status component to display the Status -->
										<Status value={row['status']} />
									{:else}
										{row[header.name]}
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<!-- Pagination -->
		<div class="sticky bottom-0 left-0 right-0 mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">
			<TablePagination
				{currentPage}
				{pagesCount}
				{rowsPerPage}
				rowsPerPageOptions={[5, 10, 25, 50, 100, 500]}
				{totalItems}
				onUpdatePage={(page) => {
					currentPage = page;
					refreshTableData(true);
				}}
				onUpdateRowsPerPage={(rows) => {
					rowsPerPage = rows;
					currentPage = 1;
					refreshTableData(true);
				}}
			/>
		</div>
	{:else}
		<!-- Display a message when no data is yet available -->
		<div class="text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon>
			<p class="text-lg">
				{m.EntryList_no_collection({ name: currentCollection?.name as string })}
			</p>
		</div>
	{/if}
{/if}

<style lang="postcss">
	.up {
		transform: rotate(-180deg);
	}
	div::-webkit-scrollbar-thumb {
		border-radius: 50px;
		background-color: #0ec423;
	}
	div::-webkit-scrollbar {
		width: 10px;
	}
</style>
