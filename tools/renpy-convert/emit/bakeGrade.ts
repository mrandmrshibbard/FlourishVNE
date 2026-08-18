/**
 * Bake a colour grade into a copy of the art.
 *
 * Flourish has no per-character colour matrix, and it cannot be faked with a CSS filter: Ren'Py's
 * `brightness` is an ADDITIVE offset while `filter: brightness()` multiplies. So graded sprites
 * get real graded pixels instead.
 *
 * The transform matches the engine's own path (`renpy/display/module.py: colormatrix` applies the
 * matrix straight to the surface's RGBA bytes, with the 5th column as a constant). Ren'Py loads
 * PNGs as STRAIGHT - not premultiplied - alpha, so the grade applies to raw channel values and
 * alpha is scaled independently.
 *
 * Only 8-bit, non-interlaced, truecolour-with-alpha PNGs are supported. Every piece of the five
 * graded portraits is exactly that; anything else throws rather than being written out wrong.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import type { Affine } from '../map/colorGrade';
import { applyChannel } from '../map/colorGrade';

export interface Bitmap { width: number; height: number; rgba: Buffer }

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* CRC-32, as specified by the PNG format. */
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

/** Undo one PNG scanline filter in place. `bpp` is bytes per pixel. */
function unfilter(type: number, line: Buffer, prev: Buffer | null, bpp: number): void {
    const len = line.length;
    switch (type) {
        case 0: return;                                            // None
        case 1:                                                    // Sub
            for (let i = bpp; i < len; i++) line[i] = (line[i] + line[i - bpp]) & 0xff;
            return;
        case 2:                                                    // Up
            if (!prev) return;
            for (let i = 0; i < len; i++) line[i] = (line[i] + prev[i]) & 0xff;
            return;
        case 3:                                                    // Average
            for (let i = 0; i < len; i++) {
                const a = i >= bpp ? line[i - bpp] : 0;
                const b = prev ? prev[i] : 0;
                line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
            }
            return;
        case 4:                                                    // Paeth
            for (let i = 0; i < len; i++) {
                const a = i >= bpp ? line[i - bpp] : 0;
                const b = prev ? prev[i] : 0;
                const c = prev && i >= bpp ? prev[i - bpp] : 0;
                const p = a + b - c;
                const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
                line[i] = (line[i] + pr) & 0xff;
            }
            return;
        default:
            throw new Error(`png: unknown scanline filter ${type}`);
    }
}

export function decodePng(buf: Buffer): Bitmap {
    if (!buf.subarray(0, 8).equals(PNG_MAGIC)) throw new Error('png: bad signature');
    let width = 0, height = 0, bitDepth = 0, colourType = 0, interlace = 0;
    const idat: Buffer[] = [];
    let off = 8;
    while (off + 8 <= buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        const data = buf.subarray(off + 8, off + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colourType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') idat.push(data);
        else if (type === 'IEND') break;
        off += 12 + len;                                          // len + type + data + crc
    }
    if (bitDepth !== 8 || colourType !== 6 || interlace !== 0) {
        throw new Error(`png: only 8-bit non-interlaced RGBA is supported (got depth ${bitDepth}, colour type ${colourType}, interlace ${interlace})`);
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const bpp = 4;
    const stride = width * bpp;
    const rgba = Buffer.alloc(stride * height);
    let prev: Buffer | null = null;
    for (let y = 0; y < height; y++) {
        const at = y * (stride + 1);
        const filterType = raw[at];
        const line = raw.subarray(at + 1, at + 1 + stride);
        unfilter(filterType, line, prev, bpp);
        line.copy(rgba, y * stride);
        prev = line;
    }
    return { width, height, rgba };
}

function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

export function encodePng(bmp: Bitmap): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(bmp.width, 0);
    ihdr.writeUInt32BE(bmp.height, 4);
    ihdr[8] = 8;         // bit depth
    ihdr[9] = 6;         // truecolour with alpha
    ihdr[10] = 0;        // deflate
    ihdr[11] = 0;        // adaptive filtering
    ihdr[12] = 0;        // no interlace
    const stride = bmp.width * 4;
    // Filter type 0 on every row: larger than an optimal filter choice, but exact and simple,
    // and these are a few dozen sprite pieces rather than a whole game's art.
    const raw = Buffer.alloc((stride + 1) * bmp.height);
    for (let y = 0; y < bmp.height; y++) {
        raw[y * (stride + 1)] = 0;
        bmp.rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    return Buffer.concat([
        PNG_MAGIC,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/** Apply the grade in place. RGB take the affine; alpha takes its own multiplier. */
export function applyGrade(bmp: Bitmap, grade: Affine): Bitmap {
    const out = Buffer.from(bmp.rgba);
    for (let i = 0; i < out.length; i += 4) {
        out[i] = applyChannel(out[i], grade.mul[0], grade.add[0]);
        out[i + 1] = applyChannel(out[i + 1], grade.mul[1], grade.add[1]);
        out[i + 2] = applyChannel(out[i + 2], grade.mul[2], grade.add[2]);
        if (grade.alpha !== 1) out[i + 3] = applyChannel(out[i + 3], grade.alpha, 0);
    }
    return { width: bmp.width, height: bmp.height, rgba: out };
}

/** Read a PNG, grade it, and write the result. Returns the output size in bytes. */
export function bakeFile(src: string, dst: string, grade: Affine): number {
    const png = encodePng(applyGrade(decodePng(fs.readFileSync(src)), grade));
    fs.writeFileSync(dst, png);
    return png.length;
}
