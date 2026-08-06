/**
 * Plain-language phrasing for the new Set Variable value modes (another variable / calculation)
 * and compare-to-variable conditions. Sentences are pinned exactly — these are what non-coders
 * read to understand what a command does.
 */
import { describe, it, expect } from 'vitest';
import { describeSetVariable, summarizeSetVariable, describeCalc } from '../variableLanguage';
import { describeConditions } from '../conditionLogic';

const project: any = {
    variables: {
        gold: { id: 'gold', name: 'Gold', type: 'number' },
        luck: { id: 'luck', name: 'Luck', type: 'number' },
        str: { id: 'str', name: 'Strength', type: 'number' },
        estr: { id: 'estr', name: 'Enemy Strength', type: 'number' },
    },
};

describe('describeSetVariable — value from another variable', () => {
    it('set / add / subtract read as sentences', () => {
        expect(describeSetVariable(project, { variableId: 'gold', operator: 'set', valueSource: 'variable', valueVariableId: 'luck' }))
            .toBe('Set Gold to whatever Luck is right now');
        expect(describeSetVariable(project, { variableId: 'gold', operator: 'add', valueSource: 'variable', valueVariableId: 'luck' }))
            .toBe("Increase Gold by Luck's value");
        expect(describeSetVariable(project, { variableId: 'gold', operator: 'subtract', valueSource: 'variable', valueVariableId: 'luck' }))
            .toBe("Decrease Gold by Luck's value");
    });
    it('a dangling reference says so plainly', () => {
        expect(describeSetVariable(project, { variableId: 'gold', operator: 'set', valueSource: 'variable', valueVariableId: 'gone' }))
            .toBe('Set Gold to whatever a missing variable is right now');
    });
});

describe('describeSetVariable — calculation', () => {
    const calc: any = {
        first: { source: 'variable', variableId: 'gold' },
        steps: [
            { op: 'add', source: 'variable', variableId: 'luck' },
            { op: 'multiply', source: 'number', value: 2 },
        ],
    };
    it('reads the chain in words with the rounding and top-to-bottom tail', () => {
        expect(describeSetVariable(project, { variableId: 'gold', operator: 'set', valueSource: 'calc', calc }))
            .toBe('Set Gold to: Gold plus Luck times 2, rounded to a whole number — worked out top to bottom');
    });
    it('Add + calc reads as an increase', () => {
        expect(describeSetVariable(project, { variableId: 'gold', operator: 'add', valueSource: 'calc', calc }))
            .toBe('Increase Gold by: Gold plus Luck times 2, rounded to a whole number — worked out top to bottom');
    });
    it('round wording varies; one step drops the order tail', () => {
        const one: any = { first: { source: 'number', value: 10 }, steps: [{ op: 'divide', source: 'number', value: 3 }], round: 'none' };
        expect(describeCalc(project, one)).toBe('10 divided by 3, keeping the decimals');
        expect(describeCalc(project, { ...one, round: 'down' })).toBe('10 divided by 3, rounded down');
        expect(describeCalc(project, { ...one, round: 'up' })).toBe('10 divided by 3, rounded up');
    });
    it('percent-of reads as "then take X% of it"', () => {
        const pc: any = { first: { source: 'variable', variableId: 'gold' }, steps: [{ op: 'percentOf', source: 'number', value: 20 }] };
        expect(describeCalc(project, pc)).toBe('Gold then take 20% of it, rounded to a whole number');
    });
});

describe('summarizeSetVariable — compact chips stay words', () => {
    it('variable mode', () => {
        expect(summarizeSetVariable(project, { variableId: 'gold', operator: 'set', valueSource: 'variable', valueVariableId: 'luck' })).toBe('Gold = Luck');
        expect(summarizeSetVariable(project, { variableId: 'gold', operator: 'add', valueSource: 'variable', valueVariableId: 'luck' })).toBe('Gold + Luck');
    });
    it('calc mode truncates to the first term + step count', () => {
        const calc: any = { first: { source: 'variable', variableId: 'gold' }, steps: [{ op: 'add', source: 'variable', variableId: 'luck' }, { op: 'multiply', source: 'number', value: 2 }] };
        expect(summarizeSetVariable(project, { variableId: 'gold', operator: 'set', valueSource: 'calc', calc })).toBe('Gold = Gold… (2 steps)');
        const one: any = { first: { source: 'number', value: 5 }, steps: [{ op: 'add', source: 'variable', variableId: 'luck' }] };
        expect(summarizeSetVariable(project, { variableId: 'gold', operator: 'set', valueSource: 'calc', calc: one })).toBe('Gold = 5… (1 step)');
    });
    it('typed values keep the old chips untouched', () => {
        expect(summarizeSetVariable(project, { variableId: 'gold', operator: 'add', value: 1 })).toBe('Gold +1');
    });
});

describe('describeConditions — compare with another variable', () => {
    it('names the other variable', () => {
        expect(describeConditions([{ variableId: 'str', operator: '>', value: '', compareVariableId: 'estr' } as any], project.variables))
            .toBe('Strength is more than Enemy Strength');
    });
    it('dangling compare says so', () => {
        expect(describeConditions([{ variableId: 'str', operator: '>', value: 5, compareVariableId: 'gone' } as any], project.variables))
            .toBe('Strength is more than a variable that no longer exists');
    });
    it('literal conditions unchanged', () => {
        expect(describeConditions([{ variableId: 'str', operator: '>=', value: 5 } as any], project.variables))
            .toBe('Strength is at least 5');
    });
});
