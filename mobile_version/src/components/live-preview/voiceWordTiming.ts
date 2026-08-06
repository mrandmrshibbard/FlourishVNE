/**
 * Voice → word-timing estimation for the karaoke reveal highlight ("sync to voice").
 *
 * No speech recognition and no models: we decode the voice clip with Web Audio, build a
 * coarse loudness envelope, split it into SPEECH SEGMENTS vs pauses, then distribute the
 * line's words across the segments proportionally (weighted by word length). The result
 * is a start-time per word that surges and pauses with the actor's delivery — approximate
 * at the phoneme level, convincing at the word level, offline and language-agnostic.
 *
 * MEMORY SAFETY (the hard-won part): `decodeAudioData` expands the WHOLE file to float
 * PCM — a minutes-long MP3 becomes hundreds of MB, and several in flight OOM-killed the
 * renderer (native crash, no JS error — "Reload or Quit"). So decoding here is
 * (1) capped: files over MAX_ANALYZE_BYTES are skipped (voice lines are short; anything
 *     huge is music and falls back to typewriter sync),
 * (2) serialized: one decode at a time, ever,
 * (3) cached PER FILE: the envelope segments are computed once per clip URL and reused
 *     for every line that speaks with it (the PCM is released as soon as the tiny
 *     envelope exists).
 *
 * Engine module: no i18n, no editor imports. All failures resolve to null (callers fall
 * back to typewriter-driven highlighting) — a broken clip must never break dialogue.
 */

/** Skip analysis for files bigger than this (compressed bytes). ~6 MB ≈ several minutes
 *  of MP3 or ~1 min of WAV — beyond any voice line; decoding bigger risks renderer OOM. */
const MAX_ANALYZE_BYTES = 6 * 1024 * 1024;

import { getSharedAudioContext, parseWavHeader, readWavSample } from './wavPcm';

const getCtx = getSharedAudioContext;

const HOP_MS = 10;          // envelope resolution
const BRIDGE_MS = 140;      // pauses shorter than this stay inside one speech segment
const MIN_SEG_MS = 60;      // discard blips shorter than this

interface Segment { start: number; end: number; } // ms
interface ClipSpeech { segs: Segment[]; totalSpeech: number; }

function findSpeechSegments(env: Float32Array): Segment[] {
    let peak = 0;
    for (const v of env) peak = Math.max(peak, v);
    if (peak <= 0) return [];
    // Threshold relative to peak with an absolute floor (hiss/room tone stays "silence").
    const thr = Math.max(peak * 0.12, 0.008);
    const segs: Segment[] = [];
    let segStart = -1;
    for (let i = 0; i <= env.length; i++) {
        const loud = i < env.length && env[i] >= thr;
        if (loud && segStart < 0) segStart = i * HOP_MS;
        if (!loud && segStart >= 0) {
            segs.push({ start: segStart, end: i * HOP_MS });
            segStart = -1;
        }
    }
    // Bridge short gaps, then drop too-short segments.
    const merged: Segment[] = [];
    for (const s of segs) {
        const last = merged[merged.length - 1];
        if (last && s.start - last.end <= BRIDGE_MS) last.end = s.end;
        else merged.push({ ...s });
    }
    return merged.filter(s => s.end - s.start >= MIN_SEG_MS);
}

/**
 * Pure-JS WAV envelope — NEVER hand WAVs to decodeAudioData. Chromium 120 (Electron 28)
 * SEGFAULTS (0xC0000005, render-process-gone) decoding WAVs whose header lies about the
 * byte rate (common TTS-tool output: 24 kHz/16-bit mono declaring 96000 B/s). The <audio>
 * element streams those fine — only the offline decoder dies — so we parse PCM ourselves
 * from the data chunk (byteRate deliberately IGNORED) and build the envelope directly.
 * Returns null for compressed/exotic WAV codecs (those fall through to decodeAudioData).
 */
function wavEnvelope(buf: ArrayBuffer): Float32Array | null {
    try {
        // Header walk + sample reading shared with letter blips (wavPcm.ts) — same contract,
        // same byteRate-ignoring safety. The envelope math below is unchanged.
        const info = parseWavHeader(buf);
        if (!info) return null;
        const dv = new DataView(buf);
        const hopFrames = Math.max(1, Math.round((info.rate * HOP_MS) / 1000));
        const env = new Float32Array(Math.ceil(info.frames / hopFrames));
        for (let e = 0; e < env.length; e++) {
            let sum = 0;
            const from = e * hopFrames, to = Math.min(info.frames, from + hopFrames);
            for (let f = from; f < to; f++) {
                const v = readWavSample(dv, info, f); // first channel only
                sum += v * v;
            }
            env[e] = Math.sqrt(sum / Math.max(1, to - from));
        }
        return env;
    } catch { return null; }
}

