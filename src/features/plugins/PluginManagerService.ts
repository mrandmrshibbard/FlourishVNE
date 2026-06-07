/**
 * Plugin Manager Service
 *
 * Manages plugin lifecycle: installing, enabling, disabling, and providing the
 * PluginAPI to plugins. The API is backed by a host bridge (editor-level: project,
 * dispatch, toast) and an optional runtime bridge (set by LivePreview during play)
 * so getVariable/setVariable read & write LIVE game state while playing.
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

/** Current engine version (for engineVersion dependency checks). */
export const ENGINE_VERSION = '2.0.0';

type VarValue = string | number | boolean;
type NotifyType = 'info' | 'success' | 'warning' | 'error';

/** Editor-level host bridge (always present once the app mounts). */
export interface PluginHostBridge {
    getProject: () => VNProject | null;
    dispatch: (action: any) => void;
    notify: (message: string, type?: NotifyType) => void;
}

/** Runtime bridge — set by LivePreview during gameplay so variable access is live. */
export interface PluginRuntimeBridge {
    getVariable: (nameOrId: string) => VarValue | undefined;
    setVariable: (nameOrId: string, value: VarValue) => void;
    notify?: (message: string, type?: NotifyType) => void;
}

const compareVersions = (a: string, b: string): number => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d;
    }
    return 0;
};

/**
 * Singleton service that manages the plugin lifecycle and registry.
 */
export class PluginManagerService {
    private static instance: PluginManagerService;
    private loadedPlugins = new Map<string, { hooks: PluginHooks; api: PluginAPI }>();
    private registeredCommands = new Map<string, { def: CustomCommandDefinition; pluginId: string }>();
    private registeredEffects = new Map<string, { def: CustomEffectDefinition; pluginId: string }>();
    private listeners = new Set<() => void>();

    private host: PluginHostBridge | null = null;
    private runtime: PluginRuntimeBridge | null = null;

    private constructor() {}

    static getInstance(): PluginManagerService {
        if (!PluginManagerService.instance) {
            PluginManagerService.instance = new PluginManagerService();
        }
        return PluginManagerService.instance;
    }

    /** Set the editor-level host bridge (project/dispatch/toast). Called once at app mount. */
    setHost(bridge: PluginHostBridge): void {
        this.host = bridge;
    }

    /** Set (or clear with null) the runtime bridge for live variable access during play. */
    setRuntime(bridge: PluginRuntimeBridge | null): void {
        this.runtime = bridge;
    }

    // ── Lifecycle (signatures match PluginManagerUI usage) ────────────────────

    /**
     * Install a plugin from source: validate, check deps/engine, dispatch INSTALL,
     * load hooks, and fire onLoad/onEnable. Returns the created VNPlugin (throws on error).
     */
    loadPlugin(source: string, project: VNProject, dispatch: (action: any) => void): VNPlugin {
        const manifest = this.extractManifest(source);
        if (!manifest) throw new Error('Plugin must define a `manifest` object.');

        const { valid, errors } = validatePluginManifest(manifest);
        if (!valid) throw new Error(errors.join(' '));

        if ((project.plugins || {})[manifest.id]) {
            throw new Error(`A plugin with id "${manifest.id}" is already installed.`);
        }

        // Engine version requirement
        if (manifest.engineVersion && compareVersions(manifest.engineVersion, ENGINE_VERSION) > 0) {
            throw new Error(`Requires engine ${manifest.engineVersion}+ (current: ${ENGINE_VERSION}).`);
        }
        // Dependencies must already be installed
        for (const dep of manifest.dependencies || []) {
            if (!(project.plugins || {})[dep]) {
                throw new Error(`Missing dependency: "${dep}". Install it first.`);
            }
        }

        const plugin = createPlugin(manifest, source, {});
        dispatch({ type: 'INSTALL_PLUGIN', payload: { plugin } });

        // Load hooks against a fresh API and fire onLoad + onEnable.
        const api = this.createPluginAPI(manifest);
        const hooks = this.parsePluginSource(source, api);
        this.loadedPlugins.set(manifest.id, { hooks, api });
        try { hooks.onLoad?.(api); } catch (e) { console.error(`[Plugin ${manifest.id}] onLoad failed:`, e); }
        try { hooks.onEnable?.(api); } catch (e) { console.error(`[Plugin ${manifest.id}] onEnable failed:`, e); }
        this.notifyListeners();
        return plugin;
    }

