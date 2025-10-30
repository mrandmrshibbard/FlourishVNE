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

  return {
    advance: false, // Wait for player to select a choice
    updates: {
      uiState: {
        ...playerState.uiState,
        choices: availableChoices
      }
    }
  };
}
