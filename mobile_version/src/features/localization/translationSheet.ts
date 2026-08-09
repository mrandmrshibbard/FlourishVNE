/**
 * The translator hand-off: project → spreadsheet → project.
 *
 * The design goal is that a translator who has never heard of this engine can open the file, type
 * in one column, save, and send it back — and that nothing they do can quietly corrupt the game.
 * Ren'Py hands over `.rpy` script files (so a non-technical translator needs a developer); Visual
 * Novel Maker hands over a bare CSV with no guidance. Neither tells the translator which bits of a
 * line are code. That's what the Notes column and the import validator are for.
 *
 * Two rules the rest of this file follows:
 *   1. **Import matches on KEY only.** Row order, extra columns, extra sheets, deleted rows,
 *      renamed tabs — all fine. A translator's spreadsheet habits can't break the mapping.
 *   2. **Nothing invalid is applied, and nothing is skipped silently.** Every row that doesn't
 *      make it into the project appears in the report with a reason a non-coder can act on.
 */
import { VNProject } from '../../types/project';
import { collectTranslatableText, TextSite } from './walkTranslatable';
import { TranslationGroup } from './translationKeys';
import { compareTokens, describeTokens, explainMismatch } from './tokenGuard';
import { Rows, Sheet, sanitizeSheetName, writeCsv, parseCsv } from './tabular';

/* ── Sheet shape ─────────────────────────────────────────────────────────────────────────────
 * Column ORDER is part of the file's contract with a translator, but import never relies on it:
 * it reads the header row to find the columns, so a translator who inserts a column of their own
 * notes (a normal thing to do) doesn't break anything. */
export const KEY_HEADER = 'Key';
export const WHERE_HEADER = 'Where it appears';
export const SOURCE_HEADER = 'Original';
export const NOTES_HEADER = 'Notes';
/** The group is written on the single-sheet CSV, which has no tabs to carry it. */
export const GROUP_HEADER = 'Part of the game';

const COLUMN_WIDTHS = { 1: 30, 2: 60, 3: 60, 4: 34 };

export interface BuildSheetOptions {
    /** The language being translated INTO — its column is the only writable one. */
    languageCode: string;
    /** Column heading, in the translator's own language where we have it ("Español"). */
    languageName?: string;
    /** Existing translations, so a returning translator sees their previous work. */
    existing?: Record<string, Record<string, { text: string }>>;
    /** Leave out rows that already have a translation. */
    onlyUntranslated?: boolean;
}

const targetHeader = (o: BuildSheetOptions) => o.languageName ? `${o.languageName} (${o.languageCode})` : o.languageCode;

const rowFor = (site: TextSite, o: BuildSheetOptions): string[] => [
    site.key,
    site.where,
    site.value,
    o.existing?.[site.key]?.[o.languageCode]?.text || '',
    describeTokens(site.value),
];

const wanted = (site: TextSite, o: BuildSheetOptions): boolean =>
    !o.onlyUntranslated || !o.existing?.[site.key]?.[o.languageCode]?.text;

/**
 * One sheet per part of the game, so a translator can see a scene's dialogue together and pick a
 * consistent tone — the context Ren'Py's per-file `.rpy` dump destroys.
 */
export function buildTranslationSheets(project: VNProject, options: BuildSheetOptions): Sheet[] {
    const grouped = new Map<TranslationGroup, Rows>();
    for (const site of collectTranslatableText(project)) {
        if (!wanted(site, options)) continue;
        if (!grouped.has(site.group)) grouped.set(site.group, []);
        grouped.get(site.group)!.push(rowFor(site, options));
    }

    const header = [KEY_HEADER, WHERE_HEADER, SOURCE_HEADER, targetHeader(options), NOTES_HEADER];
    const taken = new Set<string>();
    return [...grouped.entries()].map(([group, rows]) => ({
        name: sanitizeSheetName(group, taken),
        rows: [header, ...rows],
        layout: {
            hiddenColumns: [0],              // the key: needed on import, meaningless to a human
            columnWidths: COLUMN_WIDTHS,
            editableColumns: [3],            // the ONLY column that accepts typing
            protect: true,
            freezeRows: 1,
        },
    }));
}

