/**
 * The conversion pipeline: source -> IR -> analysis -> commands -> project -> archive.
 *
 * Every resolver the emitter needs is wired here against REAL assets. Each one either resolves or
 * records a gap; none of them ever invents a placeholder, because a converter that can produce a
 * stand-in will eventually ship a build made entirely of stand-ins - which is precisely what
 * happened before (171 of 235 overlays pointed at a 64x64 tinted square).
 *
 * CONTENT RULE: the returned report carries counts, identifiers and file positions only.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { VNProject } from './ir/engineContract';
import { parseFile } from './parse/lexer';
import { parseNodes } from './parse/statements';
import { loadSlotOrder } from './model/slotOrder';
import { loadPortraitTable } from './model/portraitTable';
import { buildAssetIndex, resolvePath } from './model/assetIndex';
import { loadTransforms, resolvePosition } from './model/transformTable';
import { loadImageTable, resolveImageName } from './model/imageTable';
import { analyse } from './analysis/spriteState';
import { parseMatrixExpression, toAffine, affineIsIdentity, gradeKey, type Affine } from './map/colorGrade';
import { characterGeometry, imageGeometry } from './map/geometry';
import { measure } from './model/imageSize';
import { placeholderPng } from './emit/placeholder';
import { Emitter, type EmitContext, type Gap } from './map/commands';
import { assembleScenes } from './emit/scenes';
import { AssetRegistry } from './emit/assets';
import { buildVariables, collectDeclarations, collectUsage } from './emit/variables';
import { buildCharacters, type PieceRequest } from './emit/characters';
import { RENPY } from './ir/engineContract';
import { mapText } from './map/text';

export interface ConvertOptions {
    gameDir: string;
    /** Story file to convert, relative to gameDir. */
    storyFile?: string;
    title?: string;
}

export interface ConvertResult {
    project: VNProject;
    registry: AssetRegistry;
    gaps: Gap[];
    stats: Record<string, number | string>;
    /** Converter failures - things more converter work can fix. Must be empty. */
    blockers: string[];
    /**
     * References the GAME DATA itself cannot satisfy: an image with no `image` statement and no
     * file, on disk or in either .rpa. More converter work cannot fix these, so they are reported
     * separately for the owner to decide on rather than counted as conversion defects.
     */
    missingFromSource: { name: string; sites: number }[];
}

