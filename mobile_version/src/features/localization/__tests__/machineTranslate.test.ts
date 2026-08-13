/**
 * Machine translation, with a fake model.
 *
 * The model is injected, so every dangerous behaviour it can have — mangling codes, returning
 * nothing, echoing the input, failing outright — is tested here deterministically, without
 * downloading anything. The rule under all of it: a line the guard isn't sure about is left
 * UNTRANSLATED and reported, never half-applied.
 */
import { describe, it, expect, vi } from 'vitest';
import { machineTranslateProject, summarizeMachineTranslation, Translator } from '../machineTranslate';
import { languageProgress } from '../store';

const project = (strings: any = {}): any => ({
    id: 'p', title: 'T',
    scenes: {
        s1: {
            id: 's1', name: 'Rooftop', commands: [
                { id: 'c1', type: 'Dialogue', characterId: 'mia', text: 'I said [shake]NO[/shake], {Nickname}.' },
                { id: 'c2', type: 'Dialogue', characterId: null, text: 'It was quiet.' },
            ],
        },
    },
    characters: { mia: { id: 'mia', name: 'Mia' } },
    items: {}, itemCollections: {}, uiScreens: {}, commonEvents: {},
    localization: {
        sourceLanguage: 'en',
        languages: [{ code: 'es', name: 'Español', enabled: true }],
        strings,
    },
});

/** A well-behaved model: prefixes each line, leaving the markers exactly where they were. */
const goodModel: Translator = async texts => texts.map(t => `ES:${t}`);

const run = (translator: Translator, p: any = project(), options: any = {}) =>
    machineTranslateProject(p, translator, { language: 'es', ...options });

describe('drafting a language', () => {
    it('translates every untranslated line and applies it', async () => {
        const { project: next, report } = await run(goodModel);
        expect(report.translated).toBe(3);                   // 2 lines + the character name
        expect(report.rejected).toEqual([]);
        expect((next as any).localization.strings['cmd:c2:text'].es.text).toBe('ES:It was quiet.');
    });

    it('🔴 puts the codes back exactly, having hidden them from the model', async () => {
        const seen: string[] = [];
        const spy: Translator = async texts => { seen.push(...texts); return texts.map(t => `ES:${t}`); };
        const { project: next } = await run(spy);

        // The model never saw our markup...
        expect(seen.some(t => t.includes('[shake]'))).toBe(false);
        expect(seen.some(t => t.includes('{Nickname}'))).toBe(false);
        // ...but the result has it back, in place.
        expect((next as any).localization.strings['cmd:c1:text'].es.text)
            .toBe('ES:I said [shake]NO[/shake], {Nickname}.');
    });

    it('🔴 marks everything as an unreviewed machine draft', async () => {
        const { project: next } = await run(goodModel);
        const entry = (next as any).localization.strings['cmd:c2:text'].es;
        expect(entry.origin).toBe('machine');
        expect(entry.needsReview).toBe(true);
        expect(entry.sourceHash).toBeTruthy();
        expect(languageProgress(next, 'es').needsReview).toBe(3);
    });

    it('never overwrites a translation that already exists', async () => {
        const p = project({ 'cmd:c1:text': { es: { text: 'Escrito a mano', origin: 'human' } } });
        const { project: next, report } = await run(goodModel, p);
        expect(report.skipped).toBe(1);
        expect((next as any).localization.strings['cmd:c1:text'].es.text).toBe('Escrito a mano');
    });

    it('will re-draft existing translations when asked explicitly', async () => {
        const p = project({ 'cmd:c1:text': { es: { text: 'Viejo' } } });
        const { report } = await run(goodModel, p, { includeTranslated: true });
        expect(report.skipped).toBe(0);
        expect(report.translated).toBe(3);
    });

    it('leaves the original project untouched', async () => {
        const p = project();
        await run(goodModel, p);
        expect(p.localization.strings).toEqual({});
    });
});

