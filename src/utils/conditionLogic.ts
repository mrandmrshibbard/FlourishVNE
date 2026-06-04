import { VNCondition } from '../types/shared';

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
