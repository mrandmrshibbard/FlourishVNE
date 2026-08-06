import { PlayMusicCommand, StopMusicCommand, PlaySoundEffectCommand, StopSoundEffectCommand, VNAudioAdjust } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { resolveAudioAdjust, applyAudioAdjust } from '../../../utils/audioAdjust';

/** The music channel honors speed/keep-pitch ONLY — reverse is refused there (owner decision:
 *  a looping reversed music file would decode megabytes of PCM; SFX/voice get reverse instead). */
export const musicChannelAdjust = (adjust: VNAudioAdjust | null): VNAudioAdjust | null => {
    if (!adjust || adjust.speed === undefined) return null;
    const out: VNAudioAdjust = { speed: adjust.speed };
    if (adjust.keepPitch !== undefined) out.keepPitch = adjust.keepPitch;
    return out;
};

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

  // Per-use over asset-default shaping; music honors speed/keep-pitch only. Applied on EVERY
  // branch (even same-track) so re-running the command with a new speed takes effect.
  const adjust = musicChannelAdjust(resolveAudioAdjust(command.audioAdjust, (context.project.audio as any)?.[command.audioId]?.audioAdjust));

  console.log('[PlayMusic] Audio setup', { isNewTrack, currentSrc: audio.src, newUrl: url, paused: audio.paused });

  // If it's the same track and already playing, just update state and continue
  if (!isNewTrack && !audio.paused) {
    console.log('[PlayMusic] Same track already playing, updating state only');
    applyAudioAdjust(audio, adjust);
    return {
      advance: true,
      updates: {
        musicState: {
          ...playerState.musicState,
          audioId: command.audioId,
          loop: command.loop,
          isPlaying: true,
          volume: command.volume,
          ...(adjust ? { adjust } : { adjust: undefined }),
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
    volume: command.volume,
    ...(adjust ? { adjust } : {}),
  };
  
  // Start playback asynchronously
  const startPlayback = () => {
    // The load may have been superseded while buffering (e.g. a Show Screen's own music took
    // the channel right after this command) — never act on an element holding a different track.
    try {
      if (new URL(audio.src, window.location.href).href !== new URL(url, window.location.href).href) return;
    } catch { if (audio.src !== url) return; }
    console.log('[PlayMusic] Starting playback');
    audio.loop = command.loop;
    applyAudioAdjust(audio, adjust);   // same-track path never went through src=/load
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
    applyAudioAdjust(audio, adjust);   // after load() — load snaps rate back to the default
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
    // Per-use shaping rides along; playSound merges the asset default underneath it.
    playSound(command.audioId, command.volume, command.loop, command.audioAdjust ?? null);
  } catch (e) {
    console.error('Failed to play sound effect:', e);
  }

  return { advance: true };
}

/**
 * Handles stopping sound effects.
 * - No target → stops all currently playing sound effects.
 * - A target audioId → stops only instances of that sound.
 * - fadeDuration (seconds) > 0 → fades the matched sounds out instead of cutting them.
 */
export function handleStopSoundEffect(
  command: StopSoundEffectCommand,
  context: CommandContext
): CommandResult {
  const { stopSfx } = context;

  console.log('[StopSoundEffect] Stopping sound effects', { audioId: command.audioId || '(all)', fadeDuration: command.fadeDuration || 0 });
  stopSfx(command.audioId || null, command.fadeDuration);

  return { advance: true };
}
