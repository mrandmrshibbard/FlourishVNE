import { VNCondition, VNConditionOperator } from '../types/shared';

const OP_TEXT: Record<VNConditionOperator, string> = {
    '==': 'is',
    '!=': 'is not',
    '>': '>',
    '<': '<',
    '>=': '≥',
    '<=': '≤',
    'is true': 'is on',
    'is false': 'is off',
    'contains': 'contains',
    'startsWith': 'starts with',
};

/**
 * Render a condition list as a short, plain-language phrase for non-coders, e.g.
 * "Affection ≥ 50" or "HasKey is on and Gold > 0". Empty/undefined → '' (always true).
 * Pass `project.variables` (or any id→{name} map) so variable ids become readable names.
 */
export function describeConditions(
    conditions: VNCondition[] | undefined,
    variables: Record<string, { name?: string } | undefined>
): string {
    if (!conditions || conditions.length === 0) return '';
    return conditions.map((c, i) => {
        const name = variables[c.variableId]?.name || 'a variable';
        const body = (c.operator === 'is true' || c.operator === 'is false')
            ? `${name} ${OP_TEXT[c.operator]}`
            : `${name} ${OP_TEXT[c.operator]} ${c.value ?? ''}`.trim();
        return i === 0 ? body : `${c.connector ?? 'and'} ${body}`;
    }).join(' ');
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
