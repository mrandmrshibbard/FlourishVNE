import { VNProject } from '../types/project';
import { VNID } from '../types';
import { VNVariable } from '../features/variables/types';

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
