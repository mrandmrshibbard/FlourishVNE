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
    /** Run another script by name or ID (script-to-script). Optional; no-op if not provided.
     *  May return a Promise so the caller script can `await game.runScript(...)`. */
    onRunScript?: (nameOrId: string, args?: Record<string, string | number | boolean>) => void | Promise<void>;
    /** Call a Common Event by name or ID. Optional; no-op if not provided. */
    onCallCommonEvent?: (nameOrId: string, args?: Record<string, string | number | boolean>) => void;
    /** Run a real engine command imperatively (presentation parity — show character, set background…).
     *  Returns a Promise that resolves once the command has been applied. Optional; no-op if absent. */
    onRunCommand?: (type: string, params: Record<string, any>) => Promise<any>;
    /** Fire a real UI action (the same path a UI button uses — go to screen, save/load, show/hide element…).
     *  Optional; no-op if absent. */
    onRunUIAction?: (actionType: string, params: Record<string, any>) => void;
    /** True inside an EXPORTED game (not editor test-play). Suppresses developer diagnostics (the
     *  "variable/item not found" warning toasts) so players never see them. Console logging stays. */
    isStandalone?: boolean;
}

/**
 * Execute a script with the given runtime context.
 * Scripts run in an AsyncFunction sandbox (not eval) with a controlled `game` API object.
 * Async so scripts can `await game.wait(...)` and so callers can optionally wait for completion.
 */
