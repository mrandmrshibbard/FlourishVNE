/**
 * Plugin/Extension System Types
 * 
 * Defines the type system for FlourishVNE's plugin architecture.
 * Plugins can extend the engine with custom commands, UI panels,
 * asset processors, and runtime behaviours.
 */

import { VNID } from './index';

/**
 * Plugin manifest — describes a plugin's capabilities and metadata.
 */
export interface PluginManifest {
    /** Unique plugin identifier (reverse-domain style, e.g. "com.author.my-plugin") */
    id: string;
    /** Display name */
    name: string;
    /** Semantic version string */
    version: string;
    /** Short description */
    description: string;
    /** Author name */
    author: string;
    /** Author website or repository URL */
    url?: string;
    /** Minimum FlourishVNE engine version required */
    engineVersion?: string;
    /** Plugin category for organisation */
    category: PluginCategory;
    /** Capabilities this plugin provides */
    capabilities: PluginCapability[];
    /** Other plugin IDs this plugin depends on */
    dependencies?: string[];
    /** Plugin icon as a data URL or relative path */
    icon?: string;
    /** License identifier (e.g. "MIT", "CC-BY-4.0") */
    license?: string;
    /** Tags for searchability */
    tags?: string[];
    /** Optional user-editable settings schema. Rendered as a form in the plugin's Details view;
     *  values are stored in the plugin's config and read at runtime via `api.getConfig()`. */
    settings?: PluginSettingField[];
}

/** A single user-editable plugin setting (rendered as a form field in Plugin Details). */
export interface PluginSettingField {
    /** Key used in the config object (and api.getConfig()). */
    name: string;
    /** Display label (defaults to `name`). */
    label?: string;
    /** Field type. */
    type: 'string' | 'number' | 'boolean' | 'select';
    /** Default value when the user hasn't set one. */
    defaultValue?: string | number | boolean;
    /** Options for `select`. */
    options?: Array<{ label: string; value: string }>;
}

export type PluginCategory =
    | 'commands'       // Adds custom command types
    | 'effects'        // Visual/audio effects
    | 'ui'             // UI extensions (panels, themes)
    | 'assets'         // Asset processors/importers
    | 'gameplay'       // Gameplay mechanics (inventory, stats)
    | 'integration'    // Third-party integrations
    | 'utility';       // General utilities

export type PluginCapability =
    | 'custom-commands'
    | 'custom-effects'
    | 'ui-panels'
    | 'asset-processing'
    | 'runtime-hooks'
    | 'variable-types'
    | 'export-targets';

/**
 * A registered plugin instance.
 */
export interface VNPlugin {
    /** The plugin manifest */
    manifest: PluginManifest;
    /** Current state */
    state: PluginState;
    /** When the plugin was installed */
    installedAt: string;
    /** When the plugin was last enabled/disabled */
    lastToggled?: string;
    /** Plugin configuration set by the user */
    config: Record<string, any>;
    /** The plugin's source code (JavaScript) */
    source: string;
}

export type PluginState = 'installed' | 'enabled' | 'disabled' | 'error';

/**
 * Plugin lifecycle hooks that a plugin can implement.
 */
export interface PluginHooks {
    /** Called when the plugin is first loaded */
    onLoad?: (api: PluginAPI) => void | Promise<void>;
    /** Called when the plugin is enabled */
    onEnable?: (api: PluginAPI) => void | Promise<void>;
    /** Called when the plugin is disabled */
    onDisable?: (api: PluginAPI) => void | Promise<void>;
    /** Called when the plugin is uninstalled */
    onUninstall?: (api: PluginAPI) => void | Promise<void>;
    /** Called before a game build starts */
    onPreBuild?: (api: PluginAPI) => void | Promise<void>;
    /** Called after a game build completes */
    onPostBuild?: (api: PluginAPI) => void | Promise<void>;
    /** Called when the game runtime initialises */
    onRuntimeInit?: (api: PluginAPI) => void | Promise<void>;
    /** Called each frame during gameplay (use sparingly) */
    onRuntimeTick?: (api: PluginAPI, deltaMs: number) => void;
    /** Called when a command is about to execute (can modify/intercept) */
    onBeforeCommand?: (api: PluginAPI, command: any) => any | null;
    /** Called after a command has executed */
    onAfterCommand?: (api: PluginAPI, command: any, result: any) => void;
    /** Called when a scene changes */
    onSceneChange?: (api: PluginAPI, fromSceneId: string, toSceneId: string) => void;
    /** Called when a variable's value changes at runtime */
    onVariableChange?: (api: PluginAPI, variableId: string, oldValue: any, newValue: any) => void;
    /** Called before the game state is saved (may mutate the passed saveData object) */
    onSave?: (api: PluginAPI, saveData: any) => void;
    /** Called after a save is loaded */
    onLoadAfterSave?: (api: PluginAPI, saveData: any) => void;
}

