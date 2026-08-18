/**
 * STEP 4 GATE - parser coverage.
 *
 * The gate is exact accounting, not a spot check: every logical line in the prologue must be
 * consumed by exactly one IR construct. The old converter dropped 199 raw lines plus every
 * `with`, `window` and `return`, and nothing failed - so "it parsed without throwing" is not
 * enough on its own.
 *
 * CONTENT RULE: counts and statement kinds only. No dialogue is printed, and the fixtures below
 * are written from scratch rather than copied from the game.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseFile, toLogicalLines, stripComment, walk } from '../parse/lexer';
import { parseNodes, readString, ParseError } from '../parse/statements';
import type { Node } from '../ir/nodes';

describe('lexer', () => {
    it('keeps a # that lives inside a string', () => {
        expect(stripComment('scene expression "#fff"')).toBe('scene expression "#fff"');
        expect(stripComment('play music "a.ogg"  # background').trim()).toBe('play music "a.ogg"');
        expect(stripComment("show x  # 'quoted' comment").trim()).toBe('show x');
    });

    it('treats a second statement inside a comment as commented out', () => {
        // The prologue has a line of this exact shape. Splitting on `default` without honouring
        // the comment would invent a variable the game never declares.
        const src = 'default a = True #(note) default b = False #(note)';
        const lines = toLogicalLines(src);
        expect(lines).toHaveLength(1);
        expect(lines[0].text).toBe('default a = True');
    });

    it('folds a statement that wraps inside parentheses', () => {
        const src = [
            '$ ChangePortrait(chara="X", base="base",',
            '                 eyes="n",',
            '                 mouth="h")',
            'window show',
        ].join('\n');
        const lines = toLogicalLines(src);
        expect(lines).toHaveLength(2);
        expect(lines[0].line).toBe(1);
        expect(lines[0].text).toContain('mouth="h")');
        expect(lines[1].text).toBe('window show');
    });

    it('nests by indentation without assuming a fixed step', () => {
        const src = ['label a:', '    if x == 1:', '            window show', 'label b:'].join('\n');
        const tree = parseFile(src);
        expect(tree).toHaveLength(2);
        expect(tree[0].children).toHaveLength(1);
        expect(tree[0].children[0].children).toHaveLength(1);
    });

    it('refuses an unbalanced statement rather than truncating it', () => {
        expect(() => toLogicalLines('$ f(a,')).toThrow(/unbalanced/);
    });
});

describe('string reading', () => {
    it('handles both quote styles and escapes', () => {
        expect(readString('"ab"rest')).toEqual({ text: 'ab', end: 4 });
        expect(readString("'ab'")!.text).toBe('ab');
        const esc = readString('"a' + String.fromCharCode(92) + '"b"');
        expect(esc!.text).toBe('a"b');
    });
});

const parse = (src: string): Node[] => parseNodes(parseFile(src), 'test.rpy');

describe('statements', () => {
    it('reads a say with and without a speaker, and with image attributes', () => {
        const ir = parse(['"narration"', 'c "line"', 'c happy "line"'].join('\n'));
        expect(ir.map(n => n.kind)).toEqual(['say', 'say', 'say']);
        expect(ir[0]).toMatchObject({ speaker: null, attributes: [] });
        expect(ir[1]).toMatchObject({ speaker: 'c', attributes: [] });
        expect(ir[2]).toMatchObject({ speaker: 'c', attributes: ['happy'] });
    });

    it('reads a say with no space before the quote', () => {
        // The prologue writes `nar"..."` 10 times; splitting on whitespace misses all of them.
        const ir = parse('nar"line"');
        expect(ir[0]).toMatchObject({ kind: 'say', speaker: 'nar' });
    });

    it('collapses if / elif / else into one ordered decision', () => {
        const ir = parse([
            'if a == 1:', '    window show',
            'elif a == 2:', '    window hide',
            'else:', '    window show',
        ].join('\n'));
        expect(ir).toHaveLength(1);
        expect(ir[0].kind).toBe('if');
        const clauses = (ir[0] as any).clauses;
        expect(clauses.map((c: any) => c.condition)).toEqual(['a == 1', 'a == 2', null]);
    });

    it('refuses an elif that lost its if', () => {
        expect(() => parse('elif a == 1:\n    window show')).toThrow(ParseError);
    });

    it('reads menu options, including a conditional one', () => {
        const ir = parse(['menu:', '    "one":', '        window show', '    "two" if flag == True:', '        window hide'].join('\n'));
        const opts = (ir[0] as any).options;
        expect(opts).toHaveLength(2);
        expect(opts[0].condition).toBeNull();
        expect(opts[1].condition).toBe('flag == True');
        expect(opts[1].body[0].kind).toBe('window');
    });

    it('reads show with transform, tag override and inline with', () => {
        const ir = parse('show cove_8 at pos_c8 as hero with dissolve');
        expect(ir[0]).toMatchObject({
            kind: 'show', image: ['cove_8'], transforms: ['pos_c8'],
            as: 'hero', withTransition: 'dissolve',
        });
    });

    it('reads a multi-word scene name and a solid-colour scene', () => {
        const ir = parse(['scene bg hill night', 'scene expression "#fff"'].join('\n'));
        expect(ir[0]).toMatchObject({ kind: 'scene', image: ['bg', 'hill', 'night'], colour: null });
        expect(ir[1]).toMatchObject({ kind: 'scene', image: [], colour: '#fff' });
    });

    it('reads an ATL block attached to a show', () => {
        const ir = parse(['show x:', '    zoom 1.2', '    ypos -0.1', '    easein 1.8 yoffset -100', '    pause(0.5)'].join('\n'));
        const atl = (ir[0] as any).atl;
        expect(atl).toHaveLength(4);
        expect(atl[0].props).toEqual({ zoom: 1.2 });
        expect(atl[1].props).toEqual({ ypos: -0.1 });
        expect(atl[2]).toMatchObject({ warper: 'easein', duration: 1.8, props: { yoffset: -100 } });
        expect(atl[3].pause).toBe(0.5);
    });

    it('reads audio with fade keywords', () => {
        const ir = parse(['play music "m.ogg" fadein 0.5 fadeout 1', 'play voice2 "v.ogg"'].join('\n'));
        expect(ir[0]).toMatchObject({ kind: 'play', channel: 'music', files: ['m.ogg'], fadein: 0.5, fadeout: 1 });
        expect(ir[1]).toMatchObject({ kind: 'play', channel: 'voice2', files: ['v.ogg'], fadein: null });
    });

    it('keeps call screen distinct from a label call', () => {
        const ir = parse(['call screen relationship(True)', 'call other_label'].join('\n'));
        expect(ir[0]).toMatchObject({ kind: 'callScreen', screen: 'relationship', args: '(True)' });
        expect(ir[1]).toMatchObject({ kind: 'call', target: 'other_label' });
    });

    it('types window, with, nvl, pause, return and $ rather than dropping them', () => {
        const ir = parse(['window show', 'with dissolve', 'nvl clear', 'pause (4.5)', 'return', '$ x = 1'].join('\n'));
        expect(ir.map(n => n.kind)).toEqual(['window', 'with', 'nvl', 'pause', 'return', 'python']);
        expect((ir[3] as any).duration).toBe(4.5);
        expect((ir[5] as any).code).toBe('x = 1');
    });

    it('throws on a statement it does not recognise', () => {
        expect(() => parse('frobnicate the widget')).toThrow(ParseError);
    });
});

/**
 * Exact accounting: sum the logical lines each IR construct is responsible for.
 * `if` owns its own line plus one per elif/else; `menu` owns its line plus one per option;
 * `show`/`scene` own their line plus each ATL step.
 */
