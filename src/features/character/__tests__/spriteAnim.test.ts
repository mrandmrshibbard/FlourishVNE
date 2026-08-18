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
    characterMotionAt,
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

describe('layerAdjustAt — Squash & Stretch lane (interpolated non-uniform scale)', () => {
    const sqAnim = (over: any = {}): any => ({
        id: 's1', name: 'Bounce', durationMs: 1000,
        tracks: [{ layerId: 'body', keys: [], scaleKeys: [{ atMs: 0, sx: 1, sy: 1 }, { atMs: 500, sx: 1.2, sy: 0.8 }, { atMs: 1000, sx: 1, sy: 1 }] }],
        ...over,
    });

    it('interpolates sx and sy independently (the squash IS the non-uniformity)', () => {
        const mid = layerAdjustAt(sqAnim(), 500).body;
        expect(mid.sx).toBeCloseTo(1.2);
        expect(mid.sy).toBeCloseTo(0.8);
        const q = layerAdjustAt(sqAnim(), 250).body;
        expect(q.sx).toBeCloseTo(1.1);
        expect(q.sy).toBeCloseTo(0.9);
        expect(layerAdjustAt(sqAnim(), 1000).body.sx).toBeCloseTo(1);
    });

    it('scale-only tracks get an entry; carries the shared pivot', () => {
        const a = sqAnim({ tracks: [{ layerId: 'body', keys: [], scaleKeys: [{ atMs: 0, sx: 1.3, sy: 0.7 }], pivotX: 50, pivotY: 100 }] });
        const r = layerAdjustAt(a, 0).body;
        expect(r).toEqual({ sx: 1.3, sy: 0.7, dx: 0, dy: 0, pivotX: 50, pivotY: 100 });
    });

    it('loop wraps the scale curve across the seam without snapping', () => {
        const a = sqAnim({ loop: true, tracks: [{ layerId: 'body', keys: [], scaleKeys: [{ atMs: 200, sx: 1, sy: 1 }, { atMs: 800, sx: 1.4, sy: 0.6 }] }] });
        // Wrap segment 800 → 1200(=200): halfway (t=1000 → wrapped t=0 is inside the seam).
        expect(layerAdjustAt(a, 1000).body.sx).toBeCloseTo(1.4 + (1 - 1.4) * (200 / 400));
        expect(layerAdjustAt(a, 500).body.sy).toBeCloseTo(0.8);
    });

    it('composes with rotation keys on the same track', () => {
        const a = sqAnim({ tracks: [{ layerId: 'body', keys: [], rotationKeys: [{ atMs: 0, deg: 0 }, { atMs: 1000, deg: 90 }], scaleKeys: [{ atMs: 0, sx: 1, sy: 1 }, { atMs: 1000, sx: 2, sy: 2 }] }] });
        const r = layerAdjustAt(a, 500).body;
        expect(r.deg).toBeCloseTo(45);
        expect(r.sx).toBeCloseTo(1.5);
    });

    it('missing sx/sy on a key default to 1', () => {
        const a = sqAnim({ tracks: [{ layerId: 'body', keys: [], scaleKeys: [{ atMs: 0 }, { atMs: 1000, sx: 2, sy: 2 }] }] });
        expect(layerAdjustAt(a, 0).body.sx).toBeCloseTo(1);
        expect(layerAdjustAt(a, 500).body.sx).toBeCloseTo(1.5);
    });
});

describe('layerAdjustAt — per-frame nudge (dx/dy on frame keys, STEP semantics)', () => {
    const nudgeAnim = (over: any = {}): any => ({
        id: 'n1', name: 'Sway', durationMs: 600, loop: true,
        tracks: [{ layerId: 'hips', keys: [
            { atMs: 0, assetId: 'left' },
            { atMs: 300, assetId: 'right', dx: -3, dy: 1 },
        ] }],
        ...over,
    });

    it('applies the ACTIVE frame key\'s nudge, stepping at the swap (no interpolation)', () => {
        expect(layerAdjustAt(nudgeAnim(), 0).hips).toBeUndefined();          // frame 1: no nudge → no entry
        expect(layerAdjustAt(nudgeAnim(), 299).hips).toBeUndefined();
        expect(layerAdjustAt(nudgeAnim(), 300).hips).toEqual({ dx: -3, dy: 1, pivotX: 50, pivotY: 50 });
        expect(layerAdjustAt(nudgeAnim(), 599).hips).toEqual({ dx: -3, dy: 1, pivotX: 50, pivotY: 50 });
        // Loop wraps back to frame 1 → nudge gone again.
        expect(layerAdjustAt(nudgeAnim(), 650).hips).toBeUndefined();
    });

    it('sums with the track\'s Move offset', () => {
        const a = nudgeAnim({ tracks: [{ layerId: 'hips', offsetX: 10, keys: [
            { atMs: 0, assetId: 'left' },
            { atMs: 300, assetId: 'right', dx: -3 },
        ] }] });
        expect(layerAdjustAt(a, 0).hips.dx).toBe(10);
        expect(layerAdjustAt(a, 400).hips.dx).toBe(7);
    });

    it('before the first key there is no frame, hence no nudge', () => {
        const a = nudgeAnim({ loop: false, tracks: [{ layerId: 'hips', keys: [{ atMs: 200, assetId: 'x', dx: 5 }] }] });
        expect(layerAdjustAt(a, 100).hips).toBeUndefined();
        expect(layerAdjustAt(a, 200).hips.dx).toBe(5);
    });

    it('keys without dx/dy behave exactly as before', () => {
        const plain = nudgeAnim({ tracks: [{ layerId: 'hips', keys: [{ atMs: 0, assetId: 'left' }, { atMs: 300, assetId: 'right' }] }] });
        expect(layerAdjustAt(plain, 0)).toEqual({});
        expect(layerAdjustAt(plain, 450)).toEqual({});
    });
});

