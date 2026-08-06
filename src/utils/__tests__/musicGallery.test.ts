/**
 * Music Gallery — pure logic + walkers + byte-safety.
 * The unlock rule must match the CG Gallery exactly; a project WITHOUT musicGallery must
 * stay byte-identical (the never-break-saves hard rule).
 */
import { describe, it, expect } from 'vitest';
import {
    isSongUnlocked, visibleSongs, formatPlayTime, formatTimeLabel,
    buildPlayOrder, stepIndex, defaultMusicPlayerParts,
} from '../musicGallery';
import { createUIElement } from '../uiElementFactory';
import { UIElementType, UIMusicGalleryElement } from '../../features/ui/types';
import { validateProjectForBuild } from '../buildValidator';
import { buildVariableUsageIndex } from '../variableUsage';
import { applyImport } from '../projectMerge';

const entry = (over: any = {}) => ({
    id: 'e1', name: 'Song', audioId: 'a1', unlockable: false, ...over,
});

describe('isSongUnlocked (same truth table as the CG Gallery)', () => {
    it('non-unlockable and variable-less entries are always unlocked', () => {
        expect(isSongUnlocked(entry(), {})).toBe(true);
        expect(isSongUnlocked(entry({ unlockable: true, unlockVariableId: null }), {})).toBe(true);
    });
    it('accepts true, "true", and 1; rejects everything else', () => {
        const e = entry({ unlockable: true, unlockVariableId: 'v1' });
        expect(isSongUnlocked(e, { v1: true })).toBe(true);
        expect(isSongUnlocked(e, { v1: 'true' })).toBe(true);
        expect(isSongUnlocked(e, { v1: 1 })).toBe(true);
        expect(isSongUnlocked(e, { v1: false })).toBe(false);
        expect(isSongUnlocked(e, { v1: 0 })).toBe(false);
        expect(isSongUnlocked(e, {})).toBe(false);
    });
});

describe('visibleSongs', () => {
    const config: any = {
        entries: {
            b: entry({ id: 'b', name: 'Beta', order: 1 }),
            a: entry({ id: 'a', name: 'Alpha', order: 0, category: 'ch1' }),
            c: entry({ id: 'c', name: 'Gamma', order: 1, unlockable: true, unlockVariableId: 'v1' }),
        },
    };
    it('sorts by order then name and flags unlock state', () => {
        const songs = visibleSongs(config, {}, {});
        expect(songs.map(s => s.id)).toEqual(['a', 'b', 'c']);
        expect(songs.find(s => s.id === 'c')!.unlocked).toBe(false);
    });
    it('filters by category and can hide locked songs', () => {
        expect(visibleSongs(config, { categoryFilter: 'ch1' }, {}).map(s => s.id)).toEqual(['a']);
        expect(visibleSongs(config, { hideLockedSongs: true }, {}).map(s => s.id)).toEqual(['a', 'b']);
        expect(visibleSongs(config, { hideLockedSongs: true }, { v1: true }).map(s => s.id)).toEqual(['a', 'b', 'c']);
    });
    it('handles an absent config', () => {
        expect(visibleSongs(undefined, {}, {})).toEqual([]);
    });
});

describe('time formatting', () => {
    it('formats mm:ss and survives bad durations', () => {
        expect(formatPlayTime(0)).toBe('0:00');
        expect(formatPlayTime(83)).toBe('1:23');
        expect(formatPlayTime(605)).toBe('10:05');
        expect(formatPlayTime(NaN)).toBe('0:00');
        expect(formatPlayTime(-5)).toBe('0:00');
        expect(formatPlayTime(Infinity)).toBe('0:00');
    });
    it('hides the total while duration is unknown', () => {
        expect(formatTimeLabel(83, 225)).toBe('1:23 / 3:45');
        expect(formatTimeLabel(83, NaN)).toBe('1:23');
        expect(formatTimeLabel(83, 0)).toBe('1:23');
    });
});

describe('play order', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    it('unshuffled keeps the given order', () => {
        expect(buildPlayOrder(ids, false)).toEqual(ids);
    });
    it('shuffled is a permutation with the current song kept first', () => {
        const order = buildPlayOrder(ids, true, 'c');
        expect(order[0]).toBe('c');
        expect(order.slice().sort()).toEqual(ids.slice().sort());
    });
    it('stepIndex wraps both directions and handles unknown current', () => {
        expect(stepIndex(ids, 'e', 1)).toBe(0);
        expect(stepIndex(ids, 'a', -1)).toBe(4);
        expect(stepIndex(ids, null, 1)).toBe(0);
        expect(stepIndex([], 'a', 1)).toBe(-1);
    });
});

