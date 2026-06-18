/**
 * Tween Command Handler
 * Handles TweenElement commands by starting tweens via the TweenManager.
 * Captures current values from stage state (or resting tween values) as "from",
 * then smoothly interpolates to "to". Final values are kept in TweenManager's
 * resting store — stage state is never mutated, preventing coordinate corruption.
 */

import { TweenElementCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { TweenManager, TweenableProperties } from '../systems/tweenManager';
import type { TweenTargetType } from '../systems/tweenManager';

const PRESET_COORDS: Record<string, { x: number; y: number }> = {
    'left': { x: 25, y: 10 },
    'center': { x: 50, y: 10 },
    'right': { x: 75, y: 10 },
    'off-left': { x: -25, y: 10 },
    'off-right': { x: 125, y: 10 },
};

/**
 * Capture current property values for a target, preferring resting tween
 * values (for chaining) over raw stage state.
 */
function captureCurrentValues(
    command: TweenElementCommand,
    context: CommandContext
): TweenableProperties {
    const effectiveId = command.targetType === 'screen' ? '__screen__' : command.targetId;
    const resting = TweenManager.getRestingValues(effectiveId, command.targetType as TweenTargetType);
    const state = context.playerState.stageState;
    const current: TweenableProperties = {};

    switch (command.targetType) {
        case 'character': {
            const char = state.characters[command.targetId];
            if (!char) break;
            const pos = typeof char.position === 'object' ? char.position : (PRESET_COORDS[char.position] ?? { x: 50, y: 10 });
            if (command.x !== undefined) current.x = resting?.x ?? pos.x;
            if (command.y !== undefined) current.y = resting?.y ?? pos.y;
            if (command.scale !== undefined) current.scale = resting?.scale ?? (char as any).scale ?? 1;
            if (command.opacity !== undefined) current.opacity = resting?.opacity ?? 1;
            break;
        }
        case 'image': {
            const img = state.imageOverlays.find(o => o.id === command.targetId);
            if (!img) break;
            if (command.x !== undefined) current.x = resting?.x ?? img.x;
            if (command.y !== undefined) current.y = resting?.y ?? img.y;
            if (command.width !== undefined) current.width = resting?.width ?? img.width;
            if (command.height !== undefined) current.height = resting?.height ?? img.height;
            if (command.opacity !== undefined) current.opacity = resting?.opacity ?? img.opacity;
            if (command.rotation !== undefined) current.rotation = resting?.rotation ?? img.rotation;
            if (command.scaleX !== undefined) current.scaleX = resting?.scaleX ?? img.scaleX;
            if (command.scaleY !== undefined) current.scaleY = resting?.scaleY ?? img.scaleY;
            break;
        }
        case 'text': {
            const txt = state.textOverlays.find(o => o.id === command.targetId);
            if (!txt) break;
            if (command.x !== undefined) current.x = resting?.x ?? txt.x;
            if (command.y !== undefined) current.y = resting?.y ?? txt.y;
            if (command.fontSize !== undefined) current.fontSize = resting?.fontSize ?? txt.fontSize;
            if (command.width !== undefined) current.width = resting?.width ?? txt.width ?? 0;
            if (command.height !== undefined) current.height = resting?.height ?? txt.height ?? 0;
            if (command.color !== undefined) current.color = resting?.color ?? txt.color;
            break;
        }
        case 'button': {
            const btn = state.buttonOverlays.find(o => o.id === command.targetId);
            if (!btn) break;
            if (command.x !== undefined) current.x = resting?.x ?? btn.x;
            if (command.y !== undefined) current.y = resting?.y ?? btn.y;
            if (command.width !== undefined) current.width = resting?.width ?? btn.width;
            if (command.height !== undefined) current.height = resting?.height ?? btn.height;
            if (command.opacity !== undefined) current.opacity = resting?.opacity ?? btn.opacity;
            if (command.fontSize !== undefined) current.fontSize = resting?.fontSize ?? btn.fontSize;
            if (command.borderRadius !== undefined) current.borderRadius = resting?.borderRadius ?? btn.borderRadius;
            if (command.backgroundColor !== undefined) current.backgroundColor = resting?.backgroundColor ?? btn.backgroundColor;
            break;
        }
        case 'movie': {
            // Prefer the live overlay; fall back to the source PlayMovie command's own values when
            // the overlay isn't on stage yet (e.g. the Tween is STACKED to run alongside the Play
            // Video, so its overlay hasn't committed when `from` is captured). Without this, `from`
            // is undefined and the property (e.g. opacity) is skipped — the tween appears to do nothing.
            let base: any = (state.movieOverlays || []).find(o => o.commandId === command.targetId);
            if (!base) {
                for (const scene of Object.values(context.project.scenes) as any[]) {
                    const c = (scene.commands || []).find((cc: any) => cc.id === command.targetId);
                    if (c) { base = c; break; }
                }
            }
            if (!base) break;
            if (command.x !== undefined) current.x = resting?.x ?? base.x ?? 0;
            if (command.y !== undefined) current.y = resting?.y ?? base.y ?? 0;
            if (command.width !== undefined) current.width = resting?.width ?? base.width ?? 100;
            if (command.height !== undefined) current.height = resting?.height ?? base.height ?? 100;
            if (command.opacity !== undefined) current.opacity = resting?.opacity ?? base.opacity ?? 1;
            // Movies have no persistent rotation/scale, so tween from the identity (0 / 1).
            if (command.rotation !== undefined) current.rotation = resting?.rotation ?? 0;
            if (command.scaleX !== undefined) current.scaleX = resting?.scaleX ?? 1;
            if (command.scaleY !== undefined) current.scaleY = resting?.scaleY ?? 1;
            break;
        }
        case 'screen': {
            if (command.zoom !== undefined) current.scaleX = resting?.scaleX ?? state.screen.zoom;
            if (command.panX !== undefined) current.x = resting?.x ?? state.screen.panX;
            if (command.panY !== undefined) current.y = resting?.y ?? state.screen.panY;
            break;
        }
    }

    return current;
}

/**
 * Build the "to" target values from the command.
 */
function buildTargetValues(command: TweenElementCommand): TweenableProperties {
    const to: TweenableProperties = {};

    if (command.x !== undefined) to.x = command.x;
    if (command.y !== undefined) to.y = command.y;
    if (command.width !== undefined) to.width = command.width;
    if (command.height !== undefined) to.height = command.height;
    if (command.opacity !== undefined) to.opacity = command.opacity;
    if (command.rotation !== undefined) to.rotation = command.rotation;
    if (command.scaleX !== undefined) to.scaleX = command.scaleX;
    if (command.scaleY !== undefined) to.scaleY = command.scaleY;
    if (command.scale !== undefined) to.scale = command.scale;
    if (command.fontSize !== undefined) to.fontSize = command.fontSize;
    if (command.borderRadius !== undefined) to.borderRadius = command.borderRadius;
    if (command.color !== undefined) to.color = command.color;
    if (command.backgroundColor !== undefined) to.backgroundColor = command.backgroundColor;

    // Screen-specific: map zoom/pan to standard properties
    if (command.zoom !== undefined) to.scaleX = command.zoom;
    if (command.panX !== undefined && command.targetType === 'screen') to.x = command.panX;
    if (command.panY !== undefined && command.targetType === 'screen') to.y = command.panY;

    return to;
}

/**
 * Handle a TweenElement command.
 */
export function handleTweenElement(
    command: TweenElementCommand,
    context: CommandContext
): CommandResult {
    const { advance } = context;
    const effectiveId = command.targetType === 'screen' ? '__screen__' : command.targetId;

    const from = captureCurrentValues(command, context);
    const to = buildTargetValues(command);

    // If nothing to tween, just advance
    if (Object.keys(to).length === 0) {
        return { advance: true };
    }

    const waitForCompletion = command.waitForCompletion !== false; // default true

    TweenManager.start({
        targetId: effectiveId,
        targetType: command.targetType as TweenTargetType,
        from,
        to,
        easing: command.easing || 'easeInOutCubic',
        duration: command.duration,
        onComplete: waitForCompletion ? () => advance() : undefined,
    });

    return {
        advance: !waitForCompletion,
    };
}
