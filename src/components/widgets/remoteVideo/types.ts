import { publicEnv } from '@root/config/public';

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@src/components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import Permission from '@src/components/Permission.svelte';

// Auth
import type { Permission } from '@src/auth/types';

/**
 * Defines RemoteVideo widget Parameters
 */
export type Params = {
	// default required parameters
	label: string;
	display?: DISPLAY;
	db_fieldName?: string;
	widget?: any;
	required?: boolean;
	translated?: boolean;
	icon?: string;
	helper?: string;
	width?: number;

	// Permissions
	permissions?: Permission[];

	// Widget Specific parameters
	placeholder?: string;
};

/**
 * Defines RemoteVideo GuiSchema
 */
export const GuiSchema = {
	label: { widget: Input, required: true },
	display: { widget: Input, required: true },
	db_fieldName: { widget: Input, required: true },
	required: { widget: Toggles, required: false },
	translated: { widget: Toggles, required: false },
	icon: { widget: IconifyPicker, required: false },
	helper: { widget: Input, required: false },
	width: { widget: Input, required: false },

	// Permissions
	permissions: { widget: Permission, required: false },

	// Widget Specific parameters
	placeholder: { widget: Input, required: false },
	readonly: { widget: Toggles, required: false }
};

/**
 * Define RemoteVideo GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ label, collection }) => {
	// Create a type name by combining the collection name and label
	const typeName = `${collection.name}_${label}`;

	// Return an object containing the type name and the GraphQL schema
	return {
		typeName,
		graphql: /* GraphQL */ `
        type ${typeName} {
			${publicEnv.AVAILABLE_CONTENT_LANGUAGES.map((contentLanguage) => `${contentLanguage}: String`).join('\n')}
		}
        `
	};
};
