/**
 * Plugin Manager Service
 * 
 * Manages plugin lifecycle: loading, enabling, disabling, and
 * providing the PluginAPI to plugins at runtime.
 */

import { VNProject } from '../../types/project';
import {
    VNPlugin,
    PluginManifest,
    PluginHooks,
    PluginAPI,
    CustomCommandDefinition,
    CustomEffectDefinition,
} from '../../types/plugins';
import { VNID } from '../../types';

/**
 * Singleton service that manages the plugin lifecycle and registry.
 */
export class PluginManagerService {
    private static instance: PluginManagerService;
    private loadedPlugins = new Map<string, { hooks: PluginHooks; api: PluginAPI }>();
    private registeredCommands = new Map<string, CustomCommandDefinition>();
    private registeredEffects = new Map<string, CustomEffectDefinition>();
    private pluginStorage = new Map<string, Record<string, any>>();
    private listeners = new Set<() => void>();

    private constructor() {}

    static getInstance(): PluginManagerService {
        if (!PluginManagerService.instance) {
            PluginManagerService.instance = new PluginManagerService();
        }
        return PluginManagerService.instance;
    }

    /**
     * Load and initialise a plugin from its source code.
     */
    async loadPlugin(plugin: VNPlugin, project: VNProject): Promise<{ success: boolean; error?: string }> {
        try {
            if (this.loadedPlugins.has(plugin.manifest.id)) {
                return { success: true }; // Already loaded
            }

            const api = this.createPluginAPI(plugin.manifest, project);
            const hooks = this.parsePluginSource(plugin.source, api);

            this.loadedPlugins.set(plugin.manifest.id, { hooks, api });

            // Call onLoad hook
            if (hooks.onLoad) {
                await hooks.onLoad(api);
            }

            // If enabled, call onEnable
            if (plugin.state === 'enabled' && hooks.onEnable) {
                await hooks.onEnable(api);
            }

            this.notifyListeners();
            return { success: true };
        } catch (err: any) {
            console.error(`[PluginManager] Failed to load plugin "${plugin.manifest.name}":`, err);
            return { success: false, error: err.message || String(err) };
        }
    }

    /**
     * Enable a plugin.
     */
    async enablePlugin(pluginId: string): Promise<void> {
        const loaded = this.loadedPlugins.get(pluginId);
        if (loaded?.hooks.onEnable) {
            await loaded.hooks.onEnable(loaded.api);
        }
        this.notifyListeners();
    }

    /**
     * Disable a plugin.
     */
    async disablePlugin(pluginId: string): Promise<void> {
        const loaded = this.loadedPlugins.get(pluginId);
        if (loaded?.hooks.onDisable) {
            await loaded.hooks.onDisable(loaded.api);
        }
        // Unregister commands and effects from this plugin
        for (const [key, cmd] of this.registeredCommands.entries()) {
            if (key.startsWith(pluginId + '.')) {
                this.registeredCommands.delete(key);
            }
        }
        for (const [key, effect] of this.registeredEffects.entries()) {
            if (key.startsWith(pluginId + '.')) {
                this.registeredEffects.delete(key);
            }
        }
        this.notifyListeners();
    }

    /**
     * Uninstall a plugin.
     */
    async uninstallPlugin(pluginId: string): Promise<void> {
        const loaded = this.loadedPlugins.get(pluginId);
        if (loaded?.hooks.onUninstall) {
            await loaded.hooks.onUninstall(loaded.api);
        }
        this.loadedPlugins.delete(pluginId);
        this.pluginStorage.delete(pluginId);
        // Cleanup registrations
        for (const key of Array.from(this.registeredCommands.keys())) {
            if (key.startsWith(pluginId + '.')) this.registeredCommands.delete(key);
        }
        for (const key of Array.from(this.registeredEffects.keys())) {
            if (key.startsWith(pluginId + '.')) this.registeredEffects.delete(key);
        }
        this.notifyListeners();
    }

    /**
     * Get all registered custom commands across all enabled plugins.
     */
    getRegisteredCommands(): CustomCommandDefinition[] {
        return Array.from(this.registeredCommands.values());
    }

    /**
     * Get all registered custom effects across all enabled plugins.
     */
    getRegisteredEffects(): CustomEffectDefinition[] {
        return Array.from(this.registeredEffects.values());
    }

    /**
     * Invoke a lifecycle hook across all enabled plugins.
     */
    async invokeHook(hookName: keyof PluginHooks, ...args: any[]): Promise<void> {
        for (const [pluginId, loaded] of this.loadedPlugins.entries()) {
            const hookFn = loaded.hooks[hookName];
            if (hookFn && typeof hookFn === 'function') {
                try {
                    await (hookFn as Function)(loaded.api, ...args);
                } catch (err) {
                    console.error(`[PluginManager] Hook ${hookName} failed for plugin ${pluginId}:`, err);
                }
            }
        }
    }

    /**
     * Add a listener for plugin registry changes.
     */
    addListener(callback: () => void): void {
        this.listeners.add(callback);
    }

