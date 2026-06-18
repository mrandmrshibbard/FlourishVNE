/**
 * Variable Command Handler
 * Processes variable manipulation commands
 */

import { SetVariableCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { VNID } from '../../../types';
import { 
    normalizeSetVariableOperatorByType, 
    calculateVariableValue 
} from '../../../utils/variableUtils';

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
    const originalOperator = command.operator;
    const { effectiveOperator, wasCoerced } = normalizeSetVariableOperatorByType(
        variable.type, 
        variable.name, 
        originalOperator
    );
    
    // Use consolidated calculateVariableValue for all value computations
    const newVal = calculateVariableValue(
        effectiveOperator,
        variable.type,
        currentVal,
        command.value,
        command.randomMin,
        command.randomMax,
        wasCoerced ? originalOperator : undefined,
        variable.min,
        variable.max
    );
    
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
