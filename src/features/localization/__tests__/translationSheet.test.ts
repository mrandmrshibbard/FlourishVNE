/**
 * The translator round trip, end to end.
 *
 * The block that matters most is "a translator's spreadsheet habits": rows reordered, an extra
 * column of their own notes, a deleted row, a blank left for later. All of that is normal, none of
 * it may break the import — which is why matching is on the key column and nothing else. The
 * previous importer matched on position and fell apart on the first of these.
 */
import { describe, it, expect } from 'vitest';
import {
    buildTranslationSheets, buildTranslationCsv, readTranslationSheets, readTranslationCsv,
    summarizeImport, KEY_HEADER, SOURCE_HEADER,
} from '../translationSheet';
import { applyTranslations, applyImportResult, languageProgress, hashSource, orphanedKeys } from '../store';
import { parseCsv } from '../tabular';

const project = (): any => ({
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
    items: {}, itemCollections: {}, uiScreens: {}, commonEvents: {},
});

const opts = { languageCode: 'es', languageName: 'Español' };
const sheetsFor = (p: any = project(), o: any = opts) => buildTranslationSheets(p, o);
/** The sheet a translator sends back, with `answers` typed into the target column by key. */
const filled = (p: any, answers: Record<string, string>) =>
    sheetsFor(p).map(s => ({
        ...s,
        rows: s.rows.map((row, i) => i === 0 ? row : [row[0], row[1], row[2], answers[row[0]] ?? row[3], row[4]]),
    }));

describe('the exported workbook', () => {
    it('groups by part of the game, so a translator can keep a scene consistent', () => {
        expect(sheetsFor().map(s => s.name)).toEqual(['Dialogue', 'Choices', 'Characters']);
    });

    it('carries the key, the context, the original and an empty column to type in', () => {
        const dialogue = sheetsFor()[0];
        expect(dialogue.rows[0]).toEqual([KEY_HEADER, 'Where it appears', SOURCE_HEADER, 'Español (es)', 'Notes']);
        expect(dialogue.rows[1][0]).toBe('cmd:c1:text');
        expect(dialogue.rows[1][1]).toBe('Scene "Rooftop" · Mia');
        expect(dialogue.rows[1][2]).toBe('I said [shake]NO[/shake], {Nickname}.');
        expect(dialogue.rows[1][3]).toBe('');
    });

    it('🔴 tells the translator which bits are code — the thing no other tool does', () => {
        const [withCodes, plain] = sheetsFor()[0].rows.slice(1);
        expect(withCodes[4]).toContain('Keep {Nickname} exactly');
        expect(withCodes[4]).toContain('[shake]');
        expect(plain[4]).toBe('');            // ordinary lines stay quiet
    });

    it('hides the key column, locks everything but the target, and freezes the header', () => {
        const layout = sheetsFor()[0].layout!;
        expect(layout.hiddenColumns).toEqual([0]);
        expect(layout.editableColumns).toEqual([3]);
        expect(layout.protect).toBe(true);
        expect(layout.freezeRows).toBe(1);
    });

    it('shows a returning translator their previous work', () => {
        const existing = { 'cmd:c1:text': { es: { text: 'Dije [shake]NO[/shake], {Nickname}.' } } };
        expect(buildTranslationSheets(project(), { ...opts, existing })[0].rows[1][3])
            .toBe('Dije [shake]NO[/shake], {Nickname}.');
    });

    it('can leave out what is already done', () => {
        const existing = { 'cmd:c1:text': { es: { text: 'ya hecho' } } };
        const keys = buildTranslationSheets(project(), { ...opts, existing, onlyUntranslated: true })
            .flatMap(s => s.rows.slice(1)).map(r => r[0]);
        expect(keys).not.toContain('cmd:c1:text');
        expect(keys).toContain('cmd:c2:text');
    });

    it('offers the same content as one CSV, with the group as a column', () => {
        const rows = parseCsv(buildTranslationCsv(project(), opts));
        expect(rows[0]).toEqual([KEY_HEADER, 'Part of the game', 'Where it appears', SOURCE_HEADER, 'Español (es)', 'Notes']);
        expect(rows.find(r => r[0] === 'cmd:c3:option:o1:text')![1]).toBe('Choices');
    });
});

