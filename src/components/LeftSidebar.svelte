<!-- 
@file src/components/LeftSidebar.svelte 
@component
**LeftSidebar component displaying collection fields, publish options and translation status.**

```tsx
<LeftSidebar collection={collection} />
```
#### Props
- `collection` {object} - Collection object
-->

<script module lang="ts">
	declare const __VERSION__: string;
</script>

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { goto, invalidateAll } from '$app/navigation';
	import axios from 'axios';

	// Import necessary utilities and types
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { avatarSrc, pkgBgColor, systemLanguage } from '@stores/store.svelte';
	import { contentStructure, mode } from '@stores/collectionStore.svelte';
	import { toggleSidebar, sidebarState, userPreferredState, handleSidebarToggle } from '@src/stores/sidebarStore.svelte';
	import { screenSize } from '@stores/screenSizeStore.svelte';

	// Import components and utilities
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SiteName from '@components/SiteName.svelte';
	import Collections from '@components/Collections.svelte';
	import { getLanguageName } from '@utils/languageUtils';

	// Skeleton components and utilities
	import { Avatar, popup, modeCurrent, type PopupSettings, setModeUserPrefers, setModeCurrent } from '@skeletonlabs/skeleton';

	// Define user data and state variables
	const user = $page.data.user;
	avatarSrc.set(user?.avatar);

	// Tooltip settings
	const UserTooltip: PopupSettings = {
		event: 'hover',
		target: 'User',
		placement: 'right'
	};
	const GithubTooltip: PopupSettings = {
		event: 'hover',
		target: 'Github',
		placement: 'right'
	};
	const SwitchThemeTooltip: PopupSettings = {
		event: 'hover',
		target: 'SwitchTheme',
		placement: 'right'
	};
	const SignOutTooltip: PopupSettings = {
		event: 'hover',
		target: 'SignOutButton',
		placement: 'right'
	};
	const ConfigTooltip: PopupSettings = {
		event: 'hover',
		target: 'Config',
		placement: 'right'
	};
	const SystemLanguageTooltip: PopupSettings = {
		event: 'hover',
		target: 'SystemLanguage',
		placement: 'right'
	};

	// Language and messaging setup
	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';

	// Define language type based on available languages
	type AvailableLanguage = (typeof publicEnv.AVAILABLE_SYSTEM_LANGUAGES)[number];

	let _languageTag = $state(languageTag()); // Get the current language tag

	// Enhanced language selector
	let searchQuery = $state('');
	let isDropdownOpen = $state(false);
	let dropdownRef = $state<HTMLElement | null>(null);

	// Computed values
	const availableLanguages = $derived(
		[...publicEnv.AVAILABLE_SYSTEM_LANGUAGES].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en')))
	);

	const filteredLanguages = $derived(
		availableLanguages.filter(
			(lang: string) =>
				getLanguageName(lang, systemLanguage.value).toLowerCase().includes(searchQuery.toLowerCase()) ||
				getLanguageName(lang, 'en').toLowerCase().includes(searchQuery.toLowerCase())
		) as AvailableLanguage[]
	);

	// Click outside effect
	$effect(() => {
		const handleClick = (event: MouseEvent) => {
			if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
				isDropdownOpen = false;
				searchQuery = '';
			}
		};

		document.addEventListener('click', handleClick);
		return () => document.removeEventListener('click', handleClick);
	});

	// Event handlers
	function handleLanguageSelection(lang: AvailableLanguage) {
		systemLanguage.set(lang);
		_languageTag = lang;
		isDropdownOpen = false;
		searchQuery = '';
	}

	// SignOut function
	async function signOut() {
		try {
			console.log('Starting sign-out process...');

			// Call the logout API endpoint
			const response = await axios.post(
				'/api/user/logout',
				{},
				{
					withCredentials: true // This is important to include cookies
				}
			);

			console.log('Logout response:', response.data);

			// Always invalidate and redirect, even if the server response isn't as expected
			await invalidateAll();
			console.log('All data invalidated');
			await goto('/login');
			console.log('Redirected to login page');
		} catch (error) {
			console.error('Error during sign-out:', error instanceof Error ? error.message : 'Unknown error');

			// Even if there's an error, we should still invalidate and redirect
			await invalidateAll();
			await goto('/login');
		}
	}

	// GitHub version and theme toggle
	const pkg = __VERSION__ || '';
	let githubVersion = '';

	axios
		.get('https://api.github.com/repos/Rar9/SveltyCMS/releases/latest')
		.then((response) => {
			githubVersion = response.data.tag_name.slice(1);
			const [localMajor, localMinor] = pkg.split('.').map(Number);
			const [githubMajor, githubMinor] = githubVersion.split('.').map(Number);

			if (githubMinor > localMinor) {
				$pkgBgColor = 'variant-filled-warning';
			} else if (githubMajor !== localMajor) {
				$pkgBgColor = 'variant-filled-error';
			}
		})
		.catch((error) => {
			console.error('Error von Github Release found:', error);
			githubVersion = pkg;
			$pkgBgColor = 'variant-filled-tertiary';
		});

	const toggleTheme = () => {
		const currentMode = get(modeCurrent);
		const newMode = !currentMode;
		setModeUserPrefers(newMode);
		setModeCurrent(newMode);
		localStorage.setItem('theme', newMode ? 'light' : 'dark');
	};

	let handleUserClick = $derived(() => {
		if (!$page.url.href.includes('user')) {
			mode.set('view');
			// Only handle sidebar on mobile
			if (get(screenSize) === 'sm') {
				toggleSidebar('left', 'hidden'); // Hide the left sidebar on mobile
			}
			goto('/user');
		}
	});

	function handleSelectChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		if (target) {
			handleLanguageSelection(target.value as AvailableLanguage);
		}
	}
