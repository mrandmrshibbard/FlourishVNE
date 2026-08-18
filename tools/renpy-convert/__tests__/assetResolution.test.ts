/**
 * STEP 2 GATE — every (portrait, slot, value) the prologue asks for must resolve to a real file.
 *
 * This is the check that would have caught the 100%-placeholder build: the old pipeline pointed
 * at a directory that no longer existed, `existsSync` guarded each lookup, and an index with ZERO
 * entries looked exactly like success. Here a miss is a test failure with the identifiers named.
 *
 * CONTENT RULE: this file and its output carry counts, slot names and asset identifiers only —
 * never a line of game text.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadSlotOrder } from '../model/slotOrder';
import { loadPortraitTable } from '../model/portraitTable';
import { buildAssetIndex } from '../model/assetIndex';
import { resolveSprite, resolveMagicPair, resolveFrames, folderFor, CLEAR_VALUE, FRAME_SLOTS } from '../model/spriteResolver';
import { extractChangePortraitCalls } from '../parse/changePortrait';
import type { PortraitDecl } from '../model/portraitTable';

/* A file needs at least one suite that always registers, or vitest reports "no test suite found"
 * on a checkout without the game. These pin the two path rules that cost the most to get wrong. */
describe('sprite path rules', () => {
    it('treats eyes and mouth as FRAME slots, not plain expression slots', () => {
        // The renderer special-cases both before its generic expression branch and always routes
        // them through get_image(value, slot, frame) -> Expressions/<mood>_<slot><0|1|2>.png.
        // Looking for Expressions/<mood>.png fails on every eyes/mouth value in the game.
        expect(FRAME_SLOTS.has('eyes')).toBe(true);
        expect(FRAME_SLOTS.has('mouth')).toBe(true);
        expect(FRAME_SLOTS.has('brows')).toBe(false);
    });

    it('keeps `none` as the CLEAR sentinel rather than a file', () => {
        // none.png is a 30x54 stub; resolving it as art is how boxes ended up ~64x oversized.
        expect(CLEAR_VALUE).toBe('none');
    });

    it('derives a folder by dropping the _side suffix', () => {
        expect(folderFor({ name: 'Cove_8_side' } as any)).toBe('Cove_8');
        expect(folderFor({ name: 'Cliff' } as any)).toBe('Cliff');
    });
});

const GAME_DIR = process.env.OURLIFE_GAME
    ?? path.resolve(__dirname, '..', '..', '..', 'OurLife', 'game');

const present = fs.existsSync(path.join(GAME_DIR, 'prologue.rpy'))
    && fs.existsSync(path.join(GAME_DIR, 'character_definitions.rpy'));

/* Registered only when the game is present: the source never ships with the repo, so a clean
 * checkout must still go green. `describe.skip` is not enough - vitest still RUNS the factory to
 * collect tests, and the eager loaders at the top of the block would throw. The CLI exits
 * non-zero instead when its --src is wrong. */


