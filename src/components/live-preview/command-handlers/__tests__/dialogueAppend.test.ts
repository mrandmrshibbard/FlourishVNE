/**
 * Dialogue APPEND (user request: multiple text parts in one box with timed pauses). The
 * non-append pin is the byte-identity guarantee: a plain Dialogue command's result must be
 * exactly what it was before this feature existed.
 */
import { describe, it, expect } from 'vitest';
import { handleDialogue } from '../dialogueHandler';
import { CommandType } from '../../../../features/scene/types';
import { createCommand } from '../../../../utils/commandFactory';

const project: any = {
    variables: {},
    characters: {
        yuki: { id: 'yuki', name: 'Yuki', color: '#f0f', defaultVoiceId: null, layers: {}, expressions: {} },
    },
    ui: {},
};
const baseContext = (extra: any = {}): any => ({
    project,
    playerState: { variables: {}, uiState: {} },
    settings: { textSpeed: 50, musicVolume: 1, sfxVolume: 1, enableSkip: true },
    playSound: () => {},
    ...extra,
});
const dialogueCmd = (over: any = {}): any => ({
    id: 'd1', type: CommandType.Dialogue, characterId: 'yuki', text: 'Hello', ...over,
});

describe('handleDialogue — non-append byte-identity pin', () => {
    it('a plain line produces the exact pre-feature result shape', () => {
        const r = handleDialogue(dialogueCmd(), baseContext());
        expect(r.advance).toBe(false);
        expect(r.uiStatePatch).toBeUndefined();
        expect(r.updates!.uiState).toEqual({
            isWaitingForInput: true,
            dialogue: {
                text: 'Hello',
                characterName: 'Yuki',
                characterColor: '#f0f',
                characterId: 'yuki',
                voiceAudioId: null,
                textEffect: undefined,
                textboxThemeId: null,
                textSpeed: undefined,
                timeLimit: undefined,
                timeLimitLocked: undefined,
                showTimer: undefined,
                blip: null,
            },
        });
    });
});

describe('handleDialogue — append', () => {
    it('merges into the previous text via a functional patch (smart space, reveal index, pause)', () => {
        const r = handleDialogue(dialogueCmd({ append: true, appendPause: 1.5, text: 'there' }), baseContext());
        expect(r.updates).toBeUndefined();
        const prevUi: any = { dialogue: { text: 'Hello', characterName: 'Yuki', characterColor: '#f0f', characterId: 'yuki', groupStartIndex: 3 } };
        const patch = r.uiStatePatch!(prevUi);
        const d: any = patch.dialogue;
        expect(d.text).toBe('Hello there');            // smart space
        expect(d.appendRevealFrom).toBe('Hello there'.length - 'there'.length);
        expect(d.appendPauseMs).toBe(1500);
        expect(d.groupStartIndex).toBe(3);             // carried
        expect(d.characterName).toBe('Yuki');          // head styling kept
        expect(patch.isWaitingForInput).toBe(true);
    });
    it('default pause is 0.4s; punctuation seams stay tight', () => {
        const r = handleDialogue(dialogueCmd({ append: true, text: '—t!' }), baseContext());
        const patch = r.uiStatePatch!({ dialogue: { text: 'wai—' } } as any);
        const d: any = patch.dialogue;
        expect(d.text).toBe('wai——t!');
        expect(d.appendPauseMs).toBe(400);
        expect(d.appendRevealFrom).toBe('wai—'.length);
    });
    it('append with NO previous box falls back to a fresh line (defensive)', () => {
        const r = handleDialogue(dialogueCmd({ append: true }), baseContext());
        const patch = r.uiStatePatch!({ dialogue: null } as any);
        const d: any = patch.dialogue;
        expect(d.text).toBe('Hello');
        expect(d.appendRevealFrom).toBeUndefined();
        expect(d.characterName).toBe('Yuki');
    });
});

describe('handleDialogue — typing-blip resolution', () => {
    const blip = { audioId: null, mode: 'letter' as const };
    const charWithBlip = { ...project, characters: { yuki: { ...project.characters.yuki, typingBlip: blip } } };

    it('character default rides onto the line', () => {
        const r = handleDialogue(dialogueCmd(), baseContext({ project: charWithBlip }));
        expect((r.updates!.uiState!.dialogue as any).blip).toEqual(blip);
    });
    it('a real voice clip suppresses the character default', () => {
        const r = handleDialogue(dialogueCmd({ voiceAudioId: 'v1' }), baseContext({ project: charWithBlip }));
        expect((r.updates!.uiState!.dialogue as any).blip).toBeNull();
    });
    it("an explicit per-line blip wins even when voiced; 'silent' silences", () => {
        const custom = { audioId: 'a1' as any, mode: 'word' as const };
        const r1 = handleDialogue(dialogueCmd({ voiceAudioId: 'v1', typingBlip: custom }), baseContext({ project: charWithBlip }));
        expect((r1.updates!.uiState!.dialogue as any).blip).toEqual(custom);
        const r2 = handleDialogue(dialogueCmd({ typingBlip: 'silent' }), baseContext({ project: charWithBlip }));
        expect((r2.updates!.uiState!.dialogue as any).blip).toBeNull();
    });
});

describe('factory byte-identity', () => {
    it('createCommand(Dialogue) emits none of the new keys', () => {
        const p: any = { characters: {}, backgrounds: {}, images: {}, audio: {}, videos: {}, items: {}, scenes: {}, variables: {}, uiScreens: {}, commonEvents: {} };
        const cmd = createCommand(CommandType.Dialogue as any, p) as any;
        expect(cmd).toBeTruthy();
        for (const key of ['append', 'appendPause', 'typingBlip']) {
            expect(key in cmd).toBe(false);
        }
    });
});
