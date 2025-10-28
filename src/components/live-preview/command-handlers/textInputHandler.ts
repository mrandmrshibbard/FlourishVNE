import { TextInputCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles text input prompts
 * Pauses execution until user provides input
 */
export function handleTextInput(
  command: TextInputCommand,
  context: CommandContext
): CommandResult {
  const { playerState } = context;
  
  return {
    advance: false, // Wait for user input
    updates: {
      uiState: {
        ...playerState.uiState,
        isWaitingForInput: true,
        textInput: {
          variableId: command.variableId,
          prompt: command.prompt,
          placeholder: command.placeholder || '',
          maxLength: command.maxLength || 50,
        },
      },
    },
  };
}
