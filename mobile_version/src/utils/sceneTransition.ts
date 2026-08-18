import type { VNScene, VNCustomTransition, VNSceneTransitionType } from '../features/scene/types';
import type { VNID } from '../types';

/** Built-in scene exit transitions (the black-overlay CSS ones LivePreview renders). */
export type BuiltinSceneTransition = 'fade' | 'dissolve' | 'iris-out' | 'wipe-right' | 'slide-left';
const BUILTINS = new Set<string>(['fade', 'dissolve', 'iris-out', 'wipe-right', 'slide-left']);

export type ResolvedSceneTransition =
    | { kind: 'instant' }
    | { kind: 'builtin'; type: BuiltinSceneTransition; duration: number; color?: string }
    | { kind: 'custom'; def: VNCustomTransition };

/** Whether one half of a custom transition actually has something to show. */
export function transitionHalfHasContent(half: VNCustomTransition['close'] | undefined): boolean {
    return !!(half && (half.assetId || (half.frameIds && half.frameIds.length > 0)));
}

/** Seconds one half of a custom transition takes (frame sequences derive it from fps when the
 *  author didn't set a duration; single animated files default to 1s). */
export function transitionHalfDuration(half: VNCustomTransition['close'] | undefined): number {
    if (!half) return 0;
    if (half.duration != null && half.duration > 0) return half.duration;
    if (half.frameIds?.length) return half.frameIds.length / Math.max(1, half.fps ?? 12);
    return 1;
}

/**
 * Decide which exit transition a scene change should play.
 *
 * Precedence: the jump's own override (Jump command / JumpToScene action) beats the leaving
 * scene's Scene Settings choice, which defaults to 'fade'. A `custom:<id>` that points at a
 * deleted/missing custom transition falls back to 'fade' — never a crash, never a stuck screen.
 */
export function resolveSceneTransition(
    override: string | undefined | null,
    scene: Pick<VNScene, 'outTransition' | 'outTransitionDuration' | 'outTransitionColor'> | undefined | null,
    customTransitions: Record<VNID, VNCustomTransition> | undefined | null,
    colorOverride?: string | null,
): ResolvedSceneTransition {
    const choice: string = (override && override !== 'scene-default')
        ? override
        : (scene?.outTransition || 'fade');
    // The override carries its own meaning for duration only when it's a builtin; the scene's
    // configured duration still applies (there is no per-jump duration field — keep it simple).
    const duration = scene?.outTransitionDuration ?? 0.5;
    // Fade color: the jump's own override beats the scene's setting; absent = classic black.
    const color = colorOverride || scene?.outTransitionColor || undefined;

    if (choice === 'instant') return { kind: 'instant' };
    if (choice.startsWith('custom:')) {
        const def = customTransitions?.[choice.slice('custom:'.length) as VNID];
        if (def && (def.close?.assetId || def.close?.frameIds?.length || def.open?.assetId || def.open?.frameIds?.length)) {
            return { kind: 'custom', def };
        }
        return { kind: 'builtin', type: 'fade', duration, color };
    }
    if (BUILTINS.has(choice)) return { kind: 'builtin', type: choice as BuiltinSceneTransition, duration, color };
    return { kind: 'builtin', type: 'fade', duration, color };
}
