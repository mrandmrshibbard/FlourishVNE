/**
 * Ren'Py `im.matrix` colour grades -> a per-channel affine.
 *
 * The prologue grades sprites with products like
 * `im.matrix.saturation(1.0)*im.matrix.tint(1.0,1.0,1.2)*im.matrix.brightness(-0.20)`.
 *
 * Rather than guess how those compose, the 5x5 algebra below is transcribed from the engine
 * bundled with the game (renpy/display/im.py, Ren'Py 7.5.3). Two details there are easy to get
 * backwards and both change the result:
 *
 *  - `a * b` calls `mul(a, b)`, whose loop is `result[x + y*5] += a[x + i*5] * b[i + y*5]`. Read
 *    row-major that computes B·A, so a left-to-right Python product applies its factors
 *    LEFT-to-right to the pixel: saturation, then tint, then brightness.
 *  - `brightness(b)` is an ADDITIVE offset in the matrix's constant column, not a multiplier.
 *    CSS `filter: brightness()` multiplies, so it cannot express this - which is why these grades
 *    have to be baked into pixels rather than approximated with a filter.
 *
 * 🔴 The matrix is stored in `spriteParts` (`GetRender` reads `spriteParts["matrix"]`), so a grade
 * PERSISTS until another ChangePortrait replaces it. The prologue's 10 identity matrices are
 * deliberate resets, not no-ops to be discarded.
 */

/** A 5x5 colour matrix, row-major: index = col + row*5. */
export type Matrix5 = number[];

export function identity(): Matrix5 {
    return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];
}

/** Verbatim port of `im.matrix.mul`. Note this is B·A in standard notation. */
export function mul(a: Matrix5, b: Matrix5): Matrix5 {
    const r = new Array(25).fill(0);
    for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
            for (let i = 0; i < 5; i++) r[x + y * 5] += a[x + i * 5] * b[i + y * 5];
        }
    }
    return r;
}

export function tint(r: number, g: number, b: number): Matrix5 {
    return [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];
}

export function brightness(b: number): Matrix5 {
    return [1, 0, 0, 0, b, 0, 1, 0, 0, b, 0, 0, 1, 0, b, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];
}

export function saturation(level: number, desat: [number, number, number] = [0.2126, 0.7152, 0.0722]): Matrix5 {
    const [r, g, b] = desat;
    const I = (a: number, bb: number) => a + (bb - a) * level;
    return [
        I(r, 1), I(g, 0), I(b, 0), 0, 0,
        I(r, 0), I(g, 1), I(b, 0), 0, 0,
        I(r, 0), I(g, 0), I(b, 1), 0, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 0, 1,
    ];
}

export function opacity(o: number): Matrix5 {
    return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, o, 0, 0, 0, 0, 0, 1];
}

/** A grade reduced to `out = in * mul + add` per channel, in 0..1 space. */
export interface Affine {
    mul: [number, number, number];
    add: [number, number, number];
    /** Alpha multiplier; 1 when the grade leaves alpha alone. */
    alpha: number;
}

const EPS = 1e-9;

/** True when the matrix leaves every pixel exactly as it was. */
export function isIdentity(m: Matrix5, epsilon = 1e-6): boolean {
    const id = identity();
    return m.every((v, i) => Math.abs(v - id[i]) < epsilon);
}

/**
 * Reduce a matrix to a per-channel affine, or null when it mixes channels.
 * A channel-mixing grade (a real saturation change, say) cannot be expressed this way and must be
 * reported rather than approximated.
 */
export function toAffine(m: Matrix5): Affine | null {
    const offDiagonal = [
        m[1], m[2], m[3],
        m[5], m[7], m[8],
        m[10], m[11], m[13],
    ];
    if (offDiagonal.some(v => Math.abs(v) > 1e-6)) return null;
    return {
        mul: [m[0], m[6], m[12]],
        add: [m[4], m[9], m[14]],
        alpha: m[18],
    };
}

export function affineIsIdentity(a: Affine, epsilon = 1e-6): boolean {
    return a.mul.every(v => Math.abs(v - 1) < epsilon)
        && a.add.every(v => Math.abs(v) < epsilon)
        && Math.abs(a.alpha - 1) < epsilon;
}

export class GradeError extends Error {}

/** Split a product expression on top-level `*`. */
function splitFactors(src: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of src) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === '*' && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out.map(s => s.trim()).filter(Boolean);
}

const numbers = (src: string): number[] =>
    src.split(',').map(s => s.trim()).filter(Boolean).map(s => {
        const v = Number(s);
        if (!Number.isFinite(v)) throw new GradeError(`non-numeric matrix argument "${s}"`);
        return v;
    });

/**
 * Parse `im.matrix.<op>(...)` products into one matrix.
 * An unknown operation throws - approximating a grade would tint a character a colour the
 * original never shows.
 */
export function parseMatrixExpression(src: string): Matrix5 {
    const factors = splitFactors(src.trim());
    if (!factors.length) throw new GradeError('empty matrix expression');
    let acc: Matrix5 | null = null;
    for (const f of factors) {
        const m = /^im\.matrix\.([a-z_]+)\s*\((.*)\)$/.exec(f);
        if (!m) throw new GradeError(`unsupported matrix factor "${f}"`);
        const [, op, argsSrc] = m;
        const args = argsSrc.trim() ? numbers(argsSrc) : [];
        let factor: Matrix5;
        switch (op) {
            case 'identity': factor = identity(); break;
            case 'tint':
                if (args.length !== 3) throw new GradeError('tint needs three arguments');
                factor = tint(args[0], args[1], args[2]);
                break;
            case 'brightness':
                if (args.length !== 1) throw new GradeError('brightness needs one argument');
                factor = brightness(args[0]);
                break;
            case 'saturation':
                if (args.length !== 1) throw new GradeError('saturation with a custom desat is not supported');
                factor = saturation(args[0]);
                break;
            case 'opacity':
                if (args.length !== 1) throw new GradeError('opacity needs one argument');
                factor = opacity(args[0]);
                break;
            default:
                throw new GradeError(`unsupported matrix operation "${op}"`);
        }
        acc = acc === null ? factor : mul(acc, factor);
    }
    return acc!;
}

/** Apply the grade to one 8-bit channel value, matching Ren'Py's clamp to 0..255. */
export function applyChannel(value: number, mulF: number, addF: number): number {
    const out = Math.round((value / 255 * mulF + addF) * 255);
    return out < 0 ? 0 : out > 255 ? 255 : out;
}

/** A stable short id for a grade, so baked files can be named and deduplicated. */
export function gradeKey(a: Affine): string {
    const f = (n: number) => n.toFixed(4);
    return `m${a.mul.map(f).join('_')}_a${a.add.map(f).join('_')}_o${f(a.alpha)}`
        .replace(/[.-]/g, c => (c === '.' ? 'p' : 'n'));
}
