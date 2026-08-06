/**
 * Reversed audio (Round 3) — engine code. Builds a BACKWARDS copy of a sound as a blob URL,
 * cached per source, so "Play backwards" costs one decode per file per session.
 *
 * Allowed for SFX / voice / one-shots ONLY — never the music channel (owner decision: looping
 * a large reversed music file means decoding megabytes to PCM in memory; refuse the trap).
 *
 * WAVs are decoded with our own RIFF reader (decodeWavPcmChannels) — NEVER decodeAudioData,
 * which segfaults Chromium on WAVs whose header lies about byteRate (see wavPcm.ts). Non-WAV
 * (mp3/ogg) go through decodeAudioData on the shared context. Decodes are serialized; every
 * failure resolves to null and the caller plays the sound FORWARD — reverse is a flourish,
 * silence is a bug.
 */
import { decodeWavPcmChannels, getSharedAudioContext, isRiffWave, isElectronRenderer } from './wavPcm';

/** Files bigger than this are never reversed (memory: PCM decode is ~10× the file size). */
export const MAX_REVERSE_BYTES = 4 * 1024 * 1024;

/** src → blob URL, or null when reversing failed/refused (= play forward). */
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
let chain: Promise<unknown> = Promise.resolve();

/** Synchronous peek: string = reversed URL ready; null = failed (play forward);
 *  undefined = not built yet (call getReversedUrl and play late, or play forward now). */
export const peekReversedUrl = (src: string): string | null | undefined => cache.get(src);

/** Build (or fetch from cache) the reversed URL. Never rejects. */
export const getReversedUrl = (src: string): Promise<string | null> => {
    if (cache.has(src)) return Promise.resolve(cache.get(src)!);
    const inFlight = pending.get(src);
    if (inFlight) return inFlight;
    const job = chain
        .then(() => buildReversed(src))
        .catch(() => null)
        .then((url) => { cache.set(src, url); pending.delete(src); return url; });
    chain = job.catch(() => { /* keep the chain alive */ });
    pending.set(src, job);
    return job;
};

/** Test hook: drop everything (blob URLs revoked). */
export const __clearReversedCacheForTest = (): void => {
    for (const url of cache.values()) { if (url) try { URL.revokeObjectURL(url); } catch { /* noop */ } }
    cache.clear();
    pending.clear();
};

const buildReversed = async (src: string): Promise<string | null> => {
    const res = await fetch(src);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_REVERSE_BYTES) return null;

    let sampleRate: number;
    let channels: Float32Array[];
    const wav = decodeWavPcmChannels(buf);
    if (wav) {
        sampleRate = wav.sampleRate;
        channels = wav.channels;
    } else {
        // A RIFF file our parser rejected must NEVER reach the native decoder — decodeAudioData
        // segfaults the renderer on WAVs with lying headers. Play forward instead.
        if (isRiffWave(buf)) return null;
        // Under Electron (editor + desktop game exports) the native decoder ALSO segfaults on
        // compressed audio with contextIsolation on — so on desktop only WAVs can reverse;
        // mp3/ogg play forward (buildValidator points authors at converting to WAV).
        if (isElectronRenderer()) return null;
        // Non-WAV (mp3/ogg) in a plain browser: the native decoder is fine.
        const ctx = getSharedAudioContext();
        if (!ctx) return null;
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        sampleRate = decoded.sampleRate;
        channels = [];
        for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
    }
    if (!channels.length || !channels[0].length) return null;

    const reversed = channels.map((ch) => {
        const out = new Float32Array(ch.length);
        for (let i = 0, j = ch.length - 1; i < ch.length; i++, j--) out[i] = ch[j];
        return out;
    });
    return URL.createObjectURL(new Blob([encodeWavPcm16(reversed, sampleRate)], { type: 'audio/wav' }));
};

/** Minimal 16-bit PCM WAV encoder (interleaved, little-endian). Exported for tests. */
export const encodeWavPcm16 = (channels: Float32Array[], sampleRate: number): ArrayBuffer => {
    const numCh = channels.length;
    const frames = channels[0]?.length ?? 0;
    const dataLen = frames * numCh * 2;
    const buf = new ArrayBuffer(44 + dataLen);
    const dv = new DataView(buf);
    const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);                        // PCM
    dv.setUint16(22, numCh, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, sampleRate * numCh * 2, true);   // byte rate
    dv.setUint16(32, numCh * 2, true);                // block align
    dv.setUint16(34, 16, true);                       // bits
    writeStr(36, 'data'); dv.setUint32(40, dataLen, true);
    let off = 44;
    for (let f = 0; f < frames; f++) {
        for (let c = 0; c < numCh; c++) {
            const v = Math.max(-1, Math.min(1, channels[c][f] ?? 0));
            dv.setInt16(off, v < 0 ? v * 32768 : v * 32767, true);
            off += 2;
        }
    }
    return buf;
};
