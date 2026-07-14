/**
 * Condition Evaluator
 * Evaluates conditions for commands and choices
 */

import { VNCondition } from '../../../types/shared';
import { VNID } from '../../../types';
import { combineConditions } from '../../../utils/conditionLogic';
import { VNVariable } from '../../../features/variables/types';
import { compareBand, isBandOperator } from '../../../features/variables/bands';

/**
 * ── The variable-definition registry ──────────────────────────────────────────────────────────────
 * Band conditions ("Yuki is a Friend") are answered against the variable's DEFINITION — the named
 * ranges — not just its current value. But `evaluateConditions` is called from ~15 places (choice
 * options, phone replies, hot spots, overlays, map locations…) that legitimately only hold VALUES;
 * threading the project through every one of them would be a large, invasive change to code that has
 * no other reason to know about the project.
 *
 * So the owner of the project publishes the definitions ONCE, and everything downstream can answer a
 * band condition. This is a read-only lookup table derived from the project — not mutable game state
 * — and there is only ever one project open at a time.
 *
 * SET IT wherever a project starts driving conditions (LivePreview and StagingArea both do, on
 * mount/when project.variables changes). Forget to, and band conditions quietly read false.
 */
let variableDefinitions: Record<VNID, VNVariable> = {};

export const setVariableDefinitions = (defs: Record<VNID, VNVariable> | undefined): void => {
    variableDefinitions = defs ?? {};
};

/**
 * Evaluate an array of conditions against current variable values.
 * Conditions combine via their per-row `connector` (AND/OR), evaluated
 * left-to-right; a missing connector defaults to AND (legacy behaviour).
 *
 * `definitions` overrides the registry above — pass it when you have the project to hand.
 */
export const evaluateConditions = (
    conditions: VNCondition[] | undefined,
    variables: Record<VNID, string | number | boolean>,
    definitions?: Record<VNID, VNVariable>
): boolean => {
    if (!conditions || conditions.length === 0) return true;
    const defs = definitions ?? variableDefinitions;

    return combineConditions(conditions, condition => {
        const varValue = variables[condition.variableId];
        if (varValue === undefined) return false;

        if (isBandOperator(condition.operator)) {
            return compareBand(defs[condition.variableId], varValue, String(condition.value), condition.operator);
        }

        switch (condition.operator) {
            case 'is true':
                return !!varValue;
            case 'is false':
                return !varValue;
            case '==':
                return String(varValue).toLowerCase() === String(condition.value).toLowerCase();
            case '!=':
                return String(varValue).toLowerCase() !== String(condition.value).toLowerCase();
            case '>':
                return Number(varValue) > Number(condition.value);
            case '<':
                return Number(varValue) < Number(condition.value);
            case '>=':
                return Number(varValue) >= Number(condition.value);
            case '<=':
                return Number(varValue) <= Number(condition.value);
            case 'contains':
                return String(varValue).toLowerCase().includes(String(condition.value).toLowerCase());
            case 'startsWith':
                return String(varValue).toLowerCase().startsWith(String(condition.value).toLowerCase());
            default:
                return false;
        }
    });
};