export function convert(opts: ConvertOptions): ConvertResult {
    const { gameDir } = opts;
    const storyFile = opts.storyFile ?? 'prologue.rpy';
    const storyPath = path.join(gameDir, storyFile);

    // ── Load the source model ────────────────────────────────────────────────────────────────
    const slots = loadSlotOrder(gameDir);
    const portraits = loadPortraitTable(gameDir);
    const index = buildAssetIndex(gameDir);
    const transforms = loadTransforms(gameDir);
    const images = loadImageTable(gameDir);

    const src = fs.readFileSync(storyPath, 'utf8');
    const nodes = parseNodes(parseFile(src), storyFile);
    const labels = nodes.filter(n => n.kind === 'label').map(n => ({ name: (n as any).name, body: (n as any).body }));

    const tagToPortrait = new Map<string, string>();
    for (const [tag, decl] of portraits) tagToPortrait.set(tag.toLowerCase(), decl.name);

    const analysis = analyse(labels, { tagToPortrait });
    const showByLine = new Map(analysis.shows.map(s => [s.pos.line, s]));
    const liveByLine = new Map(analysis.liveChanges.map(c => [c.pos.line, c]));

    const blockers: string[] = [];
    let seq = 0;
    const nextId = (prefix: string) => `${prefix}_${++seq}`;

    // ── Colour grades ────────────────────────────────────────────────────────────────────────
    const gradeCache = new Map<string, Affine | null>();
    const gradeOf = (expr: string | null): Affine | null => {
        if (!expr) return null;
        if (gradeCache.has(expr)) return gradeCache.get(expr)!;
        let affine: Affine | null = null;
        try {
            const parsed = toAffine(parseMatrixExpression(expr));
            affine = parsed && !affineIsIdentity(parsed) ? parsed : null;
        } catch {
            blockers.push(`unsupported colour matrix: ${expr}`);
        }
        gradeCache.set(expr, affine);
        return affine;
    };

    // ── Which sprite pieces the story needs, and under which grade ───────────────────────────
    const requests: PieceRequest[] = [];
    const addMoment = (portrait: string, determinate: Record<string, string>, matrix: string | null) => {
        const grade = gradeOf(matrix);
        for (const [slot, value] of Object.entries(determinate)) {
            requests.push({ portrait, slot, value, grade });
        }
    };
    for (const show of analysis.shows) {
        const portrait = tagToPortrait.get(show.tag.toLowerCase());
        if (portrait) addMoment(portrait, show.determinate, show.matrix);
    }
    for (const change of analysis.liveChanges) {
        addMoment(change.portrait, change.determinate, change.matrix);
    }

    const registry = new AssetRegistry();
    const built = buildCharacters(requests, {
        gameDir, slots, portraits, index, registry, nextId,
    });
    for (const u of built.unresolved) blockers.push(`unresolved sprite art: ${u}`);

    // ── Variables ────────────────────────────────────────────────────────────────────────────
    const rpySources = fs.readdirSync(gameDir)
        .filter(f => f.endsWith('.rpy'))
        .map(f => fs.readFileSync(path.join(gameDir, f), 'utf8'));
    const declarations = collectDeclarations(rpySources);
    const usage = collectUsage(nodes);
    const interpolated = new Set<string>();
    const collectText = (ns: any[]): void => {
        for (const n of ns) {
            if (n.kind === 'say') for (const v of mapText(n.text).variables) interpolated.add(v);
            else if (n.kind === 'label') collectText(n.body);
            else if (n.kind === 'if') for (const c of n.clauses) collectText(c.body);
            else if (n.kind === 'menu') for (const o of n.options) { for (const v of mapText(o.text).variables) interpolated.add(v); collectText(o.body); }
        }
    };
    collectText(nodes);
    const vars = buildVariables(declarations, usage, interpolated);

    // ── Backgrounds, overlays and audio ──────────────────────────────────────────────────────
    const imageIdByName = new Map<string, string>();
    /** Resolved name -> the art's real pixel size, so overlays are placed rather than defaulted. */
    const imageSizeByName = new Map<string, { width: number; height: number }>();
    const projectImages: Record<string, unknown> = {};
    const projectBackgrounds: Record<string, unknown> = {};
    /** Names with no art anywhere in the game data, standing in with a placeholder. */
    const placeholders = new Map<string, number>();

    const resolveImage = (words: string[]): string | null => {
        if (!words.length) return null;
        const key = words.join(' ').toLowerCase();
        const cached = imageIdByName.get(key);
        if (cached) {
            // Count every USE of a placeholder, not just its creation - the owner needs to know how
            // many places show it, and the asset itself is deliberately created only once.
            if (placeholders.has(key)) placeholders.set(key, placeholders.get(key)! + 1);
            return cached;
        }

        // `bg ...` names are backgrounds; everything else is a scene overlay.
        const group = words[0].toLowerCase() === 'bg' ? 'backgrounds' : 'images';
        const decl = resolveImageName(images, words);
        // `decl.file` is null for a ConditionSwitch/Composite/ATL image - still never guessed at,
        // it just falls through to the same visible placeholder.
        const file = decl?.file ? resolvePath(index, decl.file) : null;

        let asset;
        let size: { width: number; height: number };
        if (file) {
            const measured = measure(file);
            if (!measured) return null;                     // unreadable format - a real failure
            size = measured;
            asset = registry.addFile(file, group, key, group === 'backgrounds' ? 'bg' : 'img');
        } else {
            /*
             * Nothing in the game data provides this art. Rather than drop the command, stand in
             * with an UNMISTAKABLE placeholder that names itself on screen, so it can be found and
             * replaced by hand. It is deliberately not plausible-looking: the previous build's
             * 64x64 tinted squares looked like real art, which is why 171 wrong overlays went
             * unnoticed. Full screen size, so dropping the true art in needs no repositioning.
             */
            size = { width: RENPY.width, height: RENPY.height };
            const png = placeholderPng({
                width: size.width, height: size.height,
                name: key,
                subtitle: 'replace this file - not present in the game data',
            });
            asset = registry.addBuffer(png, group, `MISSING ${key}`, group === 'backgrounds' ? 'bg' : 'img');
            placeholders.set(key, (placeholders.get(key) ?? 0) + 1);
        }

        const entry = {
            id: asset.id,
            name: file ? key : `MISSING - ${key}`,
            imageUrl: asset.relPath,
        };
        if (group === 'backgrounds') projectBackgrounds[asset.id] = entry;
        else projectImages[asset.id] = entry;
        imageIdByName.set(key, asset.id);
        imageSizeByName.set(key, size);
        return asset.id;
    };

    /** Geometry for a non-portrait image: measured art + the transform (or Ren'Py's defaults). */
    const imagePlacementFor = (words: string[], names: string[]) => {
        const key = words.join(' ').toLowerCase();
        if (!imageIdByName.has(key)) resolveImage(words);
        const size = imageSizeByName.get(key);
        if (!size) return null;
        const t = names.length ? transforms.byName.get(names[0]) : undefined;
        if (names.length && !t) return null;
        const place = t
            ? resolvePosition(t, size.width, size.height, RENPY)
            : { xpos: 0, ypos: 0, zoom: 1 };
        return imageGeometry(size, place);
    };

    const projectAudio: Record<string, unknown> = {};
    const audioIdByPath = new Map<string, string>();
    const resolveAudio = (rel: string): string | null => {
        const key = rel.toLowerCase();
        const cached = audioIdByPath.get(key);
        if (cached) return cached;
        // 🔴 Keyed by the FULL path. The old build keyed audio by basename, so 218 paths collapsed
        // onto 131 names and roughly 87 lines played the wrong clip.
        const file = resolvePath(index, rel);
        if (!file) return null;
        const asset = registry.addFile(file, 'audio', rel.replace(/[\\/]/g, '_'), 'aud');
        projectAudio[asset.id] = { id: asset.id, name: path.basename(rel), audioUrl: asset.relPath };
        audioIdByPath.set(key, asset.id);
        return asset.id;
    };

    // ── Geometry ─────────────────────────────────────────────────────────────────────────────
    const declByName = new Map<string, { width: number; height: number }>();
    for (const decl of portraits.values()) if (!declByName.has(decl.name)) declByName.set(decl.name, decl);
    const placement = (tag: string, names: string[]) => {
        const portrait = tagToPortrait.get(tag.toLowerCase());
        const canvas = portrait ? declByName.get(portrait) : undefined;
        if (!canvas) return null;
        // A `show` with no `at` uses Ren'Py's OWN defaults - xpos/ypos 0 with anchor (0,0), zoom 1.
        // That is the language's rule, not a converter guess: `cove_step1_intro` is a 1920x1080
        // portrait, so top-left placement is exactly full screen, which is clearly the intent.
        const t = names.length ? transforms.byName.get(names[0]) : undefined;
        if (names.length && !t) return null;
        const place = t
            ? resolvePosition(t, canvas.width, canvas.height, RENPY)
            : { xpos: 0, ypos: 0, zoom: 1 };
        const geo = characterGeometry(canvas, place);
        return { x: geo.x, y: geo.y, scale: geo.scale };
    };

    // ── Emit ─────────────────────────────────────────────────────────────────────────────────
    const ctx: EmitContext = {
        variableId: (name) => vars.idByName.get(name) ?? null,
        characterId: (portrait) => built.characterIdByPortrait.get(portrait) ?? null,
        expressionId: (portrait) => built.expressionIdByPortrait.get(portrait) ?? null,
        layerId: (portrait, slot) => built.layerIdBySlot.get(`${portrait}|${slot}`) ?? null,
        assetId: (portrait, slot, value, matrix) => {
            const grade = gradeOf(matrix);
            return built.assetIdByPiece.get(`${portrait}|${slot}|${value}|${grade ? gradeKey(grade) : ''}`) ?? null;
        },
        imageId: resolveImage,
        imagePlacement: imagePlacementFor,
        audioId: resolveAudio,
        placement,
        nextId,
        tagToPortrait,
        showAt: (line) => showByLine.get(line),
        liveChangeAt: (line) => liveByLine.get(line),
    };

    const emitter = new Emitter(ctx, storyFile);
    const commands = emitter.emit(nodes);
    const gaps = emitter.getGaps();
    for (const gap of gaps) {
        if (gap.severity !== 'blocker') continue;
        // Missing source art is reported separately (see missingFromSource).
        if (gap.kind === 'unresolved-image' || gap.kind === 'unresolved-background') continue;
        blockers.push(`${gap.kind} at ${gap.file}:${gap.line}`);
    }

    // Split the emitter's blockers: an image that resolves to no declaration AND no file is a
    // hole in the source data, not a conversion failure.
    const missingCounts = new Map<string, number>();
    for (const gap of gaps) {
        if (gap.kind !== 'unresolved-image' && gap.kind !== 'unresolved-background') continue;
        missingCounts.set(gap.detail, (missingCounts.get(gap.detail) ?? 0) + 1);
    }
    const missingFromSource = [...placeholders.entries()]
        .map(([name, sites]) => ({ name, sites }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const assembly = assembleScenes(commands, { nextId, sceneName: opts.title ?? 'Prologue' });

    const project = {
        id: 'proj_prologue',
        title: opts.title ?? 'Prologue',
        startSceneId: assembly.startSceneId,
        scenes: assembly.scenes,
        characters: built.characters,
        backgrounds: projectBackgrounds,
        images: projectImages,
        audio: projectAudio,
        videos: {},
        variables: vars.variables,
        fonts: {},
        ui: {},
        uiScreens: {},
        gameResolution: { width: 1920, height: 1080, aspectRatio: '16:9' },
    } as unknown as VNProject;

    const stats: Record<string, number | string> = {
        commands: commands.length,
        characters: Object.keys(built.characters).length,
        variables: Object.keys(vars.variables).length,
        backgrounds: Object.keys(projectBackgrounds).length,
        images: Object.keys(projectImages).length,
        audio: Object.keys(projectAudio).length,
        bakedGrades: built.bakedCount,
        assetFiles: registry.files.size,
        assetBytes: registry.totalBytes(),
        gaps: gaps.length,
        externalTargets: assembly.externalTargets.length,
        undeclaredVariables: vars.undeclared.length,
        missingFromSource: missingFromSource.length,
        placeholderAssets: placeholders.size,
    };

    return { project, registry, gaps, stats, blockers, missingFromSource };
}
