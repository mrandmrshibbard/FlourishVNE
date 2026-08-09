/**
 * The translator round-trip has to survive real dialogue and a real translator's spreadsheet.
 *
 * The first block pins the three defects that made the old importer corrupt scripts silently:
 * newlines inside a cell, CRLF files, and the missing BOM. The old code passed a quote-escaping
 * test while failing all three, which is exactly why they went unnoticed.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { writeCsv, parseCsv, writeXlsx, parseXlsx, columnName, sanitizeSheetName } from '../tabular';

const roundTrip = (rows: string[][]) => parseCsv(writeCsv(rows));

describe('CSV — the defects that motivated this module', () => {
    it('survives a cell containing a NEWLINE (the bug that misaligned every later column)', () => {
        const rows = [['key', 'source'], ['cmd:1:text', 'First line\nSecond line'], ['cmd:2:text', 'after']];
        const out = roundTrip(rows);
        expect(out).toEqual(rows);
        // The row after the multi-line cell must still be intact — that's what used to break.
        expect(out[2]).toEqual(['cmd:2:text', 'after']);
    });

    it('survives a cell containing a comma', () => {
        expect(roundTrip([['k', 'Well, hello there']])).toEqual([['k', 'Well, hello there']]);
    });

    it('survives a cell containing quotes', () => {
        expect(roundTrip([['k', 'She said "no" twice']])).toEqual([['k', 'She said "no" twice']]);
    });

    it('reads a CRLF file without leaving \\r on the last column', () => {
        const parsed = parseCsv('key,source\r\ncmd:1,hello\r\ncmd:2,world\r\n');
        expect(parsed).toEqual([['key', 'source'], ['cmd:1', 'hello'], ['cmd:2', 'world']]);
        expect(parsed[1][1]).toBe('hello');            // not 'hello\r'
    });

    it('writes a UTF-8 BOM so Excel stops mangling non-Latin text', () => {
        expect(writeCsv([['k']]).charCodeAt(0)).toBe(0xFEFF);
        // ...and reading strips it rather than gluing it onto the first key.
        expect(parseCsv(writeCsv([['key', 'v']]))[0][0]).toBe('key');
    });

    it('round-trips Japanese, Cyrillic and Arabic intact', () => {
        const rows = [['ja', 'こんにちは、世界'], ['ru', 'Привет, мир'], ['ar', 'مرحبا بالعالم']];
        expect(roundTrip(rows)).toEqual(rows);
    });
});

describe('parseCsv', () => {
    it('does not invent a phantom row from the trailing newline', () => {
        expect(parseCsv('a,b\r\nc,d\r\n')).toHaveLength(2);
        expect(parseCsv('a,b\nc,d')).toHaveLength(2);        // no trailing newline at all
    });

    it('keeps empty cells, including trailing ones', () => {
        expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
        expect(parseCsv('a,b,')).toEqual([['a', 'b', '']]);
        expect(parseCsv('"",x')).toEqual([['', 'x']]);
    });

    it('handles lone-CR line endings (classic Mac exports)', () => {
        expect(parseCsv('a,b\rc,d')).toEqual([['a', 'b'], ['c', 'd']]);
    });

    it('handles escaped quotes at the very start and end of a field', () => {
        expect(parseCsv('"""quoted"""')).toEqual([['"quoted"']]);
    });

    it('preserves whitespace a spreadsheet would otherwise trim', () => {
        expect(roundTrip([['k', '  leading and trailing  ']])).toEqual([['k', '  leading and trailing  ']]);
    });

    it('is forgiving about an unterminated quote rather than throwing', () => {
        expect(() => parseCsv('a,"never closed')).not.toThrow();
        expect(parseCsv('a,"never closed')).toEqual([['a', 'never closed']]);
    });

    it('returns nothing for empty input', () => {
        expect(parseCsv('')).toEqual([]);
        expect(parseCsv('﻿')).toEqual([]);
    });

    it('normalises an in-cell CRLF so an untouched line does not look edited', () => {
        // Verified against real Excel: it rewrites an in-cell \n as \r\n when it saves. Without
        // this, every multi-line line of dialogue would come back flagged as a change nobody made.
        expect(parseCsv('k,"First line\r\nSecond line"')[0][1]).toBe('First line\nSecond line');
    });

    it('keeps our inline markup byte-for-byte', () => {
        const line = 'I said [shake]NO[/shake], {Nickname}. [pause 0.5]Really.';
        expect(roundTrip([['k', line]])[0][1]).toBe(line);
    });
});

describe('XLSX', () => {
    const sheets = [
        { name: 'Dialogue', rows: [['Key', 'Source', 'Spanish'], ['cmd:1:text', 'Hello, "friend"', 'Hola'], ['cmd:2:text', 'Line one\nLine two', '']] },
        { name: 'Characters', rows: [['Key', 'Source', 'Spanish'], ['char:mia:name', 'Mia', 'Mía']] },
    ];

    it('round-trips sheets, names and cells through our own writer and reader', async () => {
        const parsed = await parseXlsx(await writeXlsx(sheets, JSZip), JSZip);
        expect(parsed.map(s => s.name)).toEqual(['Dialogue', 'Characters']);
        expect(parsed[0].rows[1]).toEqual(['cmd:1:text', 'Hello, "friend"', 'Hola']);
        expect(parsed[1].rows[1]).toEqual(['char:mia:name', 'Mia', 'Mía']);
    });

    it('keeps newlines and inline markup inside a cell', async () => {
        const parsed = await parseXlsx(await writeXlsx(sheets, JSZip), JSZip);
        expect(parsed[0].rows[2][1]).toBe('Line one\nLine two');
    });

    it('escapes XML metacharacters instead of producing a corrupt file', async () => {
        const tricky = [{ name: 'S', rows: [['a & b', '<tag>', "it's \"quoted\""]] }];
        const parsed = await parseXlsx(await writeXlsx(tricky, JSZip), JSZip);
        expect(parsed[0].rows[0]).toEqual(['a & b', '<tag>', 'it\'s "quoted"']);
    });

    it('reads the shared-strings form that Excel and LibreOffice actually write', async () => {
        // Hand-built to match what those tools emit, rather than what we emit.
        const zip = new JSZip();
        zip.file('xl/workbook.xml',
            '<workbook xmlns:r="x"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
        zip.file('xl/_rels/workbook.xml.rels',
            '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
        zip.file('xl/sharedStrings.xml',
            '<sst><si><t>Key</t></si><si><t>Hola, mundo</t></si></sst>');
        zip.file('xl/worksheets/sheet1.xml',
            '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>');
        const parsed = await parseXlsx(await zip.generateAsync({ type: 'uint8array' }), JSZip);
        expect(parsed[0].rows[0]).toEqual(['Key', 'Hola, mundo']);
    });

    it('keeps columns aligned when a translator leaves cells blank (sparse rows)', async () => {
        const zip = new JSZip();
        zip.file('xl/workbook.xml', '<workbook xmlns:r="x"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>');
        zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
        // Only A and C are present — B was left empty, so Excel omits the cell entirely.
        zip.file('xl/worksheets/sheet1.xml',
            '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>key</t></is></c><c r="C1" t="inlineStr"><is><t>third</t></is></c></row></sheetData></worksheet>');
        const parsed = await parseXlsx(await zip.generateAsync({ type: 'uint8array' }), JSZip);
        expect(parsed[0].rows[0]).toEqual(['key', '', 'third']);
    });

    it('refuses a file that is not a spreadsheet, rather than importing nonsense', async () => {
        const zip = new JSZip();
        zip.file('hello.txt', 'not a spreadsheet');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        await expect(parseXlsx(bytes, JSZip)).rejects.toThrow();
    });
});

describe('XLSX sheet layout — the guard rails a translator opens the file to', () => {
    const laidOut = [{
        name: 'Dialogue',
        rows: [['Key', 'Where', 'Source', 'Spanish', 'Notes'], ['cmd:1:text', 'Scene "Roof"', 'Hello', '', '']],
        layout: {
            hiddenColumns: [0], columnWidths: { 1: 24, 2: 60, 3: 60 },
            editableColumns: [3], protect: true, freezeRows: 1,
        },
    }];
    const sheetXml = async () => {
        const zip = await JSZip.loadAsync(await writeXlsx(laidOut, JSZip));
        return zip.file('xl/worksheets/sheet1.xml')!.async('string');
    };

    it('hides the key column and sets the widths', async () => {
        const xml = await sheetXml();
        expect(xml).toContain('<col min="1" max="1" hidden="1"/>');
        expect(xml).toContain('<col min="3" max="3" width="60" customWidth="1"/>');
    });

    it('locks the sheet but leaves the translator\'s column typeable', async () => {
        const xml = await sheetXml();
        expect(xml).toContain('<sheetProtection sheet="1"');
        expect(xml).toMatch(/<c r="C2" s="2"/);      // source column → locked
        // 🔴 The target cell is EMPTY and must STILL be emitted with the unlocked style — skipping
        // empty cells left the translator's own column locked on a protected sheet.
        expect(xml).toMatch(/<c r="D2" s="1"\/>/);
        // ...and the column itself carries it, so rows past the data are typeable too.
        expect(xml).toContain('<col min="4" max="4" width="60" customWidth="1" style="1"/>');
    });

    it('freezes the header row', async () => {
        expect(await sheetXml()).toContain('state="frozen"');
    });

    it('orders sheetViews → cols → sheetData → sheetProtection, as OOXML demands', async () => {
        const xml = await sheetXml();
        const at = (tag: string) => xml.indexOf(tag);
        expect(at('<sheetViews>')).toBeLessThan(at('<cols>'));
        expect(at('<cols>')).toBeLessThan(at('<sheetData>'));
        expect(at('<sheetData>')).toBeLessThan(at('<sheetProtection'));
    });

    it('ships a styles part that the workbook actually references', async () => {
        const zip = await JSZip.loadAsync(await writeXlsx(laidOut, JSZip));
        expect(zip.file('xl/styles.xml')).not.toBeNull();
        expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('styles+xml');
        expect(await zip.file('xl/_rels/workbook.xml.rels')!.async('string')).toContain('styles.xml');
    });

    it('🔴 changes no VALUE — layout is cosmetic, import must not depend on it', async () => {
        const withLayout = await parseXlsx(await writeXlsx(laidOut, JSZip), JSZip);
        const plain = await parseXlsx(await writeXlsx([{ name: 'Dialogue', rows: laidOut[0].rows }], JSZip), JSZip);
        // Layout DOES decide whether a trailing empty cell is materialised (the translator's column
        // is written even when blank, so it stays typeable) — so compare padded to a common width.
        // Reading a column that isn't there must mean the same as reading a blank one, which the
        // importer relies on anyway: Excel omits empty cells whenever a translator leaves one out.
        const pad = (rows: string[][], width: number) =>
            rows.map(r => Array.from({ length: width }, (_, i) => r[i] ?? ''));
        const width = laidOut[0].rows[0].length;
        expect(pad(withLayout[0].rows, width)).toEqual(pad(plain[0].rows, width));
    });

    it('still writes a plain sheet when no layout is given', async () => {
        const zip = await JSZip.loadAsync(await writeXlsx([{ name: 'S', rows: [['a']] }], JSZip));
        const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
        expect(xml).not.toContain('<cols>');
        expect(xml).not.toContain('sheetProtection');
    });
});

describe('spreadsheet naming helpers', () => {
    it('maps column indexes the way spreadsheets do', () => {
        expect([0, 1, 25, 26, 27, 51, 52].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
    });

    it('strips characters Excel rejects and enforces the 31-char limit', () => {
        expect(sanitizeSheetName('Scene: a/b*c?[d]')).toBe('Scene  a b c  d');
        expect(sanitizeSheetName('x'.repeat(50)).length).toBe(31);
    });

    it('de-duplicates names instead of producing an unopenable file', () => {
        const taken = new Set<string>();
        expect(sanitizeSheetName('Dialogue', taken)).toBe('Dialogue');
        expect(sanitizeSheetName('Dialogue', taken)).toBe('Dialogue (2)');
        expect(sanitizeSheetName('Dialogue', taken)).toBe('Dialogue (3)');
    });
});
