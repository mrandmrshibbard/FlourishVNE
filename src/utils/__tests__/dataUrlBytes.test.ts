/**
 * decodeDataUrl — the builders' data-URL decoder must accept everything the browser accepts.
 * Regression: a single URL-encoded SVG or line-wrapped base64 asset used to kill a whole game
 * build with "Failed to execute 'atob' on 'Window'".
 */
import { describe, it, expect } from 'vitest';
import { decodeDataUrl } from '../dataUrlBytes';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('decodeDataUrl', () => {
    it('decodes a plain base64 payload with the right mime', () => {
        const { bytes, mime } = decodeDataUrl(`data:image/png;base64,${PNG_B64}`);
        expect(mime).toBe('image/png');
        // PNG magic number
        expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    it('tolerates whitespace/line wraps inside base64 (atob alone throws on these)', () => {
        const wrapped = PNG_B64.replace(/(.{20})/g, '$1\n');
        const { bytes } = decodeDataUrl(`data:image/png;base64,${wrapped}`);
        expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    it('tolerates %-encoded padding and URL-safe base64 alphabets', () => {
        const pctPad = PNG_B64.replace(/=+$/, m => m.replace(/=/g, '%3D'));
        expect(Array.from(decodeDataUrl(`data:image/png;base64,${pctPad}`).bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
        const urlSafe = PNG_B64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        expect(Array.from(decodeDataUrl(`data:image/png;base64,${urlSafe}`).bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    });

    it('decodes URL-encoded text payloads (SVG cursors etc.) to real UTF-8 bytes', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>héllo</text></svg>';
        const { bytes, mime } = decodeDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
        expect(mime).toBe('image/svg+xml');
        expect(new TextDecoder().decode(bytes)).toBe(svg);
    });

    it('decodes bare (unencoded) text payloads', () => {
        const { bytes } = decodeDataUrl('data:text/plain,hello world');
        expect(new TextDecoder().decode(bytes)).toBe('hello world');
    });

    it('throws on non-data URLs and truly corrupt base64', () => {
        expect(() => decodeDataUrl('https://example.com/x.png')).toThrow();
        expect(() => decodeDataUrl('data:image/png;base64,@@@not-base64@@@')).toThrow();
    });
});
