/**
 * Legacy-command migration
 * ─────────────────────────
 * Strips retired scene commands from a project on load. Runs in the same
 * always-on, idempotent spot as the unified-screen migration (`SET_PROJECT` +
 * editor init + the engine bundle), so old projects, the editor, and exported
 * games all converge on the current command set.
 *
 * Retired so far:
 *   - `ShowdraggableImageElement` / `HidedraggableImageElement` — the scene image-map overlay commands.
 *     Superseded by `ShowHotSpot` and by the screen-level Image Map element.
 *     They were never a documented/kept feature; removing the data here means
 *     no dangling unknown-command entries survive a round-trip.
 *
 * A scene/common-event with none of these commands passes through unchanged
 * (same object identity), so this is cheap for already-clean projects.
 */

import { VNProject } from '../types/project';

/** Command type strings that are no longer supported and should be dropped on load. */
const RETIRED_COMMAND_TYPES = new Set<string>(['ShowdraggableImageElement', 'HidedraggableImageElement']);

/** Remove retired commands from one command array. Returns the same array
 *  reference when nothing was removed (so callers can detect "no change"). */
function stripCommands<T extends { type: string }>(commands: T[] | undefined): T[] | undefined {
    if (!commands || commands.length === 0) return commands;
    let hasRetired = false;
    for (const c of commands) {
        if (RETIRED_COMMAND_TYPES.has(c.type)) { hasRetired = true; break; }
    }
    if (!hasRetired) return commands;
    return commands.filter(c => !RETIRED_COMMAND_TYPES.has(c.type));
}

/** Drop retired commands from every scene and common event. Returns a new
 *  project only when something changed; the input is never mutated. */
export function migrateProjectRemoveLegacyCommands(project: VNProject): VNProject {
    if (!project) return project;
    let changed = false;

    let scenes = project.scenes;
    if (scenes) {
        const next: typeof scenes = {} as any;
        for (const [id, scene] of Object.entries(scenes)) {
            if (!scene || typeof scene !== 'object') { next[id as keyof typeof scenes] = scene as any; continue; }
            const stripped = stripCommands((scene as any).commands);
            if (stripped !== (scene as any).commands) {
                changed = true;
                next[id as keyof typeof scenes] = { ...(scene as any), commands: stripped } as any;
            } else {
                next[id as keyof typeof scenes] = scene as any;
            }
        }
        scenes = next;
    }

    let commonEvents = (project as any).commonEvents;
    if (commonEvents) {
        const next: Record<string, any> = {};
        for (const [id, ce] of Object.entries(commonEvents as Record<string, any>)) {
            const stripped = stripCommands(ce?.commands);
            if (stripped !== ce?.commands) {
                changed = true;
                next[id] = { ...ce, commands: stripped };
            } else {
                next[id] = ce;
            }
        }
        commonEvents = next;
    }

    if (!changed) return project;
    return { ...project, scenes, ...(commonEvents ? { commonEvents } : {}) } as VNProject;
}
