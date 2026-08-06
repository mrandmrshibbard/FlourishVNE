/**
 * Common Event command reordering — block-aware moves that can never break a Branch pair.
 */
import { describe, it, expect } from 'vitest';
import { CommandType } from '../../features/scene/types';
import { isReorderableCommand, commandBlockRange, moveCommonEventCommand, stepCommonEventCommand } from '../commonEventReorder';

const cmd = (id: string, type: CommandType = CommandType.Dialogue, extra: any = {}): any => ({ id, type, ...extra });
const ids = (arr: any[] | null) => arr?.map(c => c.id) ?? null;

const plain = () => [cmd('a'), cmd('b'), cmd('c'), cmd('d')];
const withBranch = () => [
    cmd('a'),
    cmd('bs', CommandType.BranchStart, { branchId: 'br1' }),
    cmd('x'),
    cmd('el', CommandType.BranchElse, { branchId: 'br1' }),
    cmd('y'),
    cmd('be', CommandType.BranchEnd, { branchId: 'br1' }),
    cmd('z'),
];

describe('commandBlockRange', () => {
    it('plain commands are their own block; branch markers span the pair', () => {
        expect(commandBlockRange(plain(), 2)).toEqual([2, 2]);
        expect(commandBlockRange(withBranch(), 1)).toEqual([1, 5]); // BranchStart → whole block
        expect(commandBlockRange(withBranch(), 5)).toEqual([1, 5]); // BranchEnd → whole block
    });
    it('dangling markers degrade to themselves', () => {
        const dangling = [cmd('a'), cmd('bs', CommandType.BranchStart, { branchId: 'ghost' })];
        expect(commandBlockRange(dangling, 1)).toEqual([1, 1]);
    });
});

describe('moveCommonEventCommand', () => {
    it('moves a single command up and down', () => {
        expect(ids(moveCommonEventCommand(plain(), 0, 3))).toEqual(['b', 'c', 'a', 'd']);
        expect(ids(moveCommonEventCommand(plain(), 3, 0))).toEqual(['d', 'a', 'b', 'c']);
        expect(ids(moveCommonEventCommand(plain(), 0, 4))).toEqual(['b', 'c', 'd', 'a']);
    });
    it('no-ops when the target is inside/around the moving block', () => {
        expect(moveCommonEventCommand(plain(), 1, 1)).toBeNull();
        expect(moveCommonEventCommand(plain(), 1, 2)).toBeNull();
        expect(moveCommonEventCommand(withBranch(), 1, 3)).toBeNull(); // into its own branch
    });
    it('dragging a BranchStart/BranchEnd moves the WHOLE paired block', () => {
        expect(ids(moveCommonEventCommand(withBranch(), 1, 7))).toEqual(['a', 'z', 'bs', 'x', 'el', 'y', 'be']);
        expect(ids(moveCommonEventCommand(withBranch(), 5, 0))).toEqual(['bs', 'x', 'el', 'y', 'be', 'a', 'z']);
    });
    it('a plain command can move INTO a branch range (becomes part of it)', () => {
        expect(ids(moveCommonEventCommand(withBranch(), 6, 2))).toEqual(['a', 'bs', 'z', 'x', 'el', 'y', 'be']);
    });
    it('ElseIf/Else markers are not movable on their own', () => {
        expect(isReorderableCommand(withBranch()[3])).toBe(false);
        expect(moveCommonEventCommand(withBranch(), 3, 0)).toBeNull();
    });
});

describe('stepCommonEventCommand (▲▼)', () => {
    it('steps a plain command over its neighbour', () => {
        expect(ids(stepCommonEventCommand(plain(), 2, -1))).toEqual(['a', 'c', 'b', 'd']);
        expect(ids(stepCommonEventCommand(plain(), 2, 1))).toEqual(['a', 'b', 'd', 'c']);
    });
    it('steps OVER a whole branch block in one press', () => {
        expect(ids(stepCommonEventCommand(withBranch(), 6, -1))).toEqual(['a', 'z', 'bs', 'x', 'el', 'y', 'be']);
        expect(ids(stepCommonEventCommand(withBranch(), 0, 1))).toEqual(['bs', 'x', 'el', 'y', 'be', 'a', 'z']);
    });
    it('edges are no-ops', () => {
        expect(stepCommonEventCommand(plain(), 0, -1)).toBeNull();
        expect(stepCommonEventCommand(plain(), 3, 1)).toBeNull();
    });
});
