/**
 * Script Executor
 * 
 * Executes user-defined scripts in a sandboxed environment.
 * Provides the `game` API object that scripts use to interact
 * with the visual novel runtime.
 */

import { VNProject } from '../../types/project';
import { VNScript, ScriptAPI, ScriptExecutionResult, ScriptValidationResult, ScriptValidationError } from '../../types/scripting';
import { VNID } from '../../types';

/**
 * Runtime context passed to the executor so scripts
 * can read/write variables and trigger navigation.
 */
export interface ScriptRuntimeContext {
    project: VNProject;
    variables: Record<VNID, string | number | boolean>;
    currentSceneId: VNID;
    /** Arguments for this script (by param name), defaults already applied. Exposed as game.args. */
    args?: Record<string, string | number | boolean>;
    /** Callbacks for side-effects */
    onSetVariable: (nameOrId: string, value: string | number | boolean) => void;
    onJumpToScene: (nameOrId: string) => void;
    onJumpToLabel: (labelId: string) => void;
    onShowDialogue: (characterName: string, text: string) => void;
    onPlaySFX: (nameOrId: string, volume?: number) => void;
    onPlayMusic: (nameOrId: string, loop?: boolean, volume?: number) => void;
    onStopMusic: (fadeDuration?: number) => void;
    onNotify: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
    /** Run another script by name or ID (script-to-script). Optional; no-op if not provided. */
    onRunScript?: (nameOrId: string, args?: Record<string, string | number | boolean>) => void;
    /** Call a Common Event by name or ID. Optional; no-op if not provided. */
    onCallCommonEvent?: (nameOrId: string, args?: Record<string, string | number | boolean>) => void;
}

/**
 * Execute a script with the given runtime context.
 * Scripts run in a Function constructor sandbox (not eval)
 * with a controlled `game` API object.
 */
