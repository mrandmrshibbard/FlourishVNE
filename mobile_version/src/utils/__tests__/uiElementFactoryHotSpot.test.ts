/**
 * The palette's Hot Spot button goes through `createUIElement` — which used to have NO HotSpot
 * case, so the switch fell off the end and the button would have silently done nothing (the same
 * commandFactory failure mode that has bitten before). These pin the case and its two contracts.
 */
import { describe, it, expect } from 'vitest';
import { createUIElement } from '../uiElementFactory';
import { UIElementType } from '../../features/ui/types';

const project: any = { ui: { choiceTextFont: { family: 'x', size: 16, color: '#fff' } } };

describe('createUIElement(HotSpot)', () => {
    it('returns a well-formed hot spot (not undefined — the silent-no-op trap)', () => {
        const el: any = createUIElement(UIElementType.HotSpot, project);
        expect(el).toBeTruthy();
        expect(el.type).toBe(UIElementType.HotSpot);
        expect(el.shape).toBe('rect');
        expect(el.trigger).toBe('click');
        expect(el.actions).toEqual([]);
        expect(el.interactive).toBe(true);      // stays interactive even if draggable is toggled off
    });

    it('🔴 keeps the top-left anchor — hot spots have never been center-anchored', () => {
        const el: any = createUIElement(UIElementType.HotSpot, project);
        expect(el.anchorX).toBe(0);
        expect(el.anchorY).toBe(0);
    });
});