/**
 * The same content as one CSV, for translators (or tools) that would rather have a flat file.
 * Groups become a column here, since a CSV has no tabs.
 */
export function buildTranslationCsv(project: VNProject, options: BuildSheetOptions): string {
    const header = [KEY_HEADER, GROUP_HEADER, WHERE_HEADER, SOURCE_HEADER, targetHeader(options), NOTES_HEADER];
    const rows: Rows = [header];
    for (const site of collectTranslatableText(project)) {
        if (!wanted(site, options)) continue;
        const [key, where, source, existing, notes] = rowFor(site, options);
        rows.push([key, site.group, where, source, existing, notes]);
    }
    return writeCsv(rows);
}

/* ── Import ──────────────────────────────────────────────────────────────────────────────── */

export type IssueKind =
    | 'unknown-key'      // the line no longer exists (deleted or from another project)
    | 'token-mismatch'   // {Variable}/[code] set differs from the source — REFUSED
    | 'stale-source'     // the English changed after this file was exported
    | 'no-key-column'    // the sheet isn't one of ours
    | 'no-target-column';

export interface ImportIssue {
    kind: IssueKind;
    /** Blocked rows are never applied; the rest are advisory and DO apply. */
    blocking: boolean;
    sheet: string;
    /** 1-based, matching what the translator sees in their spreadsheet. */
    row: number;
    key?: string;
    /** Written for the author, not the developer. */
    message: string;
}

export interface ImportChange {
    key: string;
    where: string;
    /** The CURRENT source text in the project. */
    source: string;
    /** The previous TRANSLATION, for the review diff ('' when this is the first one). */
    before: string;
    after: string;
    /** True when the file was exported before the English was last edited. */
    stale: boolean;
    /** The source text as it appeared in the returned sheet — what the translator actually worked
     *  from. Differs from `source` exactly when `stale`, and it's the one that must be hashed:
     *  storing the CURRENT hash on a stale row would make it look freshly checked. */
    translatedFrom: string;
}

export interface ImportResult {
    language: string;
    /** Ready to apply — or to show first, if the author asked to review. */
    changes: ImportChange[];
    issues: ImportIssue[];
    counts: {
        rowsRead: number;
        /** Rows whose translation is new or different. */
        changed: number;
        /** Rows that matched but were already identical — nothing to do. */
        unchanged: number;
        /** Rows the translator left blank. Not an error; they simply aren't done yet. */
        blank: number;
        refused: number;
    };
}

const headerIndex = (header: string[], name: string): number =>
    header.findIndex(h => (h || '').trim().toLowerCase() === name.toLowerCase());

/**
 * A translator's editor may "helpfully" convert straight quotes to curly ones. Undo that only when
 * the source used straight quotes — if the source is curly, or the language genuinely uses these
 * marks, we leave the translator's text exactly as typed.
 */
const unsmarten = (text: string, source: string): string => {
    if (/[“”‘’]/.test(source)) return text;
    let out = text;
    if (source.includes('"')) out = out.replace(/[“”]/g, '"');
    if (source.includes("'")) out = out.replace(/[‘’]/g, "'");
    return out;
};

export interface ReadOptions {
    languageCode: string;
    /** Current translations, to tell a real change from a no-op. */
    existing?: Record<string, Record<string, { text: string }>>;
}

/**
 * Validate a returned workbook against the project. Applies nothing — it produces the change list
 * and the report, so the caller can either apply straight away or show the review view first.
 */
