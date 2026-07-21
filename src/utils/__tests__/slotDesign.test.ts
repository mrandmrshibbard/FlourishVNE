import { describe, it, expect } from 'vitest';
import { formatSlotText, isSlotDesignActive, slotPartVisible } from '../slotDesign';
import { UISlotDesignPart } from '../../features/ui/types';

const SAVE = { timestamp: new Date(2026, 0, 15, 18, 42).getTime(), sceneName: 'The Garden' };

describe('formatSlotText', () => {
    it('fills {slot} and {scene}', () => {
        expect(formatSlotText('Slot {slot} — {scene}', 3, SAVE)).toBe('Slot 3 — The Garden');
    });
    it('fills {date} and {time} with locale strings for an occupied slot', () => {
        const out = formatSlotText('{date} {time}', 1, SAVE);
        expect(out.trim().length).toBeGreaterThan(0);
        expect(out).not.toContain('{date}');
        expect(out).not.toContain('{time}');
    });
    it('empties save-dependent tokens on an empty slot but keeps {slot}', () => {
        expect(formatSlotText('S{slot}:{scene}{date}{time}', 7, null)).toBe('S7:');
    });
    it('is case-insensitive and replaces every occurrence', () => {
        expect(formatSlotText('{SLOT}/{slot}', 2, null)).toBe('2/2');
    });
    it('tolerates empty templates', () => {
        expect(formatSlotText('', 1, SAVE)).toBe('');
    });
});

describe('isSlotDesignActive', () => {
    it('is off when absent or disabled', () => {
        expect(isSlotDesignActive(undefined)).toBe(false);
        expect(isSlotDesignActive({ enabled: false, parts: [{ id: 'a', partType: 'text', x: 0, y: 0, width: 10, height: 10 }] })).toBe(false);
    });
    it('is off when enabled but empty (nothing to draw)', () => {
        expect(isSlotDesignActive({ enabled: true, parts: [] })).toBe(false);
    });
    it('is on with parts or a background', () => {
        expect(isSlotDesignActive({ enabled: true, parts: [{ id: 'a', partType: 'screenshot', x: 0, y: 0, width: 50, height: 50 }] })).toBe(true);
        expect(isSlotDesignActive({ enabled: true, parts: [], background: { type: 'color', value: '#000' } })).toBe(true);
    });
});

describe('slotPartVisible', () => {
    const part = (visibleWhen?: UISlotDesignPart['visibleWhen']): UISlotDesignPart =>
        ({ id: 'p', partType: 'text', x: 0, y: 0, width: 10, height: 10, visibleWhen });
    it('defaults to always', () => {
        expect(slotPartVisible(part(), true)).toBe(true);
        expect(slotPartVisible(part(), false)).toBe(true);
    });
    it('occupied-only parts hide on empty slots', () => {
        expect(slotPartVisible(part('occupied'), true)).toBe(true);
        expect(slotPartVisible(part('occupied'), false)).toBe(false);
    });
    it('empty-only parts hide on occupied slots', () => {
        expect(slotPartVisible(part('empty'), true)).toBe(false);
        expect(slotPartVisible(part('empty'), false)).toBe(true);
    });
});