/** One decode at a time, ever — concurrent full-file PCM expansions are what OOM'd the
 *  renderer. The chain swallows failures so one bad clip can't wedge the queue. */
let decodeChain: Promise<unknown> = Promise.resolve();

/** Per-FILE speech-segment cache: decode + envelope once per clip URL; every line that
 *  uses the clip shares the result. The bulky decoded PCM never escapes this scope. */
const clipCache = new Map<string, Promise<ClipSpeech | null>>();

function getClipSpeech(url: string): Promise<ClipSpeech | null> {
    const hit = clipCache.get(url);
    if (hit) return hit;
    const job: Promise<ClipSpeech | null> = decodeChain
        .then(async (): Promise<ClipSpeech | null> => {
            try {
                const res = await fetch(url);
                const buf = await res.arrayBuffer();
                if (buf.byteLength > MAX_ANALYZE_BYTES) return null; // music-sized: typewriter fallback

                // WAVs: ALWAYS the pure-JS parser (decodeAudioData segfaults on lying headers).
                let env = wavEnvelope(buf);

                // A RIFF file our parser rejected (exotic codec) must NEVER reach the native
                // decoder — that's exactly the crash class. Skip analysis for it instead.
                const isRiff = buf.byteLength >= 4 && new DataView(buf).getUint32(0, false) === 0x52494646;
                if (!env && isRiff) return null;

                // Under Electron the native decoder ALSO segfaults on COMPRESSED audio when
                // contextIsolation is on (0xC0000005, reproduced 2026-08-06) — skip analysis
                // there; voiced lines fall back to plain typewriter pacing.
                if (!env && /\bElectron\//.test(navigator.userAgent || '')) return null;

                // Compressed formats (mp3/ogg/…): the native decoder, size-capped + serialized.
                if (!env) {
                    const ctx = getCtx();
                    if (!ctx) return null;
                    // decodeAudioData detaches the buffer on some engines — hand it our only copy.
                    const audio = await ctx.decodeAudioData(buf);
                    const ch = audio.getChannelData(0);
                    const hop = Math.max(1, Math.round((audio.sampleRate * HOP_MS) / 1000));
                    env = new Float32Array(Math.ceil(ch.length / hop));
                    for (let i = 0; i < env.length; i++) {
                        let sum = 0;
                        const from = i * hop, to = Math.min(ch.length, from + hop);
                        for (let j = from; j < to; j++) sum += ch[j] * ch[j];
                        env[i] = Math.sqrt(sum / Math.max(1, to - from));
                    }
                }
                const segs = findSpeechSegments(env);
                if (!segs.length) return null;
                return { segs, totalSpeech: segs.reduce((a, s) => a + (s.end - s.start), 0) };
            } catch {
                return null; // undecodable/unfetchable clip → typewriter fallback
            }
        });
    decodeChain = job.catch(() => null);
    clipCache.set(url, job);
    return job;
}

/**
 * Estimate a start time (ms) for each word of a voiced line.
 * `weights` = relative spoken length per word (callers pass word character counts).
 * Resolves null when the clip can't/shouldn't be decoded or has no detectable speech.
 */
export function analyzeVoiceWordStarts(url: string, weights: number[]): Promise<number[] | null> {
    if (!url || !weights.length) return Promise.resolve(null);
    return getClipSpeech(url).then(clip => {
        if (!clip) return null;
        const { segs, totalSpeech } = clip;
        // Distribute words across the speech segments sequentially, each word taking a
        // share of the TOTAL speech time proportional to its weight; pauses between
        // segments are skipped over, which is what makes the highlight "breathe".
        const totalWeight = weights.reduce((a, w) => a + w, 0) || 1;
        const starts: number[] = [];
        let segIdx = 0;
        let posInSeg = 0; // ms consumed inside segs[segIdx]
        for (const w of weights) {
            const seg = segs[Math.min(segIdx, segs.length - 1)];
            starts.push(seg.start + posInSeg);
            let need = (w / totalWeight) * totalSpeech;
            // walk forward through segments until this word's share is consumed
            while (need > 0 && segIdx < segs.length) {
                const s = segs[segIdx];
                const room = (s.end - s.start) - posInSeg;
                if (need < room) { posInSeg += need; need = 0; }
                else { need -= room; segIdx++; posInSeg = 0; }
            }
        }
        return starts;
    });
}
