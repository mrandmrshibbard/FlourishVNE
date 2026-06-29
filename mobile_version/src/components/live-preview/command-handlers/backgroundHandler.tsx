import React from 'react';
import { SetBackgroundCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { resolveVideoTrim } from '../../../utils/videoTrim';

/**
 * Handles background changes with transitions
 * Supports various transition effects: cross-fade, fade, dissolve, slide, iris, wipe
 * If `backgroundColor` is set, renders a solid color instead of an image.
 */
export async function handleSetBackground(
  command: SetBackgroundCommand,
  context: CommandContext
): Promise<CommandResult> {
  const { assetResolver, getAssetMetadata, setPlayerState, playerState, advance, project } = context;

  // Per-use trim wins; otherwise fall back to the asset's own DEFAULT trim (set in Asset Manager).
  const bgAssetRec: any = command.backgroundId
    ? (project.backgrounds?.[command.backgroundId] || project.images?.[command.backgroundId] || project.videos?.[command.backgroundId])
    : undefined;
  const bgTrim = resolveVideoTrim(command, bgAssetRec);

  // Parallax depth + stacking layer for the background (additive-optional; carried onto
  // stageState at every commit site so the renderer can drift/order the backdrop).
  const bgFx = { backgroundParallaxDepth: command.parallaxDepth, backgroundLayer: command.layer, backgroundTrimStart: bgTrim.start, backgroundTrimEnd: bgTrim.end };

  // Live (reactive) background: register/replace a conditional layer instead of
  // committing a single background. The renderer picks the last layer whose conditions
  // match (over the base background). Live backgrounds swap instantly (no transition).
  if (command.liveConditions) {
    const url = command.backgroundColor ? null : assetResolver(command.backgroundId, 'image');
    const meta = command.backgroundColor ? { isVideo: false, loop: false } : getAssetMetadata(command.backgroundId, 'image');
    const layer = {
      commandId: command.id,
      conditions: command.conditions,
      url: url || null,
      color: command.backgroundColor,
      isVideo: meta.isVideo,
      loop: meta.loop,
      trimStart: bgTrim.start,
      trimEnd: bgTrim.end,
      parallaxDepth: command.parallaxDepth,
      layer: command.layer,
    };
    const existing = playerState.stageState.backgroundLayers || [];
    return {
      advance: true,
      updates: {
        stageState: {
          ...playerState.stageState,
          backgroundLayers: [...existing.filter(l => l.commandId !== command.id), layer],
        },
      },
    };
  }

  // Stacked background: ADD this backdrop as its own persistent plane (keyed by command id)
  // at its layer/parallaxDepth instead of replacing the base background. Enables multi-plane
  // parallax scrolling. Stacked planes swap instantly (transitions apply to the base bg).
  if (command.stack) {
    const url = command.backgroundColor ? null : assetResolver(command.backgroundId, 'image');
    const meta = command.backgroundColor ? { isVideo: false, loop: false } : getAssetMetadata(command.backgroundId, 'image');
    const plane = {
      commandId: command.id,
      url: url || null,
      color: command.backgroundColor,
      isVideo: meta.isVideo,
      loop: meta.loop,
      trimStart: bgTrim.start,
      trimEnd: bgTrim.end,
      parallaxDepth: command.parallaxDepth,
      layer: command.layer,
      transition: command.transition,
      duration: command.duration,
    };
    const existing = playerState.stageState.backgroundStack || [];
    return {
      advance: true,
      updates: {
        stageState: {
          ...playerState.stageState,
          backgroundStack: [...existing.filter(p => p.commandId !== command.id), plane],
        },
      },
    };
  }

  // If backgroundColor is set, use that instead of resolving an image
  if (command.backgroundColor) {
    const duration = command.duration ?? 1;

    // For instant transitions, update immediately
    if (command.transition === 'instant' || !command.transition) {
      return {
        advance: true,
        updates: {
          stageState: {
            ...playerState.stageState,
            ...bgFx,
            backgroundUrl: null,
            backgroundIsVideo: false,
            backgroundColor: command.backgroundColor,
          },
        },
      };
    }

    // For transitions with color background, use visual overlays
    setPlayerState((p) => {
      if (!p) return null;
      return { ...p, uiState: { ...p.uiState, isTransitioning: true } };
    });

    // Fade: two-phase — fade to black, then switch color and fade from black
    if (command.transition === 'fade') {
      const phase1 = (
        <div
          key={Date.now()}
          className="absolute inset-0 z-0 bg-black"
          style={{ animation: `dissolve-in ${duration / 2}s forwards` }}
        />
      );
      setPlayerState((p) => p ? { ...p, uiState: { ...p.uiState, transitionElement: phase1 } } : null);

      setTimeout(() => {
        setPlayerState((p) => {
          if (!p) return null;
          const phase2 = (
            <div
              key={Date.now() + 1}
              className="absolute inset-0 z-0 bg-black"
              style={{ animation: `fade-out ${duration / 2}s forwards` }}
            />
          );
          return {
            ...p,
            stageState: {
              ...p.stageState,
              ...bgFx,
              backgroundUrl: null,
              backgroundIsVideo: false,
              backgroundColor: command.backgroundColor,
            },
            uiState: { ...p.uiState, transitionElement: phase2 },
          };
        });
      }, duration * 500);

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          setPlayerState((p) =>
            p ? { ...p, uiState: { ...p.uiState, isTransitioning: false, transitionElement: null } } : null
          );
          resolve();
        }, duration * 1000 + 100);
      });

      advance();
      return { advance: false };
    }

    let transitionElement = null;

    if (command.transition === 'cross-fade') {
      transitionElement = (
        <div
          key={Date.now()}
          className="absolute inset-0 z-0"
          style={{
            backgroundColor: command.backgroundColor,
            animation: `dissolve-in ${duration}s ease-in-out forwards`,
          }}
        />
      );
    } else if (command.transition === 'dissolve') {
      transitionElement = (
        <div
          key={Date.now()}
          className="absolute inset-0 z-0"
          style={{
            backgroundColor: command.backgroundColor,
            animation: `dissolve-in ${duration}s forwards`,
          }}
        />
      );
    } else if (command.transition === 'slide') {
      transitionElement = (
        <div
          key={Date.now()}
          className="absolute inset-0 z-0"
          style={{
            backgroundColor: command.backgroundColor,
            animation: `slide-in-right ${duration}s forwards`,
          }}
        />
      );
    } else if (command.transition === 'iris-in') {
      transitionElement = (
        <div
          key={Date.now()}
          className="absolute inset-0 z-0"
          style={{
            backgroundColor: command.backgroundColor,
            animation: `iris-in ${duration}s forwards`,
          }}
        />
      );
    } else if (command.transition === 'wipe-right') {
      transitionElement = (
        <div
          key={Date.now()}
          className="absolute inset-0 z-0"
          style={{
            backgroundColor: command.backgroundColor,
            animation: `wipe-right ${duration}s forwards`,
          }}
        />
      );
    } else {
      // Default to fade for unknown transitions
      transitionElement = (
        <div
          key={Date.now()}
          className="absolute inset-0 z-0 bg-black"
          style={{ animation: `dissolve-in ${duration / 2}s forwards` }}
        />
      );
    }

    setPlayerState((p) => {
      if (!p) return null;
      return {
        ...p,
        uiState: { ...p.uiState, transitionElement },
      };
    });

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        setPlayerState((p) => {
          if (!p) return null;
          return {
            ...p,
            stageState: {
              ...p.stageState,
              ...bgFx,
              backgroundUrl: null,
              backgroundIsVideo: false,
              backgroundColor: command.backgroundColor,
            },
            uiState: { ...p.uiState, isTransitioning: false, transitionElement: null },
          };
        });
        resolve();
      }, duration * 1000 + 100);
    });

    advance();
    return { advance: false };
  }

  // Original image/video background logic
  const newUrl = assetResolver(command.backgroundId, 'image');
  const { isVideo, loop } = getAssetMetadata(command.backgroundId, 'image');
  const duration = command.duration ?? 1;

  if (!newUrl) {
    console.warn(`Background not found: ${command.backgroundId}`);
    return { advance: true };
  }

  // For instant transitions, update immediately
  if (command.transition === 'instant' || !command.transition) {
    return {
      advance: true,
      updates: {
        stageState: {
          ...playerState.stageState,
          ...bgFx,
          backgroundUrl: newUrl,
          backgroundIsVideo: isVideo,
          backgroundLoop: command.loop ?? loop,
        },
      },
    };
  }

  // For transitions, we need to preload media first, then start transition
  // Preload the media to prevent it flashing before the animation starts
  const preloadMedia = () =>
    new Promise<void>((resolve, reject) => {
      if (isVideo) {
        const video = document.createElement('video');
        video.src = newUrl;
        video.preload = 'auto';
        video.onerror = () =>
          reject(new Error(`Failed to load background video: ${newUrl}`));
        video.onloadeddata = () => resolve();
      } else {
        const img = new Image();
        img.src = newUrl;
        img.onerror = () =>
          reject(new Error(`Failed to load background image: ${newUrl}`));
        img.onload = () => resolve();
      }
    });

  try {
    await preloadMedia();
  } catch (error) {
    console.error(error);
    return { advance: true }; // Skip transition on error
  }

  // Media is loaded, now we can start the transition
  let transitionElement: React.ReactNode = null;

  // Create appropriate transition element based on media type
  const MediaElement = isVideo ? 'video' : 'img';
  const mediaProps: any = isVideo
    ? { autoPlay: true, muted: true, loop, playsInline: true }
    : { alt: '' };

  if (command.transition === 'cross-fade') {
        // Start with opacity 0
        transitionElement = (
          <MediaElement
            key={Date.now()}
            src={newUrl}
            {...mediaProps}
            className="absolute inset-0 w-full h-full object-cover z-0"
            style={{ opacity: 0, transition: `opacity ${duration}s ease-in-out` }}
          />
        );
        // After a short delay, update to opacity 1 to trigger the CSS transition
        setTimeout(() => {
          setPlayerState((p) => {
            if (!p) return null;
            const el = (
              <MediaElement
                key={Date.now()}
                src={newUrl}
                {...mediaProps}
                className="absolute inset-0 w-full h-full object-cover z-0"
                style={{ opacity: 1, transition: `opacity ${duration}s ease-in-out` }}
              />
            );
            return { ...p, uiState: { ...p.uiState, transitionElement: el } };
          });
        }, 50);
      } else if (command.transition === 'fade') {
        // Fade to black, then from black
        transitionElement = (
          <div
            key={Date.now()}
            className="absolute inset-0 z-0 bg-black"
            style={{ animation: `dissolve-in ${duration / 2}s forwards` }}
          />
        );
        setTimeout(() => {
          setPlayerState((p) => {
            if (!p) return null;
            const el = (
              <div
                key={Date.now() + 1}
                className="absolute inset-0 z-0 bg-black"
                style={{ animation: `fade-out ${duration / 2}s forwards` }}
              />
            );
            return {
              ...p,
              stageState: {
                ...p.stageState,
                ...bgFx,
                backgroundUrl: newUrl,
                backgroundIsVideo: isVideo,
                backgroundLoop: command.loop ?? loop,
              },
              uiState: { ...p.uiState, transitionElement: el },
            };
          });
        }, duration * 500);
      } else {
        // Other wipe/slide transitions
        let transitionClass = '';
        switch (command.transition) {
          case 'dissolve':
            transitionClass = 'transition-dissolve';
            break;
          case 'slide':
            transitionClass = 'transition-slide-in-right';
            break;
          case 'iris-in':
            transitionClass = 'transition-iris-in';
            break;
          case 'wipe-right':
            transitionClass = 'transition-wipe-right';
            break;
        }
        transitionElement = (
          <MediaElement
            key={Date.now()}
            src={newUrl}
            {...mediaProps}
            className={`absolute inset-0 w-full h-full object-cover z-0 transition-base ${transitionClass}`}
            style={{ animationDuration: `${duration}s` }}
          />
        );
      }

  // Set the initial transition state
  setPlayerState((p) =>
    p
      ? { ...p, uiState: { ...p.uiState, isTransitioning: true, transitionElement } }
      : null
  );

  // Wait for the transition animation to complete
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      setPlayerState((p) => {
        if (!p) return null;
        return {
          ...p,
          stageState: {
            ...p.stageState,
            ...bgFx,
            backgroundUrl: newUrl,
            backgroundIsVideo: isVideo,
            backgroundLoop: command.loop ?? loop,
          },
          uiState: { ...p.uiState, isTransitioning: false, transitionElement: null },
        };
      });
      resolve();
    }, duration * 1000 + 100); // Add a small buffer
  });

  // Advance to next command after transition completes
  advance();
  
  return { advance: false }; // We already called advance(), so don't auto-advance
}
