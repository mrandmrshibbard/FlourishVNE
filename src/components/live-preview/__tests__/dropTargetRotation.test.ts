/**
 * Rotated drop zones must accept drops where they are DRAWN.
 *
 * The registry hit-test was a plain axis-aligned rect check, so a hot spot the author had visibly
 * tilted still accepted drops on its old unrotated footprint — hits where the zone isn't, misses
 * where it is. The fix inverse-rotates the drop point around the rect centre.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { registerDropTarget, hitTestDropTarget } from '../dropTargetRegistry';

const unregs: (() => void)[] = [];
const reg = (t: any) => { const u = registerDropTarget(t); unregs.push(u); return u; };
beforeEach(() => { while (unregs.length) unregs.pop()!(); });

// A tall thin zone (10 wide × 40 high) centred at (50,50), for unmistakable rotation effects.
const zone = (rotation?: number) =>
    reg({ id: 'z', rectPct: { x: 45, y: 30, width: 10, height: 40 }, rotation, onDrop: () => {} });

describe('rotation-aware drop hit-test', () => {
    it('unrotated: plain rect behavior, unchanged', () => {
        zone();
        expect(hitTestDropTarget({ x: 50, y: 35 }, 'd')?.id).toBe('z');
        expect(hitTestDropTarget({ x: 65, y: 50 }, 'd')).toBeNull();     // beside the thin zone
    });

    it('🔴 rotated 90°: hits where the zone is DRAWN, not its old footprint', () => {
        zone(90);
        // Drawn as a wide flat bar now: a point 15% to the side of centre is INSIDE...
        expect(hitTestDropTarget({ x: 65, y: 50 }, 'd')?.id).toBe('z');
        // ...and the old unrotated top of the rect is OUTSIDE.
        expect(hitTestDropTarget({ x: 50, y: 33 }, 'd')).toBeNull();
    });

    it('rotated 45° (clockwise): the zone leans up-right / down-left', () => {
        zone(45);
        // Hand-computed: the drawn ends sit near (62.7, 37.3) and (37.3, 62.7).
        expect(hitTestDropTarget({ x: 60, y: 40 }, 'd')?.id).toBe('z');   // upper-right arm
        expect(hitTestDropTarget({ x: 40, y: 60 }, 'd')?.id).toBe('z');   // lower-left arm
        // Straight below centre — the OLD unrotated footprint — is now outside.
        expect(hitTestDropTarget({ x: 50, y: 65 }, 'd')).toBeNull();
        // And the opposite diagonal, where the zone does not lean, misses.
        expect(hitTestDropTarget({ x: 60, y: 60 }, 'd')).toBeNull();
    });

    it('the centre always hits, whatever the angle', () => {
        for (const angle of [0, 30, 45, 90, 180, -60]) {
            while (unregs.length) unregs.pop()!();
            zone(angle);
            expect(hitTestDropTarget({ x: 50, y: 50 }, 'd')?.id).toBe('z');
        }
    });

    it('rotation 0 and undefined behave identically', () => {
        zone(0);
        expect(hitTestDropTarget({ x: 50, y: 35 }, 'd')?.id).toBe('z');
        expect(hitTestDropTarget({ x: 65, y: 50 }, 'd')).toBeNull();
    });

    it('a full turn (360°) equals no rotation', () => {
        zone(360);
        expect(hitTestDropTarget({ x: 50, y: 35 }, 'd')?.id).toBe('z');
        expect(hitTestDropTarget({ x: 65, y: 50 }, 'd')).toBeNull();
    });
});