    /**
     * Remove a listener.
     */
    removeListener(callback: () => void): void {
        this.listeners.delete(callback);
    }

    private notifyListeners(): void {
        this.listeners.forEach(cb => {
            try { cb(); } catch {}
        });
    }

    /**
     * Parse plugin source code and extract hooks.
     */
    private parsePluginSource(source: string, api: PluginAPI): PluginHooks {
        try {
            // Plugin source should export an object with hook functions.
            // We wrap it in a function that returns the hooks object.
            const hooksFn = new Function('api', `
                "use strict";
                var document = undefined;
                var window = undefined;
                var globalThis = undefined;
                var fetch = undefined;
                var XMLHttpRequest = undefined;
                var WebSocket = undefined;
                var eval = undefined;
                ${source}
                return typeof plugin !== 'undefined' ? plugin : {};
            `);
            const hooks = hooksFn(api);
            return hooks as PluginHooks;
        } catch (err: any) {
            console.error('[PluginManager] Failed to parse plugin source:', err);
            return {};
        }
    }

    /**
     * Create the PluginAPI object for a specific plugin.
     */
    private createPluginAPI(manifest: PluginManifest, project: VNProject): PluginAPI {
        const pluginId = manifest.id;

        // Ensure storage exists for this plugin
        if (!this.pluginStorage.has(pluginId)) {
            this.pluginStorage.set(pluginId, {});
            // Try to load from localStorage
            try {
                const stored = localStorage.getItem(`flourish_plugin_${pluginId}`);
                if (stored) {
                    this.pluginStorage.set(pluginId, JSON.parse(stored));
                }
            } catch {}
        }

        const self = this;

        return {
            manifest,

            getVariable: (nameOrId: string) => {
                if (project.variables[nameOrId]) {
                    return undefined; // We don't have runtime state here
                }
                return undefined;
            },

            setVariable: (nameOrId: string, value: string | number | boolean) => {
                console.log(`[Plugin ${pluginId}] setVariable:`, nameOrId, value);
            },

            getProjectInfo: () => ({
                title: project.title,
                version: project.version,
                sceneCount: Object.keys(project.scenes).length,
                characterCount: Object.keys(project.characters).length,
            }),

            getScenes: () => Object.entries(project.scenes).map(([id, scene]) => ({
                id,
                name: scene.name,
            })),

            getCharacters: () => Object.entries(project.characters).map(([id, char]) => ({
                id,
                name: char.name,
            })),

            notify: (message: string, type?: 'info' | 'warning' | 'error') => {
                console.log(`[Plugin ${pluginId}] [${type || 'info'}] ${message}`);
            },

            log: (...args: any[]) => {
                console.log(`[Plugin ${pluginId}]`, ...args);
            },

            getStorage: (key: string) => {
                const storage = self.pluginStorage.get(pluginId) || {};
                return storage[key];
            },

            setStorage: (key: string, value: any) => {
                const storage = self.pluginStorage.get(pluginId) || {};
                storage[key] = value;
                self.pluginStorage.set(pluginId, storage);
                try {
                    localStorage.setItem(`flourish_plugin_${pluginId}`, JSON.stringify(storage));
                } catch {}
            },

            registerCommand: (commandDef: CustomCommandDefinition) => {
                const fullType = `${pluginId}.${commandDef.type}`;
                self.registeredCommands.set(fullType, { ...commandDef, type: fullType });
                console.log(`[Plugin ${pluginId}] Registered command: ${fullType}`);
                self.notifyListeners();
            },

            registerEffect: (effectDef: CustomEffectDefinition) => {
                const fullType = `${pluginId}.${effectDef.type}`;
                self.registeredEffects.set(fullType, { ...effectDef, type: fullType });
                console.log(`[Plugin ${pluginId}] Registered effect: ${fullType}`);
                self.notifyListeners();
            },
        };
    }
}

/**
 * Create a plugin from user-provided information.
 */
export function createPlugin(
    manifest: PluginManifest,
    source: string,
    config: Record<string, any> = {}
): VNPlugin {
    return {
        manifest,
        state: 'enabled',
        installedAt: new Date().toISOString(),
        config,
        source,
    };
}

/**
 * Validate a plugin manifest.
 */
export function validatePluginManifest(manifest: Partial<PluginManifest>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest.id || !/^[a-z0-9.-]+$/i.test(manifest.id)) {
        errors.push('Plugin ID must contain only alphanumeric characters, dots, and hyphens.');
    }
    if (!manifest.name || manifest.name.trim().length === 0) {
        errors.push('Plugin name is required.');
    }
    if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
        errors.push('Plugin version must follow semantic versioning (e.g. 1.0.0).');
    }
    if (!manifest.description) {
        errors.push('Plugin description is required.');
    }
    if (!manifest.author) {
        errors.push('Plugin author is required.');
    }
    if (!manifest.category) {
        errors.push('Plugin category is required.');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Singleton instance export.
 */
export const pluginManager = PluginManagerService.getInstance();