function countLines(nodes: Node[]): number {
    let n = 0;
    for (const node of nodes) {
        n += 1;
        switch (node.kind) {
            case 'label': n += countLines(node.body); break;
            case 'if':
                n += node.clauses.length - 1;
                for (const c of node.clauses) n += countLines(c.body);
                break;
            case 'menu':
                for (const o of node.options) n += 1 + countLines(o.body);
                break;
            case 'show': case 'scene': n += node.atl.length; break;
            default: break;
        }
    }
    return n;
}

function tally(nodes: Node[], acc: Record<string, number> = {}): Record<string, number> {
    for (const node of nodes) {
        acc[node.kind] = (acc[node.kind] ?? 0) + 1;
        if (node.kind === 'label') tally(node.body, acc);
        else if (node.kind === 'if') for (const c of node.clauses) tally(c.body, acc);
        else if (node.kind === 'menu') for (const o of node.options) tally(o.body, acc);
    }
    return acc;
}

const GAME_DIR = process.env.OURLIFE_GAME
    ?? path.resolve(__dirname, '..', '..', '..', 'OurLife', 'game');
const PROLOGUE = path.join(GAME_DIR, 'prologue.rpy');

if (fs.existsSync(PROLOGUE)) describe('prologue coverage', () => {
    const src = fs.readFileSync(PROLOGUE, 'utf8');
    const tree = parseFile(src);
    const logical = walk(tree).length;

    it('GATE: classifies every statement, with no raw bucket', () => {
        const ir = parseNodes(tree, 'prologue.rpy');       // throws on anything unrecognised
        const counts = tally(ir);
        const physical = src.split(/\r?\n/).length;
        const kinds = Object.entries(counts).sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k}=${v}`).join(' ');
        console.log(`[step4] physical=${physical} logical=${logical} accounted=${countLines(ir)}`);
        console.log(`[step4] ${kinds}`);
        // Every logical line belongs to exactly one construct - nothing dropped, nothing double-counted.
        expect(countLines(ir)).toBe(logical);
        expect(counts.say).toBeGreaterThan(0);
        expect(counts.menu).toBeGreaterThan(0);
    });

    it('keeps the statements the old converter discarded', () => {
        const counts = tally(parseNodes(tree, 'prologue.rpy'));
        // 351 `with`, 662 `window` and 32 `return` were silently dropped game-wide before.
        expect(counts.window ?? 0).toBeGreaterThan(0);
        expect(counts.return ?? 0).toBeGreaterThan(0);
        expect((counts.with ?? 0) + (counts.scene ?? 0) + (counts.show ?? 0)).toBeGreaterThan(0);
    });

    it('gives every label a unique name', () => {
        const ir = parseNodes(tree, 'prologue.rpy');
        const names = ir.filter(n => n.kind === 'label').map(n => (n as any).name);
        expect(new Set(names).size).toBe(names.length);
        console.log(`[step4] labels=${names.length}`);
    });
});
