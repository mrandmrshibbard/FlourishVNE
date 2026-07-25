/**
 * Custom mouse pointers: the invariants that keep the feature from ever breaking a
 * project or a build — prune safety, save/load round trip, shim plumbing, and the
 * byte-identical guarantee for projects that never touch cursors.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import JSZipLib from 'jszip';
import { pruneUnusedAssets } from '../gameBundler';
import { exportProject, importProject } from '../projectPackager';
import { deriveHotSpotsFromScreen, deriveInteractiveElementsFromScreen } from '../interactiveElements';
import { collectCursorAssetRefs } from '../cursorStyle';

beforeAll(() => { (globalThis as any).JSZip = JSZipLib; });

const marker = (n: number) => btoa(`cursor-art-payload-number-${n}-cursor-art-payload`);
const png = (n: number) => `data:image/png;base64,${marker(n)}`;

const baseProject = (): any => ({
    id: 'proj-cursor-test', title: 'CursorTest', version: '1.0',
    startSceneId: 'scene1',
    scenes: { scene1: { id: 'scene1', name: 'S1', commands: [] } },
    variables: {}, items: {}, backgrounds: {}, audio: {}, videos: {}, fonts: {}, characters: {},
    images: {
        curArrow: { id: 'curArrow', name: 'Arrow', imageUrl: png(1) },
        curHand: { id: 'curHand', name: 'Hand', imageUrl: png(2) },
        curSpot: { id: 'curSpot', name: 'SpotCursor', imageUrl: png(3) },
    },
    uiScreens: {
        s1: {
            id: 's1', name: 'Screen', category: 'menus',
            background: { type: 'color', value: '#000' },
            music: { audioId: null, volume: 1 },
            elements: {
                spot: {
                    id: 'spot', name: 'Spot', type: 'HotSpot', shape: 'rectangle', trigger: 'click',
                    x: 0, y: 0, width: 10, height: 10, actions: [],
                    hoverCursor: 'custom', hoverCursorImage: { type: 'image', id: 'curSpot' },
                },
                drg: {
                    id: 'drg', name: 'Drg', type: 'Image', x: 0, y: 0, width: 5, height: 5,
                    background: { type: 'image', assetId: 'curArrow' }, image: null,
                    draggable: true, hoverCursor: 'arrow',
                },
            },
        },
    },
    ui: {
        titleScreenId: 's1', saveScreenId: null, loadScreenId: null, pauseScreenId: null, settingsScreenId: null,
        dialogueBoxImage: null, dialogueBoxBorderImage: null,
        cursors: {
            normal: { image: { type: 'image', id: 'curArrow' }, size: 24, hotPreset: 'tip' },
            hand: { image: { type: 'image', id: 'curHand' } },
            dialogueAdvance: 'arrow',
        },
    },
});

describe('custom mouse pointers', () => {
    it('prune never drops images referenced only by cursor settings', () => {
        const p = baseProject();
        const { project: pruned, prunedNames } = pruneUnusedAssets(p);
        expect((pruned.images as any).curArrow).toBeDefined();
        expect((pruned.images as any).curHand).toBeDefined();
        expect((pruned.images as any).curSpot).toBeDefined();
        expect(prunedNames).toEqual([]);
    });

    it('collectCursorAssetRefs finds slot + per-element refs', () => {
        const ids = collectCursorAssetRefs(baseProject()).map(r => r.id).sort();
        expect(ids).toEqual(['curArrow', 'curHand', 'curSpot']);
    });

    it('.flourish round trip preserves cursor settings and art', async () => {
        let captured: Uint8Array | null = null;
        (window as any).electronAPI = {
            saveProjectExport: async (data: Uint8Array) => { captured = data; return { success: true, filePath: 'x.flourish' }; },
        };
        try {
            const result = await exportProject(baseProject());
            expect(result.saved).toBe(true);
            expect(result.missingAssets).toBeUndefined();
            const { project: loaded } = await importProject(captured! as any);
            const cur: any = (loaded.ui as any).cursors;
            expect(cur.normal.image.id).toBe('curArrow');
            expect(cur.normal.size).toBe(24);
            expect(cur.dialogueAdvance).toBe('arrow');
            expect((loaded.images as any).curArrow.imageUrl).toContain(marker(1));
            const spot: any = (loaded.uiScreens as any).s1.elements.spot;
            expect(spot.hoverCursor).toBe('custom');
            expect(spot.hoverCursorImage.id).toBe('curSpot');
        } finally {
            delete (window as any).electronAPI;
        }
    });

    it('runtime shims carry the hover-cursor pair (three-allowlist rule)', () => {
        const p = baseProject();
        const spots = deriveHotSpotsFromScreen(p.uiScreens.s1);
        expect((spots.spot as any).hoverCursor).toBe('custom');
        expect((spots.spot as any).hoverCursorImage.id).toBe('curSpot');
        const els = deriveInteractiveElementsFromScreen(p.uiScreens.s1, {});
        expect((els.drg as any).hoverCursor).toBe('arrow');
    });

    it('a cursor-free project serializes byte-identically (nothing invented)', () => {
        const p = baseProject();
        delete p.ui.cursors;
        delete p.uiScreens.s1.elements.spot.hoverCursor;
        delete p.uiScreens.s1.elements.spot.hoverCursorImage;
        delete p.uiScreens.s1.elements.drg.hoverCursor;
        const before = JSON.stringify(p);
        expect(collectCursorAssetRefs(p)).toEqual([]);
        pruneUnusedAssets(p);
        expect(JSON.stringify(p)).toBe(before);
    });
});
