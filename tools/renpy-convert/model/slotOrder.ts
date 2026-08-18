/**
 * The sprite layer order, read from the game rather than hard-coded.
 *
 * Ren'Py composes a character by blitting a fixed, globally-ordered list of layer slots
 * (`characterSpritePartsOrder_const`). Flourish resolves layer order from the INSERTION ORDER of
 * `VNCharacter.layers` when no pose is set, so emitting layers in this exact order is what makes
 * hair sit over face and glasses over eyes. Parsing it (instead of transcribing 62 names by hand)
 * means a game-side edit surfaces as a diff, not as silently wrong stacking.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface SlotOrder {
    /** All slots, back-to-front. Flourish layer insertion order must follow this. */
    order: string[];
    /** Slots whose art lives in the `Expressions/` subfolder. */
    expression: Set<string>;
    /** Slots drawn with a pulsing opacity oscillator (not reproducible declaratively). */
    glowing: Set<string>;
    /** Slots drawn as a 2-frame cross-fade (`<value>1.png` / `<value>2.png`). */
    magic: Set<string>;
    /**
     * Slots that are declared but have NO position in `order`.
     *
     * The renderer walks `characterSpritePartsOrder_const` and draws only the keys it finds
     * there, so a slot missing from that list is dead art in Ren'Py itself - setting it changes
     * nothing on screen. A faithful conversion must therefore NOT emit a layer for it; doing so
     * would make the recreation show something the original never shows.
     */
    orphans: Set<string>;
}

/**
 * Reads `<name> = [ "a", "b", ... ]` out of the .rpy source.
 *
 * Deliberately NOT a constructed RegExp: a template literal swallows the backslash in `\s`,
 * so `new RegExp(`${name}\s*=...`)` silently degrades to a pattern that can never match and
 * the loader throws "not found" on a file that is perfectly fine. Slicing has no escape layer.
 */
const listAfter = (src: string, name: string): string[] => {
    // Match the assignment, not a mention: the name must be followed by '=' across blanks only.
    let at = -1;
    for (let i = src.indexOf(name); i !== -1; i = src.indexOf(name, i + 1)) {
        const before = i === 0 ? ' ' : src[i - 1];
        if (/[A-Za-z0-9_]/.test(before)) continue;          // part of a longer identifier
        const rest = src.slice(i + name.length);
        const eq = /^[ 	]*=[ 	]*\[/.exec(rest);
        if (!eq) continue;
        at = i + name.length + eq[0].length;                // first char inside the brackets
        break;
    }
    if (at === -1) throw new Error(`slotOrder: could not find "${name} = [...]" in character_definitions.rpy`);
    const close = src.indexOf(']', at);
    if (close === -1) throw new Error(`slotOrder: unterminated list for "${name}"`);
    const body = src.slice(at, close);
    const items = [...body.matchAll(/"([^"]+)"/g)].map(x => x[1]);
    if (!items.length) throw new Error(`slotOrder: "${name}" parsed to an EMPTY list`);
    return items;
};

export function loadSlotOrder(gameDir: string): SlotOrder {
    const file = path.join(gameDir, 'character_definitions.rpy');
    const src = fs.readFileSync(file, 'utf8');
    const order = listAfter(src, 'characterSpritePartsOrder_const');
    const dupes = order.filter((s, i) => order.indexOf(s) !== i);
    if (dupes.length) throw new Error(`slotOrder: duplicate slots ${dupes.join(', ')}`);
    const expression = new Set(listAfter(src, 'characterSpriteExpressions'));
    const glowing = new Set(listAfter(src, 'characterSpriteGlowing'));
    const magic = new Set(listAfter(src, 'characterSpriteMagic'));
    const inOrder = new Set(order);
    const orphans = new Set(
        [...expression, ...glowing, ...magic].filter(slot => !inOrder.has(slot)),
    );
    return { order, expression, glowing, magic, orphans };
}
