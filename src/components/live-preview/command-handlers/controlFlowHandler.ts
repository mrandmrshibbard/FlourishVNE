import { JumpCommand, JumpToLabelCommand, LabelCommand } from '../../../features/scene/types';
import { CommandType } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles jumping to a different scene
 * Uses navigateToScene to handle branch logic
 */
export function handleJump(command: JumpCommand, context: CommandContext): CommandResult {
  const { project, playerState } = context;
  
  // navigateToScene needs to be passed through context
  // For now, directly handle the scene switch
  const actualSceneId = command.targetSceneId; // TODO: Add navigateToScene to context
  const newScene = project.scenes[actualSceneId];
  
  if (!newScene) {
    console.error(`Scene not found: ${actualSceneId}`);
    return { advance: true };
  }

  return {
    advance: false, // don't auto-advance after a jump
    updates: {
      currentSceneId: actualSceneId,
      currentCommands: newScene.commands,
      currentIndex: 0,
      commandStack: [],
      // Clear stage state for new scene
      stageState: {
        backgroundUrl: null,
        characters: {},
        textOverlays: [],
        imageOverlays: [],
        buttonOverlays: [],
        screen: {
          shake: { active: false, intensity: 0 },
          tint: 'transparent',
          zoom: 1,
          panX: 0,
          panY: 0,
          transitionDuration: 0.5
        }
      },
      // Clear UI state
      uiState: {
        dialogue: null,
        choices: null,
        textInput: null,
        movieUrl: null,
        isWaitingForInput: false,
        isTransitioning: false,
        transitionElement: null,
        flash: null,
        showHistory: false,
        screenSceneId: null
      }
    },
  };
}

/**
 * Handles jumping to a labeled position within the current scene
 */
export function handleJumpToLabel(
  command: JumpToLabelCommand,
  context: CommandContext
): CommandResult {
  const { playerState } = context;
  
  const labelIndex = playerState.currentCommands.findIndex(
    (c) => c.type === CommandType.Label && (c as LabelCommand).labelId === command.labelId
  );
  
  if (labelIndex === -1) {
    console.warn(`Label not found: ${command.labelId}`);
    return { advance: true };
  }

  return {
    advance: false, // Don't advance after jump
    updates: {
      currentIndex: labelIndex,
    },
  };
}

/**
 * Handles label markers (no-op during execution)
 */
export function handleLabel(command: LabelCommand, context: CommandContext): CommandResult {
  // Do nothing, just a marker
  return { advance: true };
}

/**
 * Handles branch start markers (no-op, condition checking happens before execution)
 */
export function handleBranchStart(): CommandResult {
  // Branch conditions already checked above, this is just a marker
  return { advance: true };
}

/**
 * Handles branch end markers (no-op)
 */
export function handleBranchEnd(): CommandResult {
  // BranchEnd is just a marker, no action needed
  return { advance: true };
}

/**
 * Handles group markers (visual only in editor, skip during execution)
 */
export function handleGroup(): CommandResult {
  // Groups are visual only in the editor, skip during execution
  return { advance: true };
}
