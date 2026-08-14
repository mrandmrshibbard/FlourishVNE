import { describe, it, expect } from 'vitest';
import { simplifyPath, pointInPolygon, polygonBounds, polygonClipPath } from '../polygon';

describe('simplifyPath (RDP)', () => {
    it('collapses collinear points onto the endpoints', () => {
        // Straight line with noise-free interior points — everything between the ends goes.
        const line = [0, 0, 25, 25, 50, 50, 75, 75, 100, 100];
        expect(simplifyPath(line, 0.5)).toEqual([0, 0, 100, 100]);
    });

    it('keeps a corner that exceeds the tolerance', () => {
        const corner = [0, 0, 50, 0, 100, 100];
        expect(simplifyPath(corner, 1)).toEqual(corner);
    });

    it('drops small jitter below the tolerance but keeps big features', () => {
        // A square-ish path with one tiny bump on the top edge.
        const path = [0, 0, 50, 0.3, 100, 0, 100, 100, 0, 100];
        const out = simplifyPath(path, 1);
        expect(out).toEqual([0, 0, 100, 0, 100, 100, 0, 100]);
        // With a tolerance smaller than the bump, the bump survives.
        expect(simplifyPath(path, 0.1)).toEqual(path);
    });

    it('passes through degenerate inputs untouched', () => {
        expect(simplifyPath([], 1)).toEqual([]);
        expect(simplifyPath([10, 10], 1)).toEqual([10, 10]);
        expect(simplifyPath([10, 10, 20, 20], 1)).toEqual([10, 10, 20, 20]);
    });

    it('does not mutate its input', () => {
        const input = [0, 0, 25, 25, 50, 50];
        const copy = [...input];
        simplifyPath(input, 1);
        expect(input).toEqual(copy);
    });
});

describe('pointInPolygon', () => {
    const square = [0, 0, 100, 0, 100, 100, 0, 100];

    it('detects inside and outside of a convex polygon', () => {
        expect(pointInPolygon(50, 50, square)).toBe(true);
        expect(pointInPolygon(150, 50, square)).toBe(false);
        expect(pointInPolygon(-1, 50, square)).toBe(false);
    });

    it('counts vertices and edges as inside', () => {
        expect(pointInPolygon(0, 0, square)).toBe(true);
        expect(pointInPolygon(50, 0, square)).toBe(true);
        expect(pointInPolygon(100, 100, square)).toBe(true);
    });

    it('handles concave polygons (C shape)', () => {
        // A "C": outer square with a bite taken out of the right middle.
        const cShape = [0, 0, 100, 0, 100, 30, 40, 30, 40, 70, 100, 70, 100, 100, 0, 100];
        expect(pointInPolygon(20, 50, cShape)).toBe(true);   // inside the spine
        expect(pointInPolygon(80, 50, cShape)).toBe(false);  // inside the bite (outside the C)
        expect(pointInPolygon(80, 15, cShape)).toBe(true);   // top arm
        expect(pointInPolygon(80, 85, cShape)).toBe(true);   // bottom arm
    });

    it('rejects degenerate point lists', () => {
        expect(pointInPolygon(0, 0, [])).toBe(false);
        expect(pointInPolygon(0, 0, [0, 0, 100, 100])).toBe(false);
    });
});

describe('polygonBounds', () => {
    it('computes the bounding box', () => {
        expect(polygonBounds([10, 20, 90, 5, 40, 80])).toEqual({ minX: 10, minY: 5, maxX: 90, maxY: 80 });
    });
    it('returns null for an empty list', () => {
        expect(polygonBounds([])).toBeNull();
    });
});

describe('polygonClipPath', () => {
    it('builds a CSS polygon() string', () => {
        expect(polygonClipPath([0, 0, 100, 0, 50, 100])).toBe('polygon(0% 0%, 100% 0%, 50% 100%)');
    });
    it('returns empty string for degenerate input', () => {
        expect(polygonClipPath(undefined)).toBe('');
        expect(polygonClipPath([0, 0, 100, 100])).toBe('');
    });
});
