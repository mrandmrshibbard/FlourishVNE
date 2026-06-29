/**
 * canvasSnap — shared smart-snapping + alignment-guide math for ALL editor canvases
 * (StagingArea / MenuEditor / InGameUIEditor).
 *
 * Pure (no React, no DOM). All coordinates are in PERCENT of the canvas, with
 * x/y = the rect's TOP-LEFT corner. The caller is responsible for converting its
 * own anchor model (center-anchored chrome, center-bottom characters, etc.) into a
 * top-left rect before calling, and back again after.
 *
 * Policy-free: snapping is always attempted unless `bypass` is set (the caller wires
 * `bypass` to the Alt key per Brad's "smart-snap ON by default, Alt to bypass").
 */

export interface SnapRect { x: number; y: number; width: number; height: number; }

export interface SnapGuide {
    axis: 'x' | 'y';
    /** Position of the guide line, in % of the canvas (a vertical line for axis 'x'). */
    at: number;
    /** Optional [start,end] in % along the perpendicular axis to limit the line's length. */
    span?: [number, number];
    kind: 'canvas' | 'sibling';
}

export interface SnapOptions {
    /** Snap distance, in % of the canvas. Default ~0.8% (≈ the existing 0.5% nudge feel). */
    thresholdPct?: number;
    mode: 'move' | 'resize';
    /** For resize mode: which edges are moving (any of 'l','r','t','b'); only those snap. */
    activeEdges?: string;
    /** When true, no snapping happens (returns the rect unchanged, no guides). */
    bypass?: boolean;
    /** Restrict move-mode snapping to one axis (e.g. characters snap horizontally only). Default 'both'. */
    axes?: 'both' | 'x' | 'y';
}

export interface SnapResult { rect: SnapRect; guides: SnapGuide[]; }

/** Apply a normalized content box (inset fractions 0–1) to a rect, returning the trimmed sub-rect.
 *  Absent box = the rect unchanged. Used so snapping/guides align by an element's visible content. */
export function insetRect(rect: SnapRect, box?: { left: number; top: number; right: number; bottom: number }): SnapRect {
    if (!box) return rect;
    const left = box.left || 0, top = box.top || 0, right = box.right || 0, bottom = box.bottom || 0;
    return {
        x: rect.x + left * rect.width,
        y: rect.y + top * rect.height,
        width: rect.width * Math.max(0.001, 1 - left - right),
        height: rect.height * Math.max(0.001, 1 - top - bottom),
    };
}

interface Candidate { at: number; kind: 'canvas' | 'sibling'; owner?: SnapRect; }

const DEFAULT_THRESHOLD = 0.8;

function buildCandidates(siblings: SnapRect[], axis: 'x' | 'y'): Candidate[] {
    const out: Candidate[] = [
        { at: 0, kind: 'canvas' },
        { at: 50, kind: 'canvas' },
        { at: 100, kind: 'canvas' },
    ];
    for (const s of siblings) {
        if (axis === 'x') {
            out.push({ at: s.x, kind: 'sibling', owner: s });
            out.push({ at: s.x + s.width / 2, kind: 'sibling', owner: s });
            out.push({ at: s.x + s.width, kind: 'sibling', owner: s });
        } else {
            out.push({ at: s.y, kind: 'sibling', owner: s });
            out.push({ at: s.y + s.height / 2, kind: 'sibling', owner: s });
            out.push({ at: s.y + s.height, kind: 'sibling', owner: s });
        }
    }
    return out;
}

/** Best candidate for a set of moving anchor values along one axis. */
function bestSnap(anchors: number[], cands: Candidate[], threshold: number): { delta: number; cand: Candidate } | null {
    let best: { delta: number; cand: Candidate; dist: number } | null = null;
    for (const a of anchors) {
        for (const c of cands) {
            const dist = Math.abs(c.at - a);
            if (dist <= threshold && (!best || dist < best.dist)) {
                best = { delta: c.at - a, cand: c, dist };
            }
        }
    }
    return best ? { delta: best.delta, cand: best.cand } : null;
}

function spanFor(axis: 'x' | 'y', rect: SnapRect, cand: Candidate): [number, number] | undefined {
    if (cand.kind !== 'sibling' || !cand.owner) return undefined; // canvas lines span the whole canvas
    const o = cand.owner;
    if (axis === 'x') {
        // vertical line: span over y of moving rect ∪ owner
        return [Math.min(rect.y, o.y), Math.max(rect.y + rect.height, o.y + o.height)];
    }
    return [Math.min(rect.x, o.x), Math.max(rect.x + rect.width, o.x + o.width)];
}

export function snapRect(rect: SnapRect, siblings: SnapRect[], opts: SnapOptions): SnapResult {
    const threshold = opts.thresholdPct ?? DEFAULT_THRESHOLD;
    if (opts.bypass) return { rect, guides: [] };

    const candX = buildCandidates(siblings, 'x');
    const candY = buildCandidates(siblings, 'y');
    const out: SnapRect = { ...rect };
    const guides: SnapGuide[] = [];

    if (opts.mode === 'move') {
        const axes = opts.axes ?? 'both';
        if (axes !== 'y') {
            const sx = bestSnap([out.x, out.x + out.width / 2, out.x + out.width], candX, threshold);
            if (sx) {
                out.x += sx.delta;
                guides.push({ axis: 'x', at: sx.cand.at, kind: sx.cand.kind, span: spanFor('x', out, sx.cand) });
            }
        }
        if (axes !== 'x') {
            const sy = bestSnap([out.y, out.y + out.height / 2, out.y + out.height], candY, threshold);
            if (sy) {
                out.y += sy.delta;
                guides.push({ axis: 'y', at: sy.cand.at, kind: sy.cand.kind, span: spanFor('y', out, sy.cand) });
            }
        }
    } else {
        const e = opts.activeEdges || '';
        // Left edge moves → adjust x + width (right edge fixed)
        if (e.includes('l')) {
            const s = bestSnap([out.x], candX, threshold);
            if (s) { const right = out.x + out.width; out.x += s.delta; out.width = right - out.x; guides.push({ axis: 'x', at: s.cand.at, kind: s.cand.kind, span: spanFor('x', out, s.cand) }); }
        }
        // Right edge moves → adjust width
        if (e.includes('r')) {
            const s = bestSnap([out.x + out.width], candX, threshold);
            if (s) { out.width += s.delta; guides.push({ axis: 'x', at: s.cand.at, kind: s.cand.kind, span: spanFor('x', out, s.cand) }); }
        }
        // Top edge moves → adjust y + height (bottom fixed)
        if (e.includes('t')) {
            const s = bestSnap([out.y], candY, threshold);
            if (s) { const bottom = out.y + out.height; out.y += s.delta; out.height = bottom - out.y; guides.push({ axis: 'y', at: s.cand.at, kind: s.cand.kind, span: spanFor('y', out, s.cand) }); }
        }
        // Bottom edge moves → adjust height
        if (e.includes('b')) {
            const s = bestSnap([out.y + out.height], candY, threshold);
            if (s) { out.height += s.delta; guides.push({ axis: 'y', at: s.cand.at, kind: s.cand.kind, span: spanFor('y', out, s.cand) }); }
        }
    }

    return { rect: out, guides };
}
