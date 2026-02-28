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
}

/**
 * Script trigger types — when/how a script executes.
 * - 'command': Executed via a RunScript command in the scene timeline
 * - 'onSceneEnter': Auto-runs when a specific scene starts
 * - 'onSceneExit': Auto-runs when a specific scene ends
 * - 'global': Available as a utility (called by other scripts)
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

    /** Show a dialogue line programmatically */
    showDialogue: (characterName: string, text: string) => void;
    /** Jump to a scene by name or ID */
    jumpToScene: (nameOrId: string) => void;
    /** Jump to a label in the current scene */
    jumpToLabel: (labelId: string) => void;

    /** Play a sound effect by name or ID */
    playSFX: (nameOrId: string, volume?: number) => void;
    /** Play background music by name or ID */
    playMusic: (nameOrId: string, loop?: boolean, volume?: number) => void;
    /** Stop all music */
    stopMusic: (fadeDuration?: number) => void; // fadeDuration in seconds

    /** Log a message to the console (for debugging) */
    log: (...args: any[]) => void;
    /** Show a toast notification to the player */
    notify: (message: string, type?: 'info' | 'warning' | 'error') => void;

    /** Get the current scene name */
    currentScene: string;
    /** Get the current scene ID */
    currentSceneId: string;

    /** Wait for a duration in seconds (returns a promise) */
    wait: (seconds: number) => Promise<void>;

    /** Generate a random integer between min and max (inclusive) */
    random: (min: number, max: number) => number;

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
