/**
 * The walker is the contract between "what a translator sees" and "what the game reads".
 *
 * The first block is the point of the whole design: keys are built from stable VNIDs, so editing
 * the English, reordering a scene, or renaming things NEVER detaches a translation. That's the
 * failure mode Ren'Py has (its ids hash the text) and the failure mode our own previous scheme
 * had, only worse — it keyed on POSITION, so inserting one command shifted every translation
 * below it onto the wrong line.
 */
import { describe, it, expect } from 'vitest';
import { collectTranslatableText, visitTranslatableText, setIn } from '../walkTranslatable';

const project = () => ({
    scenes: {
        s1: {
            id: 's1', name: 'Rooftop', commands: [
                { id: 'c1', type: 'Dialogue', characterId: 'mia', text: 'I said [shake]NO[/shake], {Nickname}.' },
                { id: 'c2', type: 'Dialogue', characterId: null, text: 'First line\nSecond line' },
                { id: 'c3', type: 'Choice', options: [
                    { id: 'o1', text: 'Stay' },
                    { id: 'o2', text: 'Leave' },
                ] },
                { id: 'c4', type: 'ShowButton', text: 'Press me' },
                { id: 'c5', type: 'TextInput', prompt: 'What is your name?', placeholder: 'Type here' },
                { id: 'c6', type: 'CreditRoll', entries: [
                    { type: 'heading', label: 'Cast' },
                    { type: 'credit', label: 'Director', value: 'Brad' },
                ] },
                { id: 'c7', type: 'Group', name: 'Editor-only label' },
            ],
        },
    },
    commonEvents: { e1: { id: 'e1', name: 'Interlude', commands: [{ id: 'ce1', type: 'Dialogue', characterId: 'mia', text: 'From an event' }] } },
    characters: { mia: { id: 'mia', name: 'Mia' } },
    items: { potion: { id: 'potion', name: 'Potion', description: 'Restores health.' } },
    itemCollections: { shop: { id: 'shop', name: 'Corner Shop', description: 'Open late.' } },
    uiScreens: {
        scr1: {
            id: 'scr1', name: 'Title', elements: {
                el1: { id: 'el1', type: 'Text', text: 'New Game' },
                el2: { id: 'el2', type: 'Inventory', emptyText: 'Your bag is empty', nextPageText: '›' },
                el3: { id: 'el3', type: 'Dropdown', options: [{ id: 'd1', label: 'Easy' }, { id: 'd2', label: 'Hard' }] },
            },
        },
    },
    // ⚠ These three shapes are copied from the real types, NOT invented — an earlier version of
    // this fixture had `glossary` flat and `locations` as a record, so the tests passed against a
    // walker that was wrong about both. Check src/types/project.ts before editing them.
    glossary: {
        entries: { g1: { id: 'g1', term: 'Aether', title: 'Aether', description: 'The stuff between stars.', alternatives: ['aethers'] } },
        settings: { enabled: true, tooltipStyle: 'underline' },
    },
    maps: { m1: { id: 'm1', name: 'Town', locations: [{ id: 'l1', name: 'Bakery', label: 'The Bakery' }] } },
    miniGames: { mg1: { id: 'mg1', name: 'Catch', title: 'Catch the cat', instructions: 'Tap the cat.', stages: [{ id: 'st1', instructions: 'Round one' }] } },
});

const keys = (p: any = project()) => collectTranslatableText(p).map(s => s.key);
const byKey = (p: any = project()) => Object.fromEntries(collectTranslatableText(p).map(s => [s.key, s]));

