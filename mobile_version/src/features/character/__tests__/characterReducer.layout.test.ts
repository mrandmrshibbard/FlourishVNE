/**
 * Pose Studio reducer actions: APPLY_CHARACTER_LAYOUT (single-commit patch semantics +
 * byte-identity rules), DUPLICATE_POSE, and the DELETE_POSE / DELETE_CHARACTER_LAYER
 * layout cleanup. Absence is data here — a full box / base order / empty list must be
 * stored as a MISSING field, never as a value.
 */
import { describe, it, expect } from 'vitest';
import { characterReducer } from '../state/characterReducer';

const BOX = { x: 10, y: 20, width: 30, height: 40 };
const FULL = { x: 0, y: 0, width: 100, height: 100 };

const makeState = (): any => ({
    characters: {
        c1: {
            id: 'c1', name: 'Mia', color: '#fff',
            layers: {
                body: { id: 'body', name: 'Body', assets: { b1: { id: 'b1', name: 'B1', imageUrl: 'b.png' } } },
                hat: {
                    id: 'hat', name: 'Hat',
                    assets: {
                        h1: { id: 'h1', name: 'H1', imageUrl: 'h.png', poseArt: { p1: { imageUrl: 'h-side.png' } } },
                    },
                },
            },
            expressions: { e1: { id: 'e1', name: 'Default', layerConfiguration: { body: 'b1', hat: 'h1' } } },
            poses: { p1: { id: 'p1', name: 'Side', baseImageUrl: 'side.png' } },
        },
    },
    scenes: {},
});

describe('APPLY_CHARACTER_LAYOUT', () => {
    it('stores normalized boxes and deletes on null/full box', () => {
        let state = makeState();
        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: { characterId: 'c1', layerBoxes: { hat: { ...BOX, rotation: 0, flipH: false } } } } as any);
        expect(state.characters.c1.layers.hat.box).toEqual(BOX);
        expect('rotation' in state.characters.c1.layers.hat.box).toBe(false);

        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: { characterId: 'c1', layerBoxes: { hat: FULL } } } as any);
        expect('box' in state.characters.c1.layers.hat).toBe(false);
    });
    it('pose/asset patch maps land at the right level and emptied Records vanish', () => {
        let state = makeState();
        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1',
            layerPoseBoxes: { hat: { p1: BOX } },
            assetBoxes: { hat: { h1: { ...BOX, x: 11 } } },
            assetPoseBoxes: { hat: { h1: { p1: { ...BOX, x: 12 } } } },
        } } as any);
        const hat = state.characters.c1.layers.hat;
        expect(hat.poseBoxes.p1).toEqual(BOX);
        expect(hat.assets.h1.box.x).toBe(11);
        expect(hat.assets.h1.poseBoxes.p1.x).toBe(12);

        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1',
            layerPoseBoxes: { hat: { p1: null } },
            assetPoseBoxes: { hat: { h1: { p1: null } } },
        } } as any);
        const hat2 = state.characters.c1.layers.hat;
        expect('poseBoxes' in hat2).toBe(false);
        expect('poseBoxes' in hat2.assets.h1).toBe(false);
        expect(hat2.assets.h1.box.x).toBe(11); // untouched map survives
    });
    it('base order rebuilds key order with the safety tail; pose order equal to base is dropped', () => {
        let state = makeState();
        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1', baseLayerOrder: ['hat', 'body', 'ghost'],
        } } as any);
        expect(Object.keys(state.characters.c1.layers)).toEqual(['hat', 'body']);

        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1', poseLayerOrders: { p1: ['hat', 'body'] }, // == new base order
        } } as any);
        expect('layerOrder' in state.characters.c1.poses.p1).toBe(false);

        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1', poseLayerOrders: { p1: ['body', 'hat', 'deleted'] },
        } } as any);
        expect(state.characters.c1.poses.p1.layerOrder).toEqual(['body', 'hat']);
    });
    it('hidden lists store cleaned; empty list is dropped', () => {
        let state = makeState();
        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1', poseHiddenLayers: { p1: ['hat', 'ghost'] },
        } } as any);
        expect(state.characters.c1.poses.p1.hiddenLayers).toEqual(['hat']);
        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1', poseHiddenLayers: { p1: [] },
        } } as any);
        expect('hiddenLayers' in state.characters.c1.poses.p1).toBe(false);
    });
    it('no-op APPLY (empty patch) and set-then-reset are byte-identical', () => {
        const original = makeState();
        const before = JSON.stringify(original);
        const noop = characterReducer(original, { type: 'APPLY_CHARACTER_LAYOUT', payload: { characterId: 'c1' } } as any);
        expect(JSON.stringify(noop)).toBe(before);

        let state = characterReducer(original, { type: 'APPLY_CHARACTER_LAYOUT', payload: { characterId: 'c1', layerBoxes: { hat: BOX }, poseHiddenLayers: { p1: ['hat'] }, poseLayerOrders: { p1: ['hat', 'body'] } } } as any);
        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: { characterId: 'c1', layerBoxes: { hat: null }, poseHiddenLayers: { p1: null }, poseLayerOrders: { p1: null } } } as any);
        expect(JSON.stringify(state)).toBe(before);
    });
    it('unrelated fields spread through untouched', () => {
        const original = makeState();
        const state = characterReducer(original, { type: 'APPLY_CHARACTER_LAYOUT', payload: { characterId: 'c1', layerBoxes: { hat: BOX } } } as any);
        expect(state.characters.c1.layers.hat.assets.h1.poseArt.p1.imageUrl).toBe('h-side.png');
        expect(state.characters.c1.poses.p1.baseImageUrl).toBe('side.png');
        expect(original.characters.c1.layers.hat.box).toBeUndefined(); // input not mutated
    });
});