/**
 * The API exposed to plugins for interacting with the engine.
 */
export interface PluginAPI {
    /** Plugin's own manifest */
    manifest: PluginManifest;

    // --- Variable access ---
    /** Get a variable value */
    getVariable: (nameOrId: string) => string | number | boolean | undefined;
    /** Set a variable value */
    setVariable: (nameOrId: string, value: string | number | boolean) => void;

    // --- Project access (read-only) ---
    /** Get the current project metadata */
    getProjectInfo: () => { title: string; version?: string; sceneCount: number; characterCount: number };
    /** List all scene names and IDs */
    getScenes: () => Array<{ id: string; name: string }>;
    /** List all character names and IDs */
    getCharacters: () => Array<{ id: string; name: string }>;

    // --- UI ---
    /** Show a notification */
    notify: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    /** Log to the engine console */
    log: (...args: any[]) => void;

    // --- Settings / config ---
    /** Read this plugin's user-configured settings (manifest.settings defaults merged with overrides). */
    getConfig: () => Record<string, any>;

    // --- Storage ---
    /** Get a value from plugin-scoped persistent storage */
    getStorage: (key: string) => any;
    /** Set a value in plugin-scoped persistent storage */
    setStorage: (key: string, value: any) => void;

    // --- Registration ---
    /** Register a custom command type */
    registerCommand: (commandDef: CustomCommandDefinition) => void;
    /** Register a custom effect */
    registerEffect: (effectDef: CustomEffectDefinition) => void;
}

/**
 * A custom command definition provided by a plugin.
 */
export interface CustomCommandDefinition {
    /** Unique command type identifier (e.g. "myPlugin.showInventory") */
    type: string;
    /** Display name in the command palette */
    displayName: string;
    /** Category for the command palette */
    category: string;
    /** Description shown in tooltips */
    description: string;
    /** Icon identifier or emoji */
    icon?: string;
    /** Parameter definitions */
    parameters: CustomCommandParameter[];
    /**
     * Handler executed at runtime. Use `api.setVariable` / `api.notify` for effects.
     * Optionally return `{ advance: false }` to NOT auto-advance to the next command
     * (defaults to advancing, like built-in commands).
     */
    handler: (params: Record<string, any>, api: PluginAPI) => void | { advance?: boolean } | Promise<void | { advance?: boolean }>;
}

export interface CustomCommandParameter {
    /** Parameter name */
    name: string;
    /** Display label */
    label: string;
    /** Parameter type */
    type: 'string' | 'number' | 'boolean' | 'select' | 'color' | 'variable' | 'asset';
    /** Default value */
    defaultValue?: any;
    /** Whether this parameter is required */
    required?: boolean;
    /** Options for 'select' type */
    options?: Array<{ label: string; value: string }>;
    /** Description/help text */
    description?: string;
}

/**
 * A custom effect definition provided by a plugin.
 */
export interface CustomEffectDefinition {
    /** Unique effect identifier */
    type: string;
    /** Display name */
    displayName: string;
    /** Description */
    description: string;
    /** Effect parameters */
    parameters: CustomCommandParameter[];
    /** Apply the effect */
    apply: (params: Record<string, any>, api: PluginAPI) => void | Promise<void>;
    /** Remove/cleanup the effect */
    remove: (api: PluginAPI) => void | Promise<void>;
}

/**
 * Plugin registry entry stored in the project.
 */
export interface PluginRegistryEntry {
    /** Plugin ID */
    pluginId: string;
    /** Whether enabled */
    enabled: boolean;
    /** User configuration overrides */
    config: Record<string, any>;
    /** Custom commands registered by this plugin */
    registeredCommands: string[];
    /** Custom effects registered by this plugin */
    registeredEffects: string[];
}
