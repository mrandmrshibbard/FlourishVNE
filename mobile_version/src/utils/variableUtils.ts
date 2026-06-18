/**
 * Variable Utilities
 * Centralized functions for variable type coercion and operator normalization
 * Used by both editor runtime and standalone game builds
 */

import { VNSetVariableOperator } from '../features/variables/types';

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

    if (operator === 'random' && variableType !== 'number') {
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
            
            // Empty string means toggle
            if (normalized === '') {
                return !currentValue;
            }
            
            if (normalized === 'true' || normalized === '1') {
                return true;
            }
            if (normalized === 'false' || normalized === '0') {
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
            const min = randomMin ?? 0;
            const max = randomMax ?? 100;
            return finish(Math.floor(Math.random() * (max - min + 1)) + min);
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
