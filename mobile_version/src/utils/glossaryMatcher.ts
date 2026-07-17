import type { VNGlossaryEntry, VNGlossarySettings } from '../types/project';

/**
 * Glossary term matcher — the runtime core of the Glossary feature.
 *
 * Pure and engine-safe (type-only imports; no React, no DOM). Compiled once per
 * project.glossary object, then queried per dialogue line. Design notes:
 *  - NO regex for the terms themselves — plain indexOf scanning per needle, so terms
 *    containing regex metacharacters ("C++", "?!", "(...)") just work.
 *  - Word boundaries are checked BY HAND with a Unicode-aware character class, because
 *    JS \b only understands ASCII: "maçã" must NOT match inside "maçãs", and "coração"
 *    must match in "meu coração!". A side whose edge character is itself punctuation
 *    (the "+" in "C++") skips the boundary check on that side.
 *  - ALL occurrences are matched; overlaps resolve longest-match-wins ("magic sword"
 *    beats "magic" at the same spot). Results are sorted and non-overlapping.
 *  - Case-insensitive matching folds via toLowerCase (not full ICU case folding — the
 *    Turkish dotted-İ edge case is out of scope for v1).
 */

export interface GlossaryMatch {
    /** Index into the text, inclusive. */
    start: number;
    /** Index into the text, exclusive. */
    end: number;
    entryId: string;
}

export interface CompiledGlossary {
    hasEntries: boolean;
    /** All non-overlapping matches in the FULL text, sorted by start. Memoized per text. */
    findMatches(text: string): GlossaryMatch[];
}

interface Needle {
    needle: string;
    foldedNeedle: string;
    caseSensitive: boolean;
    entryId: string;
    /** Compile order — the tiebreaker when two needles produce identical spans. */
    order: number;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const isWordChar = (ch: string | undefined): boolean => ch != null && WORD_CHAR.test(ch);

const EMPTY: GlossaryMatch[] = [];

export function compileGlossary(
    glossary: { entries: Record<string, VNGlossaryEntry>; settings?: VNGlossarySettings } | undefined | null
): CompiledGlossary | null {
    if (!glossary || glossary.settings?.enabled === false) return null;

    const needles: Needle[] = [];
    let order = 0;
    for (const entry of Object.values(glossary.entries || {})) {
        if (!entry || entry.enabled === false) continue;
        const caseSensitive = !!entry.caseSensitive;
        const words = [entry.term, ...(entry.alternatives || [])];
        for (const raw of words) {
            const needle = (raw || '').trim();
            if (!needle) continue;
            needles.push({ needle, foldedNeedle: needle.toLowerCase(), caseSensitive, entryId: entry.id, order: order++ });
        }
    }
    if (needles.length === 0) return null;

    // Per-compile memo: dialogue re-renders every typewriter tick with the same FULL line,
    // so repeated lookups must be free. Small FIFO cap keeps long play sessions bounded.
    const memo = new Map<string, GlossaryMatch[]>();
    const MEMO_CAP = 50;

    const findMatches = (text: string): GlossaryMatch[] => {
        if (!text) return EMPTY;
        const hit = memo.get(text);
        if (hit) return hit;

        const folded = text.toLowerCase();
        type Candidate = GlossaryMatch & { order: number };
        const candidates: Candidate[] = [];

        for (const n of needles) {
            const haystack = n.caseSensitive ? text : folded;
            const needle = n.caseSensitive ? n.needle : n.foldedNeedle;
            let idx = haystack.indexOf(needle);
            while (idx !== -1) {
                const end = idx + needle.length;
                // Boundary checks only on sides whose edge char is a word character —
                // punctuation-edged terms ("C++") are free on that side.
                const leftOk = !isWordChar(needle[0]) || !isWordChar(text[idx - 1]);
                const rightOk = !isWordChar(needle[needle.length - 1]) || !isWordChar(text[end]);
                if (leftOk && rightOk) candidates.push({ start: idx, end, entryId: n.entryId, order: n.order });
                idx = haystack.indexOf(needle, idx + 1);
            }
        }
        if (candidates.length === 0) {
            memo.set(text, EMPTY);
            return EMPTY;
        }

        // Longest-match-wins on overlaps: sort by start, then longer first, then compile
        // order; greedy sweep keeps candidates that begin at/after the last kept end.
        candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.order - b.order);
        const kept: GlossaryMatch[] = [];
        let lastEnd = -1;
        for (const c of candidates) {
            if (c.start >= lastEnd) {
                kept.push({ start: c.start, end: c.end, entryId: c.entryId });
                lastEnd = c.end;
            }
        }

        if (memo.size >= MEMO_CAP) {
            const oldest = memo.keys().next().value;
            if (oldest !== undefined) memo.delete(oldest);
        }
        memo.set(text, kept);
        return kept;
    };

    return { hasEntries: true, findMatches };
}
