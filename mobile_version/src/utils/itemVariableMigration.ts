import { VNProject } from '../types/project';
import { VNID } from '../types';
import { VNVariable } from '../features/variables/types';
import { VNStat } from '../features/stats/types';
import { statVarName } from '../features/stats/state/statReducer';
import { CommandType, VNCommand, BranchStartCommand, BranchEndCommand } from '../features/scene/types';

/**
 * Back-compat migration for item-count variables. Items are sugar over a per-item
 * `number` variable (`item.countVariableId`); collection entries likewise each have a
 * backing stock variable. This does two idempotent, additive repairs:
 *
 * 1. **Backfill `min: 0`.** Inventory quantities are non-negative, and the item reducer
 *    now stamps `min: 0` at creation. Older / hand-edited count variables can lack the
 *    bound, which let the inventory "Use" button (a plain `SetVariable subtract 1`) drop
 *    the count below zero. Setting `min: 0` is always correct for an item count.
 *
 * 2. **Recreate dangling count variables.** Nothing stops a user from deleting the
 *    variable that backs an item's quantity (it shows in the Variables manager named
 *    after the item), and hand-edited / very old / partially-imported projects can also
 *    reference a `countVariableId` that no longer exists. When that happens the item is
 *    silently broken: reads return 0, gives/pickups appear to do nothing, conditions and
 *    `{name}` interpolation see nothing. We re-register the missing variable at the same
 *    id so the item works again. This is exactly why "the same item works in one project
 *    but not another" — the difference is a present vs. dangling count variable.
 *
 * Additive-only: existing values, names, scope, defaults are untouched, so save/load and
 * exports are unaffected. Recreated variables start at 0 (the value was already lost when
 * the variable was deleted).
 */
export function migrateItemCountVariableBounds(project: VNProject): VNProject {
    if (!project || !project.variables) return project;
    if (!project.items && !project.itemCollections) return project;

    let changed = false;
    const variables = { ...project.variables };

    // Ensure a `number` count variable exists at `id`, registering a fresh one if it's a
    // dangling reference, or backfilling `min: 0` on an existing one that lacks a bound.
    const ensureNumberVar = (id: VNID | undefined, name: string, internal: boolean) => {
        if (!id) return;
        const existing = variables[id];
        if (!existing) {
            variables[id] = {
                id,
                name,
                type: 'number',
                defaultValue: 0,
                scope: 'global',
                min: 0,
                ...(internal ? { isInternal: true } : {}),
            } as VNVariable;
            changed = true;
        } else if (existing.type === 'number' && existing.min === undefined) {
            variables[id] = { ...existing, min: 0 };
            changed = true;
        }
    };

    for (const item of Object.values(project.items || {})) {
        if (item?.countVariableId) ensureNumberVar(item.countVariableId, item.name || 'Item', false);
    }
    for (const collection of Object.values(project.itemCollections || {})) {
        for (const entry of collection?.entries || []) {
            // Owned-tracking entries share the item's public count var (already handled above);
            // independent stock entries get their own hidden (internal) stock variable.
            if (entry?.countVariableId) {
                const itemName = project.items?.[entry.itemId]?.name || 'Item';
                ensureNumberVar(entry.countVariableId, `${itemName} — ${collection.name || 'List'}`, true);
            }
        }
    }

    return changed ? { ...project, variables } : project;
}

/**
 * Self-heal for the stats registry. Stats materialize one number variable per target
 * (global, or per character). Two idempotent, additive repairs on load:
 *
 * 1. **Recreate dangling stat variables** at the same id (mirrors the item count-var
 *    self-heal above) so a deleted backing variable can't silently break the stat.
 * 2. **Prune dead characters** from `characterIds`/`variableIds` (and drop their backing
 *    variables). The rootReducer short-circuits at the first slice that handles an action,
 *    so the stat reducer never sees DELETE_CHARACTER — this is where that cleanup lives.
 *
 * It deliberately does NOT re-sync existing variable NAMES on load. The auto-name
 * ("Alice — Affection") is just a default applied at creation and when the author renames
 * the stat (UPDATE_STAT); a manual rename in the Variables manager must stick, not get
 * clobbered on every reload. (An earlier version re-synced here, which made stat variable
 * names appear to "change back automatically".) Character renames therefore don't propagate
 * to stat variable names — that's intentional: variables key off id, and silently renaming
 * them would break any `{Old Name}` text interpolation. See [[reference_variable_rename_interpolation]].
 */
