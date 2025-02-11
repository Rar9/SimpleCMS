/**
 * @file src/widgets/widgetManager.svelte.ts
 * @description Widget Manager for handling widget loading, activation, and configuration
 */


import type { User, WidgetId } from '@src/auth/types';
import type { Schema } from '@src/content/types';

// System Logger
import { logger } from '@utils/logger.svelte';
import type { Widget, WidgetModule } from './types';
import MissingWidget from './MissingWidget.svelte';
export type WidgetStatus = 'active' | 'inactive'; // Define widget status types

export type ModifyRequestParams<T extends (...args: unknown[]) => unknown> = {
  collection: Schema; // Collection schema
  id?: WidgetId; // Optional widget ID
  field: ReturnType<T>; // Field type
  data: { get: () => unknown; update: (newData: unknown) => void }; // Data getter and setter
  user: User; // User information
  type: 'GET' | 'POST' | 'DELETE' | 'PATCH'; // HTTP request type
  meta_data?: Record<string, unknown>; // Optional metadata
};

const widgets = new Map<string, Widget>();
export default widgets;

export type WidgetFunction = ((config: Record<string, unknown>) => Widget) & {
  __widgetId?: string; // UUID for the widget function
  Name: string; // Widget name
  GuiSchema?: unknown; // GUI schema
  GraphqlSchema?: unknown; // GraphQL schema
  Icon?: string; // Icon for the widget
  Description?: string; // Description of the widget
  aggregations?: unknown; // Aggregation settings
};

let widgetFunctions = new Map<string, WidgetFunction>(); // Store for widget functions
let activeWidgetList = new Set<string>(); // Store for active widgets

// Function to resolve a widget placeholder
export async function resolveWidgetPlaceholder(placeholder: {
  __widgetId: string;
  __widgetName: string;
  __widgetConfig: Record<string, unknown>;
}): Promise<Widget> {
  await initializeWidgets(); // Ensure widgets are initialized

  // Check if the widget is active
  const isActive = activeWidgetList.has(placeholder.__widgetName);
  if (!isActive) {
    console.warn(`Widget "${placeholder.__widgetName}" is inactive. Rendering placeholder.`); // Log warning if widget is inactive
    return {
      __widgetId: placeholder.__widgetId,
      Name: placeholder.__widgetName,
      component: new MissingWidget({ props: { 'config': placeholder } }), // Use the placeholder widget
      config: placeholder.__widgetConfig
    };
  }

  // Find the widget by UUID
  const widgetFn = Array.from(widgetFunctions.values()).find((widget) => widget.__widgetId === placeholder.__widgetId);

  if (!widgetFn) {
    throw new Error(`Widget with ID ${placeholder.__widgetId} not found`); // Throw error if widget not found
  }

  return widgetFn(placeholder.__widgetConfig); // Return the resolved widget
}

// Function to check if a widget is available
export function isWidgetAvailable(widgetName: string): boolean {
  const widgetFn = widgetFunctions.get(widgetName); // Get widget function
  const isActive = activeWidgetList.has(widgetName); // Check if widget is active
  return !!widgetFn && isActive; // Return true if widget is available and active
}

// Function to get all widget functions
export function getWidgets() {
  return widgetFunctions; // Return widget functions
}

// Function to get active widgets
export function getActiveWidgets() {
  return activeWidgetList; // Return active widgets
}

// Function to update widget status
export async function updateWidgetStatus(widgetName: string, status: WidgetStatus): Promise<void> {
  try {
    // Update the database
    await updateWidgetStatusInDatabase(widgetName, status === 'active');

    // Update the active widget list
    if (status === 'active') {
      activeWidgetList = new Set(activeWidgetList).add(widgetName); // Add widget to active list
    } else if (status === 'inactive') {
      activeWidgetList = new Set(activeWidgetList);
      activeWidgetList.delete(widgetName); // Remove widget from active list
    }

    logger.info(`Widget ${widgetName} ${status} status updated successfully`); // Log success message
  } catch (error) {
    logger.error(`Error updating widget status:`, error); // Log error
    throw error; // Re-throw error
  }
}

// Function to get widget configuration
export function getWidgetConfig(widgetName: string) {
  const widget = widgetFunctions.get(widgetName); // Get widget function
  return widget ? widget({}).config : undefined; // Return widget configuration
}

// Function to update widget configuration
export async function updateWidgetConfig(widgetName: string, config: Record<string, unknown>): Promise<void> {
  const widget = widgetFunctions.get(widgetName); // Get widget function
  if (!widget) return;

  const updatedWidget: WidgetFunction = (cfg: Record<string, unknown>) => ({
    ...widget(cfg),
    config: { ...widget(cfg).config, ...config } // Update widget configuration
  });
  widgetFunctions = new Map(widgetFunctions).set(widgetName, updatedWidget); // Update widget in the map
}

// Function to load all widgets
export async function loadWidgets(): Promise<Map<string, Widget>> {
  initializeWidgets(); // Ensure widgets are initialized
  const widgets = new Map<string, Widget>(); // Map to store widgets
  for (const [name, widgetFn] of widgetFunctions.entries()) {
    widgets.set(name, widgetFn({})); // Add widget to map
  }
  return widgets; // Return widgets
}

// Function to initialize widgets
async function initializeWidgets(): Promise<void> {
  if (widgetFunctions.size > 0) return;

  try {
    // Initialize database connection first
    //await initializeDatabase();

    // Search both core and custom widget directories
    const modules = import.meta.glob<WidgetModule>(['./core/*/index.ts', './custom/*/index.ts'], { eager: true });

    const widgetModules = Object.entries(modules).map(([path, module]) => {
      try {
        // Extract widget name from path (e.g., './core/mediaUpload/index.ts' -> 'mediaUpload')
        const name = path.split('/').at(-2);
        if (!name) {
          logger.warn(`Skipping widget module: ${path} - Unable to extract widget name`);
          return null;
        }

        if (typeof module.default !== 'function') {
          logger.warn(`Skipping widget module: ${path} - No valid widget function found`);
          return null;
        }

        return { name, module };
      } catch (error) {
        logger.error(`Failed to process widget module ${path}:`, error);
        return null;
      }
    });

    const validModules = widgetModules.filter((m): m is NonNullable<typeof m> => m !== null);

    if (validModules.length === 0) {
      throw new Error('No valid widgets found');
    }

    const newWidgetFunctions: Map<string, WidgetFunction> = new Map();

    for (const { name, module } of validModules) {
      const widgetFn = module.default;
      widgetFn.name = widgetFn.name || name;
      const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
      newWidgetFunctions.set(capitalizedName, widgetFn);
    }

    widgetFunctions = newWidgetFunctions;
    logger.info(`${newWidgetFunctions.size} Widgets initialized successfully`);
  } catch (error) {
    logger.error('Failed to initialize widgets:', error);
    throw error;
  }
}

// HMR setup
if (import.meta.hot) {
  import.meta.hot.accept(['./core/*/index.ts', './custom/*/index.ts'], () => {
    initializeWidgets();
    logger.info('Widgets reloaded due to file changes.');
  });
}
