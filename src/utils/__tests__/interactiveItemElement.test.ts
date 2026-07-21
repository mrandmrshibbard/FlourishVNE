import { describe, it, expect } from 'vitest';
import { deriveInteractiveElementsFromScreen } from '../interactiveElements';
import { UIElementType } from '../../features/ui/types';

const makeScreen = (itemOverrides: Record<string, unknown> = {}): any => ({
    id: 'scr1', name: 'Room',
    elements: {
        itm1: {
            id: 'itm1', name: 'Key on table', type: UIElementType.Item,
            x: 10, y: 10, width: 10, height: 14,
            itemId: 'it_key', mode: 'display', draggable: true,
            ...itemOverrides,
        },
    },
});

const ITEMS: any = {
    it_key: { id: 'it_key', name: 'Key', icon: { type: 'image', id: 'img1' }, dragTag: 'key', countVariableId: 'var_key_count' },
};

describe('draggable Item element → legacy runtime shape', () => {
    it('translates "Only show while the player has it" into a live count condition', () => {
        const screen = makeScreen({ onlyWhileOwned: true });
        const derived = deriveInteractiveElementsFromScreen(screen, ITEMS);
        const legacy = derived['itm1'] as any;
        expect(legacy).toBeTruthy();
        expect(legacy.conditions).toEqual([
            { variableId: 'var_key_count', operator: '>=', value: 1 },
        ]);
    });

    it('keeps author conditions AND appends the ownership condition', () => {
        const screen = makeScreen({ onlyWhileOwned: true, conditions: [{ variableId: 'v1', operator: '==', value: true }] });
        const derived = deriveInteractiveElementsFromScreen(screen, ITEMS);
        const legacy = derived['itm1'] as any;
        expect(legacy.conditions).toHaveLength(2);
        expect(legacy.conditions[1]).toEqual({ variableId: 'var_key_count', operator: '>=', value: 1 });
    });

    it('adds no condition when the option is off', () => {
        const derived = deriveInteractiveElementsFromScreen(makeScreen(), ITEMS);
        expect((derived['itm1'] as any).conditions).toBeUndefined();
    });

    it('carries the item identity for the drop pipeline (tag + bound item + icon art)', () => {
        const derived = deriveInteractiveElementsFromScreen(makeScreen(), ITEMS);
        const legacy = derived['itm1'] as any;
        expect(legacy.dragTag).toBe('key');
        expect(legacy.boundItemId).toBe('it_key');
        expect(legacy.imageId).toBe('img1');
        expect(legacy.acceptTag).toBeUndefined();
    });
});
