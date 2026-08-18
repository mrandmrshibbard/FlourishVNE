/**
 * `image <tag> = Portrait(name=…, width=…, height=…)` declarations.
 *
 * The `width`/`height` kwargs are the AUTHORITATIVE sprite canvas. The previous converter read
 * the canvas from `base.png` instead, and one character's `base.png` is a 30x54 stub against
 * 1920x591 pieces — which produced layer boxes ~64x the frame. Every geometry formula keys off
 * these numbers, so they are parsed, required, and validated.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface PortraitDecl {
    /** The Ren'Py image tag, i.e. what `show <tag>` names. */
    tag: string;
    /** `name=` — also the basis for the art folder (see spriteResolver). */
    name: string;
    /** `portraitName=`, when present. */
    portraitName?: string;
    speaker?: string;
    animateEyes: boolean;
    animateMouth: boolean;
    /** Canvas width in Ren'Py virtual px. */
    width: number;
    /** Canvas height in Ren'Py virtual px. */
    height: number;
}

const kwargs = (s: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const m of s.matchAll(/(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([\w.\-]+))/g)) {
        out[m[1]] = m[2] ?? m[3] ?? m[4];
    }
    return out;
};

export function loadPortraitTable(gameDir: string): Map<string, PortraitDecl> {
    const file = path.join(gameDir, 'character_definitions.rpy');
    const src = fs.readFileSync(file, 'utf8');
    const table = new Map<string, PortraitDecl>();
    for (const m of src.matchAll(/^\s*image\s+([\w.]+)\s*=\s*Portrait\(([^)]*)\)/gm)) {
        const tag = m[1];
        const kw = kwargs(m[2]);
        const width = Number(kw.width);
        const height = Number(kw.height);
        // A canvas is required: every position/scale/box formula divides by it. Guessing one
        // (the old `base.png` heuristic) is exactly how sprites ended up 2.37x too small.
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            throw new Error(`portraitTable: ${tag} has no usable Portrait(width,height)`);
        }
        table.set(tag, {
            tag,
            name: kw.name ?? tag,
            portraitName: kw.portraitName,
            speaker: kw.speaker,
            animateEyes: kw.animateEyes === 'True',
            animateMouth: kw.animateMouth === 'True',
            width,
            height,
        });
    }
    if (table.size === 0) throw new Error('portraitTable: no Portrait declarations found');
    return table;
}
