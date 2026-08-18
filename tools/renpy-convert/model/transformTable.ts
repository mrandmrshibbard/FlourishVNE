/**
 * Parses `transform <name>:` blocks out of the .rpy source.
 *
 * Across all 335 transforms the game defines, only four properties ever appear: `xpos`, `ypos`,
 * `zoom` and (twice) `yalign` + `yoffset`. Anything outside that set is a HARD FAIL rather than a
 * silent skip - an unparsed property is exactly how a sprite ends up in the wrong place with no
 * warning. Omitted properties take Ren'Py's own documented defaults (xpos/ypos 0, zoom 1.0);
 * that is the language's behaviour, not a converter guess.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface RenpyTransform {
    name: string;
    file: string;
    line: number;
    zoom: number;
    /** Post-normalisation absolute position in Ren'Py virtual px, anchor (0,0). */
    xpos?: number;
    ypos?: number;
    xalign?: number;
    yalign?: number;
    xoffset: number;
    yoffset: number;
}

/**
 * A transform defined more than once.
 *
 * The game does this 8 times. Six are byte-identical re-declarations and harmless, but two
 * (`pos_m24_closer`, `pos_t23_closer`) carry DIFFERENT numbers. Ren'Py resolves that by letting
 * the last definition win, so this parser does the same and records the clash rather than
 * throwing - refusing to parse would stop a conversion over a placement the prologue never uses,
 * and silently taking the first would place a sprite where the game does not.
 */
export interface TransformConflict {
    name: string;
    /** True when the bodies actually differ; a duplicate with identical numbers is noise. */
    differs: boolean;
    lines: number[];
}

export interface TransformTable {
    byName: Map<string, RenpyTransform>;
    conflicts: TransformConflict[];
}

/** Properties this converter understands. Anything else must stop the run. */
const KNOWN = new Set(['xpos', 'ypos', 'zoom', 'xalign', 'yalign', 'xoffset', 'yoffset']);

const num = (tok: string): number | null => {
    const v = Number(tok);
    return Number.isFinite(v) ? v : null;
};

const sameBody = (a: RenpyTransform, b: RenpyTransform): boolean =>
    a.zoom === b.zoom && a.xpos === b.xpos && a.ypos === b.ypos
    && a.xalign === b.xalign && a.yalign === b.yalign
    && a.xoffset === b.xoffset && a.yoffset === b.yoffset;

export function parseTransforms(src: string, file: string): TransformTable {
    const out = new Map<string, RenpyTransform>();
    const conflicts = new Map<string, TransformConflict>();
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const head = /^(\s*)transform\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/.exec(lines[i]);
        if (!head) continue;
        const indent = head[1].length;
        const t: RenpyTransform = { name: head[2], file, line: i + 1, zoom: 1, xoffset: 0, yoffset: 0 };
        for (let j = i + 1; j < lines.length; j++) {
            const raw = lines[j];
            if (!raw.trim() || raw.trim().startsWith('#')) continue;
            const ind = raw.length - raw.trimStart().length;
            if (ind <= indent) break;                       // block ended
            // Properties may share a line: `yalign 1.0 yoffset 40`.
            const toks = raw.trim().split(/\s+/);
            for (let k = 0; k < toks.length; k += 2) {
                const key = toks[k];
                const val = num(toks[k + 1] ?? '');
                if (!KNOWN.has(key)) {
                    throw new Error(`transform ${t.name} (${file}:${j + 1}): unsupported property "${key}"`);
                }
                if (val === null) {
                    throw new Error(`transform ${t.name} (${file}:${j + 1}): non-numeric value for "${key}"`);
                }
                (t as unknown as Record<string, number>)[key] = val;
            }
        }
        const prior = out.get(t.name);
        if (prior) {
            const c = conflicts.get(t.name) ?? { name: t.name, differs: false, lines: [prior.line] };
            c.differs = c.differs || !sameBody(prior, t);
            c.lines.push(t.line);
            conflicts.set(t.name, c);
        }
        out.set(t.name, t);            // last definition wins, as Ren'Py does
    }
    return { byName: out, conflicts: [...conflicts.values()] };
}

export function loadTransforms(gameDir: string, files = ['script.rpy']): TransformTable {
    const out = new Map<string, RenpyTransform>();
    const conflicts: TransformConflict[] = [];
    for (const f of files) {
        const full = path.join(gameDir, f);
        if (!fs.existsSync(full)) continue;
        const table = parseTransforms(fs.readFileSync(full, 'utf8'), f);
        for (const [name, t] of table.byName) out.set(name, t);
        conflicts.push(...table.conflicts);
    }
    if (!out.size) throw new Error(`loadTransforms: no transforms found in ${files.join(', ')}`);
    return { byName: out, conflicts };
}

/**
 * Collapse `xalign`/`yalign`/`x?offset` into a plain anchor-(0,0) position.
 *
 * `xalign a` in Ren'Py sets BOTH the anchor and the position to `a`, so the point `a` of the way
 * across the art lands `a` of the way across the screen. With the art `a`-anchored that is the
 * same as an anchor-0 position of `a * (screen - art)`. Doing this first means everything
 * downstream deals in one coordinate convention.
 */
export function resolvePosition(
    t: RenpyTransform,
    artW: number,
    artH: number,
    screen: { width: number; height: number },
): { xpos: number; ypos: number; zoom: number } {
    const zoom = t.zoom;
    const xpos = t.xalign !== undefined
        ? t.xalign * (screen.width - artW * zoom)
        : (t.xpos ?? 0);
    const ypos = t.yalign !== undefined
        ? t.yalign * (screen.height - artH * zoom)
        : (t.ypos ?? 0);
    return { xpos: xpos + t.xoffset, ypos: ypos + t.yoffset, zoom };
}
