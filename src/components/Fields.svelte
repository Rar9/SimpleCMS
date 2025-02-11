<!--
@file src/components/Fields.svelte
@component
**Fields component that renders collection fields to enter/edit & display data per language**
revision management, live preview, and API data display. 

```tsx
<Fields />
```
#### Props
- `fields` {NonNullable<typeof collection.value>['fields']} - Collection fields
- `ariaInvalid` {boolean} - Aria-invalid attribute for accessibility
- `ariaDescribedby` {string} - Aria-describedby attribute for accessibility
Key features:
- Dynamic field rendering based on collection schema
- Tab-based interface for different views (Edit, Revision, Live Preview, API)
- Real-time translation progress updates
- Permission-based field filtering
- Integration with various widget types
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';
	import { getFieldName, pascalToCamelCase } from '@utils/utils';

	// Auth
	import { page } from '$app/state';
	import type { RolePermissions } from '@src/auth/types';
	const user = page.data.user;

	// Stores
	import { contentLanguage, translationProgress } from '@stores/store.svelte';
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { TabGroup, Tab, CodeBlock, clipboard } from '@skeletonlabs/skeleton';

	// Props
	interface Props {
		fields?: NonNullable<typeof collection.value>['fields'] | undefined;
		root?: boolean;
		fieldsData?: Record<string, any>;
		customData?: Record<string, any>;
		value?: any;
		ariaInvalid?: boolean;
		ariaDescribedby?: string;
	}

	let { fields = undefined, root = true, fieldsData = $bindable({}), customData = {} }: Props = $props();

	// Local state
	let apiUrl = $state('');
	let isLoading = $state(true);
	let tabSet = $state(0);
	let tabValue = $state(0);

	// Derived state
	let derivedFields = $derived.by(() => {
		return fields || (collection.value?.fields ?? []);
	});

	// Dynamic import of widget components
	const modules: Record<string, { default: any }> = import.meta.glob('@widgets/**/*.svelte', { eager: true });

	// Lifecycle
	$effect(() => {
		isLoading = false;
	});

	$effect(() => {
		if (root) collectionValue.set({ ...collectionValue, ...fieldsData });
	});

	// Reactive statements
	$effect(() => {
		if (collectionValue.value) {
			const id = collectionValue.value._id;
			apiUrl = `${dev ? 'http://localhost:5173' : publicEnv.SITE_NAME}/api/collection/${String(collection.value?._id)}/${id}`;
		}
	});

	// Functions and helpers
	function handleRevert() {
		// Implement revert logic
		console.warn('Revert function not implemented');
	}

	function getTabHeaderVisibility() {
		return user.roles !== 'admin' && !collection.value?.revision;
	}

	function filterFieldsByPermission(fields: any[], userRole: string) {
		return fields.filter((f) => {
			const permissions = f.permissions as RolePermissions | undefined;
			return permissions?.[userRole]?.read !== false;
		});
	}

	function getLivePreviewContent() {
		// Ensure collection.value?.name is a string and handle undefined case
		const collectionName = collection.value?.name ? String(collection.value.name) : '';
		return `<div>Live Preview Content for Collection: <span class="font-bold text-tertiary-500 dark:text-primary-500">${collectionName}</span></div>`;
	}

	let filteredFields = $derived(filterFieldsByPermission(derivedFields, user.role));
</script>