describe('factory + byte-safety', () => {
    const project: any = {
        ui: { dialogueTextFont: { family: 'Arial', size: 16, color: '#fff' } },
        images: {}, backgrounds: {}, audio: {}, variables: {},
    };
    it('creates a complete out-of-the-box player (every part visible)', () => {
        const el = createUIElement(UIElementType.MusicGallery, project) as UIMusicGalleryElement;
        expect(el.type).toBe(UIElementType.MusicGallery);
        const types = el.parts.map(p => p.partType);
        for (const need of ['songList', 'artwork', 'songTitle', 'artistName', 'playPause', 'prevButton', 'nextButton', 'seekBar', 'timeLabel', 'loopToggle', 'shuffleToggle']) {
            expect(types).toContain(need);
        }
        expect(el.parts.every(p => p.visible !== false)).toBe(true);
        expect(el.onLeave).toBe('stop');
    });
    it('default parts factory returns fresh objects each call (no shared references)', () => {
        const a = defaultMusicPlayerParts();
        const b = defaultMusicPlayerParts();
        expect(a[0]).not.toBe(b[0]);
        expect(a[0].id).not.toBe(b[0].id);
    });
    it('a project without musicGallery serializes byte-identical (hard rule)', () => {
        const p: any = { id: 'p', title: 'T', scenes: {}, variables: {}, audio: {}, images: {}, backgrounds: {}, uiScreens: {} };
        const before = JSON.stringify(p);
        // The feature's read paths must not write defaults into the project.
        visibleSongs(p.musicGallery, {}, {});
        expect(JSON.stringify(p)).toBe(before);
        expect('musicGallery' in p).toBe(false);
    });
});

describe('buildValidator musicGallery branch', () => {
    const base: any = {
        title: 'T', scenes: { s1: { id: 's1', name: 'S', commands: [{ type: 'dialogue', character: '', text: 'hi' }] } },
        startSceneId: 's1',
        characters: {}, variables: {}, images: {}, backgrounds: {}, audio: {}, videos: {}, uiScreens: {}, ui: {},
    };
    it('errors on dangling audio + missing unlock variable; warns on missing artwork', () => {
        const project: any = {
            ...base,
            audio: { good: { id: 'good', name: 'G', audioUrl: 'x' } },
            musicGallery: {
                entries: {
                    ok: { id: 'ok', name: 'Fine', audioId: 'good', unlockable: false },
                    bad: { id: 'bad', name: 'Ghost', audioId: 'missing', unlockable: true, unlockVariableId: 'nope' },
                    art: { id: 'art', name: 'Arty', audioId: 'good', artworkAssetId: 'no-art', unlockable: false },
                    empty: { id: 'empty', name: 'Silent', audioId: null, unlockable: false },
                },
            },
        };
        const result = validateProjectForBuild(project);
        const msgs = [...result.errors, ...result.warnings].map((i: any) => i.message).join('\n');
        expect(msgs).toContain('Ghost');                       // dangling audio → error
        expect(msgs).toContain('missing unlock variable');     // dangling variable → error
        expect(msgs).toContain('missing cover picture');       // dangling artwork → warning
        expect(msgs).toContain('no music file chosen');        // empty → warning
        expect(result.errors.filter((e: any) => e.location === 'Music Gallery').length).toBe(2);
    });
    it('a clean gallery adds no findings', () => {
        const project: any = {
            ...base,
            audio: { good: { id: 'good', name: 'G', audioUrl: 'x' } },
            variables: { v1: { id: 'v1', name: 'V', type: 'boolean', defaultValue: false } },
            musicGallery: { entries: { ok: { id: 'ok', name: 'Fine', audioId: 'good', unlockable: true, unlockVariableId: 'v1' } } },
        };
        const result = validateProjectForBuild(project);
        expect([...result.errors, ...result.warnings].filter((i: any) => i.location === 'Music Gallery')).toEqual([]);
    });
});

describe('variableUsage reports song unlock switches', () => {
    it('lists the unlock variable as a gallery check', () => {
        const project: any = {
            scenes: {}, variables: { v1: { id: 'v1', name: 'V', type: 'boolean' } }, uiScreens: {},
            musicGallery: { entries: { s: { id: 's', name: 'Night Drive', unlockVariableId: 'v1' } } },
        };
        const index = buildVariableUsageIndex(project);
        const hits = (index.byVariable.get('v1') || []).filter((u: any) => u.where === 'Music gallery');
        expect(hits.length).toBe(1);
        expect(hits[0].what).toContain('Night Drive');
    });
});

describe('projectMerge seeds musicGallery on import', () => {
    it('importing a song into a project without the config lands it (and only it)', () => {
        const yours: any = { scenes: {}, variables: {}, uiScreens: {} };
        const theirs: any = {
            scenes: {}, variables: {}, uiScreens: {},
            musicGallery: { entries: { s1: { id: 's1', name: 'Imported Song', audioId: null, unlockable: false } } },
        };
        const merged: any = applyImport(yours, theirs, [{ category: 'musicGallery', id: 's1' }]);
        expect(merged.musicGallery?.entries?.s1?.name).toBe('Imported Song');
        expect('musicGallery' in yours).toBe(false); // original untouched (additive import)
    });
});
