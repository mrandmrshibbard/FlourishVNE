/**
 * Character frame-animation resolution — ONE source of truth for "which asset does each layer
 * show at time t". Pure, React-free, importable by the engine bundle AND every editor canvas
 * (the poseArt.ts discipline: six render surfaces must agree; only the stage actually ticks).
 *
 * Animations are STEP-KEYFRAMES: a track says "at `atMs`, this layer shows `assetId`"
 * (null = hidden). Nothing interpolates — sprite frames are discrete drawings.
 *
 * Dangling-safe: unknown layer ids and unknown asset ids resolve to "no override", so a deleted
 * layer/asset degrades to the character's normal look instead of hiding art.
 */
import { VNID } from '../../types';
import { VNCharacter, VNCharacterAnimation } from './types';
import { assetArtForPose, characterBaseArtForPose } from './poseArt';

/** Sort a track's keys by time (defensive — the reducer normalizes, but data may predate it). */
const sortedKeys = (keys: Array<{ atMs: number; assetId: VNID | null }>) =>
    [...keys].sort((a, b) => a.atMs - b.atMs);

/**
 * The frame at time t: per track, the LAST key with atMs <= t. Looping animations wrap
 * (t % durationMs); non-looping ones clamp to the final frame. Before the first key, the
 * track has no override (the layer shows its normal selection).
 */
export function frameAssetAt(anim: VNCharacterAnimation, tMs: number): Map<VNID, VNID | null> {
    const out = new Map<VNID, VNID | null>();
    const dur = Math.max(1, anim.durationMs || 1);
    const t = anim.loop ? ((tMs % dur) + dur) % dur : Math.min(Math.max(0, tMs), dur);
    for (const track of anim.tracks || []) {
        if (!track?.layerId) continue;
        let current: { atMs: number; assetId: VNID | null } | null = null;
        for (const key of sortedKeys(track.keys || [])) {
            if (key.atMs <= t) current = key;
            else break;
        }
        if (current) out.set(track.layerId, current.assetId);
    }
    return out;
}

/**
 * Layer selections with an animation's frame applied on top. Returns the SAME reference when
 * the frame changes nothing — render paths can use identity to skip rebuilds.
 */
export function applyAnimationFrame(
    selections: Record<VNID, VNID | null>,
    anim: VNCharacterAnimation,
    tMs: number
): Record<VNID, VNID | null> {
    const frame = frameAssetAt(anim, tMs);
    if (frame.size === 0) return selections;
    let changed = false;
    const next: Record<VNID, VNID | null> = { ...selections };
    frame.forEach((assetId, layerId) => {
        if (next[layerId] !== assetId) { next[layerId] = assetId; changed = true; }
    });
    return changed ? next : selections;
}

/**
 * Animated layer rotation at time t — the Spin/Tilt lane. Per track with `rotationKeys`,
 * linearly interpolates between the surrounding keys. Rules:
 *  - before the first key: hold the first key's angle; after the last (non-loop): hold the last.
 *  - LOOPING animations also interpolate across the wrap (last key → first key at t=duration),
 *    so 0ms:0° → 1000ms:360° + loop is a continuous spin with no snap.
 *  - a track with no rotationKeys contributes nothing (undefined = the authored transform alone).
 * Returns a map layerId → degrees. The value COMPOSES with (appends to) the authored Pose
 * Studio rotation at the render site — it never replaces or writes it.
 */
/** The one interpolation rule for value-keyed lanes (rotation, squash/stretch): linear
 *  between keys; non-loop holds first before / last after; LOOPING lerps across the wrap
 *  segment (last key → first key at t=duration) so cycles never snap. `keys` must be
 *  non-empty; `t` must already be wrapped/clamped into [0, dur]. */
