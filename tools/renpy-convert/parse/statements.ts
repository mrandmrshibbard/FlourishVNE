/**
 * Logical lines -> typed IR nodes.
 *
 * The contract: every statement is either recognised and typed, or it THROWS. There is no
 * catch-all bucket. The previous converter silently dropped 199 raw lines, 351 `with`, 662
 * `window` and 32 `return` statements, which is why the output had missing commands and no error
 * to explain them.
 *
 * CONTENT RULE: dialogue text passes through as opaque strings; errors quote the STATEMENT KIND
 * and line number, never the text.
 */
import type { RawNode } from './lexer';
import type {
    Node, Pos, AtlStep, MenuOption, IfClause,
    SayNode, ShowNode, SceneNode,
} from '../ir/nodes';

const BACKSLASH = String.fromCharCode(92);

export class ParseError extends Error {
    constructor(public pos: Pos, kind: string) {
        super(`${pos.file}:${pos.line}: unrecognised statement (${kind})`);
        this.name = 'ParseError';
    }
}

/**
 * Read a leading string literal, honouring both quote styles and backslash escapes.
 * Returns the DECODED text plus how many characters of source it consumed.
 */
export function readString(src: string): { text: string; end: number } | null {
    const q = src[0];
    if (q !== '"' && q !== "'") return null;
    let out = '';
    for (let i = 1; i < src.length; i++) {
        const ch = src[i];
        if (ch === BACKSLASH) { out += src[i + 1] ?? ''; i++; continue; }
        if (ch === q) return { text: out, end: i + 1 };
        out += ch;
    }
    return null;                                   // unterminated
}

/** Pull `with <transition>` off the end of a show/scene/hide statement. */
function splitWith(rest: string): { rest: string; withTransition: string | null } {
    const m = /\s+with\s+([A-Za-z_][A-Za-z0-9_.]*)\s*$/.exec(rest);
    return m ? { rest: rest.slice(0, m.index), withTransition: m[1] } : { rest, withTransition: null };
}

/** Pull `at <t1>, <t2>` off a show/scene statement. */
function splitAt(rest: string): { rest: string; transforms: string[] } {
    const m = /\s+at\s+(.+)$/.exec(rest);
    if (!m) return { rest, transforms: [] };
    const transforms = m[1].split(',').map(s => s.trim()).filter(Boolean);
    return { rest: rest.slice(0, m.index), transforms };
}

const WARPERS = new Set([
    'linear', 'ease', 'easein', 'easeout', 'ease_back', 'easein_back', 'easeout_back',
    'ease_quad', 'easein_quad', 'easeout_quad', 'ease_cubic', 'easein_cubic', 'easeout_cubic',
]);

/**
 * One ATL line. The prologue's ATL is entirely static properties, `pause(n)`, and
 * `<warper> <seconds> <prop> <value>` - anything richer must fail rather than be approximated.
 */
function parseAtlStep(node: RawNode, file: string): AtlStep {
    const pos: Pos = { line: node.line, file };
    const step: AtlStep = { pos, warper: null, duration: null, props: {}, pause: null };
    let toks = node.text.split(/\s+/).filter(Boolean);

    const pauseM = /^pause\s*\(?\s*([-\d.]+)\s*\)?$/.exec(node.text);
    if (pauseM) { step.pause = Number(pauseM[1]); return step; }

    if (WARPERS.has(toks[0])) {
        const d = Number(toks[1]);
        if (!Number.isFinite(d)) throw new ParseError(pos, `atl warper without a duration`);
        step.warper = toks[0];
        step.duration = d;
        toks = toks.slice(2);
    }
    for (let i = 0; i < toks.length; i += 2) {
        const key = toks[i];
        const val = Number(toks[i + 1]);
        if (!/^[a-z_]+$/.test(key) || !Number.isFinite(val)) {
            throw new ParseError(pos, `atl property "${key}"`);
        }
        step.props[key] = val;
    }
    return step;
}

function parseAtlBlock(node: RawNode, file: string): AtlStep[] {
    return node.children.map(c => parseAtlStep(c, file));
}