describe('key stability — the reason this design exists', () => {
    it('keeps the same key when the ENGLISH is edited', () => {
        const before = byKey();
        const p = project();
        p.scenes.s1.commands[0].text = 'Completely rewritten line.';
        const after = byKey(p);
        expect(after['cmd:c1:text']).toBeDefined();
        expect(after['cmd:c1:text'].value).toBe('Completely rewritten line.');
        expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    });

    it('🔴 keeps every key when a command is INSERTED (the old positional scheme shifted them)', () => {
        const p = project();
        p.scenes.s1.commands.unshift({ id: 'cNew', type: 'Dialogue', characterId: null, text: 'Brand new opening line' } as any);
        const after = keys(p);
        for (const k of keys()) expect(after).toContain(k);
        expect(after).toContain('cmd:cNew:text');
    });

    it('keeps every key when commands are REORDERED', () => {
        const p = project();
        p.scenes.s1.commands.reverse();
        expect(keys(p).sort()).toEqual(keys().sort());
    });

    it('keeps choice keys when the OPTIONS are reordered', () => {
        const p = project();
        (p.scenes.s1.commands[2] as any).options.reverse();
        const after = byKey(p);
        expect(after['cmd:c3:option:o1:text'].value).toBe('Stay');
        expect(after['cmd:c3:option:o2:text'].value).toBe('Leave');
    });

    it('keeps keys when a scene or character is RENAMED', () => {
        const p = project();
        p.scenes.s1.name = 'The Roof';
        p.characters.mia.name = 'Amelia';
        const after = keys(p);
        for (const k of keys()) expect(after).toContain(k);
    });

    it('gives two identical lines of dialogue DIFFERENT keys', () => {
        const p = project();
        p.scenes.s1.commands[1].text = p.scenes.s1.commands[0].text;
        const found = keys(p).filter(k => k === 'cmd:c1:text' || k === 'cmd:c2:text');
        expect(found).toHaveLength(2);
    });
});

describe('coverage', () => {
    it('finds every player-facing surface', () => {
        const k = keys();
        expect(k).toEqual(expect.arrayContaining([
            'cmd:c1:text',                              // dialogue
            'cmd:c3:option:o1:text',                    // choice option
            'cmd:c4:text',                              // on-stage button
            'cmd:c5:prompt', 'cmd:c5:placeholder',      // text input
            'cmd:c6:credit:0:label', 'cmd:c6:credit:1:value',
            'cmd:ce1:text',                             // inside a common event
            'char:mia:name',
            'item:potion:name', 'item:potion:description',
            'coll:shop:name', 'coll:shop:description',
            'screen:scr1:el:el1:text',
            'screen:scr1:el:el2:emptyText', 'screen:scr1:el:el2:nextPageText',
            'screen:scr1:el:el3:opt:d1:label',
            'glossary:g1:term', 'glossary:g1:description', 'glossary:g1:alt:0',
            'map:m1:loc:l1:name', 'map:m1:loc:l1:label',
            'minigame:mg1:title', 'minigame:mg1:instructions',
            'minigame:mg1:stage:st1:instructions',
        ]));
    });

    it('leaves EDITOR-ONLY labels alone — players never see them', () => {
        const k = keys();
        // A Group's name is organisational, and scene/screen/mini-game names are editor labels.
        expect(k.some(x => x.startsWith('cmd:c7'))).toBe(false);
        expect(k).not.toContain('minigame:mg1:name');
    });

    it('skips empty and whitespace-only strings', () => {
        const p = project();
        p.scenes.s1.commands[3].text = '   ';
        expect(keys(p)).not.toContain('cmd:c4:text');
    });

    it('carries context a translator can actually use', () => {
        const sites = byKey();
        expect(sites['cmd:c1:text'].where).toBe('Scene "Rooftop" · Mia');
        expect(sites['cmd:ce1:text'].where).toBe('Event "Interlude" · Mia');
        expect(sites['cmd:c1:text'].group).toBe('Dialogue');
        expect(sites['cmd:c3:option:o1:text'].group).toBe('Choices');
    });

    it('preserves inline markup exactly — the translator must see it to keep it', () => {
        expect(byKey()['cmd:c1:text'].value).toBe('I said [shake]NO[/shake], {Nickname}.');
        expect(byKey()['cmd:c2:text'].value).toBe('First line\nSecond line');
    });

    it('visits in reading order, so an export reads like the story', () => {
        const order = collectTranslatableText(project()).map(s => s.key);
        expect(order.indexOf('cmd:c1:text')).toBeLessThan(order.indexOf('cmd:c3:option:o1:text'));
        expect(order.indexOf('cmd:c3:option:o1:text')).toBeLessThan(order.indexOf('char:mia:name'));
    });

    it('survives a project missing whole sections without throwing', () => {
        expect(() => collectTranslatableText({})).not.toThrow();
        expect(collectTranslatableText({})).toEqual([]);
        expect(collectTranslatableText(null)).toEqual([]);
        expect(() => collectTranslatableText({ scenes: { s: { commands: [null, {}, { id: 'x' }] } } })).not.toThrow();
    });
});

