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
