<!-- 
@file src/widgets/core/dateTime/DateTime.svelte
@component
**DateTime widget**
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@stores/collectionStore.svelte';

	// valibot validation
	import * as v from 'valibot';

	interface DateTimeField extends FieldType {
		value?: any;
	}

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field }: Props = $props();
	const fieldName = getFieldName(field);
	let value = collectionValue.value[fieldName] || (field as DateTimeField)?.value || {};

	const _data = $state(mode.value === 'create' ? {} : value);
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = $state(null);
	let debounceTimeout: number | undefined;

	export const WidgetData = async () => _data;

	// Define the validation schema for this widget
	const widgetSchema = v.object({
		value: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Invalid date-time format, must be YYYY-MM-DDTHH:MM')),
		db_fieldName: v.string(),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		size: v.optional(v.string()),
		width: v.optional(v.number()),
		required: v.optional(v.boolean())
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: typeof widgetSchema, data: any): string | null {
		try {
			v.parse(schema, data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof v.ValiError) {
				const errorMessage = error.issues[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Debounced validation function
	function validateInput() {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validationError = validateSchema(widgetSchema, { value: _data[_language] });
		}, 300);
	}
</script>

<div class="input-container relative mb-4">
	<!-- Date/Time Input -->
	<input
		type="datetime-local"
		bind:value={_data[_language]}
		oninput={validateInput}
		class="input w-full text-black dark:text-primary-500"
		class:error={!!validationError}
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
	/>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
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
