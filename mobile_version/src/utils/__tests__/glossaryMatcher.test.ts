import { describe, it, expect } from 'vitest';
import { compileGlossary } from '../glossaryMatcher';
import type { VNGlossaryEntry } from '../../types/project';

const entry = (id: string, term: string, extra: Partial<VNGlossaryEntry> = {}): VNGlossaryEntry =>
    ({ id, term, ...extra });

const compile = (entries: VNGlossaryEntry[], settings?: any) =>
    compileGlossary({ entries: Object.fromEntries(entries.map(e => [e.id, e])), settings });

describe('compileGlossary', () => {
    it('matches whole words, including next to punctuation and quotes', () => {
        const g = compile([entry('a', 'magia')])!;
        expect(g.findMatches('A magia, dizem, é real.')).toEqual([{ start: 2, end: 7, entryId: 'a' }]);
        expect(g.findMatches('«magia»')).toEqual([{ start: 1, end: 6, entryId: 'a' }]);
    });

    it('respects Unicode word boundaries (accented letters are word chars)', () => {
        const g = compile([entry('a', 'maçã')])!;
        expect(g.findMatches('duas maçãs')).toEqual([]); // inside a longer word — no match
        expect(g.findMatches('uma maçã!')).toEqual([{ start: 4, end: 8, entryId: 'a' }]);
        const h = compile([entry('b', 'coração')])!;
        expect(h.findMatches('meu coração!')).toEqual([{ start: 4, end: 11, entryId: 'b' }]);
    });

    it('is case-insensitive by default and exact when caseSensitive', () => {
        const g = compile([entry('a', 'Ether')])!;
        expect(g.findMatches('pure ether flows')).toHaveLength(1);
        const cs = compile([entry('a', 'Ether', { caseSensitive: true })])!;
        expect(cs.findMatches('pure ether flows')).toEqual([]);
        expect(cs.findMatches('pure Ether flows')).toHaveLength(1);
    });

    it('alternatives trigger the same entry', () => {
        const g = compile([entry('a', 'wolf', { alternatives: ['wolves', 'lobo'] })])!;
        expect(g.findMatches('the wolves and the lobo').map(m => m.entryId)).toEqual(['a', 'a']);
    });

    it('longest match wins on overlaps', () => {
        const g = compile([entry('short', 'magic'), entry('long', 'magic sword')])!;
        expect(g.findMatches('a magic sword appears')).toEqual([{ start: 2, end: 13, entryId: 'long' }]);
        // A shorter match INSIDE an already-kept longer span is dropped too.
        const h = compile([entry('a', 'iron fist'), entry('b', 'fist')])!;
        expect(h.findMatches('the iron fist rules')).toEqual([{ start: 4, end: 13, entryId: 'a' }]);
    });

    it('returns all occurrences, sorted and non-overlapping', () => {
        const g = compile([entry('a', 'rune')])!;
        const matches = g.findMatches('rune by rune, the rune glows');
        expect(matches.map(m => m.start)).toEqual([0, 8, 18]);
    });

    it('skips disabled entries, empty terms, and a disabled glossary', () => {
        expect(compile([entry('a', 'x', { enabled: false })])).toBeNull();
        expect(compile([entry('a', '   ')])).toBeNull();
        expect(compile([entry('a', 'x')], { enabled: false })).toBeNull();
        expect(compileGlossary(undefined)).toBeNull();
    });

    it('punctuation-edged terms skip the boundary check on that side', () => {
        const g = compile([entry('a', 'C++')])!;
        expect(g.findMatches('I write C++ daily')).toEqual([{ start: 8, end: 11, entryId: 'a' }]);
        expect(g.findMatches('ABC++ is not it')).toEqual([]); // left side is a word char — still guarded
    });

    it('memoizes results per text', () => {
        const g = compile([entry('a', 'rune')])!;
        const first = g.findMatches('a rune');
        expect(g.findMatches('a rune')).toBe(first);
    });
});
