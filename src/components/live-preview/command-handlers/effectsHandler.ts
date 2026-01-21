import {
  ShakeScreenCommand,
  TintScreenCommand,
  PanZoomScreenCommand,
  ResetScreenEffectsCommand,
  FlashScreenCommand,
  SetScreenOverlayEffectCommand,
} from '../../../features/scene/types';
import { upsertOverlayEffect } from '../../../types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles screen shake effect
 * Stores shake parameters in ref for CSS animation
 */
export function handleShakeScreen(
  command: ShakeScreenCommand,
  context: CommandContext
): CommandResult {
  const { activeEffectTimeoutsRef } = context;
  
  // Set shake in ref - CSS animation handles the visual effect
  // Note: activeShakeRef needs to be added to CommandContext
  // For now, this is a simplified version
  
  const duration = command.duration * 1000;
  
  return {
    advance: true,
    // The actual shake ref management would need to be in the main component
    // This is a limitation of extracting into pure handlers
  };
}

/**
 * Handles screen tint effect
 */
export function handleTintScreen(
  command: TintScreenCommand,
  context: CommandContext
): CommandResult {
  const { playerState } = context;
  
  return {
    advance: true,
    updates: {
      stageState: {
        ...playerState.stageState,
        screen: {
          ...playerState.stageState.screen,
          tint: command.color,
          transitionDuration: command.duration,
        },
      },
    },
  };
}

/**
 * Handles screen pan/zoom effect
 */
export function handlePanZoomScreen(
  command: PanZoomScreenCommand,
  context: CommandContext
): CommandResult {
  const { playerState } = context;
  
  return {
    advance: true,
    updates: {
      stageState: {
        ...playerState.stageState,
        screen: {
          ...playerState.stageState.screen,
          zoom: command.zoom,
          panX: command.panX,
          panY: command.panY,
          transitionDuration: command.duration,
        },
      },
    },
  };
}

/**
 * Handles resetting all screen effects
 */
export function handleResetScreenEffects(
  command: ResetScreenEffectsCommand,
  context: CommandContext
): CommandResult {
  const { playerState } = context;
  
  return {
    advance: true,
    updates: {
      stageState: {
        ...playerState.stageState,
        screen: {
          ...playerState.stageState.screen,
          tint: 'transparent',
          zoom: 1,
          panX: 0,
          panY: 0,
          transitionDuration: command.duration,
          overlayEffects: [],
        },
      },
    },
  };
}

/**
 * Handles setting/clearing a screen overlay effect
 */
export function handleSetScreenOverlayEffect(
  command: SetScreenOverlayEffectCommand,
  context: CommandContext
): CommandResult {
  const { playerState } = context;

  return {
    advance: true,
    updates: {
      stageState: {
        ...playerState.stageState,
        screen: {
          ...playerState.stageState.screen,
          overlayEffects: upsertOverlayEffect(playerState.stageState.screen.overlayEffects, {
            type: command.effectType,
            intensity: command.intensity,
            variant: command.variant,
          }),
        },
      },
    },
  };
}

/**
 * Handles screen flash effect
 */
export function handleFlashScreen(
  command: FlashScreenCommand,
  context: CommandContext
): CommandResult {
  // Flash effect needs to manage activeFlashRef and flashTrigger
  // These would need to be added to CommandContext
  // For now, simplified version
  
  return {
    advance: true,
    // The actual flash ref management would need to be in the main component
  };
}
