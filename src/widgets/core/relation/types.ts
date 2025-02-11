/**
@file src/widgets/core/relation/types.ts
@description - relation widget types
*/

// Components
import IconifyPicker from '@components/IconifyPicker.svelte';
import Input from '@components/system/inputs/Input.svelte';
import Toggles from '@components/system/inputs/Toggles.svelte';
import PermissionsSetting from '@components/PermissionsSetting.svelte';

// Auth
import type { Permission } from '@src/auth/types';
import GuiField from './GuiField.svelte';

import { getFieldName } from '@utils/utils';
//import { dbAdapter } from '@src/databases/db'; // Import your database adapter

// Update all dbAdapter calls to use dbAdapter.get()

/**
 * Defines Relation widget Parameters
 */
export type Params<K, T> = {
  // default required parameters
  label: string;
  display?: DISPLAY;
  db_fieldName?: string;
  widget?: typeof Input | typeof Toggles | typeof IconifyPicker | typeof PermissionsSetting | typeof GuiField;
  required?: boolean;
  // translated?: boolean;
  icon?: string;
  helper?: string;
  width?: number;

  // Permissions
  permissions?: Permission[];

  // Widget Specific parameters
  displayPath: K;
  relation: T;
};

/**
 * Defines Relation GuiSchema
 */
export const GuiSchema = {
  label: { widget: Input, required: true },
  display: { widget: Input, required: true },
  db_fieldName: { widget: Input, required: true },
  required: { widget: Toggles, required: false },
  // translated: { widget: Toggles, required: false },
  icon: { widget: IconifyPicker, required: false },
  helper: { widget: Input, required: false },
  width: { widget: Input, required: false },

  // Permissions
  permissions: { widget: PermissionsSetting, required: false },

  // Widget Specific parameters
  relation: {
    widget: GuiField,
    required: true,
    imports: ['import {relation} from "./{relation}"']
  }
};

/**
 * Define Relation GraphqlSchema function
 */
export const GraphqlSchema: GraphqlSchema = ({ field, collection }) => {
  // Return an object containing the type name and the GraphQL schema
  return {
    typeName: field.relation,
    graphql: '', // relation does not need its own graphql because it copies related collection type
    resolver: {
      [collection.name]: {
        async [getFieldName(field)](parent: Record<string, unknown>) {
          const adapter = await dbAdapter.get();
          const res = await adapter.findOne(field.relation, { _id: parent[getFieldName(field)] as string });

          return res;
        }
      }
    }
  };
};
