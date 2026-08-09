/**
 * Spreadsheet read/write for the translator hand-off. Pure — no DOM, no project types — so the
 * awkward cases can all be pinned by unit tests.
 *
 * 🔴 Why this exists: the previous CSV importer did
 *
 *     const lines = csvContent.split('\n').filter(l => l.trim());
 *     const headers = this.parseCSVLine(lines[0]);
 *
 * — it split on newlines BEFORE the quote-aware parser ever ran. A line of dialogue containing a
 * line break (perfectly ordinary in a visual novel) was torn into two rows, and every column
 * after it silently misaligned. It also never handled CRLF, so a file round-tripped through a
 * Windows translator carried a trailing \r on the last column of every row, and it emitted no
 * UTF-8 BOM, so Excel guessed the encoding and mangled Japanese, Cyrillic and Arabic.
 *
 * The fix is a single pass over the WHOLE document that knows where it is — never line-split.
 */

/** A parsed sheet: rows of cells, first row conventionally the header. */
export type Rows = string[][];

const BOM = '﻿';

/**
 * Line breaks INSIDE a cell come back however the editing tool felt like writing them — verified
 * against real Excel, which rewrites a `\n` we wrote as `\r\n` when it saves. Without this, every
 * multi-line line of dialogue would look edited on re-import and be reported as a change the
 * translator never made. Spreadsheet cells carry no meaning that distinguishes the two, so
 * normalising to `\n` is safe and keeps a round-trip byte-identical.
 */
const normalizeCellText = (value: string): string => value.replace(/\r\n?/g, '\n');

/* ── CSV ─────────────────────────────────────────────────────────────────────────────────── */

/** Quote when the value could otherwise change meaning — or be silently trimmed by a spreadsheet. */
const needsQuoting = (value: string): boolean =>
    value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')
    || value !== value.trim();

const quote = (value: string): string =>
    needsQuoting(value) ? `"${value.replace(/"/g, '""')}"` : value;

export interface WriteCsvOptions {
    /** Excel guesses the encoding without this and mangles non-Latin text. On by default. */
    bom?: boolean;
    /** CRLF is what Excel expects; RFC-4180 specifies it. On by default. */
    crlf?: boolean;
}

export function writeCsv(rows: Rows, options: WriteCsvOptions = {}): string {
    const eol = options.crlf === false ? '\n' : '\r\n';
    const body = rows.map(row => row.map(cell => quote(cell ?? '')).join(',')).join(eol);
    // A trailing newline is conventional and harmless — parseCsv does not turn it into a row.
    return (options.bom === false ? '' : BOM) + body + (rows.length ? eol : '');
}

/**
 * Parse a whole CSV document. Handles quoted fields containing commas, quotes (`""`) and
 * newlines; CRLF, LF and lone-CR line endings; a leading BOM; and a trailing newline.
 *
 * Deliberately forgiving about malformed input rather than throwing: a translator's file that is
 * slightly off should still yield rows we can validate and report on, not an exception that
 * tells them nothing. An unterminated quoted field simply runs to the end of the document.
 */
export function parseCsv(text: string): Rows {
    if (!text) return [];
    let src = text.startsWith(BOM) ? text.slice(1) : text;

    const rows: Rows = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let fieldWasQuoted = false;

    const endField = () => { row.push(normalizeCellText(field)); field = ''; fieldWasQuoted = false; };
    const endRow = () => { endField(); rows.push(row); row = []; };

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];

        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') { field += '"'; i++; }   // escaped quote
                else inQuotes = false;                            // closing quote
            } else {
                field += ch;                                      // newlines land here, intact
            }
            continue;
        }

        if (ch === '"' && field === '') { inQuotes = true; fieldWasQuoted = true; continue; }
        if (ch === ',') { endField(); continue; }
        if (ch === '\r') {
            // CRLF counts once; a lone CR (classic Mac) is also a row break.
            if (src[i + 1] === '\n') i++;
            endRow();
            continue;
        }
        if (ch === '\n') { endRow(); continue; }
        field += ch;
    }

    // Trailing newline: don't invent a phantom row. Anything else in flight is a real last row.
    if (inQuotes || field !== '' || fieldWasQuoted || row.length > 0) endRow();

    return rows;
}

/* ── XLSX ────────────────────────────────────────────────────────────────────────────────── */

/**
 * How a sheet presents itself when a translator opens it.
 *
 * This is the difference between "here is a CSV of your script, good luck" — what Ren'Py and
 * Visual Novel Maker hand over — and a file where the only cells that accept typing are the ones
 * meant to be typed in. All of it is cosmetic: a reader that ignores every field still gets the
 * same values, so a translator on a tool that doesn't honour protection loses nothing but guard
 * rails, and import validates regardless.
 */
