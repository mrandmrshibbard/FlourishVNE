/**
 * Pose Studio layout resolvers. The byte-identity guard (full box → absence) and the
 * precedence chain are load-bearing: every render surface trusts these.
 */
import { describe, it, expect } from 'vitest';
import {
    isFullBox, normalizeLayerBox, resolveLayerBox,
    layerOrderForPose, poseHiddenLayerIds, layerBoxStyle, layerBoxTransform,
} from '../layout';
import { VNLayerBox } from '../types';

const FULL: VNLayerBox = { x: 0, y: 0, width: 100, height: 100 };
const BOX: VNLayerBox = { x: 10, y: 20, width: 30, height: 40 };

describe('normalizeLayerBox (byte-identity guard)', () => {
    it('full box → undefined (stored as absence)', () => {
        expect(normalizeLayerBox(FULL)).toBeUndefined();
        expect(normalizeLayerBox({ ...FULL, rotation: 0, flipH: false })).toBeUndefined();
        expect(normalizeLayerBox(undefined)).toBeUndefined();
        expect(normalizeLayerBox(null)).toBeUndefined();
    });
    it('2-decimal noise still counts as full', () => {
        expect(normalizeLayerBox({ x: 0.001, y: 0, width: 99.999, height: 100 })).toBeUndefined();
    });
    it('a full box WITH rotation or flip is kept', () => {
        expect(normalizeLayerBox({ ...FULL, rotation: 15 })).toEqual({ x: 0, y: 0, width: 100, height: 100, rotation: 15 });
        expect(normalizeLayerBox({ ...FULL, flipH: true })).toEqual({ x: 0, y: 0, width: 100, height: 100, flipH: true });
    });
    it('kept boxes are copies with default subfields stripped', () => {
        const input: VNLayerBox = { ...BOX, rotation: 0, flipH: false };
        const out = normalizeLayerBox(input)!;
        expect(out).toEqual(BOX);
        expect(out).not.toBe(input);
        expect('rotation' in out).toBe(false);
        expect('flipH' in out).toBe(false);
    });
});

describe('resolveLayerBox precedence chain', () => {
    const layer: any = {
        id: 'L', name: 'L', assets: {},
        box: { x: 1, y: 1, width: 50, height: 50 },
        poseBoxes: { p1: { x: 2, y: 2, width: 50, height: 50 } },
    };
    const asset: any = {
        id: 'A', name: 'A',
        box: { x: 3, y: 3, width: 50, height: 50 },
        poseBoxes: { p1: { x: 4, y: 4, width: 50, height: 50 } },
    };
    it('asset poseBox wins over everything', () => {
        expect(resolveLayerBox(layer, asset, 'p1')!.x).toBe(4);
    });
    it('asset box wins over layer poseBox', () => {
        expect(resolveLayerBox(layer, { ...asset, poseBoxes: undefined }, 'p1')!.x).toBe(3);
    });
    it('layer poseBox wins over layer box', () => {
        expect(resolveLayerBox(layer, null, 'p1')!.x).toBe(2);
    });
    it('layer box is the Default fallback', () => {
        expect(resolveLayerBox(layer, null, undefined)!.x).toBe(1);
        expect(resolveLayerBox(layer, null, 'unknownPose')!.x).toBe(1);
    });
    it('nothing set → undefined (whole box, legacy path)', () => {
        expect(resolveLayerBox({ id: 'L', name: 'L', assets: {} } as any, null, 'p1')).toBeUndefined();
    });
});

describe('layerOrderForPose', () => {
    const char: any = {
        layers: {
            a: { id: 'a', name: 'A', assets: {} },
            b: { id: 'b', name: 'B', assets: {} },
            c: { id: 'c', name: 'C', assets: {} },
        },
        poses: {
            p1: { id: 'p1', name: 'P1', layerOrder: ['c', 'a', 'b'] },
            p2: { id: 'p2', name: 'P2', layerOrder: ['b', 'ghost'] }, // dangling + missing
            p3: { id: 'p3', name: 'P3' },
        },
    };
    it('Default = Record key order', () => {
        expect(layerOrderForPose(char).map(l => l.id)).toEqual(['a', 'b', 'c']);
        expect(layerOrderForPose(char, undefined).map(l => l.id)).toEqual(['a', 'b', 'c']);
    });
    it('pose order wins', () => {
        expect(layerOrderForPose(char, 'p1').map(l => l.id)).toEqual(['c', 'a', 'b']);
    });
    it('deleted ids skipped, missing layers appended in base order', () => {
        expect(layerOrderForPose(char, 'p2').map(l => l.id)).toEqual(['b', 'a', 'c']);
    });
    it('pose without order / unknown pose → base order', () => {
        expect(layerOrderForPose(char, 'p3').map(l => l.id)).toEqual(['a', 'b', 'c']);
        expect(layerOrderForPose(char, 'nope').map(l => l.id)).toEqual(['a', 'b', 'c']);
    });
});

describe('poseHiddenLayerIds', () => {
    const char: any = { poses: { p1: { id: 'p1', name: 'P', hiddenLayers: ['hat'] } } };
    it('returns the pose set; empty for Default/unknown', () => {
        expect(poseHiddenLayerIds(char, 'p1').has('hat')).toBe(true);
        expect(poseHiddenLayerIds(char, undefined).size).toBe(0);
        expect(poseHiddenLayerIds(char, 'nope').size).toBe(0);
        expect(poseHiddenLayerIds({ poses: undefined } as any, 'p1').size).toBe(0);
    });
});

describe('layerBoxStyle / layerBoxTransform', () => {
    it('undefined → {} (pixel-identical legacy path)', () => {
        expect(layerBoxStyle(undefined)).toEqual({});
        expect(layerBoxStyle(null)).toEqual({});
        expect(layerBoxTransform(undefined)).toBe('');
    });
    it('box → inline percent geometry', () => {
        expect(layerBoxStyle(BOX)).toEqual({ left: '10%', top: '20%', width: '30%', height: '40%' });
    });
    it('rotation + flip compose in the transform', () => {
        const style = layerBoxStyle({ ...BOX, rotation: 15, flipH: true });
        expect(style.transform).toBe('rotate(15deg) scaleX(-1)');
        expect(layerBoxTransform({ ...BOX, flipH: true })).toBe('scaleX(-1)');
    });
});
