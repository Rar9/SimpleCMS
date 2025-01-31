<!--
@file: /src/components/Dropdown.svelte
@component: 
**Dropdown component that allows selection from a list of items. It supports custom styling, item modification, and an optional icon.**
-->

<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	// Define props using $props
	let {
		items, // Array of selectable items
		selected = items[0], // Currently selected item, default to first item
		label = '', // Optional label for the dropdown
		modifier = (input: any) => input, // Function to modify how items are displayed
		icon = undefined, // Optional icon for the dropdown
		ariaLabel = 'Select an option',
		class: className = '', // Custom class for the dropdown container
		dropdownId = 'dropdown-' + Math.random().toString(36).substr(2, 9) // Unique ID for a11y
	} = $props<{
		items: any[];
		selected?: any;
		label?: string;
		modifier?: (input: any) => any;
		icon?: string | undefined;
		class?: string;
		ariaLabel?: string;
		dropdownId?: string;
	}>();

	// State for dropdown expansion and selected item
	let expanded = $state(false);
	let currentSelected = $state(selected);

	// Derived state for filtered items
	let filteredItems = $derived(items.filter((item) => item !== currentSelected));

	// Toggle dropdown expansion
	function toggleExpanded() {
		expanded = !expanded;
	}

	// Handle item selection
	function selectItem(item: any) {
		currentSelected = item;
		expanded = false;
	}

	// Effect to update currentSelected when the selected prop changes
	$effect(() => {
		currentSelected = selected;
	});
</script>

<!-- Dropdown container -->
<div class={twMerge('overflow-hidden bg-surface-500', className)}>
	<!-- Dropdown button -->
	<button
		onclick={toggleExpanded}
		class="variant-filled-tertiary btn dark:variant-ghost-primary"
		aria-label="Toggle Dropdown"
		class:selected={expanded}
	>
		{currentSelected || label}
	</button>
</div>

<!-- Dropdown content -->
{#if expanded}
	<!-- Dropdown header -->
	<div class="mb-3 border-b text-center text-tertiary-500 dark:text-primary-500">Choose your Widget</div>

	<!-- Dropdown items -->
	<div class="flex flex-wrap items-center justify-center gap-2">
		{#each filteredItems as item}
			<button
				onclick={() => selectItem(item)}
				class="variant-filled-warning btn relative hover:variant-filled-secondary dark:variant-outline-warning"
				aria-label={modifier(item)}
			>
				<span class="text-surface-700 dark:text-white">{modifier(item)}</span>
			</button>
		{/each}
	</div>
{/if}
