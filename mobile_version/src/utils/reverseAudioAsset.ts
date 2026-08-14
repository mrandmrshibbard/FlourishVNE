/**
 * Author-time audio reversal — the "Save a reversed copy" Asset Manager tool.
 *
 * Decodes an existing audio asset ONCE in the editor, reverses it, and encodes a plain
 * 16-bit PCM WAV. The result is saved back into the project as an ordinary audio asset,
 * so it plays anywhere — including the music channel, which deliberately refuses RUNTIME
 * reversal (decoding a looping song to PCM in memory every play is the trap; baking once
 * at author time is the middle ground).
 *
 * Decode rules (same hard-won rules as the runtime path in live-preview/reversedAudio.ts):
 *  - WAV → our own RIFF reader. NEVER decodeAudioData on a RIFF: it segfaults Chromium
 *    when the header lies about byteRate.
 *  - Non-WAV under Electron → REFUSE. decodeAudioData on compressed audio segfaults the
 *    renderer with contextIsolation on — a try/catch cannot catch a crashed process, and
 *    this is the editor holding unsaved work. The caller shows "convert to WAV first".
 *  - Non-WAV in a plain browser → decodeAudioData is fine.
 *
 * Unlike the runtime path there is NO size cap: the bake is an explicit one-shot the
 * author asked for, not something that happens on every play. Callers report the output
 * size instead (WAV is uncompressed — long songs get big).
 */
import { decodeWavPcmChannels, getSharedAudioContext, isRiffWave, isElectronRenderer } from '../components/live-preview/wavPcm';
import { encodeWavPcm16 } from '../components/live-preview/reversedAudio';

/** Why a bake couldn't happen — callers map these to plain-words toasts. */
export type ReverseBakeFailure =
    | 'fetch-failed'       // couldn't read the asset at all
    | 'bad-wav'            // a RIFF file our parser rejected (never native-decoded)
    | 'desktop-non-wav'    // mp3/ogg on desktop — native decode would crash the editor
    | 'decode-failed'      // browser decodeAudioData rejected the data
    | 'empty';             // decoded to zero samples

export type ReverseBakeResult =
    | { ok: true; wav: ArrayBuffer; seconds: number; sampleRate: number; channels: number }
    | { ok: false; reason: ReverseBakeFailure };

/** PURE: backwards-copy every channel (exported for tests). */
export function reverseChannels(channels: Float32Array[]): Float32Array[] {
    return channels.map((ch) => {
        const out = new Float32Array(ch.length);
        for (let i = 0, j = ch.length - 1; i < ch.length; i++, j--) out[i] = ch[j];
        return out;
    });
}

/** PURE-ish core: bytes in → reversed WAV bytes out (async only for the browser decoder). */
export async function bakeReversedWav(buf: ArrayBuffer): Promise<ReverseBakeResult> {
    let sampleRate: number;
    let channels: Float32Array[];

    const wav = decodeWavPcmChannels(buf);
    if (wav) {
        sampleRate = wav.sampleRate;
        channels = wav.channels;
    } else if (isRiffWave(buf)) {
        // A RIFF our parser rejected must never reach the native decoder (segfault rule).
        return { ok: false, reason: 'bad-wav' };
    } else if (isElectronRenderer()) {
        // Desktop: compressed audio would crash the renderer in the native decoder.
        return { ok: false, reason: 'desktop-non-wav' };
    } else {
        const ctx = getSharedAudioContext();
        if (!ctx) return { ok: false, reason: 'decode-failed' };
        let decoded: AudioBuffer;
        try {
            decoded = await ctx.decodeAudioData(buf.slice(0));
        } catch {
            return { ok: false, reason: 'decode-failed' };
        }
        sampleRate = decoded.sampleRate;
        channels = [];
        for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    }

    if (!channels.length || !channels[0].length || !sampleRate) return { ok: false, reason: 'empty' };

    const reversed = reverseChannels(channels);
    return {
        ok: true,
        wav: encodeWavPcm16(reversed, sampleRate),
        seconds: channels[0].length / sampleRate,
        sampleRate,
        channels: channels.length,
    };
}

/** Fetch an asset URL (flourish-asset:// / data: / blob: all fine) and bake it. */
export async function bakeReversedWavFromUrl(url: string): Promise<ReverseBakeResult> {
    let buf: ArrayBuffer;
    try {
        const res = await fetch(url);
        if (!res.ok) return { ok: false, reason: 'fetch-failed' };
        buf = await res.arrayBuffer();
    } catch {
        return { ok: false, reason: 'fetch-failed' };
    }
    return bakeReversedWav(buf);
}

/** The reversed asset's display name: "Name (reversed)", numbered on collisions. */
export function reversedAssetName(baseName: string, existingNames: Iterable<string>): string {
    const taken = new Set<string>();
    for (const n of existingNames) taken.add(n);
    const base = `${baseName} (reversed)`;
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) {
        const candidate = `${base} ${i}`;
        if (!taken.has(candidate)) return candidate;
    }
}
