/**
 * Animation clipboard — the cross-character remap contract: layers/assets re-match by NAME
 * (trim + case-insensitive), unmatched layers become the Studio's "Pick a layer…" state,
 * unmatched assets become null (never a dropped key), id-free lanes ride verbatim, and a
 * same-character paste keeps every id untouched.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    setAnimClipboard, getAnimClipboard,
    copyAnimationToClipboard, copyLaneToClipboard,
    remapAnimationForCharacter, remapLaneKeysForLayer,
    lanesCompatible, keysPastDuration,
} from '../animClipboard';

const sourceChar = (): any => ({
    id: 'src', name: 'Mia',
    layers: {
        hips: { id: 'hips', name: 'Hips', assets: { a1: { id: 'a1', name: 'Sway A' }, a2: { id: 'a2', name: 'Sway B' } } },
        hair: { id: 'hair', name: 'Hair', assets: { h1: { id: 'h1', name: 'Down' } } },
    },
    expressions: {},
});

const targetChar = (): any => ({
    id: 'tgt', name: 'Neo',
    layers: {
        // Same names, different ids/case/whitespace — must still match.
        L1: { id: 'L1', name: '  hips ', assets: { x1: { id: 'x1', name: 'sway a' } } },
        // No 'Hair' layer on the target.
        L2: { id: 'L2', name: 'Torso', assets: {} },
    },
    expressions: {},
});

const anim = (): any => ({
    id: 'anim-1', name: 'Sway', durationMs: 800, loop: true,
    tracks: [
        {
            layerId: 'hips', pivotX: 50, pivotY: 35,
            keys: [{ atMs: 0, assetId: 'a1', dx: -2 }, { atMs: 400, assetId: 'a2' }],
            rotationKeys: [{ atMs: 0, deg: -4 }, { atMs: 400, deg: 4 }],
            moveKeys: [{ atMs: 0, dx: -1, dy: 0 }],
        },
        { layerId: 'hair', keys: [{ atMs: 0, assetId: 'h1' }] },
    ],
    motionKeys: [{ atMs: 0, dx: 1, dy: 0 }],
});

describe('clipboard singleton', () => {
    beforeEach(() => setAnimClipboard(null));
    it('survives across set/get and clears', () => {
        expect(getAnimClipboard()).toBeNull();
        const entry = copyAnimationToClipboard(sourceChar(), anim());
        setAnimClipboard(entry);
        expect(getAnimClipboard()).toBe(entry);
        setAnimClipboard(null);
        expect(getAnimClipboard()).toBeNull();
    });
    it('copy takes a deep clone — later source mutation cannot reach the clipboard', () => {
        const a = anim();
        const entry = copyAnimationToClipboard(sourceChar(), a);
        a.tracks[0].keys.push({ atMs: 999, assetId: null });
        expect(entry.anim.tracks[0].keys).toHaveLength(2);
    });
});

describe('remapAnimationForCharacter', () => {
    it('same character: ids verbatim, all tracks matched', () => {
        const entry = copyAnimationToClipboard(sourceChar(), anim());
        const { animation, matchedTracks, totalTracks } = remapAnimationForCharacter(entry, sourceChar(), 'anim-new');
        expect(animation.id).toBe('anim-new');
        expect(animation.tracks[0].layerId).toBe('hips');
        expect(animation.tracks[0].keys[0].assetId).toBe('a1');
        expect(matchedTracks).toBe(2);
        expect(totalTracks).toBe(2);
    });

    it('cross-character: layer + asset matched by name (trim/case); unmatched layer → "" with nulled assets', () => {
        const entry = copyAnimationToClipboard(sourceChar(), anim());
        const { animation, matchedTracks, totalTracks } = remapAnimationForCharacter(entry, targetChar(), 'anim-new');
        // 'Hips' → '  hips ' (L1); 'Sway A' → 'sway a' (x1); 'Sway B' has no match → null.
        expect(animation.tracks[0].layerId).toBe('L1');
        expect(animation.tracks[0].keys.map((k: any) => k.assetId)).toEqual(['x1', null]);
        // The nudge and every id-free lane ride verbatim.
        expect(animation.tracks[0].keys[0].dx).toBe(-2);
        expect(animation.tracks[0].rotationKeys).toEqual([{ atMs: 0, deg: -4 }, { atMs: 400, deg: 4 }]);
        expect(animation.tracks[0].moveKeys).toEqual([{ atMs: 0, dx: -1, dy: 0 }]);
        expect(animation.tracks[0].pivotY).toBe(35);
        expect(animation.motionKeys).toEqual([{ atMs: 0, dx: 1, dy: 0 }]);
        // 'Hair' has no target match → Pick a layer…, keys kept but hidden.
        expect(animation.tracks[1].layerId).toBe('');
        expect(animation.tracks[1].keys).toEqual([{ atMs: 0, assetId: null }]);
        expect(matchedTracks).toBe(1);
        expect(totalTracks).toBe(2);
    });

    it('name snapshot survives source edits between copy and paste', () => {
        const src = sourceChar();
        const entry = copyAnimationToClipboard(src, anim());
        src.layers.hips.name = 'RENAMED';   // rename after copy — snapshot must win
        const { animation } = remapAnimationForCharacter(entry, targetChar(), 'anim-new');
        expect(animation.tracks[0].layerId).toBe('L1');
    });
});

describe('remapLaneKeysForLayer', () => {
    it('frames lane: same character + same layer is verbatim', () => {
        const entry = copyLaneToClipboard(sourceChar(), 'frames', anim().tracks[0].keys, 'hips');
        expect(remapLaneKeysForLayer(entry, sourceChar(), 'hips')).toEqual(anim().tracks[0].keys);
    });
    it('frames lane: different layer/character re-matches assets by name; unmatched → null', () => {
        const entry = copyLaneToClipboard(sourceChar(), 'frames', anim().tracks[0].keys, 'hips');
        const keys = remapLaneKeysForLayer(entry, targetChar(), 'L1');
        expect(keys.map((k: any) => k.assetId)).toEqual(['x1', null]);
        expect((keys[0] as any).dx).toBe(-2);
    });
    it('id-free lanes copy verbatim regardless of target', () => {
        const rot = [{ atMs: 0, deg: -4 }, { atMs: 400, deg: 4 }];
        const entry = copyLaneToClipboard(sourceChar(), 'rot', rot as any, 'hips');
        expect(remapLaneKeysForLayer(entry, targetChar(), 'L2')).toEqual(rot);
    });
});

describe('lane compatibility + duration warning', () => {
    it('exact kinds match; mov and motion are interchangeable', () => {
        expect(lanesCompatible('rot', 'rot')).toBe(true);
        expect(lanesCompatible('rot', 'scl')).toBe(false);
        expect(lanesCompatible('mov', 'motion')).toBe(true);
        expect(lanesCompatible('motion', 'mov')).toBe(true);
        expect(lanesCompatible('frames', 'mov')).toBe(false);
    });
    it('keysPastDuration flags keys the timeline cannot reach', () => {
        expect(keysPastDuration([{ atMs: 0 }, { atMs: 800 }], 800)).toBe(false);
        expect(keysPastDuration([{ atMs: 0 }, { atMs: 801 }], 800)).toBe(true);
    });
});
