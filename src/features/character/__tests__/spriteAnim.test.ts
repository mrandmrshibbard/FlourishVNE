/**
 * spriteAnim — the ONE frame-animation resolver every character surface shares. Step keys,
 * loop wrap, dangling-safe, and the same-reference guarantee render paths rely on.
 */
import { describe, it, expect } from 'vitest';
import {
    frameAssetAt,
    applyAnimationFrame,
    animationFrameUrls,
    autoAnimationsOf,
    animationIdleSelections,
    rotationAt,
    layerAdjustAt,
} from '../spriteAnim';

const anim = (over: any = {}): any => ({
    id: 'a1', name: 'Blink', durationMs: 300,
    tracks: [{ layerId: 'eyes', keys: [{ atMs: 0, assetId: 'open' }, { atMs: 100, assetId: 'closed' }, { atMs: 200, assetId: 'open' }] }],
    ...over,
});

describe('frameAssetAt', () => {
    it('picks the last key at or before t', () => {
        expect(frameAssetAt(anim(), 0).get('eyes')).toBe('open');
        expect(frameAssetAt(anim(), 99).get('eyes')).toBe('open');
        expect(frameAssetAt(anim(), 100).get('eyes')).toBe('closed');
        expect(frameAssetAt(anim(), 250).get('eyes')).toBe('open');
    });
    it('non-looping clamps to the final frame; looping wraps', () => {
        expect(frameAssetAt(anim(), 999).get('eyes')).toBe('open');       // clamped to 300
        expect(frameAssetAt(anim({ loop: true }), 310).get('eyes')).toBe('open');   // 310 % 300 = 10
        expect(frameAssetAt(anim({ loop: true }), 450).get('eyes')).toBe('closed'); // 150
    });
    it('unsorted keys still resolve correctly', () => {
        const messy = anim({ tracks: [{ layerId: 'eyes', keys: [{ atMs: 200, assetId: 'open' }, { atMs: 0, assetId: 'open' }, { atMs: 100, assetId: 'closed' }] }] });
        expect(frameAssetAt(messy, 150).get('eyes')).toBe('closed');
    });
    it('before the first key there is no override; null assetId hides the piece', () => {
        const late = anim({ tracks: [{ layerId: 'eyes', keys: [{ atMs: 100, assetId: null }] }] });
        expect(frameAssetAt(late, 50).has('eyes')).toBe(false);
        expect(frameAssetAt(late, 150).get('eyes')).toBeNull();
    });
    it('tolerates empty/missing tracks', () => {
        expect(frameAssetAt(anim({ tracks: [] }), 100).size).toBe(0);
        expect(frameAssetAt(anim({ tracks: [{ layerId: '', keys: [] }] }), 100).size).toBe(0);
    });
});

describe('applyAnimationFrame', () => {
    it('overrides the animated layer, leaves others', () => {
        const sel = { eyes: 'open', mouth: 'smile' } as any;
        const out = applyAnimationFrame(sel, anim(), 150);
        expect(out).toEqual({ eyes: 'closed', mouth: 'smile' });
    });
    it('returns the SAME reference when nothing changes', () => {
        const sel = { eyes: 'open', mouth: 'smile' } as any;
        expect(applyAnimationFrame(sel, anim(), 50)).toBe(sel);   // frame says 'open' — already open
        expect(applyAnimationFrame(sel, anim({ tracks: [] }), 150)).toBe(sel);
    });
});

describe('animationFrameUrls', () => {
    const charData: any = {
        layers: {
            eyes: { id: 'eyes', assets: {
                open: { id: 'open', imageUrl: 'url-open.png' },
                closed: { id: 'closed', imageUrl: 'url-closed.png', poseArt: { side: { imageUrl: 'url-closed-side.png' } } },
            } },
        },
    };
    it('collects every frame URL (default pose)', () => {
        expect(animationFrameUrls(charData, [anim()]).sort()).toEqual(['url-closed.png', 'url-open.png']);
    });
    it('resolves per-pose art for frames', () => {
        expect(animationFrameUrls(charData, [anim()], 'side' as any)).toContain('url-closed-side.png');
    });
    it('dangling layers/assets are skipped, never throw', () => {
        const bad = anim({ tracks: [{ layerId: 'gone', keys: [{ atMs: 0, assetId: 'x' }] }, { layerId: 'eyes', keys: [{ atMs: 0, assetId: 'missing' }] }] });
        expect(animationFrameUrls(charData, [bad])).toEqual([]);
    });
});

describe('autoAnimationsOf / animationIdleSelections', () => {
    it('auto = always/idle/speaking; manual excluded', () => {
        const c: any = { animations: {
            a: anim({ id: 'a', trigger: 'always' }), b: anim({ id: 'b', trigger: 'idle' }),
            c: anim({ id: 'c', trigger: 'speaking' }), d: anim({ id: 'd' }),
        } };
        expect(autoAnimationsOf(c).map(a => a.id).sort()).toEqual(['a', 'b', 'c']);
        expect(autoAnimationsOf(null)).toEqual([]);
    });
    it("idle selections apply only 'always' animations at t=0", () => {
        const c: any = { animations: {
            a: anim({ trigger: 'always', tracks: [{ layerId: 'eyes', keys: [{ atMs: 0, assetId: 'closed' }] }] }),
            b: anim({ trigger: 'idle', tracks: [{ layerId: 'mouth', keys: [{ atMs: 0, assetId: 'oh' }] }] }),
        } };
        const sel = { eyes: 'open', mouth: 'smile' } as any;
        expect(animationIdleSelections(c, sel)).toEqual({ eyes: 'closed', mouth: 'smile' });
        expect(animationIdleSelections({ animations: undefined } as any, sel)).toBe(sel);
    });
});

