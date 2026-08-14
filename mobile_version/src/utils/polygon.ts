/**
 * Pure polygon helpers for "Drawn shape" hot spots and poly regions.
 *
 * Points are FLAT pairs [x1, y1, x2, y2, ...] — the same convention as
 * draggableImageElementRegion.coords. Units don't matter here (the helpers are
 * coordinate-space agnostic); callers use canvas-% while tracing and
 * percent-of-own-box once stored on an element.
 */

/** Perpendicular distance from point p to the segment a→b. */
function perpDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    // Distance to the infinite line — correct for RDP, where a/b are the anchor ends.
    return Math.abs(dy * px - dx * py + bx * ay - by * ax) / Math.sqrt(lenSq);
}

/**
 * Ramer–Douglas–Peucker simplification over a flat point list.
 * Keeps endpoints; drops every point closer than `tolerance` to the kept chain.
 * Returns a NEW flat array (input untouched). Fewer than 3 points pass through.
 */
export function simplifyPath(points: number[], tolerance: number): number[] {
    const n = Math.floor(points.length / 2);
    if (n < 3 || tolerance <= 0) return points.slice(0, n * 2);
    const keep = new Array<boolean>(n).fill(false);
    keep[0] = true;
    keep[n - 1] = true;
    // Iterative RDP (explicit stack — traces can be long).
    const stack: Array<[number, number]> = [[0, n - 1]];
    while (stack.length) {
        const [first, last] = stack.pop() as [number, number];
        let maxDist = -1;
        let maxIdx = -1;
        const ax = points[first * 2];
        const ay = points[first * 2 + 1];
        const bx = points[last * 2];
        const by = points[last * 2 + 1];
        for (let i = first + 1; i < last; i++) {
            const d = perpDistance(points[i * 2], points[i * 2 + 1], ax, ay, bx, by);
            if (d > maxDist) { maxDist = d; maxIdx = i; }
        }
        if (maxDist > tolerance && maxIdx > 0) {
            keep[maxIdx] = true;
            stack.push([first, maxIdx], [maxIdx, last]);
        }
    }
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
        if (keep[i]) out.push(points[i * 2], points[i * 2 + 1]);
    }
    return out;
}

/**
 * Ray-casting point-in-polygon over a flat point list (closed implicitly).
 * Even-odd rule; points exactly on an edge count as inside (hit-testing wants
 * clicks on the outline to land).
 */
export function pointInPolygon(px: number, py: number, points: number[]): boolean {
    const n = Math.floor(points.length / 2);
    if (n < 3) return false;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = points[i * 2];
        const yi = points[i * 2 + 1];
        const xj = points[j * 2];
        const yj = points[j * 2 + 1];
        // On-edge check: collinear and within the segment's bounding box.
        const cross = (px - xi) * (yj - yi) - (py - yi) * (xj - xi);
        if (Math.abs(cross) < 1e-9 &&
            px >= Math.min(xi, xj) - 1e-9 && px <= Math.max(xi, xj) + 1e-9 &&
            py >= Math.min(yi, yj) - 1e-9 && py <= Math.max(yi, yj) + 1e-9) {
            return true;
        }
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/** Bounding box of a flat point list. Returns null for an empty list. */
export function polygonBounds(points: number[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const n = Math.floor(points.length / 2);
    if (n === 0) return null;
    let minX = points[0], maxX = points[0], minY = points[1], maxY = points[1];
    for (let i = 1; i < n; i++) {
        const x = points[i * 2];
        const y = points[i * 2 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
}

/** CSS clip-path polygon() string from flat percent-of-box points, or '' if degenerate. */
export function polygonClipPath(points: number[] | undefined): string {
    if (!points || points.length < 6) return '';
    const parts: string[] = [];
    for (let i = 0; i + 1 < points.length; i += 2) {
        parts.push(`${points[i]}% ${points[i + 1]}%`);
    }
    return `polygon(${parts.join(', ')})`;
}
