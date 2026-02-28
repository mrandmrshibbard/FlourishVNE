/**
 * Plugin Reducer
 * Handles all plugin-related state actions: install, enable, disable, uninstall, configure.
 */

import { VNProject } from '../../../types/project';
import { VNPlugin, PluginRegistryEntry } from '../../../types/plugins';

export type PluginAction =
    | { type: 'INSTALL_PLUGIN'; payload: { plugin: VNPlugin } }
    | { type: 'UNINSTALL_PLUGIN'; payload: { pluginId: string } }
    | { type: 'ENABLE_PLUGIN'; payload: { pluginId: string } }
    | { type: 'DISABLE_PLUGIN'; payload: { pluginId: string } }
    | { type: 'UPDATE_PLUGIN_CONFIG'; payload: { pluginId: string; config: Record<string, any> } }
    | { type: 'UPDATE_PLUGIN_REGISTRY'; payload: { pluginId: string; entry: Partial<PluginRegistryEntry> } };

export const pluginReducer = (state: VNProject, action: PluginAction): VNProject => {
    switch (action.type) {
        case 'INSTALL_PLUGIN': {
            const { plugin } = action.payload;
            const plugins = state.plugins || {};
            const registry = state.pluginRegistry || {};

            return {
                ...state,
                plugins: {
                    ...plugins,
                    [plugin.manifest.id]: plugin,
                },
                pluginRegistry: {
                    ...registry,
                    [plugin.manifest.id]: {
                        pluginId: plugin.manifest.id,
                        enabled: true,
                        config: plugin.config || {},
                        registeredCommands: [],
                        registeredEffects: [],
                    },
                },
            };
        }

        case 'UNINSTALL_PLUGIN': {
            const { pluginId } = action.payload;
            const plugins = { ...(state.plugins || {}) };
            const registry = { ...(state.pluginRegistry || {}) };
            delete plugins[pluginId];
            delete registry[pluginId];

            return {
                ...state,
                plugins,
                pluginRegistry: registry,
            };
        }

        case 'ENABLE_PLUGIN': {
            const { pluginId } = action.payload;
            const plugins = state.plugins || {};
            const registry = state.pluginRegistry || {};
            const plugin = plugins[pluginId];
            if (!plugin) return state;

            return {
                ...state,
                plugins: {
                    ...plugins,
                    [pluginId]: { ...plugin, state: 'enabled', lastToggled: new Date().toISOString() },
                },
                pluginRegistry: {
                    ...registry,
                    [pluginId]: { ...registry[pluginId], enabled: true },
                },
            };
        }

        case 'DISABLE_PLUGIN': {
            const { pluginId } = action.payload;
            const plugins = state.plugins || {};
            const registry = state.pluginRegistry || {};
            const plugin = plugins[pluginId];
            if (!plugin) return state;

            return {
                ...state,
                plugins: {
                    ...plugins,
                    [pluginId]: { ...plugin, state: 'disabled', lastToggled: new Date().toISOString() },
                },
                pluginRegistry: {
                    ...registry,
                    [pluginId]: { ...registry[pluginId], enabled: false },
                },
            };
        }

        case 'UPDATE_PLUGIN_CONFIG': {
            const { pluginId, config } = action.payload;
            const plugins = state.plugins || {};
            const registry = state.pluginRegistry || {};
            const plugin = plugins[pluginId];
            if (!plugin) return state;

            return {
                ...state,
                plugins: {
                    ...plugins,
                    [pluginId]: { ...plugin, config },
                },
                pluginRegistry: {
                    ...registry,
                    [pluginId]: { ...registry[pluginId], config },
                },
            };
        }

        case 'UPDATE_PLUGIN_REGISTRY': {
            const { pluginId, entry } = action.payload;
            const registry = state.pluginRegistry || {};
            const existing = registry[pluginId];
            if (!existing) return state;

            return {
                ...state,
                pluginRegistry: {
                    ...registry,
                    [pluginId]: { ...existing, ...entry },
                },
            };
        }

        default:
            return state;
    }
};
