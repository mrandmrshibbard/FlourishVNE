/**
 * Bulk layer delete. A layer id is referenced in three other places besides `layers` —
 * every expression's layerConfiguration, and each pose's layerOrder and hiddenLayers — and
 * leaving it in any of them strands a dangling id the layout resolver has to work around.
 */
import { describe, it, expect } from 'vitest';
import { characterReducer } from '../characterReducer';

const project = () => ({
    characters: {
        c1: {
            id: 'c1', name: 'Mia',
            layers: {
                body: { id: 'body', name: 'Body', assets: {} },
                hair: { id: 'hair', name: 'Hair', assets: {} },
                face: { id: 'face', name: 'Face', assets: {} },
                hat: { id: 'hat', name: 'Hat', assets: {} },
            },
            expressions: {
                e1: { id: 'e1', name: 'Happy', layerConfiguration: { body: 'a1', hair: 'a2', face: 'a3', hat: 'a4' } },
                e2: { id: 'e2', name: 'Sad', layerConfiguration: { body: 'a1' } },
            },
            poses: {
                p1: { id: 'p1', name: 'Side', layerOrder: ['hat', 'face', 'hair', 'body'], hiddenLayers: ['hat'] },
                p2: { id: 'p2', name: 'Plain' },
            },
        },
    },
} as any);

const bulkDelete = (layerIds: string[]) =>
    characterReducer(project(), { type: 'DELETE_CHARACTER_LAYERS', payload: { characterId: 'c1', layerIds } } as any)
        .characters.c1 as any;

describe('DELETE_CHARACTER_LAYERS', () => {
    it('removes several non-adjacent layers in one go', () => {
        const c = bulkDelete(['hair', 'hat']);
        expect(Object.keys(c.layers)).toEqual(['body', 'face']);
    });

    it('scrubs the deleted layers from every expression', () => {
        const c = bulkDelete(['hair', 'hat']);
        expect(Object.keys(c.expressions.e1.layerConfiguration)).toEqual(['body', 'face']);
        expect(c.expressions.e2.layerConfiguration).toEqual({ body: 'a1' });
    });

    it("scrubs them from every pose's order and hidden list", () => {
        const c = bulkDelete(['hair', 'hat']);
        expect(c.poses.p1.layerOrder).toEqual(['face', 'body']);
        // hiddenLayers held only 'hat', so the field disappears rather than becoming empty.
        expect('hiddenLayers' in c.poses.p1).toBe(false);
    });

    it('leaves untouched poses and expressions referentially identical (undo history safety)', () => {
        const before = project().characters.c1;
        const after = characterReducer({ characters: { c1: before } } as any,
            { type: 'DELETE_CHARACTER_LAYERS', payload: { characterId: 'c1', layerIds: ['hat'] } } as any).characters.c1 as any;
        expect(after.poses.p2).toBe(before.poses.p2);
        expect(after.expressions.e2).toBe(before.expressions.e2);
        // ...and the original was not mutated.
        expect(Object.keys(before.layers)).toContain('hat');
    });

    it('ignores unknown ids and no-ops on an empty list', () => {
        expect(Object.keys(bulkDelete(['nope']).layers)).toHaveLength(4);
        const p = project();
        expect(characterReducer(p, { type: 'DELETE_CHARACTER_LAYERS', payload: { characterId: 'c1', layerIds: [] } } as any)).toBe(p);
    });

    it('matches deleting the same layers one at a time', () => {
        const bulk = bulkDelete(['hair', 'hat']);
        let step = project();
        for (const layerId of ['hair', 'hat']) {
            step = characterReducer(step, { type: 'DELETE_CHARACTER_LAYER', payload: { characterId: 'c1', layerId } } as any);
        }
        expect(bulk).toEqual((step as any).characters.c1);
    });
});