describe('🔴 refusing results that would break the game', () => {
    const rejectionFor = async (translator: Translator) => {
        const { project: next, report } = await run(translator);
        return { report, strings: (next as any).localization.strings };
    };

    it('refuses a line whose codes the model mangled', async () => {
        // Spaces out the marker — a real failure mode for these models.
        const mangler: Translator = async texts => texts.map(t => t.replace(/%%(\d+)%%/g, '%% $1 %%'));
        const { report, strings } = await rejectionFor(mangler);
        expect(strings['cmd:c1:text']).toBeUndefined();
        // The reason names the actual code, so the author knows which line to look at.
        expect(report.rejected.find(r => r.key === 'cmd:c1:text')?.reason)
            .toBe("[shake] didn't survive the translation");
    });

    it('refuses a line where a marker vanished', async () => {
        const dropper: Translator = async texts => texts.map(t => t.replace(/%%\d+%%/, ''));
        const { report, strings } = await rejectionFor(dropper);
        expect(strings['cmd:c1:text']).toBeUndefined();
        expect(report.rejected.length).toBeGreaterThan(0);
    });

    it('refuses an empty result rather than blanking the line', async () => {
        const { report, strings } = await rejectionFor(async texts => texts.map(() => ''));
        expect(Object.keys(strings)).toEqual([]);
        expect(report.rejected[0].reason).toContain('returned nothing');
    });

    it('refuses a result identical to the source — that is not a translation', async () => {
        const { report, strings } = await rejectionFor(async texts => texts);
        expect(Object.keys(strings)).toEqual([]);
        expect(report.rejected[0].reason).toContain('the original text');
    });

    it('🔴 a failed batch is reported, not thrown — earlier work survives', async () => {
        let call = 0;
        const flaky: Translator = async texts => {
            if (call++ === 0) return texts.map(t => `ES:${t}`);
            throw new Error('the model ran out of memory');
        };
        const { project: next, report } = await run(flaky, project(), { batchSize: 1 });
        expect(report.translated).toBe(1);                       // the first batch survived
        expect(report.rejected.length).toBe(2);
        expect(report.rejected[0].reason).toContain('ran out of memory');
        expect(Object.keys((next as any).localization.strings)).toHaveLength(1);
    });

    it('names the line a translator can find, not just a key', async () => {
        const { report } = await rejectionFor(async texts => texts.map(() => ''));
        expect(report.rejected[0].where).toBe('Scene "Rooftop" · Mia');
        expect(report.rejected[0].source).toContain('I said');
    });
});

describe('long runs', () => {
    it('reports progress as it goes', async () => {
        const onProgress = vi.fn();
        await run(goodModel, project(), { batchSize: 1, onProgress });
        expect(onProgress).toHaveBeenCalledTimes(3);
        expect(onProgress).toHaveBeenLastCalledWith(3, 3);
    });

    it('🔴 stops when cancelled, and KEEPS what it already drafted', async () => {
        const signal = { aborted: false };
        const stopAfterOne: Translator = async texts => { signal.aborted = true; return texts.map(t => `ES:${t}`); };
        const { project: next, report } = await run(stopAfterOne, project(), { batchSize: 1, signal });

        expect(report.cancelled).toBe(true);
        expect(report.translated).toBe(1);
        expect(Object.keys((next as any).localization.strings)).toHaveLength(1);
    });

    it('sends lines to the model in batches', async () => {
        const batches: number[] = [];
        const counter: Translator = async texts => { batches.push(texts.length); return texts.map(t => `ES:${t}`); };
        await run(counter, project(), { batchSize: 2 });
        expect(batches).toEqual([2, 1]);
    });

    it('does nothing gracefully when there is nothing to translate', async () => {
        const translator = vi.fn();
        const p = project({
            'cmd:c1:text': { es: { text: 'a' } },
            'cmd:c2:text': { es: { text: 'b' } },
            'char:mia:name': { es: { text: 'c' } },
        });
        const { report } = await run(translator as any, p);
        expect(translator).not.toHaveBeenCalled();
        expect(report.skipped).toBe(3);
    });
});

describe('summarizeMachineTranslation', () => {
    it('says what happened in plain words', async () => {
        const { report } = await run(goodModel);
        expect(summarizeMachineTranslation(report)).toBe('3 lines drafted');
    });

    it('mentions the ones it would not touch', async () => {
        const { report } = await run(async texts => texts.map(() => ''));
        expect(summarizeMachineTranslation(report)).toContain('3 skipped as unsafe');
    });
});

