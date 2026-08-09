/**
 * The things inside a line that a translator must NOT translate.
 *
 * `{Nickname}` is replaced at runtime with the player's own text; `[shake]…[/shake]` and
 * `[pause 0.5]` are engine codes. A translator who has never seen our markup will cheerfully
 * translate `[shake]` to `[sacudir]`, and the result renders as literal brackets in the finished
 * game. 🔴 This is the single most likely way a translated build breaks, so it is guarded twice:
 * the exported sheet TELLS the translator what to keep (`describeTokens`), and the importer
 * REFUSES a row whose tokens don't match the source (`compareTokens`).
 *
 * ⚠ Only tokens the engine actually recognises count. `dialogueTextCodes.ts` promises that unknown
 * brackets — `[wink]`, `[3]`, `[Note to self]` — pass through as ordinary text, so treating them
 * as tokens here would refuse perfectly good translations of ordinary prose. The effect-tag list
 * and the tag shape are imported from that file rather than copied, so adding a ninth effect can't
 * silently leave this validator behind.
 */
import { EFFECT_TAGS, dialogueTagMatcher } from '../../components/live-preview/dialogueTextCodes';

export type TokenKind = 'variable' | 'pause' | 'effect';

export interface TextToken {
    /** Exactly as it appears in the text — `{Nickname}`, `[shake 2]`, `[/shake]`. */
    raw: string;
    kind: TokenKind;
    /** Comparison form: tag names lower-cased (the engine matches them case-insensitively). */
    normalized: string;
}

/** `{anything}` — matches the engine's interpolation, which replaces any non-empty brace run. */
const VARIABLE_RE = /\{([^}]+)\}/g;

/**
 * Every recognised token in a line, in the order it appears.
 *
 * Variables keep their exact case — they're looked up by name, so `{nickname}` and `{Nickname}`
 * are not interchangeable and a translator "fixing" the capitalisation is a real break.
 */
export function extractTokens(text: string): TextToken[] {
    if (!text) return [];
    const found: (TextToken & { at: number })[] = [];

    const variables = new RegExp(VARIABLE_RE.source, 'g');
    for (let m = variables.exec(text); m; m = variables.exec(text)) {
        found.push({ raw: m[0], kind: 'variable', normalized: m[0], at: m.index });
    }

    const tags = dialogueTagMatcher();
    for (let m = tags.exec(text); m; m = tags.exec(text)) {
        const [raw, closing, name, amount] = m;
        const lower = name.toLowerCase();
        if (lower !== 'pause' && !EFFECT_TAGS.has(lower)) continue;      // literal text, not a code
        found.push({
            raw,
            kind: lower === 'pause' ? 'pause' : 'effect',
            normalized: `[${closing}${lower}${amount ? ` ${amount}` : ''}]`,
            at: m.index,
        });
    }

    return found.sort((a, b) => a.at - b.at).map(({ at: _at, ...token }) => token);
}

/**
 * The Notes column: plain-language guidance for someone who has never seen this markup.
 *
 * Empty for the vast majority of lines, so the column stays quiet and the warnings that do appear
 * carry weight. Neither Ren'Py nor Visual Novel Maker tells a translator anything about their
 * markup — this column is the practical difference.
 */
export function describeTokens(text: string): string {
    const tokens = extractTokens(text);
    if (!tokens.length) return '';
    const seen: string[] = [];
    for (const t of tokens) if (!seen.includes(t.raw)) seen.push(t.raw);
    const variables = seen.filter(r => r.startsWith('{'));
    const codes = seen.filter(r => r.startsWith('['));
    const parts: string[] = [];
    if (variables.length) parts.push(`Keep ${variables.join(' ')} exactly — the game fills ${variables.length > 1 ? 'these in' : 'this in'}.`);
    if (codes.length) parts.push(`Keep ${codes.join(' ')} exactly — ${codes.length > 1 ? 'these are' : 'this is'} a text effect, not words.`);
    return parts.join(' ');
}

export interface TokenComparison {
    ok: boolean;
    /** In the source, absent from the translation — the translator dropped or translated it. */
    missing: string[];
    /** In the translation but not the source — usually a typo'd or invented code. */
    added: string[];
}

/**
 * Compare a translation's tokens against its source.
 *
 * Compared as a MULTISET, not a sequence: translation reorders words, so `[shake]NO[/shake]` moving
 * to the end of the sentence is correct and must not be flagged. Counts still matter — dropping one
 * of two `{Name}`s is a genuine break — and an unbalanced `[shake]` with no `[/shake]` shows up as
 * a missing token, which is exactly right.
 */
export function compareTokens(source: string, translation: string): TokenComparison {
    const tally = (text: string) => {
        const counts = new Map<string, number>();
        for (const t of extractTokens(text)) counts.set(t.normalized, (counts.get(t.normalized) || 0) + 1);
        return counts;
    };
    const from = tally(source);
    const to = tally(translation);
    const missing: string[] = [];
    const added: string[] = [];

    for (const [token, count] of from) {
        for (let i = 0; i < count - (to.get(token) || 0); i++) missing.push(token);
    }
    for (const [token, count] of to) {
        for (let i = 0; i < count - (from.get(token) || 0); i++) added.push(token);
    }
    return { ok: missing.length === 0 && added.length === 0, missing, added };
}

