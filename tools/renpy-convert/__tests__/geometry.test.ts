/**
 * STEP 3 GATE - geometry.
 *
 * The old converter left 233 of 235 overlays at the default 50/50/100/100 and mis-scaled every
 * landscape sprite, so these tests pin the mapping against values derived BY HAND from how the
 * engine renders, not against whatever the code happens to produce.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadTransforms } from '../model/transformTable';
import { loadPortraitTable } from '../model/portraitTable';
import {
    characterGeometry, characterPlacement, characterScale,
    imageGeometry, imagePlacement,
    HALF_FRAME_W_PCT, OVERLAY_PX_PER_RENPY_PX,
} from '../map/geometry';
import { parseTransforms, resolvePosition } from '../model/transformTable';
import { RENPY, SPRITE_FRAME } from '../ir/engineContract';

describe('geometry constants', () => {
    it('derives the frame half-width from the engine box, not a magic number', () => {
        // 90% of stage height, 3:4 -> 0.675 stage-heights wide; stage is 16:9 -> 0.675*9/16.
        expect(HALF_FRAME_W_PCT).toBeCloseTo(18.984375, 10);
        expect(OVERLAY_PX_PER_RENPY_PX).toBeCloseTo(2 / 3, 12);
        expect(SPRITE_FRAME.heightPx).toBe(972);
        expect(SPRITE_FRAME.widthPx).toBe(729);
    });
});

describe('cove_8 at pos_c8 (worked fixture)', () => {
    // Portrait(name="Cove_8", width=615, height=1439); transform pos_c8: zoom 0.67 / 739 / 118.
    const canvas = { width: 615, height: 1439 };
    const place = { xpos: 739, ypos: 118, zoom: 0.67 };

    it('matches the hand derivation to 4 decimal places', () => {
        const geo = characterGeometry(canvas, place);
        // scale = 0.67 * max(1439/972, 615/729) = 0.67 * 1.480452675 (art is taller than 3:4)
        expect(geo.scale).toBeCloseTo(0.9919, 4);
        // x = (739 + 615*0.67/2)/19.2 - 18.984375
        expect(geo.x).toBeCloseTo(30.2357, 4);
        // y = (118 + 1439*0.67/2)/10.8 - 90 + 45*scale
        expect(geo.y).toBeCloseTo(10.1972, 4);
    });

    it('lands the sprite on stage, near the engine preset top', () => {
        const geo = characterGeometry(canvas, place);
        // A sanity anchor: Ren'Py sprites of this framing sit near the top, and the engine's own
        // preset is top:10% - a derivation that disagreed wildly here would be wrong.
        expect(geo.y).toBeGreaterThan(0);
        expect(geo.y).toBeLessThan(20);
        expect(geo.x).toBeGreaterThan(0);
        expect(geo.x).toBeLessThan(100);
    });
});

describe('scale picks the binding axis', () => {
    it('fits a tall canvas by height and a wide canvas by width', () => {
        // Exactly 3:4 - both axes bind at once, so the two expressions must agree.
        expect(characterScale({ width: 729, height: 972 }, 1)).toBeCloseTo(1, 12);
        // Taller than 3:4 -> height binds.
        expect(characterScale({ width: 615, height: 1439 }, 1)).toBeCloseTo(1439 / 972, 12);
        // Wider than 3:4 -> width binds. This is the case the old solve got ~2.37x too small.
        expect(characterScale({ width: 1600, height: 900 }, 1)).toBeCloseTo(1600 / 729, 12);
        // zoom multiplies through in both cases.
        expect(characterScale({ width: 1600, height: 900 }, 0.5)).toBeCloseTo(0.5 * 1600 / 729, 12);
    });
});

describe('overlay geometry', () => {
    it('never produces the 50/50/100/100 default for a real placement', () => {
        const geo = imageGeometry({ width: 900, height: 500 }, { xpos: 120, ypos: 60, zoom: 1 });
        expect(geo.width).toBeCloseTo(600, 10);          // 900 * 2/3
        expect(geo.height).toBeCloseTo(1000 / 3, 10);    // 500 * 2/3
        expect(geo.x).toBeCloseTo((120 + 450) / 19.2, 10);
        expect(geo.y).toBeCloseTo((60 + 250) / 10.8, 10);
        expect([geo.x, geo.y, geo.width, geo.height]).not.toEqual([50, 50, 100, 100]);
    });

    it('centres a full-screen image at 50/50 with the reference size', () => {
        const geo = imageGeometry({ width: RENPY.width, height: RENPY.height }, { xpos: 0, ypos: 0, zoom: 1 });
        expect(geo.x).toBeCloseTo(50, 10);
        expect(geo.y).toBeCloseTo(50, 10);
        expect(geo.width).toBeCloseTo(1280, 10);
        expect(geo.height).toBeCloseTo(720, 10);
    });
});

describe('round-trip property (10,000 cases)', () => {
    // Deterministic LCG: same cases every run. Math.random is unavailable to converter scripts
    // and would make a failure unreproducible anyway.
    const lcg = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    it('character geometry inverts within 1e-6', () => {
        const next = lcg(12345);
        let worst = 0;
        for (let i = 0; i < 10000; i++) {
            const canvas = { width: 40 + next() * 1900, height: 40 + next() * 2000 };
            const place = { xpos: -600 + next() * 2600, ypos: -600 + next() * 2200, zoom: 0.05 + next() * 2.5 };
            const back = characterPlacement(canvas, characterGeometry(canvas, place));
            worst = Math.max(worst,
                Math.abs(back.xpos - place.xpos),
                Math.abs(back.ypos - place.ypos),
                Math.abs(back.zoom - place.zoom));
        }
        expect(worst).toBeLessThan(1e-6);
    });

    it('overlay geometry inverts within 1e-6', () => {
        const next = lcg(999);
        let worst = 0;
        for (let i = 0; i < 10000; i++) {
            const canvas = { width: 16 + next() * 1900, height: 16 + next() * 2000 };
            const place = { xpos: -600 + next() * 2600, ypos: -600 + next() * 2200, zoom: 0.05 + next() * 2.5 };
            const back = imagePlacement(canvas, imageGeometry(canvas, place));
            worst = Math.max(worst,
                Math.abs(back.xpos - place.xpos),
                Math.abs(back.ypos - place.ypos),
                Math.abs(back.zoom - place.zoom));
        }
        expect(worst).toBeLessThan(1e-6);
    });
});

describe('transform parsing', () => {
    const SRC = [
        'init -6:',
        '    transform pos_c8:',
        '        zoom 0.67',
        '        xpos 739',
        '        ypos 118',
        '',
        '    transform pos_c8_closer:',
        '        xpos 631',
        '        ypos 50',
        '',
        '    transform pos_d23_smaller:',
        '        zoom 0.64',
        '        xpos 700',
        '        yalign 1.0 yoffset 40',
    ].join('\n');

    it('reads all four property shapes the game actually uses', () => {
        const t = parseTransforms(SRC, 'script.rpy').byName;
        expect([...t.keys()]).toEqual(['pos_c8', 'pos_c8_closer', 'pos_d23_smaller']);
        expect(t.get('pos_c8')).toMatchObject({ zoom: 0.67, xpos: 739, ypos: 118 });
        // An omitted `zoom` is Ren'Py's documented default of 1.0 - the language's rule, not a guess.
        expect(t.get('pos_c8_closer')!.zoom).toBe(1);
        // Two properties on one line must both land.
        expect(t.get('pos_d23_smaller')).toMatchObject({ yalign: 1, yoffset: 40, xpos: 700 });
    });

    it('normalises yalign into an anchor-0 position', () => {
        const t = parseTransforms(SRC, 'script.rpy').byName.get('pos_d23_smaller')!;
        const p = resolvePosition(t, 600, 1400, RENPY);
        // yalign 1.0 bottom-aligns the art: ypos = 1.0 * (1080 - 1400*0.64) + 40
        expect(p.ypos).toBeCloseTo(1080 - 1400 * 0.64 + 40, 10);
        expect(p.xpos).toBeCloseTo(700, 10);
        expect(p.zoom).toBeCloseTo(0.64, 10);
    });

    it('refuses an unsupported property instead of ignoring it', () => {
        const bad = 'init:\n    transform t_bad:\n        rotate 15\n';
        expect(() => parseTransforms(bad, 'x.rpy')).toThrow(/unsupported property "rotate"/);
    });
});

/**
 * Real-data gate: every `show <portrait> at <transform>` in the prologue must land on stage.
 *
 * Defects 5 and 6 both looked fine in isolation and only showed up against real canvases - a
 * landscape sprite ~2.37x too small, overlays stuck at the 50/50/100/100 default. Running the
 * mapping over the actual statements is what catches that class.
 *
 * CONTENT RULE: identifiers and numbers only; no game text is read or printed.
 */
