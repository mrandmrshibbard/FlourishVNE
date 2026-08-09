/**
 * The runtime swap.
 *
 * Two things matter most here. First, an untranslated game must come back IDENTICAL — by reference,
 * not merely equal — because that identity is what guarantees today's games are unaffected. Second,
 * a half-finished language must stay playable: untranslated lines keep their original text rather
 * than rendering blank, which is the state a solo author's game lives in for most of its life.
 */
import { describe, it, expect } from 'vitest';
import { applyGameLanguage, playableLanguages, detectStartLanguage, shouldShowLanguageScreen } from '../applyGameLanguage';

const project = (localization?: any): any => ({
    id: 'p', title: 'T',
    scenes: {
        s1: {
            id: 's1', name: 'Rooftop', commands: [
                { id: 'c1', type: 'Dialogue', characterId: 'mia', text: 'I said [shake]NO[/shake], {Nickname}.' },
                { id: 'c2', type: 'Dialogue', characterId: null, text: 'It was quiet.' },
                { id: 'c3', type: 'Choice', options: [{ id: 'o1', text: 'Stay' }, { id: 'o2', text: 'Leave' }] },
            ],
        },
    },
    characters: { mia: { id: 'mia', name: 'Mia' } },
    items: { potion: { id: 'potion', name: 'Potion', description: 'Restores health.' } },
    itemCollections: {}, commonEvents: {},
    // The UI chrome is translated by the same pass as the dialogue — it was easy to assume so and
    // never check, and these tests existed for a while with `uiScreens: {}`, covering nothing.
    uiScreens: {
        scr1: {
            id: 'scr1', name: 'Title', elements: {
                el1: { id: 'el1', type: 'Button', text: 'New Game' },
                el2: { id: 'el2', type: 'Text', text: 'My Visual Novel' },
            },
        },
    },
    images: {
        sign: { id: 'sign', name: 'Sign', imageUrl: 'data:image/png;base64,ENGLISH' },
        sign_es: { id: 'sign_es', name: 'Sign (ES)', imageUrl: 'data:image/png;base64,SPANISH' },
    },
    localization,
});

const spanish = (strings: any, extra: any = {}) => ({
    sourceLanguage: 'en',
    languages: [{ code: 'es', name: 'Español', enabled: true }],
    strings,
    ...extra,
});

const full = () => spanish({
    'cmd:c1:text': { es: { text: 'Dije [shake]NO[/shake], {Nickname}.' } },
    'cmd:c2:text': { es: { text: 'Todo estaba en silencio.' } },
    'cmd:c3:option:o1:text': { es: { text: 'Quedarse' } },
    'char:mia:name': { es: { text: 'Mía' } },
    'item:potion:name': { es: { text: 'Poción' } },
    'screen:scr1:el:el1:text': { es: { text: 'Partida nueva' } },
    'screen:scr1:el:el2:text': { es: { text: 'Mi novela visual' } },
});

describe('🔴 a game with no translations is untouched', () => {
    it('returns the very same object when there is no localization at all', () => {
        const p = project();
        expect(applyGameLanguage(p, 'es')).toBe(p);
    });

    it('returns the very same object for the language it was written in', () => {
        const p = project(full());
        expect(applyGameLanguage(p, 'en')).toBe(p);
    });

    it('returns the very same object for a language nobody translated', () => {
        const p = project(full());
        expect(applyGameLanguage(p, 'de')).toBe(p);
    });

    it('survives no language, null and an empty project', () => {
        const p = project(full());
        expect(applyGameLanguage(p, '')).toBe(p);
        expect(applyGameLanguage(null, 'es')).toBeNull();
        expect(() => applyGameLanguage({} as any, 'es')).not.toThrow();
    });
});

