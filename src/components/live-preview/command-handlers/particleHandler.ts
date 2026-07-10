/**
 * Particle Command Handlers
 * Processes SpawnParticles and StopParticles commands
 */

import { SpawnParticlesCommand, StopParticlesCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handle SpawnParticles command
 * Adds a particle emitter to the stage
 */
export function handleSpawnParticles(
    command: SpawnParticlesCommand,
    context: CommandContext
): CommandResult {
    const { playerState, activeEffectTimeoutsRef, advance, setPlayerState } = context;
    const tag = command.particleTag || `particles_${command.id}`;

    const hasBindings = !!(command.emitRateVariableId || command.windVariableId || command.gravityVariableId || command.opacityVariableId);
    const particleEntry = {
        tag,
        config: command.config,
        startTime: Date.now(),
        duration: command.duration || 0,
        // LIVE variable bindings ride the entry; the stage render resolves them into the
        // config each frame-render so the emitter reacts while running.
        ...(hasBindings ? {
            varBindings: {
                emitRate: command.emitRateVariableId ?? null,
                wind: command.windVariableId ?? null,
                gravity: command.gravityVariableId ?? null,
                opacity: command.opacityVariableId ?? null,
            },
        } : {}),
    };

    console.log('[ParticleHandler] SpawnParticles:', { tag, preset: command.config?.preset, emitRate: command.config?.emitRate, duration: command.duration, configKeys: Object.keys(command.config || {}) });

    // If duration > 0, auto-stop after that time
    if (command.duration > 0) {
        const timeout = window.setTimeout(() => {
            setPlayerState(p => {
                if (!p) return null;
                const { [tag]: _, ...remaining } = p.stageState.particleEffects || {};
                return {
                    ...p,
                    stageState: {
                        ...p.stageState,
                        particleEffects: remaining,
                    },
                };
            });
        }, command.duration * 1000);
        activeEffectTimeoutsRef.current.push(timeout);
    }

    return {
        advance: true,
        updates: {
            stageState: {
                ...playerState.stageState,
                particleEffects: {
                    ...(playerState.stageState.particleEffects || {}),
                    [tag]: particleEntry,
                },
            },
        },
    };
}

/**
 * Handle StopParticles command
 * Stops one or all particle effects
 */
export function handleStopParticles(
    command: StopParticlesCommand,
    context: CommandContext
): CommandResult {
    const { playerState, setPlayerState, advance: advanceFn } = context;

    if (command.fadeDuration > 0) {
        // Mark effects as fading out, then remove after fade
        const tag = command.particleTag;
        const currentEffects = { ...(playerState.stageState.particleEffects || {}) };

        if (tag) {
            if (currentEffects[tag]) {
                currentEffects[tag] = {
                    ...currentEffects[tag],
                    fadingOut: true,
                    fadeOutDuration: command.fadeDuration,
                };
            }
        } else {
            // Fade all
            for (const key of Object.keys(currentEffects)) {
                currentEffects[key] = {
                    ...currentEffects[key],
                    fadingOut: true,
                    fadeOutDuration: command.fadeDuration,
                };
            }
        }

        // Remove after fade duration
        const timeout = window.setTimeout(() => {
            setPlayerState(p => {
                if (!p) return null;
                const effects = { ...(p.stageState.particleEffects || {}) };
                if (tag) {
                    delete effects[tag];
                } else {
                    // Clear all
                    for (const key of Object.keys(effects)) {
                        delete effects[key];
                    }
                }
                return {
                    ...p,
                    stageState: { ...p.stageState, particleEffects: effects },
                };
            });
        }, command.fadeDuration * 1000);
        context.activeEffectTimeoutsRef.current.push(timeout);

        return {
            advance: true,
            updates: {
                stageState: {
                    ...playerState.stageState,
                    particleEffects: currentEffects,
                },
            },
        };
    }

    // Instant stop
    const currentEffects = { ...(playerState.stageState.particleEffects || {}) };
    if (command.particleTag) {
        delete currentEffects[command.particleTag];
    } else {
        // Clear all
        for (const key of Object.keys(currentEffects)) {
            delete currentEffects[key];
        }
    }

    return {
        advance: true,
        updates: {
            stageState: {
                ...playerState.stageState,
                particleEffects: currentEffects,
            },
        },
    };
}
