/**
 * Editor UI for Set Variable value modes (typed / another variable / calculation) and the
 * compare-with-variable condition toggle. Rendered through UIActionsListEditor (compact) and
 * ConditionsEditor, with the house mock pattern (react-i18next + ProjectContext stubs).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_k: string, d?: any) => (typeof d === 'string' ? d : _k) }),
}));
vi.mock('../../../contexts/ProjectContext', () => ({
    useProject: () => ({
        project: {
            variables: {
                gold: { id: 'gold', name: 'Gold', type: 'number' },
                luck: { id: 'luck', name: 'Luck', type: 'number' },
                pass: { id: 'pass', name: 'Password', type: 'string' },
                secret: { id: 'secret', name: 'Secret Word', type: 'string' },
            },
            variableFolders: {},
        },
        dispatch: vi.fn(),
    }),
}));

import UIActionsListEditor from '../UIActionsListEditor';
import ConditionsEditor from '../ConditionsEditor';
import { UIActionType } from '../../../types/shared';

const project: any = {
    variables: {
        gold: { id: 'gold', name: 'Gold', type: 'number' },
        luck: { id: 'luck', name: 'Luck', type: 'number' },
        pass: { id: 'pass', name: 'Password', type: 'string' },
        secret: { id: 'secret', name: 'Secret Word', type: 'string' },
    },
    scenes: {}, uiScreens: {}, characters: {}, items: {}, audio: {}, images: {}, backgrounds: {},
};

const renderAction = (action: any) => {
    const onChange = vi.fn();
    render(<UIActionsListEditor actions={[action]} project={project} onChange={onChange} />);
    return onChange;
};

const modeSelect = () =>
    (screen.getAllByRole('combobox') as HTMLSelectElement[]).find(s =>
        Array.from(s.options).some(o => o.text === 'A calculation'));

beforeEach(() => vi.clearAllMocks());

describe('compact Set Variable value modes', () => {
    it('shows the mode select for number variables (default: A value I type)', () => {
        renderAction({ type: UIActionType.SetVariable, variableId: 'gold', operator: 'set', value: '5' });
        const sel = modeSelect()!;
        expect(sel).toBeTruthy();
        expect(sel.value).toBe('typed');
    });
    it('hides the mode select for random operators and string variables', () => {
        renderAction({ type: UIActionType.SetVariable, variableId: 'gold', operator: 'random', value: '' });
        expect(modeSelect()).toBeUndefined();
    });
    it('switching to "Another variable\'s value" writes valueSource', () => {
        const onChange = renderAction({ type: UIActionType.SetVariable, variableId: 'gold', operator: 'set', value: '5' });
        fireEvent.change(modeSelect()!, { target: { value: 'variable' } });
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ valueSource: 'variable' })]);
    });
    it('switching to "A calculation" seeds a default calc', () => {
        const onChange = renderAction({ type: UIActionType.SetVariable, variableId: 'gold', operator: 'set', value: '5' });
        fireEvent.change(modeSelect()!, { target: { value: 'calc' } });
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({
            valueSource: 'calc',
            calc: { first: { source: 'number', value: 0 }, steps: [] },
        })]);
    });
    it('switching back to typed clears the new fields', () => {
        const onChange = renderAction({
            type: UIActionType.SetVariable, variableId: 'gold', operator: 'set', value: '5',
            valueSource: 'variable', valueVariableId: 'luck',
        });
        fireEvent.change(modeSelect()!, { target: { value: 'typed' } });
        const patch = onChange.mock.calls.at(-1)![0][0];
        expect(patch.valueSource).toBeUndefined();
        expect(patch.valueVariableId).toBeUndefined();
        expect(patch.calc).toBeUndefined();
    });
    it('calc mode renders the calculation editor rows', () => {
        renderAction({
            type: UIActionType.SetVariable, variableId: 'gold', operator: 'set', value: '',
            valueSource: 'calc',
            calc: { first: { source: 'number', value: 2 }, steps: [{ op: 'add', source: 'variable', variableId: 'luck' }] },
        });
        expect(screen.getByText('Start with')).toBeTruthy();
        expect(screen.getByText('Add a step')).toBeTruthy();
        expect(screen.getByText('Then round the answer')).toBeTruthy();
    });
    it('a zero divisor shows the plain warning', () => {
        renderAction({
            type: UIActionType.SetVariable, variableId: 'gold', operator: 'set', value: '',
            valueSource: 'calc',
            calc: { first: { source: 'number', value: 10 }, steps: [{ op: 'divide', source: 'number', value: 0 }] },
        });
        expect(screen.getByText(/Dividing by zero isn't possible/)).toBeTruthy();
    });
});

describe('ConditionsEditor — compare with another variable', () => {
    const renderConditions = (conditions: any[]) => {
        const onChange = vi.fn();
        render(<ConditionsEditor conditions={conditions} project={project} onChange={onChange} />);
        return onChange;
    };
    const compareSelect = () =>
        (screen.getAllByRole('combobox') as HTMLSelectElement[]).find(s =>
            Array.from(s.options).some(o => o.text === 'another variable'));

    it('offers the compare-with toggle for non-boolean conditions', () => {
        renderConditions([{ variableId: 'gold', operator: '>', value: 5 }]);
        const sel = compareSelect()!;
        expect(sel).toBeTruthy();
        expect(sel.value).toBe('typed');
    });
    it('switching to another variable writes compareVariableId', () => {
        const onChange = renderConditions([{ variableId: 'gold', operator: '>', value: 5 }]);
        fireEvent.change(compareSelect()!, { target: { value: 'variable' } });
        expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ compareVariableId: '' })]);
    });
    it('switching back to typed clears compareVariableId', () => {
        const onChange = renderConditions([{ variableId: 'gold', operator: '>', value: 5, compareVariableId: 'luck' }]);
        fireEvent.change(compareSelect()!, { target: { value: 'typed' } });
        const patch = onChange.mock.calls.at(-1)![0][0];
        expect(patch.compareVariableId).toBeUndefined();
    });
});
