/**
 * Dialogue Command Handler
 * Processes dialogue display commands with voice sync and text effects
 */

import { DialogueCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { resolveCommandCharacterId, resolvePlayerCharacterName } from '../../../utils/playerCharacter';

/**
 * Handle dialogue command
 * Shows dialogue box with character name, text, voice audio, and text effects
 */
export const handleDialogue = (
    command: DialogueCommand,
    context: CommandContext
): CommandResult => {
    const { project } = context;
    // ⟨Player's Character⟩ targeting: resolve the speaker to the player-created character, and use
    // the player-entered name (falling back to that character's name) as the name-box label.
    const resolvedCharacterId = resolveCommandCharacterId(command, project, context.playerState.variables) || command.characterId;
    const char = resolvedCharacterId ? project.characters[resolvedCharacterId] : null;
    const playerName = command.characterSource === 'player'
        ? resolvePlayerCharacterName(project, context.playerState.variables)
        : null;

    // Resolve voice audio: per-line override > character default
    const voiceAudioId = command.voiceAudioId || char?.defaultVoiceId || null;

    // Resolve text effect: per-line override > character default
    const textEffect = command.textEffect || char?.textEffect || undefined;

    // Play voice audio if specified. Use playVoice so only one voice plays at a time (no overlap with
    // the previous line) and its volume follows the Voice slider independently of SFX.
    if (voiceAudioId) {
        const voiceVol = context.settings.voiceVolume ?? 1;
        if (context.playVoice) context.playVoice(voiceAudioId, voiceVol);
        else context.playSound(voiceAudioId, voiceVol);
    }

    return {
        advance: false, // Wait for user to click
        updates: {
            uiState: {
                isWaitingForInput: true,
                dialogue: {
                    text: command.text,
                    characterName: playerName || char?.name || 'Narrator',
                    characterColor: char?.color || '#FFFFFF',
                    characterId: resolvedCharacterId || null,
                    voiceAudioId: voiceAudioId,
                    textEffect: textEffect,
                    textboxThemeId: command.textboxThemeId ?? null,
                    textSpeed: command.textSpeed,
                    // Per-line auto-advance timer (counts from typewriter completion).
                    timeLimit: command.timeLimit,
                    timeLimitLocked: command.timeLimitLocked,
                    showTimer: command.showTimer,
                }
            }
        }
    };
};
