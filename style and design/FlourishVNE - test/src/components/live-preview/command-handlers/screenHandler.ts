import { ShowScreenCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { VNID } from '../../../types';

/**
 * Handles showing UI screens/menus
 * Can show HUD overlays during gameplay or full-screen menus
 */
export function handleShowScreen(
  command: ShowScreenCommand,
  context: CommandContext,
  setHudStack: (value: VNID[] | ((prev: VNID[]) => VNID[])) => void,
  setScreenStack: (value: VNID[] | ((prev: VNID[]) => VNID[])) => void
): CommandResult {
  const { playerState } = context;
  
  // If we're in-playing, treat this as a HUD/in-game overlay
  if (playerState.mode === 'playing') {
    setHudStack(s => [...s, command.screenId]);
  } else {
    // Otherwise push onto the normal screen stack (menus/title/pause)
    setScreenStack(s => [...s, command.screenId]);
  }

  // Don't auto-advance - pause execution when showing a screen
  return {
    advance: false,
  };
}
