/**
 * "Save a reversed copy" — the author-time bake. Round-trips through the repo's own WAV
 * encoder/parser, so a pass here means the output is a WAV the rest of the app can read.
 */
import { describe, it, expect } from 'vitest';
import { bakeReversedWav, reverseChannels, reversedAssetName } from '../reverseAudioAsset';
import { encodeWavPcm16 } from '../../components/live-preview/reversedAudio';
import { decodeWavPcmChannels, parseWavHeader } from '../../components/live-preview/wavPcm';

const ramp = (n: number) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (i / (n - 1)) * 2 - 1;   // -1 → +1
    return out;
};

describe('reverseChannels', () => {
    it('reverses every channel independently', () => {
        const a = new Float32Array([0.1, 0.2, 0.3]);
        const b = new Float32Array([-0.5, 0, 0.5]);
        const [ra, rb] = reverseChannels([a, b]);
        expect(Array.from(ra).map(v => Math.round(v * 10) / 10)).toEqual([0.3, 0.2, 0.1]);
        expect(Array.from(rb)).toEqual([0.5, 0, -0.5]);
        // Inputs untouched.
        expect(a[0]).toBeCloseTo(0.1);
    });
});

describe('bakeReversedWav — WAV round-trip', () => {
    it('produces a valid PCM16 WAV whose samples are exactly reversed', async () => {
        const sr = 8000;
        const left = ramp(64);
        const right = new Float32Array(64).fill(0.25);
        const input = encodeWavPcm16([left, right], sr);

        const result = await bakeReversedWav(input);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.sampleRate).toBe(sr);
        expect(result.channels).toBe(2);
        expect(result.seconds).toBeCloseTo(64 / sr);

        const header = parseWavHeader(result.wav);
        expect(header).toBeTruthy();
        const decoded = decodeWavPcmChannels(result.wav);
        expect(decoded).toBeTruthy();
        expect(decoded!.sampleRate).toBe(sr);
        expect(decoded!.channels).toHaveLength(2);
        // The ramp comes back descending (PCM16 quantisation ≈ 1/32768 tolerance).
        const out = decoded!.channels[0];
        expect(out[0]).toBeCloseTo(left[63], 3);
        expect(out[63]).toBeCloseTo(left[0], 3);
        expect(out[10]).toBeGreaterThan(out[50]);
        // The constant channel stays constant.
        expect(decoded!.channels[1][7]).toBeCloseTo(0.25, 2);
    });

    it('rejects a lying RIFF without touching the native decoder', async () => {
        // "RIFF....WAVE" magic but garbage inside — the parser refuses; the bake must
        // report bad-wav, never fall through to decodeAudioData (segfault rule).
        const buf = new ArrayBuffer(64);
        const dv = new DataView(buf);
        const put = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
        put(0, 'RIFF'); dv.setUint32(4, 56, true); put(8, 'WAVE');
        const result = await bakeReversedWav(buf);
        expect(result).toEqual({ ok: false, reason: 'bad-wav' });
    });

    it('reports empty input as a failure, not a zero-length WAV', async () => {
        const result = await bakeReversedWav(encodeWavPcm16([new Float32Array(0)], 8000));
        expect(result.ok).toBe(false);
    });
});

describe('reversedAssetName', () => {
    it('suffixes and numbers on collision', () => {
        expect(reversedAssetName('Song', [])).toBe('Song (reversed)');
        expect(reversedAssetName('Song', ['Song (reversed)'])).toBe('Song (reversed) 2');
        expect(reversedAssetName('Song', ['Song (reversed)', 'Song (reversed) 2'])).toBe('Song (reversed) 3');
    });
});
