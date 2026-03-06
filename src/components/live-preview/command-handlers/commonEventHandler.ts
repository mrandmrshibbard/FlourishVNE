/**
 * Common Event Command Handler
 * Handles executing reusable common event command blocks
 */

import { CallCommonEventCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles calling a common event by pushing the current position onto the
 * command stack and switching execution to the common event's commands.
 * When the common event commands complete, the stack-pop mechanism in
 * LivePreview will automatically return to the caller's next command.
 *
 * For parameterized events, arguments are injected as runtime variable overrides.
 */
export function handleCallCommonEvent(
  command: CallCommonEventCommand,
  context: CommandContext
): CommandResult {
  const { project, playerState } = context;

  const commonEvents = project.commonEvents || {};
  const commonEvent = commonEvents[command.commonEventId];

  if (!commonEvent) {
    console.warn(`[CallCommonEvent] Common event not found: ${command.commonEventId}`);
    return { advance: true };
  }

  if (!commonEvent.enabled) {
    console.warn(`[CallCommonEvent] Common event is disabled: ${commonEvent.name}`);
    return { advance: true };
  }

  if (!commonEvent.commands || commonEvent.commands.length === 0) {
    console.warn(`[CallCommonEvent] Common event has no commands: ${commonEvent.name}`);
    return { advance: true };
  }

  // Resolve parameter arguments into variable overrides
  const variableOverrides: Record<string, string | number | boolean> = {};
  if (commonEvent.parameters && command.arguments) {
    for (const param of commonEvent.parameters) {
      const argValue = command.arguments[param.id];
      if (argValue !== undefined) {
        variableOverrides[param.id] = argValue;
      } else {
        // Use parameter default value
        variableOverrides[param.id] = param.defaultValue;
      }
    }
  }

  // Push current position onto the command stack so we can return after the
  // common event finishes. The index is currentIndex + 1 because when we pop,
  // we want to resume at the NEXT command after the CallCommonEvent.
  const newStack = [
    ...playerState.commandStack,
    {
      sceneId: playerState.currentSceneId,
      commands: playerState.currentCommands,
      index: playerState.currentIndex + 1,
    },
  ];

  return {
    advance: false, // We handle navigation ourselves
    updates: {
      currentCommands: commonEvent.commands,
      currentIndex: 0,
      commandStack: newStack,
      // Merge parameter arguments into variables
      ...(Object.keys(variableOverrides).length > 0
        ? { variables: { ...playerState.variables, ...variableOverrides } }
        : {}),
    },
  };
}