export async function executeScript(
    script: VNScript,
    context: ScriptRuntimeContext
): Promise<ScriptExecutionResult> {
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

    // Resolve a character / expression / asset by id or (case-insensitive) name. Used by the
    // presentation API so scripts can reference things by their friendly names.
    const resolveCharacterId = (nameOrId: string): VNID | undefined => {
        const chars = (context.project.characters || {}) as Record<string, any>;
        if (chars[nameOrId]) return nameOrId;
        const lower = nameOrId.toLowerCase();
        const found = Object.entries(chars).find(([, c]) => c?.name?.toLowerCase() === lower);
        return found?.[0];
    };
    const resolveExpressionId = (charId: VNID, nameOrId: string): VNID | undefined => {
        const exprs = ((context.project.characters || {}) as Record<string, any>)[charId]?.expressions || {};
        if (exprs[nameOrId]) return nameOrId;
        const lower = nameOrId.toLowerCase();
        const found = Object.entries(exprs).find(([, e]: [string, any]) => e?.name?.toLowerCase() === lower);
        return found?.[0];
    };
    const resolveAssetId = (collection: Record<string, any> | undefined, nameOrId: string): VNID | undefined => {
        const c = collection || {};
        if (c[nameOrId]) return nameOrId;
        const lower = nameOrId.toLowerCase();
        const found = Object.entries(c).find(([, a]: [string, any]) => a?.name?.toLowerCase() === lower);
        return found?.[0];
    };

    // Resolve an item by id or (case-insensitive) name.
    const resolveItem = (nameOrId: string): { id: VNID; name: string; countVariableId: VNID; unique?: boolean } | undefined => {
        const items = (context.project.items || {}) as Record<string, { id: VNID; name: string; countVariableId: VNID; unique?: boolean }>;
        if (items[nameOrId]) return items[nameOrId];
        const lower = nameOrId.toLowerCase();
        return Object.values(items).find(it => it.name.toLowerCase() === lower);
    };

    // Resolve a UI screen by id or (case-insensitive) name.
    const resolveScreenId = (nameOrId: string): VNID => {
        const screens = (context.project.uiScreens || {}) as Record<string, { id: VNID; name?: string }>;
        if (screens[nameOrId]) return nameOrId;
        const lower = String(nameOrId).toLowerCase();
        const found = Object.values(screens).find((s: any) => (s?.name || '').toLowerCase() === lower);
        return found ? found.id : nameOrId;
    };

    // Surface a "you targeted something that doesn't exist" failure as a VISIBLE toast (not just the
    // hidden script console). Non-coders otherwise just see "nothing happened" with no clue why.
    const warnMissing = (message: string) => {
        console.warn(`[Script] ${message}`);
        // Developer aid only — never surface these to players in an exported game.
        if (!context.isStandalone) context.onNotify?.(`Script: ${message}`, 'warning');
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
                warnMissing(`variable "${nameOrId}" doesn't exist — create it in the Variables panel first.`);
                return;
            }
            // Respect the variable's optional numeric clamp bounds (same as Set Variable commands).
            let finalValue = value;
            const def = context.project.variables?.[id] as { type?: string; min?: number; max?: number } | undefined;
            if (def?.type === 'number' && typeof finalValue === 'number') {
                if (typeof def.min === 'number' && finalValue < def.min) finalValue = def.min;
                if (typeof def.max === 'number' && finalValue > def.max) finalValue = def.max;
            }
            variableChanges[id] = finalValue;
            context.onSetVariable(nameOrId, finalValue);
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
            if (!item) { warnMissing(`addItem: no item named "${nameOrId}".`); return; }
            const cur = Number(context.variables[item.countVariableId]) || 0;
            let next = cur + amount;
            if (item.unique) next = Math.min(1, Math.max(0, next));
            context.variables[item.countVariableId] = next;
            context.onSetVariable(item.countVariableId, next);
        },

        removeItem: (nameOrId: string, amount: number = 1) => {
            const item = resolveItem(nameOrId);
            if (!item) { warnMissing(`removeItem: no item named "${nameOrId}".`); return; }
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

        // Returns the callback's result so a script may `await game.runScript(...)` for ordering.
        runScript: (nameOrId: string, args?: Record<string, string | number | boolean>) => {
            return context.onRunScript?.(nameOrId, args);
        },

        callCommonEvent: (nameOrId: string, args?: Record<string, string | number | boolean>) => {
            return context.onCallCommonEvent?.(nameOrId, args);
        },

        // ── Presentation: run real visual commands imperatively (reuses the engine handlers) ──
        showCharacter: async (idOrName: string, opts: { expression?: string; position?: string | { x: number; y: number }; transition?: string; duration?: number } = {}) => {
            if (!context.onRunCommand) return;
            const characterId = resolveCharacterId(idOrName);
            if (!characterId) { console.warn(`[Script] showCharacter: unknown character "${idOrName}"`); return; }
            const params: Record<string, any> = { characterId };
            if (opts.expression) { const e = resolveExpressionId(characterId, opts.expression); if (e) params.expressionId = e; }
            if (opts.position !== undefined) params.position = opts.position;
            if (opts.transition) params.transition = opts.transition;
            if (opts.duration !== undefined) params.duration = opts.duration;
            await context.onRunCommand('ShowCharacter', params);
        },

        hideCharacter: async (idOrName: string, opts: { transition?: string; duration?: number } = {}) => {
            if (!context.onRunCommand) return;
            const characterId = resolveCharacterId(idOrName);
            if (!characterId) { console.warn(`[Script] hideCharacter: unknown character "${idOrName}"`); return; }
            const params: Record<string, any> = { characterId };
            if (opts.transition) params.transition = opts.transition;
            if (opts.duration !== undefined) params.duration = opts.duration;
            await context.onRunCommand('HideCharacter', params);
        },

        setBackground: async (idOrName: string, opts: { transition?: string; duration?: number } = {}) => {
            if (!context.onRunCommand) return;
            const backgroundId = resolveAssetId(context.project.backgrounds, idOrName) || resolveAssetId(context.project.images, idOrName);
            if (!backgroundId) { console.warn(`[Script] setBackground: unknown background "${idOrName}"`); return; }
            const params: Record<string, any> = { backgroundId };
            if (opts.transition) params.transition = opts.transition;
            if (opts.duration !== undefined) params.duration = opts.duration;
            await context.onRunCommand('SetBackground', params);
        },

        showImage: async (idOrName: string, opts: { x?: number; y?: number; width?: number; height?: number; transition?: string; duration?: number } = {}) => {
            if (!context.onRunCommand) return;
            const imageId = resolveAssetId(context.project.images, idOrName);
            if (!imageId) { console.warn(`[Script] showImage: unknown image "${idOrName}"`); return; }
            const params: Record<string, any> = { imageId };
            (['x', 'y', 'width', 'height', 'transition', 'duration'] as const).forEach(k => { if (opts[k] !== undefined) params[k] = opts[k]; });
            await context.onRunCommand('ShowImage', params);
        },

        // ── Screen effects (run the real effect commands) ──
        shakeScreen: async (opts: { intensity?: number; duration?: number } = {}) => {
            if (!context.onRunCommand) return;
            const params: Record<string, any> = {};
            if (opts.intensity !== undefined) params.intensity = opts.intensity;
            if (opts.duration !== undefined) params.duration = opts.duration;
            await context.onRunCommand('ShakeScreen', params);
        },
        flashScreen: async (opts: { color?: string; duration?: number } = {}) => {
            if (!context.onRunCommand) return;
            const params: Record<string, any> = {};
            if (opts.color !== undefined) params.color = opts.color;
            if (opts.duration !== undefined) params.duration = opts.duration;
            await context.onRunCommand('FlashScreen', params);
        },
        tintScreen: async (color: string, opts: { duration?: number } = {}) => {
            if (!context.onRunCommand) return;
            const params: Record<string, any> = { color };
            if (opts.duration !== undefined) params.duration = opts.duration;
            await context.onRunCommand('TintScreen', params);
        },
        panZoom: async (opts: { zoom?: number; panX?: number; panY?: number; duration?: number } = {}) => {
            if (!context.onRunCommand) return;
            const params: Record<string, any> = {};
            (['zoom', 'panX', 'panY', 'duration'] as const).forEach(k => { if (opts[k] !== undefined) params[k] = opts[k]; });
            await context.onRunCommand('PanZoomScreen', params);
        },
        resetScreenEffects: async (opts: { duration?: number } = {}) => {
            if (!context.onRunCommand) return;
            const params: Record<string, any> = {};
            if (opts.duration !== undefined) params.duration = opts.duration;
            await context.onRunCommand('ResetScreenEffects', params);
        },
        // Particles + element tweens (power-user passthrough: opts map to the command's fields).
        spawnParticles: async (opts: Record<string, any> = {}) => {
            if (!context.onRunCommand) return;
            await context.onRunCommand('SpawnParticles', { ...opts });
        },
        stopParticles: async (opts: Record<string, any> = {}) => {
            if (!context.onRunCommand) return;
            await context.onRunCommand('StopParticles', { ...opts });
        },
        tween: async (opts: Record<string, any> = {}) => {
            if (!context.onRunCommand) return;
            await context.onRunCommand('TweenElement', { ...opts });
        },

        // ── Blocking: show UI and AWAIT the player's response (dialogue advance / choice / text). ──
        dialogue: async (speaker: string, text: string) => {
            if (!context.onRunCommand) { context.onShowDialogue(speaker, text); return; }
            const charId = speaker ? resolveCharacterId(speaker) : null;
            await context.onRunCommand('Dialogue', { characterId: charId || null, text: text ?? '' });
        },
        choice: async (options: Array<string | { text: string }>) => {
            if (!context.onRunCommand) return 0;
            const opts = (options || []).map((o: any) => ({
                id: `script-opt-${Math.random().toString(36).slice(2, 7)}`,
                text: typeof o === 'string' ? o : (o?.text ?? ''),
                actions: [],
            }));
            const idx = await context.onRunCommand('Choice', { options: opts });
            return typeof idx === 'number' ? idx : 0;
        },
        textInput: async (prompt: string, opts: { placeholder?: string; variable?: string } = {}) => {
            if (!context.onRunCommand) return '';
            const params: Record<string, any> = { prompt: prompt ?? '' };
            if (opts.placeholder !== undefined) params.placeholder = opts.placeholder;
            if (opts.variable) { const vid = resolveVarId(opts.variable); if (vid) params.variableId = vid; }
            const val = await context.onRunCommand('TextInput', params);
            return typeof val === 'string' ? val : '';
        },

        // ── Generic power-user escape hatches ──────────────────────────────────────────────
        // `game.runCommand` runs ANY scene command by type with raw params (the same handler the
        // editor uses); `game.ui` fires ANY UI action by type. These give full parity with the
        // editor — every command/action in the docs is reachable even without a named helper below.
        runCommand: async (type: string, params: Record<string, any> = {}) => {
            if (!context.onRunCommand) return;
            return await context.onRunCommand(type, params || {});
        },
        ui: (actionType: string, params: Record<string, any> = {}) => {
            context.onRunUIAction?.(actionType, params || {});
        },

        // ── Named UI helpers (sugar over game.ui) ──────────────────────────────────────────
        goToScreen: (screenIdOrName: string) => context.onRunUIAction?.('GoToScreen', { targetScreenId: resolveScreenId(screenIdOrName) }),
        toggleScreen: (screenIdOrName: string) => context.onRunUIAction?.('ToggleScreen', { targetScreenId: resolveScreenId(screenIdOrName) }),
        returnToGame: () => context.onRunUIAction?.('ReturnToGame', {}),
        showElement: (elementId: string) => context.onRunUIAction?.('ShowElement', { targetElementId: elementId }),
        hideElement: (elementId: string) => context.onRunUIAction?.('HideElement', { targetElementId: elementId }),
        changeImage: (elementId: string, imageIdOrName: string) => context.onRunUIAction?.('ChangeImage', { targetElementId: elementId, newImageId: resolveAssetId(context.project.images, imageIdOrName) || imageIdOrName }),
        playAnimation: (elementId: string, animation: string, duration?: number) => context.onRunUIAction?.('PlayAnimation', { targetElementId: elementId, animation, ...(duration != null ? { duration } : {}) }),
        saveGame: (slot: number = 0) => context.onRunUIAction?.('SaveGame', { slotNumber: slot }),
        loadGame: (slot: number = 0) => context.onRunUIAction?.('LoadGame', { slotNumber: slot }),
        quitToTitle: () => context.onRunUIAction?.('QuitToTitle', {}),
        exitGame: () => context.onRunUIAction?.('ExitGame', {}),
        openURL: (url: string, newTab: boolean = true) => context.onRunUIAction?.('OpenURL', { url, newTab }),

        // ── Named command helpers (sugar over game.runCommand) ─────────────────────────────
        setCharacterLayer: async (idOrName: string, opts: Record<string, any> = {}) => {
            if (!context.onRunCommand) return;
            const characterId = resolveCharacterId(idOrName);
            if (!characterId) { console.warn(`[Script] setCharacterLayer: unknown character "${idOrName}"`); return; }
            await context.onRunCommand('SetCharacterLayer', { characterId, ...opts });
        },
        showText: async (text: string, opts: Record<string, any> = {}) => { if (!context.onRunCommand) return; await context.onRunCommand('ShowText', { text, ...opts }); },
        hideText: async (opts: Record<string, any> = {}) => { if (!context.onRunCommand) return; await context.onRunCommand('HideText', { ...opts }); },
        hideImage: async (idOrName: string) => { if (!context.onRunCommand) return; await context.onRunCommand('HideImage', { imageId: resolveAssetId(context.project.images, idOrName) || idOrName }); },
        stopSFX: async (idOrName: string, fadeDuration?: number) => { if (!context.onRunCommand) return; await context.onRunCommand('StopSoundEffect', { audioId: resolveAssetId(context.project.audio, idOrName) || idOrName, ...(fadeDuration != null ? { fadeDuration } : {}) }); },
        lightning: async (opts: Record<string, any> = {}) => { if (!context.onRunCommand) return; await context.onRunCommand('Lightning', { ...opts }); },
        fireworks: async (opts: Record<string, any> = {}) => { if (!context.onRunCommand) return; await context.onRunCommand('Fireworks', { ...opts }); },
        flashlight: async (opts: Record<string, any> = {}) => { if (!context.onRunCommand) return; await context.onRunCommand('Flashlight', { enabled: true, ...opts }); },
        flashlightOff: async () => { if (!context.onRunCommand) return; await context.onRunCommand('Flashlight', { enabled: false }); },
        screenOverlay: async (effectType: string, opts: Record<string, any> = {}) => { if (!context.onRunCommand) return; await context.onRunCommand('SetScreenOverlayEffect', { effectType, ...opts }); },
        creditRoll: async (opts: Record<string, any> = {}) => { if (!context.onRunCommand) return; await context.onRunCommand('CreditRoll', { ...opts }); },
        playMovie: async (idOrName: string, opts: Record<string, any> = {}) => {
            if (!context.onRunCommand) return;
            const videoId = resolveAssetId(context.project.videos, idOrName) || resolveAssetId(context.project.backgrounds, idOrName) || resolveAssetId(context.project.images, idOrName) || idOrName;
            // Fullscreen + waits for completion by default → the await resolves when the movie ends.
            await context.onRunCommand('PlayMovie', { videoId, ...opts });
        },
        stopMovie: async () => { if (!context.onRunCommand) return; await context.onRunCommand('StopMovie', {}); },

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
        // `eval` can't be shadowed by a var in strict mode (it's a reserved binding), so block its USE
        // statically instead. Same for the `arguments` object. (Real isolation = roadmap Phase 4.)
        if (/\beval\s*\(/.test(script.code)) {
            return {
                success: false,
                error: 'eval() is blocked in the script sandbox.',
                duration: performance.now() - startTime,
            };
        }

        // Create a sandboxed function.
        // The script code receives `game` as its only argument.
        // We block access to dangerous globals. `wait()` still works because the gameAPI.wait
        // closure (defined in THIS module scope) captures the real setTimeout — shadowing the
        // name only affects code written inside the sandboxed function body.
        // NOTE: 'eval' and 'arguments' are deliberately NOT here — in strict mode they cannot be used as
        // variable names (`var eval = …` is itself a SyntaxError that would break EVERY script). 'eval'
        // is blocked above via a static usage check instead; 'Function' (a normal identifier) is safe to shadow.
        const blockedGlobals = [
            'document', 'window', 'globalThis', 'self',
            'fetch', 'XMLHttpRequest', 'WebSocket',
            'localStorage', 'sessionStorage', 'indexedDB',
            'Function',
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

        // AsyncFunction so the script body may use `await` (e.g. `await game.wait(2)`), and so the
        // returned promise is actually awaited here (a plain Function would never await wait()).
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as FunctionConstructor;
        const scriptFn = new AsyncFunction('game', wrappedCode);
        const returnValue = await scriptFn(gameAPI);

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