/** `play <channel> "<file>" [fadein n] [fadeout n] [loop|noloop]` */
function parseAudio(rest: string, pos: Pos) {
    const toks: string[] = [];
    const files: string[] = [];
    let i = 0;
    // Channel first, then one or more quoted filenames, then keyword args.
    const chanM = /^([A-Za-z_][A-Za-z0-9_]*)\s*/.exec(rest);
    if (!chanM) throw new ParseError(pos, 'audio statement without a channel');
    const channel = chanM[1];
    i = chanM[0].length;
    while (i < rest.length) {
        while (rest[i] === ' ' || rest[i] === ',' || rest[i] === '[' || rest[i] === ']') i++;
        const s = readString(rest.slice(i));
        if (!s) break;
        files.push(s.text);
        i += s.end;
    }
    for (const t of rest.slice(i).split(/\s+/).filter(Boolean)) toks.push(t);
    let fadein: number | null = null, fadeout: number | null = null, loop: boolean | null = null;
    for (let k = 0; k < toks.length; k++) {
        if (toks[k] === 'fadein') { fadein = Number(toks[++k]); continue; }
        if (toks[k] === 'fadeout') { fadeout = Number(toks[++k]); continue; }
        if (toks[k] === 'loop') { loop = true; continue; }
        if (toks[k] === 'noloop') { loop = false; continue; }
        if (toks[k] === 'volume') { k++; continue; }
        throw new ParseError(pos, `audio keyword "${toks[k]}"`);
    }
    return { channel, files, fadein, fadeout, loop };
}

/**
 * A say statement: `"text"`, `speaker "text"`, or `speaker attr1 attr2 "text"`.
 * Note the game also writes `nar"text"` with NO space, so the speaker is matched by scanning to
 * the first quote rather than by splitting on whitespace.
 */
function parseSay(text: string, pos: Pos): SayNode | null {
    const q = Math.min(
        ...['"', "'"].map(c => { const i = text.indexOf(c); return i === -1 ? Infinity : i; }),
    );
    if (!Number.isFinite(q)) return null;
    const head = text.slice(0, q).trim();
    const str = readString(text.slice(q));
    if (!str) return null;
    // Anything after the closing quote means this is not a plain say (e.g. a menu option's colon).
    if (text.slice(q + str.end).trim()) return null;
    if (!head) return { kind: 'say', pos, speaker: null, attributes: [], text: str.text };
    const words = head.split(/\s+/);
    if (!words.every(w => /^[A-Za-z_][A-Za-z0-9_]*$/.test(w))) return null;
    return { kind: 'say', pos, speaker: words[0], attributes: words.slice(1), text: str.text };
}

