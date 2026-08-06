/**
 * analyzeFontComplexity — some display fonts pack ~43KB of outline data into EVERY glyph
 * (vs 1–3KB normal); Chromium 120's rasterizer hangs the renderer on their FIRST paint.
 * The check measures glyf-bytes-per-glyph from the raw sfnt tables — no rendering involved.
 */
import { describe, it, expect, vi } from 'vitest';
import { analyzeFontComplexity, rendererFreezesOnComplexFonts } from '../styleUtils';

/** Minimal sfnt with a glyf of `glyfLen` bytes and `numGlyphs` glyphs in maxp. */
const makeTtf = (glyfLen: number, numGlyphs: number): ArrayBuffer => {
    const numTables = 2;
    const headerLen = 12 + numTables * 16;
    const maxpOff = headerLen;
    const glyfOff = maxpOff + 6;
    const buf = new ArrayBuffer(glyfOff + Math.min(glyfLen, 64)); // glyf content itself irrelevant
    const dv = new DataView(buf);
    dv.setUint32(0, 0x00010000, false);
    dv.setUint16(4, numTables, false);
    const writeTable = (i: number, tag: string, off: number, len: number) => {
        const o = 12 + i * 16;
        for (let c = 0; c < 4; c++) dv.setUint8(o + c, tag.charCodeAt(c));
        dv.setUint32(o + 8, off, false);
        dv.setUint32(o + 12, len, false);
    };
    writeTable(0, 'maxp', maxpOff, 6);
    writeTable(1, 'glyf', glyfOff, glyfLen);
    dv.setUint16(maxpOff + 4, numGlyphs, false);
    return buf;
};

describe('analyzeFontComplexity', () => {
    it('flags balloon-class fonts (~43KB/glyph) and passes normal ones (~2.5KB/glyph)', () => {
        const bad = analyzeFontComplexity(makeTtf(4_000_000, 92))!;
        expect(bad.tooComplex).toBe(true);
        expect(Math.round(bad.avgGlyphBytes / 1024)).toBe(42);
        const good = analyzeFontComplexity(makeTtf(235_000, 92))!;
        expect(good.tooComplex).toBe(false);
    });
    it('a CJK font with many small glyphs passes despite a large total', () => {
        const cjk = analyzeFontComplexity(makeTtf(20_000_000, 20000))!;   // 1KB/glyph
        expect(cjk.tooComplex).toBe(false);
    });
    it('the refusal is RUNTIME-GATED: old Chromium freezes, modern renders fine', () => {
        const ua = (v: string) => vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(v);
        let spy = ua('Mozilla/5.0 Chrome/120.0.0.0 Electron/28.3.3');   // the desktop app today
        expect(rendererFreezesOnComplexFonts()).toBe(true);
        spy.mockRestore();
        spy = ua('Mozilla/5.0 Chrome/133.0.0.0 Safari/537.36');          // modern browser / future Electron
        expect(rendererFreezesOnComplexFonts()).toBe(false);
        spy.mockRestore();
        spy = ua('Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/130'); // unknown engine → no refusal
        expect(rendererFreezesOnComplexFonts()).toBe(false);
        spy.mockRestore();
    });

    it('non-TTF containers and junk return null (no opinion — FontFace decides)', () => {
        expect(analyzeFontComplexity(new ArrayBuffer(4))).toBeNull();
        const otto = makeTtf(1000, 10);
        new DataView(otto).setUint32(0, 0x4f54544f, false);   // 'OTTO' (CFF — no glyf semantics)
        expect(analyzeFontComplexity(otto)).toBeNull();
        expect(analyzeFontComplexity(makeTtf(0, 92))).toBeNull();   // no glyf length
    });
});
