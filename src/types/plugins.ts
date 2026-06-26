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
    /**
     * What this add-on extends. Default `'runtime'` (the existing plugin behaviour — runs inside the
     * game, sandboxed, and is bundled into exported games). `'editor'` = an EXTENSION that extends the
     * editor only (panels, etc.); it runs on the author's machine with FULL trust (DOM/network allowed)
     * and is NOT shipped to players. `'both'` = does both. Additive/optional → old plugins keep working.
     */
    target?: 'runtime' | 'editor' | 'both';
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
    /**
     * Whether to bundle this plugin into EXPORTED games. Default (undefined) = included for runtime
     * plugins. Editor extensions (`manifest.target === 'editor'`) are ALWAYS excluded from builds
     * regardless of this flag. Set false to keep a runtime plugin in the editor but out of the game.
     */
    includeInBuild?: boolean;
    /**
     * Bundled resources (from a `.flourishext` package): file name → data URL. The extension reads them
     * at runtime via `api.getResource(name)` (e.g. for an `<img src>`). Travel with the project + build.
     */
    resources?: Record<string, string>;
    /**
     * Hide this add-on's UI while TEST-PLAYING in the editor (mainly for editor extensions whose
     * floating UI would otherwise overlap the preview). When true, the extension is suspended (its
     * `onDisable` runs) for the duration of test-play and restored (`onEnable`) afterwards.
     */
    hideInTestPlay?: boolean;
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
    /** Called when the game runtime initialises */
    onRuntimeInit?: (api: PluginAPI) => void | Promise<void>;
    /** Called periodically during gameplay (~ every 120ms; use sparingly) with elapsed ms. */
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

    // --- Resources (from a .flourishext bundle) ---
    /** Get a bundled resource's data URL by file name (e.g. for an `<img src>`). undefined if absent. */
    getResource?: (name: string) => string | undefined;

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
    /** Register an editor PANEL (target 'editor'/'both' add-ons). The panel opens from Tools →
     *  Extension Panels in a floating window. Free-form: you render whatever you want. Optional. */
    registerPanel?: (panel: EditorPanelContribution) => void;
    /** Register an editor MENU ITEM / TOOL. Appears under Tools → Extension Tools; clicking runs your
     *  `run(ctx)`. Use for generators, importers, one-shot utilities (not a persistent panel). Optional. */
    registerMenuItem?: (item: EditorMenuItemContribution) => void;
    /** Register a custom DATABASE CATEGORY — a new data table (e.g. "Cards", "Quests"). The editor
     *  generates an add/edit form from your `fields`; records are saved with the project. Optional. */
    registerDatabaseCategory?: (category: EditorDatabaseCategory) => void;
    /** Read all records the user created in one of this extension's database categories (by id). */
    getRecords?: (categoryId: string) => ExtensionRecord[];
    /** Register a custom SCREEN UI ELEMENT TYPE — a new widget for the screen / In-Game UI editor that
     *  renders in both the editor canvas and the shipped game. Use a `runtime` or `both` target so the
     *  renderer is bundled into exported games. Optional. */
    registerUIElementType?: (def: EditorUIElementType) => void;
}

/** Context passed to a custom UI element's renderer. */
export interface UIElementRenderContext {
    /** Read a game variable by name or id (live value while playing; default value in the editor). */
    getVariable: (nameOrId: string) => string | number | boolean | undefined;
    /** True when rendering on the editor canvas (a static preview) vs the live game. */
    isEditor: boolean;
}

/**
 * A custom screen UI element type contributed by an extension. `render` returns an HTML STRING (it runs
 * in the sandbox — build a string, no DOM access) that fills the element's box. The editor generates the
 * property inspector from `inspector`. Author this in a `runtime`/`both` plugin so it ships with games.
 */
export interface EditorUIElementType {
    /** Unique id within the extension (auto-namespaced to the plugin id). */
    type: string;
    /** Display name in the element palette. */
    displayName: string;
    /** Optional emoji/icon for the palette. */
    icon?: string;
    /** Default property values for a new element. */
    defaultProps?: Record<string, any>;
    /** Default element size in screen-% (defaults to 20×15). */
    defaultSize?: { width: number; height: number };
    /** Property fields shown in the element inspector (reuses the database field spec). */
    inspector?: ExtensionFieldSpec[];
    /** Return an HTML string for the element, given its props + context. Fills the element's box (use
     *  width/height: 100%). Runs sandboxed — no DOM/network; just build a string. */
    render: (props: Record<string, any>, ctx: UIElementRenderContext) => string;
}

/**
 * Context handed to an editor panel's `render()` — read the project, dispatch editor actions, show
 * toasts, and read/write the extension's own persistent (project-scoped) storage.
 */
