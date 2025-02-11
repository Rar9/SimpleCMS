<!--
@file src/components/SearchComponent.svelte
@component
**Search Component for Svelte CMS**

Features:
- Fuzzy search with optimized edit distance calculation
- Real-time search results with debounced input
- Keyboard navigation support
- Responsive design
- Enhanced accessibility
- Performance optimized state management
-->

<script lang="ts">
  import { goto } from '$app/navigation';
  import { getEditDistance } from '@utils/utils';
  import { onMount } from 'svelte';

  // Component
  import HighlightedText from './HighlightedText.svelte';

  // Stores
  import { isSearchVisible, globalSearchIndex, triggerActionStore } from '@utils/globalSearchIndex';

  // Types
  interface Trigger {
  path: string;
  action?: (() => void | Promise < void > )[];
  }

  interface SearchResult {
  title: string;
  description: string;
  keywords: string[];
  triggers: Record < string, Trigger >;
  distance?: number;
  }

  // States
  let searchResults: SearchResult[] = $state([]);
  import { createEventDispatcher } from 'svelte';

  let {
  value = '',
  placeholder = 'Search...',
  classNames = ''
  } = $props < {
  value: string;
  placeholder: string;
  classNames: string;
  } > ();

  let searchQuery = $state(value);
  let inputRef: HTMLInputElement | null = $state(null);
  let selectedIndex = $state(-1); // Track the currently selected result

  const dispatch = createEventDispatcher();

  // Update the parent component's state when the search term changes
  $effect(() => {
  dispatch('search', { value: searchQuery });
  });

  // Update internal state when the external value prop changes
  $effect(() => {
  searchQuery = value;
  });

  // Debounce function for search optimization
  function debounce < T extends (...args: any[]) => void > (fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType < typeof setTimeout >;
  return (...args: Parameters<T>) => {
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => fn(...args), delay);
  };
  }

  // Optimized fuzzy search with debouncing
  const debouncedFuzzySearch = debounce(async (query: string) => {
  // If the query is empty, clear the search results and return
  if (!query) {
  searchResults = [];
  return;
  }

  const index = $globalSearchIndex;
  const upperQuery = query.toUpperCase();

  // Optimize performance by pre-calculating query-related values
  const threshold = Math.floor(query.length * 0.9);

  // Calculate distances and filter results
  const results = index
  .map((result) => {
  // Cache uppercase title and keywords for performance
  const upperTitle = result.title.toUpperCase();
  const upperKeywords = result.keywords.map((k) => k.toUpperCase());

  // Quick exact match check before expensive edit distance calculation
  if (upperTitle === upperQuery || upperKeywords.includes(upperQuery)) {
  return { ...result, distance: 0 };
  }

  // Calculate edit distances only if necessary
  const titleDistance = getEditDistance(upperQuery, upperTitle) ?? Infinity;
  const keywordDistances = upperKeywords.map((keyword) => getEditDistance(upperQuery, keyword) ?? Infinity);

  return {
  ...result,
  distance: Math.min(titleDistance, ...keywordDistances)
  };
  })
  .filter((result) => {
  const upperTitle = result.title.toUpperCase();
  return (
  result.distance <= threshold ||
  upperTitle.includes(upperQuery) ||
  result.keywords.some((keyword) => keyword.toUpperCase().includes(upperQuery))
  );
  })
  .sort((a, b) => a.distance - b.distance);

  // Update state with top 5 results
  searchResults = results.slice(0, 5);
  selectedIndex = -1; // Reset selection when results change
  }, 150); // 150ms debounce delay for optimal performance

  function handleResultClick(result: SearchResult, triggerKey: string, event?: MouseEvent) {
  if (event) {
  event.stopPropagation();
  }

  const trigger = result.triggers[triggerKey] as Trigger;

  if (trigger) {
  const { path, action } = trigger;

  // Navigate if path is different
  if (window.location.pathname !== path) {
  goto(path);
  }

  // Handle actions if present
  if (action) {
  triggerActionStore.set(action);
  }
  }

  isSearchVisible.set(false);
  }

  // Keyboard navigation handler
  function onKeyDown(event: KeyboardEvent) {
  switch (event.key) {
  case 'Escape':
    if ($isSearchVisible) {
    event.preventDefault();
    isSearchVisible.set(false);
    }
    break;
  case 'ArrowDown':
  case 'ArrowUp':
    event.preventDefault();
    if (searchResults.length > 0) {
    const direction = event.key === 'ArrowDown' ? 1: -1;
    selectedIndex = (selectedIndex + direction + searchResults.length) % searchResults.length;
    }
    break;
  case 'Enter':
    if (selectedIndex >= 0 && searchResults[selectedIndex]) {
    event.preventDefault();
    const result = searchResults[selectedIndex];
    handleResultClick(result, Object.keys(result.triggers)[0]);
    }
    break;
  }
  }

  // Close search on outside click
  function handleClickOutside(event: MouseEvent) {
  if ($isSearchVisible && event.target && !(event.target as Element).closest('.search-component')) {
  isSearchVisible.set(false);
  }
  }

  onMount(() => {
  if (inputRef) inputRef.focus();
  document.addEventListener('click', handleClickOutside);
  return () => document.removeEventListener('click', handleClickOutside);
  });
