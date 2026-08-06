/**
 * Inline [pause] codes + append-group helpers. The passthrough identity is the byte-identity
 * guarantee: text without codes must come through completely untouched.
 */
import { describe, it, expect } from 'vitest';
import {
    parseDialogueTextCodes,
    stripDialogueTextCodes,
    processDialogueText,
    smartJoin,
    walkToAppendGroupHead,
    punctuationPauses,
    DEFAULT_PAUSE_MS,
} from '../dialogueTextCodes';
import { CommandType } from '../../../features/scene/types';

describe('parseDialogueTextCodes', () => {
    it('text without codes passes through untouched (identity pin)', () => {
        for (const text of ['Hello there.', '', 'Braces {Var} stay', 'a [wink] b', '[]', '[pausee]']) {
            const { segments, pausesMs } = parseDialogueTextCodes(text);
            expect(segments).toEqual([text]);
            expect(pausesMs).toEqual([]);
        }
    });
    it('parses [pause 0.5] into segments + ms', () => {
        const { segments, pausesMs } = parseDialogueTextCodes('Wait...[pause 0.5] what?');
        expect(segments).toEqual(['Wait...', ' what?']);
        expect(pausesMs).toEqual([500]);
    });
    it('bare [pause] uses the default', () => {
        expect(parseDialogueTextCodes('a[pause]b').pausesMs).toEqual([DEFAULT_PAUSE_MS]);
    });
    it('unknown [tokens] stay verbatim in the text', () => {
        const { segments } = parseDialogueTextCodes('a [wink] b[pause 1]c [foo 2]');
        expect(segments).toEqual(['a [wink] b', 'c [foo 2]']);
    });
    it('codes at start/end/adjacent', () => {
        const { segments, pausesMs } = parseDialogueTextCodes('[pause 1]start[pause 2][pause 3]end[pause 4]');
        expect(segments).toEqual(['', 'start', '', 'end', '']);
        expect(pausesMs).toEqual([1000, 2000, 3000, 4000]);
    });
    it('is case-insensitive', () => {
        expect(parseDialogueTextCodes('a[PAUSE 1.5]b').pausesMs).toEqual([1500]);
    });
});

describe('stripDialogueTextCodes', () => {
    it('removes codes, keeps everything else', () => {
        expect(stripDialogueTextCodes('Wait...[pause 0.5] what? [wink]')).toBe('Wait... what? [wink]');
        expect(stripDialogueTextCodes('no codes')).toBe('no codes');
    });
});

describe('processDialogueText', () => {
    it('pause indices track CLEAN text even when interpolation changes lengths', () => {
        // {N} → "LONGER-VALUE" (grows), {S} → "" (shrinks)
        const interpolate = (s: string) => s.replace('{N}', 'LONGER-VALUE').replace('{S}', '');
        const { cleanText, pauses } = processDialogueText('{N} hi[pause 1]{S}there[pause 2]!', interpolate);
        expect(cleanText).toBe('LONGER-VALUE hithere!');
        expect(pauses).toEqual([
            { index: 'LONGER-VALUE hi'.length, ms: 1000 },
            { index: 'LONGER-VALUE hithere'.length, ms: 2000 },
        ]);
    });
    it('a variable VALUE containing [pause] does not create a pause', () => {
        const interpolate = (s: string) => s.replace('{Sneaky}', 'x[pause 9]y');
        const { cleanText, pauses } = processDialogueText('{Sneaky}', interpolate);
        expect(cleanText).toBe('x[pause 9]y'); // rendered literally
        expect(pauses).toEqual([]);
    });
});

