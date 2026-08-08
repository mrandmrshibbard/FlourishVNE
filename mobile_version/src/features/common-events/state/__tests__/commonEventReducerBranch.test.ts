/**
 * Common-event branch integrity (parity with the scene reducer): deleting a Branch removes
 * ALL of its markers while keeping the command bodies; a BranchEnd can never be deleted on
 * its own — an orphaned branch makes the runtime fall through segment bodies.
 */
import { describe, it, expect } from 'vitest';
import { commonEventReducer } from '../commonEventReducer';
import { CommandType } from '../../../scene/types';

const cmd = (id: string, type: any, extra: any = {}): any => ({ id, type, ...extra });

const makeState = (commands: any[]): any => ({
    commonEvents: {
        'ce-1': {
            id: 'ce-1', name: 'E', trigger: 'called', enabled: true, parameters: [],
            createdAt: '', updatedAt: '', commands,
        },
    },
});

const BRANCHED = [
    cmd('a', CommandType.Dialogue, { text: 'before' }),
    cmd('bs', CommandType.BranchStart, { branchId: 'b1' }),
    cmd('x', CommandType.SetVariable, { variableId: 'v', operator: 'set', value: 1 }),
    cmd('ei', CommandType.BranchElseIf, { branchId: 'b1' }),
    cmd('y', CommandType.SetVariable, { variableId: 'v', operator: 'set', value: 2 }),
    cmd('be', CommandType.BranchEnd, { branchId: 'b1' }),
    cmd('z', CommandType.Dialogue, { text: 'after' }),
];

describe('commonEventReducer branch delete guards', () => {
    it('deleting the BranchStart removes ALL of its markers but keeps the bodies', () => {
        const next = commonEventReducer(makeState(BRANCHED), {
            type: 'DELETE_COMMON_EVENT_COMMAND', payload: { commonEventId: 'ce-1', commandIndex: 1 },
        } as any);
        expect(next.commonEvents!['ce-1'].commands.map((c: any) => c.id)).toEqual(['a', 'x', 'y', 'z']);
    });

    it('a BranchEnd cannot be deleted on its own', () => {
        const state = makeState(BRANCHED);
        const next = commonEventReducer(state, {
            type: 'DELETE_COMMON_EVENT_COMMAND', payload: { commonEventId: 'ce-1', commandIndex: 5 },
        } as any);
        expect(next).toBe(state);
    });

    it('deleting one branch leaves a sibling branch intact', () => {
        const two = [
            cmd('bs1', CommandType.BranchStart, { branchId: 'b1' }),
            cmd('x', CommandType.SetVariable, { variableId: 'v', operator: 'set', value: 1 }),
            cmd('be1', CommandType.BranchEnd, { branchId: 'b1' }),
            cmd('bs2', CommandType.BranchStart, { branchId: 'b2' }),
            cmd('y', CommandType.SetVariable, { variableId: 'v', operator: 'set', value: 2 }),
            cmd('be2', CommandType.BranchEnd, { branchId: 'b2' }),
        ];
        const next = commonEventReducer(makeState(two), {
            type: 'DELETE_COMMON_EVENT_COMMAND', payload: { commonEventId: 'ce-1', commandIndex: 0 },
        } as any);
        expect(next.commonEvents!['ce-1'].commands.map((c: any) => c.id)).toEqual(['x', 'bs2', 'y', 'be2']);
    });

    it('normal commands still delete singly', () => {
        const next = commonEventReducer(makeState(BRANCHED), {
            type: 'DELETE_COMMON_EVENT_COMMAND', payload: { commonEventId: 'ce-1', commandIndex: 0 },
        } as any);
        expect(next.commonEvents!['ce-1'].commands.map((c: any) => c.id)).toEqual(['bs', 'x', 'ei', 'y', 'be', 'z']);
    });
});