describe('🔴 retrying a line whose placeholder the model mangled', () => {
    /* Brad drafted German and lost "It took {Clicks} pats and gave {Affection} affection" — the
     * model reformatted `%%0%%`, so a good translation was thrown away. Marker shapes fail for
     * different reasons, so a failed line is retried with the next shape before giving up. */

    /** Mangles `%%n%%` (the first shape) but carries `{n}` (the second) through untouched. */
    const fussyAboutPercent: Translator = async texts => texts.map(t =>
        /%%\d+%%/.test(t) ? `DE:${t.replace(/%%(\d+)%%/g, '%% $1 %%')}` : `DE:${t}`);

    it('recovers the line instead of dropping it', async () => {
        const { project: next, report } = await run(fussyAboutPercent);
        expect(report.rejected).toEqual([]);
        expect(report.recovered).toBe(1);                       // only the line with variables
        expect((next as any).localization.strings['cmd:c1:text'].es.text)
            .toBe('DE:I said [shake]NO[/shake], {Nickname}.');
    });

    it('keeps the codes intact in the recovered line', async () => {
        const { project: next } = await run(fussyAboutPercent);
        const text = (next as any).localization.strings['cmd:c1:text'].es.text;
        expect(text).toContain('[shake]');
        expect(text).toContain('{Nickname}');
    });

    it('does not waste a retry on a line with no codes at all', async () => {
        const calls: string[][] = [];
        const counting: Translator = async texts => { calls.push(texts); return texts.map(() => ''); };
        const { report } = await run(counting, project(), { batchSize: 16 });
        // 'It was quiet.' and the character name have no tokens, so they're rejected outright;
        // only the line with variables is worth asking about again.
        expect(report.recovered).toBe(0);
        expect(report.rejected.length).toBe(3);
        expect(calls.length).toBeLessThanOrEqual(1 + 3);         // one batch + at most the retries
    });

    it('gives up gracefully when no marker shape works', async () => {
        const hopeless: Translator = async texts => texts.map(t => t.replace(/[%{}<>\[\]]/g, ''));
        const { report } = await run(hopeless);
        expect(report.recovered).toBe(0);
        expect(report.rejected.find(r => r.key === 'cmd:c1:text')).toBeTruthy();
    });

    it('stops retrying once cancelled', async () => {
        const signal = { aborted: false };
        const mangleThenStop: Translator = async texts => {
            signal.aborted = true;
            return texts.map(t => t.replace(/%%(\d+)%%/g, '%% $1 %%'));
        };
        const { report } = await run(mangleThenStop, project(), { batchSize: 16, signal });
        expect(report.recovered).toBe(0);
    });
});

describe('🔴 marker styles must not collide with the line\'s own prose', () => {
    /* The engine deliberately renders literal bracketed digits ("press [3]") as text, and the
     * bracket marker style writes markers that look exactly like them. On such a line a
     * mis-restore could slip past the guard — a token substituted into the prose position.
     * The rule: a style whose markers can't round-trip on the UNSENT text is skipped for that
     * line, so the outcome is a clean draft via another style, or a rejection. Never corruption. */
    const trickyLine = 'Press [3] to wave at {Name}';
    const tricky = (): any => {
        const p = project();
        p.scenes.s1.commands = [{ id: 'c1', type: 'Dialogue', characterId: null, text: trickyLine }];
        p.characters = {};
        return p;
    };

    it('drafts the line through a non-colliding style when the model allows one', async () => {
        // Mangles %%n%% so the batch fails, but carries {n} through — the first retry style.
        const fussy: Translator = async texts => texts.map(t =>
            /%%\d+%%/.test(t) ? t.replace(/%%(\d+)%%/g, '%% $1 %%') : `ES:${t}`);
        const { project: next, report } = await run(fussy, tricky());
        expect(report.rejected).toEqual([]);
        const text = (next as any).localization.strings['cmd:c1:text'].es.text;
        expect(text).toContain('{Name}');
        expect(text).toContain('[3]');                     // the prose survived untouched
    });

    it('🔴 rejects rather than corrupts when only the colliding style would "work"', async () => {
        // Mangles %%, {}, and <> markers; would echo [n] markers back fine — but that style
        // collides with the literal [3] in the prose, so it must be skipped, not trusted.
        const bracketOnly: Translator = async texts => texts.map(t => t
            .replace(/%%(\d+)%%/g, '%% $1 %%')
            .replace(/\{(\d+)\}/g, '{ $1 }')
            .replace(/<(\d+)>/g, '< $1 >'));
        const { project: next, report } = await run(bracketOnly, tricky());
        expect((next as any).localization.strings['cmd:c1:text']).toBeUndefined();
        expect(report.rejected).toHaveLength(1);
    });
});
