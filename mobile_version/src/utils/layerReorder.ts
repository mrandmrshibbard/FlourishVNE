/**
 * Character layer reordering — pure helpers, mirroring `commonEventReorder.ts` (minus the
 * branch-pairing logic, since layers are a flat list).
 *
 * 🔴 Base stacking order IS the `layers` Record's key order — there is no separate order array
 * on the character. `APPLY_CHARACTER_LAYOUT` already knows how to apply a new order (it rebuilds
 * the Record in the given sequence, appending anything unlisted), so reordering from the layer
 * list dispatches that same payload rather than inventing a second ordering model. Keep it that
 * way: `layout.ts` resolves geometry for seven different surfaces off this order.
 *
 * Both helpers return `null` for a no-op so callers can skip a pointless dispatch (and the undo
 * entry that comes with it).
 */
import { VNID } from '../types';

/** Move the layer at `fromIndex` so it sits at `toIndex`. */
export function moveLayer(order: VNID[], fromIndex: number, toIndex: number): VNID[] | null {
    if (!order || fromIndex < 0 || fromIndex >= order.length) return null;
    const clamped = Math.max(0, Math.min(order.length - 1, toIndex));
    if (clamped === fromIndex) return null;
    const next = [...order];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(clamped, 0, moved);
    return next;
}

/** Nudge one layer by a single step. `dir` is -1 for earlier (behind), +1 for later (in front). */
export function stepLayer(order: VNID[], index: number, dir: -1 | 1): VNID[] | null {
    return moveLayer(order, index, index + dir);
}

/**
 * Move every selected layer to sit at `toIndex`, keeping their relative order. Used when a
 * multi-selection is dragged as a group — dragging one row of a selection should bring the rest
 * with it, not silently reorder only the row under the cursor.
 */
export function moveLayers(order: VNID[], selected: ReadonlySet<VNID>, toIndex: number): VNID[] | null {
    if (!order || selected.size === 0) return null;
    const moving = order.filter(id => selected.has(id));
    if (moving.length === 0 || moving.length === order.length) return null;
    const rest = order.filter(id => !selected.has(id));
    // `toIndex` counts positions in the ORIGINAL list; translate it to the gap in `rest`.
    const before = order.slice(0, toIndex).filter(id => !selected.has(id)).length;
    const next = [...rest.slice(0, before), ...moving, ...rest.slice(before)];
    return next.every((id, i) => id === order[i]) ? null : next;
}
