import { describe, it, expect } from 'vitest';
import { pruneUnusedAssets } from '../gameBundler';

/** Minimal project shape: two of each asset kind, one referenced, one orphaned. */
const makeProject = (): any => ({
    id: 'p1', title: 'T', version: '1',
    startSceneId: 's1',
    scenes: {
        s1: {
            id: 's1', name: 'Scene', commands: [
                { id: 'c1', type: 'SetBackground', backgroundId: 'bg_used' },
                { id: 'c2', type: 'PlayMusic', audioId: 'au_used', loop: true },
                { id: 'c3', type: 'ShowCharacter', characterId: 'ch1' },
            ],
        },
    },
    characters: { ch1: { id: 'ch1', name: 'Alice', baseImageUrl: 'data:image/png;base64,AAA' } },
    variables: {}, items: {},
    backgrounds: {
        bg_used: { id: 'bg_used', name: 'Park', imageUrl: 'data:image/png;base64,BBB' },
        bg_orphan: { id: 'bg_orphan', name: 'Old Park', imageUrl: 'data:image/png;base64,CCC' },
    },
    images: {
        im_used: { id: 'im_used', name: 'Icon', imageUrl: 'data:image/png;base64,DDD' },
        im_orphan: { id: 'im_orphan', name: 'Scrapped Icon', imageUrl: 'data:image/png;base64,EEE' },
    },
    audio: {
        au_used: { id: 'au_used', name: 'Theme', audioUrl: 'data:audio/wav;base64,FFF' },
        au_orphan: { id: 'au_orphan', name: 'Unused Jingle', audioUrl: 'data:audio/wav;base64,GGG' },
    },
    videos: {
        vid_orphan: { id: 'vid_orphan', name: 'Test Clip', videoUrl: 'data:video/mp4;base64,HHH' },
    },
    uiScreens: {
        scr1: {
            id: 'scr1', name: 'Title',
            background: { type: 'image', assetId: 'im_used' },
            elements: {},
        },
    },
    ui: { titleScreenId: 'scr1' },
});

describe('pruneUnusedAssets', () => {
    it('drops assets nothing references and keeps everything referenced', () => {
        const { project, pruned, prunedNames } = pruneUnusedAssets(makeProject());
        expect(Object.keys((project as any).backgrounds)).toEqual(['bg_used']);
        expect(Object.keys((project as any).images)).toEqual(['im_used']);
        expect(Object.keys((project as any).audio)).toEqual(['au_used']);
        expect(Object.keys((project as any).videos)).toEqual([]);
        expect(pruned).toBe(4);
        expect(prunedNames.sort()).toEqual(['Old Park', 'Scrapped Icon', 'Test Clip', 'Unused Jingle']);
    });

    it('never mutates the caller project', () => {
        const original = makeProject();
        pruneUnusedAssets(original);
        expect(Object.keys(original.backgrounds)).toHaveLength(2);
        expect(Object.keys(original.audio)).toHaveLength(2);
    });

    it('keeps assets referenced from anywhere — items, plugin storage, nested actions', () => {
        const p = makeProject();
        p.items = { it1: { id: 'it1', name: 'Key', icon: { type: 'image', id: 'im_orphan' } } };
        p.pluginStorage = { 'com.example': { savedBackdrop: 'bg_orphan' } };
        const { project, pruned } = pruneUnusedAssets(p);
        expect(Object.keys((project as any).images)).toContain('im_orphan');
        expect(Object.keys((project as any).backgrounds)).toContain('bg_orphan');
        expect(pruned).toBe(2); // only the audio jingle + test clip remain unreferenced
    });

    it('🔴 keeps art referenced ONLY as a localized replacement', () => {
        // A Spanish version of a sign is referenced from nowhere but `localization.assetOverrides`.
        // If pruning missed it, the Spanish build would ship with a missing image — and it would
        // look fine in the editor, because the editor never prunes.
        const p = makeProject();
        p.localization = {
            sourceLanguage: 'en',
            languages: [{ code: 'es', name: 'Español', enabled: true }],
            strings: {},
            assetOverrides: { es: { im_used: 'im_orphan', bg_used: 'bg_orphan' } },
        };
        const { project, pruned } = pruneUnusedAssets(p);
        expect(Object.keys((project as any).images)).toContain('im_orphan');
        expect(Object.keys((project as any).backgrounds)).toContain('bg_orphan');
        expect(pruned).toBe(2);   // only the unreferenced audio + video go
    });

    it('keeps everything when every asset is referenced', () => {
        const p = makeProject();
        p.scenes.s1.commands.push(
            { id: 'c4', type: 'ShowImage', imageId: 'im_orphan' },
            { id: 'c5', type: 'SetBackground', backgroundId: 'bg_orphan' },
            { id: 'c6', type: 'PlaySoundEffect', audioId: 'au_orphan' },
            { id: 'c7', type: 'PlayMovie', videoId: 'vid_orphan' },
        );
        const { pruned } = pruneUnusedAssets(p);
        expect(pruned).toBe(0);
    });
});