export function parseNodes(nodes: RawNode[], file: string): Node[] {
    const out: Node[] = [];
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const pos: Pos = { line: node.line, file };
        const text = node.text;
        const hasBlock = text.endsWith(':');
        const body = text.slice(0, hasBlock ? -1 : undefined).trim();
        // The head is the leading IDENTIFIER, not the first whitespace-delimited token - the
        // game writes `pause(0.5)` and `nar"..."` with no separating space.
        const head = (/^[A-Za-z_][A-Za-z0-9_]*/.exec(body) ?? [''])[0];
        const rest = body.slice(head.length).trim();
        const restWords = rest.split(/\s+/).filter(Boolean);

        switch (head) {
            case 'label':
                out.push({ kind: 'label', pos, name: restWords[0], body: parseNodes(node.children, file) });
                continue;

            case 'jump':
                out.push({ kind: 'jump', pos, target: restWords[0] });
                continue;

            case 'call': {
                if (restWords[0] === 'screen') {
                    const m = /^screen\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\(.*\))?$/.exec(rest);
                    if (!m) throw new ParseError(pos, 'call screen');
                    out.push({ kind: 'callScreen', pos, screen: m[1], args: m[2] ?? '' });
                    continue;
                }
                out.push({ kind: 'call', pos, target: restWords[0] });
                continue;
            }

            case 'return':
                out.push({ kind: 'return', pos });
                continue;

            case 'window': {
                const a = restWords[0];
                if (a !== 'show' && a !== 'hide' && a !== 'auto') throw new ParseError(pos, `window ${a}`);
                out.push({ kind: 'window', pos, action: a });
                continue;
            }

            case 'nvl': {
                const a = restWords[0];
                if (a !== 'clear' && a !== 'show' && a !== 'hide') throw new ParseError(pos, `nvl ${a}`);
                out.push({ kind: 'nvl', pos, action: a });
                continue;
            }

            case 'with':
                out.push({ kind: 'with', pos, transition: restWords[0] });
                continue;

            case 'pause': {
                const m = /^\(?\s*([-\d.]+)?\s*\)?$/.exec(rest);
                if (!m) throw new ParseError(pos, 'pause');
                out.push({ kind: 'pause', pos, duration: m[1] === undefined ? null : Number(m[1]) });
                continue;
            }

            case 'play': {
                out.push({ kind: 'play', pos, ...parseAudio(rest, pos) });
                continue;
            }
            case 'queue': {
                const a = parseAudio(rest, pos);
                out.push({ kind: 'queue', pos, channel: a.channel, files: a.files });
                continue;
            }
            case 'stop': {
                const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+fadeout\s+([\d.]+))?$/.exec(rest);
                if (!m) throw new ParseError(pos, 'stop');
                out.push({ kind: 'stop', pos, channel: m[1], fadeout: m[2] ? Number(m[2]) : null });
                continue;
            }

            case 'default': {
                const m = /^([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.+)$/.exec(rest);
                if (!m) throw new ParseError(pos, 'default');
                out.push({ kind: 'default', pos, name: m[1], expr: m[2].trim() });
                continue;
            }

            case 'scene': {
                const w1 = splitWith(rest);
                const a1 = splitAt(w1.rest);
                const exprM = /^expression\s+(.+)$/.exec(a1.rest.trim());
                let colour: string | null = null;
                let image: string[] = [];
                if (exprM) {
                    const s = readString(exprM[1].trim());
                    // `scene expression "#fff"` is a solid colour; anything else is a real
                    // expression the mapper has to resolve or mark.
                    if (s && /^#[0-9A-Fa-f]{3,8}$/.test(s.text)) colour = s.text;
                    else throw new ParseError(pos, 'scene expression');
                } else {
                    image = a1.rest.trim().split(/\s+/).filter(Boolean);
                }
                const scene: SceneNode = {
                    kind: 'scene', pos, image, colour,
                    transforms: a1.transforms, atl: parseAtlBlock(node, file),
                    withTransition: w1.withTransition,
                };
                out.push(scene);
                continue;
            }

            case 'show': {
                const w1 = splitWith(rest);
                // Order matters: strip `as` BEFORE `at`, or `at pos_c8 as hero` parses the tag
                // into the transform list and the sprite is placed by a transform that does not exist.
                let preAt = w1.rest.trim();
                let asTag: string | null = null;
                const asM = /\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(preAt);
                if (asM) { asTag = asM[1]; preAt = preAt.slice(0, asM.index).trim(); }
                const a1 = splitAt(preAt);
                let body2 = a1.rest.trim();
                let expression: string | null = null;
                let image: string[] = [];
                const exprM = /^expression\s+(.+)$/.exec(body2);
                if (exprM) expression = exprM[1].trim();
                else image = body2.split(/\s+/).filter(Boolean);
                const show: ShowNode = {
                    kind: 'show', pos, image, as: asTag, expression,
                    transforms: a1.transforms, atl: parseAtlBlock(node, file),
                    withTransition: w1.withTransition,
                };
                out.push(show);
                continue;
            }

            case 'hide': {
                const w1 = splitWith(rest);
                out.push({
                    kind: 'hide', pos,
                    image: w1.rest.trim().split(/\s+/).filter(Boolean),
                    withTransition: w1.withTransition,
                });
                continue;
            }

            case 'menu': {
                const options: MenuOption[] = [];
                for (const c of node.children) {
                    const optPos: Pos = { line: c.line, file };
                    if (!c.text.endsWith(':')) throw new ParseError(optPos, 'menu child without a block');
                    const inner = c.text.slice(0, -1).trim();
                    const s = readString(inner);
                    if (!s) throw new ParseError(optPos, 'menu option without text');
                    const tail = inner.slice(s.end).trim();
                    let condition: string | null = null;
                    if (tail) {
                        const ifM = /^if\s+(.+)$/.exec(tail);
                        if (!ifM) throw new ParseError(optPos, `menu option tail "${tail.split(/\s+/)[0]}"`);
                        condition = ifM[1].trim();
                    }
                    options.push({ pos: optPos, text: s.text, condition, body: parseNodes(c.children, file) });
                }
                out.push({ kind: 'menu', pos, options });
                continue;
            }

            case 'if': {
                // Collect this `if` plus the `elif`/`else` siblings that follow it, so the IR
                // carries one ordered decision instead of three unrelated statements.
                const clauses: IfClause[] = [
                    { pos, condition: rest.trim(), body: parseNodes(node.children, file) },
                ];
                while (i + 1 < nodes.length) {
                    const nxt = nodes[i + 1];
                    const nTxt = nxt.text.replace(/:$/, '').trim();
                    const nPos: Pos = { line: nxt.line, file };
                    if (/^elif\s+/.test(nTxt)) {
                        clauses.push({
                            pos: nPos,
                            condition: nTxt.replace(/^elif\s+/, '').trim(),
                            body: parseNodes(nxt.children, file),
                        });
                    } else if (nTxt === 'else') {
                        clauses.push({ pos: nPos, condition: null, body: parseNodes(nxt.children, file) });
                    } else break;
                    i++;
                }
                out.push({ kind: 'if', pos, clauses });
                continue;
            }

            case 'elif':
            case 'else':
                // Only reachable if the sibling scan above missed one, which would mean the
                // branch silently lost its condition - exactly defect 2's failure mode.
                throw new ParseError(pos, `${head} without a preceding if`);
        }

        if (text.startsWith('$')) {
            out.push({ kind: 'python', pos, code: text.slice(1).trim() });
            continue;
        }

        const say = parseSay(text, pos);
        if (say) { out.push(say); continue; }

        throw new ParseError(pos, text.split(/\s+/)[0]);
    }
    return out;
}