    enablePlugin(pluginId: string, project: VNProject, dispatch: (action: any) => void): void {
        dispatch({ type: 'ENABLE_PLUGIN', payload: { pluginId } });
        const plugin = (project.plugins || {})[pluginId];
        if (!plugin) return;
        let loaded = this.loadedPlugins.get(pluginId);
        if (!loaded) {
            const api = this.createPluginAPI(plugin.manifest);
            const hooks = this.parsePluginSource(plugin.source, api);
            loaded = { hooks, api };
            this.loadedPlugins.set(pluginId, loaded);
            try { loaded.hooks.onLoad?.(loaded.api); } catch (e) { console.error(e); }
        }
        try { loaded.hooks.onEnable?.(loaded.api); } catch (e) { console.error(`[Plugin ${pluginId}] onEnable failed:`, e); }
        this.notifyListeners();
    }

    disablePlugin(pluginId: string, _project: VNProject, dispatch: (action: any) => void): void {
        dispatch({ type: 'DISABLE_PLUGIN', payload: { pluginId } });
        const loaded = this.loadedPlugins.get(pluginId);
        try { loaded?.hooks.onDisable?.(loaded.api); } catch (e) { console.error(`[Plugin ${pluginId}] onDisable failed:`, e); }
        this.unregisterFor(pluginId);
        this.loadedPlugins.delete(pluginId);
        this.notifyListeners();
    }

    uninstallPlugin(pluginId: string, dispatch: (action: any) => void): void {
        const loaded = this.loadedPlugins.get(pluginId);
        try { loaded?.hooks.onUninstall?.(loaded.api); } catch (e) { console.error(`[Plugin ${pluginId}] onUninstall failed:`, e); }
        this.unregisterFor(pluginId);
        this.loadedPlugins.delete(pluginId);
        dispatch({ type: 'UNINSTALL_PLUGIN', payload: { pluginId } });
        this.notifyListeners();
    }

    /** Ensure exactly the project's enabled plugins are loaded (load missing, unload stale). */
    ensureLoaded(project: VNProject): void {
        const plugins = project.plugins || {};
        const enabledIds = new Set(Object.values(plugins).filter(p => p.state === 'enabled').map(p => p.manifest.id));

        // Unload plugins that are no longer enabled/present (e.g. after switching projects).
        for (const id of Array.from(this.loadedPlugins.keys())) {
            if (!enabledIds.has(id)) {
                this.unregisterFor(id);
                this.loadedPlugins.delete(id);
            }
        }

        for (const plugin of Object.values(plugins)) {
            if (plugin.state !== 'enabled') continue;
            if (this.loadedPlugins.has(plugin.manifest.id)) continue;
            try {
                const api = this.createPluginAPI(plugin.manifest);
                const hooks = this.parsePluginSource(plugin.source, api);
                this.loadedPlugins.set(plugin.manifest.id, { hooks, api });
                hooks.onLoad?.(api);
                hooks.onEnable?.(api);
            } catch (e) {
                console.error(`[Plugin ${plugin.manifest.id}] failed to load:`, e);
            }
        }
        this.notifyListeners();
    }

    private unregisterFor(pluginId: string): void {
        for (const [key, v] of Array.from(this.registeredCommands.entries())) {
            if (v.pluginId === pluginId) this.registeredCommands.delete(key);
        }
        for (const [key, v] of Array.from(this.registeredEffects.entries())) {
            if (v.pluginId === pluginId) this.registeredEffects.delete(key);
        }
    }

