import { describe, it, expect } from 'vitest';
import { resolveSceneTransition, transitionHalfDuration, transitionHalfHasContent } from '../sceneTransition';
import type { VNCustomTransition } from '../../features/scene/types';
import type { VNID } from '../../types';

const curtain: VNCustomTransition = {
    id: 'ct1' as VNID,
    name: 'Curtain',
    close: { assetId: 'img-close' as VNID, duration: 1.2 },
    open: { assetId: 'img-open' as VNID, duration: 0.8 },
};
const customs = { ['ct1' as VNID]: curtain };

describe('resolveSceneTransition', () => {
    it('defaults to fade with the scene duration', () => {
        expect(resolveSceneTransition(undefined, { outTransitionDuration: 2 }, customs))
            .toEqual({ kind: 'builtin', type: 'fade', duration: 2 });
    });

    it("uses the scene's configured builtin", () => {
        expect(resolveSceneTransition(undefined, { outTransition: 'wipe-right' }, customs))
            .toEqual({ kind: 'builtin', type: 'wipe-right', duration: 0.5 });
    });

    it('honours instant from the scene and from an override', () => {
        expect(resolveSceneTransition(undefined, { outTransition: 'instant' }, customs)).toEqual({ kind: 'instant' });
        expect(resolveSceneTransition('instant', { outTransition: 'fade' }, customs)).toEqual({ kind: 'instant' });
    });

    it('a per-jump override beats the scene setting', () => {
        expect(resolveSceneTransition('dissolve', { outTransition: 'instant' }, customs))
            .toEqual({ kind: 'builtin', type: 'dissolve', duration: 0.5 });
        expect(resolveSceneTransition('custom:ct1', { outTransition: 'fade' }, customs))
            .toEqual({ kind: 'custom', def: curtain });
    });

    it('resolves a custom transition from the scene setting', () => {
        expect(resolveSceneTransition(undefined, { outTransition: 'custom:ct1' }, customs))
            .toEqual({ kind: 'custom', def: curtain });
    });

    it('falls back to fade when the custom id is deleted/missing or empty', () => {
        expect(resolveSceneTransition(undefined, { outTransition: 'custom:gone' }, customs))
            .toEqual({ kind: 'builtin', type: 'fade', duration: 0.5 });
        // A custom transition with no animations at all must not blank the screen.
        const empty = { ['e1' as VNID]: { id: 'e1' as VNID, name: 'Empty', close: {}, open: {} } };
        expect(resolveSceneTransition('custom:e1', undefined, empty))
            .toEqual({ kind: 'builtin', type: 'fade', duration: 0.5 });
        expect(resolveSceneTransition(undefined, { outTransition: 'custom:ct1' }, undefined))
            .toEqual({ kind: 'builtin', type: 'fade', duration: 0.5 });
    });

    it('unknown strings fall back to fade (forward compatibility)', () => {
        expect(resolveSceneTransition('sparkle-vortex', undefined, customs))
            .toEqual({ kind: 'builtin', type: 'fade', duration: 0.5 });
    });
});

describe('transitionHalfDuration / transitionHalfHasContent', () => {
    it('uses the explicit duration when set', () => {
        expect(transitionHalfDuration({ assetId: 'a' as VNID, duration: 2.5 })).toBe(2.5);
    });
    it('derives a frame sequence length from fps', () => {
        expect(transitionHalfDuration({ frameIds: ['a', 'b', 'c'] as VNID[], fps: 6 })).toBe(0.5);
        // fps defaults to 12
        expect(transitionHalfDuration({ frameIds: Array(24).fill('x') as VNID[] })).toBe(2);
    });
    it('defaults a single file to 1s and empty halves to 0', () => {
        expect(transitionHalfDuration({ assetId: 'a' as VNID })).toBe(1);
        expect(transitionHalfDuration(undefined)).toBe(0);
    });
    it('detects content correctly', () => {
        expect(transitionHalfHasContent({ assetId: 'a' as VNID })).toBe(true);
        expect(transitionHalfHasContent({ frameIds: ['a' as VNID] })).toBe(true);
        expect(transitionHalfHasContent({ frameIds: [] })).toBe(false);
        expect(transitionHalfHasContent({})).toBe(false);
        expect(transitionHalfHasContent(undefined)).toBe(false);
    });
});
