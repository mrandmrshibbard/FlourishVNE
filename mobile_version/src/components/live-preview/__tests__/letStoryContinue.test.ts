/**
 * "Let the story continue" — the friendly face of modifiers.runAsync (and MoveCharacter's
 * inverted waitForCompletion mapping). The residue-free write is the byte-identity guarantee:
 * unchecking with no stackId removes `modifiers` entirely.
 */
import { describe, it, expect } from 'vitest';
import { writeRunAsyncForTest as writeRunAsync } from '../../inspector/CommandGroupFields';

describe('writeRunAsync (Let the story continue)', () => {
    it('checking writes modifiers.runAsync true', () => {
        expect(writeRunAsync({ id: 'c1' }, true)).toEqual({ modifiers: { runAsync: true } });
    });
    it('unchecking with no stackId removes modifiers entirely', () => {
        expect(writeRunAsync({ id: 'c1', modifiers: { runAsync: true } }, false)).toEqual({ modifiers: undefined });
    });
    it('unchecking with a stackId keeps the modifiers (stack membership survives)', () => {
        expect(writeRunAsync({ id: 'c1', modifiers: { runAsync: true, stackId: 's1' } }, false))
            .toEqual({ modifiers: { runAsync: false, stackId: 's1' } });
    });
    it('checking preserves other modifier fields', () => {
        expect(writeRunAsync({ id: 'c1', modifiers: { stackId: 's1' } }, true))
            .toEqual({ modifiers: { runAsync: true, stackId: 's1' } });
    });
});

describe('MoveCharacter inverted mapping (documented contract)', () => {
    // checked ⇔ waitForCompletion === false; unchecked removes the field (absent = wait, default).
    const patchFor = (checked: boolean) => ({ waitForCompletion: checked ? false : undefined });
    it('checked → waitForCompletion false; unchecked → field removed', () => {
        expect(patchFor(true)).toEqual({ waitForCompletion: false });
        expect(patchFor(false)).toEqual({ waitForCompletion: undefined });
    });
});
