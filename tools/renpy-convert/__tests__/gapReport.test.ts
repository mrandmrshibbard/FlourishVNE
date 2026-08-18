/**
 * STEP 9 GATE - the gap report and fail-loud behaviour.
 *
 * The report is the artefact most likely to be pasted into a message or committed by accident, so
 * the masking is not a convention to remember - it is enforced here and proven by a test that
 * throws real quoted strings at it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { maskLiterals, buildReport, renderMarkdown, writeReport } from '../report/gapReport';
import { main } from '../cli';
import type { Gap } from '../map/commands';

const gap = (over: Partial<Gap> = {}): Gap => ({
    id: 'G0001', kind: 'python-call', severity: 'note',
    file: 'prologue.rpy', line: 12, detail: 'achievement.grant', commandId: 'cmd_1',
    ...over,
});

describe('literal masking', () => {
    it('replaces a quoted string with its length', () => {
        expect(maskLiterals('say "hello there"')).toBe('say <str:11>');
        expect(maskLiterals("show 'a thing'")).toBe('show <str:7>');
    });

    it('masks every literal on a line, not just the first', () => {
        expect(maskLiterals('f("one", "two")')).toBe('f(<str:3>, <str:3>)');
    });

    it('handles an escaped quote inside the literal', () => {
        const src = 'x = "he said ' + String.fromCharCode(92) + '"hi' + String.fromCharCode(92) + '""';
        expect(maskLiterals(src)).not.toContain('hi');
        expect(maskLiterals(src)).toMatch(/^x = <str:\d+>$/);
    });

    it('leaves identifiers and positions alone', () => {
        expect(maskLiterals('prologue.rpy:412 slot=eyes')).toBe('prologue.rpy:412 slot=eyes');
    });

    it('GATE: no quoted literal can survive into a report', () => {
        // Deliberately hostile details: real sentences, both quote styles, nested quotes.
        const hostile = [
            'dialogue "This is a line of the actual game script."',
            "menu option 'Another line the player would read.'",
            'mixed "one" and \'two\' together',
        ];
        const report = buildReport(hostile.map(d => gap({ detail: d })), [], 'T');
        const serialised = JSON.stringify(report) + renderMarkdown(report);
        for (const word of ['actual game script', 'player would read', 'one', 'two']) {
            expect(serialised.includes(word), `report leaked: ${word}`).toBe(false);
        }
        expect(serialised).toContain('<str:');
    });
});

describe('report shape', () => {
    const report = buildReport(
        [
            gap({ id: 'G0001', severity: 'blocker', kind: 'unknown-variable', line: 5 }),
            gap({ id: 'G0002', severity: 'degraded', kind: 'atl-block', line: 2 }),
            gap({ id: 'G0003', severity: 'note', kind: 'python-call', line: 9 }),
            gap({ id: 'G0004', severity: 'note', kind: 'python-call', line: 1 }),
        ],
        [{ name: 'bed_day_close', sites: 2 }],
        '2026-08-18T00:00:00.000Z',
    );

    it('totals by severity and kind', () => {
        expect(report.totals).toEqual({ blocker: 1, degraded: 1, note: 2, total: 4 });
        expect(report.byKind['python-call']).toBe(2);
    });

    it('orders gaps by file and line so a diff is readable', () => {
        expect(report.gaps.map(g => g.line)).toEqual([1, 2, 5, 9]);
    });

    it('lists placeholders with their site counts', () => {
        expect(report.placeholders).toEqual([{ name: 'bed_day_close', sites: 2 }]);
        expect(renderMarkdown(report)).toContain('bed_day_close');
        expect(renderMarkdown(report)).toContain('MISSING ASSET');
    });

    it('writes both formats', () => {
        const dir = path.join(os.tmpdir(), `gaprep_${process.pid}`);
        const { json, md } = writeReport(report, dir);
        expect(JSON.parse(fs.readFileSync(json, 'utf8')).totals.total).toBe(4);
        expect(fs.readFileSync(md, 'utf8')).toContain('# Conversion gap report');
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('cli argument handling', () => {
    it('refuses to run without --src rather than guessing a path', async () => {
        // The old pipeline hard-coded a path that stopped existing, and every lookup was guarded,
        // so a fully-placeholder build looked like success.
        expect(await main([])).toBe(1);
    });

    it('refuses a --src that is not the game', async () => {
        const dir = path.join(os.tmpdir(), `notgame_${process.pid}`);
        fs.mkdirSync(dir, { recursive: true });
        expect(await main(['--src', dir])).toBe(1);
        expect(await main(['--src', path.join(dir, 'nope')])).toBe(1);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