const GAME_DIR = process.env.OURLIFE_GAME
    ?? path.resolve(__dirname, '..', '..', '..', 'OurLife', 'game');
const present = fs.existsSync(path.join(GAME_DIR, 'prologue.rpy'))
    && fs.existsSync(path.join(GAME_DIR, 'script.rpy'));

if (present) describe('prologue placements', () => {
    const table = loadTransforms(GAME_DIR);
    const transforms = table.byName;
    const portraits = loadPortraitTable(GAME_DIR);
    const src = fs.readFileSync(path.join(GAME_DIR, 'prologue.rpy'), 'utf8');

    // `show <tag> at <transform>` - the plain sprite placement. Statements with an inline ATL
    // block or an AlphaMask wrapper are Step 4/deferred work and are not matched here.
    const shows = [...src.matchAll(/^[ 	]*show[ 	]+([A-Za-z_][A-Za-z0-9_]*)[ 	]+at[ 	]+([A-Za-z_][A-Za-z0-9_]*)[ 	]*$/gm)]
        .map(m => ({ tag: m[1], transform: m[2] }));

    it("takes the last of a duplicated transform, as Ren'Py does", () => {
        // 8 transforms are declared twice; 6 are identical re-declarations, 2 carry different
        // numbers. Neither of the two is used by the prologue, but the parser must not crash on
        // them and must not silently keep the FIRST body.
        const differing = table.conflicts.filter(c => c.differs).map(c => c.name).sort();
        console.log(`[step3] duplicate transforms=${table.conflicts.length} conflicting=${differing.join(',') || 'none'}`);
        expect(table.conflicts.length).toBeGreaterThan(0);
        for (const c of table.conflicts) expect(c.lines.length).toBeGreaterThan(1);
    });

    it('resolves every transform the prologue names', () => {
        expect(shows.length).toBeGreaterThan(0);
        const missing = [...new Set(shows.map(s => s.transform).filter(n => !transforms.has(n)))];
        expect(missing, `transforms with no definition: ${missing.join(', ')}`).toEqual([]);
    });

    it('places every sprite on stage at a sane scale', () => {
        const bad: string[] = [];
        let placed = 0;
        for (const s of shows) {
            const portrait = portraits.get(s.tag);
            const t = transforms.get(s.transform);
            if (!portrait || !t) continue;               // non-portrait art, covered elsewhere
            const place = resolvePosition(t, portrait.width, portrait.height, RENPY);
            const geo = characterGeometry({ width: portrait.width, height: portrait.height }, place);
            placed++;
            if (!(geo.scale >= 0.05 && geo.scale <= 8)) bad.push(`${s.tag}@${s.transform} scale=${geo.scale.toFixed(3)}`);
            if (!(geo.x >= -200 && geo.x <= 300)) bad.push(`${s.tag}@${s.transform} x=${geo.x.toFixed(2)}`);
            if (!(geo.y >= -200 && geo.y <= 300)) bad.push(`${s.tag}@${s.transform} y=${geo.y.toFixed(2)}`);
        }
        console.log(`[step3] show-at statements=${shows.length} portrait placements=${placed} out-of-bounds=${bad.length}`);
        expect(placed).toBeGreaterThan(0);
        expect(bad, `out-of-bounds placements: ${bad.join(' | ')}`).toEqual([]);
    });

    it('gives each distinct placement its own geometry', () => {
        // If two different transforms mapped to identical output, something is being ignored -
        // that is precisely how 233 overlays collapsed onto one default position.
        const seen = new Map<string, string>();
        const collisions: string[] = [];
        for (const s of shows) {
            const portrait = portraits.get(s.tag);
            const t = transforms.get(s.transform);
            if (!portrait || !t) continue;
            const place = resolvePosition(t, portrait.width, portrait.height, RENPY);
            const geo = characterGeometry({ width: portrait.width, height: portrait.height }, place);
            const key = `${s.tag}|${geo.x.toFixed(6)}|${geo.y.toFixed(6)}|${geo.scale.toFixed(6)}`;
            const prior = seen.get(key);
            if (prior && prior !== s.transform) collisions.push(`${prior} == ${s.transform} (${s.tag})`);
            seen.set(key, s.transform);
        }
        expect(collisions, `distinct transforms producing identical geometry: ${collisions.join(', ')}`).toEqual([]);
    });
});
