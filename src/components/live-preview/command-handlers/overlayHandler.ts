import {
  ShowTextCommand,
  HideTextCommand,
  ShowImageCommand,
  HideImageCommand,
  ShowButtonCommand,
  HideButtonCommand,
  ShowImageMapCommand,
  HideImageMapCommand,
} from '../../../features/scene/types';
import { TextOverlay, ImageOverlay, ButtonOverlay, ImageMapOverlay } from '../types/gameState';
import { interpolateVariables } from '../../../utils/variableInterpolation';
import { CommandContext, CommandResult } from './types';
import { TweenManager } from '../systems/tweenManager';

/**
 * Handles showing text overlays on the stage
 * Supports transitions and variable interpolation
 */
export function handleShowText(
  command: ShowTextCommand,
  context: CommandContext
): CommandResult {
  const { playerState, project } = context;
  
  TweenManager.cancelForTarget(command.id, 'text');
  const interpolatedText = interpolateVariables(command.text, playerState.variables, project);
  const overlay: TextOverlay = {
    id: command.id,
    text: interpolatedText,
    x: command.x,
    y: command.y,
    fontSize: command.fontSize,
    fontFamily: command.fontFamily,
    color: command.color,
    width: command.width,
    height: command.height,
    fontWeight: command.fontWeight,
    fontStyle: command.fontStyle,
    letterSpacing: command.letterSpacing,
    textShadow: command.textShadow,
    textGradient: command.textGradient,
    textBorder: command.textBorder,
    textAlign: command.textAlign,
    verticalAlign: command.verticalAlign,
    transition: command.transition !== 'instant' ? command.transition : undefined,
    duration: command.duration,
    action: 'show',
  };

  // If command specified a non-instant transition, wait for it before advancing
  const hasTransition = command.transition && command.transition !== 'instant';
  const delay = hasTransition ? (command.duration ?? 0.5) * 1000 + 100 : 0;

  return {
    advance: !hasTransition,
    updates: {
      stageState: {
        ...playerState.stageState,
        textOverlays: [...playerState.stageState.textOverlays, overlay],
      },
    },
    delay,
    callback: hasTransition ? context.advance : undefined,
  };
}

/**
 * Handles hiding text overlays with transitions
 */
export function handleHideText(
  command: HideTextCommand,
  context: CommandContext
): CommandResult {
  const { playerState, setPlayerState, advance } = context;
  
  const overlays = playerState.stageState.textOverlays;
  const target = overlays.find((o) => o.id === command.targetCommandId);
  
  if (!target) {
    return { advance: true }; // nothing to hide
  }

  TweenManager.cancelForTarget(command.targetCommandId, 'text');

  if (command.transition && command.transition !== 'instant') {
    // mark overlay as hiding so render picks up hide class
    const updated = overlays.map((o) =>
      o.id === command.targetCommandId
        ? { ...o, transition: command.transition, duration: command.duration, action: 'hide' as const }
        : o
    );
    
    const duration = (command.duration ?? 0.5) * 1000 + 100;
    
    return {
      advance: false,
      updates: {
        stageState: {
          ...playerState.stageState,
          textOverlays: updated,
        },
      },
      delay: duration,
      callback: () => {
        setPlayerState((inner) =>
          inner
            ? {
                ...inner,
                stageState: {
                  ...inner.stageState,
                  textOverlays: inner.stageState.textOverlays.filter(
                    (o) => o.id !== command.targetCommandId
                  ),
                },
              }
            : null
        );
        advance();
      },
    };
  } else {
    // instant remove
    return {
      advance: true,
      updates: {
        stageState: {
          ...playerState.stageState,
          textOverlays: overlays.filter((o) => o.id !== command.targetCommandId),
        },
      },
    };
  }
}

/**
 * Handles showing image/video overlays on the stage
 */
export function handleShowImage(
  command: ShowImageCommand,
  context: CommandContext
): CommandResult {
  const { assetResolver, getAssetMetadata, playerState } = context;
  
  const imageUrl = assetResolver(command.imageId, 'image');
  const { isVideo, loop } = getAssetMetadata(command.imageId, 'image');
  
  if (!imageUrl) {
    console.warn(`Image not found: ${command.imageId}`);
    return { advance: true };
  }

  TweenManager.cancelForTarget(command.id, 'image');

  const overlay: ImageOverlay = {
    id: command.id,
    imageUrl: !isVideo ? imageUrl : undefined,
    videoUrl: isVideo ? imageUrl : undefined,
    isVideo,
    videoLoop: loop,
    x: command.x,
    y: command.y,
    width: command.width,
    height: command.height,
    rotation: command.rotation,
    opacity: command.opacity,
    scaleX: command.scaleX ?? 1,
    scaleY: command.scaleY ?? 1,
    transition: command.transition !== 'instant' ? command.transition : undefined,
    duration: command.duration,
    action: 'show',
  };

  const hasTransition = command.transition && command.transition !== 'instant';
  const delay = hasTransition ? (command.duration ?? 0.5) * 1000 + 100 : 0;

  return {
    advance: !hasTransition,
    updates: {
      stageState: {
        ...playerState.stageState,
        imageOverlays: [...playerState.stageState.imageOverlays, overlay],
      },
    },
    delay,
    callback: hasTransition ? context.advance : undefined,
  };
}