describe('🔴 container shapes — walked wrong once already', () => {
    it('reads glossary ENTRIES, never treating `settings` as an entry', () => {
        const k = keys();
        expect(k).toContain('glossary:g1:term');
        // `settings` is a sibling of `entries`, not a glossary entry. Walking the glossary as a
        // flat record produced keys like `glossary:settings:*` and paths that resolved to nothing.
        expect(k.some(x => x.startsWith('glossary:settings'))).toBe(false);
        expect(byKey()['glossary:g1:term'].path).toEqual(['glossary', 'entries', 'g1', 'term']);
    });

    it('keys map locations by id but paths them by ARRAY index', () => {
        const site = byKey()['map:m1:loc:l1:name'];
        expect(site.path).toEqual(['maps', 'm1', 'locations', 0, 'name']);
        expect(site.value).toBe('Bakery');
    });

    it('keeps a location key stable when locations are reordered', () => {
        const p = project();
        p.maps.m1.locations.unshift({ id: 'l0', name: 'Docks', label: 'The Docks' });
        const after = byKey(p);
        expect(after['map:m1:loc:l1:name'].value).toBe('Bakery');           // still the bakery
        expect(after['map:m1:loc:l1:name'].path).toEqual(['maps', 'm1', 'locations', 1, 'name']);
    });

    it('keys mini-game stages by id but paths them by array index', () => {
        expect(byKey()['minigame:mg1:stage:st1:instructions'].path)
            .toEqual(['miniGames', 'mg1', 'stages', 0, 'instructions']);
    });
});

describe('setIn — structural sharing', () => {
    it('writes the value at the reported path', () => {
        const p = project();
        const site = byKey(p)['cmd:c1:text'];
        const next: any = setIn(p, site.path, 'Traducido');
        expect(next.scenes.s1.commands[0].text).toBe('Traducido');
    });

    it('does not mutate the original', () => {
        const p = project();
        const original = p.scenes.s1.commands[0].text;
        setIn(p, byKey(p)['cmd:c1:text'].path, 'Traducido');
        expect(p.scenes.s1.commands[0].text).toBe(original);
    });

    it('🔴 shares every branch it did not touch (a project can hold megabytes of media)', () => {
        const p = project();
        const next: any = setIn(p, byKey(p)['cmd:c1:text'].path, 'Traducido');
        expect(next.characters).toBe(p.characters);           // untouched → same reference
        expect(next.uiScreens).toBe(p.uiScreens);
        expect(next.scenes.s1.commands[1]).toBe(p.scenes.s1.commands[1]);
        expect(next.scenes.s1.commands[0]).not.toBe(p.scenes.s1.commands[0]);   // on the path
    });

    it('returns the identical object when the value is unchanged', () => {
        const p = project();
        const path = byKey(p)['cmd:c1:text'].path;
        expect(setIn(p, path, p.scenes.s1.commands[0].text)).toBe(p);
    });

    it('applies many translations in sequence, sharing what it can', () => {
        const p = project();
        let next: any = p;
        for (const site of collectTranslatableText(p)) next = setIn(next, site.path, `«${site.value}»`);
        expect(next.scenes.s1.commands[0].text).toBe('«I said [shake]NO[/shake], {Nickname}.»');
        expect(next.characters.mia.name).toBe('«Mia»');
        expect(next.glossary.entries.g1.alternatives[0]).toBe('«aethers»');
        expect(p.characters.mia.name).toBe('Mia');            // original still pristine
    });
});

describe('visitTranslatableText', () => {
    it('reports a path that actually resolves to the value it reported', () => {
        const p = project();
        visitTranslatableText(p, site => {
            const actual = site.path.reduce((node: any, step) => node?.[step as any], p as any);
            expect(actual).toBe(site.value);
        });
    });
});
