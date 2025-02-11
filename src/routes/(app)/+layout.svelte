<!--
@file src/routes/(app)/+layout.svelte
@component
**This component renders the entire app with improved loading strategy and dynamic theme management**

Key features:
-     Skeleton UI framework for SvelteKit
-     Dynamic theme management based on user preferences or defaults
-     SEO optimization with Open Graph and Twitter Card metadata for enhanced social sharing
-     Initialization of Skeleton stores for UI components
-     Granular loading strategy
-     Asynchronous loading of non-critical data
-->

<script lang="ts">
	// Your selected Skeleton theme:
	import '../../app.postcss';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	import { publicEnv } from '@root/config/public';
	import { onMount, onDestroy } from 'svelte';

	// Utils
	import { getTextDirection } from '@utils/utils';
	import { isSearchVisible } from '@utils/globalSearchIndex';

	// Stores
	import { page } from '$app/state';
	import { systemLanguage, isLoading } from '@stores/store.svelte';

	import { contentStructure, collections } from '@root/src/stores/collectionStore.svelte';
	import { sidebarState } from '@root/src/stores/sidebarStore.svelte';
	import { screenSize, ScreenSize } from '@root/src/stores/screenSizeStore.svelte';

	// Components
	import Loading from '@components/Loading.svelte';
	import SearchComponent from '@components/SearchComponent.svelte';
	import LeftSidebar from '@components/LeftSidebar.svelte';
	import RightSidebar from '@components/RightSidebar.svelte';
	import HeaderEdit from '@components/HeaderEdit.svelte';
	import PageFooter from '@components/PageFooter.svelte';
	import FloatingNav from '@components/system/FloatingNav.svelte';

	// Skeleton
	import { initializeStores, Modal, Toast, setModeUserPrefers, setModeCurrent, setInitialClassState } from '@skeletonlabs/skeleton';
	// Required for popups to function
	import { computePosition, autoUpdate, offset, shift, flip, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';

	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });
	initializeStores();

	interface Props {
		children?: import('svelte').Snippet;
		data: { contentStructure: any; nestedContentStructure: any; contentLanguage: string; systemLanguage: string };
	}

	let { children, data }: Props = $props();

	// State variables
	let isCollectionsLoaded = $state(false);
	let isNonCriticalDataLoaded = $state(false);
	let loadError = $state<Error | null>(null);
	let mediaQuery: MediaQueryList;

	// Update content language when data changes, ensuring it's a valid language tag
	//$effect(() => {
	//	if (!(publicEnv.AVAILABLE_CONTENT_LANGUAGES as ReadonlyArray<AvailableLanguageTag>).includes(data.contentLanguage as AvailableLanguageTag)) {
	//		// If data.contentLanguage is invalid and contentLanguage is not already set to a valid value, fall back to 'en'
	//		if (!contentLanguage.value || !(publicEnv.AVAILABLE_CONTENT_LANGUAGES as ReadonlyArray<AvailableLanguageTag>).includes(contentLanguage.value)) {
	//			contentLanguage.set('en');
	//		}
	//	} else {
	//		contentLanguage.set(data.contentLanguage as AvailableLanguageTag);
	//	}
	//});

	// Handle collection changes
	//$effect(() => {
	//	const newCollection = collection.value;
	//	if (!newCollection?.name) return;
	//
	//	const newPath = `/${contentLanguage.value || publicEnv.DEFAULT_CONTENT_LANGUAGE}${String(newCollection.path)}`;
	//	if (page.url.pathname !== newPath && mode.value !== 'media') {
	//		console.log('layout collection chnage redirect', 'newPath', newPath);
	//		goto(newPath);
	//	}
	//});
	//
	// Update collection loaded state when store changes
	$effect(() => {
		if (collections.value && Object.keys(collections.value).length > 0) {
			isCollectionsLoaded = true;
		}
	});

	// Handle system language changes
	$effect(() => {
		const lang = systemLanguage.value;
		if (!lang) return;

		const dir = getTextDirection(lang);
		if (!dir) return;

		document.documentElement.dir = dir;
		document.documentElement.lang = lang;
	});

	// Function to initialize collections using ContentManager
	async function initializeCollections() {
		try {
			console.log('Loading collections...', data);
			contentStructure.set(data.nestedContentStructure);
			isCollectionsLoaded = true;
		} catch (error) {
			console.error('Error loading collections:', error);
			loadError = error instanceof Error ? error : new Error('Unknown error occurred while loading collections');
		}
	}

	// Function to load non-critical data
	async function loadNonCriticalData() {
		await new Promise((resolve) => setTimeout(resolve, 2000));
		isNonCriticalDataLoaded = true;
	}

	// Theme management
	function updateThemeBasedOnSystemPreference(event: MediaQueryListEvent) {
		const prefersDarkMode = event.matches;
		setModeUserPrefers(prefersDarkMode);
		setModeCurrent(prefersDarkMode);
		localStorage.setItem('theme', prefersDarkMode ? 'dark' : 'light');
	}

	// Keyboard shortcuts
	function onKeyDown(event: KeyboardEvent) {
		if (event.altKey && event.key === 's') {
			event.preventDefault();
			isSearchVisible.update((v) => !v);
		}
	}

	onMount(() => {
		// Theme initialization
		mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', updateThemeBasedOnSystemPreference);

		// Check for saved theme preference in localStorage
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			const newMode = savedTheme === 'light';
			setModeUserPrefers(newMode);
			setModeCurrent(newMode);
		}

		// Event listeners
		window.addEventListener('keydown', onKeyDown);

		// Initialize data
		initializeCollections();
		loadNonCriticalData();
	});

	onDestroy(() => {
		// Cleanup: remove event listeners
		mediaQuery?.removeEventListener('change', updateThemeBasedOnSystemPreference);
		window.removeEventListener('keydown', onKeyDown);
	});

	// SEO
	const SeoTitle = `${publicEnv.SITE_NAME} - powered with sveltekit`;
	const SeoDescription = `${publicEnv.SITE_NAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;
</script>

<svelte:head>
	<!-- Dark Mode -->
	{@html '<script>(' + setInitialClassState.toString() + ')();</script>'}

	<!--Basic SEO-->
	<title>{SeoTitle}</title>
	<meta name="description" content={SeoDescription} />

	<!-- Open Graph -->
	<meta property="og:title" content={SeoTitle} />
	<meta property="og:description" content={SeoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/SveltyCMS.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={page.url.origin} />

	<!-- Open Graph : Twitter-->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SeoTitle} />
	<meta name="twitter:description" content={SeoDescription} />
	<meta name="twitter:image" content="/SveltyCMS.png" />
	<meta property="twitter:domain" content={page.url.origin} />
	<meta property="twitter:url" content={page.url.href} />
</svelte:head>

{#if loadError}
	<div class="text-error-500">
		An error occurred: {loadError.message}
	</div>
{:else if !isCollectionsLoaded}
	<div class="flex h-lvh items-center justify-between lg:justify-start">
		<Loading />
	</div>
{:else}
	<!-- hack as root +layout cannot be overwritten ? -->
	{#if page.url.pathname === '/login'}
		{@render children?.()}
	{:else}
		<!-- Body -->
		<div class="flex h-lvh flex-col">
			<!-- Header -->
			{#if sidebarState.sidebar.value.header !== 'hidden'}
				<header class="sticky top-0 z-10 bg-tertiary-500">Header</header>
			{/if}

			<div class="flex flex-1 overflow-hidden">
				<!-- Sidebar Left -->
				{#if sidebarState.sidebar.value.left !== 'hidden'}
					<aside
						class="max-h-dvh {sidebarState.sidebar.value.left === 'full'
							? 'w-[220px]'
							: 'w-fit'} relative border-r bg-white !px-2 text-center dark:border-surface-500 dark:bg-gradient-to-r dark:from-surface-700 dark:to-surface-900"
					>
						<LeftSidebar />
					</aside>
				{/if}

				<!-- Content Area -->
				<main class="relative w-full flex-1 overflow-hidden">
					<!-- Page Header -->
					{#if sidebarState.sidebar.value.header !== 'hidden'}
						<header class="sticky top-0 z-10 w-full">
							<HeaderEdit />
						</header>
					{/if}

					<!-- Router Slot -->
					<div
						role="main"
						class="relative h-full flex-grow overflow-auto {sidebarState.sidebar.value.left === 'full' ? 'mx-2' : 'mx-1'} {$screenSize === 'lg'
							? 'mb-2'
							: 'mb-16'}"
					>
						<Toast />
						<Modal />

						<!-- Floating Nav -->
						{#if $screenSize !== ScreenSize.LG && $screenSize !== ScreenSize.XL}
							<FloatingNav />
						{/if}

						<!-- Show globalSearchIndex  -->
						{#if $isSearchVisible}
							<SearchComponent value="" placeholder="Search" classNames="" />
						{/if}

						{#if $isLoading}
							<div class="flex h-screen items-center justify-center">
								<Loading />
							</div>
						{:else}
							{@render children?.()}
						{/if}

						{#if isNonCriticalDataLoaded}
							<!-- Non-critical data components -->
						{/if}
					</div>

					<!-- Page Footer -->
					{#if sidebarState.sidebar.value.pagefooter !== 'hidden'}
						<footer
							class="sticky left-0 top-[calc(100%-51px)] z-10 w-full border-t bg-surface-50 bg-gradient-to-b px-1 text-center dark:border-surface-500 dark:from-surface-700 dark:to-surface-900"
						>
							<PageFooter />
						</footer>
					{/if}
				</main>

				<!-- Sidebar Right -->
				{#if sidebarState.sidebar.value.right !== 'hidden'}
					<aside
						class="max-h-dvh w-[220px] border-l bg-surface-50 bg-gradient-to-r dark:border-surface-500 dark:from-surface-700 dark:to-surface-900"
					>
						<RightSidebar />
					</aside>
				{/if}
			</div>

			<!-- Footer -->
			{#if sidebarState.sidebar.value.footer !== 'hidden'}
				<footer class="bg-blue-500">Footer</footer>
			{/if}
		</div>
	{/if}
{/if}