    // ── Registries (read by the palette / inspector / executor) ───────────────

    getRegisteredCommands(): CustomCommandDefinition[] {
        return Array.from(this.registeredCommands.values()).map(v => v.def);
    }

    getCommand(type: string): CustomCommandDefinition | undefined {
        return this.registeredCommands.get(type)?.def;
    }

    getRegisteredEffects(): CustomEffectDefinition[] {
        return Array.from(this.registeredEffects.values()).map(v => v.def);
    }

    getEffect(type: string): CustomEffectDefinition | undefined {
        return this.registeredEffects.get(type)?.def;
    }

    /** Get the live PluginAPI for a loaded plugin (used to run a custom command's handler). */
    getApi(pluginId: string): PluginAPI | undefined {
        return this.loadedPlugins.get(pluginId)?.api;
    }

    /** The plugin id that owns a registered command type (e.g. "pluginId.cmd" → "pluginId"). */
    getCommandOwner(type: string): string | undefined {
        return this.registeredCommands.get(type)?.pluginId;
    }

    // ── Hooks ─────────────────────────────────────────────────────────────────

    /** Invoke a lifecycle hook across all loaded plugins (synchronous; errors isolated). */
    invokeHook(hookName: keyof PluginHooks, ...args: any[]): void {
        for (const [pluginId, loaded] of this.loadedPlugins.entries()) {
            const fn = loaded.hooks[hookName];
            if (typeof fn === 'function') {
                try { (fn as Function)(loaded.api, ...args); }
                catch (err) { console.error(`[PluginManager] Hook ${hookName} failed for ${pluginId}:`, err); }
            }
        }
    }

    // ── Listeners ─────────────────────────────────────────────────────────────

    addListener(cb: () => void): void { this.listeners.add(cb); }
    removeListener(cb: () => void): void { this.listeners.delete(cb); }
    private notifyListeners(): void { this.listeners.forEach(cb => { try { cb(); } catch {} }); }

    // ── Source parsing / sandbox ──────────────────────────────────────────────

    /** Extract just the manifest from source (run in a throwaway sandbox), for validation. */
    private extractManifest(source: string): PluginManifest | null {
        try {
            const fn = new Function(`
                "use strict";
                ${this.sandboxPreamble()}
                ${source}
                return typeof manifest !== 'undefined' ? manifest : (typeof plugin !== 'undefined' && plugin ? plugin.manifest : undefined);
            `);
            return fn() || null;
        } catch (err) {
            console.error('[PluginManager] Failed to read manifest:', err);
            return null;
        }
    }

    private sandboxPreamble(): string {
        const blocked = [
            'document', 'window', 'globalThis', 'self',
            'fetch', 'XMLHttpRequest', 'WebSocket',
            'localStorage', 'sessionStorage', 'indexedDB',
            'eval', 'Function',
            'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
            'requestAnimationFrame', 'queueMicrotask', 'importScripts', 'require',
        ];
        return blocked.map(g => `var ${g} = undefined;`).join('\n');
    }

    private parsePluginSource(source: string, api: PluginAPI): PluginHooks {
        try {
            if (/\.\s*constructor\b/.test(source)) {
                throw new Error('Access to ".constructor" is blocked in the plugin sandbox.');
            }
            const hooksFn = new Function('api', `
                "use strict";
                ${this.sandboxPreamble()}
                ${source}
                return typeof plugin !== 'undefined' ? plugin : {};
            `);
            return (hooksFn(api) || {}) as PluginHooks;
        } catch (err) {
            console.error('[PluginManager] Failed to parse plugin source:', err);
            this.host?.notify(`Plugin failed to load: ${(err as Error).message}`, 'error');
            return {};
        }
    }

    // ── PluginAPI ─────────────────────────────────────────────────────────────

