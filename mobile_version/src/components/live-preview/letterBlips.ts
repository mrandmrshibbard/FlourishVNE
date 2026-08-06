/**
 * Letter blips — the Undertale-style typing sound. Engine code (ships in built games).
 *
 * A short sound fires as the typewriter reveals letters (or at each word start). This module
 * NEVER uses `new Audio()`/the SFX pool: at ~30ms per letter that would churn allocations and
 * evict real sound effects from the 8-slot pool. Instead each blip sound is decoded ONCE into
 * an AudioBuffer and each blip is a throwaway `createBufferSource` — sample-accurate and cheap.
 *
 * Safety contract (standalone `file://` + data-URL assets included): any decode failure caches
 * `null` and the blip is simply silent — a broken sound must never break dialogue. WAV files
 * are parsed with our own reader (wavPcm.ts) — `decodeAudioData` can segfault on WAVs with
 * lying headers.
 *
 * `audioId: null` = the BUILT-IN beep: synthesized right here (~60ms decaying square wave),
 * so typing sounds work with zero uploads and zero bundled asset files.
 */
import { VNTypingBlip } from '../../features/character/types';
import { getSharedAudioContext, decodeWavPcm, isRiffWave } from './wavPcm';
import { peekReversedUrl, getReversedUrl } from './reversedAudio';
import { clampSpeed } from '../../utils/audioAdjust';

/** Per-play options. `speed` clamps 0.25–4; `reverse` follows the SFX rule: WAVs (and the
 *  built-in beep) reverse everywhere, compressed files only in browsers (never decoded on
 *  desktop — decodeAudioData segfaults there). */
export interface BlipPlayOpts { volume?: number; pitchWobble?: number; speed?: number; reverse?: boolean; }

/** Blip sounds are tiny; refuse to decode anything huge (same spirit as voiceWordTiming). */
const MAX_BLIP_BYTES = 1 * 1024 * 1024;

/** What a blip URL resolved to: a decoded WAV buffer (sample-accurate WebAudio path),
 *  'element' (compressed audio — played via a pooled <audio> element, see below),
 *  or null (broken/oversized/exotic — silent forever). */
type BlipMedium = AudioBuffer | 'element' | null;

// Cache key = `${url}` or `${url}|rev` — a reversed WAV is its own decoded variant.
const bufferCache = new Map<string, BlipMedium>();
const pending = new Map<string, Promise<BlipMedium>>();
let builtinBeep: AudioBuffer | null = null;
let builtinBeepRev: AudioBuffer | null = null;

const cacheKey = (url: string, reverse?: boolean): string => (reverse ? url + '|rev' : url);

/** Compressed sources (mp3/ogg) play through a tiny per-URL pool of <audio> elements.
 *  NEVER decodeAudioData: under Electron with contextIsolation on (the desktop app and
 *  desktop game exports) the native decoder segfaults the renderer on compressed audio —
 *  reproduced 2026-08-06 with a plain 5KB mp3 (0xC0000005, whole app dies). The element
 *  streaming pipeline plays the same files fine, and a 3-element round-robin restart is
 *  plenty for blip cadence. Wobble rides playbackRate with pitch-keeping OFF. */
const ELEMENT_POOL_SIZE = 3;
const elementPools = new Map<string, { els: HTMLAudioElement[]; next: number }>();

const playElementBlip = (url: string, opts?: BlipPlayOpts): void => {
    try {
        let pool = elementPools.get(url);
        if (!pool) { pool = { els: [], next: 0 }; elementPools.set(url, pool); }
        let el = pool.els.find(e => e.paused || e.ended);
        if (!el) {
            if (pool.els.length < ELEMENT_POOL_SIZE) {
                el = new Audio(url);
                // Rate must change PITCH here (that's what wobble means) — disable pitch-keeping.
                if ('mozPreservesPitch' in el) (el as any).mozPreservesPitch = false;
                if ('webkitPreservesPitch' in el) (el as any).webkitPreservesPitch = false;
                if ('preservesPitch' in el) (el as any).preservesPitch = false;
                pool.els.push(el);
            } else {
                el = pool.els[pool.next % pool.els.length];
                pool.next++;
            }
        }
        el.volume = Math.max(0, Math.min(1, opts?.volume ?? 1));
        const wobble = Math.max(0, Math.min(0.5, opts?.pitchWobble ?? 0));
        const speed = opts?.speed !== undefined ? clampSpeed(opts.speed) : 1;
        el.playbackRate = speed * (wobble > 0 ? 1 + (Math.random() * 2 - 1) * wobble : 1);
        try { el.currentTime = 0; } catch { /* not seekable yet — play from wherever */ }
        el.play().catch(() => { /* silent — a blip must never break dialogue */ });
    } catch { /* silent */ }
};

/** The built-in beep: a soft square wave with a fast decay — readable, not shrill.
 *  Reversed variant = the same samples backwards (a little rising "pib"). */
const getBuiltinBeep = (ctx: AudioContext, reverse?: boolean): AudioBuffer | null => {
    try {
        if (reverse && builtinBeepRev) return builtinBeepRev;
        if (!reverse && builtinBeep) return builtinBeep;
        const rate = ctx.sampleRate;
        const dur = 0.06;
        const buf = ctx.createBuffer(1, Math.floor(rate * dur), rate);
        const data = buf.getChannelData(0);
        const freq = 640;
        for (let i = 0; i < data.length; i++) {
            const t = i / rate;
            const square = Math.sign(Math.sin(2 * Math.PI * freq * t));
            const decay = Math.exp(-t * 42);
            data[i] = square * decay * 0.28;
        }
        if (reverse) { data.reverse(); builtinBeepRev = buf; }
        else builtinBeep = buf;
        return buf;
    } catch { return null; }
};

