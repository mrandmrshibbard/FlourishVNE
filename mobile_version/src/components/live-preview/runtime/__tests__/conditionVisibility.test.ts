/**
 * The fade-on-condition rule for screen elements. Scene commands have had "When the condition
 * changes: instant / fade" for a while; screen elements hard-unmounted with no option — reported
 * with side-by-side screenshots of the two UIs. The contract that must hold: absent the opt-in,
 * behavior is EXACTLY the legacy unmount.
 */
import { describe, it, expect } from 'vitest';
import { conditionVisibilityOf } from '../conditionVisibility';

describe('legacy default — no transition chosen', () => {
    it('🔴 unmounts when conditions fail, mounts plainly when they pass (no styles)', () => {
        expect(conditionVisibilityOf(false, {})).toEqual({ mount: false, style: {} });
        expect(conditionVisibilityOf(true, {})).toEqual({ mount: true, style: {} });
    });
});

describe('fade opt-in', () => {
    const el = { conditionTransition: 'fade' as const };

    it('stays mounted while hidden, transparent and unclickable', () => {
        const v = conditionVisibilityOf(false, el);
        expect(v.mount).toBe(true);
        expect(v.style.opacity).toBe(0);
        expect(v.style.pointerEvents).toBe('none');       // an invisible button must not be clickable
    });

    it('shows with a transition and NO opacity override when conditions pass', () => {
        const v = conditionVisibilityOf(true, el);
        expect(v.mount).toBe(true);
        // undefined, not 1: the element's own opacity (appearance states, entrance transitions)
        // must keep working — forcing 1 here would stamp over them.
        expect(v.style.opacity).toBeUndefined();
        expect(v.style.pointerEvents).toBeUndefined();
        expect(v.style.transition).toContain('opacity');
    });

    it('honours the configured duration, defaulting to 0.3s', () => {
        expect(conditionVisibilityOf(true, el).style.transition).toBe('opacity 0.3s ease');
        expect(conditionVisibilityOf(true, { ...el, conditionTransitionDuration: 1.5 }).style.transition)
            .toBe('opacity 1.5s ease');
    });
});