/**
 * Handles hiding image overlays with transitions
 */
export function handleHideImage(
  command: HideImageCommand,
  context: CommandContext
): CommandResult {
  const { playerState, setPlayerState, advance } = context;
  
  const overlays = playerState.stageState.imageOverlays;
  const target = overlays.find((o) => o.id === command.targetCommandId);
  
  if (!target) {
    return { advance: true };
  }

  TweenManager.cancelForTarget(command.targetCommandId, 'image');

  if (command.transition && command.transition !== 'instant') {
    const updated = overlays.map((o) =>
      o.id === command.targetCommandId
        ? { ...o, transition: command.transition, duration: command.duration, action: 'hide' as const }
        : o
    );
    
    const duration = (command.duration ?? 0.5) * 1000 + 100;
    
    return {
      advance: false,
      updates: {
        stageState: {
          ...playerState.stageState,
          imageOverlays: updated,
        },
      },
      delay: duration,
      callback: () => {
        setPlayerState((inner) =>
          inner
            ? {
                ...inner,
                stageState: {
                  ...inner.stageState,
                  imageOverlays: inner.stageState.imageOverlays.filter(
                    (o) => o.id !== command.targetCommandId
                  ),
                },
              }
            : null
        );
        advance();
      },
    };
  } else {
    return {
      advance: true,
      updates: {
        stageState: {
          ...playerState.stageState,
          imageOverlays: overlays.filter((o) => o.id !== command.targetCommandId),
        },
      },
    };
  }
}

/**
 * Handles showing button overlays with click handlers
 */
export function handleShowButton(
  command: ShowButtonCommand,
  context: CommandContext
): CommandResult {
  const { playerState, assetResolver, setPlayerState, evaluateConditions } = context;
  
  TweenManager.cancelForTarget(command.id, 'button');
  
  // Check show conditions - if conditions not met, skip showing the button
  if (command.showConditions && command.showConditions.length > 0) {
    const conditionsMet = evaluateConditions(command.showConditions, playerState.variables);
    if (!conditionsMet) {
      // Conditions not met - don't show the button, just advance
      return { advance: true };
    }
  }

  const buttonOverlay: ButtonOverlay = {
    id: command.id,
    text: command.text,
    x: command.x,
    y: command.y,
    width: command.width || 20,
    height: command.height || 8,
    anchorX: command.anchorX || 0.5,
    anchorY: command.anchorY || 0.5,
    backgroundColor: command.backgroundColor || '#6366f1',
    textColor: command.textColor || '#ffffff',
    fontSize: command.fontSize || 18,
    fontWeight: command.fontWeight || 'normal',
    borderRadius: command.borderRadius || 8,
    opacity: command.opacity ?? 1,
    imageUrl: command.image ? assetResolver(command.image.id, command.image.type) : null,
    hoverImageUrl: command.hoverImage
      ? assetResolver(command.hoverImage.id, command.hoverImage.type)
      : null,
    onClick: command.onClick,
    actions: command.actions, // Multiple actions support
    clickSound: command.clickSound,
    waitForClick: command.waitForClick,
    quickMenuMode: command.quickMenuMode,
    transition: command.transition !== 'instant' ? command.transition : undefined,
    duration: command.duration || 0.3,
    action: 'show',
  };

  const hasTransition = command.transition && command.transition !== 'instant';
  const waitForClick = command.waitForClick;

  // Determine advance behavior
  let shouldAdvance = true;
  let delay = 0;
  let callback: (() => void) | undefined;

  if (hasTransition && waitForClick) {
    // Has transition AND needs to wait for click
    // Set waiting for input IMMEDIATELY to prevent game loop from advancing
    shouldAdvance = false;
    delay = 0;
    callback = () => {
      setPlayerState((p) =>
        p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true } } : null
      );
    };
  } else if (hasTransition) {
    // Just transition, advance after
    shouldAdvance = false;
    delay = (command.duration ?? 0.3) * 1000 + 100;
    callback = context.advance;
  } else if (waitForClick) {
    // No transition, but waiting for click - pause immediately
    shouldAdvance = false;
    callback = () => {
      setPlayerState((p) =>
        p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true } } : null
      );
    };
  }

  return {
    advance: shouldAdvance,
    updates: {
      stageState: {
        ...playerState.stageState,
        buttonOverlays: [...playerState.stageState.buttonOverlays, buttonOverlay],
      },
    },
    delay,
    callback,
  };
}

/**
 * Handles hiding button overlays with transitions
 */
