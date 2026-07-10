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
import { PhoneMessage, PhoneCameraRollEntry } from '../types/gameState';

/** Base phone slice so handlers never drop fields they don't touch (callLog, unread, etc.). */
const basePhone = (context: CommandContext) => ({
    open: false,
    messages: [],
    ...(context.playerState.uiState.phone || {}),
});

/** Which Messages-inbox thread a message belongs to. Character messages thread by contact tag
 *  (or sender for old saves); untagged player messages fall into the legacy '' bucket.
 *  '__misc__' is the view-layer sentinel for opening that bucket — normalize it back to ''. */
export const phoneThreadKey = (m: PhoneMessage): string => {
    const k = (m.contactId as string) ?? (m.senderId !== 'player' ? (m.senderId as string) : '');
    return k === '__misc__' ? '' : k;
};

/** How many messages a thread holds — the denominator for the inbox unread pills. */
export const countPhoneThread = (messages: PhoneMessage[], key: string): number =>
    messages.filter(m => phoneThreadKey(m) === key).length;

/** Collect a photo message into the Gallery's camera roll (de-duped by message id). */
export const collectToCameraRoll = (roll: PhoneCameraRollEntry[] | undefined, msg: PhoneMessage): PhoneCameraRollEntry[] | undefined => {
    if (!msg.image) return roll;
    const cur = roll || [];
    if (cur.some(e => e.id === msg.id)) return roll;
    return [...cur, { id: msg.id, image: msg.image, senderId: msg.senderId, contactId: msg.contactId, caption: msg.text || undefined, order: cur.length }];
};

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
        ...(command.image ? { image: command.image } : {}),
        // Tag the conversation thread so the Messages inbox can group: character messages thread
        // by sender; player messages stick to the thread that's open (else the legacy bucket).
        ...(command.senderId !== 'player'
            ? { contactId: command.senderId }
            : ((prev as any).activeContactId && (prev as any).activeContactId !== '__misc__' ? { contactId: (prev as any).activeContactId } : {})),
    };
    const hasChoices = !!(command.choices && command.choices.length > 0);
    const nextMessages = [...messages, msg];
    // The phone opens focused on this thread — count it as read for the inbox unread pill.
    const threadKey = phoneThreadKey(msg);
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
                    messages: nextMessages,
                    cameraRoll: collectToCameraRoll((prev as any).cameraRoll, msg),
                    threadLastRead: { ...((prev as any).threadLastRead || {}), [threadKey]: countPhoneThread(nextMessages, threadKey) },
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