const decodeUrl = async (url: string, reverse?: boolean): Promise<BlipMedium> => {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength > MAX_BLIP_BYTES) return null;
        // WAVs go through OUR reader (decodeAudioData segfaults on lying headers).
        const wav = decodeWavPcm(bytes);
        if (wav) {
            const ctx = getSharedAudioContext();
            if (!ctx) return null;
            if (reverse) wav.samples.reverse();   // our PCM — reversing is free and safe
            const buf = ctx.createBuffer(1, wav.samples.length, wav.sampleRate);
            buf.getChannelData(0).set(wav.samples);
            return buf;
        }
        // A RIFF file our parser rejected (exotic codec-in-WAV) stays SILENT — the native
        // decoder is forbidden for those (lying-header segfault class).
        if (isRiffWave(bytes)) return null;
        // Compressed audio (mp3/ogg): the pooled <audio> element path. decodeAudioData is
        // NEVER called — it segfaults the renderer under Electron with contextIsolation on.
        // Reversed compressed blips ride reversedAudio's blob cache (browser-only; on desktop
        // it resolves null and the blip plays FORWARD — same rule as reversed SFX).
        if (reverse) {
            const rev = await getReversedUrl(url);
            if (rev) elementUrlOverride.set(cacheKey(url, true), rev);
        }
        return 'element';
    } catch { return null; }
};

/** For reversed compressed blips: which URL the element pool should actually stream. */
const elementUrlOverride = new Map<string, string>();

/** Pre-warm a blip sound so the first letter isn't late. Fire-and-forget (the returned
 *  promise is for tests — callers may ignore it). */
export const prepareBlipBuffer = (url: string | null, reverse?: boolean): Promise<BlipMedium> | void => {
    if (url === null) { const ctx = getSharedAudioContext(); if (ctx) getBuiltinBeep(ctx, reverse); return; }
    const key = cacheKey(url, reverse);
    if (bufferCache.has(key)) return Promise.resolve(bufferCache.get(key)!);
    if (pending.has(key)) return pending.get(key)!;
    const p = decodeUrl(url, reverse).then(buf => { bufferCache.set(key, buf); pending.delete(key); return buf; });
    pending.set(key, p);
    return p;
};

/**
 * Fire one blip. `url: null` = the built-in beep. Volume is the FINAL gain (caller multiplies
 * the player's Voice slider by the blip's own volume). Never throws; silently no-ops until the
 * sound is decoded.
 */
export const playBlip = (url: string | null, opts?: BlipPlayOpts): void => {
    try {
        const key = url !== null ? cacheKey(url, opts?.reverse) : null;
        if (url !== null && key !== null && bufferCache.get(key) === 'element') {
            // Reversed compressed blips stream the reversed blob when the browser could build
            // one; otherwise (desktop / failed) the original URL plays forward.
            playElementBlip(elementUrlOverride.get(key) ?? url, opts);
            return;
        }
        const ctx = getSharedAudioContext();
        if (!ctx) return;
        const cached = url === null ? getBuiltinBeep(ctx, opts?.reverse) : bufferCache.get(key!);
        if (!cached || cached === 'element') { if (url !== null) prepareBlipBuffer(url, opts?.reverse); return; }
        const buf = cached;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const wobble = Math.max(0, Math.min(0.5, opts?.pitchWobble ?? 0));
        const speed = opts?.speed !== undefined ? clampSpeed(opts.speed) : 1;
        const rate = speed * (wobble > 0 ? 1 + (Math.random() * 2 - 1) * wobble : 1);
        if (rate !== 1) src.playbackRate.value = rate;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, opts?.volume ?? 1));
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start();
    } catch { /* silent — a blip must never break dialogue */ }
};

/**
 * Which clean-text indices should blip, precomputed once per line.
 * - letter mode: every Nth ELIGIBLE character (letters/digits when skipPunctuation, default).
 * - word mode: the first eligible character of each word (after a space or at the start).
 */
export const blipIndicesFor = (cleanText: string, cfg: VNTypingBlip): Set<number> => {
    const out = new Set<number>();
    const mode = cfg.mode ?? 'letter';
    const skipPunct = cfg.skipPunctuation !== false;
    const everyN = Math.max(1, Math.round(cfg.everyN ?? (mode === 'letter' ? 2 : 1)));
    const eligible = (ch: string): boolean =>
        skipPunct ? /[\p{L}\p{N}]/u.test(ch) : !/\s/.test(ch);
    if (mode === 'word') {
        let inWord = false;
        for (let i = 0; i < cleanText.length; i++) {
            const isSpace = /\s/.test(cleanText[i]);
            if (!isSpace && !inWord && eligible(cleanText[i])) out.add(i);
            inWord = !isSpace;
        }
        return out;
    }
    let count = 0;
    for (let i = 0; i < cleanText.length; i++) {
        if (!eligible(cleanText[i])) continue;
        if (count % everyN === 0) out.add(i);
        count++;
    }
    return out;
};
