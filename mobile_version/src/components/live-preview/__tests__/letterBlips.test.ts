/**
 * Letter-blip engine: WAV reader shared with voice timing, blip index math, and the WebAudio
 * playback path (mocked context). Failures must be silent — a blip can never break dialogue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWavHeader, decodeWavPcm, isRiffWave } from '../wavPcm';
import { blipIndicesFor, playBlip, prepareBlipBuffer } from '../letterBlips';

/** Build a minimal PCM16 mono WAV with the given samples; byteRate deliberately LIES. */
const makeWav = (samples: number[], rate = 24000, lyingByteRate = 96000): ArrayBuffer => {
    const dataLen = samples.length * 2;
    const buf = new ArrayBuffer(44 + dataLen);
    const dv = new DataView(buf);
    const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); w(8, 'WAVE');
    w(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);          // PCM
    dv.setUint16(22, 1, true);          // mono
    dv.setUint32(24, rate, true);
    dv.setUint32(28, lyingByteRate, true); // header LIES — must be ignored
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    w(36, 'data'); dv.setUint32(40, dataLen, true);
    samples.forEach((s, i) => dv.setInt16(44 + i * 2, Math.round(s * 32767), true));
    return buf;
};

describe('wavPcm', () => {
    it('decodes PCM16 and ignores the lying byteRate', () => {
        const wav = makeWav([0, 0.5, -0.5, 1], 24000, 999999);
        const info = parseWavHeader(wav)!;
        expect(info.rate).toBe(24000);
        expect(info.frames).toBe(4);
        const pcm = decodeWavPcm(wav)!;
        expect(pcm.sampleRate).toBe(24000);
        expect(pcm.samples.length).toBe(4);
        expect(pcm.samples[1]).toBeCloseTo(0.5, 2);
        expect(pcm.samples[2]).toBeCloseTo(-0.5, 2);
    });
    it('malformed buffers return null, never throw', () => {
        expect(parseWavHeader(new ArrayBuffer(10))).toBeNull();
        expect(decodeWavPcm(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
        const notWav = makeWav([0]);
        new DataView(notWav).setUint32(8, 0x11111111, false); // break the WAVE tag
        expect(parseWavHeader(notWav)).toBeNull();
    });
    it('decodes 24-bit PCM (the common DAW export that used to fall to the native decoder)', () => {
        // Hand-build a 2-frame 24-bit mono WAV: +0.5 and -0.5.
        const dataLen = 2 * 3;
        const buf = new ArrayBuffer(44 + dataLen);
        const dv = new DataView(buf);
        const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); w(8, 'WAVE');
        w(12, 'fmt '); dv.setUint32(16, 16, true);
        dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
        dv.setUint32(24, 48000, true); dv.setUint32(28, 48000 * 3, true);
        dv.setUint16(32, 3, true); dv.setUint16(34, 24, true);
        w(36, 'data'); dv.setUint32(40, dataLen, true);
        const put24 = (off: number, v: number) => { const u = v < 0 ? v + 0x1000000 : v; dv.setUint8(off, u & 0xff); dv.setUint8(off + 1, (u >> 8) & 0xff); dv.setUint8(off + 2, (u >> 16) & 0xff); };
        put24(44, 4194304);    // +0.5 * 2^23
        put24(47, -4194304);   // -0.5
        const pcm = decodeWavPcm(buf)!;
        expect(pcm).not.toBeNull();
        expect(pcm.samples[0]).toBeCloseTo(0.5, 3);
        expect(pcm.samples[1]).toBeCloseTo(-0.5, 3);
    });
    it('isRiffWave spots WAV containers (incl. ones our parser rejects) and nothing else', () => {
        expect(isRiffWave(makeWav([0]))).toBe(true);
        const compressed = makeWav([0]);
        new DataView(compressed).setUint16(20, 85, true);   // codec 85 = MP3-in-WAV → parser rejects
        expect(parseWavHeader(compressed)).toBeNull();
        expect(isRiffWave(compressed)).toBe(true);          // …but it's still RIFF → decodeAudioData is FORBIDDEN
        expect(isRiffWave(new Uint8Array([1, 2, 3, 4]).buffer)).toBe(false);
        expect(isRiffWave(new ArrayBuffer(2))).toBe(false);
    });
});

describe('blipIndicesFor', () => {
    it('letter mode: every Nth letter/digit, punctuation and spaces skipped by default', () => {
        const set = blipIndicesFor('Hi, yo', { audioId: null, mode: 'letter', everyN: 1 });
        // eligible: H(0) i(1) y(4) o(5) — comma and space skipped
        expect([...set].sort((a, b) => a - b)).toEqual([0, 1, 4, 5]);
    });
    it('letter mode with everyN 2 takes every other eligible letter', () => {
        const set = blipIndicesFor('abcd', { audioId: null, mode: 'letter', everyN: 2 });
        expect([...set].sort((a, b) => a - b)).toEqual([0, 2]);
    });
    it('word mode: first letter of each word', () => {
        const set = blipIndicesFor('Hey there, pal', { audioId: null, mode: 'word' });
        expect([...set].sort((a, b) => a - b)).toEqual([0, 4, 11]);
    });
    it('skipPunctuation false blips every non-space', () => {
        const set = blipIndicesFor('a.b', { audioId: null, mode: 'letter', everyN: 1, skipPunctuation: false });
        expect([...set].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    });
});

describe('playBlip with a mocked AudioContext', () => {
    const sources: any[] = [];
    const gains: any[] = [];
    beforeEach(() => {
        sources.length = 0; gains.length = 0;
        (window as any).AudioContext = class {
            sampleRate = 48000;
            destination = {};
            createBuffer(_c: number, len: number, rate: number) {
                const data = new Float32Array(len);   // STABLE per buffer — reverse tests inspect it
                return { getChannelData: () => data, length: len, sampleRate: rate };
            }
            createBufferSource() {
                const s = { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), start: vi.fn() };
                sources.push(s); return s;
            }
            createGain() {
                const g = { gain: { value: 1 }, connect: vi.fn() };
                gains.push(g); return g;
            }
            decodeAudioData() { return Promise.reject(new Error('not in test')); }
        };
    });

    it('built-in beep plays through a gain with the given volume and wobbled pitch', () => {
        playBlip(null, { volume: 0.35, pitchWobble: 0.2 });
        expect(sources.length).toBe(1);
        expect(sources[0].start).toHaveBeenCalled();
        expect(gains[0].gain.value).toBeCloseTo(0.35, 5);
        expect(sources[0].playbackRate.value).toBeGreaterThanOrEqual(0.8);
        expect(sources[0].playbackRate.value).toBeLessThanOrEqual(1.2);
    });
    it('an undecoded URL is silent (kicks off a decode) and never throws', () => {
        expect(() => playBlip('blob:nope', { volume: 1 })).not.toThrow();
        expect(sources.length).toBe(0);
        expect(() => prepareBlipBuffer('blob:nope2')).not.toThrow();
    });
    it('speed multiplies the playback rate (with wobble on top)', () => {
        playBlip(null, { volume: 1, speed: 0.5 });
        expect(sources[0].playbackRate.value).toBeCloseTo(0.5, 5);
        playBlip(null, { volume: 1, speed: 99 });          // clamps to 4
        expect(sources[1].playbackRate.value).toBeCloseTo(4, 5);
    });
});

describe('reverse', () => {
    it('a reversed WAV blip caches BACKWARDS samples under its own variant key', async () => {
        const wav = makeWav([0.1, 0.2, 0.3, 0.4]);
        (globalThis as any).fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => wav.slice(0) }));
        const fwd: any = await (prepareBlipBuffer('r.wav') as Promise<any>);
        const rev: any = await (prepareBlipBuffer('r.wav', true) as Promise<any>);
        expect(fwd).not.toBe(rev);                           // distinct cached variants
        expect(fwd.getChannelData()[0]).toBeCloseTo(0.1, 2);
        expect(rev.getChannelData()[0]).toBeCloseTo(0.4, 2); // last sample first
        expect(rev.getChannelData()[3]).toBeCloseTo(0.1, 2);
    });
});

