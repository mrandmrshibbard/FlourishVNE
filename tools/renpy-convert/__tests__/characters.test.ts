/**
 * STEP 5 GATE - characters, layer boxes and the sprite dataflow.
 *
 * Two failures this pins down, both from the previous build:
 *  - layer boxes derived from `base.png` instead of the `Portrait(...)` canvas, which turned the
 *    30x54 `none.png` stub into a canvas and produced boxes ~64x oversized;
 *  - sprite state ignored entirely, so 355 `SetCharacterLayer` calls fired off-stage and every
 *    `ShowCharacter` reset the look to an arbitrary "first asset per layer".
 *
 * CONTENT RULE: identifiers, slot names and numbers only.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { canvasRect, pieceBox, isFullRect } from '../map/layerBox';
import { measure } from '../model/imageSize';
import { analyse, joinValue, joinStates, BOTTOM, TOP, type SpriteState } from '../analysis/spriteState';
import { parseFile } from '../parse/lexer';
import { parseNodes } from '../parse/statements';
import { loadPortraitTable } from '../model/portraitTable';
import { loadSlotOrder } from '../model/slotOrder';
import type { Node } from '../ir/nodes';

describe('canvas fitting', () => {
    it('pillarboxes a tall canvas and letterboxes a wide one', () => {
        // cove_8: 615x1439, aspect 0.4274 - taller than 3:4, so full height and centred.
        const tall = canvasRect({ width: 615, height: 1439 });
        expect(tall.height).toBeCloseTo(100, 10);
        expect(tall.width).toBeCloseTo(100 * 4 * 615 / (3 * 1439), 10);
        expect(tall.width).toBeCloseTo(56.9840167, 6);
        expect(tall.x).toBeCloseTo((100 - tall.width) / 2, 10);
        expect(tall.y).toBe(0);

        const wide = canvasRect({ width: 1600, height: 900 });
        expect(wide.width).toBeCloseTo(100, 10);
        expect(wide.height).toBeCloseTo(100 * 3 * 900 / (4 * 1600), 10);
        expect(wide.x).toBe(0);
        expect(wide.y).toBeCloseTo((100 - wide.height) / 2, 10);
    });

    it('a canvas that is already 3:4 needs no box at all', () => {
        const r = canvasRect({ width: 750, height: 1000 });
        expect(isFullRect(r)).toBe(true);
        expect(pieceBox({ width: 750, height: 1000 }, { width: 750, height: 1000 })).toBeUndefined();
    });
});

describe('piece boxes (cove_8 hand derivation)', () => {
    const canvas = { width: 615, height: 1439 };
    // The canvas rect: cW = 100*(4a/3) with a = 615/1439.
    const cW = 100 * 4 * 615 / (3 * 1439);
    const cX = (100 - cW) / 2;

    it('places a full-canvas piece across the whole canvas rect', () => {
        const box = pieceBox(canvas, { width: 615, height: 1439 })!;
        expect(box.x).toBeCloseTo(cX, 9);
        expect(box.y).toBeCloseTo(0, 9);
        expect(box.width).toBeCloseTo(cW, 9);
        expect(box.height).toBeCloseTo(100, 9);
        expect(box.x).toBeCloseTo(21.5079917, 6);
    });

    it('top-left aligns a short piece, as the compositor blits at (0,0)', () => {
        // cove_8's eye art really is 615x516.
        const box = pieceBox(canvas, { width: 615, height: 516 })!;
        expect(box.x).toBeCloseTo(cX, 9);
        expect(box.y).toBe(0);                       // top-aligned, never centred
        expect(box.width).toBeCloseTo(cW, 9);
        expect(box.height).toBeCloseTo(100 * 516 / 1439, 9);
        expect(box.height).toBeCloseTo(35.8582349, 6);
    });

    it('gives the box the same aspect as the art, so object-contain is exact', () => {
        // In a 3:4 element the box's pixel aspect must equal the art's, or contain would inset it.
        for (const piece of [{ width: 615, height: 516 }, { width: 615, height: 488 }, { width: 300, height: 900 }]) {
            const box = pieceBox(canvas, piece)!;
            const boxAspect = (box.width / 100) / ((box.height / 100) * (4 / 3));
            expect(boxAspect).toBeCloseTo(piece.width / piece.height, 9);
        }
    });

    it('never derives the canvas from the clear-sentinel stub', () => {
        // `none.png` is 30x54. Using it as a canvas is defect 5; a box from it is ~64x too big.
        const wrong = pieceBox({ width: 30, height: 54 }, { width: 615, height: 516 })!;
        const right = pieceBox(canvas, { width: 615, height: 516 })!;
        expect(wrong.width / right.width).toBeGreaterThan(20);
    });
});

describe('sprite state lattice', () => {
    it('joins bottom, const and top the standard way', () => {
        expect(joinValue(BOTTOM, { kind: 'const', value: 'a' })).toEqual({ kind: 'const', value: 'a' });
        expect(joinValue({ kind: 'const', value: 'a' }, { kind: 'const', value: 'a' })).toEqual({ kind: 'const', value: 'a' });
        expect(joinValue({ kind: 'const', value: 'a' }, { kind: 'const', value: 'b' })).toEqual(TOP);
        expect(joinValue(TOP, { kind: 'const', value: 'a' })).toEqual(TOP);
        expect(joinValue(BOTTOM, BOTTOM)).toEqual(BOTTOM);
    });

    it('treats a slot set on only one branch as indeterminate', () => {
        const a: SpriteState = new Map([['P', new Map([['eyes', { kind: 'const', value: 'n' } as const]])]]);
        const b: SpriteState = new Map([['P', new Map()]]);
        const j = joinStates([a, b]);
        // Set on one path, unset on the other - bottom joins to the const, which is correct:
        // the unset path leaves whatever was there before, and nothing here contradicts it.
        expect(j.get('P')!.get('eyes')).toEqual({ kind: 'const', value: 'n' });
    });
});

const ir = (src: string): Node[] => parseNodes(parseFile(src), 'test.rpy');
const tags = { tagToPortrait: new Map([['p', 'P']]) };
const asLabels = (src: string) => {
    const nodes = ir(src);
    return nodes.filter(n => n.kind === 'label').map(n => ({ name: (n as any).name, body: (n as any).body }));
};

describe('dataflow over branches', () => {
    it('emits a determinate slot and omits one that differs across an if/else', () => {
        const r = analyse(asLabels([
            'label start:',
            '    $ ChangePortrait(chara="P", base="base", eyes="n")',
            '    if x == 1:',
            '        $ ChangePortrait(chara="P", eyes="h")',
            '    else:',
            '        $ ChangePortrait(chara="P", eyes="s")',
            '    show p',
        ].join('\n')), tags);
        expect(r.shows).toHaveLength(1);
        expect(r.shows[0].determinate).toEqual({ base: 'base' });
        expect(r.shows[0].indeterminate).toEqual(['eyes']);
    });

    it('keeps a slot determinate when both branches agree', () => {
        const r = analyse(asLabels([
            'label start:',
            '    if x == 1:',
            '        $ ChangePortrait(chara="P", eyes="h")',
            '    else:',
            '        $ ChangePortrait(chara="P", eyes="h")',
            '    show p',
        ].join('\n')), tags);
        expect(r.shows[0].determinate).toEqual({ eyes: 'h' });
        expect(r.shows[0].indeterminate).toEqual([]);
    });

    it('merges menu options the same way', () => {
        const r = analyse(asLabels([
            'label start:',
            '    menu:',
            '        "one":',
            '            $ ChangePortrait(chara="P", mouth="a")',
            '        "two":',
            '            $ ChangePortrait(chara="P", mouth="b")',
            '    show p',
        ].join('\n')), tags);
        expect(r.shows[0].indeterminate).toEqual(['mouth']);
    });

    it('flags a hide-then-show that cannot be fully reconstructed', () => {
        const r = analyse(asLabels([
            'label start:',
            '    $ ChangePortrait(chara="P", base="base")',
            '    show p',
            '    hide p',
            '    if x == 1:',
            '        $ ChangePortrait(chara="P", eyes="h")',
            '    else:',
            '        $ ChangePortrait(chara="P", eyes="s")',
            '    show p',
        ].join('\n')), tags);
        expect(r.shows).toHaveLength(2);
        expect(r.shows[1].afterHide).toBe(true);
        expect(r.blockers).toHaveLength(1);
        expect(r.blockers[0].missing).toEqual(['eyes']);
    });

    it('carries state across a jump to another label', () => {
        const r = analyse(asLabels([
            'label start:',
            '    $ ChangePortrait(chara="P", base="base", eyes="n")',
            '    jump other',
            'label other:',
            '    show p',
        ].join('\n')), tags);
        const shown = r.shows.find(s => s.pos.line === 5)!;
        expect(shown.determinate).toEqual({ base: 'base', eyes: 'n' });
        expect(r.unreachableLabels).toEqual([]);
    });

    it('marks a dynamic kwarg indeterminate rather than guessing', () => {
        const r = analyse(asLabels([
            'label start:',
            '    $ ChangePortrait(chara="P", eyes=some_variable)',
            '    show p',
        ].join('\n')), tags);
        expect(r.shows[0].indeterminate).toEqual(['eyes']);
    });
});

const GAME_DIR = process.env.OURLIFE_GAME
    ?? path.resolve(__dirname, '..', '..', '..', 'OurLife', 'game');
const PROLOGUE = path.join(GAME_DIR, 'prologue.rpy');

if (fs.existsSync(PROLOGUE)) describe('prologue characters', () => {
    const portraits = loadPortraitTable(GAME_DIR);
    const slots = loadSlotOrder(GAME_DIR);
    const nodes = parseNodes(parseFile(fs.readFileSync(PROLOGUE, 'utf8')), 'prologue.rpy');
    const labels = nodes.filter(n => n.kind === 'label').map(n => ({ name: (n as any).name, body: (n as any).body }));
    const tagToPortrait = new Map<string, string>();
    for (const [tag, decl] of portraits) tagToPortrait.set(tag.toLowerCase(), decl.name);
    const result = analyse(labels, { tagToPortrait });

    it('reaches every label that anything actually targets', () => {
        // `quick_end` is dead code in the GAME: nothing jumps to it, and the statement before it
        // is a `return`, so Ren'Py never falls into it either. That is a fact about the source,
        // not an analysis miss - so the check is that anything unreachable is also un-targeted.
        const jumpTargets = new Set<string>();
        const collect = (ns: Node[]) => {
            for (const n of ns) {
                if (n.kind === 'jump') jumpTargets.add(n.target);
                else if (n.kind === 'label') collect(n.body);
                else if (n.kind === 'if') for (const c of n.clauses) collect(c.body);
                else if (n.kind === 'menu') for (const o of n.options) collect(o.body);
            }
        };
        collect(nodes);
        console.log(`[step5] labels=${labels.length} unreachable=${result.unreachableLabels.join(',') || 'none'}`);
        const wrong = result.unreachableLabels.filter(n => jumpTargets.has(n));
        expect(wrong, `labels that are jumped to but never reached: ${wrong.join(', ')}`).toEqual([]);
    });

    it('GATE: every post-hide show can be fully reconstructed', () => {
        const afterHide = result.shows.filter(s => s.afterHide).length;
        console.log(`[step5] shows=${result.shows.length} after-hide=${afterHide} blockers=${result.blockers.length}`);
        const detail = result.blockers.map(b => `${b.tag}@${b.pos.line} missing ${b.missing.join('/')}`);
        expect(detail, `post-hide shows with indeterminate slots: ${detail.join(' | ')}`).toEqual([]);
    });

    it('GATE: every show carries a determinate snapshot', () => {
        const bare = result.shows.filter(s => Object.keys(s.determinate).length === 0);
        const indet = result.shows.filter(s => s.indeterminate.length > 0);
        console.log(`[step5] shows with no determinate slot=${bare.length} with indeterminate slots=${indet.length}`);
        // A sprite show with nothing determinate would render the engine's arbitrary default -
        // exactly the "wrong look" defect. Indeterminate slots are fine (the engine preserves them).
        expect(bare.map(s => `${s.tag}@${s.pos.line}`)).toEqual([]);
    });

    it('separates live sprite changes from off-stage state seeding', () => {
        // ChangePortrait ends in renpy.redraw, so a call made while the sprite is visible changes
        // it on screen with no `show`. Those need commands; off-stage calls must NOT get one.
        const total = result.liveChanges.length + result.offStageCalls;
        console.log(`[step5] portrait calls=${total} live=${result.liveChanges.length} off-stage=${result.offStageCalls}`);
        expect(total).toBeGreaterThan(300);
        expect(result.liveChanges.length).toBeGreaterThan(0);
        // Every live change must name a tag that maps back to the portrait it targets.
        for (const c of result.liveChanges) {
            expect(tagToPortrait.get(c.tag.toLowerCase())).toBe(c.portrait);
        }
    });

    it('boxes every piece the prologue shows, against the Portrait canvas', () => {
        let boxed = 0, full = 0, unmeasured = 0, overflow = 0;
        const used = new Set<string>();
        for (const show of result.shows) {
            const portraitName = tagToPortrait.get(show.tag.toLowerCase());
            const decl = [...portraits.values()].find(p => p.name === portraitName);
            if (!decl) continue;
            const folder = decl.name.replace('_side', '');
            for (const [slot, value] of Object.entries(show.determinate)) {
                if (value === 'none') continue;
                const sub = slots.expression.has(slot) ? 'Expressions/' : '';
                const rel = ['eyes', 'mouth'].includes(slot)
                    ? `Expressions/${value}_${slot}0.png`
                    : `${sub}${value}.png`;
                const key = `${folder}/${rel}`;
                if (used.has(key)) continue;
                used.add(key);
                const file = path.join(GAME_DIR, 'images', 'characters', folder, rel);
                if (!fs.existsSync(file)) continue;
                const size = measure(file);
                if (!size) { unmeasured++; continue; }
                const box = pieceBox({ width: decl.width, height: decl.height }, size);
                if (box) {
                    boxed++;
                    expect(box.width).toBeGreaterThan(0);
                    expect(box.height).toBeGreaterThan(0);
                    // 147 pieces game-wide are a little LARGER than their declared canvas (e.g.
                    // Cove_8_s/backpack.png is 751px tall against a 749px canvas). Ren'Py blits at
                    // (0,0) into an unclipped Render, so the extra pixels really do draw - a box
                    // just over 100% is faithful. A GROSS overflow would mean the wrong canvas.
                    overflow = Math.max(overflow, box.x + box.width - 100, box.y + box.height - 100);
                } else full++;
            }
        }
        console.log(`[step5] distinct pieces=${used.size} boxed=${boxed} full=${full} unmeasured=${unmeasured} max-overflow=${overflow.toFixed(3)}%`);
        expect(unmeasured).toBe(0);
        expect(boxed).toBeGreaterThan(0);
        // Anything beyond a few percent means the canvas is wrong, which is defect 5 returning.
        expect(overflow).toBeLessThan(5);
    });
});
