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

/** Bare `[pause]` (and an appended part with no pause set) waits this long. */
export const DEFAULT_PAUSE_MS = 400;

/**
 * Text effects that can be applied to PART of a line, e.g. `I said [shake]NO[/shake].`
 * These are exactly the whole-line effect types, so an author learns one vocabulary.
 * An optional number sets intensity, mirroring `[pause N]`: `[shake 2]LOUDER[/shake]`.
 */
export const EFFECT_TAGS = new Set(['shake', 'wave', 'rainbow', 'glitch', 'pulse', 'fade-in', 'bounce', 'typewriter-bounce']);

/** One `[tag]`-shaped run in the raw text. Anything not recognised stays literal text. */
type Token =
    | { kind: 'text'; value: string }
    | { kind: 'pause'; ms: number }
    | { kind: 'open'; effect: string; intensity?: number }
    | { kind: 'close'; effect: string };

// A tag is a bracketed lowercase word, optionally closing (`/`) and optionally carrying a number.
const TAG_RE = /\[(\/?)([a-z][a-z-]*)(?:\s+(\d+(?:\.\d+)?))?\]/gi;

/**
 * A FRESH matcher for the same tag shape, for code outside the engine that needs to find codes in
 * a line (the translation export's "keep these codes" notes, and its import validator).
 *
 * Deliberately a factory rather than the shared `TAG_RE`: that one is `/g`, so it carries
 * `lastIndex` between callers and handing it out would let two unrelated loops corrupt each other.
 */
export const dialogueTagMatcher = (): RegExp => new RegExp(TAG_RE.source, 'gi');

/**
 * Split raw dialogue into text and recognised codes. Unknown brackets — `[wink]`, `[3]`,
 * `[Note to self]` — come back as ordinary text, which is the promise the file's header makes
 * and what keeps existing scripts rendering exactly as written.
 */
export const tokenizeDialogueText = (raw: string): Token[] => {
    const out: Token[] = [];
    let last = 0;
    // Which effects are currently open, so a closing tag that matches nothing can be handed back
    // as literal text instead of silently vanishing — the author should see what they typed.
    const openNames: string[] = [];
    const pushText = (value: string) => {
        if (!value) return;
        const prev = out[out.length - 1];
        if (prev && prev.kind === 'text') prev.value += value;   // keep runs contiguous
        else out.push({ kind: 'text', value });
    };
    TAG_RE.lastIndex = 0;
    for (let m = TAG_RE.exec(raw); m; m = TAG_RE.exec(raw)) {
        const [whole, slash, rawName, num] = m;
        const name = rawName.toLowerCase();
        const known = name === 'pause' ? 'pause' : EFFECT_TAGS.has(name) ? 'effect' : null;
        // `[/pause]` is meaningless, and unknown names pass through verbatim.
        if (!known || (slash && known === 'pause')) { pushText(raw.slice(last, m.index) + whole); last = m.index + whole.length; continue; }
        if (known === 'effect' && slash && !openNames.includes(name)) {
            // Closing something that was never opened: not a code, just text the author typed.
            pushText(raw.slice(last, m.index) + whole);
            last = m.index + whole.length;
            continue;
        }
        pushText(raw.slice(last, m.index));
        if (known === 'pause') {
            out.push({ kind: 'pause', ms: num !== undefined ? Math.max(0, parseFloat(num) * 1000) : DEFAULT_PAUSE_MS });
        } else if (slash) {
            openNames.splice(openNames.lastIndexOf(name), 1);
            out.push({ kind: 'close', effect: name });
        } else {
            openNames.push(name);
            out.push({ kind: 'open', effect: name, ...(num !== undefined ? { intensity: parseFloat(num) } : {}) });
        }
        last = m.index + whole.length;
    }
    pushText(raw.slice(last));
    return out;
};

export interface ParsedDialogueCodes {
    /** Text pieces between pause codes. Always pausesMs.length + 1 entries. */
    segments: string[];
    /** Pause after segment i, in ms. */
    pausesMs: number[];
}

export const parseDialogueTextCodes = (raw: string): ParsedDialogueCodes => {
    const segments: string[] = [];
    const pausesMs: number[] = [];
    let current = '';
    for (const token of tokenizeDialogueText(raw)) {
        if (token.kind === 'text') current += token.value;
        else if (token.kind === 'pause') { segments.push(current); current = ''; pausesMs.push(token.ms); }
        // Effect tags contribute no text and no pause — they're stripped like any other code.
    }
    segments.push(current);
    return { segments, pausesMs };
};

/** The text with all `[pause]` codes removed — what history, previews and search should show. */
export const stripDialogueTextCodes = (raw: string): string =>
    parseDialogueTextCodes(raw).segments.join('');

/** A stretch of the CLEAN text that carries its own effect. `end` is exclusive. */
export interface EffectSpan {
    start: number;
    end: number;
    effect: string;
    intensity?: number;
}

export interface ProcessedDialogueText {
    /** Interpolated text with codes removed — the ONLY text anything downstream renders. */
    cleanText: string;
    /** Pause before the character at `index` (clean-text index) is typed. */
    pauses: Array<{ index: number; ms: number }>;
    /** Per-word/phrase effects, in clean-text coordinates. Empty when the line has no tags. */
    effectSpans: EffectSpan[];
}

/**
 * Parse codes, interpolate each text run, and rejoin. Interpolating run-by-run keeps pause
 * positions and effect boundaries correct even when a {Variable}'s value is longer or shorter
 * than its token — and, because codes are read from the RAW text first, a variable's VALUE can
 * never inject one.
 *
 * Unclosed tags run to the end of the line (forgiving, like a missing closing quote in prose);
 * a stray closing tag with nothing open is ignored.
 */
export const processDialogueText = (
    raw: string,
    interpolate: (segment: string) => string
): ProcessedDialogueText => {
    let cleanText = '';
    const pauses: Array<{ index: number; ms: number }> = [];
    const effectSpans: EffectSpan[] = [];
    const open: Array<{ effect: string; intensity?: number; start: number }> = [];

    for (const token of tokenizeDialogueText(raw)) {
        if (token.kind === 'text') {
            cleanText += interpolate(token.value);
        } else if (token.kind === 'pause') {
            pauses.push({ index: cleanText.length, ms: token.ms });
        } else if (token.kind === 'open') {
            open.push({ effect: token.effect, intensity: token.intensity, start: cleanText.length });
        } else {
            // Close the most recent matching open tag, so nesting behaves sensibly.
            const at = [...open].reverse().findIndex(o => o.effect === token.effect);
            if (at === -1) continue;                       // stray close — ignore
            const idx = open.length - 1 - at;
            const [o] = open.splice(idx, 1);
            if (cleanText.length > o.start) effectSpans.push({ start: o.start, end: cleanText.length, effect: o.effect, intensity: o.intensity });
        }
    }
    // Anything still open runs to the end of the line.
    for (const o of open) {
        if (cleanText.length > o.start) effectSpans.push({ start: o.start, end: cleanText.length, effect: o.effect, intensity: o.intensity });
    }
    effectSpans.sort((a, b) => a.start - b.start || a.end - b.end);
    return { cleanText, pauses, effectSpans };
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
