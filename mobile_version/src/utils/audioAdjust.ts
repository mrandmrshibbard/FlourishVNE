/**
 * Per-use audio shaping (speed / reverse / keep-pitch) — Round 3. Engine code.
 *
 * ONE rule everywhere: every place that sets an <audio> element's `src` (or reuses a pooled
 * element) must call `applyAudioAdjust(el, adjust-or-null)` right after. Passing null RESETS
 * the element to normal speed — pooled/reused elements otherwise leak the previous sound's
 * rate into the next one, which is exactly the class of bug the helper exists to prevent.
 *
 * Reverse is NOT handled here (it swaps the URL, see live-preview/reversedAudio.ts) and is
 * only honored for SFX/voice/one-shots — never the music channel.
 */
import { VNAudioAdjust } from '../features/scene/types';

export const MIN_AUDIO_SPEED = 0.25;
export const MAX_AUDIO_SPEED = 4;

export const clampSpeed = (speed: number): number =>
    Math.min(MAX_AUDIO_SPEED, Math.max(MIN_AUDIO_SPEED, speed));

/**
 * Merge a per-use adjust over the asset's default, field by field (the videoTrim twin).
 * Returns null when NOTHING is set anywhere — callers can skip work entirely.
 */
export function resolveAudioAdjust(
    perUse: VNAudioAdjust | undefined | null,
    assetDefault: VNAudioAdjust | undefined | null
): VNAudioAdjust | null {
    const speed = perUse?.speed ?? assetDefault?.speed;
    const reverse = perUse?.reverse ?? assetDefault?.reverse;
    const keepPitch = perUse?.keepPitch ?? assetDefault?.keepPitch;
    if (speed === undefined && reverse === undefined && keepPitch === undefined) return null;
    const out: VNAudioAdjust = {};
    if (speed !== undefined) out.speed = speed;
    if (reverse !== undefined) out.reverse = reverse;
    if (keepPitch !== undefined) out.keepPitch = keepPitch;
    return out;
}

/**
 * Apply (or RESET, when null/absent) speed + pitch-keeping on a media element.
 * Sets defaultPlaybackRate too — `load()` and some resume paths snap playbackRate back to
 * the default, so both must agree. preservesPitch defaults to true in browsers; a speed
 * change WITHOUT keepPitch should sound like a tape (pitch shifts), so we set it explicitly
 * both ways every time.
 */
export function applyAudioAdjust(
    el: { playbackRate: number; defaultPlaybackRate: number } & Record<string, any>,
    adjust: VNAudioAdjust | null | undefined
): void {
    try {
        const rate = adjust?.speed !== undefined ? clampSpeed(adjust.speed) : 1;
        const keepPitch = adjust?.speed !== undefined ? !!adjust.keepPitch : true;
        el.defaultPlaybackRate = rate;
        el.playbackRate = rate;
        // Vendor aliases first (older engines), standard name last so it wins where supported.
        if ('mozPreservesPitch' in el) el.mozPreservesPitch = keepPitch;
        if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = keepPitch;
        if ('preservesPitch' in el) el.preservesPitch = keepPitch;
    } catch { /* an exotic element without rate support must never break playback */ }
}
