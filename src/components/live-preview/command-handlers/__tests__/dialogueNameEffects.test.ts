/**
 * Name-box text effects: inline [tags] in a character's NAME become effect spans (never
 * shown literally — characterName is the clean text), the character's nameTextEffect rides
 * into dialogue state, and a plain character stays byte-identical to the pre-feature shape.
 */
import { describe, it, expect } from 'vitest';
import { handleDialogue } from '../dialogueHandler';
import { CommandType } from '../../../../features/scene/types';

const project: any = {
    variables: {
        v1: { id: 'v1', name: 'Nickname', type: 'string', initialValue: 'Moonbeam' },
    },
    characters: {
        plain: { id: 'plain', name: 'Yuki', color: '#f0f', layers: {}, expressions: {} },
        tagged: { id: 'tagged', name: '[wave]The Witch[/wave]', color: '#a0f', layers: {}, expressions: {} },
        nick: { id: 'nick', name: '[rainbow]{Nickname}[/rainbow]', color: '#0af', layers: {}, expressions: {} },
        styled: { id: 'styled', name: 'Rex', color: '#fa0', nameTextEffect: { type: 'shake', speed: 2, intensity: 1 }, layers: {}, expressions: {} },
    },
    ui: {},
};
const context = (): any => ({
    project,
    playerState: { variables: { v1: 'Moonbeam' }, uiState: {} },
    settings: { textSpeed: 50, musicVolume: 1, sfxVolume: 1, enableSkip: true },
    playSound: () => {},
});
const cmd = (characterId: string): any => ({ id: 'd1', type: CommandType.Dialogue, characterId, text: 'Hi' });

const dlg = (characterId: string): any => (handleDialogue(cmd(characterId), context()).updates!.uiState as any).dialogue;

describe('handleDialogue — name-box text effects', () => {
    it('a plain character has NO name-effect keys (byte-identical dialogue state)', () => {
        const d = dlg('plain');
        expect(d.characterName).toBe('Yuki');
        expect('nameEffectSpans' in d).toBe(false);
        expect('nameTextEffect' in d).toBe(false);
    });

    it('inline tags in the name become spans; the name is the CLEAN text', () => {
        const d = dlg('tagged');
        expect(d.characterName).toBe('The Witch');
        expect(d.nameEffectSpans).toEqual([{ start: 0, end: 9, effect: 'wave' }]);
    });

    it('tags wrap {Variable} tokens — spans cover the RESOLVED value', () => {
        const d = dlg('nick');
        expect(d.characterName).toBe('Moonbeam');
        expect(d.nameEffectSpans).toEqual([{ start: 0, end: 8, effect: 'rainbow' }]);
    });

    it("the character's nameTextEffect setting rides into dialogue state", () => {
        const d = dlg('styled');
        expect(d.characterName).toBe('Rex');
        expect(d.nameTextEffect).toEqual({ type: 'shake', speed: 2, intensity: 1 });
        expect('nameEffectSpans' in d).toBe(false);
    });
});
