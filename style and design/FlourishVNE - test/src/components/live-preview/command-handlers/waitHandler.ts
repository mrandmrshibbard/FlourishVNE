import { WaitCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles wait/delay commands
 * Can wait for a duration or wait for user input
 */
export function handleWait(
  command: WaitCommand,
  context: CommandContext,
  advance: () => void
): CommandResult {
  const durationMs = (command.duration ?? 1) * 1000;

  // If waitForInput is enabled, allow user input (click or key) to advance early
  if (command.waitForInput) {
    let timeoutId: number | null = window.setTimeout(() => {
      advance();
      removeListeners();
    }, durationMs);

    const onUserAdvance = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      advance();
      removeListeners();
    };

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') onUserAdvance();
    };
    const clickHandler = () => onUserAdvance();

    const removeListeners = () => {
      window.removeEventListener('keydown', keyHandler);
      window.removeEventListener('click', clickHandler);
    };

    window.addEventListener('keydown', keyHandler);
    window.addEventListener('click', clickHandler);
  } else {
    // No user input allowed, just wait for duration
    setTimeout(() => advance(), durationMs);
  }

  // Don't auto-advance - the setTimeout will handle it
  return {
    advance: false,
  };
}
