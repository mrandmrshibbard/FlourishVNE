/**
 * Character name mentions — when a character's name appears INSIDE a dialogue line, the
 * renderer shows it in that character's own identity (name color and/or font).
 *
 * Pure and engine-safe. Built on the same generic needle matcher as the Glossary
 * (compileNeedles): plain-text scanning, Unicode word boundaries, longest-match-wins —
 * so "Annabel" never half-matches as "Anna", and "Ann's" still matches "Ann".
 *
 * Needles are each character's RESOLVED display name: names may carry {Nickname} variable
 * tokens, and the mention must match what's actually on screen — callers recompile when
 * variables change (resolveCharacterDisplayName's token-free fast path keeps that cheap).
 */
import { compileNeedles, NeedleMatch } from './glossaryMatcher';
import { resolveCharacterDisplayName } from './variableInterpolation';
import { stripDialogueTextCodes, processDialogueText } from '../components/live-preview/dialogueTextCodes';

export interface CompiledNameMentions {
    /** All non-overlapping name matches in the FULL text, sorted by start; id = characterId. */
    findMatches(text: string): NeedleMatch[];
}

/** Compile the current character roster into a mention matcher, or null when there is
 *  nothing to match. Single-character names are skipped — an "X" would light up far too
 *  eagerly; word boundaries handle everything from two characters up. */
export function compileNameMentions(
    characters: Record<string, { id: string; name?: string } | undefined> | undefined,
    variables: Record<string, string | number | boolean>,
    project: unknown,
): CompiledNameMentions | null {
    if (!characters) return null;
    const specs: Array<{ needle: string; id: string }> = [];
    for (const c of Object.values(characters)) {
        if (!c?.id) continue;
        // Strip inline effect tags from the RAW name BEFORE resolving tokens: what's on
        // screen (dialogue and name box alike) is the clean text — a needle that kept
        // "[wave]…[/wave]" would never match anything and the mention would silently die.
        // (Strip-then-resolve, so a variable's VALUE can never be eaten as a tag.)
        const resolved = resolveCharacterDisplayName(stripDialogueTextCodes(c.name || ''), variables, project as any).trim();
        if (resolved.length < 2) continue;
        specs.push({ needle: resolved, id: c.id });
        // Also match the RAW (unresolved) name when it differs and carries no tokens —
        // covers a renamed character whose old fixed name still appears in prose? NO:
        // deliberately not — the text on screen is interpolated, so only the resolved
        // name can appear. One needle per character keeps matches unambiguous.
    }
    if (specs.length === 0) return null;
    return compileNeedles(specs);
}

/** The text effect a MENTION of this character should carry: their Name effect setting
 *  wins; otherwise the first inline [tag] effect in their name. (Tags are stripped from
 *  the match needle, so without this the mention would lose the look the name box has.) */
export function mentionEffectOf(
    char: { name?: string; nameTextEffect?: { type: string; speed?: number; intensity?: number } } | undefined,
): { type: string; speed?: number; intensity?: number } | undefined {
    if (!char) return undefined;
    if (char.nameTextEffect?.type && char.nameTextEffect.type !== 'none') return char.nameTextEffect;
    const spans = processDialogueText(char.name || '', s => s).effectSpans;
    if (!spans.length) return undefined;
    return { type: spans[0].effect, ...(spans[0].intensity !== undefined ? { intensity: spans[0].intensity } : {}) };
}

/** Drop mention matches that overlap any glossary match — glossary tooltips are functional
 *  (hover/click), mention styling is decoration; the functional span wins the overlap. */
export function subtractOverlaps(
    mentions: NeedleMatch[],
    reserved: Array<{ start: number; end: number }>,
): NeedleMatch[] {
    if (!mentions.length || !reserved.length) return mentions;
    return mentions.filter(m => !reserved.some(r => m.start < r.end && r.start < m.end));
}
