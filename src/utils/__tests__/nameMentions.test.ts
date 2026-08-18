/**
 * Character name mentions — resolved-name matching, boundaries, overlaps, and the
 * glossary-wins subtraction rule.
 */
import { describe, it, expect } from 'vitest';
import { compileNameMentions, subtractOverlaps, mentionEffectOf } from '../nameMentions';

const project: any = { variables: { v1: { id: 'v1', name: 'Nickname', type: 'string' } } };

const chars = (list: Array<{ id: string; name: string }>) => {
    const out: Record<string, any> = {};
    for (const c of list) out[c.id] = c;
    return out;
};

describe('compileNameMentions', () => {
    it('matches a plain name case-insensitively at word boundaries', () => {
        const m = compileNameMentions(chars([{ id: 'c1', name: 'Yuki' }]), {}, project)!;
        expect(m.findMatches('Ask yuki about the key.')).toEqual([{ start: 4, end: 8, id: 'c1' }]);
        // Inside a longer word: no match.
        expect(m.findMatches('The yukioka tree.')).toEqual([]);
        // Possessive: the apostrophe is a boundary.
        expect(m.findMatches("Yuki's book")).toEqual([{ start: 0, end: 4, id: 'c1' }]);
    });

    it('resolves {Nickname} tokens against CURRENT variables', () => {
        const roster = chars([{ id: 'c1', name: '{Nickname}' }]);
        const m1 = compileNameMentions(roster, { v1: 'Blossom' }, project)!;
        expect(m1.findMatches('Hey Blossom!')).toEqual([{ start: 4, end: 11, id: 'c1' }]);
        // Rename via the variable → a recompile matches the NEW name only.
        const m2 = compileNameMentions(roster, { v1: 'Thorn' }, project)!;
        expect(m2.findMatches('Hey Blossom!')).toEqual([]);
        expect(m2.findMatches('Hey Thorn!')).toEqual([{ start: 4, end: 9, id: 'c1' }]);
    });

    it('longest name wins an overlap (Anna over Ann)', () => {
        const m = compileNameMentions(chars([{ id: 'ann', name: 'Ann' }, { id: 'anna', name: 'Anna' }]), {}, project)!;
        expect(m.findMatches('Anna waved.')).toEqual([{ start: 0, end: 4, id: 'anna' }]);
        expect(m.findMatches('Ann waved.')).toEqual([{ start: 0, end: 3, id: 'ann' }]);
    });

    it('skips empty and single-character names; null when nothing matchable', () => {
        const m = compileNameMentions(chars([{ id: 'c1', name: 'X' }, { id: 'c2', name: '  ' }]), {}, project);
        expect(m).toBeNull();
        expect(compileNameMentions(undefined, {}, project)).toBeNull();
    });

    it('matches multiple different characters in one line', () => {
        const m = compileNameMentions(chars([{ id: 'a', name: 'Yuki' }, { id: 'b', name: 'Marco' }]), {}, project)!;
        expect(m.findMatches('Yuki and Marco left.')).toEqual([
            { start: 0, end: 4, id: 'a' },
            { start: 9, end: 14, id: 'b' },
        ]);
    });
});

describe('subtractOverlaps (glossary wins)', () => {
    it('drops mentions that intersect reserved spans, keeps the rest', () => {
        const mentions = [
            { start: 0, end: 4, id: 'a' },
            { start: 10, end: 15, id: 'b' },
        ];
        expect(subtractOverlaps(mentions, [{ start: 12, end: 20 }])).toEqual([{ start: 0, end: 4, id: 'a' }]);
        expect(subtractOverlaps(mentions, [])).toEqual(mentions);
        // Touching (end === start) is NOT an overlap.
        expect(subtractOverlaps(mentions, [{ start: 4, end: 10 }])).toEqual(mentions);
    });
});

describe('names with inline effect tags (name-box text effects)', () => {
    it('the needle is the CLEAN name — tags in the name never break matching', () => {
        const m = compileNameMentions(chars([{ id: 'c1', name: '[wave]The Witch[/wave]' }]), {}, project)!;
        expect(m.findMatches('Beware The Witch tonight.')).toEqual([{ start: 7, end: 16, id: 'c1' }]);
    });

    it('tags wrapping {tokens} still resolve, then match', () => {
        const m = compileNameMentions(chars([{ id: 'c1', name: '[rainbow]{Nickname}[/rainbow]' }]), { v1: 'Moonbeam' }, project)!;
        expect(m.findMatches('Hello Moonbeam.')).toEqual([{ start: 6, end: 14, id: 'c1' }]);
    });
});

describe('mentionEffectOf', () => {
    it('nameTextEffect setting wins over inline tags', () => {
        expect(mentionEffectOf({ name: '[wave]Rex[/wave]', nameTextEffect: { type: 'shake', speed: 2 } }))
            .toEqual({ type: 'shake', speed: 2 });
    });
    it('falls back to the first inline tag effect', () => {
        expect(mentionEffectOf({ name: '[wave]The Witch[/wave]' })).toEqual({ type: 'wave' });
    });
    it('plain names have no effect; "none" setting counts as unset', () => {
        expect(mentionEffectOf({ name: 'Yuki' })).toBeUndefined();
        expect(mentionEffectOf({ name: 'Yuki', nameTextEffect: { type: 'none' } })).toBeUndefined();
        expect(mentionEffectOf(undefined)).toBeUndefined();
    });
});
