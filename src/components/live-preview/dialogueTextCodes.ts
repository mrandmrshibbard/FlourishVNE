/**
 * Inline dialogue text codes + append-group helpers. Engine code (ships in built games).
 *
 * `[pause 0.5]` inside dialogue text makes the typewriter hold for that many seconds before the
 * next letter — mid-sentence comedic/dramatic beats in ONE command. This is the engine's first
 * inline markup, so the contract is strict:
 *   - Only `[pause]` / `[pause N]` is recognized. Anything else in brackets ("[wink]") passes
 *     through VERBATIM — same promise {Variable} interpolation makes for unknown tokens.
 *   - Codes are parsed from the RAW text BEFORE variable interpolation (a variable's VALUE can
 *     never inject a pause), and everything downstream — glossary spans, karaoke word ranges,
 *     the rendered text — sees only the CLEAN text with codes removed.
 */
import { CommandType, VNCommand } from '../../features/scene/types';

const PAUSE_RE = /\[pause(?:\s+(\d+(?:\.\d+)?))?\]/gi;
/** Bare `[pause]` (and an appended part with no pause set) waits this long. */
export const DEFAULT_PAUSE_MS = 400;

export interface ParsedDialogueCodes {
    /** Text pieces between pause codes. Always pausesMs.length + 1 entries. */
    segments: string[];
    /** Pause after segment i, in ms. */
    pausesMs: number[];
}

export const parseDialogueTextCodes = (raw: string): ParsedDialogueCodes => {
    const segments: string[] = [];
    const pausesMs: number[] = [];
    let last = 0;
    PAUSE_RE.lastIndex = 0;
    for (let m = PAUSE_RE.exec(raw); m; m = PAUSE_RE.exec(raw)) {
        segments.push(raw.slice(last, m.index));
        pausesMs.push(m[1] !== undefined ? Math.max(0, parseFloat(m[1]) * 1000) : DEFAULT_PAUSE_MS);
        last = m.index + m[0].length;
    }
    segments.push(raw.slice(last));
    return { segments, pausesMs };
};

/** The text with all `[pause]` codes removed — what history, previews and search should show. */
export const stripDialogueTextCodes = (raw: string): string =>
    parseDialogueTextCodes(raw).segments.join('');

export interface ProcessedDialogueText {
    /** Interpolated text with codes removed — the ONLY text anything downstream renders. */
    cleanText: string;
    /** Pause before the character at `index` (clean-text index) is typed. */
    pauses: Array<{ index: number; ms: number }>;
}

/**
 * Parse codes, interpolate each segment, and rejoin. Interpolating per segment keeps the pause
 * positions correct even when a {Variable}'s value is longer or shorter than its token.
 */
export const processDialogueText = (
    raw: string,
    interpolate: (segment: string) => string
): ProcessedDialogueText => {
    const { segments, pausesMs } = parseDialogueTextCodes(raw);
    let cleanText = '';
    const pauses: Array<{ index: number; ms: number }> = [];
    segments.forEach((segment, i) => {
        cleanText += interpolate(segment);
        if (i < pausesMs.length) pauses.push({ index: cleanText.length, ms: pausesMs[i] });
    });
    return { cleanText, pauses };
};

/**
 * The seam rule for appended parts: a space is inserted when the NEW part starts with a letter
 * or digit ("Hello."+"Goodbye" → "Hello. Goodbye", "You know..."+"I lied" → "You know... I lied")
 * — unless the previous part ends with a space (author's spacing wins), a dash of any kind
 * ("wai-"+"t!" letter tricks stay tight), or an opening bracket/quote. A new part starting with
 * punctuation always joins tight ("Hello"+", right?").
 */
