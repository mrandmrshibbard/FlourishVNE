/**
 * Variable Utilities
 * Centralized functions for variable type coercion and operator normalization
 * Used by both editor runtime and standalone game builds
 */

import { VNSetVariableOperator } from '../features/variables/types';
import type { VNCalcOperand, VNValueCalc } from '../types/shared';

/**
 * Normalizes a set variable operator based on the variable type.
 * If an operator is invalid for the variable type, it's coerced to 'set'.
 * 
 * @param variableType The type of the variable ('string', 'number', 'boolean')
 * @param variableName The name of the variable (for logging)
 * @param operator The requested operator
 * @returns The effective operator to use
 */
export const normalizeSetVariableOperator = (
    variableType: string,
    variableName: string,
    operator: string
): VNSetVariableOperator => {
    if ((operator === 'add' || operator === 'subtract') && variableType !== 'number') {
        console.warn(
            `[SetVariable] Operator "${operator}" is not valid for ${variableType} variable "${variableName}". Forcing operator to "set".`
        );
        return 'set';
    }

    if ((operator === 'random' || operator === 'addRandom' || operator === 'subtractRandom') && variableType !== 'number') {
        console.warn(
            `[SetVariable] Operator "${operator}" is not valid for ${variableType} variable "${variableName}". Forcing operator to "set".`
        );
        return 'set';
    }

    return operator as VNSetVariableOperator;
};

/**
 * Normalizes a set variable operator and returns both the effective operator
 * and whether coercion occurred.
 * 
 * @param variableType The type of the variable ('string', 'number', 'boolean')
 * @param variableName The name of the variable (for logging)
 * @param operator The requested operator
 * @returns Object with effectiveOperator and wasCoerced flag
 */
export const normalizeSetVariableOperatorByType = (
    variableType: string,
    variableName: string,
    operator: string
): { effectiveOperator: VNSetVariableOperator; wasCoerced: boolean } => {
    const effectiveOperator = normalizeSetVariableOperator(variableType, variableName, operator);
    return {
        effectiveOperator,
        wasCoerced: effectiveOperator !== operator
    };
};

/**
 * Safely converts a value to a number.
 * Returns 0 for non-numeric or infinite values.
 * 
 * @param value The value to convert
 * @returns A finite number, or 0 if conversion fails
 */
export const toNumeric = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Coerces a value to match a variable's expected type.
 * 
 * @param value The value to coerce
 * @param variableType The target type ('string', 'number', 'boolean')
 * @param currentValue The current value (used for boolean toggle)
 * @returns The coerced value
 */
export const coerceValueToType = (
    value: string | number | boolean,
    variableType: string,
    currentValue: string | number | boolean | undefined
): string | number | boolean => {
    const changeValStr = String(value);
    
    switch (variableType) {
        case 'number':
            return toNumeric(changeValStr);
            
        case 'boolean':
            if (typeof value === 'boolean') {
                return value;
            }
            
            const normalized = changeValStr.trim().toLowerCase();

            // An un-touched boolean "Set to" leaves the value empty/undefined while every editor SHOWS
            // "Yes" (the first option) as the default — so an empty value is the uninitialised default
            // (→ true), NOT a toggle. This previously toggled, which made repeatedly setting the SAME
            // value (e.g. a slot-button action "set good_snacks = Yes" on several items) flip the variable
            // Yes/No/Yes on each click. No editor exposes an explicit empty-as-toggle control.
            if (normalized === '' || normalized === 'undefined' || normalized === 'null') {
                return true;
            }

            if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
                return true;
            }
            if (normalized === 'false' || normalized === '0' || normalized === 'no') {
                return false;
            }

            return !!value;
            
        case 'string':
        default:
            return changeValStr;
    }
};

/**
 * Clamps a number to an optional inclusive [min, max] range. Either bound may be undefined
 * (unbounded on that side). Non-finite input falls through unchanged.
 */
export const clampNumberToBounds = (value: number, min?: number, max?: number): number => {
    let v = value;
    if (typeof min === 'number' && Number.isFinite(min) && v < min) v = min;
    if (typeof max === 'number' && Number.isFinite(max) && v > max) v = max;
    return v;
};

/**
 * Calculates a new variable value based on operator and current value.
 * Handles operator coercion semantics (e.g., 'add' on boolean = true).
 *
 * @param operator The effective operator to use
 * @param variableType The type of the variable
 * @param currentValue The current variable value
 * @param changeValue The value to apply
 * @param randomMin Minimum value for random operator (optional)
 * @param randomMax Maximum value for random operator (optional)
 * @param originalOperator The original operator if it was coerced (optional)
 * @param boundMin Per-variable clamp lower bound for NUMBER variables (optional)
 * @param boundMax Per-variable clamp upper bound for NUMBER variables (optional)
 * @returns The new value (number results clamped to [boundMin, boundMax] when set)
 */
