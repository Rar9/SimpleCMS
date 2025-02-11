<!-- 
@files src/routes/(app)/config/+page.svelte
@component
**This file sets up and displays the config page. It provides a user-friendly interface for managing configuration settings**

Features:
- Collection builder
- GraphQL API
- Image editor
- Dashboard
- Market Place
- Widget Management
- Theme Management
- Settings
- Access Management
-->

<script lang="ts">
	// Stores
	import { page } from '$app/state';

	// Component
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';

	// ParaglideJS imports
	import * as m from '@src/paraglide/messages';

	// Import PermissionConfig type from the correct file
	import type { PermissionConfig } from '@src/auth/permissionCheck';
	import { onMount } from 'svelte';
	import { collection } from '@src/stores/collectionStore.svelte';
	//import type { Schema } from '@src/content/ContentManager';

	// Define the structure of dynamicPermissions
	type DynamicPermissions = Record<string, PermissionConfig>;

	// Get server-side data
	let dynamicPermissions = $derived(page.data.permissionConfigs as DynamicPermissions); // Dynamically loaded permissions

	onMount(() => {
		collection.set(null);
	});

	// Create a mapping from contextId to dynamic permissions for easier access
	let permissionConfigs = $derived(
		Object.fromEntries(
			Object.values(dynamicPermissions).map((permission) => [
				permission.contextId.split('/')[1], // Extract the contextId from permission id (e.g., 'collectionbuilder' from 'config:collectionbuilder')
				{
					contextId: permission.contextId,
					name: permission.name, // Ensure the `name` property is included
					action: permission.action,
					contextType: permission.contextType // Ensure this matches the expected type
				}
			])
		) as Record<string, PermissionConfig>
	);
</script>

<!-- Page Title with Back Button -->
<PageTitle name={m.config_pagetitle()} showBackButton={true} icon="material-symbols:build-circle" />

<div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto">
	<h2 class="mb-4 text-center text-tertiary-600 dark:text-primary-500">{m.config_body()}</h2>
	<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
		<!-- Collection -->
		<PermissionGuard config={permissionConfigs.collectionbuilder}>
			<a
				href="/config/collectionbuilder"
				class="config-btn variant-outline-tertiary dark:variant-outline-secondary"
				aria-label={m.config_collectionbuilder()}
			>
				<iconify-icon icon="fluent-mdl2:build-definition" class="config-icon text-tertiary-600"></iconify-icon>
				<p class="config-text">{m.config_collectionbuilder()}</p>
			</a>
		</PermissionGuard>

		<!-- Graphql Api -->
		<PermissionGuard config={permissionConfigs.graphql}>
			<a
				href="/api/graphql"
				target="_blank"
				rel="noopener noreferrer"
				aria-label={m.config_graphql()}
				class="config-btn variant-outline-tertiary dark:variant-outline-secondary"
			>
				<iconify-icon icon="teenyicons:graphql-solid" class="config-icon text-warning-600"></iconify-icon>
				<p class="config-text">{m.config_graphql()}</p>
			</a>
		</PermissionGuard>

		<!-- Editor -->
		<PermissionGuard config={permissionConfigs.imageeditor}>
			<a href="/imageEditor" aria-label={m.config_imageeditor()} class="config-btn variant-outline-tertiary dark:variant-outline-secondary">
				<iconify-icon icon="bi:image" class="config-icon text-primary-600"></iconify-icon>
				<p class="config-text">{m.config_imageeditor()}</p>
			</a>
		</PermissionGuard>

		<!-- Dashboard -->
		<PermissionGuard config={permissionConfigs.dashboard}>
			<a href="/dashboard" class="config-btn variant-outline-tertiary dark:variant-outline-secondary" aria-label={m.config_Dashboard()}>
				<iconify-icon icon="bi:bar-chart-line" class="config-icon text-error-600"></iconify-icon>
				<p class="config-text">{m.config_Dashboard()}</p>
			</a>
		</PermissionGuard>

		<!-- Market Place -->
		<a
			href="https://www.sveltyCMS.com"
			target="_blank"
			rel="noopener noreferrer"
			class="config-btn variant-ghost-primary"
			aria-label={m.config_Martketplace()}
		>
			<iconify-icon icon="icon-park-outline:shopping-bag" class="config-icon text-white"></iconify-icon>
			<p class="config-text">{m.config_Martketplace()}</p>
		</a>

		<!-- Widget Management -->
		<PermissionGuard config={permissionConfigs.widgetManagement}>
			<a href="/config/widgetManagement" aria-label="Widget Management" class="config-btn variant-ghost-primary">
				<iconify-icon icon="mdi:widgets" class="config-icon text-white"></iconify-icon>
				<p class="config-text">Widget Management</p>
			</a>
		</PermissionGuard>

		<!-- Theme Management -->
		<PermissionGuard config={permissionConfigs.themeManagement}>
			<a href="/config/themeManagement" aria-label="Theme Management" class="config-btn variant-ghost-primary">
				<iconify-icon icon="ph:layout" class="config-icon text-white"></iconify-icon>
				<p class="config-text">Themes</p>
			</a>
		</PermissionGuard>

		<!-- Settings -->
		<PermissionGuard config={permissionConfigs.settings}>
			<a href="/config/systemsetting" aria-label="System Settings" class="config-btn variant-ghost-error">
				<iconify-icon icon="uil:setting" class="config-icon text-white"></iconify-icon>
				<p class="config-text">Settings</p>
			</a>
		</PermissionGuard>

		<!-- Access Management -->
		<PermissionGuard config={permissionConfigs.accessManagement}>
			<a href="/config/assessManagement" aria-label="Access Management" class="config-btn variant-ghost-error">
				<iconify-icon icon="mdi:account-group" class="config-icon text-white"></iconify-icon>
				<p class="config-text">Access Management</p>
			</a>
		</PermissionGuard>
	</div>
</div>

<style lang="postcss">
	:global(.config-btn) {
		@apply flex h-24 flex-col items-center justify-center gap-2 p-4 text-center transition-all duration-200 ease-in-out hover:scale-105 lg:h-20;
	}
	:global(.config-icon) {
		@apply text-3xl lg:text-2xl;
	}
	:global(.config-text) {
		@apply w-full truncate text-xs font-medium uppercase lg:text-sm;
	}
</style>