export function executeScript(
    script: VNScript,
    context: ScriptRuntimeContext
): ScriptExecutionResult {
    const startTime = performance.now();
    const variableChanges: Record<string, string | number | boolean> = {};
    let navigationRequest: ScriptExecutionResult['navigationRequest'] = undefined;

    // Build variable name→id lookup
    const varNameToId: Record<string, VNID> = {};
    const varIdToName: Record<VNID, string> = {};
    for (const [id, variable] of Object.entries(context.project.variables || {})) {
        varNameToId[variable.name.toLowerCase()] = id;
        varIdToName[id] = variable.name;
    }

    // Resolve a variable reference by name or ID
    const resolveVarId = (nameOrId: string): VNID | undefined => {
        if (context.project.variables?.[nameOrId]) return nameOrId;
        return varNameToId[nameOrId.toLowerCase()];
    };

    // Resolve an item by id or (case-insensitive) name.
    const resolveItem = (nameOrId: string): { id: VNID; name: string; countVariableId: VNID; unique?: boolean } | undefined => {
        const items = (context.project.items || {}) as Record<string, { id: VNID; name: string; countVariableId: VNID; unique?: boolean }>;
        if (items[nameOrId]) return items[nameOrId];
        const lower = nameOrId.toLowerCase();
        return Object.values(items).find(it => it.name.toLowerCase() === lower);
    };

    // Build the game API
    const gameAPI: ScriptAPI = {
        getVariable: (nameOrId: string) => {
            const id = resolveVarId(nameOrId);
            if (!id) return undefined;
            return context.variables[id];
        },

        setVariable: (nameOrId: string, value: string | number | boolean) => {
            const id = resolveVarId(nameOrId);
            if (!id) {
                console.warn(`[Script] Variable not found: "${nameOrId}"`);
                return;
            }
            variableChanges[id] = value;
            context.onSetVariable(nameOrId, value);
        },

        getAllVariables: () => {
            const result: Record<string, string | number | boolean> = {};
            for (const [id, val] of Object.entries(context.variables)) {
                const name = varIdToName[id] || id;
                result[name] = val;
            }
            return result;
        },

        // Documented alias of getAllVariables() (name → value map).
        getVariables: () => {
            const result: Record<string, string | number | boolean> = {};
            for (const [id, val] of Object.entries(context.variables)) {
                const name = varIdToName[id] || id;
                result[name] = val;
            }
            return result;
        },

        getScenes: () => {
            return Object.values(context.project.scenes || {}).map((s: any) => s.name);
        },

        getCharacters: () => {
            return Object.entries(context.project.characters || {}).map(([id, c]: [string, any]) => ({ id, name: c.name }));
        },

        // ── Inventory (items are sugar over a number "count" variable) ──
        getItemCount: (nameOrId: string) => {
            const item = resolveItem(nameOrId);
            if (!item) return 0;
            const v = context.variables[item.countVariableId];
            return typeof v === 'number' ? v : Number(v) || 0;
        },

        hasItem: (nameOrId: string) => {
            const item = resolveItem(nameOrId);
            if (!item) return false;
            const v = context.variables[item.countVariableId];
            return (typeof v === 'number' ? v : Number(v) || 0) > 0;
        },

        addItem: (nameOrId: string, amount: number = 1) => {
            const item = resolveItem(nameOrId);
            if (!item) { console.warn(`[Script] addItem: unknown item "${nameOrId}"`); return; }
            const cur = Number(context.variables[item.countVariableId]) || 0;
            let next = cur + amount;
            if (item.unique) next = Math.min(1, Math.max(0, next));
            context.variables[item.countVariableId] = next;
            context.onSetVariable(item.countVariableId, next);
        },

        removeItem: (nameOrId: string, amount: number = 1) => {
            const item = resolveItem(nameOrId);
            if (!item) { console.warn(`[Script] removeItem: unknown item "${nameOrId}"`); return; }
            const cur = Number(context.variables[item.countVariableId]) || 0;
            const next = Math.max(0, cur - amount);
            context.variables[item.countVariableId] = next;
            context.onSetVariable(item.countVariableId, next);
        },

        getItems: () => {
            return Object.values(context.project.items || {}).map((it: any) => ({
                id: it.id,
                name: it.name,
                count: Number(context.variables[it.countVariableId]) || 0,
            }));
        },

        showDialogue: (characterName: string, text: string) => {
            context.onShowDialogue(characterName, text);
        },

        jumpToScene: (nameOrId: string) => {
            navigationRequest = { type: 'scene', target: nameOrId };
            context.onJumpToScene(nameOrId);
        },

        jumpToLabel: (labelId: string) => {
            navigationRequest = { type: 'label', target: labelId };
            context.onJumpToLabel(labelId);
        },

        runScript: (nameOrId: string, args?: Record<string, string | number | boolean>) => {
            context.onRunScript?.(nameOrId, args);
        },

        callCommonEvent: (nameOrId: string, args?: Record<string, string | number | boolean>) => {
            context.onCallCommonEvent?.(nameOrId, args);
        },

        playSFX: (nameOrId: string, volume?: number) => {
            context.onPlaySFX(nameOrId, volume);
        },

        playMusic: (nameOrId: string, loop?: boolean, volume?: number) => {
            context.onPlayMusic(nameOrId, loop, volume);
        },

        stopMusic: (fadeDuration?: number) => {
            context.onStopMusic(fadeDuration);
        },

        log: (...args: any[]) => {
            console.log('[Script]', ...args);
        },

        notify: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => {
            context.onNotify(message, type);
        },

        currentScene: context.project.scenes[context.currentSceneId]?.name || '',
        currentSceneId: context.currentSceneId,

        args: context.args || {},

        wait: (seconds: number) => {
            return new Promise(resolve => setTimeout(resolve, seconds * 1000));
        },

        random: (min: number, max: number) => {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },

        // Top-level convenience aliases (the doc referenced game.clamp / game.lerp).
        clamp: (value: number, min: number, max: number) => Math.min(Math.max(value, min), max),
        lerp: (start: number, end: number, t: number) => start + (end - start) * t,

        math: {
            clamp: (value: number, min: number, max: number) => Math.min(Math.max(value, min), max),
            lerp: (start: number, end: number, t: number) => start + (end - start) * t,
            randomFloat: (min: number, max: number) => Math.random() * (max - min) + min,
        },
    };

    try {
        // Quick-hardening guard: reject the prototype-chain escape that reaches the Function
        // constructor via an object's constructor (e.g. ({}).constructor.constructor("...")()).
        // The Function-constructor sandbox can't fully prevent this, so we statically reject the
        // `.constructor` access pattern before running. (Regex-only — see roadmap Phase 4 for real
        // isolation; this just stops the trivial escape.)
        if (/\.\s*constructor\b/.test(script.code) || /\[\s*['"]constructor['"]\s*\]/.test(script.code)) {
            return {
                success: false,
                error: 'Access to ".constructor" is blocked in the script sandbox.',
                duration: performance.now() - startTime,
            };
        }

        // Create a sandboxed function.
        // The script code receives `game` as its only argument.
        // We block access to dangerous globals. `wait()` still works because the gameAPI.wait
        // closure (defined in THIS module scope) captures the real setTimeout — shadowing the
        // name only affects code written inside the sandboxed function body.
        const blockedGlobals = [
            'document', 'window', 'globalThis', 'self',
            'fetch', 'XMLHttpRequest', 'WebSocket',
            'localStorage', 'sessionStorage', 'indexedDB',
            'eval', 'Function',
            'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
            'requestAnimationFrame', 'queueMicrotask',
        ];

        const blockStatements = blockedGlobals
            .map(g => `var ${g} = undefined;`)
            .join('\n');

        const wrappedCode = `
            "use strict";
            ${blockStatements}
            ${script.code}
        `;

        const scriptFn = new Function('game', wrappedCode);
        const returnValue = scriptFn(gameAPI);

        return {
            success: true,
            returnValue,
            variableChanges: Object.keys(variableChanges).length > 0 ? variableChanges : undefined,
            navigationRequest,
            duration: performance.now() - startTime,
        };
    } catch (err: any) {
        return {
            success: false,
            error: err.message || String(err),
            stack: err.stack,
            variableChanges: Object.keys(variableChanges).length > 0 ? variableChanges : undefined,
            navigationRequest,
            duration: performance.now() - startTime,
        };
    }
}

/**
 * Validate a script for syntax errors without executing it.
 */
export function validateScript(code: string): ScriptValidationResult {
    const errors: ScriptValidationError[] = [];
    const warnings: ScriptValidationError[] = [];

    if (!code.trim()) {
        return { isValid: true, errors: [], warnings: [{ line: 1, column: 1, message: 'Script is empty', severity: 'warning' }] };
    }

    try {
        // Try to parse as a function body
        new Function('game', `"use strict";\n${code}`);
    } catch (err: any) {
        // Try to extract line number from error
        let line = 1;
        let column = 1;
        const lineMatch = err.message?.match(/line (\d+)/i) || err.stack?.match(/<anonymous>:(\d+):(\d+)/);
        if (lineMatch) {
            line = Math.max(1, parseInt(lineMatch[1], 10) - 1); // Subtract the "use strict" line
            column = lineMatch[2] ? parseInt(lineMatch[2], 10) : 1;
        }

        errors.push({
            line,
            column,
            message: err.message || 'Syntax error',
            severity: 'error',
        });
    }

    // Check for common issues
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
        const lineNum = idx + 1;
        // Warn about using eval
        if (/\beval\s*\(/.test(line)) {
            warnings.push({ line: lineNum, column: 1, message: 'eval() is blocked in the sandbox', severity: 'warning' });
        }
        // Warn about using document/window
        if (/\b(document|window)\b/.test(line)) {
            warnings.push({ line: lineNum, column: 1, message: 'document/window are not available in the sandbox', severity: 'warning' });
        }
        // Warn about fetch
        if (/\bfetch\s*\(/.test(line)) {
            warnings.push({ line: lineNum, column: 1, message: 'fetch() is not available in the sandbox', severity: 'warning' });
        }
        // Warn about the .constructor escape (blocked at runtime)
        if (/\.\s*constructor\b/.test(line) || /\[\s*['"]constructor['"]\s*\]/.test(line)) {
            warnings.push({ line: lineNum, column: 1, message: '".constructor" access is blocked in the sandbox', severity: 'warning' });
        }
        // Warn about timers (blocked); use game.wait(seconds) instead
        if (/\b(setTimeout|setInterval)\s*\(/.test(line)) {
            warnings.push({ line: lineNum, column: 1, message: 'setTimeout/setInterval are blocked — use game.wait(seconds)', severity: 'warning' });
        }
    });

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Create a new empty script with defaults.
 */
export function createDefaultScript(name: string): VNScript {
    const id = `script-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    return {
        id,
        name,
        description: '',
        code: `// ${name}\n// Use the 'game' object to interact with the visual novel.\n// Examples:\n//   game.log("Hello!");\n//   game.setVariable("score", game.getVariable("score") + 1);\n//   game.notify("You found a clue!", "info");\n\n`,
        createdAt: now,
        updatedAt: now,
        trigger: 'command',
        enabled: true,
    };
}
