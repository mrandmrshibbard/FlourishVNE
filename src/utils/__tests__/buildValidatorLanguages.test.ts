/**
 * What the build tells an author about their languages.
 *
 * Everything here is a WARNING and never an error. Shipping a partly-translated game is a real
 * choice — early access, or a language a fan is still working on — and untranslated lines fall back
 * to the original rather than breaking. The author needs to be told, not blocked.
 */
import { describe, it, expect } from 'vitest';
import { validateProjectForBuild } from '../buildValidator';

const project = (localization?: any, ui: any = { languageScreenId: 'lang1' }): any => ({
    id: 'p', title: 'T', startSceneId: 's1',
    scenes: {
        s1: {
            id: 's1', name: 'Rooftop', commands: [
                { id: 'c1', type: 'Dialogue', characterId: 'mia', text: 'One.' },
                { id: 'c2', type: 'Dialogue', characterId: 'mia', text: 'Two.' },
                { id: 'c3', type: 'Dialogue', characterId: 'mia', text: 'Three.' },
            ],
        },
    },
    characters: { mia: { id: 'mia', name: 'Mia' } },
    variables: {}, items: {}, itemCollections: {},
    backgrounds: {}, images: {}, audio: {}, videos: {},
    uiScreens: {}, commonEvents: {}, ui, localization,
});

const spanish = (strings: any, extra: any = {}) => ({
    sourceLanguage: 'en',
    languages: [{ code: 'es', name: 'Español', enabled: true }],
    strings, ...extra,
});

const langWarnings = (p: any) =>
    validateProjectForBuild(p).warnings.filter(w => w.location === 'Languages').map(w => w.message);

describe('language warnings', () => {
    it('says nothing about languages when the game has none', () => {
        expect(langWarnings(project())).toEqual([]);
    });

    it('🔴 never blocks the build', () => {
        const result = validateProjectForBuild(project(spanish({})));
        expect(result.isValid).toBe(true);
        expect(result.errors.filter(e => e.location === 'Languages')).toEqual([]);
    });

    it('warns when a language is offered but empty', () => {
        const [message] = langWarnings(project(spanish({})));
        expect(message).toContain('Español (es)');
        expect(message).toContain('nothing has been translated');
    });

    it('reports how far along a partly-translated language is, in lines', () => {
        const [message] = langWarnings(project(spanish({
            'cmd:c1:text': { es: { text: 'Uno.' } },
        })));
        // 1 of 4 (three lines + the character name).
        expect(message).toContain('25% translated');
        expect(message).toContain('3 lines');
    });

    it('says nothing about completeness once a language is finished', () => {
        const done = spanish({
            'cmd:c1:text': { es: { text: 'Uno.' } },
            'cmd:c2:text': { es: { text: 'Dos.' } },
            'cmd:c3:text': { es: { text: 'Tres.' } },
            'char:mia:name': { es: { text: 'Mía' } },
        });
        expect(langWarnings(project(done))).toEqual([]);
    });

    it('🔴 flags machine drafts nobody has read', () => {
        const messages = langWarnings(project(spanish({
            'cmd:c1:text': { es: { text: 'Uno.', origin: 'machine', needsReview: true } },
        })));
        const review = messages.find(m => m.includes('machine-translated'));
        expect(review).toContain('1 machine-translated line');
        expect(review).toContain('worth reading before players do');
    });

    it('flags translations of wording that has since changed', () => {
        const messages = langWarnings(project(spanish({
            'cmd:c1:text': { es: { text: 'Uno.', sourceHash: 'stale-hash' } },
        })));
        expect(messages.find(m => m.includes('no longer matches'))).toBeTruthy();
    });

    it('🔴 warns when players have no way to switch language at all', () => {
        const messages = langWarnings(project(spanish({}), {}));
        expect(messages.find(m => m.includes('no way to switch'))).toBeTruthy();
    });

    it('stays quiet about switching once a language screen exists', () => {
        const messages = langWarnings(project(spanish({})));
        expect(messages.find(m => m.includes('no way to switch'))).toBeUndefined();
    });

    it('ignores languages the author has switched off', () => {
        const off = spanish({}, { languages: [{ code: 'es', name: 'Español', enabled: false }] });
        expect(langWarnings(project(off))).toEqual([]);
    });

    it('reports each enabled language separately', () => {
        const two = spanish({ 'cmd:c1:text': { es: { text: 'Uno.' } } }, {
            languages: [
                { code: 'es', name: 'Español', enabled: true },
                { code: 'ja', name: '日本語', enabled: true },
            ],
        });
        const messages = langWarnings(project(two));
        expect(messages.some(m => m.includes('Español (es)'))).toBe(true);
        expect(messages.some(m => m.includes('日本語 (ja)'))).toBe(true);
    });
});
