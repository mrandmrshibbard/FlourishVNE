/**
 * Dialogue Command Handler
 * Processes dialogue display commands with voice sync and text effects
 */

import { DialogueCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handle dialogue command
 * Shows dialogue box with character name, text, voice audio, and text effects
 */
export const handleDialogue = (
    command: DialogueCommand,
    context: CommandContext
): CommandResult => {
    const { project } = context;
    const char = command.characterId ? project.characters[command.characterId] : null;

    // Resolve voice audio: per-line override > character default
    const voiceAudioId = command.voiceAudioId || char?.defaultVoiceId || null;

    // Resolve text effect: per-line override > character default
    const textEffect = command.textEffect || char?.textEffect || undefined;

    // Play voice audio if specified
    if (voiceAudioId) {
        context.playSound(voiceAudioId, context.settings.sfxVolume);
    }

    return {
        advance: false, // Wait for user to click
        updates: {
            uiState: {
                isWaitingForInput: true,
                dialogue: {
                    text: command.text,
                    characterName: char?.name || 'Narrator',
                    characterColor: char?.color || '#FFFFFF',
                    characterId: command.characterId || null,
                    voiceAudioId: voiceAudioId,
                    textEffect: textEffect,
                }
            }
        }
    };
};