function lerpKeysAt<K extends { atMs: number }>(
    keys: K[],
    dur: number,
    t: number,
    loop: boolean,
    value: (k: K) => number,
): number {
    if (t <= keys[0].atMs) {
        if (loop && keys.length > 1) {
            // Before the first key in a loop: we're inside the wrap segment (last → first).
            const last = keys[keys.length - 1];
            const span = (dur - last.atMs) + keys[0].atMs;
            return span <= 0 ? value(keys[0])
                : value(last) + (value(keys[0]) - value(last)) * (((t - last.atMs) + dur) % dur) / span;
        }
        return value(keys[0]);
    }
    if (t >= keys[keys.length - 1].atMs) {
        const last = keys[keys.length - 1];
        if (loop && keys.length > 1) {
            const span = (dur - last.atMs) + keys[0].atMs;
            return span <= 0 ? value(keys[0]) : value(last) + (value(keys[0]) - value(last)) * ((t - last.atMs) / span);
        }
        return value(last);
    }
    for (let i = 0; i + 1 < keys.length; i++) {
        const a = keys[i], b = keys[i + 1];
        if (t >= a.atMs && t <= b.atMs) {
            const span = b.atMs - a.atMs;
            return span <= 0 ? value(b) : value(a) + (value(b) - value(a)) * ((t - a.atMs) / span);
        }
    }
    return value(keys[0]);
}

export function rotationAt(anim: VNCharacterAnimation, tMs: number): Record<VNID, number> {
    const out: Record<VNID, number> = {};
    const dur = Math.max(1, anim.durationMs || 1);
    const t = anim.loop ? ((tMs % dur) + dur) % dur : Math.min(Math.max(0, tMs), dur);
    for (const track of anim.tracks || []) {
        if (!track?.layerId || !track.rotationKeys?.length) continue;
        const keys = [...track.rotationKeys].sort((a, b) => a.atMs - b.atMs);
        out[track.layerId] = lerpKeysAt(keys, dur, t, !!anim.loop, k => k.deg);
    }
    return out;
}

/** The full per-layer animated adjustment at a moment: interpolated rotation plus the
 *  track's static move-offset (character-frame %) and rotation pivot (box %). Ephemeral —
 *  render-time only, never written to layers/poses/stage state. */
export interface LayerAnimAdjust {
    /** Interpolated Spin/Tilt angle (degrees), absent when the track has no rotation keys. */
    deg?: number;
    /** Interpolated Squash & Stretch multipliers (1 = normal), absent without scale keys.
     *  They may differ — non-uniform scale IS the squash/stretch effect. */
    sx?: number;
    sy?: number;
    /** Move-while-animating offset, percent of the character frame. */
    dx: number;
    dy: number;
    /** Rotation AND scale pivot, percent of the layer's own box (50/50 = centre). */
    pivotX: number;
    pivotY: number;
}

/**
 * Per-layer animated adjustments at time t — rotation (via rotationAt), squash/stretch,
 * plus each track's move offset and pivot. A layer gets an entry only when its track
 * actually adjusts something, so untouched tracks cost nothing.
 */
export function layerAdjustAt(anim: VNCharacterAnimation, tMs: number): Record<VNID, LayerAnimAdjust> {
    const rot = rotationAt(anim, tMs);
    const dur = Math.max(1, anim.durationMs || 1);
    const t = anim.loop ? ((tMs % dur) + dur) % dur : Math.min(Math.max(0, tMs), dur);
    const out: Record<VNID, LayerAnimAdjust> = {};
    for (const track of anim.tracks || []) {
        if (!track?.layerId) continue;
        const deg = rot[track.layerId];
        // The ACTIVE frame key's nudge rides the frame (STEP, like the frame itself) — the
        // per-frame alignment correction. Same active-key rule as frameAssetAt: last key at
        // or before t; before the first key there is no frame, hence no nudge.
        let frameNudgeX = 0;
        let frameNudgeY = 0;
        if (track.keys?.length) {
            let current: { atMs: number; dx?: number; dy?: number } | null = null;
            for (const key of [...track.keys].sort((a, b) => a.atMs - b.atMs)) {
                if (key.atMs <= t) current = key;
                else break;
            }
            if (current) {
                frameNudgeX = current.dx ?? 0;
                frameNudgeY = current.dy ?? 0;
            }
        }
        // Glide keys tween smoothly (same lerp as rotation/scale) and SUM with the static
        // track offset and the active frame's step nudge.
        let glideX = 0;
        let glideY = 0;
        if (track.moveKeys?.length) {
            const keys = [...track.moveKeys].sort((a, b) => a.atMs - b.atMs);
            glideX = lerpKeysAt(keys, dur, t, !!anim.loop, k => k.dx ?? 0);
            glideY = lerpKeysAt(keys, dur, t, !!anim.loop, k => k.dy ?? 0);
        }
        const dx = (track.offsetX ?? 0) + frameNudgeX + glideX;
        const dy = (track.offsetY ?? 0) + frameNudgeY + glideY;
        let sx: number | undefined;
        let sy: number | undefined;
        if (track.scaleKeys?.length) {
            const keys = [...track.scaleKeys].sort((a, b) => a.atMs - b.atMs);
            sx = lerpKeysAt(keys, dur, t, !!anim.loop, k => k.sx ?? 1);
            sy = lerpKeysAt(keys, dur, t, !!anim.loop, k => k.sy ?? 1);
        }
        if (deg === undefined && sx === undefined && dx === 0 && dy === 0) continue;
        out[track.layerId] = {
            ...(deg !== undefined ? { deg } : {}),
            ...(sx !== undefined ? { sx, sy } : {}),
            dx, dy,
            pivotX: track.pivotX ?? 50,
            pivotY: track.pivotY ?? 50,
        };
    }
    return out;
}