/* ── Protecting tokens from a machine translator ──────────────────────────────────────────
 * A translation model will happily turn `[shake]` into `[sacudir]` and `{Nickname}` into
 * `{Apodo}`, which renders as literal brackets in the finished game. So before a line is sent to
 * the model, every token is swapped for an opaque marker, and afterwards the markers are swapped
 * back. If a marker doesn't survive the round trip the result is REJECTED rather than saved — a
 * missing translation is a small problem, a broken one shipped to players is not.
 *
 * The marker is plain ASCII with no letters for a model to translate and no brackets or braces to
 * collide with our own markup. Its exact form matters less than the verification: `restoreTokens`
 * checks every marker came back, so a poor marker costs extra rejections, never corruption. */
/**
 * Several marker shapes, tried in order.
 *
 * 🔴 No single marker survives every model. Real drafting showed lines being dropped because the
 * model reformatted `%%0%%` — and since a mangled marker means the whole line is rejected, one
 * fussy placeholder costs real translations. So a line that fails is retried with the next shape:
 * they fail for different reasons, and the cost of a retry is one more call.
 */
const MARKER_STYLES: { make: (index: number) => string; pattern: string }[] = [
    { make: i => `%%${i}%%`, pattern: '%%(\\d+)%%' },
    // Braces and angle brackets are common placeholder conventions, so models are more likely to
    // have been trained to carry them through untouched.
    { make: i => `{${i}}`, pattern: '\\{(\\d+)\\}' },
    { make: i => `<${i}>`, pattern: '<(\\d+)>' },
    { make: i => `[${i}]`, pattern: '\\[(\\d+)\\]' },
];

/** How many different marker shapes are available to try. */
export const MARKER_STYLE_COUNT = MARKER_STYLES.length;

const styleAt = (style: number) => MARKER_STYLES[Math.min(Math.max(style, 0), MARKER_STYLES.length - 1)];

export interface ProtectedText {
    /** The line with every token replaced by a marker — this is what goes to the model. */
    text: string;
    /** The tokens that were removed, in marker order. */
    tokens: string[];
}

/** Swap tokens out for markers. A line with no tokens comes back untouched. */
export function protectTokens(text: string, style = 0): ProtectedText {
    const tokens: TextToken[] = extractTokens(text);
    if (!tokens.length) return { text, tokens: [] };

    const marker = styleAt(style).make;
    let out = '';
    let cursor = 0;
    const raws: string[] = [];
    // extractTokens returns them in order of appearance, so a single left-to-right pass works.
    for (const token of tokens) {
        const at = text.indexOf(token.raw, cursor);
        if (at < 0) continue;
        out += text.slice(cursor, at) + marker(raws.length);
        raws.push(token.raw);
        cursor = at + token.raw.length;
    }
    return { text: out + text.slice(cursor), tokens: raws };
}

export interface RestoreResult {
    text: string;
    /** False when a marker was lost, duplicated or invented — the caller must discard the result. */
    ok: boolean;
    reason?: string;
}

/**
 * Put the tokens back.
 *
 * Order is NOT required to match: translation legitimately moves things around, so a model that
 * returns the markers in a different order is fine. What's required is that each marker appears
 * exactly once — anything else means the model mangled it.
 */
export function restoreTokens(translated: string, tokens: string[], style = 0): RestoreResult {
    if (!tokens.length) return { text: translated, ok: true };

    const { pattern } = styleAt(style);
    const seen = new Map<number, number>();
    const matcher = new RegExp(pattern, 'g');
    for (let m = matcher.exec(translated); m; m = matcher.exec(translated)) {
        const index = Number(m[1]);
        seen.set(index, (seen.get(index) || 0) + 1);
    }

    /* Reasons are written for the author's report, not for a log: this is what they'll read when a
     * line comes back untranslated, and "lost marker 2" would tell them nothing they can act on. */
    for (let i = 0; i < tokens.length; i++) {
        const count = seen.get(i) || 0;
        if (count === 0) return { text: translated, ok: false, reason: `${tokens[i]} didn't survive the translation` };
        if (count > 1) return { text: translated, ok: false, reason: `${tokens[i]} came back more than once` };
    }
    for (const index of seen.keys()) {
        if (index >= tokens.length) {
            return { text: translated, ok: false, reason: 'the translator added something that was never sent' };
        }
    }

    const text = translated.replace(new RegExp(pattern, 'g'), (_m, index) => tokens[Number(index)]);
    return { text, ok: true };
}

/** One line a non-coder can act on, for the import report. */
export function explainMismatch(comparison: TokenComparison): string {
    if (comparison.ok) return '';
    const parts: string[] = [];
    if (comparison.missing.length) parts.push(`missing ${comparison.missing.join(' ')}`);
    if (comparison.added.length) parts.push(`unexpected ${comparison.added.join(' ')}`);
    return `The translation ${parts.join(' and ')} — copy ${comparison.missing.length ? 'it' : 'the original codes'} across exactly as written.`;
}