export const smartJoin = (prev: string, next: string): string => {
    if (!prev || !next) return prev + next;
    const nextStartsWord = /[\p{L}\p{N}]/u.test(next[0]);
    const prevEndsJoiner = /[\s\p{Pd}([{«"'‘“]$/u.test(prev);
    return nextStartsWord && !prevEndsJoiner ? `${prev} ${next}` : prev + next;
};

// ── Automatic punctuation pacing ────────────────────────────────────────────────────────────

export interface PunctuationPacingCfg {
    commaMs: number;
    sentenceMs: number;
    ellipsisMs: number;
}

/** The engine defaults when the project setting is enabled with fields unset. */
export const DEFAULT_PUNCTUATION_PACING: PunctuationPacingCfg = { commaMs: 150, sentenceMs: 300, ellipsisMs: 450 };

const COMMA_CLASS = new Set([',', ';', ':']);
const SENTENCE_CLASS = new Set(['.', '!', '?']);
const CLOSERS = new Set(['"', '”', '’', "'", ')', ']', '}', '»']);
const DIGIT = /[0-9]/;

/**
 * Natural reading pauses at punctuation, computed once per line from the CLEAN text.
 * Rules (all pinned by tests):
 *  - comma class `, ; :` → commaMs; sentence class `. ! ?` → sentenceMs; `…` or a run of
 *    2+ dots → ellipsisMs.
 *  - The pause lands AFTER the punctuation (typewriter waits before the NEXT character).
 *  - A run of pacing punctuation collapses to ONE pause at the end of the run; the strongest
 *    class in the run wins (ellipsis > sentence > comma) — "?!" is one sentence pause.
 *  - Closing quotes/brackets right after the run ride along (pause lands after them).
 *  - Digit guard: `.` `,` `:` BETWEEN two digits never pauses (3.14, 1,000, 12:30).
 *  - A pause that would land at/after the end of the text is dropped.
 */
export const punctuationPauses = (
    cleanText: string,
    cfg: PunctuationPacingCfg
): Array<{ index: number; ms: number }> => {
    const out: Array<{ index: number; ms: number }> = [];
    let i = 0;
    while (i < cleanText.length) {
        const ch = cleanText[i];
        const isComma = COMMA_CLASS.has(ch);
        const isSentence = SENTENCE_CLASS.has(ch);
        const isEllipsisChar = ch === '…';
        if (!isComma && !isSentence && !isEllipsisChar) { i++; continue; }
        // Digit guard: numeric separators never pause.
        if ((ch === '.' || ch === ',' || ch === ':')
            && DIGIT.test(cleanText[i - 1] ?? '') && DIGIT.test(cleanText[i + 1] ?? '')) {
            i++;
            continue;
        }
        // Collect the run of pacing punctuation; track dot count + strongest class.
        let dots = 0;
        let strongest: 'comma' | 'sentence' | 'ellipsis' = 'comma';
        let j = i;
        while (j < cleanText.length) {
            const c = cleanText[j];
            if (c === '…') { strongest = 'ellipsis'; j++; continue; }
            if (c === '.') { dots++; if (dots >= 2) strongest = 'ellipsis'; else if (strongest === 'comma') strongest = 'sentence'; j++; continue; }
            if (SENTENCE_CLASS.has(c)) { if (strongest === 'comma') strongest = 'sentence'; j++; continue; }
            if (COMMA_CLASS.has(c)) { j++; continue; }
            break;
        }
        // Closers ride along.
        while (j < cleanText.length && CLOSERS.has(cleanText[j])) j++;
        if (j < cleanText.length) {
            const ms = strongest === 'ellipsis' ? cfg.ellipsisMs : strongest === 'sentence' ? cfg.sentenceMs : cfg.commaMs;
            if (ms > 0) out.push({ index: j, ms });
        }
        i = j;
    }
    return out;
};

/**
 * Walk from a command index back to the HEAD of its append group — the first line of the box.
 * Resuming anywhere inside a group (a save made mid-group, "Reload to line", play-from-here)
 * must start here, or the earlier parts of the accumulated text would be missing.
 */
export const walkToAppendGroupHead = (commands: VNCommand[] | undefined, index: number): number => {
    if (!commands) return index;
    let i = Math.max(0, Math.min(index, commands.length - 1));
    while (i > 0) {
        const cmd = commands[i] as any;
        if (cmd?.type === CommandType.Dialogue && cmd.append) i--;
        else break;
    }
    return i;
};
