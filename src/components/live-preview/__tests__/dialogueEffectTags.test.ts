/**
 * Inline text-effect tags: `I said [shake]NO[/shake].`
 *
 * The contract these protect (from dialogueTextCodes' header): only KNOWN codes are consumed,
 * everything else in brackets passes through verbatim, and codes are read from the RAW text
 * before interpolation so a variable's value can never inject one.
 */
import { describe, it, expect } from 'vitest';
import { processDialogueText, stripDialogueTextCodes, parseDialogueTextCodes } from '../dialogueTextCodes';

const id = (s: string) => s;
const run = (raw: string, interpolate: (s: string) => string = id) => processDialogueText(raw, interpolate);

describe('inline effect tags', () => {
    it('marks the tagged stretch and leaves the text clean', () => {
        const r = run('I said [shake]NO[/shake] again');
        expect(r.cleanText).toBe('I said NO again');
        expect(r.effectSpans).toEqual([{ start: 7, end: 9, effect: 'shake', intensity: undefined }]);
        expect(r.cleanText.slice(7, 9)).toBe('NO');
    });

    it('reads an intensity number, mirroring [pause N]', () => {
        expect(run('[shake 2.5]LOUD[/shake]').effectSpans[0]).toMatchObject({ effect: 'shake', intensity: 2.5 });
    });

    it('supports every whole-line effect name, including the hyphenated ones', () => {
        for (const name of ['shake', 'wave', 'rainbow', 'glitch', 'pulse', 'fade-in', 'bounce', 'typewriter-bounce']) {
            const r = run(`a [${name}]b[/${name}] c`);
            expect(r.cleanText).toBe('a b c');
            expect(r.effectSpans[0].effect).toBe(name);
        }
    });

    it('🔴 leaves UNKNOWN bracketed text exactly as written', () => {
        // Existing scripts are full of things like [wink] — they must keep rendering.
        for (const raw of ['She [wink] smiled', 'Meet at [3]pm', '[Note to self] later', 'a [/shake] stray']) {
            expect(run(raw).cleanText).toBe(raw);
            expect(run(raw).effectSpans).toEqual([]);
        }
    });

    it('never lets a variable VALUE inject an effect', () => {
        const r = run('Look: {evil}', () => 'Look: [shake]boo[/shake]');
        expect(r.cleanText).toBe('Look: [shake]boo[/shake]');
        expect(r.effectSpans).toEqual([]);
    });

    it('keeps span boundaries right when a variable changes length', () => {
        // The tag sits AFTER the variable, so its start must shift with the substituted value.
        const r = run('{name}: [wave]hi[/wave]', s => s.replace('{name}', 'Anastasia'));
        expect(r.cleanText).toBe('Anastasia: hi');
        expect(r.cleanText.slice(r.effectSpans[0].start, r.effectSpans[0].end)).toBe('hi');
    });

    it('coexists with [pause] in one line, both landing correctly', () => {
        const r = run('Wait[pause 1]... [shake]what?[/shake]');
        expect(r.cleanText).toBe('Wait... what?');
        expect(r.pauses).toEqual([{ index: 4, ms: 1000 }]);
        expect(r.cleanText.slice(r.effectSpans[0].start, r.effectSpans[0].end)).toBe('what?');
    });

    it('handles nesting, closing the innermost matching tag first', () => {
        const r = run('[wave]soft [shake]LOUD[/shake] soft[/wave]');
        expect(r.cleanText).toBe('soft LOUD soft');
        const byEffect = Object.fromEntries(r.effectSpans.map(s => [s.effect, [s.start, s.end]]));
        expect(byEffect.shake).toEqual([5, 9]);
        expect(byEffect.wave).toEqual([0, 14]);
    });

    it('runs an unclosed tag to the end of the line rather than dropping it', () => {
        const r = run('and then [shake]everything shook');
        expect(r.cleanText).toBe('and then everything shook');
        expect(r.effectSpans[0]).toMatchObject({ start: 9, end: 25, effect: 'shake' });
    });

    it('ignores an empty tagged stretch', () => {
        expect(run('a [shake][/shake] b').effectSpans).toEqual([]);
        expect(run('a [shake][/shake] b').cleanText).toBe('a  b');
    });

    it('strips effect tags from history/preview text too', () => {
        expect(stripDialogueTextCodes('I said [shake]NO[/shake][pause] really')).toBe('I said NO really');
        // ...and the older segment API still sees the same clean pieces.
        expect(parseDialogueTextCodes('[wave]hi[/wave][pause]there').segments).toEqual(['hi', 'there']);
    });

    it('leaves lines with no tags completely untouched', () => {
        const r = run('Just an ordinary line, with punctuation!');
        expect(r.cleanText).toBe('Just an ordinary line, with punctuation!');
        expect(r.effectSpans).toEqual([]);
        expect(r.pauses).toEqual([]);
    });
});
