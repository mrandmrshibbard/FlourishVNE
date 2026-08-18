/**
 * "Close Screen → the screen this button is on" is stored as the ABSENCE of a target, and the
 * runtime used to resolve that to whatever screen was topmost. With a popup above the button's
 * screen — or the button sitting on the game HUD — it closed the wrong screen and the button's
 * own screen stayed open, which reads to a player as the screen refusing to close / toggling.
 */
import { describe, it, expect } from 'vitest';
import { resolveCloseTarget } from '../closeScreenTarget';

describe('resolveCloseTarget', () => {
    it('an explicitly chosen screen always wins', () => {
        expect(resolveCloseTarget({
            explicit: 'chosen', ownerScreenId: 'owner', hudStack: ['owner', 'popup'], screenStack: [],
        })).toBe('chosen');
    });

    it('closes the button OWN screen even when another screen is on top (the reported bug)', () => {
        expect(resolveCloseTarget({
            ownerScreenId: 'owner', hudStack: ['owner', 'popup'], screenStack: [],
        })).toBe('owner');
    });

    it('finds the owning screen in either stack', () => {
        expect(resolveCloseTarget({ ownerScreenId: 'owner', hudStack: [], screenStack: ['owner'] })).toBe('owner');
    });

    it('falls back to topmost for callers with no screen — scene hot-spots, timers, plugins', () => {
        // This tail is what keeps every project that never hit the ambiguity byte-identical.
        expect(resolveCloseTarget({ hudStack: ['a', 'b'], screenStack: ['x'] })).toBe('b');
        expect(resolveCloseTarget({ hudStack: [], screenStack: ['x', 'y'] })).toBe('y');
    });

    it('ignores an owner that is no longer open, rather than closing nothing', () => {
        expect(resolveCloseTarget({ ownerScreenId: 'gone', hudStack: ['a'], screenStack: [] })).toBe('a');
    });

    it('returns undefined when nothing is open (caller warns instead of failing silently)', () => {
        expect(resolveCloseTarget({ hudStack: [], screenStack: [] })).toBeUndefined();
    });
});
