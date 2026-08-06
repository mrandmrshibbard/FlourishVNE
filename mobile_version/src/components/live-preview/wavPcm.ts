/**
 * Pure-JS WAV header/PCM reading + the engine's shared AudioContext. Engine code.
 *
 * Extracted from voiceWordTiming.ts so letter blips can reuse it: NEVER hand WAVs to
 * `decodeAudioData` — Chromium 120 (Electron 28) SEGFAULTS (0xC0000005, render-process-gone)
 * decoding WAVs whose header lies about the byte rate (common TTS output). The <audio> element
 * streams those fine; only the offline decoder dies. So we parse the RIFF chunks ourselves and
 * read PCM straight from the data chunk (byteRate deliberately IGNORED).
 *
 * All failures return null — callers fall back or go silent, never throw.
 */

let sharedCtx: AudioContext | null = null;
/** One AudioContext for the whole engine (voice-timing analysis, letter blips…). */
export const getSharedAudioContext = (): AudioContext | null => {
    try {
        if (!sharedCtx) sharedCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
        return sharedCtx;
    } catch { return null; }
};

export interface WavInfo {
    channels: number;
    rate: number;
    bits: number;
    dataStart: number;
    frames: number;
    frameBytes: number;
    kind: 'pcm16' | 'pcm8' | 'f32' | 'pcm24' | 'pcm32i';
}

/** Running inside ANY Electron shell (the editor app, desktop game exports)? There,
 *  `decodeAudioData` on COMPRESSED audio (mp3/ogg) is a proven renderer segfault
 *  (0xC0000005) whenever contextIsolation is on — Electron 28 bug, reproduced 2026-08-06
 *  with a plain 5KB mp3. Engine code must never call the native decoder under Electron;
 *  plain web browsers are unaffected and keep full function. */
export const isElectronRenderer = (): boolean => {
    try { return /\bElectron\//.test(navigator.userAgent || ''); } catch { return false; }
};

/** Is this a RIFF/WAVE container at all? Callers use this to REFUSE handing a WAV that our
 *  parser rejected to `decodeAudioData` — that's exactly the segfault class (the native
 *  decoder dies on lying headers; the <audio> element streams the same file fine). */
export const isRiffWave = (buf: ArrayBuffer): boolean => {
    try {
        const dv = new DataView(buf);
        return buf.byteLength >= 12 && dv.getUint32(0, false) === 0x52494646 && dv.getUint32(8, false) === 0x57415645;
    } catch { return false; }
};

/** Walk the RIFF chunks; null for non-WAV or compressed/exotic codecs (those may go to the
 *  native decoder instead). byteRate is ignored on purpose — see the header comment. */
export const parseWavHeader = (buf: ArrayBuffer): WavInfo | null => {
    try {
        const dv = new DataView(buf);
        if (buf.byteLength < 44) return null;
        if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null; // RIFF/WAVE
        let pos = 12;
        let fmt: { codec: number; channels: number; rate: number; bits: number } | null = null;
        let dataStart = -1, dataLen = 0;
        while (pos + 8 <= buf.byteLength) {
            const id = dv.getUint32(pos, false);
            const size = dv.getUint32(pos + 4, true);
            if (id === 0x666d7420 && size >= 16) { // 'fmt '
                fmt = {
                    codec: dv.getUint16(pos + 8, true),
                    channels: Math.max(1, dv.getUint16(pos + 10, true)),
                    rate: dv.getUint32(pos + 12, true),
                    bits: dv.getUint16(pos + 22, true),
                };
                // WAVE_FORMAT_EXTENSIBLE: real codec sits in the sub-format GUID's first word.
                if (fmt.codec === 0xfffe && size >= 40) fmt.codec = dv.getUint16(pos + 32, true);
            } else if (id === 0x64617461) { // 'data'
                dataStart = pos + 8;
                dataLen = Math.min(size, buf.byteLength - dataStart);
            }
            pos += 8 + size + (size & 1); // chunks are word-aligned
        }
        if (!fmt || dataStart < 0 || dataLen <= 0 || fmt.rate < 4000 || fmt.rate > 384000) return null;
        const kind = fmt.codec === 1 && fmt.bits === 16 ? 'pcm16'
            : fmt.codec === 1 && fmt.bits === 8 ? 'pcm8'
            : fmt.codec === 1 && fmt.bits === 24 ? 'pcm24'   // the common DAW export
            : fmt.codec === 1 && fmt.bits === 32 ? 'pcm32i'
            : fmt.codec === 3 && fmt.bits === 32 ? 'f32'
            : null;
        if (!kind) return null; // compressed-in-WAV → native decoder path
        const frameBytes = (fmt.bits / 8) * fmt.channels;
        return {
            channels: fmt.channels,
            rate: fmt.rate,
            bits: fmt.bits,
            dataStart,
            frames: Math.floor(dataLen / frameBytes),
            frameBytes,
            kind,
        };
    } catch { return null; }
};

/** Read one PCM value at byte offset `off`, normalized -1..1. */
const readPcmAt = (dv: DataView, kind: WavInfo['kind'], off: number): number => {
    switch (kind) {
        case 'pcm16': return dv.getInt16(off, true) / 32768;
        case 'pcm8': return (dv.getUint8(off) - 128) / 128;
        case 'pcm24': {
            // 24-bit little-endian signed — assemble and sign-extend by hand.
            const u = dv.getUint8(off) | (dv.getUint8(off + 1) << 8) | (dv.getUint8(off + 2) << 16);
            return (u >= 0x800000 ? u - 0x1000000 : u) / 8388608;
        }
        case 'pcm32i': return dv.getInt32(off, true) / 2147483648;
        default: return dv.getFloat32(off, true);
    }
};

/** Read one sample (first channel) at frame f, normalized -1..1. */
export const readWavSample = (dv: DataView, info: WavInfo, f: number): number =>
    readPcmAt(dv, info.kind, info.dataStart + f * info.frameBytes);

/** Decode a whole WAV's first channel to Float32 samples (blips are tiny — this is cheap). */
export const decodeWavPcm = (buf: ArrayBuffer): { sampleRate: number; samples: Float32Array } | null => {
    const info = parseWavHeader(buf);
    if (!info) return null;
    try {
        const dv = new DataView(buf);
        const samples = new Float32Array(info.frames);
        for (let f = 0; f < info.frames; f++) samples[f] = readWavSample(dv, info, f);
        return { sampleRate: info.rate, samples };
    } catch { return null; }
};

/** Read one sample of a SPECIFIC channel at frame f, normalized -1..1. */
export const readWavSampleCh = (dv: DataView, info: WavInfo, f: number, ch: number): number =>
    readPcmAt(dv, info.kind, info.dataStart + f * info.frameBytes + (info.bits / 8) * ch);

/** Decode ALL channels (reverse playback needs true stereo — collapsing to mono would change
 *  the sound). Same lying-byteRate safety as the mono reader; null → caller falls back. */
export const decodeWavPcmChannels = (buf: ArrayBuffer): { sampleRate: number; channels: Float32Array[] } | null => {
    const info = parseWavHeader(buf);
    if (!info) return null;
    try {
        const dv = new DataView(buf);
        const channels: Float32Array[] = [];
        for (let c = 0; c < info.channels; c++) {
            const samples = new Float32Array(info.frames);
            for (let f = 0; f < info.frames; f++) samples[f] = readWavSampleCh(dv, info, f, c);
            channels.push(samples);
        }
        return { sampleRate: info.rate, channels };
    } catch { return null; }
};
