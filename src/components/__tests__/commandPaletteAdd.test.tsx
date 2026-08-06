/**
 * Events palette "+" click-to-add (user request: add commands without dragging). The palette
 * raises PALETTE_ADD_COMMAND_EVENT; SceneEditor listens and inserts after the selected command
 * or at the end. These tests pin the palette half of that contract.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, d?: any) => (d && typeof d === 'object' && d.defaultValue) ? d.defaultValue : (typeof d === 'string' ? d : k) }),
}));

import CommandPalette, { PALETTE_ADD_COMMAND_EVENT } from '../CommandPalette';
import { CommandType } from '../../features/scene/types';

describe('command palette + buttons', () => {
    it('every visible entry carries a + button that raises the add event with its type', () => {
        const seen: string[] = [];
        const onAdd = (e: Event) => seen.push((e as CustomEvent).detail?.commandType);
        window.addEventListener(PALETTE_ADD_COMMAND_EVENT, onAdd);
        try {
            render(<CommandPalette onDragStart={() => {}} />);
            // Filter to one entry via search, then click its +
            fireEvent.change(screen.getByPlaceholderText(/Search commands/), { target: { value: 'start timer' } });
            const plus = screen.getAllByTitle(/Add to the scene/)[0];
            fireEvent.click(plus);
            expect(seen).toEqual([CommandType.StartTimer]);
        } finally {
            window.removeEventListener(PALETTE_ADD_COMMAND_EVENT, onAdd);
        }
    });
    it('entries stay draggable (the + button does not replace the drag flow)', () => {
        render(<CommandPalette onDragStart={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/Search commands/), { target: { value: 'start timer' } });
        const entry = screen.getByText('Start Timer').closest('div[draggable="true"]');
        expect(entry).toBeTruthy();
    });
});