export function readTranslationSheets(project: VNProject, sheets: Sheet[], options: ReadOptions): ImportResult {
    const sites = new Map<string, TextSite>();
    for (const site of collectTranslatableText(project)) sites.set(site.key, site);

    const changes: ImportChange[] = [];
    const issues: ImportIssue[] = [];
    const counts = { rowsRead: 0, changed: 0, unchanged: 0, blank: 0, refused: 0 };

    for (const sheet of sheets) {
        const [header, ...body] = sheet.rows || [];
        if (!header) continue;

        const keyAt = headerIndex(header, KEY_HEADER);
        if (keyAt < 0) {
            issues.push({
                kind: 'no-key-column', blocking: true, sheet: sheet.name, row: 1,
                message: `The "${sheet.name}" tab has no ${KEY_HEADER} column, so there's no way to tell which lines it belongs to. It was skipped — re-export and translate the new file.`,
            });
            continue;
        }

        // The target column is found by its language code; falling back to "the column after the
        // original" keeps working when a translator retitles the header, which they do.
        const sourceAt = headerIndex(header, SOURCE_HEADER);
        let targetAt = header.findIndex(h => (h || '').toLowerCase().includes(options.languageCode.toLowerCase()));
        if (targetAt < 0 && sourceAt >= 0) targetAt = sourceAt + 1;
        if (targetAt < 0 || targetAt === keyAt) {
            issues.push({
                kind: 'no-target-column', blocking: true, sheet: sheet.name, row: 1,
                message: `Couldn't find the ${options.languageCode} column on the "${sheet.name}" tab. Its heading needs to contain "${options.languageCode}".`,
            });
            continue;
        }

        body.forEach((row, i) => {
            const rowNumber = i + 2;                       // +1 for the header, +1 for 1-based
            const key = (row[keyAt] || '').trim();
            if (!key) return;                              // a spacer row; translators add them
            counts.rowsRead++;

            const site = sites.get(key);
            if (!site) {
                counts.refused++;
                issues.push({
                    kind: 'unknown-key', blocking: true, sheet: sheet.name, row: rowNumber, key,
                    message: `This line no longer exists in the story, so its translation has nowhere to go. It was probably deleted after the file was sent out.`,
                });
                return;
            }

            const translation = unsmarten((row[targetAt] ?? '').trim(), site.value);
            if (!translation) { counts.blank++; return; }

            const tokens = compareTokens(site.value, translation);
            if (!tokens.ok) {
                counts.refused++;
                issues.push({
                    kind: 'token-mismatch', blocking: true, sheet: sheet.name, row: rowNumber, key,
                    message: explainMismatch(tokens),
                });
                return;
            }

            // The source cell is what they actually translated from. If the story has moved on,
            // their work still applies, but it's flagged rather than trusted.
            const sheetSource = sourceAt >= 0 ? (row[sourceAt] ?? '') : site.value;
            const stale = sourceAt >= 0 && sheetSource.trim() !== '' && sheetSource !== site.value;
            if (stale) {
                issues.push({
                    kind: 'stale-source', blocking: false, sheet: sheet.name, row: rowNumber, key,
                    message: `The original line changed after this file was sent out, so this translation is of the older wording. It was brought in and marked "needs review".`,
                });
            }

            const before = options.existing?.[key]?.[options.languageCode]?.text || '';
            if (before === translation) { counts.unchanged++; return; }

            counts.changed++;
            changes.push({
                key, where: site.where, source: site.value, before, after: translation, stale,
                translatedFrom: stale ? sheetSource : site.value,
            });
        });
    }

    return { language: options.languageCode, changes, issues, counts };
}

/** Read a returned CSV as a single sheet. The group column is ignored — the key carries meaning. */
export function readTranslationCsv(project: VNProject, csv: string, options: ReadOptions): ImportResult {
    return readTranslationSheets(project, [{ name: 'Translations', rows: parseCsv(csv) }], options);
}

/**
 * A short, human summary for the top of the report. Deliberately plain: an author reading this has
 * just been handed a file back by someone else and wants to know whether it went in.
 */
export function summarizeImport(result: ImportResult): string {
    const { changed, blank, refused, unchanged } = result.counts;
    const parts = [`${changed} ${changed === 1 ? 'line' : 'lines'} updated`];
    if (unchanged) parts.push(`${unchanged} already up to date`);
    if (blank) parts.push(`${blank} not translated yet`);
    if (refused) parts.push(`${refused} needing attention`);
    return parts.join(' · ');
}
