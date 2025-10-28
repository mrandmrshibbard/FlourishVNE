import React from 'react';
import { SetBackgroundCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles background changes with transitions
 * Supports various transition effects: cross-fade, fade, dissolve, slide, iris, wipe
 */
export async function handleSetBackground(
  command: SetBackgroundCommand,
  context: CommandContext
): Promise<CommandResult> {
  const { assetResolver, getAssetMetadata, setPlayerState, playerState, advance } = context;
  
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
          backgroundUrl: newUrl,
          backgroundIsVideo: isVideo,
          backgroundLoop: loop,
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
                backgroundUrl: newUrl,
                backgroundIsVideo: isVideo,
                backgroundLoop: loop,
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
            backgroundUrl: newUrl,
            backgroundIsVideo: isVideo,
            backgroundLoop: loop,
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
