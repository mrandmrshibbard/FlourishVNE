/**
 * Skip-backward target resolution.
 *
 * The bug these pin: pressing Back after a Common Event had spoken a line used to restore the
 * SCENE's command list at an index that only meant something inside the EVENT's list. The
 * player was silently thrown back to the title screen, losing their run.
 */
import { describe, it, expect } from 'vitest';
import { resolveRewind } from '../rewind';
import type { HistoryEntry } from '../types/gameState';

const cmd = (id: string) => ({ id, type: 'Dialogue', text: id } as any);

/** A scene with five lines, and a common event with two of its own. */
const SCENE_COMMANDS = [cmd('s0'), cmd('s1'), cmd('s2'), cmd('s3'), cmd('s4')];
const CE_COMMANDS = [cmd('ce0'), cmd('ce1')];
const scenes = { 'scene-1': { commands: SCENE_COMMANDS } } as any;

const line = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
    timestamp: 1,
    type: 'dialogue',
    text: 'hello',
    sceneId: 'scene-1',
    commandIndex: 1,
    ...over,
});

const state = (over: any = {}) => ({
    history: [line()],
    currentSceneId: 'scene-1',
    currentCommands: SCENE_COMMANDS,
    currentIndex: 3,
    commandStack: [],
    ...over,
} as any);

describe('resolveRewind', () => {
    it('rewinds a plain scene line to its own command list', () => {
        const r = resolveRewind(state(), scenes);
        expect(r.target).toBeTruthy();
        expect(r.target!.commands).toBe(SCENE_COMMANDS);
        expect(r.target!.commandIndex).toBe(1);
        expect(r.target!.historyIndex).toBe(0);
    });

    it('restores the COMMON EVENT list — not the scene — for a line spoken inside one', () => {
        // The regression: index 1 is valid in both lists, so the old code "worked" but landed on
        // the wrong command entirely (s1 instead of ce1).
        const stack = [{ sceneId: 'scene-1', commands: SCENE_COMMANDS, index: 3, commonEventId: 'ce-1' }];
        const r = resolveRewind(state({
            history: [line({ commandIndex: 1, commandsSnapshot: CE_COMMANDS, commandStackSnapshot: stack })],
            currentCommands: CE_COMMANDS,
        }), scenes);

        expect(r.target!.commands).toBe(CE_COMMANDS);
        expect(r.target!.commands[r.target!.commandIndex]).toBe(CE_COMMANDS[1]);
        // The call stack comes back too, or returning from the event would pop a stale frame.
        expect(r.target!.commandStack).toEqual(stack);
    });

    it('refuses instead of rewinding out of bounds — this is what dumped players at the title', () => {
        // A CE line at index 6 with the scene's 5-command list is exactly the old crash shape.
        const r = resolveRewind(state({
            history: [line({ commandIndex: 6, commandsSnapshot: SCENE_COMMANDS })],
        }), scenes);

        expect(r.target).toBeNull();
        expect(r.reason).toBe('out-of-bounds');
    });

    it('restores the scene list when stepping back OUT of a finished common event', () => {
        // Player is back in the scene; the previous line was a scene line.
        const r = resolveRewind(state({
            history: [line({ commandIndex: 2, commandsSnapshot: SCENE_COMMANDS, commandStackSnapshot: [] })],
            currentCommands: SCENE_COMMANDS,
            commandStack: [],
        }), scenes);

        expect(r.target!.commands).toBe(SCENE_COMMANDS);
        expect(r.target!.commandIndex).toBe(2);
        expect(r.target!.commandStack).toEqual([]);
    });

    it('clears a stale call stack when landing on a line that had none', () => {
        // Recorded outside any event (empty snapshot stack), but the player is currently inside
        // one. Keeping the live stack would resume into an event they rewound out of.
        const r = resolveRewind(state({
            history: [line({ commandIndex: 0, commandsSnapshot: SCENE_COMMANDS, commandStackSnapshot: [] })],
            commandStack: [{ sceneId: 'scene-1', commands: SCENE_COMMANDS, index: 4, commonEventId: 'ce-1' }],
        }), scenes);

        expect(r.target!.commandStack).toEqual([]);
    });

    it('still rewinds legacy entries that predate the snapshot fields', () => {
        const r = resolveRewind(state({ history: [line()] }), scenes);
        expect(r.target!.commands).toBe(SCENE_COMMANDS);
        expect(r.target!.commandIndex).toBe(1);
    });

    it('skips choice and text-input entries to reach the previous spoken line', () => {
        const r = resolveRewind(state({
            history: [
                line({ commandIndex: 0 }),
                { timestamp: 2, type: 'choice', text: 'pick', choiceText: 'A' } as HistoryEntry,
                { timestamp: 3, type: 'textInput', text: 'name?', inputValue: 'Mia' } as HistoryEntry,
            ],
        }), scenes);

        expect(r.target!.historyIndex).toBe(0);
        expect(r.target!.commandIndex).toBe(0);
    });

    it('refuses with no history, and with history holding no spoken lines', () => {
        expect(resolveRewind(state({ history: [] }), scenes).reason).toBe('no-previous-line');
        expect(resolveRewind(state({
            history: [{ timestamp: 1, type: 'choice', text: 'pick' } as HistoryEntry],
        }), scenes).reason).toBe('no-previous-line');
    });

    it('refuses when the recorded scene no longer exists', () => {
        const r = resolveRewind(state({
            history: [line({ sceneId: 'deleted-scene' })],
        }), scenes);

        expect(r.target).toBeNull();
        expect(r.reason).toBe('scene-missing');
    });

    it('never returns a position outside the list it resolved', () => {
        // Property-ish sweep: whatever combination we throw at it, a success is always in bounds.
        for (const commandIndex of [-1, 0, 1, 4, 5, 99]) {
            for (const snapshot of [undefined, SCENE_COMMANDS, CE_COMMANDS]) {
                const r = resolveRewind(state({
                    history: [line({ commandIndex, commandsSnapshot: snapshot })],
                }), scenes);
                if (r.target) {
                    expect(r.target.commandIndex).toBeGreaterThanOrEqual(0);
                    expect(r.target.commandIndex).toBeLessThan(r.target.commands.length);
                }
            }
        }
    });
});