/**
 * Whole-character motion at time t — the Move whole character lane. Tweens the animation's
 * `motionKeys` with the SAME lerp rules as rotation/scale/glide (hold-first / clamp-last
 * non-loop; loop-seam interpolation). Percent of the character frame; applied by the render
 * site as a translate on the whole sprite (every layer, base images included). Ephemeral —
 * the character's real stage position never changes. Returns null when the animation has
 * no motion keys.
 */
export function characterMotionAt(anim: VNCharacterAnimation, tMs: number): { dx: number; dy: number } | null {
    const raw = anim.motionKeys;
    if (!raw?.length) return null;
    const keys = [...raw].sort((a, b) => a.atMs - b.atMs);
    const dur = Math.max(1, anim.durationMs || 1);
    const t = anim.loop ? ((tMs % dur) + dur) % dur : Math.min(Math.max(0, tMs), dur);
    return {
        dx: lerpKeysAt(keys, dur, t, !!anim.loop, k => k.dx ?? 0),
        dy: lerpKeysAt(keys, dur, t, !!anim.loop, k => k.dy ?? 0),
    };
}

/**
 * Every art URL any frame of the given animations can show (for the given pose) — the prewarm
 * set. An unwarmed frame URL would make the WHOLE sprite hide for a frame (atomic paint), so
 * the stage warms all of these before an animation may tick.
 */
export function animationFrameUrls(
    charData: VNCharacter,
    anims: VNCharacterAnimation[],
    poseId?: VNID | null
): string[] {
    const urls = new Set<string>();
    for (const anim of anims) {
        for (const track of anim?.tracks || []) {
            const layer = charData.layers?.[track?.layerId];
            if (!layer) continue;
            for (const key of track.keys || []) {
                if (!key?.assetId) continue;
                const asset = layer.assets?.[key.assetId];
                if (!asset) continue;
                const art = assetArtForPose(asset, poseId ?? undefined);
                if (art?.imageUrl) urls.add(art.imageUrl);
            }
        }
    }
    return [...urls];
}

/** The animations of a character that run by themselves on stage (no command needed). */
export function autoAnimationsOf(charData: VNCharacter | undefined | null): VNCharacterAnimation[] {
    if (!charData?.animations) return [];
    return (Object.values(charData.animations) as VNCharacterAnimation[])
        .filter(a => a && (a.trigger === 'always' || a.trigger === 'idle' || a.trigger === 'speaking'));
}

/**
 * Editor surfaces (previews, canvases, studios — anything that does NOT tick): the resting
 * look. 'always' animations show their t=0 frame; everything else leaves the layer alone.
 */
export function animationIdleSelections(
    charData: VNCharacter | undefined | null,
    selections: Record<VNID, VNID | null>
): Record<VNID, VNID | null> {
    if (!charData?.animations) return selections;
    let out = selections;
    for (const anim of Object.values(charData.animations) as VNCharacterAnimation[]) {
        if (anim?.trigger === 'always') out = applyAnimationFrame(out, anim, 0);
    }
    return out;
}

/** Re-exported for the stage's base-art prewarm convenience. */
export { characterBaseArtForPose };
