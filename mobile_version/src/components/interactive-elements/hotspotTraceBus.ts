/**
 * hotspotTraceBus — inspector → canvas bridge for "✏ Draw it" (drawn-shape hot spots).
 *
 * The shape picker lives deep in the inspector trees; the canvas that can host the
 * trace overlay is MenuEditor (screens) or StagingArea (scenes) — possibly popped out
 * into a CanvasWindow (same JS realm). Rather than threading a callback through three
 * layouts, this is a tiny module singleton, the same precedent as dropTargetRegistry:
 * inspectors call requestTrace(target); whichever canvas currently renders that target
 * mounts the PolygonTraceOverlay and commits through its own write path.
 */

export type TraceTarget =
    | { kind: 'screen-element'; screenId: string; elementId: string }
    | { kind: 'scene-command'; commandId: string };

type TraceCallback = (target: TraceTarget) => void;

const subscribers = new Set<TraceCallback>();

/** Ask the canvases to enter trace mode for `target`. No-op if none renders it. */
export function requestTrace(target: TraceTarget): void {
    subscribers.forEach(cb => {
        try { cb(target); } catch { /* one bad subscriber must not break the rest */ }
    });
}

/** Canvas-side: listen for trace requests. Returns an unsubscribe fn. */
export function subscribeTrace(cb: TraceCallback): () => void {
    subscribers.add(cb);
    return () => { subscribers.delete(cb); };
}