export function migrateStatVariables(project: VNProject): VNProject {
    if (!project || !project.stats || !project.variables) return project;

    let changed = false;
    const variables = { ...project.variables };
    const stats: Record<VNID, VNStat> = { ...project.stats };

    for (const [statId, stat] of Object.entries(stats)) {
        if (!stat?.variableIds) continue;
        let statChanged = false;
        const variableIds: Record<string, VNID> = { ...stat.variableIds };
        let characterIds = stat.characterIds;

        for (const [target, varId] of Object.entries(stat.variableIds)) {
            const char = target === 'global' ? undefined : project.characters?.[target];
            // (2) Dead character → drop the backing variable and the backlink.
            if (target !== 'global' && !char) {
                if (variables[varId]) delete variables[varId];
                delete variableIds[target];
                if (characterIds) characterIds = characterIds.filter(id => id !== target);
                statChanged = true;
                continue;
            }
            // (1) Dangling reference → recreate at the same id (value already lost; start at default).
            //     Existing variables (incl. ones the author manually renamed) are left untouched.
            if (!variables[varId]) {
                variables[varId] = {
                    id: varId,
                    name: statVarName(stat.name, char?.name),
                    type: 'number',
                    defaultValue: stat.defaultValue ?? stat.min ?? 0,
                    scope: 'global',
                    min: stat.min,
                    max: stat.max,
                } as VNVariable;
                changed = true;
            }
        }

        // Also prune characterIds entries that never got a variable but reference dead characters.
        if (stat.appliesTo === 'characters' && characterIds) {
            const alive = characterIds.filter(id => !!project.characters?.[id]);
            if (alive.length !== characterIds.length) { characterIds = alive; statChanged = true; }
        }

        if (statChanged) {
            stats[statId] = { ...stat, variableIds, characterIds };
            changed = true;
        }
    }

    return changed ? { ...project, variables, stats } : project;
}

/**
 * Self-heal orphaned Branch markers. A Branch must be a `BranchStart` + matching
 * `BranchEnd` pair (paired by `branchId`); the editor only renders a branch's body
 * (its Add menu + drop zones) when the matching `BranchEnd` is found. A creation bug
 * (dropping a Branch onto the scene-bottom zone) used to add a LONE `BranchStart`
 * with no end — producing a branch that shows no Add menu and silently rejects
 * dropped commands. Those broken branches are saved in projects.
 *
 * This repairs them idempotently: for any `BranchStart` whose `branchId` has no
 * `BranchEnd` anywhere in the same scene, insert a `BranchEnd` immediately after it
 * (an empty, editable branch — does NOT swallow following commands). Correctly
 * paired branches are untouched, so save/load and exports are unaffected.
 */
export function repairOrphanBranchMarkers(project: VNProject): VNProject {
    if (!project?.scenes) return project;
    let changedAny = false;
    const newScenes = { ...project.scenes };
    for (const sceneId in project.scenes) {
        const scene = project.scenes[sceneId];
        if (!scene?.commands?.length) continue;
        const cmds = scene.commands;
        // branchIds that already have a BranchEnd somewhere in this scene
        const endIds = new Set<VNID>();
        for (const c of cmds) {
            if (c.type === CommandType.BranchEnd) endIds.add((c as BranchEndCommand).branchId);
        }
        let changed = false;
        const out: VNCommand[] = [];
        for (const c of cmds) {
            out.push(c);
            if (c.type === CommandType.BranchStart) {
                const bid = (c as BranchStartCommand).branchId;
                if (bid && !endIds.has(bid)) {
                    out.push({ id: `cmd-${Math.random().toString(36).substring(2, 9)}`, type: CommandType.BranchEnd, branchId: bid } as VNCommand);
                    endIds.add(bid);
                    changed = true;
                }
            }
        }
        if (changed) { newScenes[sceneId] = { ...scene, commands: out }; changedAny = true; }
    }
    return changedAny ? { ...project, scenes: newScenes } : project;
}