export interface EditorPanelContext {
    /** Current project snapshot (read-only; may be null before a project loads). */
    getProject: () => any;
    /** Dispatch a project action (the same actions the editor uses). Use deliberately. */
    dispatch: (action: any) => void;
    /** Show a toast notification. */
    notify: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    /** Read this extension's persistent, project-scoped storage. */
    getStorage: (key: string) => any;
    /** Write this extension's persistent, project-scoped storage. */
    setStorage: (key: string, value: any) => void;
}

/**
 * An editor panel contributed by an extension (`target: 'editor' | 'both'`). Free-form: `render()`
 * receives a real container element + the editor context and may render ANYTHING (DOM, iframes, etc.).
 * Editor extensions run on the author's machine with full trust and are NOT shipped in exported games.
 */
export interface EditorPanelContribution {
    /** Unique id within the extension (auto-namespaced to the plugin id). */
    id: string;
    /** Title shown in the panel's title bar and the Tools → Extension Panels menu. */
    title: string;
    /** Optional emoji/icon shown in the menu. */
    icon?: string;
    /** Render the panel into `container`. Return an optional cleanup fn (called when the panel closes). */
    render: (container: HTMLElement, ctx: EditorPanelContext) => void | (() => void);
}

/**
 * A menu/tool action contributed by an extension. Appears under Tools → Extension Tools; clicking runs
 * `run(ctx)`. Use for generators, importers, validators, one-shot utilities — anything that isn't a
 * persistent panel. Gets the same editor context as a panel (project read, dispatch, notify, storage).
 */
export interface EditorMenuItemContribution {
    /** Unique id within the extension (auto-namespaced to the plugin id). */
    id: string;
    /** Label shown in the Tools → Extension Tools menu. */
    label: string;
    /** Optional emoji/icon. */
    icon?: string;
    /** Runs when the menu item is clicked. */
    run: (ctx: EditorPanelContext) => void;
}

/** Field types the generated database form supports. */
export type ExtensionFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'color' | 'asset';

/** One field in a custom database category — drives one control in the generated record form. */
export interface ExtensionFieldSpec {
    /** Key used in the record object. */
    key: string;
    /** Display label. */
    label: string;
    /** Control type. `asset` = pick a project image/background by id. */
    type: ExtensionFieldType;
    /** Options for `select`. */
    options?: Array<{ label: string; value: string }>;
    /** Default value for new records. */
    default?: string | number | boolean;
    /** Placeholder for text/number fields. */
    placeholder?: string;
}

/**
 * A custom database category contributed by an extension — a new data table the user can fill in.
 * The editor renders a list + an auto-generated add/edit form from `fields`. Records save with the
 * project (in extension storage) and are readable at runtime via `api.getRecords(categoryId)`.
 */
export interface EditorDatabaseCategory {
    /** Unique id within the extension (auto-namespaced to the plugin id). */
    id: string;
    /** Display name (the tab/category title), e.g. "Cards". */
    name: string;
    /** Optional emoji/icon. */
    icon?: string;
    /** Singular label for one record, used on the "Add" button (e.g. "Card"). Defaults to "Record". */
    recordLabel?: string;
    /** Which field is shown as a record's title in the list. Defaults to the first text field. */
    titleField?: string;
    /** The fields each record has. */
    fields: ExtensionFieldSpec[];
}

/** A single user-created record in a database category. Always has an `id`; other keys come from fields. */
export type ExtensionRecord = { id: string; [key: string]: any };

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
/** Live info passed to a custom effect's per-frame renderer. */
export interface CustomEffectRenderInfo {
    /** Canvas width in px (already clamped/sized). */
    width: number;
    /** Canvas height in px. */
    height: number;
    /** Effect strength, 0..1 (from the SetScreenOverlayEffect command's intensity). */
    intensity: number;
    /** Optional author color (hex) for the effect. */
    color?: string;
    /** Optional per-effect params from the command. */
    params?: Record<string, any>;
    /** Milliseconds elapsed since this effect instance started. */
    timeMs: number;
}

export interface CustomEffectDefinition {
    /** Unique effect identifier */
    type: string;
    /** Display name */
    displayName: string;
    /** Description */
    description: string;
    /** Effect parameters */
    parameters: CustomCommandParameter[];
    /** Per-frame canvas renderer (the visual pipeline). When provided, the effect renders as a
     *  full-screen overlay each animation frame while active. The canvas is cleared before each
     *  call. This is the recommended way to implement a visible effect. */
    render?: (ctx: CanvasRenderingContext2D, info: CustomEffectRenderInfo) => void;
    /** Optional imperative apply (legacy / side-effect effects). */
    apply?: (params: Record<string, any>, api: PluginAPI) => void | Promise<void>;
    /** Optional imperative cleanup. */
    remove?: (api: PluginAPI) => void | Promise<void>;
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
