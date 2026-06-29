import { ChoiceCommand } from '../../../features/scene/types';
import { evaluateConditions } from '../systems/conditionEvaluator';
import { CommandContext, CommandResult } from './types';

/**
 * Handles choice display commands
 * Filters available choices based on conditions and displays them to the player
 */
export function handleChoice(command: ChoiceCommand, context: CommandContext): CommandResult {
  const { playerState } = context;

  // Filter choices based on conditions
  const availableChoices = command.options.filter(opt => 
    evaluateConditions(opt.conditions, playerState.variables)
  );

  const timeLimit = command.timeLimit && command.timeLimit > 0 ? command.timeLimit : undefined;

  return {
    advance: false, // Wait for player to select a choice
    updates: {
      uiState: {
        ...playerState.uiState,
        choices: availableChoices,
        choiceLayout: command.layout,
        // Time-limited choice config (undefined when no limit → classic behavior unchanged).
        choiceTimeLimit: timeLimit,
        choiceShowTimer: timeLimit ? (command.showTimer !== false) : undefined,
        choiceTimeoutBehavior: timeLimit ? (command.timeoutBehavior || 'option') : undefined,
        choiceTimeoutOptionId: timeLimit ? command.timeoutOptionId : undefined,
        choiceTimeoutActions: timeLimit ? command.timeoutActions : undefined,
      }
    }
  };
}
