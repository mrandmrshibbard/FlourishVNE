/**
 * Skip-backward ("Back") target resolution. Engine code (ships in built games).
 *
 * Pure on purpose: the decision of *where* a rewind lands is the part that broke, so it lives
 * here where it can be tested directly instead of inside the 17k-line runtime component.
 *
 * 🔴 The bug this exists to prevent: a dialogue line spoken inside a Common Event records a
 * `commandIndex` into THAT EVENT's command array, while its `sceneId` still names the calling
 * scene. Restoring "the scene's commands at commandIndex" therefore lands on an unrelated
 * command — or past the end, which the command loop reads as "end of scene" and answers by
 * clearing player state and showing the title screen. Players lost their whole run to it.
 *
 * So: prefer the command list the entry recorded, restore the call stack alongside it, and
 * refuse outright rather than rewind somewhere that doesn't exist.
 */
import { VNID } from '../../types';
import { VNCommand } from '../../features/scene/types';
import { HistoryEntry, PlayerState } from './types/gameState';

/** Everything the runtime needs to apply a rewind. */
export interface RewindTarget {
    /** Index into `history` of the entry we land on — history is trimmed to here. */
    historyIndex: number;
    entry: HistoryEntry;
    sceneId: VNID;
    /** The list `commandIndex` indexes into — a Common Event's commands, or the scene's. */
    commands: VNCommand[];
    commandIndex: number;
    commandStack: PlayerState['commandStack'];
}

export type RewindRefusal =
    /** Nothing recorded yet, or nothing but choices/inputs — there is no earlier line. */
    | 'no-previous-line'
    /** The entry names a scene this project no longer has (deleted since it was recorded). */
    | 'scene-missing'
    /** The remembered position isn't inside the resolved command list. */
    | 'out-of-bounds';

/**
 * Deliberately NOT a discriminated union: this project compiles without `strict`, and with
 * `strictNullChecks` off TypeScript won't reliably narrow one. A nullable field always works.
 */
export interface RewindResult {
    /** Where to land, or null when the rewind must be refused. */
    target: RewindTarget | null;
    /** Why it was refused. Absent on success. */
    reason?: RewindRefusal;
}

/** The parts of PlayerState this needs — keeps the helper trivially testable. */
type RewindState = Pick<PlayerState,
    'history' | 'currentSceneId' | 'currentCommands' | 'currentIndex' | 'commandStack'>;

export function resolveRewind(
    p: RewindState,
    scenes: Record<VNID, { commands: VNCommand[] }>,
): RewindResult {
    if (!p.history || p.history.length === 0) return { target: null, reason: 'no-previous-line' };

    // The CURRENT line lives in uiState, not history — entries are pushed only once the player
    // advances past them. So the newest dialogue entry IS the previous line. Choice/textInput
    // entries are backlog decoration; skip them.
    let historyIndex = p.history.length - 1;
    while (historyIndex >= 0 && p.history[historyIndex].type !== 'dialogue') historyIndex--;
    if (historyIndex < 0) return { target: null, reason: 'no-previous-line' };

    const entry = p.history[historyIndex];
    const sceneId = entry.sceneId || p.currentSceneId;
    const commandIndex = entry.commandIndex ?? p.currentIndex;

    let commands: VNCommand[];
    let commandStack: PlayerState['commandStack'];

    if (entry.commandsSnapshot) {
        // The entry remembers exactly where it lived. Restore the call stack with it — otherwise
        // returning from the event later pops a frame that no longer matches our position.
        commands = entry.commandsSnapshot;
        commandStack = entry.commandStackSnapshot ?? [];
    } else {
        // Recorded before the snapshot existed. Such entries are scene-level by definition, so
        // the old behavior is right for them.
        const scene = scenes[sceneId];
        if (scene) {
            commands = scene.commands;
            commandStack = p.commandStack;
        } else if (entry.sceneId && entry.sceneId !== p.currentSceneId) {
            return { target: null, reason: 'scene-missing' };
        } else {
            commands = p.currentCommands;
            commandStack = p.commandStack;
        }
    }

    if (commandIndex < 0 || commandIndex >= commands.length) {
        return { target: null, reason: 'out-of-bounds' };
    }

    return { target: { historyIndex, entry, sceneId, commands, commandIndex, commandStack } };
}
