/**
 * Script Command Handler
 * Processes RunScript commands at runtime in LivePreview
 */

import { RunScriptCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { executeScript, ScriptRuntimeContext } from '../../../features/scripting/ScriptExecutor';
import { VNID } from '../../../types';

/**
 * Handle a RunScript command by executing the referenced script
 * within a sandbox that has access to the game API.
 */
export const handleRunScript = (
    command: RunScriptCommand,
    context: CommandContext
): CommandResult => {
    const { project, playerState } = context;
    const scripts = project.scripts || {};
    const script = scripts[command.scriptId];

    if (!script) {
        console.warn(`[RunScript] Script not found: ${command.scriptId}`);
        return { advance: true };
    }

    if (!script.enabled) {
        console.log(`[RunScript] Script "${script.name}" is disabled, skipping.`);
        return { advance: true };
    }

    // Build scene name→id lookup for jumpToScene by name
    const sceneNameToId: Record<string, VNID> = {};
    for (const [id, scene] of Object.entries(project.scenes)) {
        sceneNameToId[scene.name.toLowerCase()] = id;
    }

    // Track variable changes to apply as updates
    const variableUpdates: Record<VNID, string | number | boolean> = { ...playerState.variables };

    // Build the runtime context
    const runtimeContext: ScriptRuntimeContext = {
        project,
        variables: { ...playerState.variables },
        currentSceneId: playerState.currentSceneId || project.startSceneId,

        onSetVariable: (nameOrId: string, value: string | number | boolean) => {
            // Resolve name to ID
            let varId = nameOrId;
            if (!project.variables[nameOrId]) {
                for (const [id, variable] of Object.entries(project.variables)) {
                    if (variable.name.toLowerCase() === nameOrId.toLowerCase()) {
                        varId = id;
                        break;
                    }
                }
            }
            variableUpdates[varId] = value;
        },

        onJumpToScene: (nameOrId: string) => {
            // Handled via navigationRequest in the result
        },

        onJumpToLabel: (labelId: string) => {
            // Handled via navigationRequest in the result
        },

        onShowDialogue: (characterName: string, text: string) => {
            // This is a fire-and-forget visual effect from scripts
            console.log(`[Script Dialogue] ${characterName}: ${text}`);
        },

        onPlaySFX: (nameOrId: string, volume?: number) => {
            // Resolve audio name to ID and play
            let audioId = nameOrId;
            if (!project.audio[nameOrId]) {
                for (const [id, audio] of Object.entries(project.audio)) {
                    if (audio.name.toLowerCase() === nameOrId.toLowerCase()) {
                        audioId = id;
                        break;
                    }
                }
            }
            context.playSound(audioId, volume);
        },

        onPlayMusic: (nameOrId: string, loop?: boolean, volume?: number) => {
            console.log(`[Script] playMusic: ${nameOrId} loop=${loop} vol=${volume}`);
        },

        onStopMusic: (fadeDuration?: number) => {
            if (context.musicAudioRef.current) {
                context.fadeAudio(context.musicAudioRef.current, 0, fadeDuration || 1);
            }
        },

        onNotify: (message: string, type?: 'info' | 'warning' | 'error') => {
            console.log(`[Script Notify] [${type || 'info'}] ${message}`);
        },
    };

    // Execute the script
    const result = executeScript(script, runtimeContext);

    if (!result.success) {
        console.error(`[RunScript] Script "${script.name}" failed:`, result.error);
        if (result.stack) console.error(result.stack);
    } else {
        console.log(`[RunScript] Script "${script.name}" completed in ${result.duration.toFixed(1)}ms`);
    }

    // Build the command result
    const commandResult: CommandResult = {
        advance: true,
        updates: {},
    };

    // Apply variable changes
    if (Object.keys(variableUpdates).length > 0) {
        commandResult.updates!.variables = variableUpdates;
    }

    // Handle navigation requests
    if (result.navigationRequest) {
        if (result.navigationRequest.type === 'scene') {
            const target = result.navigationRequest.target;
            let sceneId = target;
            if (!project.scenes[target]) {
                sceneId = sceneNameToId[target.toLowerCase()] || target;
            }
            if (project.scenes[sceneId]) {
                commandResult.updates!.currentSceneId = sceneId;
                commandResult.updates!.currentCommands = project.scenes[sceneId].commands;
                commandResult.updates!.currentIndex = 0;
            }
        } else if (result.navigationRequest.type === 'label') {
            // Find the label in the current scene
            const currentSceneId = playerState.currentSceneId || project.startSceneId;
            const scene = project.scenes[currentSceneId];
            if (scene) {
                const labelIndex = scene.commands.findIndex(
                    (cmd: any) => cmd.type === 'Label' && cmd.labelId === result.navigationRequest!.target
                );
                if (labelIndex >= 0) {
                    commandResult.updates!.currentIndex = labelIndex + 1;
                }
            }
        }
    }

    return commandResult;
};
