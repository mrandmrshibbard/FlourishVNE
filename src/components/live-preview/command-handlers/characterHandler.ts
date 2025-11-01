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

  // Build layer variable bindings by finding which variables contain asset IDs from which layers
  // This allows automatic binding based on the actual data, not variable names
  const finalBindings: Record<VNID, VNID> = {};
  
  // Use existing bindings if the character is already on stage
  const existingChar = playerState?.stageState.characters[command.characterId];
  
  // For each layer, determine the best variable binding
  Object.values(charData.layers).forEach((layer: VNCharacterLayer) => {
    let boundVarId: VNID | null = null;
    
    // First check if existing binding is still valid (variable value is still an asset in this layer)
    const existingVarId = existingChar?.layerVariableBindings[layer.id];
    if (existingVarId) {
      const existingValue = String(playerState.variables[existingVarId] || '');
      if (existingValue && existingValue in layer.assets) {
        boundVarId = existingVarId;
        console.log(`ShowCharacter: Keeping existing binding for layer "${layer.name}" to variable ${existingVarId}`);
      }
    }
    
    // If no valid existing binding, find a new one
    // Use findLast to prefer variables defined later (typically the filtered result variable)
    if (!boundVarId) {
      const matchingVars = Object.entries(project.variables).filter(([varId, v]: [string, any]) => {
        if (v.type !== 'string') return false;
        const varValue = String(playerState.variables[varId] || '');
        if (!varValue) return false;
        // Check if this variable's value is an asset ID in this layer
        return varValue in layer.assets;
      });
      
      // Prefer the last matching variable (typically the final filtered result)
      const matchingVar = matchingVars[matchingVars.length - 1];
      
      if (matchingVar) {
        const [varId, varData] = matchingVar;
        boundVarId = varId;
        console.log(`ShowCharacter: Auto-bound layer "${layer.name}" to variable "${varData.name}" (contains asset ID from this layer)`);
      }
    }
    
    if (boundVarId) {
      finalBindings[layer.id] = boundVarId;
    }
  });

  // Check layer assets - respect variable bindings
  Object.values(charData.layers).forEach((layer: VNCharacterLayer) => {
    let asset = null;

    // Check if this layer has a variable binding
    const variableId = finalBindings[layer.id];
    if (variableId && playerState.variables[variableId] !== undefined) {
      const varValue = playerState.variables[variableId];
      const variable = project.variables[variableId];
      
      // Support both index-based (number) and ID-based (string) variables
      if (variable?.type === 'number') {
        // Use variable value as index into layer assets (for cyclers)
        const index = Number(varValue) || 0;
        const assetArray = Object.values(layer.assets);
        asset = assetArray[index];
        console.log(
          `ShowCharacter: Using variable ${variableId} (index: ${index}) for layer "${layer.name}"`
        );
      } else {
        // Use variable value as asset ID directly (for string variables)
        const assetId = String(varValue);
        asset = assetId ? layer.assets[assetId] : null;
        console.log(
          `ShowCharacter: Using variable ${variableId} (assetId: ${assetId}) for layer "${layer.name}"`
        );
      }
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
