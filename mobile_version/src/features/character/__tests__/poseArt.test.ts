import { describe, it, expect } from 'vitest';
import { assetArtForPose, assetHasPoseArt, characterBaseArtForPose, resolvePoseId } from '../poseArt';
import type { VNLayerAsset } from '../types';

const dress: VNLayerAsset = {
    id: 'a_dress', name: 'Red Dress',
    imageUrl: 'front/dress.png', isVideo: false, loop: true, trimStart: 1, trimEnd: 2,
    poseArt: {
        p_side: { imageUrl: 'side/dress.png' },
        p_video: { videoUrl: 'side/dress.webm', isVideo: true, loop: false, trimStart: 3, trimEnd: 4 },
        p_empty: {},
    },
};

const plainAsset: VNLayerAsset = { id: 'a_hat', name: 'Hat', imageUrl: 'front/hat.png' };

const charBase = {
    baseImageUrl: 'front/base.png', baseVideoUrl: null as string | null,
    isBaseVideo: false, baseVideoLoop: true, baseVideoTrimStart: 5, baseVideoTrimEnd: 6,
    poses: {
        p_side: { id: 'p_side', name: 'Side', baseImageUrl: 'side/base.png' },
        p_bare: { id: 'p_bare', name: 'No own art' },
    },
};

describe('assetArtForPose', () => {
    it('IDENTITY: undefined poseId returns the default art field-for-field', () => {
        expect(assetArtForPose(dress, undefined)).toEqual({
            imageUrl: 'front/dress.png', videoUrl: undefined, isVideo: false, loop: true, trimStart: 1, trimEnd: 2,
        });
    });
    it('IDENTITY: asset with no poseArt at all is unaffected by any poseId', () => {
        expect(assetArtForPose(plainAsset, 'p_side').imageUrl).toBe('front/hat.png');
    });
    it('pose hit returns the pose art', () => {
        expect(assetArtForPose(dress, 'p_side').imageUrl).toBe('side/dress.png');
    });
    it('video pose art carries isVideo/loop/trims', () => {
        expect(assetArtForPose(dress, 'p_video')).toEqual({
            imageUrl: undefined, videoUrl: 'side/dress.webm', isVideo: true, loop: false, trimStart: 3, trimEnd: 4,
        });
    });
    it('an EMPTY pose entry (no image, no video) falls back to default art', () => {
        expect(assetArtForPose(dress, 'p_empty').imageUrl).toBe('front/dress.png');
    });
    it('unknown poseId falls back to default art', () => {
        expect(assetArtForPose(dress, 'p_deleted').imageUrl).toBe('front/dress.png');
    });
});

describe('assetHasPoseArt', () => {
    it('true only when the entry actually has image or video', () => {
        expect(assetHasPoseArt(dress, 'p_side')).toBe(true);
        expect(assetHasPoseArt(dress, 'p_empty')).toBe(false);
        expect(assetHasPoseArt(dress, 'p_deleted')).toBe(false);
        expect(assetHasPoseArt(plainAsset, 'p_side')).toBe(false);
    });
});

describe('characterBaseArtForPose', () => {
    it('IDENTITY: undefined poseId returns the default base fields exactly', () => {
        expect(characterBaseArtForPose(charBase, undefined)).toEqual({
            imageUrl: 'front/base.png', videoUrl: null, isVideo: false, loop: true, trimStart: 5, trimEnd: 6,
        });
    });
    it('pose with base art wins', () => {
        expect(characterBaseArtForPose(charBase, 'p_side').imageUrl).toBe('side/base.png');
    });
    it('pose WITHOUT its own base art falls back to default base', () => {
        expect(characterBaseArtForPose(charBase, 'p_bare').imageUrl).toBe('front/base.png');
    });
    it('character with no poses record is unaffected', () => {
        const { poses, ...noPoses } = charBase;
        expect(characterBaseArtForPose(noPoses, 'p_side').imageUrl).toBe('front/base.png');
    });
});

describe('resolvePoseId', () => {
    it('honors only ids the character defines', () => {
        expect(resolvePoseId(charBase, 'p_side')).toBe('p_side');
        expect(resolvePoseId(charBase, 'p_deleted')).toBeUndefined();
        expect(resolvePoseId(charBase, undefined)).toBeUndefined();
        expect(resolvePoseId({}, 'p_side')).toBeUndefined();
        expect(resolvePoseId(null, 'p_side')).toBeUndefined();
    });
});