export function handleHideButton(
  command: HideButtonCommand,
  context: CommandContext
): CommandResult {
  const { playerState, setPlayerState, advance } = context;
  
  const overlays = playerState.stageState.buttonOverlays;
  const target = overlays.find((o) => o.id === command.targetCommandId);
  
  if (!target) {
    return { advance: true };
  }

  TweenManager.cancelForTarget(command.targetCommandId, 'button');

  if (command.transition && command.transition !== 'instant') {
    const updated = overlays.map((o) =>
      o.id === command.targetCommandId
        ? {
            ...o,
            transition: command.transition,
            duration: command.duration || 0.3,
            action: 'hide' as const,
          }
        : o
    );
    
    const duration = (command.duration ?? 0.3) * 1000 + 100;
    
    return {
      advance: false,
      updates: {
        stageState: {
          ...playerState.stageState,
          buttonOverlays: updated,
        },
      },
      delay: duration,
      callback: () => {
        setPlayerState((inner) =>
          inner
            ? {
                ...inner,
                stageState: {
                  ...inner.stageState,
                  buttonOverlays: inner.stageState.buttonOverlays.filter(
                    (o) => o.id !== command.targetCommandId
                  ),
                },
              }
            : null
        );
        advance();
      },
    };
  } else {
    return {
      advance: true,
      updates: {
        stageState: {
          ...playerState.stageState,
          buttonOverlays: overlays.filter((o) => o.id !== command.targetCommandId),
        },
      },
    };
  }
}

/**
 * Handles showing an image map overlay with clickable regions
 */
export function handleShowImageMap(
  command: ShowImageMapCommand,
  context: CommandContext
): CommandResult {
  const { assetResolver, playerState, setPlayerState, evaluateConditions } = context;

  const imageUrl = assetResolver(command.imageId, 'image');
  if (!imageUrl) {
    console.warn(`Image map image not found: ${command.imageId}`);
    return { advance: true };
  }

  const hoverImageUrl = command.hoverImageId ? assetResolver(command.hoverImageId, 'image') : undefined;

  TweenManager.cancelForTarget(command.id, 'imageMap');

  const overlay: ImageMapOverlay = {
    id: command.id,
    imageUrl,
    hoverImageUrl: hoverImageUrl || undefined,
    regions: command.regions.map(r => ({
      id: r.id,
      name: r.name,
      shape: r.shape,
      coords: r.coords,
      actions: r.actions,
      tooltip: r.tooltip,
      cursor: r.cursor,
      highlightColor: r.highlightColor,
      conditions: r.conditions,
    })),
    x: command.x,
    y: command.y,
    width: command.width,
    height: command.height,
    opacity: command.opacity,
    waitForClick: command.waitForClick,
    transition: command.transition !== 'instant' ? command.transition : undefined,
    duration: command.duration,
    action: 'show',
  };

  const hasTransition = command.transition && command.transition !== 'instant';
  const waitForClick = command.waitForClick;

  let shouldAdvance = true;
  let delay = 0;
  let callback: (() => void) | undefined;

  if (hasTransition && waitForClick) {
    shouldAdvance = false;
    delay = 0;
    callback = () => {
      setPlayerState((p) => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true } } : null);
    };
  } else if (hasTransition) {
    shouldAdvance = false;
    delay = (command.duration ?? 0.5) * 1000 + 100;
    callback = context.advance;
  } else if (waitForClick) {
    shouldAdvance = false;
    callback = () => {
      setPlayerState((p) => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true } } : null);
    };
  }

  return {
    advance: shouldAdvance,
    updates: {
      stageState: {
        ...playerState.stageState,
        imageMapOverlays: [...(playerState.stageState.imageMapOverlays || []), overlay],
      },
    },
    delay,
    callback,
  };
}

/**
 * Handles hiding/removing an image map overlay
 */
export function handleHideImageMap(
  command: HideImageMapCommand,
  context: CommandContext
): CommandResult {
  const { playerState, setPlayerState, advance } = context;

  const overlays = playerState.stageState.imageMapOverlays || [];
  const target = overlays.find((o) => o.id === command.targetCommandId);

  if (!target) {
    return { advance: true };
  }

  TweenManager.cancelForTarget(command.targetCommandId, 'imageMap');

  if (command.transition && command.transition !== 'instant') {
    const updated = overlays.map((o) =>
      o.id === command.targetCommandId
        ? {
            ...o,
            transition: command.transition,
            duration: command.duration || 0.5,
            action: 'hide' as const,
          }
        : o
    );

    const duration = (command.duration ?? 0.5) * 1000 + 100;

    return {
      advance: false,
      updates: {
        stageState: {
          ...playerState.stageState,
          imageMapOverlays: updated,
        },
      },
      delay: duration,
      callback: () => {
        setPlayerState((inner) =>
          inner
            ? {
                ...inner,
                stageState: {
                  ...inner.stageState,
                  imageMapOverlays: (inner.stageState.imageMapOverlays || []).filter(
                    (o) => o.id !== command.targetCommandId
                  ),
                },
              }
            : null
        );
        advance();
      },
    };
  } else {
    return {
      advance: true,
      updates: {
        stageState: {
          ...playerState.stageState,
          imageMapOverlays: overlays.filter((o) => o.id !== command.targetCommandId),
        },
      },
    };
  }
}
