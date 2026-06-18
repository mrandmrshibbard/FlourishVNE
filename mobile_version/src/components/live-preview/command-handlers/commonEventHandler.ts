/**
 * Common Event Command Handler
 * Handles executing reusable common event command blocks
 */

import { CallCommonEventCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/** Max nested CallCommonEvent depth before we fail safe (matches the editor warning). */
export const MAX_CALL_DEPTH = 32;

/**
 * Handles calling a common event by pushing the current position onto the
 * command stack and switching execution to the common event's commands.
 * When the common event commands complete, the stack-pop mechanism in
 * LivePreview will automatically return to the caller's next command — at
 * which point the parameter variables are restored (true local scope).
 *
 * For parameterised events, arguments are injected as runtime variable overrides
 * keyed by parameter id, with their prior values saved for restoration on return.
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

  // ── Fail-safe guards ──────────────────────────────────────────────────────
  // Depth limit: runaway nesting would otherwise grow the stack until the tab dies.
  if (playerState.commandStack.length >= MAX_CALL_DEPTH) {
    console.error(`[CallCommonEvent] Max call depth (${MAX_CALL_DEPTH}) reached calling "${commonEvent.name}"`);
    context.notify?.(`Common Event call depth limit reached ("${commonEvent.name}")`, 'error');
    return { advance: true };
  }
  // Cycle detection: the target is already an ancestor on the stack (A → B → A).
  if (playerState.commandStack.some(frame => frame.commonEventId === commonEvent.id)) {
    console.error(`[CallCommonEvent] Cycle detected — "${commonEvent.name}" is already on the call stack`);
    context.notify?.(`Common Event cycle blocked ("${commonEvent.name}")`, 'error');
    return { advance: true };
  }

  // Resolve parameter arguments into variable overrides (keyed by param id), with
  // type coercion, and remember the prior state so we can restore it on return.
  const variableOverrides: Record<string, string | number | boolean> = {};
  const savedVariables: Record<string, string | number | boolean> = {};
  const clearedVariables: string[] = [];
  if (commonEvent.parameters && commonEvent.parameters.length > 0) {
    for (const param of commonEvent.parameters) {
      const raw = command.arguments?.[param.id];
      const value = raw !== undefined ? coerceParam(raw, param.type) : param.defaultValue;
      variableOverrides[param.id] = value;
      // Snapshot prior value for restoration (or mark for deletion if it was absent).
      if (Object.prototype.hasOwnProperty.call(playerState.variables, param.id)) {
        savedVariables[param.id] = playerState.variables[param.id];
      } else {
        clearedVariables.push(param.id);
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
      commonEventId: commonEvent.id,
      ...(Object.keys(savedVariables).length > 0 ? { savedVariables } : {}),
      ...(clearedVariables.length > 0 ? { clearedVariables } : {}),
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

/** Coerce a raw argument value to the parameter's declared type. */
export function coerceParam(value: string | number | boolean, type: 'string' | 'number' | 'boolean'): string | number | boolean {
  if (type === 'number') {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return isNaN(n) ? 0 : n;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === 1 || value === '1';
  }
  return String(value);
}
