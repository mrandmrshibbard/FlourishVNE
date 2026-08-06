/**
 * Audio adjust (R3): per-use-over-asset merge (videoTrim discipline), speed clamping, and the
 * apply/RESET walk on media elements (incl. vendor pitch aliases). The reset rule is the
 * load-bearing part — pooled elements must never leak a previous sound's rate.
 */
import { describe, it, expect } from 'vitest';
import { resolveAudioAdjust, applyAudioAdjust, clampSpeed } from '../audioAdjust';

describe('clampSpeed', () => {
    it('clamps to 0.25–4', () => {
        expect(clampSpeed(0.1)).toBe(0.25);
        expect(clampSpeed(10)).toBe(4);
        expect(clampSpeed(1.5)).toBe(1.5);
    });
});

describe('resolveAudioAdjust', () => {
    it('nothing set anywhere → null (callers skip work)', () => {
        expect(resolveAudioAdjust(undefined, undefined)).toBeNull();
        expect(resolveAudioAdjust({}, {})).toBeNull();
    });
    it('per-use wins field-by-field over the asset default', () => {
        expect(resolveAudioAdjust({ speed: 2 }, { speed: 0.5, reverse: true })).toEqual({ speed: 2, reverse: true });
        expect(resolveAudioAdjust({ reverse: false }, { reverse: true, keepPitch: true })).toEqual({ reverse: false, keepPitch: true });
        expect(resolveAudioAdjust(null, { speed: 3 })).toEqual({ speed: 3 });
    });
    it('never invents fields that are absent on both sides', () => {
        const r = resolveAudioAdjust({ speed: 2 }, undefined)!;
        expect('reverse' in r).toBe(false);
        expect('keepPitch' in r).toBe(false);
    });
});

const fakeEl = (): any => ({ playbackRate: 1, defaultPlaybackRate: 1, preservesPitch: true, webkitPreservesPitch: true });

describe('applyAudioAdjust', () => {
    it('sets rate + defaultRate and turns pitch-keeping OFF for tape-style speed', () => {
        const el = fakeEl();
        applyAudioAdjust(el, { speed: 0.5 });
        expect(el.playbackRate).toBe(0.5);
        expect(el.defaultPlaybackRate).toBe(0.5);
        expect(el.preservesPitch).toBe(false);
        expect(el.webkitPreservesPitch).toBe(false);
    });
    it('keepPitch keeps the original pitch at any speed', () => {
        const el = fakeEl();
        applyAudioAdjust(el, { speed: 1.5, keepPitch: true });
        expect(el.playbackRate).toBe(1.5);
        expect(el.preservesPitch).toBe(true);
    });
    it('null RESETS a previously-shaped element completely', () => {
        const el = fakeEl();
        applyAudioAdjust(el, { speed: 3 });
        applyAudioAdjust(el, null);
        expect(el.playbackRate).toBe(1);
        expect(el.defaultPlaybackRate).toBe(1);
        expect(el.preservesPitch).toBe(true);
    });
    it('an adjust WITHOUT speed behaves as normal speed (reset semantics)', () => {
        const el = fakeEl();
        applyAudioAdjust(el, { speed: 2 });
        applyAudioAdjust(el, { reverse: true });   // reverse is handled elsewhere — rate resets
        expect(el.playbackRate).toBe(1);
    });
    it('clamps wild speeds', () => {
        const el = fakeEl();
        applyAudioAdjust(el, { speed: 99 });
        expect(el.playbackRate).toBe(4);
    });
    it('never throws on rate-less exotic elements', () => {
        expect(() => applyAudioAdjust({} as any, { speed: 2 })).not.toThrow();
    });
});
