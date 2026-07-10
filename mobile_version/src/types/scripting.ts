/**
 * Scripting System Types
 * 
 * Defines the type system for FlourishVNE's custom scripting feature.
 * Scripts allow users to write JavaScript that interacts with game state,
 * variables, and the visual novel runtime.
 */

import { VNID } from './index';

/**
 * A user-defined script stored in the project.
 */
export interface VNScript {
    /** Unique identifier */
    id: VNID;
    /** Display name for the script */
    name: string;
    /** Optional description of what the script does */
    description?: string;
    /** The JavaScript source code */
    code: string;
    /** When the script was created */
    createdAt: string;
    /** When the script was last modified */
    updatedAt: string;
    /** Script execution trigger type */
    trigger: ScriptTrigger;
    /** Whether this script is enabled */
    enabled: boolean;
    /**
     * Optional parameters this script accepts. Arguments supplied by the caller
     * (RunScript command or game.runScript) are exposed to the script as a
     * read-only `game.args` map (by param name) — they are NOT written into the
     * global variable store, so there is no variable leak. Additive/optional.
     */
    params?: ScriptParam[];
}

/**
 * A declared parameter for a script (mirrors CommonEventParameter).
 */
export interface ScriptParam {
    /** Unique param id */
    id: VNID;
    /** Display name (used as the key in game.args) */
    name: string;
    /** Data type */
    type: 'string' | 'number' | 'boolean';
    /** Default value when no argument is supplied */
    defaultValue: string | number | boolean;
    /** Optional description shown in the editor */
    description?: string;
}

/**
 * Script trigger types — when/how a script executes.
 * - 'command': Runs ONLY when invoked (a RunScript command, or game.runScript from another script). The default.
 * - 'onSceneEnter': GLOBAL lifecycle hook — auto-runs on EVERY scene start (not bound to one scene).
 * - 'onSceneExit': GLOBAL lifecycle hook — auto-runs on EVERY scene end (not bound to one scene).
 * - 'global': Helper — behaves like 'command' (runs only when another script/command calls it); a labelling hint.
 */
export type ScriptTrigger = 'command' | 'onSceneEnter' | 'onSceneExit' | 'global';

/**
 * The sandbox API exposed to user scripts.
 * This is the `game` object available inside script code.
 */
export interface ScriptAPI {
    /** Get a variable's current value */
    getVariable: (nameOrId: string) => string | number | boolean | undefined;
    /** Set a variable's value */
    setVariable: (nameOrId: string, value: string | number | boolean) => void;
    /** Get all variables as a key-value map (name → value) */
    getAllVariables: () => Record<string, string | number | boolean>;
    /** Alias of getAllVariables() — all variables as a name → value map. */
    getVariables: () => Record<string, string | number | boolean>;
    /** Get the list of scene names in the project. */
    getScenes: () => string[];
    /** Get all characters as { id, name } pairs. */
    getCharacters: () => Array<{ id: string; name: string }>;

    // --- Inventory (items registry) ---
    /** How many of an item the player owns (by item name or id). 0 if unknown. */
    getItemCount: (nameOrId: string) => number;
    /** True if the player owns at least one of the item. */
    hasItem: (nameOrId: string) => boolean;
    /** Add to the player's count of an item (default 1). */
    addItem: (nameOrId: string, amount?: number) => void;
    /** Remove from the player's count of an item (default 1; never below 0). */
    removeItem: (nameOrId: string, amount?: number) => void;
    /** List all items with their current counts. */
    getItems: () => Array<{ id: string; name: string; count: number }>;

    /** Show a dialogue line programmatically */
    showDialogue: (characterName: string, text: string) => void;
    /** Jump to a scene by name or ID */
    jumpToScene: (nameOrId: string) => void;
    /** Jump to a label in the current scene */
    jumpToLabel: (labelId: string) => void;
    /** Run another script by name or ID (script-to-script), with optional arguments.
     *  Returns a Promise you can `await` so the called script finishes (incl. its waits) first. */
    runScript: (nameOrId: string, args?: Record<string, string | number | boolean>) => void | Promise<void>;
    /** Call a Common Event by name or ID, with optional arguments. */
    callCommonEvent: (nameOrId: string, args?: Record<string, string | number | boolean>) => void;