describe('DUPLICATE_POSE', () => {
    it('copies the record, poseArt, and poseBoxes to the new id — art by reference, no file copies', () => {
        let state = makeState();
        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1', layerPoseBoxes: { hat: { p1: BOX } }, poseHiddenLayers: { p1: ['hat'] },
        } } as any);
        state = characterReducer(state, { type: 'DUPLICATE_POSE', payload: { characterId: 'c1', poseId: 'p1', newPoseId: 'p2' } } as any);
        const c = state.characters.c1;
        expect(c.poses.p2.name).toBe('Side (copy)');
        expect(c.poses.p2.baseImageUrl).toBe(c.poses.p1.baseImageUrl); // strictly same URL string
        expect(c.poses.p2.hiddenLayers).toEqual(['hat']);
        expect(c.layers.hat.poseBoxes.p2).toEqual(BOX);
        expect(c.layers.hat.poseBoxes.p2).not.toBe(c.layers.hat.poseBoxes.p1);
        expect(c.layers.hat.assets.h1.poseArt.p2.imageUrl).toBe('h-side.png');
        expect(c.layers.hat.assets.h1.poseArt.p1.imageUrl).toBe('h-side.png'); // source intact
    });
    it('missing pose or id collision is a no-op', () => {
        const state = makeState();
        expect(characterReducer(state, { type: 'DUPLICATE_POSE', payload: { characterId: 'c1', poseId: 'nope' } } as any)).toBe(state);
        expect(characterReducer(state, { type: 'DUPLICATE_POSE', payload: { characterId: 'c1', poseId: 'p1', newPoseId: 'p1' } } as any)).toBe(state);
    });
});

describe('layout cleanup on deletes', () => {
    it('DELETE_POSE strips poseBoxes everywhere (and drops emptied Records)', () => {
        let state = makeState();
        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1',
            layerPoseBoxes: { hat: { p1: BOX } },
            assetPoseBoxes: { hat: { h1: { p1: BOX } } },
        } } as any);
        state = characterReducer(state, { type: 'DELETE_POSE', payload: { characterId: 'c1', poseId: 'p1' } } as any);
        const hat = state.characters.c1.layers.hat;
        expect('poseBoxes' in hat).toBe(false);
        expect('poseBoxes' in hat.assets.h1).toBe(false);
        expect('poseArt' in hat.assets.h1).toBe(false); // existing art strip still works
    });
    it('DELETE_CHARACTER_LAYER filters the id from pose layerOrder + hiddenLayers immutably', () => {
        let state = makeState();
        state = characterReducer(state, { type: 'APPLY_CHARACTER_LAYOUT', payload: {
            characterId: 'c1', poseLayerOrders: { p1: ['hat', 'body'] }, poseHiddenLayers: { p1: ['hat'] },
        } } as any);
        const beforeExpr = state.characters.c1.expressions.e1;
        state = characterReducer(state, { type: 'DELETE_CHARACTER_LAYER', payload: { characterId: 'c1', layerId: 'hat' } } as any);
        const pose = state.characters.c1.poses.p1;
        // 'body' alone == base order of the remaining single layer → but cleanup only filters,
        // so the field stays with ['body']; hiddenLayers emptied → dropped.
        expect(pose.layerOrder).toEqual(['body']);
        expect('hiddenLayers' in pose).toBe(false);
        expect('hat' in state.characters.c1.expressions.e1.layerConfiguration).toBe(false);
        expect('hat' in beforeExpr.layerConfiguration).toBe(true); // old state NOT mutated (undo-safe)
    });
});
