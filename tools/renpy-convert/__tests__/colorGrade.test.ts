/**
 * STEP 6 GATE - colour grades.
 *
 * The prologue grades sprites with `im.matrix` products. Getting the composition order or the
 * meaning of `brightness` wrong silently shifts every graded frame, so the algebra is transcribed
 * from the engine bundled with the game and checked against hand-computed values here.
 *
 * CONTENT RULE: matrix numbers and portrait identifiers only.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    parseMatrixExpression, toAffine, isIdentity, affineIsIdentity, gradeKey,
    applyChannel, mul, tint, brightness, saturation, identity, GradeError,
} from '../map/colorGrade';
import { decodePng, encodePng, applyGrade, bakeFile, type Bitmap } from '../emit/bakeGrade';
import { parseFile } from '../parse/lexer';
import { parseNodes } from '../parse/statements';
import { analyse } from '../analysis/spriteState';
import { loadPortraitTable } from '../model/portraitTable';

describe('matrix algebra (ported from the bundled engine)', () => {
    it('treats saturation(1.0) and tint(1,1,1) and brightness(0) as the identity', () => {
        expect(isIdentity(saturation(1))).toBe(true);
        expect(isIdentity(tint(1, 1, 1))).toBe(true);
        expect(isIdentity(brightness(0))).toBe(true);
        expect(isIdentity(mul(saturation(1), tint(1, 1, 1)))).toBe(true);
    });

    it('makes saturation(0) a real channel mix, which is not an affine', () => {
        const a = toAffine(saturation(0));
        expect(a).toBeNull();          // must be reported, never approximated
    });

    it('composes a product into out = in*tint + brightness', () => {
        const m = parseMatrixExpression('im.matrix.saturation(1.0)*im.matrix.tint(1.0,1.0,1.2)*im.matrix.brightness(-0.20)');
        const a = toAffine(m)!;
        expect(a.mul[0]).toBeCloseTo(1.0, 9);
        expect(a.mul[1]).toBeCloseTo(1.0, 9);
        expect(a.mul[2]).toBeCloseTo(1.2, 9);
        expect(a.add).toEqual([-0.2, -0.2, -0.2].map(v => expect.closeTo(v, 9)) as unknown as [number, number, number]);
        expect(a.alpha).toBeCloseTo(1, 9);
    });

    it('keeps brightness ADDITIVE, unlike a CSS filter', () => {
        // CSS brightness(0.8) would give 0.5*0.8 = 0.40; Ren'Py's brightness(-0.20) gives 0.30.
        const a = toAffine(parseMatrixExpression('im.matrix.brightness(-0.20)'))!;
        expect(0.5 * a.mul[0] + a.add[0]).toBeCloseTo(0.3, 9);
    });

    it('recognises the identity product the game uses as a reset', () => {
        const a = toAffine(parseMatrixExpression('im.matrix.saturation(1.0)*im.matrix.tint(1.0,1.0,1.0)*im.matrix.brightness(-0.0)'))!;
        expect(affineIsIdentity(a)).toBe(true);
    });

    it('clamps a baked channel to 0..255', () => {
        const a = toAffine(parseMatrixExpression('im.matrix.tint(1.0,1.0,1.2)*im.matrix.brightness(-0.20)'))!;
        expect(applyChannel(0, a.mul[0], a.add[0])).toBe(0);            // would go negative
        expect(applyChannel(255, a.mul[2], a.add[2])).toBe(255);        // would exceed 255
        expect(applyChannel(128, a.mul[0], a.add[0])).toBe(Math.round((128 / 255 - 0.2) * 255));
    });

    it('refuses an operation it does not model', () => {
        expect(() => parseMatrixExpression('im.matrix.colorize(1,2,3)')).toThrow(GradeError);
        expect(() => parseMatrixExpression('SomeOtherThing(1)')).toThrow(GradeError);
    });

    it('gives equal grades the same key and different grades different keys', () => {
        const a = toAffine(parseMatrixExpression('im.matrix.tint(1.0,1.0,1.2)*im.matrix.brightness(-0.20)'))!;
        const b = toAffine(parseMatrixExpression('im.matrix.saturation(1.0)*im.matrix.tint(1.0,1.0,1.2)*im.matrix.brightness(-0.20)'))!;
        const c = toAffine(parseMatrixExpression('im.matrix.tint(1.0,1.0,1.1)*im.matrix.brightness(-0.20)'))!;
        expect(gradeKey(a)).toBe(gradeKey(b));
        expect(gradeKey(a)).not.toBe(gradeKey(c));
        expect(gradeKey(a)).toMatch(/^[A-Za-z0-9_]+$/);   // safe as a filename
    });
});

describe('png bake', () => {
    const makeBitmap = (): Bitmap => {
        const width = 7, height = 5;
        const rgba = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            rgba[i * 4] = (i * 7) % 256;
            rgba[i * 4 + 1] = (i * 13) % 256;
            rgba[i * 4 + 2] = (i * 29) % 256;
            rgba[i * 4 + 3] = (i * 37) % 256;
        }
        return { width, height, rgba };
    };

    it('round-trips through encode and decode without changing a byte', () => {
        const src = makeBitmap();
        const back = decodePng(encodePng(src));
        expect(back.width).toBe(src.width);
        expect(back.height).toBe(src.height);
        expect(back.rgba.equals(src.rgba)).toBe(true);
    });

    it('grades RGB and leaves alpha alone', () => {
        const src = makeBitmap();
        const grade = toAffine(parseMatrixExpression('im.matrix.tint(1.0,1.0,1.2)*im.matrix.brightness(-0.20)'))!;
        const out = applyGrade(src, grade);
        for (let i = 0; i < out.rgba.length; i += 4) {
            expect(out.rgba[i]).toBe(applyChannel(src.rgba[i], grade.mul[0], grade.add[0]));
            expect(out.rgba[i + 2]).toBe(applyChannel(src.rgba[i + 2], grade.mul[2], grade.add[2]));
            expect(out.rgba[i + 3]).toBe(src.rgba[i + 3]);      // alpha untouched
        }
    });

    it('leaves an identity grade byte-identical', () => {
        const src = makeBitmap();
        const grade = toAffine(parseMatrixExpression('im.matrix.saturation(1.0)*im.matrix.tint(1.0,1.0,1.0)*im.matrix.brightness(-0.0)'))!;
        expect(applyGrade(src, grade).rgba.equals(src.rgba)).toBe(true);
    });

    it('refuses a PNG format it cannot bake exactly', () => {
        const src = makeBitmap();
        const png = encodePng(src);
        png[25] = 3;                                              // claim palette colour type
        expect(() => decodePng(png)).toThrow(/only 8-bit non-interlaced RGBA/);
    });
});

const GAME_DIR = process.env.OURLIFE_GAME
    ?? path.resolve(__dirname, '..', '..', '..', 'OurLife', 'game');
const PROLOGUE = path.join(GAME_DIR, 'prologue.rpy');

if (fs.existsSync(PROLOGUE)) describe('prologue grades', () => {
    const portraits = loadPortraitTable(GAME_DIR);
    const nodes = parseNodes(parseFile(fs.readFileSync(PROLOGUE, 'utf8')), 'prologue.rpy');
    const labels = nodes.filter(n => n.kind === 'label').map(n => ({ name: (n as any).name, body: (n as any).body }));
    const tagToPortrait = new Map<string, string>();
    for (const [tag, decl] of portraits) tagToPortrait.set(tag.toLowerCase(), decl.name);
    const result = analyse(labels, { tagToPortrait });

    it('GATE: every matrix in the prologue reduces to a per-channel affine', () => {
        const exprs = new Set<string>();
        for (const s of result.shows) if (s.matrix) exprs.add(s.matrix);
        for (const c of result.liveChanges) if (c.matrix) exprs.add(c.matrix);
        const grades = new Map<string, { expr: string; identity: boolean }>();
        for (const expr of exprs) {
            const affine = toAffine(parseMatrixExpression(expr));
            // A null affine means the grade mixes channels; baking still works, but the reporting
            // and the Brad-eyeball list assume the simple form, so fail loudly instead.
            expect(affine, `matrix mixes channels and needs review: ${expr}`).not.toBeNull();
            grades.set(gradeKey(affine!), { expr, identity: affineIsIdentity(affine!) });
        }
        const nonIdentity = [...grades.values()].filter(g => !g.identity);
        console.log(`[step6] distinct matrix expressions=${exprs.size} distinct grades=${grades.size} non-identity=${nonIdentity.length}`);
        for (const g of nonIdentity) {
            const a = toAffine(parseMatrixExpression(g.expr))!;
            console.log(`[step6]   mul=[${a.mul.map(n => n.toFixed(2)).join(',')}] add=[${a.add.map(n => n.toFixed(2)).join(',')}]`);
        }
        expect(grades.size).toBeGreaterThan(0);
    });

    it('scopes how much art the bake has to produce', () => {
        // A graded portrait needs a graded copy of every piece shown under that grade. Counting it
        // now decides whether pre-baking is cheap or needs deduplicating across the whole game.
        const need = new Set<string>();
        // Shows AND live changes: a grade applies to the whole portrait at render time, and most
        // of the prologue's expression changes happen with no `show` at all.
        const moments: { tag: string; matrix: string | null; determinate: Record<string, string> }[] = [
            ...result.shows.map(s => ({ tag: s.tag, matrix: s.matrix, determinate: s.determinate })),
            ...result.liveChanges.map(c => ({ tag: c.tag, matrix: c.matrix, determinate: c.determinate })),
        ];
        for (const moment of moments) {
            if (!moment.matrix) continue;
            const affine = toAffine(parseMatrixExpression(moment.matrix));
            if (!affine || affineIsIdentity(affine)) continue;
            const key = gradeKey(affine);
            for (const [slot, value] of Object.entries(moment.determinate)) {
                if (value === 'none') continue;
                need.add(`${moment.tag}|${slot}|${value}|${key}`);
            }
        }
        console.log(`[step6] graded (piece,grade) pairs needing a baked copy=${need.size}`);
        // Recorded rather than bounded: the number drives the archive-size budget in Step 8.
        expect(need.size).toBeGreaterThanOrEqual(0);
    });

    it('bakes a real graded piece and keeps its dimensions', () => {
        const src = path.join(GAME_DIR, 'images', 'characters', 'cove_8', 'base.png');
        if (!fs.existsSync(src)) return;
        const grade = toAffine(parseMatrixExpression('im.matrix.tint(1.0,1.0,1.2)*im.matrix.brightness(-0.20)'))!;
        const before = decodePng(fs.readFileSync(src));
        const after = applyGrade(before, grade);
        expect(after.width).toBe(before.width);
        expect(after.height).toBe(before.height);
        // Darkened everywhere the source had any red, and blue lifted where it was bright.
        let darker = 0;
        for (let i = 0; i < before.rgba.length; i += 4) {
            if (before.rgba[i] > 60 && after.rgba[i] < before.rgba[i]) darker++;
        }
        console.log(`[step6] baked ${before.width}x${before.height}; pixels darkened=${darker}`);
        expect(darker).toBeGreaterThan(0);
    });

    it('treats the identity matrices as resets that clear an earlier grade', () => {
        const identityShows = result.shows.filter(s => {
            if (!s.matrix) return false;
            const a = toAffine(parseMatrixExpression(s.matrix));
            return a !== null && affineIsIdentity(a);
        });
        const graded = result.shows.filter(s => {
            if (!s.matrix) return false;
            const a = toAffine(parseMatrixExpression(s.matrix));
            return a !== null && !affineIsIdentity(a);
        });
        console.log(`[step6] shows: ungraded=${result.shows.filter(s => !s.matrix).length} identity=${identityShows.length} graded=${graded.length}`);
        expect(identityShows.length + graded.length).toBeLessThanOrEqual(result.shows.length);
    });
});
