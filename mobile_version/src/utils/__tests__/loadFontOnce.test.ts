/**
 * loadFontOnce (font-crash + regular-font fixes): each (family, source) parses EXACTLY once —
 * the editor's font effect refires on every character edit, and re-parsing a large font each
 * run grew document.fonts until the renderer died. Failures return false and never throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFontOnce } from '../styleUtils';

let constructed: string[] = [];
let added: any[] = [];

beforeEach(() => {
    constructed = [];
    added = [];
    (globalThis as any).FontFace = class {
        family: string;
        constructor(family: string, _src: string) { this.family = family; constructed.push(family); }
        load() { return this.family.startsWith('Broken') ? Promise.reject(new Error('bad font')) : Promise.resolve(this); }
    };
    (document as any).fonts = { add: (f: any) => added.push(f) };
});

describe('loadFontOnce', () => {
    it('loads once, then dedups every later call for the same family+source', async () => {
        const url = 'data:font/ttf;base64,AAAA';
        expect(await loadFontOnce('Fancy Font A', url)).toBe(true);
        expect(await loadFontOnce('Fancy Font A', url)).toBe(true);
        expect(await loadFontOnce('Fancy Font A', url)).toBe(true);
        expect(constructed.filter(f => f === 'Fancy Font A')).toHaveLength(1);
        expect(added).toHaveLength(1);
    });

    it('a DIFFERENT source under the same family still loads (replaced font file)', async () => {
        await loadFontOnce('Fancy Font B', 'data:font/ttf;base64,AAAA');
        await loadFontOnce('Fancy Font B', 'data:font/ttf;base64,BBBB');
        expect(constructed.filter(f => f === 'Fancy Font B')).toHaveLength(2);
    });

    it('missing family/url → false without touching FontFace', async () => {
        expect(await loadFontOnce('', 'data:x')).toBe(false);
        expect(await loadFontOnce('X', null)).toBe(false);
        expect(constructed).toHaveLength(0);
    });

    it('a failing font returns false, never throws, and is NOT marked loaded (can retry)', async () => {
        expect(await loadFontOnce('Broken Font', 'data:font/ttf;base64,CCCC')).toBe(false);
        expect(await loadFontOnce('Broken Font', 'data:font/ttf;base64,CCCC')).toBe(false);
        expect(constructed.filter(f => f === 'Broken Font')).toHaveLength(2);
        expect(added).toHaveLength(0);
    });
});