describe('rotationAt — the Spin/Tilt lane (interpolated, unlike frame keys)', () => {
    const rotAnim = (over: any = {}): any => ({
        id: 'r1', name: 'Twirl', durationMs: 1000,
        tracks: [{ layerId: 'hat', keys: [], rotationKeys: [{ atMs: 0, deg: 0 }, { atMs: 1000, deg: 360 }] }],
        ...over,
    });

    it('interpolates linearly between keys', () => {
        expect(rotationAt(rotAnim(), 0).hat).toBe(0);
        expect(rotationAt(rotAnim(), 250).hat).toBe(90);
        expect(rotationAt(rotAnim(), 500).hat).toBe(180);
        expect(rotationAt(rotAnim(), 1000).hat).toBe(360);
    });

    it('non-looping clamps: holds first angle before, last angle after', () => {
        const late = rotAnim({ tracks: [{ layerId: 'hat', keys: [], rotationKeys: [{ atMs: 400, deg: 45 }, { atMs: 600, deg: 90 }] }] });
        expect(rotationAt(late, 0).hat).toBe(45);      // hold-first
        expect(rotationAt(late, 500).hat).toBe(67.5);  // midway
        expect(rotationAt(late, 5000).hat).toBe(90);   // clamp-last (t clamps to duration)
    });

    it('looping wraps time AND interpolates across the loop seam', () => {
        // Keys at 200 (0°) and 800 (90°), dur 1000, loop: the wrap segment 800→1200(=200)
        // interpolates 90° back to 0° over 400ms.
        const a = rotAnim({ loop: true, tracks: [{ layerId: 'hat', keys: [], rotationKeys: [{ atMs: 200, deg: 0 }, { atMs: 800, deg: 90 }] }] });
        expect(rotationAt(a, 500).hat).toBe(45);
        expect(rotationAt(a, 900).hat).toBeCloseTo(90 + (0 - 90) * (100 / 400));  // 67.5
        expect(rotationAt(a, 1100).hat).toBeCloseTo(90 + (0 - 90) * (300 / 400)); // wraps to t=100 → 22.5
    });

    it('continuous spin: 0°→360° with loop never snaps (t=duration equals t=0 mod 360)', () => {
        const spin = rotAnim({ loop: true });
        expect(rotationAt(spin, 1000).hat % 360).toBeCloseTo(rotationAt(spin, 0).hat % 360);
        expect(rotationAt(spin, 1250).hat).toBe(90);   // wrapped
    });

    it('tracks without rotationKeys contribute nothing', () => {
        const plain = rotAnim({ tracks: [{ layerId: 'hat', keys: [{ atMs: 0, assetId: 'x' }] }] });
        expect(rotationAt(plain, 500)).toEqual({});
    });

    it('a single key holds its angle everywhere', () => {
        const one = rotAnim({ tracks: [{ layerId: 'hat', keys: [], rotationKeys: [{ atMs: 300, deg: 15 }] }] });
        expect(rotationAt(one, 0).hat).toBe(15);
        expect(rotationAt(one, 300).hat).toBe(15);
        expect(rotationAt(one, 900).hat).toBe(15);
    });

    it('unsorted rotation keys still resolve correctly', () => {
        const messy = rotAnim({ tracks: [{ layerId: 'hat', keys: [], rotationKeys: [{ atMs: 1000, deg: 360 }, { atMs: 0, deg: 0 }] }] });
        expect(rotationAt(messy, 500).hat).toBe(180);
    });
});

describe('layerAdjustAt — rotation + move offset + pivot in one record', () => {
    it('combines interpolated rotation with the track offset and pivot', () => {
        const a: any = {
            id: 'a', name: 'A', durationMs: 1000,
            tracks: [{ layerId: 'hat', keys: [], rotationKeys: [{ atMs: 0, deg: 0 }, { atMs: 1000, deg: 90 }], offsetX: 5, offsetY: -3, pivotX: 30, pivotY: 80 }],
        };
        expect(layerAdjustAt(a, 500).hat).toEqual({ deg: 45, dx: 5, dy: -3, pivotX: 30, pivotY: 80 });
    });

    it('offset-only tracks get an entry (no deg); untouched tracks get none', () => {
        const a: any = {
            id: 'a', name: 'A', durationMs: 1000,
            tracks: [
                { layerId: 'arm', keys: [], offsetX: 10, offsetY: 0 },
                { layerId: 'eyes', keys: [{ atMs: 0, assetId: 'x' }] },
            ],
        };
        const r = layerAdjustAt(a, 0);
        expect(r.arm).toEqual({ dx: 10, dy: 0, pivotX: 50, pivotY: 50 });
        expect(r.eyes).toBeUndefined();
    });

    it('pivot alone (no rotation, no offset) does not create an entry', () => {
        const a: any = {
            id: 'a', name: 'A', durationMs: 1000,
            tracks: [{ layerId: 'hat', keys: [], pivotX: 10, pivotY: 10 }],
        };
        expect(layerAdjustAt(a, 0)).toEqual({});
    });

    it('defaults: pivot centres at 50/50, offsets at 0', () => {
        const a: any = {
            id: 'a', name: 'A', durationMs: 1000,
            tracks: [{ layerId: 'hat', keys: [], rotationKeys: [{ atMs: 0, deg: 15 }] }],
        };
        expect(layerAdjustAt(a, 0).hat).toEqual({ deg: 15, dx: 0, dy: 0, pivotX: 50, pivotY: 50 });
    });
});
