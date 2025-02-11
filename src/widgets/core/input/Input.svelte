<!-- 
 @file src/widgets/core/input/Input.svelte 
 @component
 **Input field widget component to display input field with prefix and suffix and count**
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import type { FieldType } from '.';

	// Utils
	import { track } from '@src/utils/reactivity.svelte';
	import { updateTranslationProgress, getFieldName } from '@src/utils/utils';

	// Stores
	import { mode, collection } from '@root/src/stores/collectionStore.svelte';

	// Valibot validation
	import { string, pipe, parse, type ValiError, minLength, maxLength, nonEmpty, nullable } from 'valibot';
	import { contentLanguage, validationStore } from '@root/src/stores/store.svelte';

	// Props
	interface Props {
		field: FieldType;
		value?: any;
		WidgetData?: any;
	}

	let { field, value = $bindable(), WidgetData = $bindable() }: Props = $props();

	// Initialize value separately to avoid $state() in prop destructuring

	let _data = $state(mode() == 'create' ? { [contentLanguage.value.toLowerCase()]: '' } : value);

	let _language = $derived(field?.translated ? contentLanguage.value.toLowerCase() : publicEnv.DEFAULT_CONTENT_LANGUAGE.toLowerCase());

	let count = $derived(_data[_language]?.length ?? 0);

	track(
		() => updateTranslationProgress(_data, field),
		() => _data[_language]
	);

	WidgetData = async () => _data;

	// Validation and error state
	let validationError = $state<string | null>(null);
	let debounceTimeout: number | undefined;
	let inputElement: HTMLInputElement | null = null;

	// Memoized badge class calculation
	const badgeClassCache = new Map<string, string>();
	const getBadgeClass = (length: number) => {
		const key = `${length}-${field?.minlength}-${field?.maxlength}-${field?.count}`;
		if (badgeClassCache.has(key)) return badgeClassCache.get(key)!;

		let result: string;
		if (field?.minlength && length < field?.minlength) result = 'bg-red-600';
		else if (field?.maxlength && length > field?.maxlength) result = 'bg-red-600';
		else if (field?.count && length === field?.count) result = 'bg-green-600';
		else if (field?.count && length > field?.count) result = 'bg-orange-600';
		else if (field?.minlength) result = '!variant-filled-surface';
		else result = '!variant-ghost-surface';

		badgeClassCache.set(key, result);
		return result;
	};

	let validationSchema = field?.required ? pipe(string(), nonEmpty()) : nullable(string());

	// Validation function using Valibot schema
	function validateInput() {
		try {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			debounceTimeout = window.setTimeout(() => {
				try {
					const value = _data[_language];

					// First validate the value exists if required
					if (field?.required && !value) {
						validationError = 'This field is required';
						validationStore.setError(getFieldName(field), validationError);
						return;
					}

					// Then validate string constraints if value exists
					if (value) {
						if (field?.minlength && value.length < field.minlength) {
							validationError = `Minimum length is ${field.minlength}`;
							validationStore.setError(getFieldName(field), validationError);
							return;
						}
						if (field?.maxlength && value.length > field.maxlength) {
							validationError = `Maximum length is ${field.maxlength}`;
							validationStore.setError(getFieldName(field), validationError);
							return;
						}
					}

					parse(validationSchema, value);
					validationError = null;
					validationStore.clearError(getFieldName(field));
				} catch (error) {
					if ((error as ValiError<typeof validationSchema>).issues) {
						const valiError = error as ValiError<typeof validationSchema>;
						validationError = valiError.issues[0]?.message || 'Invalid input';
						validationStore.setError(getFieldName(field), validationError);
					}
				}
			}, 300);
		} catch (error) {
			console.error('Validation error:', error);
			validationError = 'An unexpected error occurred during validation';
			validationStore.setError(getFieldName(field), 'Validation error');
		}
	}

	// Cleanup function
	$effect(() => {
		return () => {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			badgeClassCache.clear();
		};
	});
	$effect(() => {
		console.debug('Data : ', _data[_language]);
	});
</script>

<div class="input-container relative mb-4">
	<div class="variant-filled-surface btn-group flex w-full rounded" role="group">
		{#if field?.prefix}
			<button class="!px-2" aria-label={`${field.prefix} prefix`}>
				{field?.prefix}
			</button>
		{/if}

		<input
			type="text"
			bind:value={_data[_language]}
			onblur={validateInput}
			name={field?.db_fieldName}
			id={field?.db_fieldName}
			bind:this={inputElement}
			placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
			required={field?.required}
			disabled={field?.disabled}
			readonly={field?.readonly}
			minlength={field?.minlength}
			maxlength={field?.maxlength}
			class="input w-full flex-1 rounded-none text-black dark:text-primary-500"
			class:error={!!validationError}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${getFieldName(field)}-error` : undefined}
			aria-required={field?.required}
			data-testid="text-input"
		/>

		<!-- suffix and count -->
		{#if field?.suffix || field?.count || field?.minlength || field?.maxlength}
			<div class="flex items-center" role="status" aria-live="polite">
				{#if field?.count || field?.minlength || field?.maxlength}
					<span class="badge mr-1 rounded-full {getBadgeClass(count)}" aria-label="Character count">
						{#if field?.count && field?.minlength && field?.maxlength}
							{count}/{field?.maxlength}
						{:else if field?.count && field?.maxlength}
							{count}/{field?.maxlength}
						{:else if field?.count && field?.minlength}
							{count} => {field?.minlength}
						{:else if field?.minlength && field?.maxlength}
							{count} => {field?.minlength}/{field?.maxlength}
						{:else if field?.count}
							{count}/{field?.count}
						{:else if field?.maxlength}
							{count}/{field?.maxlength}
						{:else if field?.minlength}
							min {field?.minlength}
						{/if}
					</span>
				{/if}
				{#if field?.suffix}
					<span class="!px-1" aria-label={`${field.suffix} suffix`}>{field?.suffix}</span>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${getFieldName(field)}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