describe('import — a translator’s spreadsheet habits must not break anything', () => {
    const answers = {
        'cmd:c1:text': 'Dije [shake]NO[/shake], {Nickname}.',
        'cmd:c2:text': 'Todo estaba en silencio.',
        'char:mia:name': 'Mía',
    };

    it('brings back every translated line', () => {
        const r = readTranslationSheets(project(), filled(project(), answers), { languageCode: 'es' });
        expect(r.counts.changed).toBe(3);
        expect(r.counts.refused).toBe(0);
        expect(r.changes.find(c => c.key === 'char:mia:name')!.after).toBe('Mía');
    });

    it('🔴 survives reordered rows, an extra column, and a deleted row', () => {
        const sheets = filled(project(), answers).map(s => ({
            ...s,
            rows: [
                [...s.rows[0], 'My own notes'],
                ...s.rows.slice(1).reverse().map(r => [...r, 'translator scribble']),
            ],
        }));
        sheets[0].rows.splice(1, 1);                       // they deleted a row they'd finished
        const r = readTranslationSheets(project(), sheets, { languageCode: 'es' });
        expect(r.issues.filter(i => i.blocking)).toEqual([]);
        expect(r.changes.map(c => c.key)).toContain('char:mia:name');
    });

    it('treats a blank cell as "not done yet", not an error', () => {
        const r = readTranslationSheets(project(), filled(project(), { 'cmd:c1:text': answers['cmd:c1:text'] }), { languageCode: 'es' });
        expect(r.counts.blank).toBe(4);        // 5 translatable lines, 1 filled in
        expect(r.counts.changed).toBe(1);
        expect(r.issues.filter(i => i.blocking)).toEqual([]);
    });

    it('reports a line that no longer exists instead of applying it somewhere random', () => {
        const sheets = filled(project(), answers);
        sheets[0].rows.push(['cmd:deleted:text', 'Scene "Gone"', 'Old line', 'Línea vieja', '']);
        const r = readTranslationSheets(project(), sheets, { languageCode: 'es' });
        expect(r.counts.refused).toBe(1);
        expect(r.issues[0].kind).toBe('unknown-key');
        expect(r.changes.some(c => c.key === 'cmd:deleted:text')).toBe(false);
    });

    it('🔴 REFUSES a row whose codes were translated, and says how to fix it', () => {
        const r = readTranslationSheets(project(), filled(project(), {
            'cmd:c1:text': 'Dije [sacudir]NO[/sacudir], {Apodo}.',
        }), { languageCode: 'es' });
        expect(r.counts.refused).toBe(1);
        expect(r.changes).toEqual([]);
        const issue = r.issues.find(i => i.kind === 'token-mismatch')!;
        expect(issue.blocking).toBe(true);
        expect(issue.message).toContain('{Nickname}');
        expect(issue.row).toBe(2);                          // the row number they see in Excel
    });

    it('flags a translation made from an out-of-date original, but still brings it in', () => {
        const sheets = filled(project(), answers);
        const p = project();
        p.scenes.s1.commands[1].text = 'It was quiet. Too quiet.';     // author edited after export
        const r = readTranslationSheets(p, sheets, { languageCode: 'es' });
        const issue = r.issues.find(i => i.kind === 'stale-source')!;
        expect(issue.blocking).toBe(false);
        expect(r.changes.find(c => c.key === 'cmd:c2:text')!.stale).toBe(true);
    });

    it('does not report work that was already imported', () => {
        const existing = { 'cmd:c1:text': { es: { text: answers['cmd:c1:text'] } } };
        const r = readTranslationSheets(project(), filled(project(), answers), { languageCode: 'es', existing });
        expect(r.counts.unchanged).toBe(1);
        expect(r.counts.changed).toBe(2);
    });

    it('undoes an editor’s smart quotes only when the original used straight ones', () => {
        const p = project();
        p.scenes.s1.commands[1].text = 'She said "no".';
        const r = readTranslationSheets(p, filled(p, { 'cmd:c2:text': 'Ella dijo “no”.' }), { languageCode: 'es' });
        expect(r.changes[0].after).toBe('Ella dijo "no".');
    });

    it('leaves curly quotes alone when the original had them', () => {
        const p = project();
        p.scenes.s1.commands[1].text = 'She said “no”.';
        const r = readTranslationSheets(p, filled(p, { 'cmd:c2:text': 'Ella dijo “no”.' }), { languageCode: 'es' });
        expect(r.changes[0].after).toBe('Ella dijo “no”.');
    });

    it('says plainly when a tab is not one of ours, rather than importing nonsense', () => {
        const r = readTranslationSheets(project(), [{ name: 'Budget', rows: [['Item', 'Cost'], ['Coffee', '3']] }], { languageCode: 'es' });
        expect(r.issues[0].kind).toBe('no-key-column');
        expect(r.changes).toEqual([]);
    });

    it('finds the target column even if the translator retitles it', () => {
        const sheets = filled(project(), answers);
        sheets[0].rows[0][3] = 'Spanish translation';       // no language code in the heading
        const r = readTranslationSheets(project(), sheets, { languageCode: 'es' });
        expect(r.changes.length).toBeGreaterThan(0);
    });

    it('round-trips through the CSV form too', () => {
        const csv = buildTranslationCsv(project(), opts)
            .replace('I said [shake]NO[/shake], {Nickname}.",', 'I said [shake]NO[/shake], {Nickname}.","Dije [shake]NO[/shake], {Nickname}.",');
        const r = readTranslationCsv(project(), csv, { languageCode: 'es' });
        expect(r.issues.filter(i => i.blocking)).toEqual([]);
    });

    it('summarises in words an author can act on', () => {
        const sheets = filled(project(), answers);
        sheets[0].rows.push(['cmd:gone:text', 'x', 'y', 'z', '']);
        const r = readTranslationSheets(project(), sheets, { languageCode: 'es' });
        expect(summarizeImport(r)).toContain('3 lines updated');
        expect(summarizeImport(r)).toContain('1 needing attention');
    });
});

