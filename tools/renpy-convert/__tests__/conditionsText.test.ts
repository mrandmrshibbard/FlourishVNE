/**
 * STEP 7 GATES - conditions and text.
 *
 * Conditions are defect 2: the old converter emitted invented operator names, the engine's
 * evaluator fell through to `default: return false`, and 653 of 653 branch conditions were
 * permanently false. These tests check the real operator strings AND that the shapes the prologue
 * actually uses all translate.
 *
 * CONTENT RULE: fixtures below are written from scratch. The real-data pass reports counts and
 * construct shapes only - never a line of dialogue.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mapCondition, parseLiteral } from '../map/conditions';
import { mapText, replaceText, FLOURISH_TAGS } from '../map/text';
import { OPERATORS } from '../ir/engineContract';
import { parseFile } from '../parse/lexer';
import { parseNodes } from '../parse/statements';
import type { Node } from '../ir/nodes';

/** Every name is a known variable, mapped to `v_<name>`. */
const ctx = { variableId: (n: string) => `v_${n}` };
const strictCtx = (known: string[]) => ({
    variableId: (n: string) => (known.includes(n) ? `v_${n}` : null),
});

describe('operator vocabulary', () => {
    it('uses only strings the engine actually understands', () => {
        // The invented names that broke the previous build.
        const invented = ['equals', 'greater_than', 'less_than', 'not_equals', 'gte', 'lte'];
        for (const bad of invented) {
            expect(Object.values(OPERATORS as Record<string, string>)).not.toContain(bad);
        }
        expect(Object.values(OPERATORS as Record<string, string>)).toContain('==');
        expect(Object.values(OPERATORS as Record<string, string>)).toContain('is true');
    });
});

describe('condition mapping', () => {
    it('maps the comparison operators', () => {
        expect(mapCondition('comfort == 1', ctx)!.conditions).toEqual([
            { variableId: 'v_comfort', operator: '==', value: 1 },
        ]);
        expect(mapCondition('interest > 1', ctx)!.conditions[0].operator).toBe('>');
        expect(mapCondition('a >= 2', ctx)!.conditions[0].operator).toBe('>=');
        expect(mapCondition('a <= 2', ctx)!.conditions[0].operator).toBe('<=');
        expect(mapCondition('a < 2', ctx)!.conditions[0].operator).toBe('<');
        expect(mapCondition('a != 2', ctx)!.conditions[0].operator).toBe('!=');
    });

    it('does not read >= as >', () => {
        const r = mapCondition('a >= 2', ctx)!;
        expect(r.conditions[0].operator).toBe('>=');
        expect(r.conditions[0].value).toBe(2);
    });

    it('turns boolean comparisons into the dedicated operators', () => {
        expect(mapCondition('help_cliff == True', ctx)!.conditions).toEqual([
            { variableId: 'v_help_cliff', operator: 'is true' },
        ]);
        expect(mapCondition('flag == False', ctx)!.conditions[0].operator).toBe('is false');
        expect(mapCondition('flag != True', ctx)!.conditions[0].operator).toBe('is false');
        expect(mapCondition('not flag', ctx)!.conditions[0].operator).toBe('is false');
        expect(mapCondition('flag', ctx)!.conditions[0].operator).toBe('is true');
    });

    it('expands `not in (a, b, c)` into an all-AND chain of !=', () => {
        // Flourish evaluates left to right with no precedence, so an AND chain is exact here.
        const r = mapCondition('comfort not in (1, 2, 3, 4)', ctx)!;
        expect(r.conditions).toHaveLength(4);
        expect(r.conditions.every(c => c.operator === '!=')).toBe(true);
        expect(r.conditions.map(c => c.value)).toEqual([1, 2, 3, 4]);
        expect(r.conditions[0].connector).toBeUndefined();
        expect(r.conditions.slice(1).every(c => c.connector === 'and')).toBe(true);
    });

    it('expands `in (a, b)` into an OR chain of ==', () => {
        const r = mapCondition('comfort in (1, 2)', ctx)!;
        expect(r.conditions.map(c => c.operator)).toEqual(['==', '==']);
        expect(r.conditions[1].connector).toBe('or');
    });

    it('compares two variables without inventing a value', () => {
        const r = mapCondition('a == b', ctx)!;
        expect(r.conditions[0].compareVariableId).toBe('v_b');
        expect(r.conditions[0].value).toBeUndefined();
    });

    it('chains a uniform and/or list', () => {
        const r = mapCondition('a == 1 and b == 2', ctx)!;
        expect(r.conditions).toHaveLength(2);
        expect(r.conditions[1].connector).toBe('and');
    });

    it('REFUSES a mixed and/or expression rather than mis-evaluating it', () => {
        // Flourish has no precedence, so `a or b and c` would silently become `((a or b) and c)`.
        expect(mapCondition('a == 1 or b == 2 and c == 3', ctx)).toBeNull();
    });

    it('reports an unknown variable instead of inventing an id', () => {
        const r = mapCondition('mystery == 1', strictCtx([]))!;
        expect(r.unknownVariables).toEqual(['mystery']);
        expect(r.conditions).toEqual([]);
    });

    it('refuses a shape it cannot express', () => {
        expect(mapCondition('len(items) > 0', ctx)).toBeNull();
        expect(mapCondition('a + 1 == 2', ctx)).toBeNull();
    });

    it('parses literals the way the engine stores them', () => {
        expect(parseLiteral('True')).toBe(true);
        expect(parseLiteral('False')).toBe(false);
        expect(parseLiteral('12')).toBe(12);
        expect(parseLiteral('-3.5')).toBe(-3.5);
        expect(parseLiteral('"hi"')).toBe('hi');
        expect(parseLiteral('some_name')).toBeNull();
    });
});

