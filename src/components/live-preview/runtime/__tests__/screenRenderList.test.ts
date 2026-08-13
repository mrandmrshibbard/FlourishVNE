/**
 * Which screens render, from the stack.
 *
 * 🔴 The baseline block is the contract that existing games are untouched: with no screen flagged,
 * every branch must reproduce what the old inline JSX did — top only, pop-close crossfade ordering,
 * unrelated mid-close screens beneath. The popup blocks then pin the new behavior.
 */
import { describe, it, expect } from 'vitest';
import { computeScreenRenderList, ScreenRenderListInput } from '../screenRenderList';

const screensOf = (defs: Record<string, boolean | undefined>) =>
    Object.fromEntries(Object.entries(defs).map(([id, flag]) =>
        [id, flag === undefined ? undefined : { showScreensBeneath: flag || undefined }]));

const run = (partial: Partial<ScreenRenderListInput> & Pick<ScreenRenderListInput, 'stack' | 'screens'>) =>
    computeScreenRenderList({ impliedBaseId: null, closingScreens: new Set(), ...partial });

describe('🔴 baseline parity — no flags, identical to the old inline logic', () => {
    const screens = screensOf({ A: false, B: false, C: false, HUD: false });

    it('renders only the top of the stack', () => {
        expect(run({ stack: ['A', 'B'], screens })).toEqual([
            { id: 'B', isClosing: false, inert: false },
        ]);
    });

    it('renders nothing for an empty stack with no implied base', () => {
        expect(run({ stack: [], screens })).toEqual([]);
    });

    it('renders the implied base when the stack is empty (the default game HUD)', () => {
        expect(run({ stack: [], screens, impliedBaseId: 'HUD' })).toEqual([
            { id: 'HUD', isClosing: false, inert: false },
        ]);
    });

    it('pop close: leaving screen below, revealed screen entering on top (crossfade order)', () => {
        expect(run({ stack: ['A', 'B'], screens, closingScreens: new Set(['B']) })).toEqual([
            { id: 'B', isClosing: true, inert: false },
            { id: 'A', isClosing: false, inert: false },
        ]);
    });

    it('a single-entry stack closing renders that screen as closing (no pop pair)', () => {
        expect(run({ stack: ['A'], screens, closingScreens: new Set(['A']) })).toEqual([
            { id: 'A', isClosing: true, inert: false },
        ]);
    });

    it('unrelated mid-close screens render beneath the top, in stack order', () => {
        expect(run({ stack: ['A', 'B', 'C'], screens, closingScreens: new Set(['A']) })).toEqual([
            { id: 'A', isClosing: true, inert: false },
            { id: 'C', isClosing: false, inert: false },
        ]);
    });

    it('a deleted top still renders (the renderer shows its error state, as today)', () => {
        expect(run({ stack: ['gone'], screens })).toEqual([
            { id: 'gone', isClosing: false, inert: false },
        ]);
    });
});

describe('popup chains — "Keep screens beneath visible"', () => {
    it('a flagged top shows the screen beneath it, inert', () => {
        const screens = screensOf({ HUDMENU: false, INV: true });
        expect(run({ stack: ['HUDMENU', 'INV'], screens })).toEqual([
            { id: 'HUDMENU', isClosing: false, inert: true },
            { id: 'INV', isClosing: false, inert: false },
        ]);
    });

    it('nested popups all render, bottom→top, only the top live', () => {
        const screens = screensOf({ A: false, B: true, C: true });
        expect(run({ stack: ['A', 'B', 'C'], screens })).toEqual([
            { id: 'A', isClosing: false, inert: true },
            { id: 'B', isClosing: false, inert: true },
            { id: 'C', isClosing: false, inert: false },
        ]);
    });

    it('stops at the first unflagged screen — the opaque base', () => {
        const screens = screensOf({ TITLE: false, MENU: false, MAP: true });
        expect(run({ stack: ['TITLE', 'MENU', 'MAP'], screens }).map(e => e.id))
            .toEqual(['MENU', 'MAP']);          // TITLE stays hidden beneath the opaque MENU
    });

    it('🔴 HUD floor: a popup with nothing beneath reveals the default game HUD', () => {
        const screens = screensOf({ INV: true, HUD: false });
        expect(run({ stack: ['INV'], screens, impliedBaseId: 'HUD' })).toEqual([
            { id: 'HUD', isClosing: false, inert: true },
            { id: 'INV', isClosing: false, inert: false },
        ]);
    });

    it('an unflagged screen in the stack suppresses the default HUD (full-screen menus still replace it)', () => {
        const screens = screensOf({ MENU: false, INV: true, HUD: false });
        expect(run({ stack: ['MENU', 'INV'], screens, impliedBaseId: 'HUD' }).map(e => e.id))
            .toEqual(['MENU', 'INV']);
    });

    it('caps the chain depth', () => {
        const screens = screensOf({ A: true, B: true, C: true, D: true, E: true, F: true });
        const out = run({ stack: ['A', 'B', 'C', 'D', 'E', 'F'], screens });
        expect(out).toHaveLength(4);
        expect(out[out.length - 1].id).toBe('F');
    });

    it('skips deleted screens while walking down, without breaking the chain', () => {
        const screens = screensOf({ A: false, C: true });        // B missing = deleted
        expect(run({ stack: ['A', 'B', 'C'], screens }).map(e => e.id)).toEqual(['A', 'C']);
    });

    it('tolerates repeated ids in the stack without rendering one twice', () => {
        const screens = screensOf({ A: true, B: true });
        const out = run({ stack: ['A', 'B', 'A'], screens });
        expect(out.map(e => e.id)).toEqual(['B', 'A']);
        expect(new Set(out.map(e => e.id)).size).toBe(out.length);
    });
});

describe('popup closing — it fades out ABOVE the base', () => {
    const screens = screensOf({ HUDMENU: false, INV: true });

    it('🔴 leaving popup renders last (on top), closing and inert; the base is live at once', () => {
        expect(run({ stack: ['HUDMENU', 'INV'], screens, closingScreens: new Set(['INV']) })).toEqual([
            { id: 'HUDMENU', isClosing: false, inert: false },
            { id: 'INV', isClosing: true, inert: true },
        ]);
    });

    it('normal pop close is unchanged when the leaving screen is NOT a popup', () => {
        const plain = screensOf({ A: false, B: false });
        expect(run({ stack: ['A', 'B'], screens: plain, closingScreens: new Set(['B']) })).toEqual([
            { id: 'B', isClosing: true, inert: false },
            { id: 'A', isClosing: false, inert: false },
        ]);
    });

    it('pop close revealing a POPUP renders that popup with its own chain beneath', () => {
        const s = screensOf({ BASE: false, MAP: true, FULL: false });
        expect(run({ stack: ['BASE', 'MAP', 'FULL'], screens: s, closingScreens: new Set(['FULL']) })).toEqual([
            { id: 'FULL', isClosing: true, inert: false },
            { id: 'BASE', isClosing: false, inert: true },
            { id: 'MAP', isClosing: false, inert: false },
        ]);
    });
});
