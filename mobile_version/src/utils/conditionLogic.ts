import { VNCondition, VNConditionOperator } from '../types/shared';
import { VNVariable } from '../features/variables/types';
import { bandById } from '../features/variables/bands';
import { resolveBoolLabels } from '../features/variables/booleanLabels';

// Plain English, matching the ConditionsEditor's own labels word for word. These two used to
// disagree — the same condition read "Affection is at least 50" in the editor and "Affection ≥ 50"
// in the branch strip — which taught authors that the friendly wording was decorative.
const OP_TEXT: Record<VNConditionOperator, string> = {
    '==': 'is',
    '!=': 'is not',
    '>': 'is more than',
    '<': 'is less than',
    '>=': 'is at least',
    '<=': 'is at most',
    'is true': 'is on',
    'is false': 'is off',
    'contains': 'contains',
    'startsWith': 'starts with',
    'inBand': 'is',
    'atLeastBand': 'is at least',
    'belowBand': 'is below',
};

/**
 * Render a condition list as a short, plain-language phrase for non-coders, e.g.
 * "Affection is at least 50" or "Front Door is Locked and Gold is more than 0".
 * Empty/undefined → '' (always true).
 *
 * Band-aware: a `>= 21` on a variable whose "Friend" band starts at 21 reads
 * "Affection is Friend or better" — the author sees the words they named, not the number they
 * happen to compile to.
 */
export function describeConditions(
    conditions: VNCondition[] | undefined,
    variables: Record<string, VNVariable | undefined>
): string {
    if (!conditions || conditions.length === 0) return '';
    return conditions.map((c, i) => {
        const v = variables[c.variableId];
        const name = v?.name || 'a variable';
        const body = describeOne(v, c, name, variables);
        return i === 0 ? body : `${c.connector ?? 'and'} ${body}`;
    }).join(' ');
}

function describeOne(
    v: VNVariable | undefined,
    c: VNCondition,
    name: string,
    variables: Record<string, VNVariable | undefined>
): string {
    if (c.operator === 'is true' || c.operator === 'is false') {
        const { yes, no } = resolveBoolLabels(v, 'on', 'off');
        return `${name} is ${c.operator === 'is true' ? yes : no}`;
    }
    if (c.operator === 'inBand' || c.operator === 'atLeastBand' || c.operator === 'belowBand') {
        const band = bandById(v, c.value);
        // A deleted band leaves the condition pointing at nothing — say so plainly rather than
        // printing a raw id at the author.
        if (!band) return `${name} — a range that no longer exists`;
        if (c.operator === 'inBand') return `${name} is ${band.name}`;
        if (c.operator === 'atLeastBand') return `${name} is ${band.name} or better`;
        return `${name} is below ${band.name}`;
    }
    if (c.compareVariableId !== undefined) {
        const otherName = variables[c.compareVariableId]?.name;
        return `${name} ${OP_TEXT[c.operator]} ${otherName || 'a variable that no longer exists'}`;
    }
    return `${name} ${OP_TEXT[c.operator]} ${c.value ?? ''}`.trim();
}

/**
 * The single place a condition's comparison value is resolved. `compareVariableId` set →
 * that variable's CURRENT value; dangling id → fall back to the literal `value` (today's
 * behavior — a broken reference never changes what an old project did). Band operators
 * never consult this (their `value` is a band id and the editor never sets both).
 */
export function resolveConditionValue(
    c: VNCondition,
    variables: Record<string, string | number | boolean | undefined>
): string | number | boolean | undefined {
    if (c.compareVariableId !== undefined) {
        const v = variables[c.compareVariableId];
        if (v !== undefined) return v;
    }
    return c.value;
}

/**
 * Combine a list of conditions using their per-row `connector` (AND/OR),
 * evaluated strictly left-to-right with no operator precedence:
 *   `A or B and C`  ===  `((A or B) and C)`
 *
 * The first condition's connector is ignored. A missing connector defaults to
 * 'and', so legacy condition lists (which were implicit-AND) behave identically.
 *
 * `evalOne` is the caller's per-condition predicate — each call site keeps its
 * own single-condition comparison logic and just delegates the boolean folding
 * to this shared helper, guaranteeing consistent AND/OR semantics everywhere.
 *
 * Empty/undefined lists evaluate to `true` (no constraint), matching the prior
 * `[].every(...)` behaviour.
 */
export function combineConditions(
    conditions: VNCondition[] | undefined,
    evalOne: (condition: VNCondition) => boolean
): boolean {
    if (!conditions || conditions.length === 0) return true;
    let result = evalOne(conditions[0]);
    for (let i = 1; i < conditions.length; i++) {
        const condition = conditions[i];
        const met = evalOne(condition);
        if ((condition.connector ?? 'and') === 'or') {
            result = result || met;
        } else {
            result = result && met;
        }
    }
    return result;
}