    private createPluginAPI(manifest: PluginManifest): PluginAPI {
        const pluginId = manifest.id;
        const self = this;
        const project = () => self.host?.getProject() || null;

        return {
            manifest,

            getVariable: (nameOrId: string) => {
                if (self.runtime) return self.runtime.getVariable(nameOrId);
                // Editor (not playing): fall back to the variable's default value.
                const p = project();
                if (!p) return undefined;
                const v = p.variables[nameOrId] || Object.values(p.variables).find(x => x.name.toLowerCase() === nameOrId.toLowerCase());
                return v ? v.defaultValue : undefined;
            },

            setVariable: (nameOrId: string, value: VarValue) => {
                if (self.runtime) { self.runtime.setVariable(nameOrId, value); return; }
                console.warn(`[Plugin ${pluginId}] setVariable("${nameOrId}") ignored — only writable during gameplay.`);
            },

            getProjectInfo: () => {
                const p = project();
                return {
                    title: p?.title || '',
                    version: p?.version,
                    sceneCount: p ? Object.keys(p.scenes).length : 0,
                    characterCount: p ? Object.keys(p.characters).length : 0,
                };
            },

            getScenes: () => {
                const p = project();
                return p ? Object.entries(p.scenes).map(([id, scene]) => ({ id, name: scene.name })) : [];
            },

            getCharacters: () => {
                const p = project();
                return p ? Object.entries(p.characters).map(([id, char]) => ({ id, name: char.name })) : [];
            },

            notify: (message: string, type?: NotifyType) => {
                (self.runtime?.notify || self.host?.notify)?.(message, type);
            },

            log: (...args: any[]) => console.log(`[Plugin ${pluginId}]`, ...args),

            getConfig: () => {
                // Merge declared setting defaults with the user's saved config overrides.
                const defaults: Record<string, any> = {};
                for (const f of manifest.settings || []) if (f.defaultValue !== undefined) defaults[f.name] = f.defaultValue;
                const saved = project()?.plugins?.[pluginId]?.config || {};
                return { ...defaults, ...saved };
            },

            getStorage: (key: string) => {
                const p = project();
                return p?.pluginStorage?.[pluginId]?.[key];
            },

            setStorage: (key: string, value: any) => {
                self.host?.dispatch({ type: 'SET_PLUGIN_STORAGE', payload: { pluginId, key, value } });
            },

            registerCommand: (commandDef: CustomCommandDefinition) => {
                const fullType = commandDef.type.startsWith(pluginId + '.') ? commandDef.type : `${pluginId}.${commandDef.type}`;
                self.registeredCommands.set(fullType, { def: { ...commandDef, type: fullType }, pluginId });
                self.notifyListeners();
            },

            registerEffect: (effectDef: CustomEffectDefinition) => {
                const fullType = effectDef.type.startsWith(pluginId + '.') ? effectDef.type : `${pluginId}.${effectDef.type}`;
                self.registeredEffects.set(fullType, { def: { ...effectDef, type: fullType }, pluginId });
                self.notifyListeners();
            },
        };
    }
}

/** Create a VNPlugin record from a manifest + source. */
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

/** Validate a plugin manifest. */
export function validatePluginManifest(manifest: Partial<PluginManifest>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!manifest.id || !/^[a-z0-9.-]+$/i.test(manifest.id)) {
        errors.push('Plugin ID must contain only alphanumeric characters, dots, and hyphens.');
    }
    if (!manifest.name || manifest.name.trim().length === 0) errors.push('Plugin name is required.');
    if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
        errors.push('Plugin version must follow semantic versioning (e.g. 1.0.0).');
    }
    if (!manifest.description) errors.push('Plugin description is required.');
    if (!manifest.author) errors.push('Plugin author is required.');
    if (!manifest.category) errors.push('Plugin category is required.');
    return { valid: errors.length === 0, errors };
}

/** Singleton instance export. */
export const pluginManager = PluginManagerService.getInstance();
