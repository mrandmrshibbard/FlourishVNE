/**
 * Common Event command reordering — pure helpers for the flat command list in
 * CommonEventsManager (drag + ▲▼ buttons).
 *
 * Branch safety: a Branch is a PAIRED range (BranchStart … BranchEnd sharing a branchId,
 * with optional BranchElseIf/BranchElse markers inside). Dragging a BranchStart or
 * BranchEnd moves the WHOLE block so pairs can never break; the in-between markers
 * (ElseIf/Else) are not movable on their own — they only mean something inside their
 * branch. Plain commands move one at a time (moving one into a branch range simply makes
 * it part of that branch — that's a feature).
 *
 * The result is always a NEW array (single UPDATE_COMMON_EVENT dispatch = one undo step),
 * or null when the move is a no-op / not allowed.
 */
import { VNCommand, CommandType } from '../features/scene/types';

/** Can this row start a drag / use ▲▼ at all? */
export function isReorderableCommand(cmd: VNCommand): boolean {
    return cmd.type !== CommandType.BranchElseIf && cmd.type !== CommandType.BranchElse;
}

/** The [start, end] index range that moves together for the command at `index`.
 *  Plain command → [i, i]. BranchStart/BranchEnd → the whole paired block
 *  (dangling markers degrade to just themselves — dangling-safe like the scene editor). */
export function commandBlockRange(commands: VNCommand[], index: number): [number, number] {
    const cmd = commands[index] as any;
    if (!cmd) return [index, index];
    if (cmd.type === CommandType.BranchStart && cmd.branchId) {
        const end = commands.findIndex((c: any, i) => i > index && c.type === CommandType.BranchEnd && c.branchId === cmd.branchId);
        return end === -1 ? [index, index] : [index, end];
    }
    if (cmd.type === CommandType.BranchEnd && cmd.branchId) {
        const start = commands.findIndex((c: any) => c.type === CommandType.BranchStart && c.branchId === cmd.branchId);
        return (start === -1 || start > index) ? [index, index] : [start, index];
    }
    return [index, index];
}

/**
 * Move the block containing `fromIndex` so it sits at insertion point `toIndex`
 * (an index into the ORIGINAL array, 0..length; think "insert before this row").
 * Returns the rebuilt array, or null when nothing changes or the target falls
 * inside the moving block itself.
 */
export function moveCommonEventCommand(commands: VNCommand[], fromIndex: number, toIndex: number): VNCommand[] | null {
    if (fromIndex < 0 || fromIndex >= commands.length) return null;
    if (!isReorderableCommand(commands[fromIndex])) return null;
    const [start, end] = commandBlockRange(commands, fromIndex);
    const blockLen = end - start + 1;
    const target = Math.max(0, Math.min(commands.length, toIndex));
    // Inside (or immediately around) the moving block = no-op.
    if (target >= start && target <= end + 1) return null;
    const next = commands.slice();
    const block = next.splice(start, blockLen);
    const insertAt = target > end ? target - blockLen : target;
    next.splice(insertAt, 0, ...block);
    return next;
}

/** One visual step up (dir=-1) or down (dir=+1), skipping over neighbouring blocks whole. */
export function stepCommonEventCommand(commands: VNCommand[], index: number, dir: 1 | -1): VNCommand[] | null {
    const [start, end] = commandBlockRange(commands, index);
    if (dir === -1) {
        if (start === 0) return null;
        const [prevStart] = commandBlockRange(commands, start - 1);
        return moveCommonEventCommand(commands, index, prevStart);
    }
    if (end === commands.length - 1) return null;
    const [, nextEnd] = commandBlockRange(commands, end + 1);
    return moveCommonEventCommand(commands, index, nextEnd + 1);
}
