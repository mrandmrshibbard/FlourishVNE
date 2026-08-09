/**
 * The token guard is what stops a translated build from rendering `[sacudir]` as literal brackets.
 *
 * The block that matters most is "ordinary brackets are NOT tokens": the engine promises unknown
 * brackets pass through as text, so a guard that treats every `[...]` as a code would refuse
 * perfectly good translations of ordinary prose — a false alarm that teaches authors to ignore the
 * report, which is worse than no report.
 */
import { describe, it, expect } from 'vitest';
import {
    extractTokens, describeTokens, compareTokens, explainMismatch, protectTokens, restoreTokens,
} from '../tokenGuard';

const raws = (text: string) => extractTokens(text).map(t => t.raw);

describe('extractTokens', () => {
    it('finds variables and engine codes, in the order they appear', () => {
        expect(raws('I said [shake]NO[/shake], {Nickname}.[pause 0.5] Really.'))
            .toEqual(['[shake]', '[/shake]', '{Nickname}', '[pause 0.5]']);
    });

    it('finds every recognised effect tag', () => {
        for (const tag of ['shake', 'wave', 'rainbow', 'glitch', 'pulse', 'fade-in', 'bounce', 'typewriter-bounce']) {
            expect(raws(`a [${tag}]b[/${tag}] c`)).toEqual([`[${tag}]`, `[/${tag}]`]);
        }
    });

    it('reads bare [pause] and [shake 2] intensity', () => {
        expect(raws('a[pause]b[shake 2]c[/shake]')).toEqual(['[pause]', '[shake 2]', '[/shake]']);
    });

    it('🔴 leaves ORDINARY brackets alone — the engine renders them as text', () => {
        // If these counted as tokens, translating the prose around them would be refused.
        expect(raws('He winked [wink] and left [Note to self] at [3] o’clock.')).toEqual([]);
        expect(compareTokens('See [the sign]', 'Mira [el letrero]').ok).toBe(true);
    });

    it('returns nothing for plain text or empty input', () => {
        expect(raws('Just a normal line.')).toEqual([]);
        expect(extractTokens('')).toEqual([]);
        expect(extractTokens(null as any)).toEqual([]);
    });
});

describe('compareTokens', () => {
    it('accepts a translation that keeps every token', () => {
        expect(compareTokens('I said [shake]NO[/shake], {Nickname}.', 'Dije [shake]NO[/shake], {Nickname}.').ok).toBe(true);
    });

    it('🔴 accepts tokens that MOVED — translation reorders words', () => {
        expect(compareTokens('{Nickname}, I said [shake]NO[/shake].', '[shake]NO[/shake] es lo que dije, {Nickname}.').ok).toBe(true);
    });

    it('catches a translated code (the failure this exists for)', () => {
        const r = compareTokens('I said [shake]NO[/shake].', 'Dije [sacudir]NO[/sacudir].');
        expect(r.ok).toBe(false);
        expect(r.missing).toEqual(['[shake]', '[/shake]']);
    });

    it('catches a dropped variable', () => {
        const r = compareTokens('Hello {Nickname}!', '¡Hola!');
        expect(r.ok).toBe(false);
        expect(r.missing).toEqual(['{Nickname}']);
    });

    it('counts duplicates — dropping one of two is still a break', () => {
        const r = compareTokens('{A} and {A}', 'solo {A}');
        expect(r.ok).toBe(false);
        expect(r.missing).toEqual(['{A}']);
    });

    it('catches an unbalanced tag (closing tag lost)', () => {
        const r = compareTokens('[shake]NO[/shake]', '[shake]NO');
        expect(r.ok).toBe(false);
        expect(r.missing).toEqual(['[/shake]']);
    });

    it('catches an invented code', () => {
        const r = compareTokens('plain', '[shake]invented[/shake]');
        expect(r.ok).toBe(false);
        expect(r.added).toEqual(['[shake]', '[/shake]']);
    });

    it('flags a changed pause or intensity rather than letting pacing drift silently', () => {
        expect(compareTokens('a[pause 0.5]b', 'a[pause 2]b').ok).toBe(false);
        expect(compareTokens('[shake 2]x[/shake]', '[shake 5]x[/shake]').ok).toBe(false);
    });

    it('tolerates tag capitalisation, which the engine also matches case-insensitively', () => {
        expect(compareTokens('[shake]x[/shake]', '[SHAKE]x[/Shake]').ok).toBe(true);
    });

    it('🔴 does NOT tolerate a changed variable case — lookup is by exact name', () => {
        expect(compareTokens('{Nickname}', '{nickname}').ok).toBe(false);
    });
});