describe('playing in another language', () => {
    const played = () => applyGameLanguage(project(full()), 'es') as any;

    it('translates dialogue, choices, names and items in one pass', () => {
        const p = played();
        expect(p.scenes.s1.commands[0].text).toBe('Dije [shake]NO[/shake], {Nickname}.');
        expect(p.scenes.s1.commands[2].options[0].text).toBe('Quedarse');
        expect(p.characters.mia.name).toBe('Mía');
        expect(p.items.potion.name).toBe('Poción');
    });

    it('🔴 leaves untranslated lines in the original language, so a part-done game still plays', () => {
        const p = applyGameLanguage(project(spanish({ 'cmd:c1:text': { es: { text: 'Dije NO' } } })), 'es') as any;
        expect(p.scenes.s1.commands[0].text).toBe('Dije NO');
        expect(p.scenes.s1.commands[1].text).toBe('It was quiet.');       // not blank
        expect(p.items.potion.name).toBe('Potion');
    });

    it('ignores an empty translation rather than rendering a blank line', () => {
        const p = applyGameLanguage(project(spanish({ 'cmd:c2:text': { es: { text: '' } } })), 'es') as any;
        expect(p.scenes.s1.commands[1].text).toBe('It was quiet.');
    });

    it('never alters the original project', () => {
        const p = project(full());
        applyGameLanguage(p, 'es');
        expect(p.scenes.s1.commands[0].text).toBe('I said [shake]NO[/shake], {Nickname}.');
        expect(p.characters.mia.name).toBe('Mia');
    });

    it('🔴 shares every branch it did not touch — a project holds megabytes of media', () => {
        const p = project(full());
        const played = applyGameLanguage(p, 'es') as any;
        expect(played).not.toBe(p);
        expect(played.images).toBe(p.images);                              // untouched → same ref
        expect(played.scenes.s1.commands[1]).not.toBe(p.scenes.s1.commands[1]);   // translated
    });

    it('🔴 translates the UI chrome too — buttons and screen text, not just dialogue', () => {
        const p = played();
        expect(p.uiScreens.scr1.elements.el1.text).toBe('Partida nueva');
        expect(p.uiScreens.scr1.elements.el2.text).toBe('Mi novela visual');
    });

    it('leaves UI text alone when only the dialogue was translated', () => {
        // What an author sees mid-way: the story is translated but the menus are still English,
        // because those strings live under "Screens" in the workspace and nobody filled them in.
        const p = applyGameLanguage(project(spanish({ 'cmd:c1:text': { es: { text: 'Dije NO' } } })), 'es') as any;
        expect(p.scenes.s1.commands[0].text).toBe('Dije NO');
        expect(p.uiScreens.scr1.elements.el1.text).toBe('New Game');
    });

    it('keeps inline codes and variables exactly as the translator left them', () => {
        expect(played().scenes.s1.commands[0].text).toContain('[shake]');
        expect(played().scenes.s1.commands[0].text).toContain('{Nickname}');
    });
});

describe('localized art', () => {
    it('🔴 repoints the ORIGINAL id at the replacement file, so every reference still works', () => {
        const p = applyGameLanguage(
            project(spanish({}, { assetOverrides: { es: { sign: 'sign_es' } } })), 'es') as any;
        // Anything pointing at `sign` — commands, screens, characters — now shows the Spanish art
        // without any of those references being rewritten.
        expect(p.images.sign.imageUrl).toBe('data:image/png;base64,SPANISH');
        expect(p.images.sign.id).toBe('sign');
        expect(p.images.sign_es.imageUrl).toBe('data:image/png;base64,SPANISH');
    });

    it('ignores an override pointing at art that no longer exists', () => {
        const p = applyGameLanguage(
            project(spanish({}, { assetOverrides: { es: { sign: 'deleted' } } })), 'es') as any;
        expect(p.images.sign.imageUrl).toBe('data:image/png;base64,ENGLISH');
    });

    it('leaves art alone for a language with no overrides', () => {
        const p = project(spanish({}, { assetOverrides: { fr: { sign: 'sign_es' } } }));
        expect((applyGameLanguage(p, 'es') as any).images).toBe(p.images);
    });
});

