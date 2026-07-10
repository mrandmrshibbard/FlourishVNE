import { ShowCharacterCommand, HideCharacterCommand, SetCharacterLayerCommand } from '../../../features/scene/types';
import { VNCharacterLayer } from '../../../features/character/types';
import { VNID } from '../../../types';
import { CommandContext, CommandResult } from './types';
import { TweenManager } from '../systems/tweenManager';
import { resolveFieldUrl } from '../../../utils/assetStore';
import { resolveCommandCharacterId } from '../../../utils/playerCharacter';

/** Build the stacked image/video URLs for a character from a resolved per-layer asset selection
 *  (base first, then each layer in definition order). Shared by ShowCharacter + SetCharacterLayer. */
function buildCharacterMedia(
  charData: any,
  layerSelections: Record<VNID, VNID | null>,
  wrap: (u: string) => string,
): { imageUrls: string[]; videoUrls: string[]; videoTrims: Array<{ start?: number; end?: number }>; hasVideo: boolean; videoLoop: boolean } {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  // Parallel to videoUrls: the base sprite carries its own [start,end] trim; layer asset
  // videos have no trim field yet → an empty slice (whole video).
  const videoTrims: Array<{ start?: number; end?: number }> = [];
  let hasVideo = false;
  let videoLoop = false;
  if (charData.baseVideoUrl) { videoUrls.push(wrap(charData.baseVideoUrl)); videoTrims.push({ start: charData.baseVideoTrimStart, end: charData.baseVideoTrimEnd }); hasVideo = true; videoLoop = !!charData.baseVideoLoop; }
  else if (charData.baseImageUrl) { imageUrls.push(wrap(charData.baseImageUrl)); }
  (Object.values(charData.layers) as VNCharacterLayer[]).forEach(layer => {
    const assetId = layerSelections[layer.id];
    const asset = assetId ? layer.assets[assetId] : null;
    if (asset?.videoUrl) { videoUrls.push(wrap(asset.videoUrl)); videoTrims.push({}); hasVideo = true; videoLoop = videoLoop || !!asset.loop; }
    else if (asset?.imageUrl) { imageUrls.push(wrap(asset.imageUrl)); }
  });
  return { imageUrls, videoUrls, videoTrims, hasVideo, videoLoop };
}

/**
 * Handles showing a character with expression, layers, and transitions
 * Supports variable bindings to layer assets for dynamic expressions
 */