describe('compressed sources use the <audio> element pool — decodeAudioData is NEVER called', () => {
    const created: any[] = [];
    beforeEach(() => {
        created.length = 0;
        (window as any).AudioContext = class {
            sampleRate = 48000;
            destination = {};
            createBuffer(_c: number, len: number, rate: number) { return { getChannelData: () => new Float32Array(len), length: len, sampleRate: rate }; }
            createBufferSource() { return { buffer: null, playbackRate: { value: 1 }, connect: vi.fn(), start: vi.fn() }; }
            createGain() { return { gain: { value: 1 }, connect: vi.fn() }; }
            decodeAudioData() { throw new Error('MUST NEVER BE CALLED — segfaults Electron with contextIsolation on'); }
        };
        (window as any).Audio = class {
            src: string; paused = true; ended = false; volume = 1; playbackRate = 1; currentTime = 0;
            preservesPitch = true;
            constructor(src: string) { this.src = src; created.push(this); }
            play() { this.paused = false; return Promise.resolve(); }
        };
    });

    it('an mp3-shaped file resolves to the element path and blips restart pooled elements', async () => {
        const mp3ish = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10, 1, 2, 3]).buffer; // "ID3…"
        (globalThis as any).fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => mp3ish }));
        const medium = await (prepareBlipBuffer('song.mp3') as Promise<any>);
        expect(medium).toBe('element');
        playBlip('song.mp3', { volume: 0.4, pitchWobble: 0.2 });
        expect(created).toHaveLength(1);
        expect(created[0].src).toBe('song.mp3');
        expect(created[0].volume).toBeCloseTo(0.4, 5);
        expect(created[0].preservesPitch).toBe(false);       // wobble must actually change pitch
        expect(created[0].paused).toBe(false);
        // A second blip while the first still plays takes a SECOND pooled element.
        playBlip('song.mp3', { volume: 0.4 });
        expect(created).toHaveLength(2);
        // A finished element is reused, not grown past the pool.
        created[0].paused = true;
        playBlip('song.mp3', { volume: 0.4 });
        expect(created).toHaveLength(2);
    });

    it('a RIFF file with an exotic codec stays SILENT (never element, never native decode)', async () => {
        const riff = new ArrayBuffer(44);
        const dv = new DataView(riff);
        const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); dv.setUint32(4, 36, true); w(8, 'WAVE');
        w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 85, true); // codec 85 = mp3-in-wav
        (globalThis as any).fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => riff }));
        const medium = await (prepareBlipBuffer('weird.wav') as Promise<any>);
        expect(medium).toBeNull();
        playBlip('weird.wav');
        expect(created).toHaveLength(0);
    });
});
