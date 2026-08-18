/**
 * Placeholder art for assets the GAME DATA does not contain.
 *
 * The owner asked for placeholders so the missing art can be found and replaced by hand. The one
 * hard requirement is that a placeholder must never be mistakable for real art: the previous build
 * shipped 64x64 tinted squares that looked plausible in the project, so 171 of 235 overlays were
 * wrong and nobody could tell which. These are the opposite - magenta warning stripes at the right
 * dimensions, with the MISSING ASSET'S OWN NAME drawn across them, so a playthrough shows you
 * exactly which file to go find.
 *
 * The size is real, so swapping the true art in later needs no repositioning.
 */
import { encodePng, type Bitmap } from './bakeGrade';

/**
 * A 5x7 bitmap font, one string of 7 rows per glyph. Enough for the characters a Ren'Py image name
 * can contain (A-Z, 0-9, underscore, hyphen, space). Hand-built so the placeholder can label
 * itself without pulling in a font library.
 */
const GLYPHS: Record<string, string[]> = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '11110', '10001', '10001', '10001', '11110'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
    F: ['11111', '10000', '11110', '10000', '10000', '10000', '10000'],
    G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
    H: ['10001', '10001', '11111', '10001', '10001', '10001', '10001'],
    I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
    J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
    X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
    Y: ['10001', '01010', '00100', '00100', '00100', '00100', '00100'],
    Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
    '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
    '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

interface Rgba { r: number; g: number; b: number; a: number }

function fill(bmp: Bitmap, x: number, y: number, w: number, h: number, c: Rgba): void {
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(bmp.width, x + w), y1 = Math.min(bmp.height, y + h);
    for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
            const i = (py * bmp.width + px) * 4;
            bmp.rgba[i] = c.r; bmp.rgba[i + 1] = c.g; bmp.rgba[i + 2] = c.b; bmp.rgba[i + 3] = c.a;
        }
    }
}

/** Draw one line of text, scaled, top-left anchored. Returns the width drawn. */
function drawText(bmp: Bitmap, text: string, x: number, y: number, scale: number, c: Rgba): number {
    let cursor = x;
    for (const raw of text.toUpperCase()) {
        const glyph = GLYPHS[raw] ?? GLYPHS['?'];
        for (let gy = 0; gy < GLYPH_H; gy++) {
            for (let gx = 0; gx < GLYPH_W; gx++) {
                if (glyph[gy][gx] !== '1') continue;
                fill(bmp, cursor + gx * scale, y + gy * scale, scale, scale, c);
            }
        }
        cursor += (GLYPH_W + 1) * scale;
    }
    return cursor - x;
}

const textWidth = (text: string, scale: number): number => text.length * (GLYPH_W + 1) * scale;

export interface PlaceholderOptions {
    width: number;
    height: number;
    /** The missing asset's name, drawn on the image. */
    name: string;
    /** Second line, e.g. where it was referenced. */
    subtitle?: string;
}

/**
 * Build the placeholder image.
 *
 * Magenta-on-black diagonal warning stripes, a border, and the asset name in the middle. Nothing
 * about it can be mistaken for game art at a glance, which is the entire point.
 */
export function placeholderPng(opts: PlaceholderOptions): Buffer {
    const { width, height } = opts;
    const bmp: Bitmap = { width, height, rgba: Buffer.alloc(width * height * 4) };

    const MAGENTA: Rgba = { r: 255, g: 0, b: 200, a: 255 };
    const DARK: Rgba = { r: 24, g: 0, b: 20, a: 255 };
    const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 255 };

    // Diagonal hazard stripes.
    const stripe = Math.max(8, Math.round(Math.min(width, height) / 24));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const band = Math.floor((x + y) / stripe) % 2 === 0;
            const c = band ? MAGENTA : DARK;
            const i = (y * width + x) * 4;
            bmp.rgba[i] = c.r; bmp.rgba[i + 1] = c.g; bmp.rgba[i + 2] = c.b; bmp.rgba[i + 3] = 255;
        }
    }

    // A solid plate behind the text, so the name stays readable over the stripes.
    const scale = Math.max(2, Math.round(width / 220));
    const title = 'MISSING ASSET';
    const nameLine = opts.name.slice(0, 44);
    const lines: { text: string; scale: number }[] = [
        { text: title, scale: Math.max(2, Math.round(scale * 0.8)) },
        { text: nameLine, scale },
    ];
    if (opts.subtitle) lines.push({ text: opts.subtitle.slice(0, 52), scale: Math.max(1, Math.round(scale * 0.5)) });

    const lineHeights = lines.map(l => GLYPH_H * l.scale);
    const gap = Math.round(scale * 4);
    const blockH = lineHeights.reduce((a, b) => a + b, 0) + gap * (lines.length - 1);
    const blockW = Math.max(...lines.map(l => textWidth(l.text, l.scale)));
    const padX = Math.round(scale * 8);
    const padY = Math.round(scale * 6);
    const plateX = Math.round((width - blockW) / 2) - padX;
    const plateY = Math.round((height - blockH) / 2) - padY;

    fill(bmp, plateX, plateY, blockW + padX * 2, blockH + padY * 2, DARK);
    fill(bmp, plateX, plateY, blockW + padX * 2, Math.max(2, scale), MAGENTA);
    fill(bmp, plateX, plateY + blockH + padY * 2 - Math.max(2, scale), blockW + padX * 2, Math.max(2, scale), MAGENTA);

    let y = Math.round((height - blockH) / 2);
    for (const [i, line] of lines.entries()) {
        const w = textWidth(line.text, line.scale);
        drawText(bmp, line.text, Math.round((width - w) / 2), y, line.scale, i === 1 ? WHITE : MAGENTA);
        y += lineHeights[i] + gap;
    }

    // A hard border, so the image's real bounds are obvious while repositioning.
    const b = Math.max(3, Math.round(scale));
    fill(bmp, 0, 0, width, b, MAGENTA);
    fill(bmp, 0, height - b, width, b, MAGENTA);
    fill(bmp, 0, 0, b, height, MAGENTA);
    fill(bmp, width - b, 0, b, height, MAGENTA);

    return encodePng(bmp);
}