describe('which language a game starts in', () => {
    const p = () => project(spanish({}, { languages: [
        { code: 'es', name: 'Español', enabled: true },
        { code: 'ja', name: '日本語', enabled: true },
        { code: 'de', name: 'Deutsch', enabled: false },
    ] }));

    it('offers only the languages the author switched on', () => {
        expect(playableLanguages(p()).map(l => l.code)).toEqual(['es', 'ja']);
        expect(playableLanguages(project())).toEqual([]);
    });

    it('remembers what the player chose last time, above all else', () => {
        expect(detectStartLanguage(p(), { saved: 'ja', deviceLanguages: ['es'] })).toBe('ja');
        expect(detectStartLanguage(p(), { saved: 'en', deviceLanguages: ['es'] })).toBe('en');
    });

    it('ignores a saved language the game no longer offers', () => {
        expect(detectStartLanguage(p(), { saved: 'de', deviceLanguages: ['ja'] })).toBe('ja');
    });

    it('matches the player’s device, being generous about region', () => {
        expect(detectStartLanguage(p(), { deviceLanguages: ['es-419'] })).toBe('es');
        expect(detectStartLanguage(p(), { deviceLanguages: ['ja-JP'] })).toBe('ja');
        expect(detectStartLanguage(p(), { deviceLanguages: ['en-GB'] })).toBe('en');
    });

    it('walks the device’s whole preference list before giving up', () => {
        expect(detectStartLanguage(p(), { deviceLanguages: ['fi', 'ko', 'ja'] })).toBe('ja');
    });

    it('falls back to the language the game was written in', () => {
        expect(detectStartLanguage(p(), { deviceLanguages: ['fi'] })).toBe('en');
        expect(detectStartLanguage(project(), { deviceLanguages: ['es'] })).toBe('en');
    });

    it('respects an author who turned matching off', () => {
        const off = project(spanish({}, {
            autoDetectLanguage: false,
            languages: [{ code: 'es', name: 'Español', enabled: true }],
        }));
        expect(detectStartLanguage(off, { deviceLanguages: ['es'] })).toBe('en');
        // ...but a player's own choice still wins.
        expect(detectStartLanguage(off, { saved: 'es', deviceLanguages: ['es'] })).toBe('es');
    });
});

describe('whether the game opens on the language screen', () => {
    const gated = (extra: any = {}) => ({
        ...project(spanish({}, {
            languages: [{ code: 'es', name: 'Español', enabled: true }],
            ...extra,
        })),
        ui: { languageScreenId: 'lang1' },
    });

    it('asks a first-time player whose device we could not match', () => {
        expect(shouldShowLanguageScreen(gated(), { deviceLanguages: ['fi'] })).toBe(true);
    });

    it('🔴 does NOT ask a player whose device already matches one of the languages', () => {
        // detectStartLanguage has already put them somewhere sensible; asking would be worse
        // than just starting. This is the case that makes 'firstRun' pleasant rather than a gate.
        expect(shouldShowLanguageScreen(gated(), { deviceLanguages: ['es-MX'] })).toBe(false);
    });

    it('never asks twice — the choice is remembered', () => {
        expect(shouldShowLanguageScreen(gated(), { saved: 'es', deviceLanguages: ['fi'] })).toBe(false);
    });

    it('respects the author switching it off', () => {
        expect(shouldShowLanguageScreen(gated({ showLanguageScreen: 'never' }), { deviceLanguages: ['fi'] })).toBe(false);
    });

    it('asks every launch when the author wants that, even after a choice', () => {
        const every = gated({ showLanguageScreen: 'everyBoot' });
        expect(shouldShowLanguageScreen(every, { saved: 'es', deviceLanguages: ['es'] })).toBe(true);
    });

    it('stays quiet when there is nothing to ask about', () => {
        expect(shouldShowLanguageScreen(project(), { deviceLanguages: ['fi'] })).toBe(false);
        // A screen was never made...
        expect(shouldShowLanguageScreen(project(spanish({})), { deviceLanguages: ['fi'] })).toBe(false);
        // ...or the only language is switched off, leaving nothing to choose between.
        const disabled = gated({ languages: [{ code: 'es', name: 'Español', enabled: false }] });
        expect(shouldShowLanguageScreen(disabled, { deviceLanguages: ['fi'] })).toBe(false);
    });
});
