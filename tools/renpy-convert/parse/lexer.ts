/**
 * Physical .rpy lines -> an indent-nested tree of logical lines.
 *
 * Three things here are load-bearing, and each one has a matching real defect in the game source:
 *
 *  1. Comments must be stripped STRING-AWARE. One `default` line in the prologue reads
 *     `default a = True #(...) default b = False #(...)` - the second `default` sits inside a
 *     comment and never executes. A naive splitter that ignores `#` would invent a variable the
 *     game does not have; one that ignores strings would truncate dialogue containing `#`.
 *  2. Statements WRAP across physical lines inside parentheses (`$ ChangePortrait(...)` does this
 *     constantly), so a logical line is only complete when its parens balance.
 *  3. Ren'Py blocks are indent-delimited like Python, so structure comes from leading whitespace.
 *
 * CONTENT RULE: this module moves game text through as opaque strings. It never logs one.
 */

/** Written via char code because a literal backslash does not survive this repo's heredocs. */
const BACKSLASH = String.fromCharCode(92);

export interface RawNode {
    /** 1-based physical line where the logical line starts. */
    line: number;
    indent: number;
    /** Comment-stripped, right-trimmed source with any continuation lines folded in. */
    text: string;
    children: RawNode[];
}

/**
 * Remove a trailing comment, honouring string literals and escapes.
 * Returns the code part only; the text is otherwise untouched.
 */
export function stripComment(line: string): string {
    let inStr: string | null = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inStr) {
            if (ch === BACKSLASH) { i++; continue; }          // escaped char, skip it
            if (ch === inStr) inStr = null;
            continue;
        }
        if (ch === '"' || ch === "'") { inStr = ch; continue; }
        if (ch === '#') return line.slice(0, i);
    }
    return line;
}

/** Net parenthesis/bracket depth of a code fragment, ignoring anything inside strings. */
export function netDepth(code: string): number {
    let depth = 0;
    let inStr: string | null = null;
    for (let i = 0; i < code.length; i++) {
        const ch = code[i];
        if (inStr) {
            if (ch === BACKSLASH) { i++; continue; }
            if (ch === inStr) inStr = null;
            continue;
        }
        if (ch === '"' || ch === "'") { inStr = ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
    }
    return depth;
}

export interface FlatLine { line: number; indent: number; text: string }

/** Physical lines -> logical lines: comments gone, blanks gone, continuations folded. */
export function toLogicalLines(src: string): FlatLine[] {
    const phys = src.split(/\r?\n/);
    const out: FlatLine[] = [];
    let i = 0;
    while (i < phys.length) {
        const code = stripComment(phys[i]);
        if (!code.trim()) { i++; continue; }
        const indent = code.length - code.trimStart().length;
        let text = code.trim();
        let depth = netDepth(text);
        const start = i;
        while (depth > 0 && i + 1 < phys.length) {
            i++;
            const cont = stripComment(phys[i]).trim();
            text += ' ' + cont;
            depth += netDepth(cont);
        }
        if (depth !== 0) {
            throw new Error(`lexer: unbalanced brackets starting at line ${start + 1}`);
        }
        out.push({ line: start + 1, indent, text });
        i++;
    }
    return out;
}

/**
 * Nest logical lines by indentation.
 *
 * Ren'Py does not require a consistent indent step (the game mixes 4- and 8-space bodies), so
 * "deeper than my parent" is the only safe rule - never "exactly parent + 4".
 */
export function buildTree(lines: FlatLine[]): RawNode[] {
    const roots: RawNode[] = [];
    const stack: RawNode[] = [];
    for (const l of lines) {
        const node: RawNode = { line: l.line, indent: l.indent, text: l.text, children: [] };
        while (stack.length && stack[stack.length - 1].indent >= node.indent) stack.pop();
        if (stack.length) stack[stack.length - 1].children.push(node);
        else roots.push(node);
        stack.push(node);
    }
    return roots;
}

export function parseFile(src: string): RawNode[] {
    return buildTree(toLogicalLines(src));
}

/** Every node in the tree, depth-first - used by the coverage gate. */
export function walk(nodes: RawNode[]): RawNode[] {
    const out: RawNode[] = [];
    const visit = (ns: RawNode[]) => { for (const n of ns) { out.push(n); visit(n.children); } };
    visit(nodes);
    return out;
}
