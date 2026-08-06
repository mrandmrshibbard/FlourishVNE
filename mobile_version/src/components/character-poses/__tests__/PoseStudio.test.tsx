/**
 * Pose Studio component: opens with the character's pieces, edits stay LOCAL until Done
 * (exactly one APPLY_CHARACTER_LAYOUT dispatch, normalized), Cancel dispatches nothing,
 * reorder + hide land in the payload, Default disables the hide toggle.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const dispatch = vi.fn();
vi.mock('../../../contexts/ProjectContext', () => ({ useProject: () => ({ dispatch }) }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, d?: any, o?: any) => {
            const s = typeof d === 'string' ? d : _k;
            return s.replace('{{name}}', (o?.name ?? (typeof d === 'object' ? d?.name : '')) ?? '');
        },
    }),
}));

import PoseStudio from '../PoseStudio';

const makeCharacter = (): any => ({
    id: 'c1', name: 'Mia', color: '#fff',
    layers: {
        body: { id: 'body', name: 'Body', assets: { b1: { id: 'b1', name: 'Base Body', imageUrl: 'data:image/png;base64,x' } } },
        hat: { id: 'hat', name: 'Hat', assets: { h1: { id: 'h1', name: 'Cap', imageUrl: 'data:image/png;base64,y' } } },
    },
    expressions: { e1: { id: 'e1', name: 'Default', layerConfiguration: { body: 'b1', hat: 'h1' } } },
    poses: { p1: { id: 'p1', name: 'Side' } },
});
const project: any = { id: 'proj', title: 'P' };

const renderStudio = (initialPoseId: string | null = null) => {
    const character = makeCharacter();
    const onClose = vi.fn();
    render(<PoseStudio character={character} project={project} initialPoseId={initialPoseId} onClose={onClose} />);
    return { character, onClose };
};

beforeEach(() => dispatch.mockClear());

describe('PoseStudio', () => {
    it('lists the pieces front-to-back and renders pose chips', () => {
        renderStudio();
        expect(screen.getByText('Body')).toBeTruthy();
        expect(screen.getByText('Hat')).toBeTruthy();
        // 'Default' appears as both the pose chip and the expression option — both are fine.
        expect(screen.getAllByText('Default').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Side')).toBeTruthy();
    });

    it('Done with no edits dispatches NOTHING (byte-identity)', () => {
        const { onClose } = renderStudio();
        fireEvent.click(screen.getByText('Done'));
        expect(dispatch).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it('a numeric edit commits exactly ONE normalized APPLY_CHARACTER_LAYOUT on Done', () => {
        renderStudio();
        fireEvent.click(screen.getByText('Hat'));
        const xInput = screen.getByText('Across (X) %').parentElement!.querySelector('input')!;
        fireEvent.change(xInput, { target: { value: '10' } });
        fireEvent.click(screen.getByText('Done'));
        expect(dispatch).toHaveBeenCalledTimes(1);
        const action = dispatch.mock.calls[0][0];
        expect(action.type).toBe('APPLY_CHARACTER_LAYOUT');
        expect(action.payload.characterId).toBe('c1');
        expect(action.payload.layerBoxes.hat).toEqual({ x: 10, y: 0, width: 100, height: 100 });
        expect(action.payload.layerPoseBoxes).toBeUndefined();
    });

    it('Cancel discards everything', () => {
        const { onClose } = renderStudio();
        fireEvent.click(screen.getByText('Hat'));
        const xInput = screen.getByText('Across (X) %').parentElement!.querySelector('input')!;
        fireEvent.change(xInput, { target: { value: '25' } });
        fireEvent.click(screen.getByText('Cancel'));
        expect(dispatch).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it('editing on a pose tab writes a POSE override, not the Default layout', () => {
        renderStudio('p1');
        fireEvent.click(screen.getByText('Hat'));
        const yInput = screen.getByText('Down (Y) %').parentElement!.querySelector('input')!;
        fireEvent.change(yInput, { target: { value: '5' } });
        fireEvent.click(screen.getByText('Done'));
        const action = dispatch.mock.calls[0][0];
        expect(action.payload.layerBoxes).toBeUndefined();
        expect(action.payload.layerPoseBoxes.hat.p1).toEqual({ x: 0, y: 5, width: 100, height: 100 });
    });

    it('▲ reorders the pose order and the payload carries it', () => {
        renderStudio('p1');
        // 'Hat' is second in base order (back-to-front: body, hat) → front-first list shows Hat first.
        // Move BODY forward so the pose order changes.
        const bodyRow = screen.getByText('Body').closest('div')!;
        fireEvent.click(bodyRow.querySelector('button[title="Move forward"]')!);
        fireEvent.click(screen.getByText('Done'));
        const action = dispatch.mock.calls[0][0];
        expect(action.payload.poseLayerOrders.p1).toEqual(['hat', 'body']);
    });

    it('the eye hides a piece in a pose; disabled on Default', () => {
        renderStudio('p1');
        const hatRow = screen.getByText('Hat').closest('div')!;
        fireEvent.click(hatRow.querySelector('button[title="Hide in this pose"]')!);
        fireEvent.click(screen.getByText('Done'));
        const action = dispatch.mock.calls[0][0];
        expect(action.payload.poseHiddenLayers.p1).toEqual(['hat']);
    });

    it('hide toggles are disabled on the Default pose', () => {
        renderStudio(null);
        const hatRow = screen.getByText('Hat').closest('div')!;
        const eye = hatRow.querySelector('button[title*="Default pose always shows"]') as HTMLButtonElement;
        expect(eye).toBeTruthy();
        expect(eye.disabled).toBe(true);
    });

    it('unworn layers are tagged, ghosted, and hideable via the toggle', () => {
        const character = makeCharacter();
        // The expression explicitly does NOT wear the hat.
        character.expressions.e1.layerConfiguration = { body: 'b1', hat: null };
        render(<PoseStudio character={character} project={project} initialPoseId={null} onClose={vi.fn()} />);
        // Sidebar marks it
        expect(screen.getByText('(not worn)')).toBeTruthy();
        // Canvas renders it ghosted (opacity 0.4) with the explanatory tooltip
        const ghost = document.querySelector('div[title*="Not in the previewed outfit"]') as HTMLElement;
        expect(ghost).toBeTruthy();
        expect(ghost.style.opacity).toBe('0.4');
        // Toggle off → the ghost piece disappears from the canvas (row stays in the list)
        fireEvent.click(screen.getByText('Show unworn pieces'));
        expect(document.querySelector('div[title*="Not in the previewed outfit"]')).toBeNull();
        expect(screen.getByText('(not worn)')).toBeTruthy();
    });

    it('worn layers render at full opacity with no tag', () => {
        renderStudio();
        expect(screen.queryByText('(not worn)')).toBeNull();
        expect(document.querySelector('div[title*="Not in the previewed outfit"]')).toBeNull();
    });

    it('set-then-reset commits nothing (normalize catches the round trip)', () => {
        renderStudio();
        fireEvent.click(screen.getByText('Hat'));
        const xInput = screen.getByText('Across (X) %').parentElement!.querySelector('input')!;
        fireEvent.change(xInput, { target: { value: '10' } });
        fireEvent.change(xInput, { target: { value: '0' } });
        fireEvent.click(screen.getByText('Done'));
        expect(dispatch).not.toHaveBeenCalled();
    });
});
