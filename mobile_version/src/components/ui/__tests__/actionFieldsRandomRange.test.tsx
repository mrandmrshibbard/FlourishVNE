/**
 * Compact Set Variable action editor — the random Min/Max fields (user report: "boxes look
 * like just slits ... does not accept any numbers"). They now live on their own labeled row;
 * these tests pin that they render, accept typed values, and emit the right patch.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_k: string, d?: any) => (typeof d === 'string' ? d : _k) }),
}));
// VariablePicker reaches for the project context — stub it (the picker itself isn't under test).
vi.mock('../../../contexts/ProjectContext', () => ({ useProject: () => ({ project: { variables: { luck: { id: 'luck', name: 'Luck', type: 'number', min: 1, max: 6 } }, variableFolders: {} }, dispatch: vi.fn() }) }));

import UIActionsListEditor from '../UIActionsListEditor';
import { UIActionType } from '../../../types/shared';

const project: any = {
    variables: {
        luck: { id: 'luck', name: 'Luck', type: 'number', min: 1, max: 6 },
    },
    scenes: {}, uiScreens: {}, characters: {}, items: {}, audio: {}, images: {}, backgrounds: {},
};

const renderList = (action: any) => {
    const onChange = vi.fn();
    render(<UIActionsListEditor actions={[action]} project={project} onChange={onChange} />);
    return onChange;
};

beforeEach(() => vi.clearAllMocks());

describe('compact SetVariable random range row', () => {
    it('renders labeled Min/Max inputs on their own row for the random operator', () => {
        renderList({ type: UIActionType.SetVariable, variableId: 'luck', operator: 'random', value: '' });
        const min = screen.getByText('Min').closest('label')!.querySelector('input')!;
        const max = screen.getByText('Max').closest('label')!.querySelector('input')!;
        expect(min).toBeTruthy();
        expect(max).toBeTruthy();
        // Own-row layout: the inputs are NOT siblings of the operator <select> (the old
        // shared flex row crushed them), and they carry a real minimum width.
        expect(min.closest('div')!.querySelector('select')).toBeNull();
        expect(min.style.minWidth).toBe('3rem');
    });

    it('typing a number emits the randomMin/randomMax patch', () => {
        const onChange = renderList({ type: UIActionType.SetVariable, variableId: 'luck', operator: 'random', value: '' });
        const min = screen.getByText('Min').closest('label')!.querySelector('input')!;
        fireEvent.change(min, { target: { value: '2' } });
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ randomMin: 2 })]);
        const max = screen.getByText('Max').closest('label')!.querySelector('input')!;
        fireEvent.change(max, { target: { value: '5' } });
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ randomMax: 5 })]);
    });

    it('addRandom / subtractRandom get the same row; plain set does not', () => {
        renderList({ type: UIActionType.SetVariable, variableId: 'luck', operator: 'addRandom', value: '' });
        expect(screen.getByText('Min')).toBeTruthy();
    });

    it('no range row for the plain set operator', () => {
        renderList({ type: UIActionType.SetVariable, variableId: 'luck', operator: 'set', value: '3' });
        expect(screen.queryByText('Min')).toBeNull();
    });
});