{#if isLoading}
	<div class="loading">Loading fields...</div>
{:else}
	<TabGroup
		justify="{collection.value?.revision === true ? 'justify-between md:justify-around' : 'justify-center '} items-center"
		rounded="rounded-tl-container-token rounded-tr-container-token"
		flex="flex-1 items-center"
		active="border-b border-tertiary-500 dark:border-primary-500 variant-soft-secondary"
		hover="hover:variant-soft-secondary"
		regionList={getTabHeaderVisibility() ? 'hidden' : ''}
		value={tabValue}
	>
		<!-- Tab headers -->
		<Tab bind:group={tabSet} name="tab1" value={0}>
			<div class="flex items-center gap-1">
				<iconify-icon icon="mdi:pen" width="24" class="text-tertiary-500 dark:text-primary-500"> </iconify-icon>
				<p>{m.fields_edit()}</p>
			</div>
		</Tab>

		{#if collection.value?.revision === true}
			<Tab bind:group={tabSet} name="tab2" value={1}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="pepicons-pop:countdown" width="24" class="text-tertiary-500 dark:text-primary-500"> </iconify-icon>
					<p>{m.applayout_version()} <span class="variant-outline-tertiary badge rounded-full dark:variant-outline-primary">1</span></p>
				</div>
			</Tab>
		{/if}

		<!-- TODO: Should not show if livePreview is false -->
		{#if collection.value?.livePreview === true}
			<Tab bind:group={tabSet} name="tab3" value={2}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:eye-outline" width="24" class="text-tertiary-500 dark:text-primary-500"> </iconify-icon>
					<p>{m.Fields_preview()}</p>
				</div>
			</Tab>
		{/if}

		{#if user.roles === 'admin'}
			<Tab bind:group={tabSet} name="tab4" value={3}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="ant-design:api-outlined" width="24" class="text-tertiary-500 dark:text-primary-500"> </iconify-icon>
					<p>API</p>
				</div>
			</Tab>
		{/if}

		<!-- Tab Panels -->
		<svelte:fragment slot="panel">
			{#if tabSet === 0}
				<div class="mb-2 text-center text-xs text-error-500">{m.fields_required()}</div>
				<div class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900">
					<div class="flex flex-wrap items-center justify-center gap-1 overflow-auto">
						{#each filteredFields as field (field.db_fieldName || field.id || field.label || field.name)}
							{#if field.widget}
								<div
									class="mx-auto text-center {!field?.width ? 'w-full ' : 'max-md:!w-full'}"
									style={'min-width:min(300px,100%);' + (field.width ? `width:calc(${Math.floor(100 / field?.width)}% - 0.5rem)` : '')}
								>
									<!-- Widget label -->
									<div class="flex justify-between px-[5px] text-start">
										<p class="inline-block font-semibold capitalize">
											{field.label || field.db_fieldName}
											{#if field.required}<span class="text-error-500">*</span>{/if}
										</p>

										<div class="flex gap-2">
											{#if field.translated}
												<div class="flex items-center gap-1 px-2">
													<iconify-icon icon="bi:translate" color="dark" width="18" class="text-sm"> </iconify-icon>
													<div class="text-xs font-normal text-error-500">
														{contentLanguage.value?.toUpperCase() ?? 'EN'}
													</div>
													<!-- Display translation progress -->
													<div class="text-xs font-normal">
														({Math.round(
															translationProgress.value[contentLanguage.value]?.translated.has(
																`${String(collection.value?.name)}.${getFieldName(field)}`
															)
																? 1
																: 0
														)}%)
													</div>
												</div>
											{/if}

											{#if field.icon}
												<iconify-icon icon={field.icon} color="dark" width="22"> </iconify-icon>
											{/if}
										</div>
									</div>

									<!-- Widget Input -->
									{#if field.widget}
										{#if typeof field.widget.Name === 'string'}
											{@const widgetName = field.widget.Name}
											{@const widgetPath = `/src/widgets/core/${pascalToCamelCase(widgetName)}/${widgetName}.svelte`}
											{@const WidgetComponent = modules[widgetPath]?.default}
											{#if WidgetComponent}
												<WidgetComponent {field} bind:WidgetData={fieldsData[getFieldName(field)]} bind:value={customData[getFieldName(field)]} />
											{:else}
												<p>{m.Fields_no_widgets_found({ name: widgetName })}</p>
											{/if}
										{:else}
											{@const widgetPath = `/src/widgets/${pascalToCamelCase(field.widget.Name)}/${field.widget.Name}.svelte`}
											{@const WidgetComponent = modules[widgetPath]?.default}
											{#if WidgetComponent}
												<WidgetComponent {field} bind:WidgetData={fieldsData[getFieldName(field)]} bind:value={customData[getFieldName(field)]} />
											{:else}
												<p>{m.Fields_no_widgets_found({ name: field.widget.Name })}</p>
											{/if}
										{/if}
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				</div>
			{:else if tabSet === 1}
				<!-- Revision tab content -->
				<div class="mb-2 flex items-center justify-between gap-2">
					<p class="text-center text-tertiary-500 dark:text-primary-500">{m.fields_revision_compare()}</p>
					<button class="variant-outline-tertiary btn dark:variant-ghost-primary" onclick={handleRevert}>{m.fields_revision_revert()}</button>
				</div>
				<select class="select mb-2">
					<option value="1">{m.fields_revision_most_recent()}</option>
					<option value="2">February 19th 2024, 4:00 PM</option>
				</select>

				<div class="flex justify-between dark:text-white">
					<!-- Current version -->
					<div class="w-full text-center">
						<p class="mb-4 sm:mb-0">{m.fields_revision_current_version()}</p>
						<CodeBlock
							color="text-white dark:text-primary-500"
							language="JSON"
							rounded="rounded-container-token"
							lineNumbers={true}
							text="text-xs text-left w-full"
							buttonLabel=""
							code={JSON.stringify(collectionValue.value, null, 2)}
						/>
					</div>
					<div
						class="ml-1 min-h-[1em] w-px self-stretch bg-gradient-to-tr from-transparent via-neutral-500 to-transparent opacity-20 dark:opacity-100"
					></div>
					<!-- Revision version -->
					<div class="ml-1 w-full text-left">
						<p class="text-center text-tertiary-500">February 19th 2024, 4:00 PM</p>
						<CodeBlock
							color="text-white dark:text-primary-500"
							language="JSON"
							lineNumbers={true}
							text="text-xs text-left text-white dark:text-tertiary-500"
							buttonLabel=""
							code={JSON.stringify(collectionValue.value, null, 2)}
						/>
					</div>
				</div>
			{:else if tabSet === 2 && collection.value?.livePreview === true}
				<!-- Live Preview tab content -->
				<div class="wrapper">
					<h2 class="mb-4 text-center text-xl font-bold text-tertiary-500 dark:text-primary-500">Live Preview</h2>
					<div class="card variant-glass-secondary mb-4 p-1 sm:p-4">
						{@html getLivePreviewContent()}
					</div>
				</div>
			{:else if tabSet === 3}
				<!-- API Json tab content -->
				{#if collectionValue.value == null}
					<div class="variant-ghost-error mb-4 py-2 text-center font-bold">{m.fields_api_nodata()}</div>
				{:else}
					<div class="wrapper relative z-0 mb-4 flex w-full items-center justify-start gap-1">
						<p class="flex items-center">
							<span class="mr-1">API URL:</span>
							<iconify-icon icon="ph:copy" use:clipboard={apiUrl} class="pb-6 text-tertiary-500 dark:text-primary-500"> </iconify-icon>
						</p>
						<button class="btn text-wrap text-left" onclick={() => window.open(apiUrl, '_blank')} title={apiUrl}>
							<span class="text-wrap text-tertiary-500 dark:text-primary-500">{apiUrl}</span>
						</button>
					</div>

					<CodeBlock
						color="text-white dark:text-primary-500"
						language="JSON"
						lineNumbers={true}
						text="text-xs w-full"
						buttonLabel="Copy"
						code={JSON.stringify(collectionValue.value, null, 2)}
					/>
				{/if}
			{/if}
		</svelte:fragment>
	</TabGroup>
{/if}
