import { PlayMusicCommand, StopMusicCommand, PlaySoundEffectCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handles playing background music with fade in/out
 * Supports looping and volume control
 */
export function handlePlayMusic(
  command: PlayMusicCommand,
  context: CommandContext
): CommandResult {
  const { assetResolver, musicAudioRef, fadeAudio, settings, playerState, setPlayerState } = context;
  
  console.log('[PlayMusic] Starting music command', { audioId: command.audioId, loop: command.loop });
  
  const url = assetResolver(command.audioId, 'audio');

  if (!url) {
    console.warn(`No audio URL found for audioId: ${command.audioId}`);
    return { advance: true };
  }

  const audio = musicAudioRef.current;
  if (!audio) {
    console.warn('[PlayMusic] Audio element not available');
    return { advance: true };
  }
  
  const currentSrcPath = audio.src ? new URL(audio.src, window.location.href).pathname : null;
  const newSrcPath = url ? new URL(url, window.location.href).pathname : null;
  const isNewTrack = currentSrcPath !== newSrcPath;
  
  console.log('[PlayMusic] Audio setup', { isNewTrack, currentSrc: audio.src, newUrl: url, paused: audio.paused });
  
  // If it's the same track and already playing, just update state and continue
  if (!isNewTrack && !audio.paused) {
    console.log('[PlayMusic] Same track already playing, updating state only');
    return {
      advance: true,
      updates: {
        musicState: {
          ...playerState.musicState,
          audioId: command.audioId,
          loop: command.loop,
          isPlaying: true,
        },
      },
    };
  }
  
  // Update state BEFORE starting playback
  const musicState = {
    audioId: command.audioId,
    loop: command.loop,
    currentTime: 0,
    isPlaying: true,
  };
  
  // Start playback asynchronously
  const startPlayback = () => {
    console.log('[PlayMusic] Starting playback');
    audio.loop = command.loop;
    audio.volume = 0; // Start at 0 for fade-in
    
    audio.play().then(() => {
      console.log('[PlayMusic] Audio playing, starting fade-in');
      const target = (typeof command.volume === 'number') ? command.volume : settings.musicVolume;
      // Fade in audio in the background
      fadeAudio(audio, target, command.fadeDuration);
    }).catch(e => {
      console.error("[PlayMusic] Music play failed:", e);
    });
  };

  if (isNewTrack) {
    audio.src = url;
    audio.load();
    audio.addEventListener('canplaythrough', startPlayback, { once: true });
    audio.addEventListener('error', (e) => {
      console.error("[PlayMusic] Music load failed:", e);
    }, { once: true });
  } else {
    startPlayback();
  }
  
  // Let the command advance immediately - music plays in background
  console.log('[PlayMusic] Command complete, advancing');
  
  return {
    advance: true,
    updates: {
      musicState,
    },
  };
}

/**
 * Handles stopping background music with fade out
 */
export function handleStopMusic(
  command: StopMusicCommand,
  context: CommandContext
): CommandResult {
  const { musicAudioRef, fadeAudio, playerState } = context;
  
  if (musicAudioRef.current) {
    fadeAudio(musicAudioRef.current, 0, command.fadeDuration, () => {
      musicAudioRef.current?.pause();
    });
  }
  
  return {
    advance: true,
    updates: {
      musicState: {
        audioId: null,
        loop: false,
        currentTime: 0,
        isPlaying: false,
      },
    },
  };
}

/**
 * Handles playing a sound effect
 * Sound effects play once and don't interrupt music
 */
export function handlePlaySoundEffect(
  command: PlaySoundEffectCommand,
  context: CommandContext
): CommandResult {
  const { playSound } = context;
  
  try {
    playSound(command.audioId, command.volume);
  } catch (e) {
    console.error('Failed to play sound effect:', e);
  }
  
  return { advance: true };
}
