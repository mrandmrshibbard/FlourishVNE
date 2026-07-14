import { describe, it, expect } from 'vitest';
import {
    describeSetVariable, summarizeSetVariable, describeTextInput, describeResetVariable,
    variableLabel, valueLabel, englishT,
} from '../variableLanguage';
import { VNProject } from '../../types/project';
import { VNVariable } from '../../features/variables/types';

const vars: Record<string, VNVariable> = {
    affection: {
        id: 'affection', name: 'Affection', type: 'number', defaultValue: 0, min: 0, max: 100, icon: '❤️',
        bands: [
            { id: 'b-stranger', name: 'Stranger', min: 0 },
            { id: 'b-friend', name: 'Friend', min: 41 },
        ],
    },
    door: { id: 'door', name: 'Front Door', type: 'boolean', defaultValue: false, trueLabel: 'Locked', falseLabel: 'Unlocked' },
    route: { id: 'route', name: 'Route', type: 'string', defaultValue: '' },
    gold: { id: 'gold', name: 'Gold', type: 'number', defaultValue: 0 },
};
const project = { variables: vars } as unknown as VNProject;

describe('describeSetVariable — the sentence an author reads', () => {
    it('says what it DOES, in English, not in operator tokens', () => {
        // The command list used to render this exact command as "Set Affection add 1".
        expect(describeSetVariable(project, { variableId: 'affection', operator: 'add', value: 1 }))
            .toBe('Increase ❤️ Affection by 1');
        expect(describeSetVariable(project, { variableId: 'affection', operator: 'subtract', value: 5 }))
            .toBe('Decrease ❤️ Affection by 5');
    });

    it('uses the author’s own boolean labels', () => {
        expect(describeSetVariable(project, { variableId: 'door', operator: 'set', value: true }))
            .toBe('Set Front Door to Locked');
        expect(describeSetVariable(project, { variableId: 'door', operator: 'set', value: false }))
            .toBe('Set Front Door to Unlocked');
    });

    it('names the band a number lands in — "45" alone tells nobody anything', () => {
        expect(describeSetVariable(project, { variableId: 'affection', operator: 'set', value: 45 }))
            .toBe('Set ❤️ Affection to 45 (Friend)');
        // No bands → just the number, unchanged.
        expect(describeSetVariable(project, { variableId: 'gold', operator: 'set', value: 45 }))
            .toBe('Set Gold to 45');
    });

    it('spells out a random range', () => {
        expect(describeSetVariable(project, { variableId: 'gold', operator: 'random', randomMin: 5, randomMax: 20 }))
            .toBe('Set Gold to a random number from 5 to 20');
    });

    it('quotes text values', () => {
        expect(describeSetVariable(project, { variableId: 'route', operator: 'set', value: 'sunny' }))
            .toBe('Set Route to “sunny”');
    });

    it('says so plainly when the variable was deleted, instead of printing a raw id', () => {
        expect(describeSetVariable(project, { variableId: 'ghost', operator: 'set', value: 1 }))
            .toBe('Set a variable that no longer exists');
    });
});

describe('summarizeSetVariable — the compact badge form', () => {
    it('still shows the DIRECTION and the AMOUNT (the old chip showed neither)', () => {
        expect(summarizeSetVariable(project, { variableId: 'affection', operator: 'add', value: 1 })).toBe('❤️ Affection +1');
        expect(summarizeSetVariable(project, { variableId: 'affection', operator: 'subtract', value: 2 })).toBe('❤️ Affection −2');
        expect(summarizeSetVariable(project, { variableId: 'gold', operator: 'set', value: 10 })).toBe('Gold = 10');
        expect(summarizeSetVariable(project, { variableId: 'door', operator: 'set', value: true })).toBe('Front Door → Locked');
    });

    it('uses a real minus sign, not a hyphen — this is read, not parsed', () => {
        expect(summarizeSetVariable(project, { variableId: 'gold', operator: 'subtract', value: 3 })).toContain('−');
    });
});

describe('describeTextInput / describeResetVariable', () => {
    it('reads as an instruction', () => {
        expect(describeTextInput(project, { variableId: 'route', prompt: 'Your name?' }))
            .toBe('Ask “Your name?” and put the answer in Route');
        expect(describeTextInput(project, { variableId: 'route' }))
            .toBe('Put what the player types into Route');
    });

    it('handles reset, including reset-everything', () => {
        expect(describeResetVariable(project, 'gold')).toBe('Put Gold back to how it started');
        expect(describeResetVariable(project, undefined)).toBe('Put every variable back to how it started');
    });
});

describe('the pieces', () => {
    it('variableLabel carries the author’s emoji', () => {
        expect(variableLabel(vars.affection)).toBe('❤️ Affection');
        expect(variableLabel(vars.gold)).toBe('Gold');
        expect(variableLabel(undefined)).toBe('a variable');
    });

    it('valueLabel resolves booleans and bands', () => {
        expect(valueLabel(vars.door, true)).toBe('Locked');
        expect(valueLabel(vars.affection, 10)).toBe('10 (Stranger)');
        expect(valueLabel(vars.gold, 10)).toBe('10');
    });

    it('englishT fills placeholders (it is what every non-i18n caller gets)', () => {
        expect(englishT('x', 'Increase {{name}} by {{value}}', { name: 'Gold', value: 3 })).toBe('Increase Gold by 3');
        // An unknown placeholder is left alone rather than printed as "undefined".
        expect(englishT('x', 'Hello {{missing}}')).toBe('Hello {{missing}}');
    });

    it('a real translator is used when given one — the same sentence, translated', () => {
        const fakeT = (key: string) => (key === 'vars.preview.add' ? 'AUGMENTER' : key);
        expect(describeSetVariable(project, { variableId: 'gold', operator: 'add', value: 1 }, fakeT as any))
            .toBe('AUGMENTER');
    });
});
