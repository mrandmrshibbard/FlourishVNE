import { ShowCharacterCommand, HideCharacterCommand } from '../../../features/scene/types';
import { VNCharacterLayer } from '../../../features/character/types';
import { VNID } from '../../../types';
import { CommandContext, CommandResult } from './types';
import { TweenManager } from '../systems/tweenManager';

/**
 * Handles showing a character with expression, layers, and transitions
 * Supports variable bindings to layer assets for dynamic expressions
 */
export function handleShowCharacter(
  command: ShowCharacterCommand,
  context: CommandContext
): CommandResult {
  const { project, playerState, activeEffectTimeoutsRef, advance, setPlayerState } = context;
  const charData = project.characters[command.characterId];
  const exprData = charData?.expressions[command.expressionId];

  if (!charData || !exprData) {
    return { advance: true };
  }

  // Clear any resting tween values so the new position takes effect cleanly
  TweenManager.cancelForTarget(command.characterId, 'character');

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
  let finalPosition = command.endPosition || command.position;
  const startPosition = command.startPosition;

  // Use the requested transition (slide is now supported)
  const requestedTransition = command.transition;

  const currentCharacters = playerState.stageState.characters;

  // Detect a pose change of the SAME character (same id already on stage, visuals differ).
  // Other (different) characters are left untouched so multiple characters coexist on stage.
  // To crossfade a pose change in place we keep a transient "ghost" of the old pose that
  // fades out under a synthetic id while the real slot shows the new pose fading in.
  const hasShowTransitionFlag = requestedTransition && requestedTransition !== 'instant';
  const existingSameChar = currentCharacters[command.characterId];
  const isPoseChange = !!existingSameChar && !!hasShowTransitionFlag &&
    (existingSameChar.imageUrls.join(',') !== imageUrls.join(',') || existingSameChar.expressionId !== command.expressionId);

  // "Keep current position": when the character is already on stage, an expression/pose change
  // leaves it exactly where it is instead of snapping to the command's (often default 'center')
  // position. Only affects position — the new expression/pose/scale/effects still apply.
  if (command.keepPosition && existingSameChar) {
    finalPosition = existingSameChar.position;
  }
  const ghostKey = isPoseChange ? `__ghost_${command.characterId}_${Date.now()}` : null;
  const ghostEntry = isPoseChange ? {
    charId: ghostKey as string,
    position: existingSameChar!.position,
    imageUrls: existingSameChar!.imageUrls,
    videoUrls: existingSameChar!.videoUrls,
    isVideo: existingSameChar!.isVideo,
    videoLoop: existingSameChar!.videoLoop,
    expressionId: existingSameChar!.expressionId,
    layerVariableBindings: existingSameChar!.layerVariableBindings,
    sourceCommandId: undefined,
    scale: existingSameChar!.scale,
    inverted: existingSameChar!.inverted,
    visualEffects: undefined,
    transition: {
      type: command.transition ?? 'fade',
      duration: command.duration ?? 0.5,
      startPosition: undefined,
      endPosition: undefined,
      action: 'hide' as const,
    },
  } as typeof existingSameChar : null;

  console.log(
    `ShowCharacter: ${charData.name}, expression: ${exprData.name}, bindings:`,
    finalBindings,
    'variables:',
    playerState.variables
  );

  const characterState = {
    charId: command.characterId,
    layer: command.layer,
    parallaxDepth: command.parallaxDepth,
    position: finalPosition,
    imageUrls,
    videoUrls,
    isVideo: hasVideo,
    videoLoop,
    expressionId: command.expressionId,
    layerVariableBindings: finalBindings,
    sourceCommandId: command.id,
    scale: command.scale,
    inverted: command.inverted,
    rotation: command.rotation,
    flipY: command.flipY,
    visualEffects: (() => {
        // Support both new visualEffects array and legacy single visualEffect
        const effects: import('../../../features/scene/types').VNCharacterVisualEffect[] = [];
        if (command.visualEffects && command.visualEffects.length > 0) {
            effects.push(...command.visualEffects.filter(e => e.type !== 'none'));
        } else if (command.visualEffect && command.visualEffect.type !== 'none') {
            effects.push(command.visualEffect);
        }
        return effects.length > 0 ? effects : undefined;
    })(),
    transition:
      requestedTransition && requestedTransition !== 'instant'
        ? {
            type: requestedTransition,
            duration: command.duration ?? 0.5,
            startPosition: startPosition,
            action: 'show' as const,
          }
        : null,
    ...(command.liveConditions ? { conditions: command.conditions, live: true } : {}),
  };

  // If there's a transition, wait for it to complete before advancing
  if (command.transition && command.transition !== 'instant') {
    const duration = (command.duration ?? 0.5) * 1000 + 100;

    return {
      advance: false,
      // Functional patch so stacked/parallel Show Character commands compose (add against latest).
      stagePatch: (prev) => ({
        characters: {
          ...prev.characters,
          // Old pose ghost (fades out) when changing pose of the same character
          ...(ghostEntry && ghostKey ? { [ghostKey]: ghostEntry } : {}),
          [command.characterId]: characterState,
        },
      }),
      delay: duration,
      callback: () => {
        // Remove the fade-out ghost once the crossfade completes
        if (ghostKey) {
          setPlayerState((p) => {
            if (!p) return null;
            const { [ghostKey]: _removed, ...remaining } = p.stageState.characters;
            return { ...p, stageState: { ...p.stageState, characters: remaining } };
          });
        }
        advance();
      },
    };
  }

  // Instant show - no transition. Functional patch so stacked Show Character commands compose.
  return {
    advance: true,
    stagePatch: (prev) => ({
      characters: { ...prev.characters, [command.characterId]: characterState },
    }),
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

  TweenManager.cancelForTarget(command.characterId, 'character');

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
      // Functional patch (composes with other stacked/parallel character commands).
      stagePatch: (prev) => ({
        characters: { ...prev.characters, [command.characterId]: characterWithTransition },
      }),
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
    // Instant hide - remove immediately. Functional patch so four stacked Hide Character
    // commands (runAsync) each remove their OWN character against the latest stage instead
    // of overwriting the whole `characters` map from a stale snapshot (the "only 2-3 of 4
    // disappear" race).
    return {
      advance: true,
      stagePatch: (prev) => {
        const { [command.characterId]: _, ...remaining } = prev.characters;
        return { characters: remaining };
      },
    };
  }
}