describe('text mapping', () => {
    it('swaps the delimiters', () => {
        expect(mapText('Hello [first_name].').text).toBe('Hello {first_name}.');
    });

    it('strips Ren\'Py conversion flags and format specs from a name', () => {
        expect(mapText('[lastname!t]').text).toBe('{lastname}');
        expect(mapText('[score:>4]').text).toBe('{score}');
    });

    it('honours Ren\'Py escapes instead of reading them as delimiters', () => {
        // `[[` is a literal bracket, NOT an interpolation of an empty name.
        expect(mapText('a [[b] c').text).toBe('a [b] c');
        // `{{`/`}}` are Ren'Py's brace escapes. The result is reported as a hazard because a
        // literal `{` opens an interpolation in Flourish.
        const braced = mapText('{{braced}}');
        expect(braced.text).toBe('{braced}');
        expect(braced.gaps.some(g => g.kind === 'brace-collision')).toBe(true);
        expect(mapText('[[first_name]').variables).toEqual([]);
    });

    it('records dropped emphasis rather than faking it', () => {
        const r = mapText('He was {i}very{/i} tired.');
        expect(r.text).toBe('He was very tired.');
        expect(r.gaps.filter(g => g.kind === 'markup-dropped')).toHaveLength(2);
    });

    it('flags a literal that would collide with a Flourish tag', () => {
        // `[[shake]` becomes the literal `[shake]`, which Flourish's tokenizer would eat.
        const r = mapText('a [[shake] b');
        expect(r.text).toBe('a [shake] b');
        expect(r.gaps.some(g => g.kind === 'tag-collision')).toBe(true);
    });

    it('leaves a non-tag literal alone', () => {
        const r = mapText('a [[note] b');
        expect(r.gaps.some(g => g.kind === 'tag-collision')).toBe(false);
        expect(FLOURISH_TAGS.has('note')).toBe(false);
    });

    it('applies the game\'s own typography normalisation', () => {
        expect(replaceText('it’s')).toBe("it's");
        expect(replaceText('a–b')).toBe('a-b');
        expect(replaceText('wait…')).toBe('wait...');
        expect(replaceText('fiancé')).toBe('fiance');
        expect(replaceText('café')).toBe('cafe');
    });

    it('reports an unknown variable but keeps the text visible', () => {
        const r = mapText('Hi [nope].', { variableName: () => null });
        expect(r.gaps.some(g => g.kind === 'unknown-variable')).toBe(true);
        expect(r.text).toContain('{nope}');
    });
});