export interface SheetLayout {
    /** 0-based columns to hide (the key column — needed on import, meaningless to a human). */
    hiddenColumns?: number[];
    /** 0-based column → width in characters. */
    columnWidths?: Record<number, number>;
    /** 0-based columns that stay typeable when `protect` is on. Everything else locks. */
    editableColumns?: number[];
    /** Lock every cell except `editableColumns`. No password — this is a guard rail, not security,
     *  and a translator who needs to override it can turn protection off in one click. */
    protect?: boolean;
    /** Freeze the first N rows so the header stays visible while scrolling a long script. */
    freezeRows?: number;
}

/** One worksheet. `name` becomes the tab label. */
export interface Sheet {
    name: string;
    rows: Rows;
    layout?: SheetLayout;
}

/** Excel rejects these in sheet names, and silently truncates past 31 characters. */
export function sanitizeSheetName(name: string, taken: Set<string> = new Set()): string {
    let clean = (name || 'Sheet').replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
    if (!taken.has(clean)) { taken.add(clean); return clean; }
    for (let n = 2; ; n++) {
        const suffix = ` (${n})`;
        const candidate = clean.slice(0, 31 - suffix.length) + suffix;
        if (!taken.has(candidate)) { taken.add(candidate); return candidate; }
    }
}

const xmlEscape = (s: string): string => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // Excel refuses to open a file containing raw control characters.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

/** 0-based column index → spreadsheet letters (0 → A, 25 → Z, 26 → AA). */
export function columnName(index: number): string {
    let n = index, out = '';
    do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return out;
}

/**
 * Build a minimal .xlsx (a zip of XML) using JSZip, which is already a dependency — no new
 * package for a feature that only needs a handful of columns of text.
 *
 * Every cell is written as an INLINE string (`t="inlineStr"`) rather than via the shared-strings
 * table: it makes the file bigger, but it removes an entire class of index-mismatch bug and it
 * is what keeps the writer this short. Excel, LibreOffice and Google Sheets all read it.
 */
