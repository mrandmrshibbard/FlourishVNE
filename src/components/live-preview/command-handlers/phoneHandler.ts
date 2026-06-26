/**
 * Phone Command Handlers
 * Drive the in-game cellphone: open/close the shell, append chat messages (with optional reply
 * choices), and clear the conversation. Phone state lives in playerState.uiState.phone so it
 * persists across save/load. Mirrors the dialogue handler's "return updates.uiState" style; the
 * dispatch shallow-merges uiState, so we only touch the `phone` slice.
 */

import {
    ShowPhoneCommand,
    HidePhoneCommand,
    ShowPhoneTextCommand,
    HidePhoneTextCommand,
} from '../../../features/scene/types';
import { CommandContext, CommandResult } from './types';
import { PhoneMessage } from '../types/gameState';

/** Base phone slice so handlers never drop fields they don't touch (callLog, unread, etc.). */
const basePhone = (context: CommandContext) => ({
    open: false,
    messages: [],
    ...(context.playerState.uiState.phone || {}),
});

export const handleShowPhone = (_command: ShowPhoneCommand, context: CommandContext): CommandResult => {
    return {
        advance: true,
        updates: { uiState: { phone: { ...basePhone(context), open: true, view: 'home', notification: null } } },
    };
};

export const handleHidePhone = (_command: HidePhoneCommand, context: CommandContext): CommandResult => {
    return {
        advance: true,
        updates: { uiState: { phone: { ...basePhone(context), open: false, waiting: false, pendingChoices: undefined, notification: null } } },
    };
};

export const handleShowPhoneText = (command: ShowPhoneTextCommand, context: CommandContext): CommandResult => {
    const prev = basePhone(context);
    const messages = prev.messages;
    const msg: PhoneMessage = {
        id: `${command.id}-${messages.length}`,
        senderId: command.senderId,
        text: command.text,
        ...(command.portrait ? { portrait: command.portrait } : {}),
        // Tag the conversation thread (the character) so the Contacts app can group by contact.
        ...(command.senderId !== 'player' ? { contactId: command.senderId } : {}),
    };
    const hasChoices = !!(command.choices && command.choices.length > 0);
    return {
        // When the message offers replies, pause the scene — the in-phone reply buttons resume it.
        advance: !hasChoices,
        updates: {
            uiState: {
                phone: {
                    ...prev,
                    open: true,
                    view: 'chat',
                    // Focus this character's thread (so the chat shows just their conversation).
                    activeContactId: command.senderId !== 'player' ? command.senderId : (prev as any).activeContactId,
                    messages: [...messages, msg],
                    waiting: hasChoices,
                    pendingChoices: hasChoices ? command.choices : undefined,
                    typing: null,
                },
            },
        },
    };
};

export const handleHidePhoneText = (_command: HidePhoneTextCommand, context: CommandContext): CommandResult => {
    return {
        advance: true,
        updates: { uiState: { phone: { ...basePhone(context), messages: [], waiting: false, pendingChoices: undefined, typing: null } } },
    };
};
