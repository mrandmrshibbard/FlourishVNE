import {
  ShowTextCommand,
  HideTextCommand,
  ShowImageCommand,
  HideImageCommand,
  ShowButtonCommand,
  HideButtonCommand,
} from '../../../features/scene/types';
import { TextOverlay, ImageOverlay, ButtonOverlay } from '../types/gameState';
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
    layer: command.layer,
    parallaxDepth: command.parallaxDepth,
    text: interpolatedText,
    rawText: command.text,
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
    rotation: command.rotation,
    flipX: command.flipX,
    flipY: command.flipY,
    // `live` drives per-render re-evaluation: live conditions (visibility) AND/OR live text
    // (re-interpolating {variable} tokens). Conditions are only attached for liveConditions.
    ...((command.liveConditions || command.liveText) ? { live: true } : {}),
    ...(command.liveConditions ? { conditions: command.conditions } : {}),
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
    layer: command.layer,
    parallaxDepth: command.parallaxDepth,
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
    flipX: command.flipX,
    flipY: command.flipY,
    transition: command.transition !== 'instant' ? command.transition : undefined,
    duration: command.duration,
    fitToContent: command.fitToContent,
    action: 'show',
    ...(command.liveConditions ? { conditions: command.conditions, live: true } : {}),
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
  
  // Check show conditions - if conditions not met, skip showing the button.
  // In live mode the button is always created and re-evaluated each render instead.
  if (!command.liveConditions && command.showConditions && command.showConditions.length > 0) {
    const conditionsMet = evaluateConditions(command.showConditions, playerState.variables);
    if (!conditionsMet) {
      // Conditions not met - don't show the button, just advance
      return { advance: true };
    }
  }

  const buttonOverlay: ButtonOverlay = {
    id: command.id,
    layer: command.layer,
    parallaxDepth: command.parallaxDepth,
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
    textAlign: command.textAlign || 'center',
    paddingX: command.paddingX ?? 0,
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
    rotation: command.rotation,
    flipX: command.flipX,
    flipY: command.flipY,
    transition: command.transition !== 'instant' ? command.transition : undefined,
    duration: command.duration || 0.3,
    action: 'show',
    ...(command.liveConditions ? { conditions: command.conditions, live: true } : {}),
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
