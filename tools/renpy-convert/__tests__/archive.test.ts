/**
 * STEP 8 GATE - the archive.
 *
 * This runs the whole pipeline against the real game and checks the output is a genuine
 * `.flourish`: `project.json` first, assets as real files, no `data:` URL anywhere, and every
 * reference resolving. The old build failed all of those at once - it base64'd every asset into
 * `project.json` and reached 229.9 MB.
 *
 * CONTENT RULE: counts, ids and paths only.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import { convert } from '../convert';
import { writeArchive, findDataUrls } from '../emit/archive';
import { lintProject } from '../lint/linter';
import { parseImageDeclarations, resolveImageName, loadImageTable } from '../model/imageTable';
import { AssetRegistry, sanitizeFilename } from '../emit/assets';
import { buildVariables, collectDeclarations, collectUsage } from '../emit/variables';
import { parseFile } from '../parse/lexer';
import { parseNodes } from '../parse/statements';

describe('image declarations', () => {
    const SRC = [
        'image bg hill = "images/backgrounds/h_d.jpg"',
        'image bg hill night = "images/backgrounds/h_n.jpg"',
        'image cove_8 = Portrait(name="Cove_8", width=615, height=1439)',
        'image cg thing = ConditionSwitch("a", "x.png", True, "y.png")',
    ].join('\n');

    it('reads multi-word names and skips Portrait declarations', () => {
        const decls = parseImageDeclarations(SRC, 'script.rpy');
        expect(decls.map(d => d.name)).toEqual(['bg hill', 'bg hill night', 'cg thing']);
        expect(decls[0].file).toBe('images/backgrounds/h_d.jpg');
    });

    it('records a non-string declaration as an expression instead of guessing a file', () => {
        const decls = parseImageDeclarations(SRC, 'script.rpy');
        const cg = decls.find(d => d.name === 'cg thing')!;
        expect(cg.file).toBeNull();
        expect(cg.expression).toContain('ConditionSwitch');
    });

    it('matches the LONGEST declared name, so time of day is not lost', () => {
        const table = { byName: new Map(parseImageDeclarations(SRC, 's').map(d => [d.name.toLowerCase(), d])) };
        expect(resolveImageName(table, ['bg', 'hill', 'night'])!.file).toContain('h_n.jpg');
        expect(resolveImageName(table, ['bg', 'hill'])!.file).toContain('h_d.jpg');
        expect(resolveImageName(table, ['bg', 'unknown'])).toBeNull();
    });
});

describe('asset registry', () => {
    it('mirrors the packager\'s filename rules', () => {
        expect(sanitizeFilename('Bg Hill Night', 'x')).toBe('bg_hill_night');
        expect(sanitizeFilename('a//b\\c', 'x')).toBe('a_b_c');
        expect(sanitizeFilename('', 'fallback')).toBe('fallback');
    });

    it('packs the same source file only once', () => {
        const reg = new AssetRegistry();
        const tmp = path.join(os.tmpdir(), `conv_${process.pid}.png`);
        fs.writeFileSync(tmp, Buffer.from([1, 2, 3]));
        const a = reg.addFile(tmp, 'images', 'one', 'img');
        const b = reg.addFile(tmp, 'images', 'two', 'img');
        expect(b.id).toBe(a.id);
        expect(reg.files.size).toBe(1);
        fs.unlinkSync(tmp);
    });
});

describe('variables', () => {
    it('reads a default and ignores its trailing comment', () => {
        const decls = collectDeclarations(['default tookmoney = False #(whether the player took it)']);
        expect(decls.get('tookmoney')).toBe(false);
    });

    it('does not create a variable from a second `default` inside a comment', () => {
        const decls = collectDeclarations(['default a = True #(note) default b = False #(note)']);
        expect(decls.has('a')).toBe(true);
        expect(decls.has('b')).toBe(false);
    });

    it('infers a type and reports names that nothing declares', () => {
        const nodes = parseNodes(parseFile(['$ comfort = 2', '$ mystery += 1'].join('\n')), 't.rpy');
        const built = buildVariables(new Map([['comfort', 0]]), collectUsage(nodes));
        expect(built.variables[built.idByName.get('comfort')!].type).toBe('number');
        expect(built.undeclared).toContain('mystery');
    });
});

const GAME_DIR = process.env.OURLIFE_GAME
    ?? path.resolve(__dirname, '..', '..', '..', 'OurLife', 'game');
const PROLOGUE = path.join(GAME_DIR, 'prologue.rpy');

if (fs.existsSync(PROLOGUE)) describe('full conversion', () => {
    const result = convert({ gameDir: GAME_DIR, title: 'Prologue' });

    it('converts the prologue with real assets', () => {
        const s = result.stats;
        console.log(`[step8] commands=${s.commands} characters=${s.characters} variables=${s.variables}`);
        console.log(`[step8] backgrounds=${s.backgrounds} images=${s.images} audio=${s.audio} baked=${s.bakedGrades}`);
        console.log(`[step8] asset files=${s.assetFiles} asset bytes=${(Number(s.assetBytes) / 1048576).toFixed(1)} MB`);
        console.log(`[step8] gaps=${s.gaps} undeclared vars=${s.undeclaredVariables}`);
        expect(Number(s.commands)).toBeGreaterThan(1000);
        expect(Number(s.characters)).toBeGreaterThan(0);
        expect(Number(s.assetFiles)).toBeGreaterThan(0);
    });

    it('GATE: the converter itself leaves nothing unresolved', () => {
        const unique = [...new Set(result.blockers)];
        console.log(`[step8] converter blockers=${unique.length}`);
        for (const b of unique.slice(0, 10)) console.log(`[step8]   ${b}`);
        expect(unique).toEqual([]);
    });

    it('stands in for art the GAME DATA does not contain, unmistakably', () => {
        // Verified by hand: these three names have no `image` statement, no file under game/, and
        // no entry in archive.rpa (10,734 files) or dlc_wedding.rpa (416). They cannot be resolved
        // by any amount of converter work, so they get a placeholder to find and replace - one
        // asset per name, reused across its sites.
        const names = result.missingFromSource.map(m => m.name).sort();
        console.log(`[step8] placeholders: ${names.join(' ')}`);
        expect(names).toEqual(['bed_day_close', 'outside_left_noon', 'outside_left_sunset']);

        // Named so they are obvious in the editor's asset list.
        const pool = { ...(result.project.images as any), ...(result.project.backgrounds as any) };
        const missing = Object.values(pool).filter((a: any) => a.name.startsWith('MISSING - '));
        expect(missing).toHaveLength(3);

        // Every site that referenced them still emits a real command, not a hole.
        const missingIds = new Set(missing.map((a: any) => a.id));
        const sites = (Object.values(result.project.scenes) as any[])
            .flatMap(s => s.commands)
            .filter((c: any) => missingIds.has(c.imageId));
        console.log(`[step8] placeholder sites=${sites.length}`);
        expect(sites.length).toBe(8);
    });

    it('makes a placeholder that is valid, correctly sized and not plausible art', async () => {
        const { decodePng } = await import('../emit/bakeGrade');
        const pool = { ...(result.project.images as any), ...(result.project.backgrounds as any) };
        const missing = Object.values(pool).filter((a: any) => a.name.startsWith('MISSING - ')) as any[];
        for (const asset of missing) {
            const source = result.registry.files.get(asset.imageUrl)!;
            expect(source?.data, `placeholder ${asset.name} has no bytes`).toBeTruthy();
            const bmp = decodePng(source.data!);
            // Full screen, so swapping the real art in needs no repositioning.
            expect(bmp.width).toBe(1920);
            expect(bmp.height).toBe(1080);
            // Loudly magenta, and nothing like the 64x64 tinted squares that went unnoticed before.
            let magenta = 0;
            for (let i = 0; i < bmp.rgba.length; i += 4) {
                if (bmp.rgba[i] > 200 && bmp.rgba[i + 1] < 80 && bmp.rgba[i + 2] > 150) magenta++;
            }
            expect(magenta / (bmp.width * bmp.height)).toBeGreaterThan(0.2);
        }
    });

    it('GATE: the linter passes on the real project, including L2 and L11', () => {
        const findings = lintProject(result.project);
        const byRule = new Map<string, number>();
        for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
        console.log(`[step8] lint=${findings.length} ${[...byRule.entries()].sort().map(([r, c]) => `${r}=${c}`).join(' ')}`);
        for (const f of findings.slice(0, 8)) console.log(`[step8]   ${f.rule}: ${f.message}`);
        expect(findings.map(f => `${f.rule}: ${f.message}`)).toEqual([]);
    });

    it('GATE: project.json is small and carries no data: URL', () => {
        const json = JSON.stringify(result.project);
        const mb = Buffer.byteLength(json, 'utf8') / 1048576;
        const dataUrls = findDataUrls(result.project);
        console.log(`[step8] project.json=${mb.toFixed(2)} MB data-urls=${dataUrls.length}`);
        expect(dataUrls).toEqual([]);
        // The old archive was 229.9 MB because every asset was base64'd inline.
        expect(mb).toBeLessThan(25);
    });

    // Zipping ~107 MB of art takes longer than vitest's default 5s.
    it('GATE: writes a real .flourish with project.json first', { timeout: 180_000 }, async () => {
        const out = path.join(os.tmpdir(), `prologue_${process.pid}.flourish`);
        const written = await writeArchive(result.project, result.registry, out, '2026-08-18T00:00:00.000Z');
        const zip = await JSZip.loadAsync(fs.readFileSync(out));
        const names = Object.keys(zip.files);
        console.log(`[step8] archive=${(written.archiveBytes / 1048576).toFixed(1)} MB entries=${names.length}`);

        // The exporter reserves project.json as the FIRST entry so a truncated archive loses art,
        // never the script.
        expect(names[0]).toBe('project.json');
        expect(names[1]).toBe('manifest.json');
        expect(names.some(n => n.startsWith('assets/'))).toBe(true);

        const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
        expect(manifest.schemaVersion).toBe(1);
        expect(manifest.fetchFailures).toEqual([]);

        const reread = JSON.parse(await zip.file('project.json')!.async('string'));
        expect(reread.startSceneId).toBe(result.project.startSceneId);
        expect(findDataUrls(reread)).toEqual([]);
        fs.unlinkSync(out);
    });

    it('GATE: every asset URL in the project exists in the archive', async () => {
        const referenced = new Set<string>();
        const walk = (v: unknown): void => {
            if (typeof v === 'string') { if (v.startsWith('assets/')) referenced.add(v); return; }
            if (Array.isArray(v)) { v.forEach(walk); return; }
            if (v && typeof v === 'object') Object.values(v).forEach(walk);
        };
        walk(result.project);
        const present = new Set(result.registry.files.keys());
        const missing = [...referenced].filter(r => !present.has(r));
        console.log(`[step8] referenced asset paths=${referenced.size} missing from archive=${missing.length}`);
        expect(missing.slice(0, 5)).toEqual([]);
        expect(referenced.size).toBeGreaterThan(0);
    });

    it('builds characters with layers in the global slot order', async () => {
        const { loadSlotOrder } = await import('../model/slotOrder');
        const slots = loadSlotOrder(GAME_DIR);
        const rank = new Map(slots.order.map((s, i) => [s, i]));
        for (const character of Object.values(result.project.characters) as any[]) {
            const names = Object.values(character.layers).map((l: any) => l.name);
            const ranks = names.map(n => rank.get(n) ?? -1);
            // Record key order IS the engine's z-order fallback, so it has to be ascending.
            expect(ranks.every(r => r >= 0), `unknown slot in ${character.name}`).toBe(true);
            expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
            // A declared-but-unordered slot is dead art in Ren'Py and must not appear.
            for (const n of names) expect(slots.orphans.has(n)).toBe(false);
        }
        const total = Object.values(result.project.characters as any)
            .reduce((n: number, c: any) => n + Object.keys(c.layers).length, 0);
        console.log(`[step8] characters=${Object.keys(result.project.characters).length} layers total=${total}`);
    });

    it('gives every graded piece its own baked copy', () => {
        const chars = Object.values(result.project.characters) as any[];
        let graded = 0, plain = 0;
        for (const c of chars) {
            for (const layer of Object.values(c.layers) as any[]) {
                for (const asset of Object.values(layer.assets) as any[]) {
                    if (asset.name.endsWith('_graded')) graded++; else plain++;
                }
            }
        }
        console.log(`[step8] layer assets: plain=${plain} graded=${graded} (baked=${result.stats.bakedGrades})`);
        expect(graded).toBe(Number(result.stats.bakedGrades));
        expect(graded).toBeGreaterThan(0);
    });

    it('is reproducible: two runs produce the same project', () => {
        const again = convert({ gameDir: GAME_DIR, title: 'Prologue' });
        expect(JSON.stringify(again.project)).toBe(JSON.stringify(result.project));
    });
});
