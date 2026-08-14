/**
 * Game-level drop-target registry — the "bridge" that lets a draggable element on
 * ANY surface (the HUD, any pass-through screen / ShowScreen overlay, or the scene)
 * be dropped onto an interactive hot spot on ANY OTHER surface.
 *
 * Drag-drop used to be per-screen: each screen's interactive runtime only hit-tested its
 * own hot spots, so a HUD item could never reach a scene target. Every surface now
 * registers its drag-drop targets here, and the runtime that owns the dragged element
 * hit-tests this shared registry on drop. All surfaces are full-canvas overlays using
 * the same % coordinate space, so hit-testing is uniform across them.
 *
 * This is a module singleton (one active player per window). Targets are namespaced by
 * id and removed via the returned unregister fn, so remounts/scene changes stay clean.
 */

import { pointInPolygon } from '../../utils/polygon';

export interface RegistryDropTarget {
    /** Unique, surface-namespaced id, e.g. `screen-<screenId>-<spotId>` or `scene-<commandId>`. */
    id: string;
    /** Hit area in canvas percentages (0-100). */
    rectPct: { x: number; y: number; width: number; height: number };
    /** The target's visual rotation in degrees. The hit-test inverse-rotates the drop point
     *  around the rect centre, so a tilted drop zone accepts drops where it is DRAWN, not where
     *  its unrotated rect would be. Flips need no handling — mirroring a rect doesn't change the
     *  area it covers. Absent/0 = plain rect test. */
    rotation?: number;
    /** "Drawn shape" spots: flat [x1,y1,x2,y2,…] vertex pairs, percent of rectPct's own box
     *  (0-100). When present (≥3 points) the hit-test additionally requires the point to be
     *  inside this polygon — run AFTER the rotation inverse-transform, since the polygon lives
     *  in the target's local (unrotated) space. Absent = plain rect test. */
    polygonPct?: number[];
    /** If set, only these dragged element ids are accepted. */
    acceptedElementIds?: string[];
    /** If set, only a dragged element carrying this tag is accepted. */
    acceptTag?: string;
    /** Higher = visually on top; wins when targets overlap. */
    order: number;
    /** Fire the target's actions. */
    onDrop: (draggedId: string, draggedTag?: string) => void;
}

const targets = new Map<string, RegistryDropTarget>();
let seq = 1;

/** Register a drop target. Returns an unregister fn (call on unmount / hide). */
export function registerDropTarget(target: Omit<RegistryDropTarget, 'order'> & { order?: number }): () => void {
    const order = target.order ?? seq++;
    const entry: RegistryDropTarget = { ...target, order };
    targets.set(entry.id, entry);
    return () => {
        // Only delete if this exact registration is still the active one.
        if (targets.get(entry.id) === entry) targets.delete(entry.id);
    };
}

/**
 * Find the top-most drop target whose rect contains `point` and that accepts the
 * dragged element. Returns null if none match.
 */
export function hitTestDropTarget(
    point: { x: number; y: number },
    draggedId: string,
    draggedTag?: string,
): RegistryDropTarget | null {
    let best: RegistryDropTarget | null = null;
    for (const t of targets.values()) {
        if (t.acceptedElementIds && t.acceptedElementIds.length > 0 && !t.acceptedElementIds.includes(draggedId)) continue;
        if (t.acceptTag && t.acceptTag !== draggedTag) continue;
        const { x, y, width, height } = t.rectPct;
        let px = point.x, py = point.y;
        if (t.rotation) {
            // Rotating the RECT by θ is testing the point rotated by -θ around the rect centre.
            const cx = x + width / 2, cy = y + height / 2;
            const rad = (-t.rotation * Math.PI) / 180;
            const dx = point.x - cx, dy = point.y - cy;
            px = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
            py = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
        }
        if (px >= x && px <= x + width && py >= y && py <= y + height) {
            if (t.polygonPct && t.polygonPct.length >= 6) {
                // Drawn shape: box-relative % of the (already inverse-rotated) point, then polygon test.
                const lx = width > 0 ? ((px - x) / width) * 100 : 0;
                const ly = height > 0 ? ((py - y) / height) * 100 : 0;
                if (!pointInPolygon(lx, ly, t.polygonPct)) continue;
            }
            if (!best || t.order > best.order) best = t;
        }
    }
    return best;
}
