import { describe, it, expect } from 'vitest';
import { moveLayer, stepLayer, moveLayers } from '../layerReorder';

const ORDER = ['a', 'b', 'c', 'd', 'e'] as any[];

describe('moveLayer', () => {
    it('moves a layer later and earlier', () => {
        expect(moveLayer(ORDER, 0, 2)).toEqual(['b', 'c', 'a', 'd', 'e']);
        expect(moveLayer(ORDER, 4, 1)).toEqual(['a', 'e', 'b', 'c', 'd']);
    });

    it('clamps past either end instead of dropping the layer', () => {
        expect(moveLayer(ORDER, 2, 99)).toEqual(['a', 'b', 'd', 'e', 'c']);
        expect(moveLayer(ORDER, 2, -5)).toEqual(['c', 'a', 'b', 'd', 'e']);
    });

    it('returns null for a no-op or an out-of-range source', () => {
        expect(moveLayer(ORDER, 2, 2)).toBeNull();
        expect(moveLayer(ORDER, 9, 0)).toBeNull();
        expect(moveLayer(ORDER, -1, 0)).toBeNull();
    });

    it('never loses or duplicates a layer', () => {
        for (let from = 0; from < ORDER.length; from++) {
            for (let to = 0; to < ORDER.length; to++) {
                const next = moveLayer(ORDER, from, to);
                if (!next) continue;
                expect([...next].sort()).toEqual([...ORDER].sort());
            }
        }
    });
});

describe('stepLayer', () => {
    it('nudges one position at a time', () => {
        expect(stepLayer(ORDER, 1, 1)).toEqual(['a', 'c', 'b', 'd', 'e']);
        expect(stepLayer(ORDER, 1, -1)).toEqual(['b', 'a', 'c', 'd', 'e']);
    });

    it('is a no-op at the ends', () => {
        expect(stepLayer(ORDER, 0, -1)).toBeNull();
        expect(stepLayer(ORDER, ORDER.length - 1, 1)).toBeNull();
    });
});

describe('moveLayers (dragging a multi-selection)', () => {
    it('moves the whole selection, keeping their relative order', () => {
        const next = moveLayers(ORDER, new Set(['a', 'c']) as any, 4);
        expect(next).toEqual(['b', 'd', 'a', 'c', 'e']);
    });

    it('keeps non-adjacent selections together rather than interleaving', () => {
        const next = moveLayers(ORDER, new Set(['a', 'e']) as any, 2);
        expect(next).toEqual(['b', 'a', 'e', 'c', 'd']);
    });

    it('returns null when nothing would change, or everything is selected', () => {
        expect(moveLayers(ORDER, new Set(['a', 'b']) as any, 0)).toBeNull();
        expect(moveLayers(ORDER, new Set(ORDER) as any, 3)).toBeNull();
        expect(moveLayers(ORDER, new Set() as any, 1)).toBeNull();
    });

    it('never loses or duplicates a layer', () => {
        for (let to = 0; to <= ORDER.length; to++) {
            const next = moveLayers(ORDER, new Set(['b', 'd']) as any, to);
            if (!next) continue;
            expect([...next].sort()).toEqual([...ORDER].sort());
        }
    });
});