</script>

{#if $isSearchVisible}
<div
  class="search-component fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/50 backdrop-blur-sm"
  role="dialog"
  aria-label="Global Search"
  >
  <!-- Search input -->
  <input
  bind:this={inputRef}
  {placeholder}
  oninput={() => debouncedFuzzySearch(searchQuery)}
  onkeydown={onKeyDown}
  type="search"
  aria-label="Search input"
  aria-controls="search-results"
  class="input mx-2 w-full max-w-xl rounded-md border-4 !border-primary-500 px-4 py-2 {classNames}"
  bind:value={searchQuery}
  />

<!-- Search results -->
<ul
  id="search-results"
  class="mt-1 grid w-full max-w-xl overflow-auto rounded px-2 py-1 leading-loose bg-surface-active-token"
  role="listbox"
  aria-label="Search results"
  >
  {#each searchResults as result, index (result.title)}
  <li role="option" aria-selected={index === selectedIndex} class="focus-within:outline-none focus-within:ring-2 focus-within:ring-primary-500">
    {#if Object.entries(result.triggers).length === 1}
    <button
      type="button"
      class="w-full border-b text-left text-white last:border-0 last:pb-2 hover:bg-surface-400 {index === selectedIndex
      ? 'bg-surface-500': ''}"
      onclick={() => handleResultClick(result, Object.keys(result.triggers)[0])}
      aria-label={`${result.title}: ${result.description}`}
      >
      <div class="grid auto-cols-auto grid-flow-col">
      <!-- Highlighted title -->
      <span class="whitespace-nowrap font-bold text-primary-500">
      <HighlightedText text={result.title + ' : '} term={searchQuery} />
      </span>

      <!-- Highlighted description -->
      <span class="col-span-2 text-sm">
      <HighlightedText text={result.description} term={searchQuery} />
      </span>

      <!-- Path for single trigger -->
      {#each Object.entries(result.triggers) as [, trigger]}
      {#if trigger && 'path' in trigger}
      <span class="w-[50px] text-xs text-primary-500">
      {trigger.path}
      </span>
      {/if}
      {/each}
      </div>
      </button>
      {:else}
      <!-- Result header for multiple triggers -->
      <div class="border-b p-2">
      <div class="font-bold text-primary-500">
      <HighlightedText text={result.title} term={searchQuery} />
      </div>
      <div class="text-sm text-white">
      <HighlightedText text={result.description} term={searchQuery} />
      </div>
      </div>
      <!-- Multiple triggers list -->
      <div class="grid text-sm">
      {#each Object.entries(result.triggers) as [triggerKey, trigger]}
      {#if trigger && 'path' in trigger}
      <button
      type="button"
      class="flex cursor-pointer items-center justify-between px-6 py-1 text-left text-white hover:bg-surface-500"
      onclick={(e) => handleResultClick(result, triggerKey, e)}
      aria-label={`${triggerKey} - ${trigger.path}`}
      >
      <HighlightedText text={triggerKey} term={searchQuery} />
      <span class="text-xs text-primary-500">{trigger.path}</span>
      </button>
      {/if}
      {/each}
      </div>
      {/if}
      </li>
      {/each}
      </ul>
      </div>
      {/if}