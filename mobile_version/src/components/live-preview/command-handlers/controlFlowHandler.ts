import { JumpCommand, JumpToLabelCommand, LabelCommand, BranchElseIfCommand, BranchElseCommand, BranchEndCommand } from '../../../features/scene/types';
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
        movieOverlays: [],
        screen: {
          shake: { active: false, intensity: 0 },
          tint: 'transparent',
          zoom: 1,
          panX: 0,
          panY: 0,
          transitionDuration: 0.5,
          overlayEffects: []
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

// Jump to just past the matching BranchEnd. Used when an Otherwise-if / Otherwise marker is
// reached by normal flow — that only happens after a previous segment's body ran, so the rest
// of the branch must be skipped.
function jumpPastBranchEnd(branchId: string, context: CommandContext): CommandResult {
  const { playerState } = context;
  const endIdx = playerState.currentCommands.findIndex((c, i) =>
    i > playerState.currentIndex &&
    c.type === CommandType.BranchEnd &&
    (c as BranchEndCommand).branchId === branchId
  );
  if (endIdx === -1) {
    return { advance: true };
  }
  return { advance: false, updates: { currentIndex: endIdx + 1 } };
}

/**
 * "Otherwise if" marker. Reached by fall-through only after a prior segment ran → skip to End.
 * (When a prior condition was false, the decision logic at BranchStart evaluates this segment
 * without ever landing the runtime on the marker itself.)
 */
export function handleBranchElseIf(command: BranchElseIfCommand, context: CommandContext): CommandResult {
  return jumpPastBranchEnd(command.branchId, context);
}

/**
 * "Otherwise" marker. Reached by fall-through only after a prior segment ran → skip to End.
 */
export function handleBranchElse(command: BranchElseCommand, context: CommandContext): CommandResult {
  return jumpPastBranchEnd(command.branchId, context);
}

/**
 * Handles group markers (visual only in editor, skip during execution)
 */
export function handleGroup(): CommandResult {
  // Groups are visual only in the editor, skip during execution
  return { advance: true };
}
