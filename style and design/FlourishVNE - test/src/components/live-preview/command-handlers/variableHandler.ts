/**
 * Variable Command Handler
 * Processes variable manipulation commands
 */

import { SetVariableCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { VNID } from '../../../types';

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
    let newVal: string | number | boolean = command.value;
    
    // Calculate new value based on operator
    if (command.operator === 'add') {
        newVal = (Number(currentVal) || 0) + (Number(changeValStr) || 0);
    } else if (command.operator === 'subtract') {
        newVal = (Number(currentVal) || 0) - (Number(changeValStr) || 0);
    } else if (command.operator === 'random') {
        const min = command.randomMin ?? 0;
        const max = command.randomMax ?? 100;
        newVal = Math.floor(Math.random() * (max - min + 1)) + min;
    } else { // 'set' operator
        switch (variable.type) {
            case 'number':
                newVal = Number(changeValStr) || 0;
                break;
            case 'boolean':
                // Handle various boolean representations - be VERY forgiving
                if (typeof command.value === 'boolean') {
                    newVal = command.value;
                } else {
                    // Convert string/number to boolean
                    const normalized = String(command.value).trim().toLowerCase();
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
    
    console.log('[DEBUG SetVariable] New value:', newVal);
    
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
