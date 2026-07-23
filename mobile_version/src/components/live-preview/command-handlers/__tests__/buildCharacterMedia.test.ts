/**
 * buildCharacterMedia — the engine's character compositor, now pose-aware.
 *
 * The three guarantees under test:
 *  (a) no poseId → output identical to the pre-pose stacking (byte-identical safety),
 *  (b) a poseId swaps the base + any asset that HAS pose art while assets without
 *      pose art keep their default art (Brad's "show front art, never hide" call),
 *  (c) the SAME layerSelections drive both calls — outfit continuity is by construction.
 */
import { describe, it, expect } from 'vitest';
import { buildCharacterMedia } from '../characterHandler';

const wrap = (u: string) => u; // identity — URL wrapping is not under test

const makeChar = () => ({
    id: 'char1',
    name: 'Mia',
    baseImageUrl: 'base-default.png',
    poses: {
        'pose-side': { id: 'pose-side', name: 'Side view', baseImageUrl: 'base-side.png' },
    },
    layers: {
        outfit: {
            id: 'outfit',
            name: 'Outfit',
            assets: {
                dressRed: {
                    id: 'dressRed',
                    name: 'Red Dress',
                    imageUrl: 'dress-red-default.png',
                    poseArt: { 'pose-side': { imageUrl: 'dress-red-side.png' } },
                },
            },
        },
        accessory: {
            id: 'accessory',
            name: 'Accessory',
            assets: {
                hat: { id: 'hat', name: 'Hat', imageUrl: 'hat-default.png' }, // no pose art
            },
        },
    },
});

describe('buildCharacterMedia (pose-aware)', () => {
    const selections = { outfit: 'dressRed', accessory: 'hat' } as any;

    it('no poseId → default stacking, unchanged from pre-pose behavior', () => {
        const out = buildCharacterMedia(makeChar(), selections, wrap);
        expect(out.imageUrls).toEqual(['base-default.png', 'dress-red-default.png', 'hat-default.png']);
        expect(out.videoUrls).toEqual([]);
        expect(out.hasVideo).toBe(false);
    });

    it('poseId swaps base + pose-art assets; assets without pose art keep default art', () => {
        const out = buildCharacterMedia(makeChar(), selections, wrap, 'pose-side');
        expect(out.imageUrls).toEqual(['base-side.png', 'dress-red-side.png', 'hat-default.png']);
    });

    it('outfit continuity: identical layerSelections produce the outfit in BOTH poses', () => {
        const char = makeChar();
        const front = buildCharacterMedia(char, selections, wrap);
        const side = buildCharacterMedia(char, selections, wrap, 'pose-side');
        // The dress (chosen by asset ID) is present in both composites — only its art differs.
        expect(front.imageUrls.some(u => u.startsWith('dress-red'))).toBe(true);
        expect(side.imageUrls.some(u => u.startsWith('dress-red'))).toBe(true);
    });

    it('dangling poseId behaves like Default (handler resolves ids, but the builder is safe too)', () => {
        const out = buildCharacterMedia(makeChar(), selections, wrap, 'pose-deleted');
        expect(out.imageUrls).toEqual(['base-default.png', 'dress-red-default.png', 'hat-default.png']);
    });

    it('pose base video carries loop + trims; layer pose videos get empty trim slices', () => {
        const char: any = makeChar();
        char.poses['pose-side'] = {
            id: 'pose-side', name: 'Side view',
            baseVideoUrl: 'base-side.webm', isBaseVideo: true, baseVideoLoop: true,
            baseVideoTrimStart: 1, baseVideoTrimEnd: 4,
        };
        char.layers.outfit.assets.dressRed.poseArt['pose-side'] = { videoUrl: 'dress-side.webm', isVideo: true, loop: true };
        const out = buildCharacterMedia(char, selections, wrap, 'pose-side');
        expect(out.videoUrls).toEqual(['base-side.webm', 'dress-side.webm']);
        expect(out.videoTrims).toEqual([{ start: 1, end: 4 }, {}]);
        expect(out.hasVideo).toBe(true);
        expect(out.videoLoop).toBe(true);
        expect(out.imageUrls).toEqual(['hat-default.png']);
    });
});
