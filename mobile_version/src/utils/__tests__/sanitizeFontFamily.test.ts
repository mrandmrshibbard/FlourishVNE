/**
 * Font family safety, both ends of the pipeline:
 * - sanitizeFontFamily (upload time): ONE clean CSS identifier — FontFace rejects punctuation,
 *   and an UNQUOTED multi-word family with a digit-leading word ("Font 8bitlim", "My Font 2")
 *   is INVALID CSS at every use site (declaration dropped → text falls back silently).
 * - cssFontFamily (render time): heals families STORED by older versions by quoting them.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeFontFamily, cssFontFamily } from '../styleUtils';

describe('sanitizeFontFamily', () => {
    it('keeps clean single-token names untouched', () => {
        expect(sanitizeFontFamily('Poppins')).toBe('Poppins');
        expect(sanitizeFontFamily('Font-Bold_2')).toBe('Font-Bold_2');
        expect(sanitizeFontFamily('InflateptxBase-ax3da')).toBe('InflateptxBase-ax3da');
    });
    it('joins words with hyphens — bare multi-word families with digit words are invalid CSS', () => {
        expect(sanitizeFontFamily('My Cool Font')).toBe('My-Cool-Font');
        expect(sanitizeFontFamily('My.Font')).toBe('My-Font');
        expect(sanitizeFontFamily('Cool (2)')).toBe('Cool-2');
        expect(sanitizeFontFamily('a,b;c!d')).toBe('a-b-c-d');
    });
    it('never starts with a digit and never returns empty', () => {
        expect(sanitizeFontFamily('8bit')).toBe('Font-8bit');
        expect(sanitizeFontFamily('8bitlim')).toBe('Font-8bitlim');
        expect(sanitizeFontFamily('...')).toBe('Custom-Font');
        expect(sanitizeFontFamily('')).toBe('Custom-Font');
        expect(sanitizeFontFamily(null)).toBe('Custom-Font');
    });
    it('every result is a SINGLE valid CSS identifier (usable unquoted everywhere)', () => {
        for (const raw of ['My.Font.v2', 'Cool (final)', '8bit', 'ünïcode fönt', 'a/b\\c"d', 'My Cool Font 2']) {
            const family = sanitizeFontFamily(raw);
            expect(family.includes(' ')).toBe(false);
            expect(/^\d/.test(family)).toBe(false);
            expect(family.length).toBeGreaterThan(0);
        }
    });
});

describe('cssFontFamily', () => {
    it('quotes legacy stored families that are invalid unquoted', () => {
        expect(cssFontFamily('Font 8bitlim')).toBe('"Font 8bitlim"');   // digit-leading 2nd word
        expect(cssFontFamily('My Font 2')).toBe('"My Font 2"');         // the old de-dup suffix
    });
    it('leaves single identifiers, stacks and pre-quoted values alone', () => {
        expect(cssFontFamily('Poppins')).toBe('Poppins');
        expect(cssFontFamily('InflateptxBase-ax3da')).toBe('InflateptxBase-ax3da');
        expect(cssFontFamily('Poppins, sans-serif')).toBe('Poppins, sans-serif');
        expect(cssFontFamily('"Already Quoted"')).toBe('"Already Quoted"');
    });
    it('quotes multi-word names (harmless when not strictly needed)', () => {
        expect(cssFontFamily('Custom Font')).toBe('"Custom Font"');
    });
    it('empty/missing → undefined (style key omitted)', () => {
        expect(cssFontFamily('')).toBeUndefined();
        expect(cssFontFamily(null)).toBeUndefined();
        expect(cssFontFamily(undefined)).toBeUndefined();
    });
});
