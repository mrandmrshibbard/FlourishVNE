/**
 * Staging-canvas expansion of Call Common Event commands (editor-only).
 *
 * The scene canvas simulates a scene by walking its commands; a Call Common Event used to be
 * a silent no-op there, so the event's Show Text / Image / Button / Character elements were
 * invisible and could only be positioned blind from the Common Events tab. This helper
 * pre-flattens the walked command list, splicing in each called event's commands and tagging
 * them with WHERE they came from — the canvas renders them like any other element, and the
 * tag lets edits write back into the shared event (and clicks select the parent call).
 *
 * Semantics mirror the runtime where it matters:
 * - nested calls expand too (depth-limited; the runtime allows 32, previews need far less),
 * - cycles are cut per branch,
 * - disabled events are skipped,
 * - and an event already expanded ONCE in this walk is not expanded again ("first call
 *   wins") — overlay ids are the producing command's id, so a second copy would collide
 *   with the first in React keys and selection.
 */
import { VNID } from '../../types';
import { VNCommand, CommandType, CallCommonEventCommand } from '../../features/scene/types';
import { VNCommonEvent } from '../../types/commonEvents';

export interface CeMeta {
    /** The common event the command lives in. */
    eventId: VNID;
    eventName: string;
    /** The OUTERMOST scene-level Call Common Event command id — clicking a produced element
     *  selects this (selection is always a scene index, even for nested calls). */
    callCommandId: string;
    /** The command's index inside the event (for the deep link into the Common Events tab). */
    ceIndex: number;
}

export interface FlatEntry {
    cmd: VNCommand;
    /** Present only for commands spliced in from a common event. */
    ce?: CeMeta;
}

const MAX_DEPTH = 4;

export function flattenStagingCommands(
    cmds: VNCommand[],
    commonEvents: Record<VNID, VNCommonEvent> | undefined,
): FlatEntry[] {
    const out: FlatEntry[] = [];
    const expandedEvents = new Set<VNID>();   // walk-level: first call wins

    const expand = (list: VNCommand[], depth: number, branch: Set<VNID>, outerCall: { id: string } | null, eventCtx: { id: VNID; name: string } | null) => {
        for (let i = 0; i < list.length; i++) {
            const cmd = list[i];
            if (cmd?.type === CommandType.CallCommonEvent) {
                const call = cmd as CallCommonEventCommand;
                const ce = call.commonEventId ? commonEvents?.[call.commonEventId] : undefined;
                if (
                    ce && ce.enabled && Array.isArray(ce.commands) && ce.commands.length > 0 &&
                    depth < MAX_DEPTH && !branch.has(ce.id) && !expandedEvents.has(ce.id)
                ) {
                    expandedEvents.add(ce.id);
                    const nextBranch = new Set(branch);
                    nextBranch.add(ce.id);
                    // The outermost scene call stays the selection anchor for nested expansions.
                    expand(ce.commands, depth + 1, nextBranch, outerCall ?? { id: cmd.id }, { id: ce.id, name: ce.name });
                }
                continue;   // the call itself never renders anything
            }
            out.push(eventCtx
                ? { cmd, ce: { eventId: eventCtx.id, eventName: eventCtx.name, callCommandId: (outerCall as { id: string }).id, ceIndex: i } }
                : { cmd });
        }
    };

    expand(cmds, 0, new Set(), null, null);
    return out;
}
