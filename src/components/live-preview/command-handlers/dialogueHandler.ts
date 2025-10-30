/**
 * Dialogue Command Handler
 * Processes dialogue display commands
 */

import { DialogueCommand } from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';

/**
 * Handle dialogue command
 * Shows dialogue box with character name and text
 */
export const handleDialogue = (
    command: DialogueCommand,
    context: CommandContext
): CommandResult => {
    const { project, playerState } = context;
    const char = command.characterId ? project.characters[command.characterId] : null;
    
    const dialogueEntry = {
        text: command.text,
        characterName: char?.name || 'Narrator',
        characterColor: char?.color || '#FFFFFF',
    };

    return {
        advance: false, // Wait for user to click
        updates: {
            uiState: {
                isWaitingForInput: true,
                dialogue: {
                    ...dialogueEntry,
                    characterId: command.characterId || null
                }
            },
            dialogueHistory: [
                ...playerState.dialogueHistory,
                {
                    ...dialogueEntry,
                    timestamp: Date.now()
                }
            ]
        }
    };
};