    // --- Presentation (drive real visual commands from a script; see SCRIPT_ENGINE_PARITY_PLAN) ---
    // These run the SAME engine handlers as the visual commands, so timing/transitions match. `await`
    // them to keep ordering. (Slice 1 = characters / background / image; more land in later slices.)
    /** Show a character (by name or id). opts: expression (name/id), position ('left'|'center'|'right'
     *  or {x,y} as 0-100 %), transition (e.g. 'fade'), duration (seconds). */
    showCharacter?: (idOrName: string, opts?: { expression?: string; position?: string | { x: number; y: number }; transition?: string; duration?: number }) => Promise<void>;
    /** Hide a character (by name or id). */
    hideCharacter?: (idOrName: string, opts?: { transition?: string; duration?: number }) => Promise<void>;
    /** Set the scene background (by name or id). */
    setBackground?: (idOrName: string, opts?: { transition?: string; duration?: number }) => Promise<void>;
    /** Show an image overlay (by name or id). opts: x,y (0-100 %), width, height. */
    showImage?: (idOrName: string, opts?: { x?: number; y?: number; width?: number; height?: number; transition?: string; duration?: number }) => Promise<void>;

    // --- Screen effects + particles/tween ---
    /** Shake the screen. opts: intensity, duration (s; 0 = until reset). */
    shakeScreen?: (opts?: { intensity?: number; duration?: number }) => Promise<void>;
    /** Flash the screen a colour. opts: color (hex), duration (s). */
    flashScreen?: (opts?: { color?: string; duration?: number }) => Promise<void>;
    /** Tint the screen a colour (hex, supports alpha e.g. '#00000080'). opts: duration (s). */
    tintScreen?: (color: string, opts?: { duration?: number }) => Promise<void>;
    /** Pan / zoom the screen. opts: zoom, panX, panY, duration (s). */
    panZoom?: (opts?: { zoom?: number; panX?: number; panY?: number; duration?: number }) => Promise<void>;
    /** Reset tint / pan / zoom / overlay effects. opts: duration (s). */
    resetScreenEffects?: (opts?: { duration?: number }) => Promise<void>;
    /** Spawn particles (opts map to the Spawn Particles command's fields). */
    spawnParticles?: (opts?: Record<string, any>) => Promise<void>;
    /** Stop particles (opts map to the Stop Particles command's fields). */
    stopParticles?: (opts?: Record<string, any>) => Promise<void>;
    /** Tween an element's properties (opts map to the Tween Element command's fields). */
    tween?: (opts?: Record<string, any>) => Promise<void>;

    // --- Blocking input (await the player) ---
    /** Show a dialogue line and WAIT until the player advances. Speaker '' = Narrator. */
    dialogue?: (speaker: string, text: string) => Promise<void>;
    /** Show choices and WAIT; resolves to the chosen option's INDEX. Options: strings or { text }. */
    choice?: (options: Array<string | { text: string }>) => Promise<number>;
    /** Show a text-input prompt and WAIT; resolves to the typed string. opts: placeholder, variable (also stores it). */
    textInput?: (prompt: string, opts?: { placeholder?: string; variable?: string }) => Promise<string>;

    // --- Generic power-user escape hatches (full parity) ---
    /** Run ANY scene command by type with raw params (same handler the editor uses). e.g.
     *  game.runCommand('ShowCharacter', { characterId, transition: 'fade' }). Returns when applied. */
    runCommand?: (type: string, params?: Record<string, any>) => Promise<any>;
    /** Fire ANY UI action by type (the same path a UI button uses). e.g.
     *  game.ui('GoToScreen', { targetScreenId }). See the UIActionType list in the docs. */
    ui?: (actionType: string, params?: Record<string, any>) => void;

    // --- Named UI helpers (sugar over game.ui) ---
    /** Open a UI screen (menu/title/custom) by name or id. */
    goToScreen?: (screenIdOrName: string) => void;
    /** Toggle a UI screen open/closed by name or id. */
    toggleScreen?: (screenIdOrName: string) => void;
    /** Return to gameplay from any screen layered over the game. */
    returnToGame?: () => void;
    /** Reveal a screen element (overrides startHidden) by element id. */
    showElement?: (elementId: string) => void;
    /** Hide a screen element by element id. */
    hideElement?: (elementId: string) => void;
    /** Swap a screen element's image (element id + image name/id). */
    changeImage?: (elementId: string, imageIdOrName: string) => void;
    /** Play a named CSS animation on a screen element. */
    playAnimation?: (elementId: string, animation: string, duration?: number) => void;
    /** Save the game to a slot (default 0 = auto-save). */
    saveGame?: (slot?: number) => void;
    /** Load the game from a slot (default 0). */
    loadGame?: (slot?: number) => void;
    /** Quit to the title screen (shows the confirm dialog if a game is in progress). */
    quitToTitle?: () => void;
    /** Exit the game (desktop) / no-op on web. */
    exitGame?: () => void;
    /** Open a URL (default newTab true). */
    openURL?: (url: string, newTab?: boolean) => void;