describe('layerAdjustAt — Glide lane (TWEENED movement, unlike step frame nudges)', () => {
    const glideAnim = (over: any = {}): any => ({
        id: 'g1', name: 'Sway', durationMs: 800, loop: true,
        tracks: [{ layerId: 'hips', keys: [], moveKeys: [
            { atMs: 0, dx: -2, dy: 0 },
            { atMs: 400, dx: 2, dy: 0.5 },
        ] }],
        ...over,
    });

    it('interpolates smoothly between keys', () => {
        expect(layerAdjustAt(glideAnim(), 0).hips.dx).toBeCloseTo(-2);
        expect(layerAdjustAt(glideAnim(), 200).hips.dx).toBeCloseTo(0);
        expect(layerAdjustAt(glideAnim(), 400).hips.dx).toBeCloseTo(2);
        expect(layerAdjustAt(glideAnim(), 200).hips.dy).toBeCloseTo(0.25);
    });

    it('loop lerps back across the seam (no snap)', () => {
        // Wrap segment 400 → 1200(=0+800): halfway at t=600 → dx = 0.
        expect(layerAdjustAt(glideAnim(), 600).hips.dx).toBeCloseTo(0);
    });

    it('sums with track offset AND the active frame nudge', () => {
        const a = glideAnim({ tracks: [{ layerId: 'hips', offsetX: 10,
            keys: [{ atMs: 0, assetId: 'x', dx: 1 }],
            moveKeys: [{ atMs: 0, dx: -2, dy: 0 }, { atMs: 800, dx: -2, dy: 0 }] }] });
        expect(layerAdjustAt(a, 0).hips.dx).toBeCloseTo(10 + 1 - 2);
    });
});

describe('characterMotionAt — whole-character motion lane (TWEENED)', () => {
    const motionAnim = (over: any = {}): any => ({
        id: 'm1', name: 'Bob', durationMs: 1000, loop: true, tracks: [],
        motionKeys: [
            { atMs: 0, dx: -3, dy: 0 },
            { atMs: 500, dx: 3, dy: 1 },
        ],
        ...over,
    });

    it('returns null without motion keys', () => {
        expect(characterMotionAt(motionAnim({ motionKeys: undefined }), 0)).toBeNull();
        expect(characterMotionAt(motionAnim({ motionKeys: [] }), 0)).toBeNull();
    });

    it('interpolates smoothly between keys', () => {
        expect(characterMotionAt(motionAnim(), 0)!.dx).toBeCloseTo(-3);
        expect(characterMotionAt(motionAnim(), 250)!.dx).toBeCloseTo(0);
        expect(characterMotionAt(motionAnim(), 500)!.dx).toBeCloseTo(3);
        expect(characterMotionAt(motionAnim(), 250)!.dy).toBeCloseTo(0.5);
    });

    it('loop lerps back across the seam (no snap)', () => {
        // Wrap segment 500 → 1500(=0+1000): halfway at t=1000≡0... use 750 → dx = 0.
        expect(characterMotionAt(motionAnim(), 750)!.dx).toBeCloseTo(0);
    });

    it('non-loop holds the first key before it and the last after it', () => {
        const a = motionAnim({ loop: false, motionKeys: [{ atMs: 200, dx: 5, dy: -1 }, { atMs: 600, dx: 7, dy: 0 }] });
        expect(characterMotionAt(a, 0)!.dx).toBe(5);
        expect(characterMotionAt(a, 900)!.dx).toBe(7);
        expect(characterMotionAt(a, 900)!.dy).toBe(0);
    });

    it('sorts unsorted keys defensively', () => {
        const a = motionAnim({ motionKeys: [{ atMs: 500, dx: 3, dy: 1 }, { atMs: 0, dx: -3, dy: 0 }] });
        expect(characterMotionAt(a, 250)!.dx).toBeCloseTo(0);
    });

    it('a single key holds its value for the whole timeline', () => {
        const a = motionAnim({ motionKeys: [{ atMs: 300, dx: 4, dy: 2 }] });
        expect(characterMotionAt(a, 0)).toEqual({ dx: 4, dy: 2 });
        expect(characterMotionAt(a, 999)).toEqual({ dx: 4, dy: 2 });
    });
});
