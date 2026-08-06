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
