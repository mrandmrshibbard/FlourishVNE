/**
 * The UI-variable shadow.
 *
 * Hot-spot / screen-button "Set Variable" actions park their value in a separate buffer and mark
 * the id dirty; every runtime read then prefers the buffer over the game value. That mark was
 * only ever cleared wholesale, so the buffer won FOREVER: a later Set Variable *command* wrote
 * the real store, but Wait conditions, command conditions and the merged snapshot all kept
 * returning the hot-spot's value.
 *
 * Brad's repro: a hot-spot sets `freeze = true`; the next scene's Set Variable command sets it
 * back to `false`; the Wait "until freeze is true" then advances instantly because the merged
 * view still said `true`. Meanwhile the same variable set by a COMMAND in the first scene reset
 * perfectly — the discriminator that identified the buffer as the culprit.
 *
 * The fix is `CommandResult.writtenVariableIds`: a command names what it wrote, and the runtime
 * drops exactly those ids from the dirty set.
 */
import { describe, it, expect } from 'vitest';
import { handleSetVariable } from '../variableHandler';
import { CommandType } from '../../../../features/scene/types';

const makeContext = (variables: Record<string, any>, runtimeVariables?: Record<string, any>): any => ({
    project: {
        variables: {
            freeze: { id: 'freeze', name: 'freeze', type: 'boolean', initialValue: false },
            score: { id: 'score', name: 'score', type: 'number', initialValue: 0 },
        },
    },
    playerState: { variables },
    ...(runtimeVariables ? { runtimeVariables } : {}),
});

const setVar = (variableId: string, value: any, operator = 'set') => ({
    id: 'cmd-1', type: CommandType.SetVariable, variableId, value, operator,
} as any);

describe('Set Variable command clears the UI shadow', () => {
    it('names the variable it wrote', () => {
        const result = handleSetVariable(setVar('freeze', false), makeContext({ freeze: true }));
        expect(result.writtenVariableIds).toEqual(['freeze']);
    });

    it('names it even when the value is unchanged — the shadow must still lift', () => {
        // Critical: in Brad's repro the game store ALREADY held the right value; only the buffer
        // was stale. A "did the value change?" heuristic would have missed the bug entirely.
        const result = handleSetVariable(setVar('freeze', false), makeContext({ freeze: false }));
        expect(result.writtenVariableIds).toEqual(['freeze']);
    });

    it('reports only the variable it touched, so uncommitted screen edits survive', () => {
        const result = handleSetVariable(setVar('score', 5), makeContext({ score: 0, freeze: true }));
        expect(result.writtenVariableIds).toEqual(['score']);
        expect(result.writtenVariableIds).not.toContain('freeze');
    });

    it('computes from the same view its operands read', () => {
        // `score += 1` used to read the target from the raw store while operands read the merged
        // one, so the two halves of a single command could disagree.
        const result = handleSetVariable(
            setVar('score', 1, 'add'),
            makeContext({ score: 0 }, { score: 10 }),
        );
        expect(result.updates?.variables?.score).toBe(11);
    });

    it('is unchanged when nothing is shadowed', () => {
        const result = handleSetVariable(setVar('score', 1, 'add'), makeContext({ score: 4 }));
        expect(result.updates?.variables?.score).toBe(5);
        expect(result.advance).toBe(true);
    });
});