export async function writeXlsx(sheets: Sheet[], JSZipCtor: any): Promise<Uint8Array> {
    const zip = new JSZipCtor();
    const taken = new Set<string>();
    const named = sheets.map(s => ({ ...s, name: sanitizeSheetName(s.name, taken) }));

    zip.file('[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        `</Types>`);

    zip.file('_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`);

    zip.file('xl/workbook.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>` +
        named.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        `</sheets></workbook>`);

    zip.file('xl/_rels/workbook.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`);

    /* Two cell formats, which is all the protection story needs: every cell is locked by default
     * in the OOXML model, so `s="1"` is the UNLOCKED one we stamp on the translator's column.
     * `s="2"` is the same thing plus wrapped text, for the columns holding whole lines. */
    zip.file('xl/styles.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="4">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +                                                        // 0 locked
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="0"/></xf>` +        // 1 unlocked
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>` +  // 2 locked + wrap
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +                                          // 3 header (bold)
        `</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`);

    named.forEach((sheet, si) => {
        const layout = sheet.layout || {};
        const editable = new Set(layout.editableColumns || []);
        const hidden = new Set(layout.hiddenColumns || []);
        const widths = layout.columnWidths || {};

        const rowsXml = sheet.rows.map((row, ri) => {
            const cells = row.map((cell, ci) => {
                const value = cell ?? '';
                // 3 = bold header · 1 = unlocked (the translator's column) · 2 = locked + wrapped.
                const style = ri === 0 ? 3 : editable.has(ci) ? 1 : 2;
                // 🔴 An empty cell in the TRANSLATOR's column still has to be written. Omitting it
                // (the obvious optimisation, and what this did at first) leaves it with the default
                // format — which is locked — so on a protected sheet the one column the translator
                // is supposed to type in would reject typing. Every other empty cell is skipped.
                if (value === '') return editable.has(ci) ? `<c r="${columnName(ci)}${ri + 1}" s="${style}"/>` : '';
                return `<c r="${columnName(ci)}${ri + 1}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
            }).join('');
            return `<row r="${ri + 1}">${cells}</row>`;
        }).join('');

        // ⚠ OOXML fixes the order of these elements: sheetViews → cols → sheetData →
        // sheetProtection. Out of order, Excel calls the whole file unreadable.
        const freeze = layout.freezeRows
            ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${layout.freezeRows}" topLeftCell="A${layout.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
            : '';

        // Editable columns are listed too, carrying the unlocked style at COLUMN level — that way
        // the rows below the data stay typeable, so a translator can add notes at the bottom.
        const colIndexes = new Set<number>([...hidden, ...editable, ...Object.keys(widths).map(Number)]);
        const cols = colIndexes.size
            ? `<cols>${[...colIndexes].sort((a, b) => a - b).map(ci =>
                `<col min="${ci + 1}" max="${ci + 1}"${hidden.has(ci) ? ' hidden="1"' : ''}` +
                `${widths[ci] ? ` width="${widths[ci]}" customWidth="1"` : ''}` +
                `${editable.has(ci) ? ' style="1"' : ''}/>`).join('')}</cols>`
            : '';

        // `sheet="1"` turns protection on; the rest allow the things a translator legitimately does
        // (sort, filter, resize) while keeping locked cells locked.
        const protection = layout.protect
            ? `<sheetProtection sheet="1" objects="1" scenarios="1" formatColumns="0" formatRows="0" sort="0" autoFilter="0"/>`
            : '';

        zip.file(`xl/worksheets/sheet${si + 1}.xml`,
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
            `${freeze}${cols}<sheetData>${rowsXml}</sheetData>${protection}</worksheet>`);
    });

    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** `A12` → { col: 0, row: 11 }. Returns null for anything unexpected. */
function parseCellRef(ref: string): { col: number; row: number } | null {
    const m = /^([A-Z]+)(\d+)$/.exec(ref || '');
    if (!m) return null;
    let col = 0;
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    return { col: col - 1, row: parseInt(m[2], 10) - 1 };
}

const xmlUnescape = (s: string): string => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');    // last, so "&amp;lt;" survives as "&lt;"

/** Concatenate the `<t>` runs inside a shared-string or inline-string element. */
function textRuns(xml: string): string {
    let out = '';
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
    for (let m = re.exec(xml); m; m = re.exec(xml)) out += xmlUnescape(m[1] ?? '');
    return normalizeCellText(out);
}

/**
 * Read a .xlsx well enough to recover what a translator typed. Handles both storage forms real
 * tools emit: the shared-strings table (Excel, LibreOffice) and inline strings (what we write,
 * and what some exporters produce). Formulas are ignored in favour of their cached value.
 *
 * Throws on anything it cannot make sense of — the caller's answer to that is "re-save it as
 * CSV and try again", which always works, rather than importing a half-read file.
 */
export async function parseXlsx(bytes: Uint8Array, JSZipCtor: any): Promise<Sheet[]> {
    const zip = await JSZipCtor.loadAsync(bytes);

    const sharedFile = zip.file('xl/sharedStrings.xml');
    const shared: string[] = [];
    if (sharedFile) {
        const xml = await sharedFile.async('string');
        const re = /<si\b[\s\S]*?<\/si>|<si\b[^>]*\/>/g;
        for (let m = re.exec(xml); m; m = re.exec(xml)) shared.push(textRuns(m[0]));
    }

    // Sheet order and tab names come from the workbook; the rels map r:id → the actual part.
    const workbookFile = zip.file('xl/workbook.xml');
    if (!workbookFile) throw new Error('Not a spreadsheet: xl/workbook.xml is missing.');
    const workbookXml = await workbookFile.async('string');
    const relsFile = zip.file('xl/_rels/workbook.xml.rels');
    const relsXml = relsFile ? await relsFile.async('string') : '';
    const relTarget = new Map<string, string>();
    for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
        relTarget.set(m[1], m[2].replace(/^\/?xl\//, '').replace(/^\//, ''));
    }

    const sheets: Sheet[] = [];
    const sheetTags = [...workbookXml.matchAll(/<sheet\b[^>]*\/>|<sheet\b[^>]*>/g)].map(m => m[0]);
    let fallbackIndex = 0;
    for (const tag of sheetTags) {
        const name = xmlUnescape(/name="([^"]*)"/.exec(tag)?.[1] ?? `Sheet${fallbackIndex + 1}`);
        const rid = /r:id="([^"]+)"/.exec(tag)?.[1];
        fallbackIndex++;
        const path = (rid && relTarget.get(rid)) || `worksheets/sheet${fallbackIndex}.xml`;
        const file = zip.file(`xl/${path}`) || zip.file(path);
        if (!file) continue;

        const xml = await file.async('string');
        const rows: Rows = [];
        for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
            const declared = /r="(\d+)"/.exec(rowMatch[1])?.[1];
            const rowIndex = declared ? parseInt(declared, 10) - 1 : rows.length;
            const cells: string[] = [];
            for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
                const attrs = cellMatch[1];
                const inner = cellMatch[2] ?? '';
                const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
                let value: string;
                if (type === 's') {
                    const idx = parseInt(textRuns(inner) || /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] || '', 10);
                    value = Number.isFinite(idx) ? (shared[idx] ?? '') : '';
                } else if (type === 'inlineStr') {
                    value = textRuns(inner);
                } else {
                    // Numbers, booleans, and formula cells (which carry a cached <v>).
                    value = xmlUnescape(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
                }
                const ref = parseCellRef(/r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? '');
                const col = ref ? ref.col : cells.length;
                while (cells.length < col) cells.push('');   // sparse rows: fill the gaps
                cells[col] = value;
            }
            while (rows.length < rowIndex) rows.push([]);     // skipped rows stay aligned
            rows[rowIndex] = cells;
        }
        sheets.push({ name, rows });
    }

    if (sheets.length === 0) throw new Error('That spreadsheet has no readable sheets.');
    return sheets;
}
