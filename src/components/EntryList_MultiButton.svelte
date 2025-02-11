<!--
@files src/components/EntryList_MultiButton.svelte
@component
**EntryList_MultiButton component for creating, publishing, unpublishing, scheduling, cloning, deleting and testing entries.**

```tsx
<EntryList_MultiButton />
```

#### Props
- `isCollectionEmpty` {boolean} - Boolean value indicating whether the collection is empty
- `on:create` {function} - Function to call when the create button is clicked
- `on:publish` {function} - Function to call when the publish button is clicked
- `on:unpublish` {function} - Function to call when the unpublish button is clicked
- `on:schedule` {function} - Function to call when the schedule button is clicked
- `on:clone` {function} - Function to call when the clone button is clicked
- `on:delete` {function} - Function to call when the delete button is clicked
- `on:test` {function} - Function to call when the test button is clicked
-->

<script lang="ts">
	// Stores
	import { storeListboxValue } from '@stores/store.svelte';
	import { mode, modifyEntry } from '@src/stores/collectionStore.svelte';
	import { handleSidebarToggle } from '@src/stores/sidebarStore.svelte';

	// Components
	import ScheduleModal from './ScheduleModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';

	type ActionType = 'create' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'delete' | 'test';
	type ModifyType = 'published' | 'unpublished' | 'scheduled' | 'cloned' | 'deleted' | 'testing';

	interface Props {
		isCollectionEmpty?: boolean;
		'on:create'?: () => void;
		'on:publish'?: () => void;
		'on:unpublish'?: () => void;
		'on:schedule'?: () => void;
		'on:clone'?: () => void;
		'on:delete'?: () => void;
		'on:test'?: () => void;
	}

	// Props
	let {
		isCollectionEmpty = false,
		'on:create': onCreate = () => {},
		'on:publish': onPublish = () => {},
		'on:unpublish': onUnpublish = () => {},
		'on:schedule': onSchedule = () => {},
		'on:clone': onClone = () => {},
		'on:delete': onDelete = () => {},
		'on:test': onTest = () => {}
	}: Props = $props();

	const modalStore = getModalStore();

	// States
	let dropdownOpen = $state(false);
	let actionName = $state('');
	let buttonClass = $state('');
	let iconValue = $state('');

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
			response: (r: boolean) => {
				if (r) console.log('Scheduling successful');
			}
		};
		modalStore.trigger(modalSettings);
	}

	function handleButtonClick(event: Event) {
		event.preventDefault();

		if (!modifyEntry.value) return;

		switch (storeListboxValue.value) {
			case 'create':
				mode.set('create');
				handleSidebarToggle();
				onCreate();
				break;
			case 'publish':
				mode.set('view');
				modifyEntry.value('published');
				onPublish();
				break;
			case 'unpublish':
				mode.set('view');
				modifyEntry.value('unpublished');
				onUnpublish();
				break;
			case 'schedule':
				mode.set('view');
				modifyEntry.value('scheduled');
				onSchedule();
				break;
			case 'clone':
				mode.set('view');
				modifyEntry.value('cloned');
				onClone();
				break;
			case 'delete':
				mode.set('view');
				modifyEntry.value('deleted');
				onDelete();
				break;
			case 'test':
				mode.set('view');
				modifyEntry.value('testing');
				onTest();
				break;
			default:
				break;
		}

		dropdownOpen = false;
	}

	// handleOptionClick for Button Dropdown
	function handleOptionClick(event: Event, value: ActionType): void {
		event.preventDefault();
		storeListboxValue.set(value);
		dropdownOpen = false;
	}

	const buttonMap: Record<ActionType, [string, string, string, string]> = {
		create: [m.entrylist_multibutton_create(), 'gradient-tertiary', 'ic:round-plus', 'text-tertiary-500'],
		publish: [m.entrylist_multibutton_publish(), 'gradient-primary', 'bi:hand-thumbs-up-fill', 'text-primary-500'],
		unpublish: [m.entrylist_multibutton_unpublish(), 'gradient-yellow', 'bi:pause-circle', 'text-yellow-500'],
		schedule: [m.entrylist_multibutton_schedule(), 'gradient-pink', 'bi:clock', 'text-pink-500'],
		clone: [m.entrylist_multibutton_clone(), 'gradient-secondary', 'bi:clipboard-data-fill', 'text-secondary-500'],
		delete: [m.button_delete(), 'gradient-error', 'bi:trash3-fill', 'text-error-500'],
		test: [m.entrylist_multibutton_testing(), 'gradient-error', 'icon-park-outline:preview-open', 'text-error-500']
	};

	// Update button display when storeListboxValue changes using root effect
	$effect(() => {
		let [action, buttonStyle, icon] = buttonMap[storeListboxValue.value as ActionType] || ['', '', '', ''];
		actionName = action;
		iconValue = icon;
		buttonClass = `btn ${buttonStyle} rounded-none w-36 justify-between`;
	});

	// Handle empty collection state using root effect
	$effect.root(() => {
		if (isCollectionEmpty && storeListboxValue.value !== 'create') {
			storeListboxValue.set('create');
		}
	});
</script>

<!-- Multibutton group-->
<div class="relative z-20 mt-1 font-medium text-white">
	<div class="variant-filled-token btn-group flex overflow-hidden rounded-l-full rounded-r-md rtl:rounded rtl:rounded-r-full">
		<!-- Left button -->
		<button type="button" class={`w-[60px] md:w-auto rtl:rotate-180 ${buttonClass} rounded-l-full`} onclick={handleButtonClick}>
			<span class="grid grid-cols-[24px_auto] items-center gap-2 rtl:rotate-180">
				<iconify-icon icon={iconValue} width="24" class="text-white"></iconify-icon>
				<span class="hidden text-left md:block">{actionName}</span>
			</span>
		</button>

		<!-- White line -->
		<div class="border-l-[3px] border-white"></div>

		<!-- Dropdown button -->
		<button
			type="button"
			class="flex w-[42px] items-center justify-center rounded-r-md bg-surface-400 dark:bg-surface-600"
			aria-label="Toggle dropdown"
			onclick={(e) => {
				e.preventDefault();
				dropdownOpen = !dropdownOpen;
			}}
		>
			<iconify-icon icon="mdi:chevron-down" width="24" class="text-white"></iconify-icon>
		</button>
	</div>

	{#if dropdownOpen}
		<ul
			class="drops absolute right-2 top-full z-50 mt-1 max-h-[300px] divide-y divide-white overflow-y-auto rounded bg-surface-400 dark:bg-surface-700 rtl:left-2 rtl:right-auto"
		>
			{#each Object.entries(buttonMap) as [type, [label, gradient, icon]]}
				{#if storeListboxValue.value !== type}
					<li class={`hover:text-white gradient-${gradient}-hover gradient-${gradient}-focus`}>
						<button
							type="button"
							onclick={(e) => handleOptionClick(e, type as ActionType)}
							aria-label={label}
							class={`btn flex w-full justify-between gap-2 gradient-${gradient} ${gradient}-hover ${gradient}-focus`}
						>
							<iconify-icon {icon} width="24" class=""></iconify-icon>
							<p class="w-full">{label}</p>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</div>
