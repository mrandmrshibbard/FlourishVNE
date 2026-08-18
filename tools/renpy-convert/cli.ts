/**
 * The converter's command line.
 *
 * `--src` is REQUIRED and validated: the previous pipeline hard-coded a path that no longer
 * existed, and because every lookup was guarded by `existsSync`, an index with zero entries looked
 * exactly like success and produced a build made entirely of placeholders. Pointing at the wrong
 * directory now stops the run immediately.
 *
 * Exit codes: 0 clean, 1 a real failure (blockers, lint errors, bad arguments).
 */
import fs from 'node:fs';
import path from 'node:path';
import { convert } from './convert';
import { writeArchive } from './emit/archive';
import { lintProject, formatFindings } from './lint/linter';
import { buildReport, writeReport } from './report/gapReport';

interface Args {
    src: string;
    out: string;
    story: string;
    title: string;
    allowGaps: boolean;
    stamp: string;
}

function parseArgs(argv: string[]): Args | { error: string } {
    const get = (name: string): string | undefined => {
        const i = argv.indexOf(`--${name}`);
        return i === -1 ? undefined : argv[i + 1];
    };
    const src = get('src');
    if (!src) return { error: 'missing required --src <path to the game directory>' };
    return {
        src,
        out: get('out') ?? 'ourlife-out',
        story: get('story') ?? 'prologue.rpy',
        title: get('title') ?? 'Prologue',
        allowGaps: argv.includes('--allow-gaps'),
        // Fixed by default so two runs are byte-identical; override for a real release stamp.
        stamp: get('stamp') ?? '1970-01-01T00:00:00.000Z',
    };
}

/** The source must actually look like the game, not merely exist. */
function validateSource(src: string, story: string): string | null {
    if (!fs.existsSync(src)) return `--src does not exist: ${src}`;
    const required = [story, 'character_definitions.rpy', 'script.rpy'];
    for (const f of required) {
        if (!fs.existsSync(path.join(src, f))) return `--src is missing ${f}: ${src}`;
    }
    if (!fs.existsSync(path.join(src, 'images', 'characters'))) {
        return `--src has no images/characters directory: ${src}`;
    }
    return null;
}

export async function main(argv: string[]): Promise<number> {
    const args = parseArgs(argv);
    if ('error' in args) {
        console.error(`convert: ${args.error}`);
        console.error('usage: convert --src <gameDir> [--out <dir>] [--story <file.rpy>] [--title <name>] [--allow-gaps] [--stamp <iso>]');
        return 1;
    }

    const invalid = validateSource(args.src, args.story);
    if (invalid) { console.error(`convert: ${invalid}`); return 1; }

    console.log(`convert: reading ${args.src}`);
    const result = convert({ gameDir: args.src, storyFile: args.story, title: args.title });

    for (const [k, v] of Object.entries(result.stats)) console.log(`  ${k}: ${v}`);

    const findings = lintProject(result.project);
    console.log(formatFindings(findings));

    const report = buildReport(result.gaps, result.missingFromSource, args.stamp);
    const written = writeReport(report, args.out);
    console.log(`convert: gap report -> ${written.md}`);

    if (result.missingFromSource.length) {
        console.log(`convert: ${result.missingFromSource.length} asset(s) missing from the game data, standing in with placeholders:`);
        for (const m of result.missingFromSource) console.log(`    ${m.name} (${m.sites} site${m.sites === 1 ? '' : 's'})`);
    }

    const archivePath = path.join(args.out, `${args.title.replace(/[^A-Za-z0-9_-]/g, '_')}.flourish`);
    const archive = await writeArchive(result.project, result.registry, archivePath, args.stamp);
    console.log(`convert: archive -> ${archive.filePath} (${(archive.archiveBytes / 1048576).toFixed(1)} MB, ${archive.assetCount} assets)`);
    console.log(`convert: project.json ${(archive.projectJsonBytes / 1048576).toFixed(2)} MB`);

    const errors = findings.filter(f => f.severity === 'error');
    if (errors.length) { console.error(`convert: FAILED - ${errors.length} lint error(s)`); return 1; }
    if (result.blockers.length && !args.allowGaps) {
        console.error(`convert: FAILED - ${result.blockers.length} blocker(s); pass --allow-gaps to write anyway`);
        return 1;
    }
    console.log('convert: OK');
    return 0;
}