export function handleShowCharacter(
  command: ShowCharacterCommand,
  context: CommandContext
): CommandResult {
  const { project, playerState, activeEffectTimeoutsRef, advance, setPlayerState } = context;
  // ⟨Player's Character⟩ targeting: when characterSource==='player', show whichever character the
  // player created (resolved from project.ui.playerCharacterVarId) instead of a hard-coded id. The
  // character is stored on stage under this RESOLVED id so Hide/Move('player') find the same slot.
  // Resolve ⟨Player's Character⟩; if none is chosen/configured yet, fall back to the command's own
  // character so authoring/testing always previews something (the real player character shows once
  // a Character Creator sets one).
  const characterId = resolveCommandCharacterId(command, project, playerState.variables) || command.characterId;
  const charData = characterId ? project.characters[characterId] : undefined;
  // The command's expressionId may belong to a different (author-picked) character; fall back to the
  // resolved character's first expression. The look is driven by the customizer variables regardless.
  const exprData = charData
    ? (charData.expressions[command.expressionId] || Object.values(charData.expressions)[0])
    : undefined;

  if (!characterId || !charData || !exprData) {
    return { advance: true };
  }

  // Clear any resting tween values so the new position takes effect cleanly
  TweenManager.cancelForTarget(characterId, 'character');

  // Managed asset refs ("assets/…") → flourish-asset:// URL; data:/http pass through.
  const wrap = (u: string): string => resolveFieldUrl(project.id, u) || u;

  // Build layer variable bindings by finding which variables contain asset IDs from which layers
  // This allows automatic binding based on the actual data, not variable names
  const finalBindings: Record<VNID, VNID> = {};
  
  // Use existing bindings if the character is already on stage
  const existingChar = playerState?.stageState.characters[characterId];
  
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

  // Resolve the asset shown in each layer: a per-layer OVERRIDE wins, else the variable binding,
  // else the expression (preset) configuration. Stored on the stage char so SetCharacterLayer can
  // patch a single layer later and rebuild without re-running ShowCharacter.
  const layerSelections: Record<VNID, VNID | null> = {};
  Object.values(charData.layers).forEach((layer: VNCharacterLayer) => {
    if (command.layerOverrides && Object.prototype.hasOwnProperty.call(command.layerOverrides, layer.id)) {
      layerSelections[layer.id] = command.layerOverrides[layer.id] || null;
      return;
    }
    const variableId = finalBindings[layer.id];
    if (variableId && playerState.variables[variableId] !== undefined) {
      const varValue = playerState.variables[variableId];
      const variable = project.variables[variableId];
      if (variable?.type === 'number') {
        const index = Number(varValue) || 0;
        layerSelections[layer.id] = ((Object.values(layer.assets)[index] as any)?.id) ?? null;
      } else {
        const assetId = String(varValue);
        layerSelections[layer.id] = (assetId && layer.assets[assetId]) ? assetId : null;
      }
    } else if (Object.prototype.hasOwnProperty.call(exprData.layerConfiguration, layer.id)) {
      // The expression explicitly defines this layer (an assetId, or null = off) → honor it.
      layerSelections[layer.id] = exprData.layerConfiguration[layer.id] ?? null;
    } else if (existingChar?.layerSelections && Object.prototype.hasOwnProperty.call(existingChar.layerSelections, layer.id)) {
      // The expression doesn't define this layer at all — e.g. an accessory (a hat) added later via
      // Set Character Layer that no expression was authored to control. Preserve its CURRENT value
      // instead of dropping it, so re-showing the character (to flip it, change pose, etc.) doesn't
      // silently wipe a Set-Character-Layer layer. (Fixes: flipping a character with Show Character
      // removing its hat until the next expression change re-added it.)
      layerSelections[layer.id] = existingChar.layerSelections[layer.id];
    } else {
      layerSelections[layer.id] = null;
    }
  });

  const { imageUrls, videoUrls, videoTrims, hasVideo, videoLoop } = buildCharacterMedia(charData, layerSelections, wrap);

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
  const existingSameChar = currentCharacters[characterId];
  const isPoseChange = !!existingSameChar && !!hasShowTransitionFlag &&
    (existingSameChar.imageUrls.join(',') !== imageUrls.join(',') || existingSameChar.expressionId !== command.expressionId);

  // "Keep current position": when the character is already on stage, an expression/pose change
  // leaves it exactly where it is instead of snapping to the command's (often default 'center')
  // position. Only affects position — the new expression/pose/scale/effects still apply.
  if (command.keepPosition && existingSameChar) {
    finalPosition = existingSameChar.position;
  }
  const ghostKey = isPoseChange ? `__ghost_${characterId}_${Date.now()}` : null;
  const ghostEntry = isPoseChange ? {
    charId: ghostKey as string,
    position: existingSameChar!.position,
    imageUrls: existingSameChar!.imageUrls,
    videoUrls: existingSameChar!.videoUrls,
    videoTrims: existingSameChar!.videoTrims,
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
    charId: characterId,
    layer: command.layer,
    parallaxDepth: command.parallaxDepth,
    position: finalPosition,
    imageUrls,
    videoUrls,
    videoTrims,
    isVideo: hasVideo,
    videoLoop,
    expressionId: command.expressionId,
    layerVariableBindings: finalBindings,
    layerSelections,
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
          [characterId]: characterState,
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
      characters: { ...prev.characters, [characterId]: characterState },
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
  const { project, playerState, setPlayerState, advance } = context;
  const hideTransitionType = command.transition;

  // ⟨Player's Character⟩ targeting — resolve to the player-created character's id when requested.
  // Resolve ⟨Player's Character⟩; if none is chosen/configured yet, fall back to the command's own
  // character so authoring/testing always previews something (the real player character shows once
  // a Character Creator sets one).
  const characterId = resolveCommandCharacterId(command, project, playerState.variables) || command.characterId;
  const existingChar = characterId ? playerState.stageState.characters[characterId] : undefined;
  if (!characterId || !existingChar) {
    // Character not on stage, nothing to do
    return { advance: true };
  }

  TweenManager.cancelForTarget(characterId, 'character');

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
        characters: { ...prev.characters, [characterId]: characterWithTransition },
      }),
      delay: duration,
      callback: () => {
        // Remove character after transition
        setPlayerState((p) => {
          if (!p) return null;
          const { [characterId]: _, ...remaining } =
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
        const { [characterId]: _, ...remaining } = prev.characters;
        return { characters: remaining };
      },
    };
  }
}

/**
 * Change one or more layers on a character already on stage (blush on, draw weapon, swap hat…)
 * without re-showing the whole sprite. Patches the stored layerSelections and rebuilds the composite.
 */
export function handleSetCharacterLayer(
  command: SetCharacterLayerCommand,
  context: CommandContext
): CommandResult {
  const { project, playerState } = context;
  const charData = project.characters[command.characterId];
  const onStage = playerState.stageState.characters[command.characterId];
  if (!charData || !onStage) {
    // Character not on stage — nothing to change.
    return { advance: true };
  }
  const wrap = (u: string): string => resolveFieldUrl(project.id, u) || u;
  const useTransition = !!command.transition && command.transition !== 'instant';

  return {
    advance: true,
    // Functional patch so it composes with other stacked character commands against the latest stage.
    stagePatch: (prev) => {
      const cur = prev.characters[command.characterId];
      if (!cur) return {};
      const selections: Record<VNID, VNID | null> = { ...(cur.layerSelections || {}) };
      (command.layers || []).forEach(({ layerId, assetId }) => { selections[layerId] = assetId || null; });
      const { imageUrls, videoUrls, videoTrims, hasVideo, videoLoop } = buildCharacterMedia(charData, selections, wrap);
      return {
        characters: {
          ...prev.characters,
          [command.characterId]: {
            ...cur,
            imageUrls,
            videoUrls,
            videoTrims,
            isVideo: hasVideo,
            videoLoop,
            layerSelections: selections,
            // Optional crossfade of the character to the new look; otherwise an instant swap.
            transition: useTransition ? { type: command.transition!, duration: command.duration ?? 0.3, action: 'show' as const } : null,
          },
        },
      };
    },
  };
}
