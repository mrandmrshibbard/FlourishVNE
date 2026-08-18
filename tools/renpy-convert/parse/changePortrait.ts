/**
 * Extracts `$ ChangePortrait(chara=…, <slot>=<value>, …)` calls.
 *
 * `ChangePortrait` is THE sprite primitive (15,871 calls game-wide, 333 in the prologue). It
 * mutates a persistent dict; the visual only changes on the next `show`. Two shapes matter:
 *  - calls WRAP across lines inside the parens, so physical lines must be folded first;
 *  - non-slot kwargs (`chara`, `blink`, `transition`, `matrix`) are control, not layers.
 *
 * Values that are not plain literals (e.g. `matrix=im.matrix...`, or a variable) are reported
 * as `dynamic` rather than dropped — the previous converter silently discarded 1,705 of them.
 */
export interface PortraitCall {
    line: number;
    chara: string;
    /** slot -> literal value */
    slots: Record<string, string>;
    /** slot -> raw source text, for kwargs whose value is not a literal */
    dynamic: Record<string, string>;
    blink?: boolean;
    transition?: boolean;
    /** raw `matrix=` expression when present (colour grading). */
    matrix?: string;
}

/** Written via char code so no build step can mangle an escaped literal. */
const BACKSLASH = String.fromCharCode(92);

const CONTROL = new Set(['chara', 'blink', 'transition', 'matrix']);

/** Fold physical lines so a parenthesised call becomes one logical line. */
export function foldParens(src: string): { text: string; line: number }[] {
    const out: { text: string; line: number }[] = [];
    const lines = src.split(/\r?\n/);
    let buf = '';
    let start = 0;
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (depth === 0) { buf = raw; start = i + 1; } else { buf += ' ' + raw.trim(); }
        // Count parens outside string literals.
        let inStr: string | null = null;
        for (let c = 0; c < raw.length; c++) {
            const ch = raw[c];
            if (inStr) { if (ch === inStr && raw[c - 1] !== BACKSLASH) inStr = null; continue; }
            if (ch === '"' || ch === "'") { inStr = ch; continue; }
            if (ch === '#') break;                       // comment: rest of the line is not code
            if (ch === '(') depth++;
            else if (ch === ')') depth = Math.max(0, depth - 1);
        }
        if (depth === 0) out.push({ text: buf, line: start });
    }
    return out;
}

/** Split a kwarg list on top-level commas (never inside nested parens or strings). */
function splitArgs(s: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inStr: string | null = null;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inStr) { cur += ch; if (ch === inStr && s[i - 1] !== BACKSLASH) inStr = null; continue; }
        if (ch === '"' || ch === "'") { inStr = ch; cur += ch; continue; }
        if (ch === '(' || ch === '[') depth++;
        if (ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    return parts.map(p => p.trim()).filter(Boolean);
}

/**
 * Parse the ARGUMENT LIST of a ChangePortrait call. Split out so the dataflow analysis can run it
 * per IR statement instead of re-scanning the file.
 */
export function parsePortraitArgs(argsSrc: string, line: number): PortraitCall {
    {
        const call: PortraitCall = { line, chara: '', slots: {}, dynamic: {} };
        for (const arg of splitArgs(argsSrc)) {
            const kv = /^(\w+)\s*=\s*([\s\S]+)$/.exec(arg);
            if (!kv) continue;
            const key = kv[1];
            const rawVal = kv[2].trim();
            const lit = /^"([^"]*)"$|^'([^']*)'$/.exec(rawVal);
            const literal = lit ? (lit[1] ?? lit[2]) : null;
            if (key === 'chara') { call.chara = literal ?? rawVal; continue; }
            if (key === 'blink') { call.blink = rawVal === 'True'; continue; }
            if (key === 'transition') { call.transition = rawVal === 'True'; continue; }
            if (key === 'matrix') { call.matrix = rawVal; continue; }
            if (CONTROL.has(key)) continue;
            if (literal !== null) call.slots[key] = literal;
            else call.dynamic[key] = rawVal;
        }
        return call;
    }
}

/** Match a `ChangePortrait(...)` call in already-stripped `$` code; null when it is not one. */
export function matchChangePortrait(code: string, line: number): PortraitCall | null {
    const m = /^ChangePortrait\s*\((.*)\)\s*$/.exec(code.trim());
    if (!m) return null;
    const call = parsePortraitArgs(m[1], line);
    return call.chara ? call : null;
}

/** Every ChangePortrait call in a whole .rpy source. */
export function extractChangePortraitCalls(src: string): PortraitCall[] {
    const calls: PortraitCall[] = [];
    for (const { text, line } of foldParens(src)) {
        const m = /^\$\s*ChangePortrait\s*\((.*)\)\s*$/.exec(text.trim());
        if (!m) continue;
        const call = parsePortraitArgs(m[1], line);
        if (call.chara) calls.push(call);
    }
    return calls;
}
