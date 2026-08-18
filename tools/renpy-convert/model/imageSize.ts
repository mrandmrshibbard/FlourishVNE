/**
 * Image dimensions read from file headers - no decoding, no dependencies.
 *
 * Measuring only PNG was defect 6: every un-measured overlay fell back to a default size and 233
 * of 235 `ShowImage` commands ended up at 50/50/100/100. A missing measurement must therefore be
 * a hard failure at the call site, never a default.
 */
import fs from 'node:fs';

export interface Size { width: number; height: number }

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPng(buf: Buffer): Size | null {
    if (buf.length < 24) return null;
    for (let i = 0; i < PNG_MAGIC.length; i++) if (buf[i] !== PNG_MAGIC[i]) return null;
    // IHDR is the first chunk; width/height are the two big-endian uint32s at byte 16.
    if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readJpeg(buf: Buffer): Size | null {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        // Standalone markers carry no length payload.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        // SOF0..SOF15, excluding the DHT/JPG/DAC markers that share the range.
        const isSof = marker >= 0xc0 && marker <= 0xcf
            && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + len;
    }
    return null;
}

function readWebp(buf: Buffer): Size | null {
    if (buf.length < 30) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8 ') {
        // Lossy: 14-bit width/height follow the 3-byte start code at offset 23.
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
        // Lossless: 14 bits each, packed little-endian starting at offset 21.
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X') {
        // Extended: 24-bit minus-one canvas size at offset 24.
        const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
        const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
        return { width: w + 1, height: h + 1 };
    }
    return null;
}

/** Dimensions of an image file, or null when the format is not one we can measure. */
export function measure(file: string): Size | null {
    const fd = fs.openSync(file, 'r');
    try {
        const buf = Buffer.alloc(64 * 1024);
        const read = fs.readSync(fd, buf, 0, buf.length, 0);
        const head = buf.subarray(0, read);
        return readPng(head) ?? readJpeg(head) ?? readWebp(head);
    } finally {
        fs.closeSync(fd);
    }
}

/** Same, but a failure to measure stops the run instead of yielding a default. */
export function measureOrThrow(file: string): Size {
    const s = measure(file);
    if (!s || !s.width || !s.height) throw new Error(`could not measure image: ${file}`);
    return s;
}
