/**
 * Ren'Py condition source -> `VNCondition[]`.
 *
 * 🔴 THIS IS THE ONLY FILE IN THE CONVERTER WHERE AN OPERATOR STRING APPEARS, and every one of
 * them comes from `OPERATORS` in the engine contract, which is `satisfies Record<string,
 * VNConditionOperator>`. That is the structural fix for defect 2: the old converter invented
 * `equals` / `greater_than` / `less_than`, the engine's evaluator has no case for them and its
 * `default:` returns false, so **653 of 653 branch conditions were permanently false and roughly
 * 632 of 640 story branches never executed**. It compiled and ran; it just silently skipped most
 * of the game. A wrong operator now fails `tsc`.
 *
 * Anything this cannot translate returns null, and the caller must emit a marker and SKIP the
 * whole `if` body rather than run it unguarded - an unguarded body is worse than a missing one,
 * because it plays content the player should never see.
 *
 * The prologue needs less than the full table: 111 conditions, 26 distinct shapes, `==` x106,
 * `>` x4, one `not in (1,2,3,4)`, one `persistent.` reference, and no `and`/`or` compounds.
 */
import type { VNCondition } from '../ir/engineContract';
import { OPERATORS } from '../ir/engineContract';

export interface ConditionContext {
    /** Ren'Py variable name -> Flourish variable id. */
    variableId: (name: string) => string | null;
}

export interface ConditionResult {
    conditions: VNCondition[];
    /** Names referenced that had no Flourish variable - the caller reports these. */
    unknownVariables: string[];
}

/** Ren'Py literal -> the value Flourish stores. */
export function parseLiteral(src: string): string | number | boolean | null {
    const t = src.trim();
    if (t === 'True') return true;
    if (t === 'False') return false;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t);
    const q = /^"([^"]*)"$|^'([^']*)'$/.exec(t);
    if (q) return q[1] ?? q[2] ?? '';
    return null;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/** Split on a top-level operator, ignoring anything inside brackets or strings. */
function splitTop(src: string, ops: string[]): { left: string; op: string; right: string } | null {
    let depth = 0;
    let inStr: string | null = null;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inStr) { if (ch === inStr) inStr = null; continue; }
        if (ch === '"' || ch === "'") { inStr = ch; continue; }
        if (ch === '(' || ch === '[') { depth++; continue; }
        if (ch === ')' || ch === ']') { depth--; continue; }
        if (depth !== 0) continue;
        for (const op of ops) {
            if (src.startsWith(op, i)) {
                return { left: src.slice(0, i).trim(), op, right: src.slice(i + op.length).trim() };
            }
        }
    }
    return null;
}

