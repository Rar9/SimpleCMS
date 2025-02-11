<!-- 
 @file src/components/TranslationStatus.svelte 
 @component
 **Translation status component for displaying translation progress per language in a progress bar with percentage.**

 ```tsx
 <TranslationStatus />	
 ```	

 ### Props:
 - `mode` {object} - The current mode object from the mode store
 - `collection` {object} - The current collection object from the collection store

 ### Features:
 - Persists translation progress through API calls
 - Displays translation progress per language in a progress bar with percentage
 - Handles language selection and translation progress updates
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { contentLanguage, translationProgress } from '@stores/store.svelte';
	import { mode } from '@src/stores/collectionStore.svelte';
	import { ProgressBar } from '@skeletonlabs/skeleton';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import type { AvailableLanguageTag } from '@src/paraglide/runtime';

	// Local state management with runes
	let isOpen = $state(false);
	let completionTotals = $state({ total: 0, translated: 0 });

	// Calculate completion totals when translation progress changes
	$effect(() => {
		const progress = translationProgress();
		if (progress.show) {
			let total = 0;
			let translated = 0;
			for (const lang of publicEnv.AVAILABLE_CONTENT_LANGUAGES) {
				const langProgress = progress[lang as AvailableLanguageTag];
				if (!langProgress) continue;
				translated += langProgress.translated.size;
				total += langProgress.total.size;
			}
			completionTotals = { total, translated };
		} else {
			completionTotals = { total: 0, translated: 0 };
		}
	});

	// Derived completion status
	let completionStatus = $derived(completionTotals.total > 0 ? Math.round((completionTotals.translated / completionTotals.total) * 100) : 0);

	// Simplified language change handler
	function handleLanguageChange(selectedLanguage: AvailableLanguageTag) {
		contentLanguage.set(selectedLanguage);
		isOpen = false;
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function getColor(value: number): string {
		if (value >= 80) return 'bg-primary-500';
		if (value >= 40) return 'bg-warning-500';
		return 'bg-error-500';
	}

	function getLanguageProgress(lang: AvailableLanguageTag): number {
		const progress = translationProgress();
		const langProgress = progress[lang];
		if (!langProgress) return 0;
		return Math.round((langProgress.translated.size / langProgress.total.size) * 100);
	}
</script>

{#if mode.value === 'edit'}
	<div class="relative mt-1 inline-block text-left">
		<div>
			<button
				type="button"
				class="inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-100"
				onclick={toggleDropdown}
			>
				{$contentLanguage.toUpperCase()}
				<iconify-icon icon="mdi:chevron-down" class="-mr-1 ml-2 h-5 w-5" aria-hidden="true"></iconify-icon>
			</button>
			<ProgressBar class="mt-1" value={completionStatus} meter={getColor(completionStatus)} />
		</div>

		{#if isOpen}
			<div class="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
				<div class="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
					{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang (lang)}
						<button
							class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
							onclick={() => handleLanguageChange(lang as AvailableLanguageTag)}
						>
							<div class="flex items-center justify-between">
								<span class="font-medium">{lang.toUpperCase()}</span>
								<span class="text-sm text-gray-500">
									{getLanguageProgress(lang as AvailableLanguageTag)}%
								</span>
							</div>
							{#if translationProgress()[lang as AvailableLanguageTag]}
								<ProgressBar
									class="mt-1"
									value={getLanguageProgress(lang as AvailableLanguageTag)}
									meter={getColor(getLanguageProgress(lang as AvailableLanguageTag))}
								/>
							{/if}
						</button>
					{/each}
					<div class="border-t px-4 py-2">
						{m.translationsstatus_completed()}{completionStatus}%
						<ProgressBar class="mt-1" value={completionStatus} meter={getColor(completionStatus)} />
					</div>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<select
		class="select w-full max-w-[70px]"
		value={$contentLanguage}
		onchange={(e) => handleLanguageChange(e.currentTarget.value as AvailableLanguageTag)}
	>
		{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang (lang)}
			<option value={lang}>{lang.toUpperCase()}</option>
		{/each}
	</select>
{/if}