const GAME_DIR = process.env.OURLIFE_GAME
    ?? path.resolve(__dirname, '..', '..', '..', 'OurLife', 'game');
const PROLOGUE = path.join(GAME_DIR, 'prologue.rpy');

if (fs.existsSync(PROLOGUE)) describe('prologue conditions and text', () => {
    const nodes = parseNodes(parseFile(fs.readFileSync(PROLOGUE, 'utf8')), 'prologue.rpy');

    const conditions: string[] = [];
    const texts: string[] = [];
    const collect = (ns: Node[]) => {
        for (const n of ns) {
            if (n.kind === 'label') collect(n.body);
            else if (n.kind === 'if') {
                for (const c of n.clauses) {
                    if (c.condition) conditions.push(c.condition);
                    collect(c.body);
                }
            } else if (n.kind === 'menu') {
                for (const o of n.options) {
                    if (o.condition) conditions.push(o.condition);
                    texts.push(o.text);
                    collect(o.body);
                }
            } else if (n.kind === 'say') texts.push(n.text);
        }
    };
    collect(nodes);

    it('GATE: translates every condition the prologue uses', () => {
        const known = new Set<string>();
        for (const c of conditions) {
            for (const m of c.matchAll(/[A-Za-z_][A-Za-z0-9_.]*/g)) {
                if (!['True', 'False', 'not', 'in', 'and', 'or'].includes(m[0])) known.add(m[0]);
            }
        }
        const anyVar = { variableId: (n: string) => `v_${n}` };
        const failed = conditions.filter(c => mapCondition(c, anyVar) === null);
        const persistent = [...known].filter(n => n.startsWith('persistent.'));
        console.log(`[step7] conditions=${conditions.length} distinct=${new Set(conditions).size} untranslatable=${failed.length} persistent-refs=${persistent.length}`);
        expect(failed, `untranslatable condition shapes: ${[...new Set(failed)].join(' | ')}`).toEqual([]);
    });

    it('uses only operators from the engine union', () => {
        const anyVar = { variableId: (n: string) => `v_${n}` };
        const used = new Set<string>();
        for (const c of conditions) {
            for (const cond of mapCondition(c, anyVar)?.conditions ?? []) used.add(cond.operator);
        }
        const valid = new Set(Object.values(OPERATORS as Record<string, string>));
        console.log(`[step7] operators used: ${[...used].sort().join(' ')}`);
        for (const op of used) expect(valid.has(op), `operator not in the engine union: ${op}`).toBe(true);
    });

    it('GATE: converts every string with no unsupported markup and no tag collision', () => {
        let dropped = 0, collisions = 0, unsupported = 0, interpolations = 0;
        for (const t of texts) {
            const r = mapText(t);
            interpolations += r.variables.length;
            for (const g of r.gaps) {
                if (g.kind === 'markup-dropped') dropped++;
                else if (g.kind === 'tag-collision') collisions++;
                else if (g.kind === 'markup-unsupported') unsupported++;
            }
        }
        console.log(`[step7] strings=${texts.length} interpolations=${interpolations} emphasis-dropped=${dropped} unsupported-markup=${unsupported} tag-collisions=${collisions}`);
        // A collision would silently eat text the player should see.
        expect(collisions).toBe(0);
        // Unsupported markup would mean a construct nobody has looked at.
        expect(unsupported).toBe(0);
    });

    it('interpolates only variables the game declares', () => {
        const declared = new Set<string>();
        for (const file of fs.readdirSync(GAME_DIR).filter(f => f.endsWith('.rpy'))) {
            const src = fs.readFileSync(path.join(GAME_DIR, file), 'utf8');
            for (const m of src.matchAll(/^\s*(?:default|define)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) {
                declared.add(m[1]);
            }
        }
        const used = new Set<string>();
        for (const t of texts) for (const v of mapText(t).variables) used.add(v);
        const missing = [...used].filter(v => !declared.has(v.split('.')[0]));
        console.log(`[step7] interpolated variables=${[...used].sort().join(',')} undeclared=${missing.join(',') || 'none'}`);
        expect(missing, `interpolated but never declared: ${missing.join(', ')}`).toEqual([]);
    });
});
