/**
 * Markdown-lite — the Story Bible's tiny formatting language.
 *
 * Deliberately minimal and hand-rolled (no dependency, no HTML, no innerHTML anywhere):
 *   # / ## / ###  at line start → headings
 *   - or *        at line start → bullet list (consecutive lines group into one list)
 *   1. / 2. …     at line start → numbered list
 *   blank line                  → paragraph break
 *   single newline in a paragraph → line break (writer-friendly)
 *   **bold** and *italic*       → inline (bold parsed first; unpaired markers stay literal)
 *
 * Output is plain data (MdBlock[]) so it's unit-testable; MarkdownPreview maps it to
 * React elements. Literal <, >, & are just text — nothing is ever injected as HTML.
 */

export type MdInline =
    | { type: 'text'; text: string }
    | { type: 'bold'; children: MdInline[] }
    | { type: 'italic'; children: MdInline[] };

export type MdBlock =
    | { type: 'heading'; level: 1 | 2 | 3; inline: MdInline[] }
    | { type: 'paragraph'; lines: MdInline[][] }
    | { type: 'list'; ordered: boolean; items: MdInline[][] };

/** Parse `*italic*` runs in a plain string (no bold markers present in `text`). */
const parseItalic = (text: string): MdInline[] => {
    const out: MdInline[] = [];
    let rest = text;
    for (;;) {
        const open = rest.indexOf('*');
        if (open === -1) break;
        const close = rest.indexOf('*', open + 1);
        if (close === -1 || close === open + 1) break; // unpaired or empty → literal
        if (open > 0) out.push({ type: 'text', text: rest.slice(0, open) });
        out.push({ type: 'italic', children: [{ type: 'text', text: rest.slice(open + 1, close) }] });
        rest = rest.slice(close + 1);
    }
    if (rest) out.push({ type: 'text', text: rest });
    return out.length ? out : [{ type: 'text', text: '' }];
};

/** Parse one line's inline markup: `**bold**` first, italics inside the remaining pieces. */
export const parseInline = (line: string): MdInline[] => {
    const out: MdInline[] = [];
    let rest = line;
    for (;;) {
        const open = rest.indexOf('**');
        if (open === -1) break;
        let close = rest.indexOf('**', open + 2);
        if (close === -1 || close === open + 2) break; // unpaired or empty → literal
        // "***" at the close = an italic closing flush against the bold closing
        // ("**bold *and italic***") — keep the first star inside so the italic pairs up.
        if (rest[close + 2] === '*') close += 1;
        if (open > 0) out.push(...parseItalic(rest.slice(0, open)));
        out.push({ type: 'bold', children: parseItalic(rest.slice(open + 2, close)) });
        rest = rest.slice(close + 2);
    }
    if (rest) out.push(...parseItalic(rest));
    return out.length ? out : [{ type: 'text', text: '' }];
};

const HEADING = /^(#{1,3}) (.*)$/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^\d+\. (.*)$/;

export function parseMarkdownLite(text: string): MdBlock[] {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const blocks: MdBlock[] = [];
    let paragraph: MdInline[][] = [];

    const flushParagraph = () => {
        if (paragraph.length) {
            blocks.push({ type: 'paragraph', lines: paragraph });
            paragraph = [];
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) { flushParagraph(); continue; }

        const h = HEADING.exec(line);
        if (h) {
            flushParagraph();
            blocks.push({ type: 'heading', level: h[1].length as 1 | 2 | 3, inline: parseInline(h[2]) });
            continue;
        }

        const bullet = BULLET.exec(line);
        const ordered = bullet ? null : ORDERED.exec(line);
        if (bullet || ordered) {
            flushParagraph();
            const isOrdered = !!ordered;
            const items: MdInline[][] = [parseInline((bullet || ordered)![1])];
            // Group consecutive list lines of the SAME kind into one list block.
            while (i + 1 < lines.length) {
                const next = lines[i + 1];
                const m = isOrdered ? ORDERED.exec(next) : BULLET.exec(next);
                if (!m) break;
                items.push(parseInline(m[1]));
                i++;
            }
            blocks.push({ type: 'list', ordered: isOrdered, items });
            continue;
        }

        paragraph.push(parseInline(line));
    }
    flushParagraph();
    return blocks;
}