describe('smartJoin', () => {
    it('inserts a space between letters/digits', () => {
        expect(smartJoin('Hello', 'there')).toBe('Hello there');
        expect(smartJoin('Round 1', '2 begins')).toBe('Round 1 2 begins');
    });
    it('sentence continuations after punctuation get a space', () => {
        expect(smartJoin('You know...', 'I never liked you.')).toBe('You know... I never liked you.');
        expect(smartJoin('Hello.', 'Goodbye.')).toBe('Hello. Goodbye.');
    });
    it('keeps punctuation-led and dash joins tight', () => {
        expect(smartJoin('wai—', '—t!')).toBe('wai——t!');
        expect(smartJoin('wai-', 't!')).toBe('wai-t!');
        expect(smartJoin('Hello', ', right?')).toBe('Hello, right?');
        expect(smartJoin('“', 'Quote')).toBe('“Quote');
    });
    it('author-typed spaces win', () => {
        expect(smartJoin('Hello ', 'there')).toBe('Hello there');
        expect(smartJoin('Hello', ' there')).toBe('Hello there');
    });
    it('empty sides join exactly', () => {
        expect(smartJoin('', 'x')).toBe('x');
        expect(smartJoin('x', '')).toBe('x');
    });
});

describe('walkToAppendGroupHead', () => {
    const d = (append?: boolean): any => ({ type: CommandType.Dialogue, ...(append ? { append: true } : {}) });
    const other = (): any => ({ type: CommandType.Wait });
    it('walks from any part back to the head', () => {
        const cmds = [other(), d(), d(true), d(true), other()];
        expect(walkToAppendGroupHead(cmds, 3)).toBe(1);
        expect(walkToAppendGroupHead(cmds, 2)).toBe(1);
        expect(walkToAppendGroupHead(cmds, 1)).toBe(1);
    });
    it('non-append indices are untouched', () => {
        const cmds = [d(), other(), d()];
        expect(walkToAppendGroupHead(cmds, 2)).toBe(2);
        expect(walkToAppendGroupHead(cmds, 1)).toBe(1);
    });
    it('tolerates missing command lists and out-of-range indices', () => {
        expect(walkToAppendGroupHead(undefined, 5)).toBe(5);
        expect(walkToAppendGroupHead([d(true)], 9)).toBe(0);
    });
});

describe('punctuationPauses (automatic punctuation pacing)', () => {
    const cfg = { commaMs: 150, sentenceMs: 300, ellipsisMs: 450 };
    const P = (text: string) => punctuationPauses(text, cfg);

    it('holds after commas, sentence ends, and ellipses — after the mark', () => {
        expect(P('Well, hi. Yes')).toEqual([
            { index: 5, ms: 150 },   // after the ',' at index 4
            { index: 9, ms: 300 },   // after the '.'
        ]);
    });
    it('semicolons and colons pause like commas; ! and ? like periods', () => {
        expect(P('a; b: c! d? e')).toEqual([
            { index: 2, ms: 150 }, { index: 5, ms: 150 }, { index: 8, ms: 300 }, { index: 11, ms: 300 },
        ]);
    });
    it('runs collapse to ONE pause, strongest class wins', () => {
        expect(P('What?! ok')).toEqual([{ index: 6, ms: 300 }]);
        expect(P('Wait... ok')).toEqual([{ index: 7, ms: 450 }]);
        expect(P('Hm… ok')).toEqual([{ index: 3, ms: 450 }]);
        expect(P('So,. ok')).toEqual([{ index: 4, ms: 300 }]);
    });
    it('closing quotes/brackets ride along', () => {
        expect(P('"Stop." Now')).toEqual([{ index: 7, ms: 300 }]);
        expect(P('(really?) yes')).toEqual([{ index: 9, ms: 300 }]);
    });
    it('digit guard: numeric separators never pause', () => {
        expect(P('pi is 3.14 ok')).toEqual([]);
        expect(P('1,000 coins')).toEqual([]);
        expect(P('12:30 sharp')).toEqual([]);
        // but a real sentence end after a number still pauses
        expect(P('It cost 5. Then')).toEqual([{ index: 10, ms: 300 }]);
    });
    it('end-of-text pauses are dropped', () => {
        expect(P('The end.')).toEqual([]);
        expect(P('Wait...')).toEqual([]);
        expect(P('')).toEqual([]);
    });
    it('plain text has no pauses', () => {
        expect(P('no punctuation here')).toEqual([]);
    });
});