describe('describeTokens — the sheet column translators actually read', () => {
    it('says nothing for an ordinary line, so the warnings that appear carry weight', () => {
        expect(describeTokens('Just a normal line.')).toBe('');
    });

    it('names the variables to keep, in plain language', () => {
        expect(describeTokens('Hi {Nickname}!')).toBe('Keep {Nickname} exactly — the game fills this in.');
    });

    it('names the codes to keep', () => {
        expect(describeTokens('[shake]NO[/shake]'))
            .toBe('Keep [shake] [/shake] exactly — these are a text effect, not words.');
    });

    it('covers both, without repeating a token that appears twice', () => {
        const note = describeTokens('{A} then {A} and [pause]');
        expect(note).toContain('Keep {A} exactly');
        expect(note).toContain('[pause]');
        expect(note.match(/\{A\}/g)).toHaveLength(1);
    });
});

describe('explainMismatch', () => {
    it('is empty when nothing is wrong', () => {
        expect(explainMismatch(compareTokens('a', 'b'))).toBe('');
    });

    it('tells the author what to do, not just what failed', () => {
        const msg = explainMismatch(compareTokens('Hi {Nickname}', 'Hola'));
        expect(msg).toContain('{Nickname}');
        expect(msg).toContain('exactly as written');
    });
});

describe('🔴 protecting tokens from a machine translator', () => {
    const line = 'I said [shake]NO[/shake], {Nickname}.[pause 0.5]';

    it('hides every token behind a marker before the model sees it', () => {
        const { text, tokens } = protectTokens(line);
        expect(text).toBe('I said %%0%%NO%%1%%, %%2%%.%%3%%');
        expect(tokens).toEqual(['[shake]', '[/shake]', '{Nickname}', '[pause 0.5]']);
        // Nothing translatable-looking is left for the model to mangle.
        expect(text).not.toContain('shake');
        expect(text).not.toContain('Nickname');
    });

    it('leaves an ordinary line completely alone', () => {
        expect(protectTokens('Just a normal line.')).toEqual({ text: 'Just a normal line.', tokens: [] });
    });

    it('round-trips exactly when the model behaves', () => {
        const { text, tokens } = protectTokens(line);
        const translated = text.replace('I said', 'Dije').replace('NO', 'NO');
        const restored = restoreTokens(translated, tokens);
        expect(restored.ok).toBe(true);
        expect(restored.text).toBe('Dije [shake]NO[/shake], {Nickname}.[pause 0.5]');
    });

    it('🔴 accepts markers that MOVED — translation reorders words', () => {
        const { tokens } = protectTokens('{Nickname}, hello');
        const restored = restoreTokens('hola, %%0%%', tokens);
        expect(restored.ok).toBe(true);
        expect(restored.text).toBe('hola, {Nickname}');
    });

    it('🔴 REJECTS a result that lost a marker, rather than saving a broken line', () => {
        const { tokens } = protectTokens(line);
        const restored = restoreTokens('Dije NO, %%2%%.%%3%%', tokens);   // %%0%% and %%1%% gone
        expect(restored.ok).toBe(false);
        expect(restored.reason).toContain('[shake]');
    });

    it('rejects a result that duplicated a marker', () => {
        const { tokens } = protectTokens('Hola {Nickname}');
        expect(restoreTokens('%%0%% hola %%0%%', tokens).ok).toBe(false);
    });

    it('rejects a result that invented a marker we never sent', () => {
        const { tokens } = protectTokens('Hola {Nickname}');
        expect(restoreTokens('%%0%% y %%7%%', tokens).ok).toBe(false);
    });

    it('rejects a model that mangled the marker itself', () => {
        const { tokens } = protectTokens('Hola {Nickname}');
        // Models do things like this: spacing it out, or translating the digits away.
        expect(restoreTokens('Hola %% 0 %%', tokens).ok).toBe(false);
        expect(restoreTokens('Hola', tokens).ok).toBe(false);
    });

    it('needs no markers back when the line had no tokens', () => {
        expect(restoreTokens('Cualquier cosa', [])).toEqual({ text: 'Cualquier cosa', ok: true });
    });

    it('handles the same token appearing twice', () => {
        const { text, tokens } = protectTokens('{A} and {A}');
        expect(text).toBe('%%0%% and %%1%%');
        expect(restoreTokens('%%0%% y %%1%%', tokens).text).toBe('{A} y {A}');
    });

    it('🔴 whatever survives restore always matches the source token-for-token', () => {
        // The property that matters: a result the guard accepts can never fail compareTokens,
        // which is what the rest of the system uses to decide a translation is safe.
        const { text, tokens } = protectTokens(line);
        const restored = restoreTokens(text.replace('I said', 'Dije'), tokens);
        expect(restored.ok).toBe(true);
        expect(compareTokens(line, restored.text).ok).toBe(true);
    });
});
