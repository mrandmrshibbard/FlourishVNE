/**
 * Build `project.variables` from what the source actually declares and uses.
 *
 * Three sources have to agree, or a command silently conditions on nothing:
 *   1. `default <name> = <literal>` declarations (the game's real defaults),
 *   2. every `$ <name> = ...` / `+=` assignment target,
 *   3. every name a condition reads.
 *
 * A name used but never declared is still created - with a default inferred from how it is used -
 * because Ren'Py would have raised at runtime and the game clearly does not, meaning the
 * declaration lives in a file outside the converted scope. It is reported either way.
 *
 * CONTENT RULE: variable NAMES are identifiers, not story text, but string DEFAULTS can be
 * player-visible (a character's name), so defaults are never logged.
 */
import type { VNVariable } from '../ir/engineContract';
import type { Node } from '../ir/nodes';
import { literalValue } from '../map/commands';

export interface VariableSource {
    name: string;
    /** Where it was first seen, for the report. */
    origin: 'default' | 'assignment' | 'condition';
    defaultValue: string | number | boolean;
    type: 'string' | 'number' | 'boolean';
}

const typeOf = (v: string | number | boolean): VariableSource['type'] =>
    typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string';

/** Collect declarations from any .rpy source, including files outside the converted scope. */
export function collectDeclarations(sources: string[]): Map<string, string | number | boolean> {
    const out = new Map<string, string | number | boolean>();
    for (const src of sources) {
        for (const m of src.matchAll(/^[ \t]*default[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.+)$/gm)) {
            // Strip a trailing comment before reading the literal.
            const raw = m[2].split('#')[0].trim();
            const value = literalValue(raw);
            if (value === null) continue;                  // an expression default, not a literal
            if (!out.has(m[1])) out.set(m[1], value);
        }
    }
    return out;
}

/** Walk the IR for every name that is assigned or tested. */
export function collectUsage(nodes: Node[]): { assigned: Map<string, string | number | boolean>; tested: Set<string> } {
    const assigned = new Map<string, string | number | boolean>();
    const tested = new Set<string>();

    const readCondition = (src: string) => {
        for (const m of src.matchAll(/[A-Za-z_][A-Za-z0-9_.]*/g)) {
            if (['True', 'False', 'not', 'in', 'and', 'or'].includes(m[0])) continue;
            tested.add(m[0]);
        }
    };

    const walk = (ns: Node[]): void => {
        for (const n of ns) {
            switch (n.kind) {
                case 'python': {
                    const m = /^([A-Za-z_][A-Za-z0-9_.]*)\s*(\+=|-=|=)\s*(.+)$/.exec(n.code);
                    if (!m) break;
                    const value = literalValue(m[3].trim());
                    if (value === null) break;
                    // A `+=` proves the variable is numeric even if the default says otherwise.
                    if (m[2] === '=' ) { if (!assigned.has(m[1])) assigned.set(m[1], value); }
                    else assigned.set(m[1], typeof value === 'number' ? 0 : value);
                    break;
                }
                case 'default': {
                    const value = literalValue(n.expr);
                    if (value !== null && !assigned.has(n.name)) assigned.set(n.name, value);
                    break;
                }
                case 'label': walk(n.body); break;
                case 'if':
                    for (const c of n.clauses) {
                        if (c.condition) readCondition(c.condition);
                        walk(c.body);
                    }
                    break;
                case 'menu':
                    for (const o of n.options) {
                        if (o.condition) readCondition(o.condition);
                        walk(o.body);
                    }
                    break;
                default: break;
            }
        }
    };
    walk(nodes);
    return { assigned, tested };
}

export interface BuiltVariables {
    variables: Record<string, VNVariable>;
    /** name -> id, for the emitter's `variableId` resolver. */
    idByName: Map<string, string>;
    /** Names used but declared nowhere - reported, still created. */
    undeclared: string[];
}

export function buildVariables(
    declarations: Map<string, string | number | boolean>,
    usage: { assigned: Map<string, string | number | boolean>; tested: Set<string> },
    interpolated: Iterable<string> = [],
): BuiltVariables {
    const wanted = new Map<string, VariableSource>();

    const consider = (name: string, origin: VariableSource['origin'], fallback: string | number | boolean) => {
        if (wanted.has(name)) return;
        const declared = declarations.get(name);
        const value = declared !== undefined ? declared : fallback;
        wanted.set(name, { name, origin, defaultValue: value, type: typeOf(value) });
    };

    for (const [name, value] of declarations) consider(name, 'default', value);
    for (const [name, value] of usage.assigned) consider(name, 'assignment', value);
    for (const name of usage.tested) {
        // `persistent.x` is a cross-save value with no Flourish equivalent; it still needs a
        // variable so the condition resolves, and it is reported as a gap by the caller.
        consider(name, 'condition', false);
    }
    for (const name of interpolated) consider(name, 'condition', '');

    const variables: Record<string, VNVariable> = {};
    const idByName = new Map<string, string>();
    let seq = 0;
    for (const [name, info] of [...wanted.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const id = `var_${++seq}`;
        idByName.set(name, id);
        variables[id] = {
            id, name, type: info.type, defaultValue: info.defaultValue,
        } as unknown as VNVariable;
    }

    const undeclared = [...wanted.keys()].filter(n => !declarations.has(n)).sort();
    return { variables, idByName, undeclared };
}
