/**
 * buildCharacterMedia × Pose Studio layout: parallel box arrays, per-pose order, per-pose
 * hidden pieces — and the box-less byte-identity guarantee (no imageBoxes attached).
 */
import { describe, it, expect } from 'vitest';
import { buildCharacterMedia, boxFieldsForStage } from '../characterHandler';

const wrap = (u: string) => u;
const BOX = { x: 10, y: 20, width: 30, height: 40 };

const makeChar = (): any => ({
    id: 'c1', name: 'Mia', baseImageUrl: 'base.png',
    layers: {
        body: { id: 'body', name: 'Body', assets: { b1: { id: 'b1', name: 'B', imageUrl: 'body.png' } } },
        hat: { id: 'hat', name: 'Hat', assets: { h1: { id: 'h1', name: 'H', imageUrl: 'hat.png' } } },
        prop: { id: 'prop', name: 'Prop', assets: { p1: { id: 'p1', name: 'P', videoUrl: 'prop.mp4', isVideo: true } } },
    },
    poses: {
        side: { id: 'side', name: 'Side', layerOrder: ['hat', 'body', 'prop'], hiddenLayers: ['prop'] },
    },
});
const SEL = { body: 'b1', hat: 'h1', prop: 'p1' };

describe('buildCharacterMedia layout', () => {
    it('box-less character: all-null box arrays and boxFieldsForStage attaches NOTHING', () => {
        const out = buildCharacterMedia(makeChar(), SEL, wrap);
        expect(out.imageUrls).toEqual(['base.png', 'body.png', 'hat.png']);
        expect(out.imageBoxes).toEqual([null, null, null]);
        expect(boxFieldsForStage(out.imageBoxes, out.videoBoxes)).toEqual({});
    });
    it('boxes ride parallel to their piece (base = null)', () => {
        const char = makeChar();
        char.layers.hat.box = BOX;
        const out = buildCharacterMedia(char, SEL, wrap);
        expect(out.imageUrls).toEqual(['base.png', 'body.png', 'hat.png']);
        expect(out.imageBoxes).toEqual([null, null, BOX]);
        expect(boxFieldsForStage(out.imageBoxes, out.videoBoxes)).toEqual({ imageBoxes: [null, null, BOX] });
    });
    it('a pose reorders the pieces and skips hidden layers (prop video hidden)', () => {
        const out = buildCharacterMedia(makeChar(), SEL, wrap, 'side');
        expect(out.imageUrls).toEqual(['base.png', 'hat.png', 'body.png']); // hat before body
        expect(out.videoUrls).toEqual([]); // prop hidden in this pose
        expect(out.hasVideo).toBe(false);
    });
    it('pose boxes win over Default boxes in the built arrays', () => {
        const char = makeChar();
        char.layers.hat.box = BOX;
        char.layers.hat.poseBoxes = { side: { ...BOX, x: 55 } };
        const def = buildCharacterMedia(char, SEL, wrap);
        const side = buildCharacterMedia(char, SEL, wrap, 'side');
        expect(def.imageBoxes[def.imageUrls.indexOf('hat.png')]!.x).toBe(10);
        expect(side.imageBoxes[side.imageUrls.indexOf('hat.png')]!.x).toBe(55);
    });
    it('videos get their own parallel boxes', () => {
        const char = makeChar();
        char.layers.prop.box = BOX;
        const out = buildCharacterMedia(char, SEL, wrap);
        expect(out.videoUrls).toEqual(['prop.mp4']);
        expect(out.videoBoxes).toEqual([BOX]);
        expect(boxFieldsForStage(out.imageBoxes, out.videoBoxes)).toEqual({ videoBoxes: [BOX] });
    });
});