    // --- Named command helpers (sugar over game.runCommand) ---
    /** Change a character's dress-up layers (opts map to the Set Character Layer command's fields). */
    setCharacterLayer?: (idOrName: string, opts?: Record<string, any>) => Promise<void>;
    /** Show on-screen text (opts: x, y, fontSize, color, … map to the Show Text command). */
    showText?: (text: string, opts?: Record<string, any>) => Promise<void>;
    /** Hide on-screen text (opts map to the Hide Text command). */
    hideText?: (opts?: Record<string, any>) => Promise<void>;
    /** Hide an image overlay by name or id. */
    hideImage?: (idOrName: string) => Promise<void>;
    /** Stop a playing sound effect by name or id (optional fade in seconds). */
    stopSFX?: (idOrName: string, fadeDuration?: number) => Promise<void>;
    /** Lightning flash (opts map to the Lightning command's fields). */
    lightning?: (opts?: Record<string, any>) => Promise<void>;
    /** Fireworks burst (opts map to the Fireworks command's fields). */
    fireworks?: (opts?: Record<string, any>) => Promise<void>;
    /** Turn the flashlight on (opts map to the Flashlight command's fields). */
    flashlight?: (opts?: Record<string, any>) => Promise<void>;
    /** Turn the flashlight off. */
    flashlightOff?: () => Promise<void>;
    /** Turn the spotlight on (opts map to the Spotlight command's fields). */
    spotlight?: (opts?: Record<string, any>) => Promise<void>;
    /** Turn the spotlight off. */
    spotlightOff?: () => Promise<void>;
    /** Apply a screen overlay effect (fog/haze/CRT…) by type (opts: intensity, variant, duration…). */
    screenOverlay?: (effectType: string, opts?: Record<string, any>) => Promise<void>;
    /** Roll credits (opts map to the Credit Roll command's fields). */
    creditRoll?: (opts?: Record<string, any>) => Promise<void>;
    /** Play a movie/video by name or id. Fullscreen + waits for the movie to finish by default (await it);
     *  pass `{ displayMode: 'overlay' }` for a non-blocking overlay, or `{ waitsForCompletion: false }`. */
    playMovie?: (idOrName: string, opts?: Record<string, any>) => Promise<void>;
    /** Stop the fullscreen movie and clear any movie overlays. */
    stopMovie?: () => Promise<void>;

    /** Play a sound effect by name or ID */
    playSFX: (nameOrId: string, volume?: number) => void;
    /** Play background music by name or ID */
    playMusic: (nameOrId: string, loop?: boolean, volume?: number) => void;
    /** Stop all music */
    stopMusic: (fadeDuration?: number) => void; // fadeDuration in seconds

    /** Log a message to the console (for debugging) */
    log: (...args: any[]) => void;
    /** Show a toast notification to the player */
    notify: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

    /** Get the current scene name */
    currentScene: string;
    /** Get the current scene ID */
    currentSceneId: string;

    /** Arguments passed to this script (by param name), with defaults filled in. Read-only. */
    args: Record<string, string | number | boolean>;

    /** Wait for a duration in seconds (returns a promise) */
    wait: (seconds: number) => Promise<void>;

    /** Generate a random integer between min and max (inclusive) */
    random: (min: number, max: number) => number;

    /** Clamp a value between min and max (top-level alias of math.clamp). */
    clamp: (value: number, min: number, max: number) => number;
    /** Linear interpolation from start to end by t (top-level alias of math.lerp). */
    lerp: (start: number, end: number, t: number) => number;

    /** Math utilities */
    math: {
        clamp: (value: number, min: number, max: number) => number;
        lerp: (start: number, end: number, t: number) => number;
        randomFloat: (min: number, max: number) => number;
    };
}

/**
 * Result from executing a script.
 */
export interface ScriptExecutionResult {
    /** Whether the script executed successfully */
    success: boolean;
    /** Error message if execution failed */
    error?: string;
    /** Stack trace if execution failed */
    stack?: string;
    /** Return value from the script (if any) */
    returnValue?: any;
    /** Variable changes made by the script */
    variableChanges?: Record<string, string | number | boolean>;
    /** Navigation request (scene jump) */
    navigationRequest?: {
        type: 'scene' | 'label';
        target: string;
    };
    /** Execution duration in milliseconds */
    duration: number;
}

/**
 * Script validation result.
 */
export interface ScriptValidationResult {
    /** Whether the script is syntactically valid */
    isValid: boolean;
    /** Validation errors */
    errors: ScriptValidationError[];
    /** Validation warnings */
    warnings: ScriptValidationError[];
}

export interface ScriptValidationError {
    /** Line number (1-based) */
    line: number;
    /** Column number (1-based) */
    column: number;
    /** Error message */
    message: string;
    /** Severity */
    severity: 'error' | 'warning';
}
