/**
 * Variable Command Handler
 * Processes variable manipulation commands
 */

import { SetVariableCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { VNID } from '../../../types';

const normalizeSetVariableOperator = (
    variableType: string,
    variableName: string,
    operator: string
): 'set' | 'add' | 'subtract' | 'random' => {
    if ((operator === 'add' || operator === 'subtract') && variableType !== 'number') {
        console.warn(
            `[SetVariable:command] Operator "${operator}" is not valid for ${variableType} variable "${variableName}". Forcing operator to "set".`
        );
        return 'set';
    }

    if (operator === 'random' && variableType !== 'number') {
        console.warn(
            `[SetVariable:command] Operator "${operator}" is not valid for ${variableType} variable "${variableName}". Forcing operator to "set".`
        );
        return 'set';
    }

    return operator as 'set' | 'add' | 'subtract' | 'random';
};

const toNumeric = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Handle set variable command
 * Supports set, add, subtract, and random operations
 */
export const handleSetVariable = (
    command: SetVariableCommand,
    context: CommandContext
): CommandResult => {
    const { project, playerState } = context;
    
    console.log('[DEBUG SetVariable] Executing - Variable:', command.variableId, 'Operator:', command.operator, 'Value:', command.value);
    
    const variable = project.variables[command.variableId];
    if (!variable) {
        console.warn(`SetVariable command failed: Variable with ID ${command.variableId} not found.`);
        // Still advance even if variable not found
        return {
            advance: true,
            updates: {}
        };
    }
    
    const currentVal = playerState.variables[command.variableId];
    const changeValStr = String(command.value);
    const originalOperator = command.operator;
    const effectiveOperator = normalizeSetVariableOperator(variable.type, variable.name, originalOperator);
    const wasCoercedOperator = originalOperator !== effectiveOperator;
    let newVal: string | number | boolean = command.value;

    // Calculate new value based on operator
    if (effectiveOperator === 'add') {
        newVal = toNumeric(currentVal) + toNumeric(changeValStr);
    } else if (effectiveOperator === 'subtract') {
        newVal = toNumeric(currentVal) - toNumeric(changeValStr);
    } else if (effectiveOperator === 'random') {
        const min = command.randomMin ?? 0;
        const max = command.randomMax ?? 100;
        newVal = Math.floor(Math.random() * (max - min + 1)) + min;
    } else { // 'set' operator
        switch (variable.type) {
            case 'number':
                newVal = toNumeric(changeValStr);
                break;
            case 'boolean':
                if (wasCoercedOperator) {
                    if (originalOperator === 'add') {
                        newVal = true;
                        console.log('[DEBUG SetVariable] Normalized add -> set TRUE for', variable.name);
                        break;
                    }
                    if (originalOperator === 'subtract') {
                        newVal = false;
                        console.log('[DEBUG SetVariable] Normalized subtract -> set FALSE for', variable.name);
                        break;
                    }
                    if (originalOperator === 'random') {
                        newVal = Math.random() >= 0.5;
                        console.log('[DEBUG SetVariable] Normalized random -> set', newVal, 'for', variable.name);
                        break;
                    }
                }

                // Handle various boolean representations - be VERY forgiving
                if (typeof command.value === 'boolean') {
                    newVal = command.value;
                } else {
                    // Convert string/number to boolean
                    const normalized = changeValStr.trim().toLowerCase();
                    if (normalized === 'true' || normalized === '1') {
                        newVal = true;
                    } else if (normalized === 'false' || normalized === '0' || normalized === '') {
                        newVal = false;
                    } else {
                        // Any other truthy value
                        newVal = !!command.value;
                    }
                }
                break;
            case 'string':
            default:
                newVal = changeValStr;
                break;
        }
    }
    
    console.log('[DEBUG SetVariable] New value:', newVal, '| operator:', `${command.operator} => ${effectiveOperator}`);
    
    return {
        advance: true, // Auto-advance for variable commands
        updates: {
            variables: {
                ...playerState.variables,
                [command.variableId]: newVal
            }
        }
    };
};
