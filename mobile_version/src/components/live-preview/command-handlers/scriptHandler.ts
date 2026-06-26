/**
 * Script Command Handler
 * Processes RunScript commands at runtime in LivePreview
 */

import { RunScriptCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { executeScript, ScriptRuntimeContext } from '../../../features/scripting/ScriptExecutor';
import { MAX_CALL_DEPTH } from './commonEventHandler';
import { VNScript, ScriptParam } from '../../../types/scripting';
import { VNProject } from '../../../types/project';
import { VNID } from '../../../types';

/** Guard against runaway script-to-script recursion (A → B → A …). */
const MAX_SCRIPT_DEPTH = 16;

type VarValue = string | number | boolean;

/** Resolve a script by name or ID. */
function findScript(project: VNProject, nameOrId: string): VNScript | undefined {
    const scripts = project.scripts || {};
    if (scripts[nameOrId]) return scripts[nameOrId];
    const lower = nameOrId.toLowerCase();
    return Object.values(scripts).find(s => s.name.toLowerCase() === lower);
}

/** Coerce an incoming arg to the param's declared type. */
function coerceValue(value: VarValue, type: ScriptParam['type']): VarValue {
    if (type === 'number') {
        const n = typeof value === 'number' ? value : parseFloat(String(value));
        return isNaN(n) ? 0 : n;
    }
    if (type === 'boolean') {
        if (typeof value === 'boolean') return value;
        return value === 'true' || value === 1 || value === '1';
    }
    return String(value);
}

/**
 * Build the read-only `game.args` map for a script: param NAME → value, taking the
 * supplied argument (keyed by param id OR name) or the param default, coerced to type.
 * Args are exposed via game.args only — never written into the global variable store,
 * so there is no variable leak.
 */
function resolveArgs(script: VNScript, supplied?: Record<string, VarValue>): Record<string, VarValue> {
    const out: Record<string, VarValue> = {};
    for (const p of script.params || []) {
        let v: VarValue | undefined;
        if (supplied) {
            if (p.id in supplied) v = supplied[p.id];
            else if (p.name in supplied) v = supplied[p.name];
        }
        out[p.name] = v !== undefined ? coerceValue(v, p.type) : p.defaultValue;
    }
    return out;
}

/**
 * Handle a RunScript command by executing the referenced script
 * within a sandbox that has access to the game API.
 */
export const handleRunScript = async (
    command: RunScriptCommand,
    context: CommandContext
): Promise<CommandResult> => {
    const { project, playerState } = context;

    const script = (project.scripts || {})[command.scriptId];

    if (!script) {
        console.warn(`[RunScript] Script not found: ${command.scriptId}`);
        return { advance: true };
    }

    if (!script.enabled) {
        console.log(`[RunScript] Script "${script.name}" is disabled, skipping.`);
        return { advance: true };
    }

    // Scene name→id lookup for jumpToScene by name.
    const sceneNameToId: Record<string, VNID> = {};
    for (const [id, scene] of Object.entries(project.scenes)) {
        sceneNameToId[scene.name.toLowerCase()] = id;
    }

    // Audio name→id lookup for playSFX/playMusic by name.
    const resolveAudioId = (nameOrId: string): string => {
        if (project.audio[nameOrId]) return nameOrId;
        const lower = nameOrId.toLowerCase();
        for (const [id, audio] of Object.entries(project.audio)) {
            if (audio.name.toLowerCase() === lower) return id;
        }
        return nameOrId;
    };

    const resolveVarId = (nameOrId: string): VNID => {
        if (project.variables[nameOrId]) return nameOrId;
        const lower = nameOrId.toLowerCase();
        for (const [id, variable] of Object.entries(project.variables)) {
            if (variable.name.toLowerCase() === lower) return id;
        }
        return nameOrId;
    };

    // --- Effect accumulators (shared across recursive runScript calls) ---
    const variableUpdates: Record<VNID, VarValue> = { ...playerState.variables };
    let dialogueUpdate: { characterName: string; characterColor: string; characterId: VNID | null; text: string } | undefined;
    let musicStateUpdate: Record<string, any> | undefined;
    let navigationRequest: { type: 'scene' | 'label'; target: string } | undefined;
    let pendingCommonEvent: { commonEventId: VNID; variableOverrides: Record<string, VarValue> } | undefined;

    // Imperative music playback (mirrors audioHandler.handlePlayMusic core).
    const playMusicImperative = (nameOrId: string, loop?: boolean, volume?: number) => {
        const audioId = resolveAudioId(nameOrId);
        const url = context.assetResolver(audioId, 'audio');
        const audio = context.musicAudioRef.current;
        if (!url || !audio) {
            console.warn(`[Script] playMusic: no audio for "${nameOrId}"`);
            return;
        }
        const currentSrcPath = audio.src ? new URL(audio.src, window.location.href).pathname : null;
        const newSrcPath = new URL(url, window.location.href).pathname;
        const isNewTrack = currentSrcPath !== newSrcPath;
        const target = (typeof volume === 'number') ? volume : context.settings.musicVolume;
        const startPlayback = () => {
            audio.loop = !!loop;
            audio.volume = 0;
            audio.play().then(() => context.fadeAudio(audio, target, 1)).catch(e => console.error('[Script] playMusic failed:', e));
        };
        if (isNewTrack) {
            audio.src = url;
            audio.load();
            audio.addEventListener('canplaythrough', startPlayback, { once: true });
        } else if (audio.paused) {
            startPlayback();
        }
        musicStateUpdate = { audioId, loop: !!loop, currentTime: 0, isPlaying: true };
    };

    // Execute a script (recursively for script-to-script), sharing the accumulators.
    const runScriptInternal = async (scr: VNScript, args: Record<string, VarValue>, depth: number): Promise<void> => {
        if (depth > MAX_SCRIPT_DEPTH) {
            console.error(`[RunScript] Recursion limit (${MAX_SCRIPT_DEPTH}) reached at "${scr.name}"`);
            if (!context.isStandalone) context.notify?.(`Script recursion limit reached ("${scr.name}")`, 'error');
            return;
        }

        const runtimeContext: ScriptRuntimeContext = {
            project,
            variables: variableUpdates, // reads see prior accumulated writes
            currentSceneId: playerState.currentSceneId || project.startSceneId,
            args,

            onSetVariable: (nameOrId, value) => {
                variableUpdates[resolveVarId(nameOrId)] = value;
            },
            onJumpToScene: () => { /* recorded via result.navigationRequest */ },
            onJumpToLabel: () => { /* recorded via result.navigationRequest */ },

            onShowDialogue: (characterName, text) => {
                // Fire-and-forget: set the current dialogue line (last call wins).
                const match = Object.values(project.characters).find(c => c.name.toLowerCase() === characterName.toLowerCase());
                dialogueUpdate = {
                    characterName: characterName || 'Narrator',
                    characterColor: match?.color || '#FFFFFF',
                    characterId: match?.id || null,
                    text,
                };
            },

            onPlaySFX: (nameOrId, volume) => {
                context.playSound(resolveAudioId(nameOrId), volume);
            },

            onPlayMusic: (nameOrId, loop, volume) => {
                playMusicImperative(nameOrId, loop, volume);
            },

            onStopMusic: (fadeDuration) => {
                if (context.musicAudioRef.current) {
                    context.fadeAudio(context.musicAudioRef.current, 0, fadeDuration || 1);
                }
                musicStateUpdate = { audioId: null, loop: false, currentTime: 0, isPlaying: false };
            },

            onNotify: (message, type) => {
                context.notify?.(message, type);
            },

            onRunScript: (nameOrId, a) => {
                const target = findScript(project, nameOrId);
                if (!target) {
                    console.warn(`[Script] runScript: script not found "${nameOrId}"`);
                    return undefined;
                }
                if (!target.enabled) return undefined;
                // Return the promise so a script can `await game.runScript(...)` for ordering.
                return runScriptInternal(target, resolveArgs(target, a), depth + 1);
            },

            onCallCommonEvent: (nameOrId, a) => {
                const events = project.commonEvents || {};
                let ce = events[nameOrId];
                if (!ce) {
                    const lower = nameOrId.toLowerCase();
                    ce = Object.values(events).find(e => e.name.toLowerCase() === lower) as any;
                }
                if (!ce || !ce.enabled) {
                    console.warn(`[Script] callCommonEvent: not found/disabled "${nameOrId}"`);
                    return;
                }
                const overrides: Record<string, VarValue> = {};
                for (const param of ce.parameters || []) {
                    let v: VarValue | undefined;
                    if (a) {
                        if (param.id in a) v = a[param.id];
                        else if (param.name in a) v = a[param.name];
                    }
                    overrides[param.id] = v !== undefined ? v : param.defaultValue;
                }
                pendingCommonEvent = { commonEventId: ce.id, variableOverrides: overrides };
            },

            // Presentation parity: run a real engine command imperatively, reusing the live runtime's
            // command handlers. No-op if the runtime didn't provide the bridge (e.g. ScriptEditor test run).
            onRunCommand: context.runCommand
                ? (type, params) => context.runCommand!(type, params)
                : undefined,
            // UI parity: fire a real UI action (go to screen, save/load, show/hide element…).
            onRunUIAction: context.runUIAction
                ? (actionType, params) => context.runUIAction!(actionType, params)
                : undefined,
            isStandalone: context.isStandalone,
        };

        const result = await executeScript(scr, runtimeContext);
        if (!result.success) {
            console.error(`[RunScript] Script "${scr.name}" failed:`, result.error);
            if (result.stack) console.error(result.stack);
            if (!context.isStandalone) context.notify?.(`Script "${scr.name}" error: ${result.error}`, 'error');
        } else {
            console.log(`[RunScript] Script "${scr.name}" completed in ${result.duration.toFixed(1)}ms`);
        }
        if (result.navigationRequest) navigationRequest = result.navigationRequest;
    };

    // Run the top-level script with its resolved args.
    await runScriptInternal(script, resolveArgs(script, command.arguments), 0);

    // --- Build the command result from accumulated effects ---
    const updates: NonNullable<CommandResult['updates']> = {};

    if (Object.keys(variableUpdates).length > 0) updates.variables = variableUpdates;
    if (dialogueUpdate) updates.uiState = { ...(updates.uiState || {}), dialogue: dialogueUpdate };
    if (musicStateUpdate) updates.musicState = musicStateUpdate;

    // A script that called a Common Event takes over the command flow (stack push).
    if (pendingCommonEvent) {
        const ce = (project.commonEvents || {})[pendingCommonEvent.commonEventId];
        const onStack = playerState.commandStack.some(f => f.commonEventId === pendingCommonEvent!.commonEventId);
        if (playerState.commandStack.length >= MAX_CALL_DEPTH || onStack) {
            console.error(`[Script] callCommonEvent blocked (depth/cycle): "${ce?.name || pendingCommonEvent.commonEventId}"`);
            if (!context.isStandalone) context.notify?.(`Common Event call blocked (depth/cycle): "${ce?.name || ''}"`, 'error');
        } else if (ce && ce.commands && ce.commands.length > 0) {
            // Save prior values of overridden params for restoration on return (local scope).
            const savedVariables: Record<VNID, VarValue> = {};
            const clearedVariables: VNID[] = [];
            for (const k of Object.keys(pendingCommonEvent.variableOverrides)) {
                if (Object.prototype.hasOwnProperty.call(variableUpdates, k)) savedVariables[k] = variableUpdates[k];
                else clearedVariables.push(k);
            }
            const newStack = [
                ...playerState.commandStack,
                {
                    sceneId: playerState.currentSceneId,
                    commands: playerState.currentCommands,
                    index: playerState.currentIndex + 1,
                    commonEventId: ce.id,
                    ...(Object.keys(savedVariables).length > 0 ? { savedVariables } : {}),
                    ...(clearedVariables.length > 0 ? { clearedVariables } : {}),
                },
            ];
            return {
                advance: false,
                updates: {
                    ...updates,
                    currentCommands: ce.commands,
                    currentIndex: 0,
                    commandStack: newStack,
                    variables: { ...variableUpdates, ...pendingCommonEvent.variableOverrides },
                },
            };
        }
    }

    // Scene/label navigation requested by the script.
    if (navigationRequest) {
        if (navigationRequest.type === 'scene') {
            const target = navigationRequest.target;
            let sceneId = target;
            if (!project.scenes[target]) sceneId = sceneNameToId[target.toLowerCase()] || target;
            if (project.scenes[sceneId]) {
                updates.currentSceneId = sceneId;
                updates.currentCommands = project.scenes[sceneId].commands;
                updates.currentIndex = 0;
            }
        } else if (navigationRequest.type === 'label') {
            const currentSceneId = playerState.currentSceneId || project.startSceneId;
            const scene = project.scenes[currentSceneId];
            if (scene) {
                const labelIndex = scene.commands.findIndex(
                    (cmd: any) => cmd.type === 'Label' && cmd.labelId === navigationRequest!.target
                );
                if (labelIndex >= 0) updates.currentIndex = labelIndex + 1;
            }
        }
    }

    return { advance: true, updates };
};
