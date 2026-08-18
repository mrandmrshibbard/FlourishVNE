/**
 * Ren'Py dialogue text -> Flourish dialogue text.
 *
 * 🔴 The two engines use SWAPPED delimiters:
 *      Ren'Py   `[var]` interpolates,  `{tag}` is markup
 *      Flourish `{Var}` interpolates,  `[tag]` is markup
 * So every string has to be rewritten, and a naive find-and-replace cannot do it: it would turn
 * an escaped `[[` into an interpolation, and would leave a literal `{` looking like a variable.
 * This walks the string ONCE, classifying each delimiter as it goes.
 *
 * Flourish's tokenizer passes an unrecognised `[name]` through as plain text, so a converted
 * literal is only dangerous when its name is in `EFFECT_TAGS` or is `pause` - that exact set is
 * checked, rather than escaping everything and changing text the player sees.
 *
 * CONTENT RULE: this module transforms text but never logs it; gaps carry positions and kinds.
 */

/** Flourish markup names. An emitted literal `[name]` matching one of these WOULD be eaten. */
export const FLOURISH_TAGS = new Set([
    'shake', 'wave', 'rainbow', 'glitch', 'pulse', 'fade-in', 'bounce', 'typewriter-bounce', 'pause',
]);

export interface TextGap {
    kind: 'markup-dropped' | 'markup-unsupported' | 'tag-collision' | 'unknown-variable' | 'brace-collision';
    /** The construct, not the surrounding text. */
    detail: string;
}

export interface TextResult {
    text: string;
    gaps: TextGap[];
    /** Ren'Py variable names this string interpolates. */
    variables: string[];
}

export interface TextContext {
    /** Ren'Py variable name -> the Flourish variable NAME to interpolate, or null if unknown. */
    variableName?: (name: string) => string | null;
}

/**
 * `config.replace_text` from the game's options.rpy, applied at convert time because Ren'Py
 * applies it to every displayed string at runtime. The last two rules exist because the game's
 * font cannot render those accented characters.
 */
export function replaceText(s: string): string {
    return s
        .replace(/’/g, "'")
        .replace(/‘/g, "'")
        .replace(/–/g, '-')
        .replace(/…/g, '...')
        .replace(/iancé/g, 'iance')
        .replace(/afé/g, 'afe');
}

/** Ren'Py markup this converter can carry across, mapped to its Flourish spelling. */
const MARKUP_DROPPED = new Set(['i', '/i', 'b', '/b', 'u', '/u', 's', '/s']);

export function mapText(src: string, ctx: TextContext = {}): TextResult {
    const gaps: TextGap[] = [];
    const variables: string[] = [];
    let out = '';

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];

        // Ren'Py escapes: `[[` is a literal `[`, `{{` is a literal `{`.
        if (ch === '[' && src[i + 1] === '[') { out += '['; i++; continue; }
        if (ch === '{' && src[i + 1] === '{') {
            // Ren'Py's escape for a literal brace. In FLOURISH a literal `{` opens an
            // interpolation, so carrying one across is a hazard, not a neutral character.
            out += '{';
            gaps.push({ kind: 'brace-collision', detail: '{' });
            i++;
            continue;
        }
        if (ch === '}' && src[i + 1] === '}') { out += '}'; i++; continue; }

        if (ch === '[') {
            const close = src.indexOf(']', i);
            if (close === -1) { out += ch; continue; }
            const body = src.slice(i + 1, close);
            i = close;
            // Strip Ren'Py conversion flags (`!t`, `!u`, ...) and format specs (`:>10`).
            const name = body.split('!')[0].split(':')[0].trim();
            variables.push(name);
            const mapped = ctx.variableName ? ctx.variableName(name) : name;
            if (!mapped) {
                gaps.push({ kind: 'unknown-variable', detail: name });
                out += `{${name}}`;                 // keep the shape so the gap is visible in-game
                continue;
            }
            out += `{${mapped}}`;
            continue;
        }

        if (ch === '{') {
            const close = src.indexOf('}', i);
            if (close === -1) { out += ch; continue; }
            const tag = src.slice(i + 1, close).trim();
            i = close;
            const bare = tag.split('=')[0];
            if (MARKUP_DROPPED.has(bare)) {
                // Flourish has no inline italic/bold, so the emphasis is lost. Recorded as a
                // degradation rather than silently dropped, and never faked with punctuation.
                gaps.push({ kind: 'markup-dropped', detail: `{${bare}}` });
                continue;
            }
            gaps.push({ kind: 'markup-unsupported', detail: `{${bare}}` });
            continue;
        }

        out += ch;
    }

    out = replaceText(out);

    // A literal `[name]` surviving into the output would be swallowed by Flourish's tokenizer if
    // the name happens to be one of its tags.
    for (const m of out.matchAll(/\[(\/?)([a-z][a-z-]*)(?:\s+[\d.]+)?\]/gi)) {
        if (FLOURISH_TAGS.has(m[2].toLowerCase())) {
            gaps.push({ kind: 'tag-collision', detail: m[0] });
        }
    }

    return { text: out, gaps, variables };
}
