/**
 * {Variable} tokens in character display names (user request: "???" until the reveal,
 * nicknames chosen in-story). The fast path is the byte-identity guarantee: names without
 * braces MUST return the identical string — every existing project depends on it.
 */
import { describe, it, expect } from 'vitest';
import {
    resolveCharacterDisplayName,
    findCharacterBySpokenName,
    makeDisplayNameResolver,
    characterNameInitial,
} from '../variableInterpolation';
import { handleDialogue } from '../../components/live-preview/command-handlers/dialogueHandler';
import { CommandType } from '../../features/scene/types';

const project: any = {
    variables: {
        nick: { id: 'nick', name: 'Nickname', type: 'string' },
        title: { id: 'title', name: 'Title', type: 'string' },
    },
    characters: {
        yuki: { id: 'yuki', name: '{Nickname}', color: '#ff0000' },
        bob: { id: 'bob', name: 'Bob', color: '#00ff00' },
    },
    ui: {},
};
const vars = { nick: 'Yuki', title: 'Sir' } as Record<string, string | number | boolean>;

describe('resolveCharacterDisplayName', () => {
    it('names without braces return the IDENTICAL string (byte-identity pin)', () => {
        for (const name of ['Yuki', '???', '  spaced  ', 'Ünïcødé 💜', '', 'a}b']) {
            expect(resolveCharacterDisplayName(name, vars, project)).toBe(name);
        }
    });
    it('resolves tokens by variable name; mixes with plain text', () => {
        expect(resolveCharacterDisplayName('{Nickname}', vars, project)).toBe('Yuki');
        expect(resolveCharacterDisplayName('{Title} {Nickname}', vars, project)).toBe('Sir Yuki');
    });
    it('unknown token stays literal (matches dialogue-text behavior)', () => {
        expect(resolveCharacterDisplayName('{Ghost}', vars, project)).toBe('{Ghost}');
    });
    it('a token whose value is empty/whitespace resolves to "" (trimmed)', () => {
        expect(resolveCharacterDisplayName('{Nickname}', { nick: '' }, project)).toBe('');
        expect(resolveCharacterDisplayName('{Nickname}', { nick: '   ' }, project)).toBe('');
    });
    it('null/undefined → empty string', () => {
        expect(resolveCharacterDisplayName(null, vars, project)).toBe('');
        expect(resolveCharacterDisplayName(undefined, vars, project)).toBe('');
    });
});

describe('makeDisplayNameResolver', () => {
    it('falls back when the resolved name is empty; preserves precedence chains', () => {
        const dn = makeDisplayNameResolver(vars, project);
        expect(dn('{Nickname}', 'Unknown')).toBe('Yuki');
        expect(dn(undefined, 'Unknown')).toBe('Unknown');
        expect(dn('{Nickname}', 'Unknown')).toBe('Yuki');
        const dnEmpty = makeDisplayNameResolver({ nick: '' }, project);
        expect(dnEmpty('{Nickname}', 'Unknown')).toBe('Unknown');
    });
});

describe('findCharacterBySpokenName — forgiving script lookup', () => {
    it('matches the raw stored name (case-insensitive)', () => {
        expect(findCharacterBySpokenName('bob', project, vars)?.id).toBe('bob');
        expect(findCharacterBySpokenName('{nickname}', project, vars)?.id).toBe('yuki');
    });
    it('matches the currently-RESOLVED name', () => {
        expect(findCharacterBySpokenName('Yuki', project, vars)?.id).toBe('yuki');
        expect(findCharacterBySpokenName('yuki', project, vars)?.id).toBe('yuki');
    });
    it('raw match wins on collision', () => {
        const p2 = { ...project, characters: { ...project.characters, real: { id: 'real', name: 'Yuki' } } };
        expect(findCharacterBySpokenName('Yuki', p2, vars)?.id).toBe('real');
    });
    it('no match → undefined', () => {
        expect(findCharacterBySpokenName('Nobody', project, vars)).toBeUndefined();
    });
});

describe('characterNameInitial', () => {
    it('strips tokens; falls back to 👤', () => {
        expect(characterNameInitial('Yuki')).toBe('Y');
        expect(characterNameInitial('{Nickname}')).toBe('👤');
        expect(characterNameInitial('Sir {Nickname}')).toBe('S');
        expect(characterNameInitial('')).toBe('👤');
    });
});

describe('handleDialogue speaker resolution', () => {
    const baseContext = (extra: any = {}): any => ({
        project,
        playerState: { variables: { nick: 'Yuki' }, uiState: {} },
        settings: { textSpeed: 1, musicVolume: 1, sfxVolume: 1, enableSkip: true },
        playSound: () => {},
        ...extra,
    });
    const dialogueCmd = (characterId: string | null): any => ({
        id: 'd1', type: CommandType.Dialogue, characterId, text: 'Hello',
    });

    it('PIN: a plain-named character produces the identical characterName as before', () => {
        const r = handleDialogue(dialogueCmd('bob'), baseContext());
        expect(r.updates!.uiState!.dialogue!.characterName).toBe('Bob');
    });
    it('a tokened name resolves at speak time', () => {
        const r = handleDialogue(dialogueCmd('yuki'), baseContext());
        expect(r.updates!.uiState!.dialogue!.characterName).toBe('Yuki');
    });
    it('prefers runtimeVariables (merged view) over playerState.variables', () => {
        const r = handleDialogue(dialogueCmd('yuki'), baseContext({ runtimeVariables: { nick: 'Boss' } }));
        expect(r.updates!.uiState!.dialogue!.characterName).toBe('Boss');
    });
    it('an empty-resolving name falls through to Narrator (name box hides)', () => {
        const r = handleDialogue(dialogueCmd('yuki'), baseContext({ runtimeVariables: { nick: '' } }));
        expect(r.updates!.uiState!.dialogue!.characterName).toBe('Narrator');
    });
    it('no character → Narrator, exactly as before', () => {
        const r = handleDialogue(dialogueCmd(null), baseContext());
        expect(r.updates!.uiState!.dialogue!.characterName).toBe('Narrator');
    });
});
