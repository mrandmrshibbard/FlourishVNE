/**
 * Dialogue Command Handler
 * Processes dialogue display commands with voice sync and text effects
 */

import { DialogueCommand } from '../../../features/scene/types';
import { VNTypingBlip } from '../../../features/character/types';
import { CommandContext, CommandResult } from './types';
import { resolveCommandCharacterId, resolvePlayerCharacterName } from '../../../utils/playerCharacter';
import { resolveCharacterDisplayName } from '../../../utils/variableInterpolation';
import { smartJoin, DEFAULT_PAUSE_MS, processDialogueText } from '../dialogueTextCodes';

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

    // Typing sound (letter blips): per-line override > character default; 'silent' turns it off
    // for this line; a REAL voice clip suppresses the character default (Undertale games don't
    // mix blips with voice), but an explicit per-line blip still wins.
    const blip: VNTypingBlip | null =
        command.typingBlip === 'silent' ? null
        : (command.typingBlip as VNTypingBlip | undefined) ?? (voiceAudioId ? null : char?.typingBlip) ?? null;

    // Play voice audio if specified. Use playVoice so only one voice plays at a time (no overlap with
    // the previous line) and its volume follows the Voice slider independently of SFX.
    if (voiceAudioId) {
        const voiceVol = context.settings.voiceVolume ?? 1;
        if (context.playVoice) context.playVoice(voiceAudioId, voiceVol);
        else context.playSound(voiceAudioId, voiceVol);
    }

    // ── APPEND: add this text to the previous line's box instead of replacing it. Merged via a
    // FUNCTIONAL uiState patch so back-to-back parts read the LATEST accumulated text, never a
    // stale snapshot. Head styling (theme/effect/speed) is preserved; this part's own voice clip,
    // typing sound and timer apply while it types.
    if (command.append) {
        return {
            advance: false,
            uiStatePatch: (prev) => {
                const prevDialogue = prev.dialogue;
                if (!prevDialogue) {
                    // Defensive: no box to append to (resumed mid-group without a head-walk) —
                    // behave as a fresh line so nothing is lost.
                    return {
                        isWaitingForInput: true,
                        dialogue: freshDialogue(command, context, { playerName, char, resolvedCharacterId, voiceAudioId, textEffect, blip }),
                    };
                }
                return {
                    isWaitingForInput: true,
                    dialogue: {
                        ...prevDialogue,
                        text: smartJoin(prevDialogue.text, command.text),
                        // The new part starts here (a smart-joined seam space belongs to
                        // the instantly-revealed prefix).
                        appendRevealFrom: smartJoin(prevDialogue.text, command.text).length - command.text.length,
                        appendPauseMs: Math.max(0, (command.appendPause ?? DEFAULT_PAUSE_MS / 1000) * 1000),
                        // This part's own voice/blip/timer take over while it types.
                        voiceAudioId: voiceAudioId,
                        blip,
                        noPunctuationPauses: command.noPunctuationPauses,
                        timeLimit: command.timeLimit,
                        timeLimitLocked: command.timeLimitLocked,
                        showTimer: command.showTimer,
                    },
                };
            },
        };
    }

    return {
        advance: false, // Wait for user to click
        updates: {
            uiState: {
                isWaitingForInput: true,
                dialogue: freshDialogue(command, context, { playerName, char, resolvedCharacterId, voiceAudioId, textEffect, blip }),
            }
        }
    };
};

/** The uiState.dialogue payload for a NEW line (shared by the normal path and the defensive
 *  append-with-no-previous-box path). */
const freshDialogue = (
    command: DialogueCommand,
    context: CommandContext,
    r: { playerName: string | null; char: any; resolvedCharacterId: string | null; voiceAudioId: string | null; textEffect: any; blip: VNTypingBlip | null }
) => {
    // Names may hold {Variable} tokens — resolved AT SPEAK TIME (the backlog keeps
    // this snapshot: a line spoken by "???" stays "???" after the reveal). A name
    // resolving to empty falls through to 'Narrator' → the name box hides.
    // Names may ALSO hold inline [wave]…[/wave] effect tags: processed like dialogue
    // text (tags parsed from the RAW string, each run interpolated separately so a
    // nickname's length can't break span coordinates). characterName stays the CLEAN
    // text, so the backlog/history never show tags. Player-entered names are typed by
    // the player — never tag-processed.
    const vars = context.runtimeVariables ?? context.playerState.variables;
    let characterName: string;
    let nameEffectSpans: ReturnType<typeof processDialogueText>['effectSpans'] | undefined;
    if (r.playerName) {
        characterName = r.playerName;
    } else {
        const processed = processDialogueText(r.char?.name || '', s => resolveCharacterDisplayName(s, vars, context.project) || '');
        characterName = processed.cleanText;
        nameEffectSpans = processed.effectSpans.length ? processed.effectSpans : undefined;
    }
    return {
    text: command.text,
    characterName: characterName || 'Narrator',
    ...(nameEffectSpans ? { nameEffectSpans } : {}),
    // Whole-name effect: the character's Name effect setting (name-box counterpart of
    // textEffect). Absent when unset — untouched projects' dialogue state is byte-identical.
    ...(r.char?.nameTextEffect ? { nameTextEffect: r.char.nameTextEffect } : {}),
    characterColor: r.char?.color || '#FFFFFF',
    characterId: r.resolvedCharacterId || null,
    voiceAudioId: r.voiceAudioId,
    textEffect: r.textEffect,
    textboxThemeId: command.textboxThemeId ?? null,
    textSpeed: command.textSpeed,
    // Per-line auto-advance timer (counts from typewriter completion).
    timeLimit: command.timeLimit,
    timeLimitLocked: command.timeLimitLocked,
    showTimer: command.showTimer,
    blip: r.blip,
    noPunctuationPauses: command.noPunctuationPauses,
    };
};