/** Members of a tuple/list literal: `(1, 2, 3)` -> ['1','2','3']. */
function tupleMembers(src: string): string[] | null {
    const t = src.trim();
    if (!/^[([].*[)\]]$/.test(t)) return null;
    return t.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Translate one Ren'Py condition.
 * Returns null when the shape is not translatable - never a guess.
 */
export function mapCondition(src: string, ctx: ConditionContext): ConditionResult | null {
    const unknown: string[] = [];
    const idOf = (name: string): string | null => {
        const id = ctx.variableId(name);
        if (!id) unknown.push(name);
        return id;
    };
    const done = (conditions: VNCondition[]): ConditionResult | null =>
        unknown.length ? { conditions: [], unknownVariables: unknown } : { conditions, unknownVariables: [] };

    const text = src.trim();

    // `a and b` / `a or b`. Flourish evaluates a condition list strictly left to right with no
    // precedence, so a MIXED expression cannot be expressed as a flat list and must be refused.
    const bool = splitTop(text, [' and ', ' or ']);
    if (bool) {
        const connector = bool.op.trim() as 'and' | 'or';
        const rest = splitTop(bool.right, [' and ', ' or ']);
        if (rest && rest.op.trim() !== connector) return null;     // mixed and/or - caller marks it
        const left = mapCondition(bool.left, ctx);
        const right = mapCondition(bool.right, ctx);
        if (!left || !right) return null;
        const joined = right.conditions.map((c, i) => (i === 0 ? { ...c, connector } : c));
        return done([...left.conditions, ...joined]);
    }

    // `not x in (...)` / `x not in (...)` -> an all-AND chain of `!=`, which works natively.
    const notIn = /^(?:not\s+)?(.+?)\s+not\s+in\s+(.+)$/.exec(text) ?? null;
    if (notIn) {
        const members = tupleMembers(notIn[2]);
        if (!members) return null;
        const id = idOf(notIn[1].trim());
        if (!id) return done([]);
        const conditions = members.map((m, i) => {
            const value = parseLiteral(m);
            return value === null ? null : {
                variableId: id, operator: OPERATORS.ne, value,
                ...(i === 0 ? {} : { connector: 'and' as const }),
            };
        });
        if (conditions.some(c => c === null)) return null;
        return done(conditions as VNCondition[]);
    }

    const isIn = splitTop(text, [' in ']);
    if (isIn) {
        if (!IDENT.test(isIn.left)) return null;
        const id = idOf(isIn.left);
        if (!id) return done([]);
        const members = tupleMembers(isIn.right);
        if (members) {
            // `x in (a, b)` is an OR chain of equality.
            const conditions = members.map((m, i) => {
                const value = parseLiteral(m);
                return value === null ? null : {
                    variableId: id, operator: OPERATORS.eq, value,
                    ...(i === 0 ? {} : { connector: 'or' as const }),
                };
            });
            if (conditions.some(c => c === null)) return null;
            return done(conditions as VNCondition[]);
        }
        const value = parseLiteral(isIn.right);
        if (value === null) return null;
        return done([{ variableId: id, operator: OPERATORS.contains, value }]);
    }

    // Comparisons. Longest operators first so `>=` is not read as `>`.
    const cmp = splitTop(text, ['==', '!=', '>=', '<=', '>', '<']);
    if (cmp) {
        // The left side must be a plain variable. `len(items) > 0` and `a + 1 == 2` split cleanly
        // but are expressions, and inventing a variable for them would silently compare nothing.
        if (!IDENT.test(cmp.left)) return null;
        const id = idOf(cmp.left);
        if (!id) return done([]);
        const rightId = IDENT.test(cmp.right) && parseLiteral(cmp.right) === null
            ? ctx.variableId(cmp.right)
            : null;
        // `a == True` / `a == False` read better as the dedicated operators, and they also match
        // what the editor shows an author for a yes/no variable.
        if (cmp.op === '==' || cmp.op === '!=') {
            const value = parseLiteral(cmp.right);
            if (value === true) return done([{ variableId: id, operator: cmp.op === '==' ? OPERATORS.isTrue : OPERATORS.isFalse }]);
            if (value === false) return done([{ variableId: id, operator: cmp.op === '==' ? OPERATORS.isFalse : OPERATORS.isTrue }]);
        }
        const operator = ({
            '==': OPERATORS.eq, '!=': OPERATORS.ne,
            '>=': OPERATORS.gte, '<=': OPERATORS.lte,
            '>': OPERATORS.gt, '<': OPERATORS.lt,
        } as const)[cmp.op as '==' | '!=' | '>=' | '<=' | '>' | '<'];
        if (rightId) return done([{ variableId: id, operator, compareVariableId: rightId }]);
        const value = parseLiteral(cmp.right);
        if (value === null) return null;
        return done([{ variableId: id, operator, value }]);
    }

    // `not x` -> is false; a bare name -> is true.
    const not = /^not\s+(.+)$/.exec(text);
    if (not) {
        if (!IDENT.test(not[1].trim())) return null;
        const id = idOf(not[1].trim());
        return id ? done([{ variableId: id, operator: OPERATORS.isFalse }]) : done([]);
    }
    if (IDENT.test(text)) {
        const id = idOf(text);
        return id ? done([{ variableId: id, operator: OPERATORS.isTrue }]) : done([]);
    }

    return null;
}
