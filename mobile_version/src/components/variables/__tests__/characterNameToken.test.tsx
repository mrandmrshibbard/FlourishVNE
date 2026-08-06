/**
 * The { } token affordance for character NAME fields + the usage-index coverage that makes
 * name tokens visible to the X-ray and the delete-variable confirmation.
 */
import React, { useRef, useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_k: string, d?: any) => (typeof d === 'string' ? d : _k) }),
}));
vi.mock('../../../contexts/ProjectContext', () => ({
    useProject: () => ({
        project: {
            variables: { nick: { id: 'nick', name: 'Nickname', type: 'string' } },
            variableFolders: {},
        },
        dispatch: vi.fn(),
    }),
}));

import VariableTokenButton from '../VariableTokenButton';
import { buildVariableUsageIndex } from '../../../utils/variableUsage';

/** Minimal host mirroring the character editors' wiring: input + ref + token button. */
const NameFieldHost: React.FC<{ onName: (name: string) => void }> = ({ onName }) => {
    const ref = useRef<HTMLInputElement>(null);
    const [name, setName] = useState('???');
    return (
        <div>
            <input ref={ref} value={name} onChange={e => { setName(e.target.value); onName(e.target.value); }} />
            <VariableTokenButton targetRef={ref} value={name} onChange={n => { setName(n); onName(n); }} />
        </div>
    );
};

describe('name field token button', () => {
    it('inserting a variable produces a {Nickname} token through the same onChange the editors use', async () => {
        const onName = vi.fn();
        render(<NameFieldHost onName={onName} />);
        fireEvent.click(screen.getByText('{ }'));
        // The button swaps itself for a VariablePicker; pick the variable from its list.
        const trigger = await screen.findByRole('button');
        fireEvent.click(trigger);
        const option = await screen.findByText(/Nickname/);
        fireEvent.click(option);
        expect(onName).toHaveBeenCalled();
        const last = onName.mock.calls.at(-1)![0] as string;
        expect(last).toContain('{Nickname}');
    });
});

describe('variableUsage — character names and phone contacts are indexed', () => {
    const project: any = {
        variables: { nick: { id: 'nick', name: 'Nickname', type: 'string' } },
        characters: { yuki: { id: 'yuki', name: '{Nickname}' } },
        ui: { phoneContacts: [{ id: 'c1', characterId: 'yuki', displayName: 'Agent {Nickname}' }] },
        scenes: {}, uiScreens: {}, commonEvents: {}, maps: {}, miniGames: {},
    };
    it('a tokened character name shows as a usage', () => {
        const index = buildVariableUsageIndex(project);
        const uses = index.byVariable.get('nick' as any) ?? [];
        const charUse = uses.find(u => u.location.area === 'character');
        expect(charUse).toBeTruthy();
        expect(charUse!.kind).toBe('show');
        expect(charUse!.canJump).toBe(false);
    });
    it('a tokened phone-contact displayName shows as a usage too', () => {
        const index = buildVariableUsageIndex(project);
        const uses = index.byVariable.get('nick' as any) ?? [];
        expect(uses.some(u => u.location.area === 'phone')).toBe(true);
    });
    it('projects without characters/ui do not throw', () => {
        expect(() => buildVariableUsageIndex({ variables: {}, scenes: {} } as any)).not.toThrow();
    });
});