export const calculateVariableValue = (
    operator: VNSetVariableOperator,
    variableType: string,
    currentValue: string | number | boolean | undefined,
    changeValue: string | number | boolean,
    randomMin?: number,
    randomMax?: number,
    originalOperator?: string,
    boundMin?: number,
    boundMax?: number
): string | number | boolean => {
    const changeValStr = String(changeValue);

    // Compute the raw result, then clamp any NUMBER result to the variable's optional bounds.
    const finish = (result: string | number | boolean): string | number | boolean =>
        typeof result === 'number' ? clampNumberToBounds(result, boundMin, boundMax) : result;

    switch (operator) {
        case 'add':
            return finish(toNumeric(currentValue) + toNumeric(changeValStr));

        case 'subtract':
            return finish(toNumeric(currentValue) - toNumeric(changeValStr));

        case 'random': {
            // No authored range → roll within the VARIABLE's own min/max bounds (when set).
            // The old 0..100 default then got CLAMPED into the bounds by finish(), which piled
            // ~95% of rolls onto the max (user report: "almost always picks the max number").
            const min = randomMin ?? boundMin ?? 0;
            const max = randomMax ?? boundMax ?? 100;
            return finish(Math.floor(Math.random() * (max - min + 1)) + min);
        }

        // Adjust the CURRENT value by a random amount in [randomMin, randomMax] — unlike
        // 'random', which replaces the value outright (a user asked for random gains/losses).
        case 'addRandom': {
            const min = randomMin ?? 0;
            const max = randomMax ?? 100;
            const amount = Math.floor(Math.random() * (max - min + 1)) + min;
            return finish(toNumeric(currentValue) + amount);
        }

        case 'subtractRandom': {
            const min = randomMin ?? 0;
            const max = randomMax ?? 100;
            const amount = Math.floor(Math.random() * (max - min + 1)) + min;
            return finish(toNumeric(currentValue) - amount);
        }

        case 'set':
        default:
            // Handle coerced operators with semantic meaning for booleans
            if (variableType === 'boolean' && originalOperator) {
                if (originalOperator === 'add') {
                    console.log('[Boolean Promotion] Normalized add -> set TRUE');
                    return true;
                }
                if (originalOperator === 'subtract') {
                    console.log('[Boolean Promotion] Normalized subtract -> set FALSE');
                    return false;
                }
                if (originalOperator === 'random') {
                    const randomVal = Math.random() >= 0.5;
                    console.log('[Boolean Promotion] Normalized random -> set', randomVal);
                    return randomVal;
                }
            }
            return finish(coerceValueToType(changeValue, variableType, currentValue));
    }
};

/** Structural subset of both SetVariableCommand and SetVariableAction — the value fields. */
export interface SetVariableValueSource {
    value?: string | number | boolean;
    valueSource?: 'variable' | 'calc';
    valueVariableId?: string;
    calc?: VNValueCalc;
}

type VariableValues = Record<string, string | number | boolean | undefined>;

const resolveOperand = (operand: VNCalcOperand | undefined, variables: VariableValues): number => {
    if (!operand) return NaN;
    if (operand.source === 'variable') {
        return operand.variableId !== undefined ? Number(variables[operand.variableId]) : NaN;
    }
    return typeof operand.value === 'number' ? operand.value : NaN;
};

/**
 * Resolves a Set Variable's change value BEFORE calculateVariableValue is called, so the
 * calculation semantics live in exactly one place while every execution site keeps its own
 * (correct) source of current variable values.
 *
 * - Absent `valueSource` → returns `spec.value` unchanged: old projects never enter new code.
 * - 'variable' → the referenced variable's current value; dangling id → falls back to `spec.value`.
 * - 'calc' → folds the steps strictly LEFT TO RIGHT (no operator precedence — same rule the
 *   condition list uses). Divide-by-zero and non-finite operands SKIP the step (keep the running
 *   result) rather than poisoning it. Rounding applies once at the end (absent = nearest).
 *
 * The result is guaranteed finite — never NaN/±Infinity into game state.
 */
export const resolveSetVariableValue = (
    spec: SetVariableValueSource,
    variables: VariableValues
): string | number | boolean => {
    if (spec.valueSource === 'variable') {
        if (spec.valueVariableId !== undefined) {
            const v = variables[spec.valueVariableId];
            if (v !== undefined) return v;
        }
        return spec.value ?? '';
    }

    if (spec.valueSource === 'calc' && spec.calc) {
        const calc = spec.calc;
        let acc = resolveOperand(calc.first, variables);
        if (!Number.isFinite(acc)) {
            // Broken first operand: start from the typed value when it's a usable number, else 0.
            const typed = Number(spec.value);
            acc = Number.isFinite(typed) && String(spec.value).trim() !== '' ? typed : 0;
        }
        for (const step of calc.steps ?? []) {
            const operand = resolveOperand(step, variables);
            if (!Number.isFinite(operand)) continue; // dangling/non-numeric operand: skip the step
            switch (step.op) {
                case 'add': acc += operand; break;
                case 'subtract': acc -= operand; break;
                case 'multiply': acc *= operand; break;
                case 'divide':
                    if (operand === 0) continue; // dividing by zero isn't possible — skip the step
                    acc /= operand;
                    break;
                case 'percentOf': acc *= operand / 100; break;
            }
            if (!Number.isFinite(acc)) { acc = 0; break; } // overflow guard — never poison state
        }
        switch (calc.round ?? 'nearest') {
            case 'nearest': acc = Math.round(acc); break;
            case 'down': acc = Math.floor(acc); break;
            case 'up': acc = Math.ceil(acc); break;
            case 'none': break;
        }
        return Number.isFinite(acc) ? acc : 0;
    }

    // Absent/unknown valueSource: today's behavior, bit for bit.
    return spec.value as string | number | boolean;
};
