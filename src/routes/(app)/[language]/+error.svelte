<!-- 
@file src/routes/(app)/[language]/+error.svelte
@component
**Displays an Error page for the SveltyCMS**

Features: 
- Dynamic display of error status and message based on the error encountered. 
- Rotating animation effect for the site name to enhance visual appeal. 
- Clear call-to-action link to return to the homepage.

Usage: This error component is automatically rendered when an error occurs during route handling.
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Stores
	import { page } from '$app/state';
	import type { Load } from '@sveltejs/kit';

	// Components
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SiteName from '@components/SiteName.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { contentLanguage } from '@root/src/stores/store.svelte';

	const speed = 100;
	const size = 140;
	const font = 0.9;
	const repeat = 3;
	const separator = ' • ';

	const siteName = publicEnv.SITE_NAME;

	const combinedString = Array.from({ length: repeat }, () => siteName + separator).join('');

	const array: string[] = combinedString.split('').filter((char) => char !== ' ');

	// Set the error data and SEO information that will be used by the layout
	export const load: Load = () => {
		return {
			SeoTitle: `Error ${page.status} - ${publicEnv.SITE_NAME}`,
			SeoDescription: `An error occurred while trying to access this page. Status: ${page.status}. ${page.error?.message || m.error_pagenotfound()}`
		};
	};
</script>

{#if page}
	/{contentLanguage.value}/Collecion-page
	<main class="flex h-screen w-full flex-col items-center justify-center bg-gradient-to-t from-surface-900 via-surface-700 to-surface-900 text-white">
		<div class="relative">
			<!-- Rotating SiteName -->
			<div class="seal absolute" style="--size: {size}px; --speed: {speed * 200}ms; --font: {font}em">
				{#each array as char, index}
					<div class="char" style="--angle: {`${(1 / array.length) * index}turn`}">
						{#if char === 'S' && (index + 1) % 10 === 0}
							<!-- This is the last 'S' in each "SveltyCMS•" -->
							<span class="text-primary-500"><SiteName {char} /></span>
						{:else if index % 10 < 6}
							<!-- This is the main part of each "SveltyCMS•" -->
							<SiteName {char} />
						{:else if index % 10 >= 6 && index % 10 < 9}
							<!-- This is the last part of each "SveltyCMS•" -->
							<span class="text-primary-500"><SiteName {char} /></span>
						{:else}
							<!-- This is the separator '•' -->
							<SiteName {char} />
						{/if}
					</div>
				{/each}
			</div>

			<!-- Site Logo -->
			<SveltyCMSLogo fill="red" className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 h-16 mb-2" />
		</div>

		<div class="relative">
			<!-- Error class -->
			<h1 class="relative text-9xl font-extrabold tracking-widest text-white">
				{page.status}
			</h1>
			<!-- Error url  -->
			<div
				class="absolute left-1/2 top-1/2 mx-auto -translate-x-1/2 -translate-y-1/2 rotate-12 transform rounded-md bg-error-600/80 px-2 text-center text-sm font-bold text-white"
			>
				<div class="min-w-[200px]">{page.url}</div>
				<div class="whitespace-nowrap">{m.error_pagenotfound()}</div>
			</div>
		</div>

		<h1 class="text-center text-4xl font-extrabold tracking-widest text-surface-400">
			{#if page.error}
				{page.error.message}
			{/if}
		</h1>

		<p class="text-lg text-white">{m.error_wrong()}</p>
		<a
			href="/"
			data-sveltekit-preload-data="tap"
			class="relative mt-5 block rounded-full bg-gradient-to-br from-error-700 via-error-600 to-error-700 px-8 py-4 font-bold uppercase text-white shadow-xl"
		>
			{m.error_gofrontpage()}
		</a>
	</main>
{/if}

<style lang="postcss">
	@keyframes rotation {
		0% {
			transform: rotate(0turn);
		}
		100% {
			transform: rotate(1turn);
		}
	}

	.seal {
		position: relative;
		width: var(--size);
		height: var(--size);
		border-radius: 100%;
		animation: rotation var(--speed) linear infinite;
		font-size: var(--font);
	}
	.char {
		width: 1em;
		height: 100%;
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%) rotate(var(--angle, 0deg));
		text-align: center;
		text-transform: uppercase;
	}
</style>
