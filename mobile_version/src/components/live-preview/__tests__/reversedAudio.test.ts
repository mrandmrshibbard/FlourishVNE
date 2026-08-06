/**
 * Reversed audio (R3): WAV round-trip via our own RIFF reader (never decodeAudioData for
 * WAVs — segfault trap), reverse×2 = original samples, the size cap refuses politely, and
 * every failure resolves to null (= play forward), never rejects.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encodeWavPcm16, getReversedUrl, peekReversedUrl, __clearReversedCacheForTest, MAX_REVERSE_BYTES } from '../reversedAudio';
import { decodeWavPcmChannels } from '../wavPcm';

const stereoWav = (): ArrayBuffer => {
    const left = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const right = new Float32Array([-0.4, -0.3, -0.2, -0.1]);
    return encodeWavPcm16([left, right], 8000);
};

beforeEach(() => {
    __clearReversedCacheForTest();
    (globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:reversed-1');
    (globalThis as any).URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('encodeWavPcm16 ↔ decodeWavPcmChannels round trip', () => {
    it('preserves channel count, rate and samples (16-bit tolerance)', () => {
        const decoded = decodeWavPcmChannels(stereoWav())!;
        expect(decoded.sampleRate).toBe(8000);
        expect(decoded.channels).toHaveLength(2);
        expect(decoded.channels[0][2]).toBeCloseTo(0.3, 3);
        expect(decoded.channels[1][0]).toBeCloseTo(-0.4, 3);
    });
});

describe('getReversedUrl', () => {
    it('reverses every channel; reverse twice = the original', async () => {
        let captured: Blob | null = null;
        (globalThis as any).URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return 'blob:reversed-1'; });
        (globalThis as any).fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => stereoWav() }));
        const url = await getReversedUrl('sfx.wav');
        expect(url).toBe('blob:reversed-1');
        const revBuf = await (captured as any).arrayBuffer();
        const rev = decodeWavPcmChannels(revBuf)!;
        expect(rev.channels[0][0]).toBeCloseTo(0.4, 3);   // last sample first
        expect(rev.channels[1][3]).toBeCloseTo(-0.4, 3);
        // Reverse of the reverse = original.
        const again = rev.channels.map(ch => { const o = new Float32Array(ch.length); for (let i = 0; i < ch.length; i++) o[i] = ch[ch.length - 1 - i]; return o; });
        expect(again[0][0]).toBeCloseTo(0.1, 3);
    });

    it('caches per source and peek reports readiness', async () => {
        (globalThis as any).fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => stereoWav() }));
        expect(peekReversedUrl('sfx.wav')).toBeUndefined();
        await getReversedUrl('sfx.wav');
        expect(peekReversedUrl('sfx.wav')).toBe('blob:reversed-1');
        await getReversedUrl('sfx.wav');
        expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
    });

    it('refuses files over the cap → null (play forward), cached as null', async () => {
        (globalThis as any).fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(MAX_REVERSE_BYTES + 1) }));
        expect(await getReversedUrl('big.wav')).toBeNull();
        expect(peekReversedUrl('big.wav')).toBeNull();
    });

    it('fetch failure resolves to null, never rejects', async () => {
        (globalThis as any).fetch = vi.fn(async () => { throw new Error('offline'); });
        await expect(getReversedUrl('gone.wav')).resolves.toBeNull();
    });

    it('under Electron, COMPRESSED audio is refused too (plays forward) — decoder untouched', async () => {
        const ua = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/120 Electron/28.3.3');
        let decodeCalls = 0;
        (window as any).AudioContext = class {
            decodeAudioData() { decodeCalls++; return Promise.resolve({ sampleRate: 8000, numberOfChannels: 1, getChannelData: () => new Float32Array(4) }); }
        };
        const mp3ish = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0]).buffer;
        (globalThis as any).fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => mp3ish }));
        await expect(getReversedUrl('desktop.mp3')).resolves.toBeNull();
        expect(decodeCalls).toBe(0);
        ua.mockRestore();
    });

    it('a RIFF file our parser rejects NEVER reaches decodeAudioData (the segfault class)', async () => {
        // A WAV declaring MP3-in-WAV (codec 85): decodeWavPcmChannels → null, and the native
        // decoder is FORBIDDEN for RIFF — result must be null (play forward), decoder untouched.
        const wav = stereoWav();
        new DataView(wav).setUint16(20, 85, true);
        let decodeCalls = 0;
        (window as any).AudioContext = class {
            decodeAudioData() { decodeCalls++; return Promise.resolve({ sampleRate: 8000, numberOfChannels: 1, getChannelData: () => new Float32Array(4) }); }
        };
        (globalThis as any).fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => wav }));
        await expect(getReversedUrl('exotic.wav')).resolves.toBeNull();
        expect(decodeCalls).toBe(0);
    });
});
