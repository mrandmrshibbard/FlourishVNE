/**
 * Repairing screens that would crash the editor.
 *
 * 🔴 A generated language screen shipped with `background: null` and no `music`/`ambientNoise`, and
 * opening it white-screened the app. The generator is fixed, but projects saved in between still
 * contain that screen — and a version-gated migration would never run on them, because they're
 * already at the current version. Hence a repair on every load.
 *
 * The rule that keeps this safe to run forever: it only FILLS IN what's missing. It must never
 * overwrite something the author chose.
 */
import { describe, it, expect } from 'vitest';
import { repairIncompleteScreens, isScreenIncomplete } from '../screenShapeRepair';

const broken = (): any => ({
    id: 'p', title: 'T',
    uiScreens: {
        // Exactly what the first version of createLanguageScreen produced.
        lang: { id: 'lang', name: 'Language', background: null, elements: { a: { id: 'a' } } },
    },
});

const healthy = (): any => ({
    id: 'p', title: 'T',
    uiScreens: {
        title: {
            id: 'title', name: 'Title', background: { type: 'image', assetId: 'bg1' },
            music: { audioId: 'song', policy: 'stop', volume: 0.4 },
            ambientNoise: { audioId: null, policy: 'continue' },
            elements: {},
        },
    },
});

describe('spotting a screen that would crash', () => {
    it('flags a null background and missing audio settings', () => {
        expect(isScreenIncomplete(broken().uiScreens.lang)).toBe(true);
    });

    it('leaves a well-formed screen alone', () => {
        expect(isScreenIncomplete(healthy().uiScreens.title)).toBe(false);
    });
});

describe('repairIncompleteScreens', () => {
    it('gives the broken screen everything the renderer reads', () => {
        const screen: any = repairIncompleteScreens(broken()).uiScreens.lang;
        expect(screen.background).toEqual({ type: 'color', value: '#1a102c' });
        expect(screen.music).toEqual({ audioId: null, policy: 'continue' });
        expect(screen.ambientNoise).toEqual({ audioId: null, policy: 'continue' });
    });

    it('keeps the screen’s own elements and name', () => {
        const screen: any = repairIncompleteScreens(broken()).uiScreens.lang;
        expect(screen.name).toBe('Language');
        expect(screen.elements.a.id).toBe('a');
    });

    it('🔴 never overwrites what the author chose', () => {
        const screen: any = repairIncompleteScreens(healthy()).uiScreens.title;
        expect(screen.background).toEqual({ type: 'image', assetId: 'bg1' });
        expect(screen.music).toEqual({ audioId: 'song', policy: 'stop', volume: 0.4 });
    });

    it('returns the IDENTICAL project when nothing needs fixing — it runs on every load', () => {
        const p = healthy();
        expect(repairIncompleteScreens(p)).toBe(p);
    });

    it('is idempotent', () => {
        const once = repairIncompleteScreens(broken());
        expect(repairIncompleteScreens(once)).toBe(once);
    });

    it('repairs only what is broken, leaving healthy screens by reference', () => {
        const p: any = broken();
        p.uiScreens.title = healthy().uiScreens.title;
        const next: any = repairIncompleteScreens(p);
        expect(next.uiScreens.title).toBe(p.uiScreens.title);
        expect(next.uiScreens.lang).not.toBe(p.uiScreens.lang);
    });

    it('survives projects with no screens, or nonsense in place of them', () => {
        expect(() => repairIncompleteScreens({} as any)).not.toThrow();
        expect(repairIncompleteScreens({ uiScreens: null } as any)).toEqual({ uiScreens: null });
        expect(() => repairIncompleteScreens({ uiScreens: { x: null } } as any)).not.toThrow();
    });
});