</script>

<div class="flex h-full w-full flex-col justify-between">
	<!-- Corporate Identity Full-->
	{#if sidebarState.sidebar.value.left === 'full'}
		<a href="/" aria-label="SveltyCMS Logo" class="flex pt-2 !no-underline">
			<SveltyCMSLogo fill="red" className="h-9 -ml-2" />
			<span class="text-token relative text-2xl font-bold"><SiteName /> </span>
		</a>
	{:else}
		<!-- Corporate Identity Collapsed-->
		<div class="gap flex justify-start">
			<button type="button" onclick={() => toggleSidebar('left', 'hidden')} aria-label="Open Sidebar" class="variant-ghost-surface btn-icon mt-1">
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>

			<a href="/" aria-label="SveltyCMS Logo" class="flex justify-center pt-2 !no-underline">
				<SveltyCMSLogo fill="red" className="h-9 -ml-2 ltr:mr-2 rtl:ml-2 rtl:-mr-2" />
			</a>
		</div>
	{/if}

	<!-- Button to expand/collapse sidebar -->
	<button
		type="button"
		onclick={() => {
			toggleSidebar('left', sidebarState.sidebar.value.left === 'full' ? 'collapsed' : 'full');
			userPreferredState.set(sidebarState.sidebar.value.left === 'full' ? 'collapsed' : 'full');
		}}
		aria-label="Expand/Collapse Sidebar"
		class="absolute top-2 z-20 flex items-center justify-center !rounded-full border-[3px] dark:border-black ltr:-right-3 rtl:-left-3"
	>
		<iconify-icon
			icon="bi:arrow-left-circle-fill"
			width="30"
			class={`rounded-full bg-surface-500 text-white hover:cursor-pointer hover:bg-error-600 dark:bg-white dark:text-surface-600 dark:hover:bg-error-600 ${sidebarState.sidebar.value.left === 'full' ? 'rotate-0 rtl:rotate-180' : 'rotate-180 rtl:rotate-0'}`}
		></iconify-icon>
	</button>

	<!--SideBar Middle -->
	<Collections data={contentStructure.value} />

	<!-- Sidebar Left Footer -->
	<div class="mb-2 mt-auto bg-white dark:bg-gradient-to-r dark:from-surface-700 dark:to-surface-900">
		<div class="mx-1 mb-1 border-0 border-t border-surface-400"></div>

		<div
			class="{sidebarState.sidebar.value.left === 'full' ? 'grid-cols-3 grid-rows-3' : 'grid-cols-2 grid-rows-2'} grid items-center justify-center"
		>
			<!-- Avatar with user settings -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-1 row-span-2' : 'order-1'}>
				<button
					use:popup={UserTooltip}
					onclick={(e) => {
						handleUserClick();
						e.stopPropagation();
					}}
					onkeypress={(e) => {
						e.stopPropagation();
						if (e.key === 'Enter' || e.key === ' ') {
							handleUserClick();
							e.preventDefault();
						}
					}}
					class="btn-icon relative cursor-pointer flex-col items-center justify-center text-center !no-underline md:row-span-2"
				>
					<Avatar
						src={$avatarSrc && $avatarSrc.startsWith('data:') ? $avatarSrc : $avatarSrc ? `/${$avatarSrc}?t=${Date.now()}` : '/Default_User.svg'}
						alt="Avatar"
						initials="AV"
						class="mx-auto {sidebarState.sidebar.value.left === 'full' ? 'w-[40px]' : 'w-[35px]'}"
					/>
					<div class="-mt-1 text-center text-[10px] uppercase text-black dark:text-white">
						{#if sidebarState.sidebar.value.left === 'full'}
							{#if user?.username}
								<div class=" -ml-1.5">
									{user?.username}
								</div>
							{/if}
						{/if}
					</div>
				</button>

				<!-- Popup Tooltip with the arrow element -->
				<div class="card variant-filled z-50 max-w-sm p-2" data-popup="User">
					{m.applayout_userprofile()}
					<div class="variant-filled arrow"></div>
				</div>
			</div>

			<!-- Enhanced System Language Selector -->
			<div
				class={sidebarState.sidebar.value.left === 'full' ? 'order-3 row-span-2 mx-auto pb-4' : 'order-2 mx-auto'}
				use:popup={SystemLanguageTooltip}
			>
				<div class="language-selector relative" bind:this={dropdownRef}>
					{#if publicEnv.AVAILABLE_SYSTEM_LANGUAGES.length > 5}
						<button
							class="variant-filled-surface btn-icon flex items-center justify-between uppercase text-white {sidebarState.sidebar.value.left ===
							'full'
								? 'px-2.5 py-2'
								: 'px-1.5 py-0'}"
							onclick={(e) => {
								e.stopPropagation();
								isDropdownOpen = !isDropdownOpen;
							}}
						>
							<span>{_languageTag}</span>
							<svg class="h-4 w-4 transition-transform {isDropdownOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>

						{#if isDropdownOpen}
							<div class="absolute -top-40 left-20 z-50 mt-1 w-48 rounded-lg border bg-surface-700 shadow-lg">
								<div class="border-b border-surface-600 p-2">
									<input
										type="text"
										bind:value={searchQuery}
										placeholder="Search language..."
										class="w-full rounded-md bg-surface-800 px-3 py-2 text-white placeholder:text-surface-400 focus:outline-none focus:ring-2"
									/>
								</div>

								<div class="max-h-48 divide-y divide-surface-600 overflow-y-auto py-1">
									{#each filteredLanguages as lang}
										<button
											class="flex w-full items-center justify-between px-4 py-2 text-left text-white hover:bg-surface-600 {_languageTag === lang
												? 'bg-surface-600'
												: ''}"
											onclick={() => handleLanguageSelection(lang)}
										>
											<span>{getLanguageName(lang)} ({lang.toUpperCase()})</span>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					{:else}
						<select
							bind:value={_languageTag}
							onchange={handleSelectChange}
							class="variant-filled-surface !appearance-none rounded-full uppercase text-white {sidebarState.sidebar.value.left === 'full'
								? 'btn-icon px-2.5 py-2'
								: 'btn-icon-sm px-1.5 py-0'}"
						>
							{#each availableLanguages as lang}
								<option value={lang} selected={lang === _languageTag}>{lang.toUpperCase()}</option>
							{/each}
						</select>
					{/if}
				</div>

				<!-- Popup Tooltip with the arrow element -->
				<div class="card variant-filled z-50 max-w-sm p-2" data-popup="SystemLanguage">
					{m.applayout_systemlanguage()}
					<div class="variant-filled arrow"></div>
				</div>
			</div>

			<!-- Light/Dark mode switch -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-2' : 'order-3'}>
				<button use:popup={SwitchThemeTooltip} onclick={toggleTheme} aria-label="Toggle Theme" class="btn-icon hover:bg-surface-500 hover:text-white">
					{#if !$modeCurrent}
						<iconify-icon icon="bi:sun" width="22"></iconify-icon>
					{:else}
						<iconify-icon icon="bi:moon-fill" width="22"></iconify-icon>
					{/if}
				</button>

				<!-- Popup Tooltip with the arrow element -->
				<div class="card variant-filled z-50 max-w-sm p-2" data-popup="SwitchTheme">
					{m.applayout_switchmode({ $modeCurrent: !$modeCurrent ? 'Light' : 'Dark' })}
					<div class="variant-filled arrow"></div>
				</div>
			</div>

			<!-- Sign Out -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-4' : 'order-4'}>
				<button
					use:popup={SignOutTooltip}
					onclick={signOut}
					type="submit"
					value="Sign out"
					aria-label="Sign Out"
					class="btn-icon hover:bg-surface-500 hover:text-white"
				>
					<iconify-icon icon="uil:signout" width="26"></iconify-icon>
				</button>

				<!-- Popup Tooltip with the arrow element -->
				<div class="card variant-filled z-50 max-w-sm p-2" data-popup="SignOutButton">
					{m.applayout_signout()}
					<div class="variant-filled arrow"></div>
				</div>
			</div>

			<!-- System Configuration -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-5' : 'order-6'}>
				<button
					use:popup={ConfigTooltip}
					onclick={() => {
						mode.set('view');
						handleSidebarToggle();
						if (get(screenSize) === 'sm') {
							toggleSidebar('left', 'hidden');
						}
					}}
					aria-label="System Configuration"
					class="btn-icon pt-1.5 hover:bg-surface-500 hover:text-white"
				>
					<a href="/config" aria-label="System Configuration">
						<iconify-icon icon="material-symbols:build-circle" width="32"></iconify-icon>
					</a>
				</button>

				<!-- Popup Tooltip with the arrow element -->
				<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Config">
					{m.applayout_systemconfiguration()}
					<div class="variant-filled arrow"></div>
				</div>
			</div>

			<!-- Github discussions -->
			<div class="{sidebarState.sidebar.value.left === 'full' ? 'order-7' : 'order-7 hidden'} ">
				<a href="https://github.com/SveltyCMS/SveltyCMS/discussions" target="blank">
					<button use:popup={GithubTooltip} aria-label="Github Discussions" class="btn-icon hover:bg-surface-500 hover:text-white">
						<iconify-icon icon="grommet-icons:github" width="30"></iconify-icon>
					</button>

					<!-- Popup Tooltip with the arrow element -->
					<div class="card variant-filled z-50 max-w-sm p-2" data-popup="Github">
						{m.applayout_githubdiscussion()}
						<div class="variant-filled arrow"></div>
					</div>
				</a>
			</div>

			<!-- CMS Version -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-6' : 'order-5'}>
				<a href="https://github.com/SveltyCMS/SveltyCMS/" target="blank">
					<span class="{sidebarState.sidebar.value.left === 'full' ? 'py-1' : 'py-0'} {$pkgBgColor} badge rounded-xl text-black hover:text-white"
						>{#if sidebarState.sidebar.value.left === 'full'}
							{m.applayout_version()}
						{/if}
						{pkg}
					</span>
				</a>
			</div>
		</div>
	</div>
</div>

<style lang="postcss">
	/* Scrollbar styling */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-surface-500)) transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-surface-500));
		border-radius: 3px;
		border: transparent;
	}
</style>
