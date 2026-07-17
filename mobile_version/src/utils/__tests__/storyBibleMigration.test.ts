import { describe, it, expect } from 'vitest';
import { migrateStoryBiblePluginStorage } from '../storyBibleMigration';
import type { VNProject } from '../../types/project';

const base = (extra: Partial<VNProject> = {}): VNProject => ({
    id: 'p1', title: 'T', startSceneId: 's1',
    scenes: {}, characters: {}, backgrounds: {}, images: {}, audio: {}, videos: {},
    variables: {}, fonts: {}, ui: {} as any, uiScreens: {},
    ...extra,
} as VNProject);

const pluginBlob = (sections: any) => ({
    pluginStorage: {
        'com.flourish.story-bible': {
            bible: { fab: { x: 1, y: 2 }, win: { x: 0, y: 0, w: 1, h: 1, open: true }, selected: 'x', sections },
        },
    },
});

describe('migrateStoryBiblePluginStorage', () => {
    it('lifts plugin sections + subsections into project.storyBible, dropping UI state', () => {
        const p = base(pluginBlob([
            { id: 's1', name: 'Synopsis', content: 'hello', subsections: [{ id: 'ss1', name: 'Act 1', content: 'notes' }] },
        ]));
        const out = migrateStoryBiblePluginStorage(p);
        expect(out.storyBible).toEqual({
            sections: [{ id: 's1', name: 'Synopsis', content: 'hello', subsections: [{ id: 'ss1', name: 'Act 1', content: 'notes' }] }],
        });
        expect((out.storyBible as any).fab).toBeUndefined();
        // The plugin blob stays (the plugin may still be installed).
        expect(out.pluginStorage?.['com.flourish.story-bible']).toBeDefined();
    });

    it('is idempotent and never overwrites an existing storyBible', () => {
        const withExisting = base({ ...pluginBlob([{ id: 'x', name: 'Plugin', content: '', subsections: [] }]), storyBible: { sections: [{ id: 'mine', name: 'Mine', content: 'edited', subsections: [] }] } });
        const out = migrateStoryBiblePluginStorage(withExisting);
        expect(out).toBe(withExisting); // unchanged reference
        expect(out.storyBible!.sections[0].name).toBe('Mine');
    });

    it('returns the project unchanged when there is no plugin data', () => {
        const p = base();
        expect(migrateStoryBiblePluginStorage(p)).toBe(p);
        const malformed = base({ pluginStorage: { 'com.flourish.story-bible': { bible: { sections: 'nope' } } } } as any);
        expect(migrateStoryBiblePluginStorage(malformed)).toBe(malformed);
    });

    it('sanitizes malformed section shapes', () => {
        const p = base(pluginBlob([
            { id: 42, name: null, content: undefined, subsections: 'bad' },
            null,
            { name: 'OK', content: 'c', subsections: [{ name: 7 }] },
        ]));
        const out = migrateStoryBiblePluginStorage(p);
        expect(out.storyBible!.sections).toHaveLength(2);
        const [a, b] = out.storyBible!.sections;
        expect(typeof a.id).toBe('string');
        expect(a.name).toBe('');
        expect(a.content).toBe('');
        expect(a.subsections).toEqual([]);
        expect(b.name).toBe('OK');
        expect(b.subsections[0].name).toBe('');
        expect(typeof b.subsections[0].id).toBe('string');
    });
});