describe('storing what was imported', () => {
    const answers = { 'cmd:c1:text': 'Dije [shake]NO[/shake], {Nickname}.', 'cmd:c2:text': 'Silencio.' };

    it('writes translations into the project without touching the story text', () => {
        const p = project();
        const result = readTranslationSheets(p, filled(p, answers), { languageCode: 'es' });
        const next: any = applyImportResult(p, result);
        expect(next.localization.strings['cmd:c1:text'].es.text).toBe(answers['cmd:c1:text']);
        expect(next.scenes.s1.commands[0].text).toBe('I said [shake]NO[/shake], {Nickname}.');
        expect(p.localization).toBeUndefined();             // original untouched
    });

    it('records the source it was translated from, so a later edit makes it stale', () => {
        const p = project();
        const next: any = applyImportResult(p, readTranslationSheets(p, filled(p, answers), { languageCode: 'es' }));
        expect(next.localization.strings['cmd:c1:text'].es.sourceHash)
            .toBe(hashSource('I said [shake]NO[/shake], {Nickname}.'));
        next.scenes.s1.commands[0].text = 'Rewritten entirely.';
        expect(languageProgress(next, 'es').stale).toBe(1);
    });

    it('🔴 a stale import lands already marked for review, not looking freshly checked', () => {
        const p = project();
        const sheets = filled(p, answers);
        p.scenes.s1.commands[1].text = 'It was quiet. Too quiet.';
        const next: any = applyImportResult(p, readTranslationSheets(p, sheets, { languageCode: 'es' }));
        const entry = next.localization.strings['cmd:c2:text'].es;
        expect(entry.needsReview).toBe(true);
        // It stores the hash of what the translator SAW, not of the line as it now reads — so the
        // workspace reports it stale immediately instead of vouching for it.
        expect(entry.sourceHash).toBe(hashSource('It was quiet.'));
        expect(entry.sourceHash).not.toBe(hashSource('It was quiet. Too quiet.'));
        expect(languageProgress(next, 'es').stale).toBe(1);
    });

    it('marks machine drafts for review', () => {
        const next: any = applyTranslations(project(), [
            { key: 'cmd:c2:text', where: '', source: 'It was quiet.', before: '', after: 'Estaba tranquilo.', stale: false, translatedFrom: 'It was quiet.' },
        ], { language: 'es', origin: 'machine' });
        expect(next.localization.strings['cmd:c2:text'].es.origin).toBe('machine');
        expect(next.localization.strings['cmd:c2:text'].es.needsReview).toBe(true);
    });

    it('counts progress against the story, so it can never exceed 100%', () => {
        const p = project();
        let next: any = applyImportResult(p, readTranslationSheets(p, filled(p, answers), { languageCode: 'es' }));
        const progress = languageProgress(next, 'es');
        expect(progress.total).toBe(5);
        expect(progress.translated).toBe(2);
        expect(progress.percent).toBe(40);

        // Even with translations left over from deleted lines, the percentage stays honest.
        next.localization.strings['cmd:deleted:text'] = { es: { text: 'huérfano' } };
        expect(languageProgress(next, 'es').percent).toBe(40);
        expect(orphanedKeys(next)).toEqual(['cmd:deleted:text']);
    });
});