if (present) describe('prologue sprite resolution', () => {
    const slots = loadSlotOrder(GAME_DIR);
    const portraits = loadPortraitTable(GAME_DIR);
    const index = buildAssetIndex(GAME_DIR);
    const calls = extractChangePortraitCalls(fs.readFileSync(path.join(GAME_DIR, 'prologue.rpy'), 'utf8'));

    const byName = new Map<string, PortraitDecl>();
    for (const decl of portraits.values()) if (!byName.has(decl.name)) byName.set(decl.name, decl);

    it('parses the slot order and portrait table', () => {
        expect(slots.order.length).toBeGreaterThan(0);
        expect(new Set(slots.order).size).toBe(slots.order.length);
        // A declared slot with no place in the render order is dead art in Ren'Py too - the
        // renderer only draws keys it finds in `order`. Recorded, not enforced: emitting a layer
        // for one would show something the original game never shows.
        console.log(`[step2] slots=${slots.order.length} orphans=${[...slots.orphans].join(',') || 'none'}`);
        for (const s of slots.order) expect(slots.orphans.has(s)).toBe(false);
        expect(portraits.size).toBeGreaterThan(0);
        for (const p of portraits.values()) {
            expect(p.width).toBeGreaterThan(0);
            expect(p.height).toBeGreaterThan(0);
        }
    });

    it('finds a non-empty asset index', () => {
        expect(index.byPath.size).toBeGreaterThan(1000);
    });

    it('names a declared portrait in every ChangePortrait call', () => {
        expect(calls.length).toBeGreaterThan(0);
        const unknown = [...new Set(calls.map(c => c.chara).filter(n => !byName.has(n)))];
        expect(unknown, `ChangePortrait targets with no Portrait() declaration: ${unknown.join(', ')}`).toEqual([]);
    });

    it('uses only slots that exist in the global slot order', () => {
        const known = new Set(slots.order);
        const bad = new Set<string>();
        for (const c of calls) for (const slot of Object.keys(c.slots)) if (!known.has(slot)) bad.add(slot);
        expect([...bad], `kwargs that are not sprite slots: ${[...bad].join(', ')}`).toEqual([]);
    });

    it('GATE: resolves every (portrait, slot, value) triple to a real file — 0 unresolved', () => {
        const triples = new Map<string, { chara: string; slot: string; value: string; line: number }>();
        for (const c of calls) {
            for (const [slot, value] of Object.entries(c.slots)) {
                const key = `${c.chara}|${slot}|${value}`;
                if (!triples.has(key)) triples.set(key, { chara: c.chara, slot, value, line: c.line });
            }
        }

        const unresolved: string[] = [];
        let assets = 0;
        let clears = 0;
        for (const t of triples.values()) {
            const portrait = byName.get(t.chara);
            if (!portrait) continue;                       // already asserted above
            if (t.value === CLEAR_VALUE) { clears++; continue; }
            const hit = slots.magic.has(t.slot)
                ? resolveMagicPair(index, portrait, t.value)
                : resolveSprite(index, slots, portrait, t.slot, t.value);
            if (!hit) {
                unresolved.push(`${folderFor(portrait)}/${t.slot}=${t.value} (prologue.rpy:${t.line})`);
                continue;
            }
            assets++;
        }

        // Counts + identifiers only. Never a line of game text.
        console.log(`[step2] calls=${calls.length} triples=${triples.size} assets=${assets} clears=${clears} unresolved=${unresolved.length}`);
        expect(unresolved, `unresolved sprite art:\n  ${unresolved.join('\n  ')}`).toEqual([]);
    });

    it('reports blink frame coverage without demanding it', () => {
        // A mood with no 0/1/2 frame set is a STATIC layer, not a broken animation — so this
        // records coverage rather than gating on it. A zero here would mean blink is impossible.
        let withFrames = 0;
        let staticOnly = 0;
        const moods = new Set<string>();
        for (const c of calls) {
            const portrait = byName.get(c.chara);
            const eyes = c.slots['eyes'];
            if (!portrait || !portrait.animateEyes || !eyes || eyes === CLEAR_VALUE) continue;
            const key = `${portrait.name}|${eyes}`;
            if (moods.has(key)) continue;
            moods.add(key);
            if (resolveFrames(index, portrait, 'eyes', eyes)) withFrames++; else staticOnly++;
        }
        console.log(`[step2] blink moods=${moods.size} animated=${withFrames} static=${staticOnly}`);
        expect(withFrames + staticOnly).toBe(moods.size);
    });

    it('records how many portrait kwargs are non-literal', () => {
        // The old converter silently DROPPED these; the rebuild must classify them. Recorded now
        // so Step 5's dataflow has a number to close against.
        const dyn = new Map<string, number>();
        for (const c of calls) for (const [slot, expr] of Object.entries(c.dynamic)) {
            dyn.set(slot, (dyn.get(slot) ?? 0) + 1);
            expect(expr.length).toBeGreaterThan(0);
        }
        const total = [...dyn.values()].reduce((a, b) => a + b, 0);
        console.log(`[step2] dynamic kwargs=${total} slots=${[...dyn.keys()].join(',') || 'none'}`);
        expect(total).toBeGreaterThanOrEqual(0);
    });
});
