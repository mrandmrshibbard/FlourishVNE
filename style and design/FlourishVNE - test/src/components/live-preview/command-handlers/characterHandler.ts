import { ShowCharacterCommand, HideCharacterCommand } from '../../../features/scene/types';
import { VNCharacterLayer } from '../../../features/character/types';
import { VNID } from '../../../types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles showing a character with expression, layers, and transitions
 * Supports variable bindings to layer assets for dynamic expressions
 */
export function handleShowCharacter(
  command: ShowCharacterCommand,
  context: CommandContext
): CommandResult {
  const { project, playerState, activeEffectTimeoutsRef, advance } = context;
  const charData = project.characters[command.characterId];
  const exprData = charData?.expressions[command.expressionId];

  if (!charData || !exprData) {
    return { advance: true };
  }

  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  let hasVideo = false;
  let videoLoop = false;

  // Check base image/video
  if (charData.baseVideoUrl) {
    videoUrls.push(charData.baseVideoUrl);
    hasVideo = true;
    videoLoop = !!charData.baseVideoLoop;
  } else if (charData.baseImageUrl) {
    imageUrls.push(charData.baseImageUrl);
  }

  // Build layer variable bindings by checking all number variables
  // If a variable name matches a layer name, use it
  const layerBindings: Record<VNID, VNID> = {};
  Object.values(charData.layers).forEach((layer: VNCharacterLayer) => {
    // Check if there's a number variable with matching name
    const matchingVar = Object.values(project.variables).find(
      (v: any) =>
        v.type === 'number' &&
        (v.name.toLowerCase().includes(layer.name.toLowerCase()) ||
          layer.name.toLowerCase().includes(v.name.toLowerCase()))
    );
    if (matchingVar) {
      layerBindings[layer.id] = (matchingVar as any).id;
    }
  });

  // Merge with existing bindings
  const existingChar = playerState?.stageState.characters[command.characterId];
  const finalBindings = {
    ...layerBindings,
    ...(existingChar?.layerVariableBindings || {}),
  };

  // Check layer assets - respect variable bindings
  Object.values(charData.layers).forEach((layer: VNCharacterLayer) => {
    let asset = null;

    // Check if this layer has a variable binding
    const variableId = finalBindings[layer.id];
    if (variableId && playerState.variables[variableId] !== undefined) {
      // Use variable value as index into layer assets
      const index = Number(playerState.variables[variableId]) || 0;
      const assetArray = Object.values(layer.assets);
      asset = assetArray[index];
      console.log(
        `ShowCharacter: Using variable ${variableId} (value: ${index}) for layer "${layer.name}"`
      );
    } else {
      // Use expression configuration
      const assetId = exprData.layerConfiguration[layer.id];
      if (assetId) {
        asset = layer.assets[assetId];
        console.log(
          `ShowCharacter: Using expression config for layer "${layer.name}"`
        );
      }
    }

    if (asset) {
      if (asset.videoUrl) {
        videoUrls.push(asset.videoUrl);
        hasVideo = true;
        videoLoop = videoLoop || !!asset.loop;
      } else if (asset.imageUrl) {
        imageUrls.push(asset.imageUrl);
      }
    }
  });

  // For slide transitions, use endPosition if specified, otherwise use position
  const finalPosition = command.endPosition || command.position;
  const startPosition = command.startPosition;

  // Use the requested transition (slide is now supported)
  const requestedTransition = command.transition;

  console.log(
    `ShowCharacter: ${charData.name}, expression: ${exprData.name}, bindings:`,
    finalBindings,
    'variables:',
    playerState.variables
  );

  const characterState = {
    charId: command.characterId,
    position: finalPosition,
    imageUrls,
    videoUrls,
    isVideo: hasVideo,
    videoLoop,
    expressionId: command.expressionId,
    layerVariableBindings: finalBindings,
    transition:
      requestedTransition && requestedTransition !== 'instant'
        ? {
            type: requestedTransition,
            duration: command.duration ?? 0.5,
            startPosition: startPosition,
            action: 'show' as const,
          }
        : null,
  };

  // If there's a transition, wait for it to complete before advancing
  if (command.transition && command.transition !== 'instant') {
    const duration = (command.duration ?? 0.5) * 1000 + 100;
    
    return {
      advance: false,
      updates: {
        stageState: {
          ...playerState.stageState,
          characters: {
            ...playerState.stageState.characters,
            [command.characterId]: characterState,
          },
        },
      },
      delay: duration,
      callback: () => {
        advance();
      },
    };
  }

  // Instant show - no transition
  return {
    advance: true,
    updates: {
      stageState: {
        ...playerState.stageState,
        characters: {
          ...playerState.stageState.characters,
          [command.characterId]: characterState,
        },
      },
    },
  };
}

/**
 * Handles hiding a character with transition
 * Supports fade and slide transitions
 */
export function handleHideCharacter(
  command: HideCharacterCommand,
  context: CommandContext
): CommandResult {
  const { playerState, setPlayerState, advance } = context;
  const hideTransitionType = command.transition;

  const existingChar = playerState.stageState.characters[command.characterId];
  if (!existingChar) {
    // Character not on stage, nothing to do
    return { advance: true };
  }

  if (hideTransitionType && hideTransitionType !== 'instant') {
    // Block advancing while hide animation runs
    const finalPosition = existingChar.position;
    const startPosition = undefined;

    const characterWithTransition = {
      ...existingChar,
      position: finalPosition,
      transition: {
        type: hideTransitionType,
        duration: command.duration ?? 0.5,
        startPosition: startPosition,
        endPosition: command.endPosition,
        action: 'hide' as const,
      },
    };

    const duration = (command.duration ?? 0.5) * 1000 + 100;

    return {
      advance: false,
      updates: {
        stageState: {
          ...playerState.stageState,
          characters: {
            ...playerState.stageState.characters,
            [command.characterId]: characterWithTransition,
          },
        },
      },
      delay: duration,
      callback: () => {
        // Remove character after transition
        setPlayerState((p) => {
          if (!p) return null;
          const { [command.characterId]: _, ...remaining } =
            p.stageState.characters;
          return {
            ...p,
            stageState: { ...p.stageState, characters: remaining },
          };
        });
        // Advance to next command after hiding character
        advance();
      },
    };
  } else {
    // Instant hide - remove immediately
    const { [command.characterId]: _, ...remaining } =
      playerState.stageState.characters;
    return {
      advance: true,
      updates: {
        stageState: {
          ...playerState.stageState,
          characters: remaining,
        },
      },
    };
  }
}
