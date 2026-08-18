/**
 * The gap report: everything the conversion could not carry across, in a form that is safe to
 * read, share and diff.
 *
 * 🔴 CONTENT RULE, enforced here rather than trusted: this is the one artefact most likely to be
 * pasted into a message or committed by accident, so every string literal is MASKED to `<str:NN>`
 * before it can reach the file. A test proves no quoted literal survives. Nothing in the report is
 * game text - only counts, kind slugs, identifiers and source positions.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Gap } from '../map/commands';

/**
 * Replace every quoted literal with its LENGTH.
 *
 * The length is kept because it is genuinely useful when diagnosing (a 3-character name behaves
 * differently from a 300-character line) and it carries no content.
 */
export function maskLiterals(text: string): string {
    let out = '';
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '"' || ch === "'") {
            const quote = ch;
            let j = i + 1;
            let len = 0;
            while (j < text.length && text[j] !== quote) {
                if (text[j] === String.fromCharCode(92)) j++;
                j++; len++;
            }
            out += `<str:${len}>`;
            i = j + 1;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

export interface GapReport {
    generatedAt: string;
    totals: { blocker: number; degraded: number; note: number; total: number };
    byKind: Record<string, number>;
    gaps: Array<{
        id: string;
        kind: string;
        severity: Gap['severity'];
        file: string;
        line: number;
        detail: string;
        commandId: string;
    }>;
    /** Assets the game data itself does not contain, standing in with placeholders. */
    placeholders: Array<{ name: string; sites: number }>;
}

export function buildReport(
    gaps: Gap[],
    placeholders: Array<{ name: string; sites: number }>,
    generatedAt: string,
): GapReport {
    const totals = { blocker: 0, degraded: 0, note: 0, total: gaps.length };
    const byKind: Record<string, number> = {};
    for (const g of gaps) {
        totals[g.severity]++;
        byKind[g.kind] = (byKind[g.kind] ?? 0) + 1;
    }
    return {
        generatedAt,
        totals,
        byKind,
        gaps: gaps
            .map(g => ({
                id: g.id,
                kind: g.kind,
                severity: g.severity,
                file: g.file,
                line: g.line,
                detail: maskLiterals(g.detail),
                commandId: g.commandId,
            }))
            .sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file))),
        placeholders: [...placeholders].sort((a, b) => a.name.localeCompare(b.name)),
    };
}

const SEVERITY_ORDER: Gap['severity'][] = ['blocker', 'degraded', 'note'];

export function renderMarkdown(report: GapReport): string {
    const lines: string[] = [];
    lines.push('# Conversion gap report');
    lines.push('');
    lines.push(`Generated ${report.generatedAt}.`);
    lines.push('');
    lines.push(`**${report.totals.total} gaps** — ${report.totals.blocker} blocker, ${report.totals.degraded} degraded, ${report.totals.note} note.`);
    lines.push('');

    if (report.placeholders.length) {
        lines.push('## Missing art (placeholders in the build)');
        lines.push('');
        lines.push('These names have no `image` statement, no file under `game/`, and no entry in either');
        lines.push('`.rpa` archive. Each one shows a magenta MISSING ASSET plate at full screen size, so it');
        lines.push('can be found in a playthrough and swapped for the real art without repositioning.');
        lines.push('');
        lines.push('| name | sites |');
        lines.push('| --- | --- |');
        for (const p of report.placeholders) lines.push(`| \`${p.name}\` | ${p.sites} |`);
        lines.push('');
    }

    lines.push('## By kind');
    lines.push('');
    lines.push('| kind | count |');
    lines.push('| --- | --- |');
    for (const [kind, count] of Object.entries(report.byKind).sort((a, b) => b[1] - a[1])) {
        lines.push(`| \`${kind}\` | ${count} |`);
    }
    lines.push('');

    for (const severity of SEVERITY_ORDER) {
        const rows = report.gaps.filter(g => g.severity === severity);
        if (!rows.length) continue;
        lines.push(`## ${severity} (${rows.length})`);
        lines.push('');
        lines.push('| id | kind | where | detail |');
        lines.push('| --- | --- | --- | --- |');
        for (const g of rows) {
            lines.push(`| ${g.id} | \`${g.kind}\` | ${g.file}:${g.line} | \`${g.detail}\` |`);
        }
        lines.push('');
    }
    return lines.join('\n');
}

export function writeReport(report: GapReport, outDir: string): { json: string; md: string } {
    fs.mkdirSync(outDir, { recursive: true });
    const json = path.join(outDir, 'gap-report.json');
    const md = path.join(outDir, 'gap-report.md');
    fs.writeFileSync(json, JSON.stringify(report, null, 2));
    fs.writeFileSync(md, renderMarkdown(report));
    return { json, md };
}
