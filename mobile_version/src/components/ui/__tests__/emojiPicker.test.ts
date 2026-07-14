import { describe, it, expect } from 'vitest';
import { GROUPS } from '../EmojiPicker';

const ALL = GROUPS.flatMap(g => g.emoji);

describe('the curated emoji list', () => {
    it('never shows the same emoji twice', () => {
        // A duplicate is invisible in review but looks like a bug in the grid, and the selected-ring
        // would light up in two places at once.
        const seen = new Map<string, number>();
        for (const x of ALL) seen.set(x.e, (seen.get(x.e) ?? 0) + 1);
        expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
    });

    it('gives every emoji searchable keywords — the picker is useless without them', () => {
        for (const x of ALL) {
            expect(x.k.trim().length, `${x.e} has no keywords`).toBeGreaterThan(0);
            expect(x.k, `${x.e} keywords must be lowercase (search lowercases the query)`).toBe(x.k.toLowerCase());
        }
    });

    it('finds an emoji by the word an author would actually type', () => {
        const find = (q: string) => ALL.filter(x => x.k.includes(q)).map(x => x.e);
        expect(find('angry')).toContain('😠');
        expect(find('love')).toContain('❤️');
        expect(find('key')).toContain('🔑');
        expect(find('money')).toContain('💰');
        expect(find('sad')).toContain('😢');
        expect(find('luck')).toContain('🍀');
    });

    it('covers every emoji the band presets ship with — clear one and you must be able to pick it back', () => {
        // Relationship / Health / Suspicion in BandEditor.tsx use exactly these. Drop one from the
        // picker and an author who clears it can never re-choose it from the grid.
        const emoji = new Set(ALL.map(x => x.e));
        for (const e of ['😐', '🙂', '😊', '🥰', '💖', '💀', '🤕', '✨', '😌', '🤔', '😠', '🚨']) {
            expect(emoji.has(e), `${e} is used by a band preset but is missing from the picker`).toBe(true);
        }
    });

    it('has stable group ids (they are i18n keys)', () => {
        expect(GROUPS.map(g => g.id)).toEqual(['feelings', 'love', 'status', 'things', 'world', 'marks']);
    });
});
