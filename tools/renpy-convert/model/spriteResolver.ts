/**
 * Mirrors the game's own sprite path rules (character_sprite.rpy: GetFolder / GetImagePath /
 * get_image). Anything this cannot resolve is a hard gap — never a placeholder.
 *
 * Rules, verbatim from the source:
 *   folder            = Portrait.name with "_side" removed        (matched case-insensitively)
 *   eyes / mouth      -> images/characters/<folder>/Expressions/<value>_<slot><frame>.png
 *   other expression  -> images/characters/<folder>/Expressions/<value>.png
 *   other slot        -> images/characters/<folder>/<value>.png
 *   blink / lipflap   -> images/characters/<folder>/Expressions/<mood>_<slot><frame>.png
 *   magic slot        -> images/characters/<folder>/<value>1.png and <value>2.png
 *   value === "none"  -> NOT an asset; it is the CLEAR sentinel (maps to layerOverrides = null)
 */
import type { AssetIndex } from './assetIndex';
import { resolvePath } from './assetIndex';
import type { PortraitDecl } from './portraitTable';
import type { SlotOrder } from './slotOrder';

export const CHARACTERS_URL = 'images/characters';
/** Ren'Py's sentinel meaning "this layer shows nothing". */
export const CLEAR_VALUE = 'none';

export interface SpriteRef {
    kind: 'asset' | 'clear';
    /** Absolute path on disk (kind === 'asset'). */
    file?: string;
    /** Game-relative path, for stable ids and reporting. */
    rel?: string;
}

/**
 * `eyes` and `mouth` never use the plain expression path.
 *
 * The renderer special-cases both BEFORE its generic expression branch and always routes them
 * through `get_image(value, slot, frame)`, so their value is a MOOD and the art is a numbered
 * frame set: `Expressions/<mood>_<slot><0|1|2>.png`. Frame 0 is the resting pose. Treating them
 * like the other expression slots looks for `Expressions/<mood>.png`, which does not exist for
 * any character - it fails on every eyes/mouth value in the game.
 */
export const FRAME_SLOTS = new Set(['eyes', 'mouth']);

export const folderFor = (p: PortraitDecl): string => p.name.replace('_side', '');

/** The single non-frame art file for one (portrait, slot, value). */
export function resolveSprite(
    index: AssetIndex,
    slots: SlotOrder,
    portrait: PortraitDecl,
    slot: string,
    value: string,
): SpriteRef | null {
    if (value === CLEAR_VALUE) return { kind: 'clear' };
    const folder = folderFor(portrait);
    // Resting art for a frame slot is frame 0; frames 1/2 exist only when that mood blinks.
    const rel = FRAME_SLOTS.has(slot)
        ? `${CHARACTERS_URL}/${folder}/Expressions/${value}_${slot}0.png`
        : `${CHARACTERS_URL}/${folder}/${slots.expression.has(slot) ? 'Expressions/' : ''}${value}.png`;
    const file = resolvePath(index, rel);
    return file ? { kind: 'asset', file, rel } : null;
}

/**
 * Blink / lipflap frames for an expression slot: `<mood>_<slot><0|1|2>.png`.
 * Returns null when the mood has no frame set (so the caller emits a static asset, not a
 * half-built animation).
 */
export function resolveFrames(
    index: AssetIndex,
    portrait: PortraitDecl,
    slot: 'eyes' | 'mouth',
    mood: string,
): { file: string; rel: string }[] | null {
    const folder = folderFor(portrait);
    const out: { file: string; rel: string }[] = [];
    for (const frame of [0, 1, 2]) {
        const rel = `${CHARACTERS_URL}/${folder}/Expressions/${mood}_${slot}${frame}.png`;
        const file = resolvePath(index, rel);
        if (!file) return null;
        out.push({ file, rel });
    }
    return out;
}

/** The 2-frame pair for a `magic` slot. */
export function resolveMagicPair(
    index: AssetIndex,
    portrait: PortraitDecl,
    value: string,
): { file: string; rel: string }[] | null {
    const folder = folderFor(portrait);
    const out: { file: string; rel: string }[] = [];
    for (const n of [1, 2]) {
        const rel = `${CHARACTERS_URL}/${folder}/${value}${n}.png`;
        const file = resolvePath(index, rel);
        if (!file) return null;
        out.push({ file, rel });
    }
    return out;
}
