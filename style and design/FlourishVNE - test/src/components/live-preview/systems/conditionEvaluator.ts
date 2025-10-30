/**
 * Condition Evaluator
 * Evaluates conditions for commands and choices
 */

import { VNCondition } from '../../../types/shared';
import { VNID } from '../../../types';

/**
 * Evaluate an array of conditions against current variable values
 * All conditions must be met (AND logic)
 */
export const evaluateConditions = (
    conditions: VNCondition[] | undefined,
    variables: Record<VNID, string | number | boolean>
): boolean => {
    if (!conditions || conditions.length === 0) return true;

    return conditions.every(condition => {
        const varValue = variables[condition.variableId];
        if (varValue === undefined) return false;

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
