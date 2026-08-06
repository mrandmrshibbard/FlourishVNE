/**
 * Set Variable value sources (user request, upgraded by Brad): the value can be another
 * variable's current value, or a CALCULATION over variables/numbers — folded strictly left to
 * right, no operator precedence, with an author-chosen rounding (absent = nearest). Old
 * projects carry none of the new fields and must behave bit-for-bit as before.
 */
import { describe, it, expect } from 'vitest';
import { resolveSetVariableValue, calculateVariableValue } from '../variableUtils';
import { resolveConditionValue } from '../conditionLogic';
import { evaluateConditions } from '../../components/live-preview/systems/conditionEvaluator';
import { createCommand } from '../commandFactory';
import { CommandType } from '../../features/scene/types';
import { defaultActionForType } from '../actionMeta';
import { UIActionType } from '../../types/shared';

const vars = { gold: 10, luck: 3, name: 'Yuki', flag: true } as Record<string, string | number | boolean>;

describe('resolveSetVariableValue — identity for old projects', () => {
    it('absent valueSource returns spec.value untouched (string/number/boolean)', () => {
        expect(resolveSetVariableValue({ value: 'hello' }, vars)).toBe('hello');
        expect(resolveSetVariableValue({ value: 42 }, vars)).toBe(42);
        expect(resolveSetVariableValue({ value: false }, vars)).toBe(false);
        expect(resolveSetVariableValue({ value: '' }, vars)).toBe('');
    });
});

describe('resolveSetVariableValue — another variable', () => {
    it('reads the referenced variable', () => {
        expect(resolveSetVariableValue({ value: 0, valueSource: 'variable', valueVariableId: 'luck' }, vars)).toBe(3);
        expect(resolveSetVariableValue({ value: '', valueSource: 'variable', valueVariableId: 'name' }, vars)).toBe('Yuki');
    });
    it('dangling id falls back to the typed value', () => {
        expect(resolveSetVariableValue({ value: 7, valueSource: 'variable', valueVariableId: 'gone' }, vars)).toBe(7);
    });
});

describe('resolveSetVariableValue — calculation', () => {
    const calcSpec = (calc: any, value: any = 0) => ({ value, valueSource: 'calc' as const, calc });

    it('folds strictly left to right: 2 plus 3 times 4 = 20, not 14', () => {
        const calc = {
            first: { source: 'number', value: 2 },
            steps: [
                { op: 'add', source: 'number', value: 3 },
                { op: 'multiply', source: 'number', value: 4 },
            ],
            round: 'none',
        };
        expect(resolveSetVariableValue(calcSpec(calc), vars)).toBe(20);
    });
    it('reads variables as operands: Gold plus Luck times 2 = 26', () => {
        const calc = {
            first: { source: 'variable', variableId: 'gold' },
            steps: [
                { op: 'add', source: 'variable', variableId: 'luck' },
                { op: 'multiply', source: 'number', value: 2 },
            ],
        };
        expect(resolveSetVariableValue(calcSpec(calc), vars)).toBe(26);
    });
    it('percent of: 20 percent of 250 is 50', () => {
        const calc = {
            first: { source: 'number', value: 250 },
            steps: [{ op: 'percentOf', source: 'number', value: 20 }],
        };
        expect(resolveSetVariableValue(calcSpec(calc), vars)).toBe(50);
    });
    it('dividing by zero skips the step (keeps the running result)', () => {
        const calc = {
            first: { source: 'number', value: 12 },
            steps: [
                { op: 'divide', source: 'number', value: 0 },
                { op: 'add', source: 'number', value: 1 },
            ],
        };
        expect(resolveSetVariableValue(calcSpec(calc), vars)).toBe(13);
    });
    it('a dangling variable operand skips the step', () => {
        const calc = {
            first: { source: 'number', value: 5 },
            steps: [{ op: 'add', source: 'variable', variableId: 'gone' }],
        };
        expect(resolveSetVariableValue(calcSpec(calc), vars)).toBe(5);
    });
    it('a broken first operand starts from the typed value when usable, else 0', () => {
        const calc = { first: { source: 'variable', variableId: 'gone' }, steps: [{ op: 'add', source: 'number', value: 2 }] };
        expect(resolveSetVariableValue(calcSpec(calc, 10), vars)).toBe(12);
        expect(resolveSetVariableValue(calcSpec(calc, ''), vars)).toBe(2);
    });
    it('rounding: absent = nearest; none / down / up honored', () => {
        const base = { first: { source: 'number', value: 10 }, steps: [{ op: 'divide', source: 'number', value: 3 }] };
        expect(resolveSetVariableValue(calcSpec({ ...base }), vars)).toBe(3);                    // absent → nearest
        expect(resolveSetVariableValue(calcSpec({ ...base, round: 'none' }), vars)).toBeCloseTo(10 / 3);
        expect(resolveSetVariableValue(calcSpec({ ...base, round: 'down' }), vars)).toBe(3);
        expect(resolveSetVariableValue(calcSpec({ ...base, round: 'up' }), vars)).toBe(4);
        const half = { first: { source: 'number', value: 7 }, steps: [{ op: 'divide', source: 'number', value: 2 }] };
        expect(resolveSetVariableValue(calcSpec({ ...half, round: 'up' }), vars)).toBe(4);
        expect(resolveSetVariableValue(calcSpec({ ...half, round: 'down' }), vars)).toBe(3);
    });
    it('composes with the operator: Add + calc = clamp(current + rounded calc)', () => {
        const calc = { first: { source: 'variable', variableId: 'luck' }, steps: [{ op: 'multiply', source: 'number', value: 2 }] };
        const change = resolveSetVariableValue(calcSpec(calc), vars); // 6
        const result = calculateVariableValue('add', 'number', 95, change, undefined, undefined, undefined, 0, 100);
        expect(result).toBe(100); // 95 + 6 clamped to the variable's max
    });
    it('never returns NaN or Infinity, even from hostile specs', () => {
        const hostile: any[] = [
            { value: 'x', valueSource: 'calc', calc: { first: { source: 'variable', variableId: 'name' }, steps: [] } },
            { value: 1, valueSource: 'calc', calc: { first: { source: 'number', value: 1e308 }, steps: [{ op: 'multiply', source: 'number', value: 1e308 }] } },
            { value: 1, valueSource: 'calc', calc: { first: { source: 'number' }, steps: [{ op: 'divide', source: 'variable' }] } },
            { value: undefined, valueSource: 'calc', calc: { first: {}, steps: [{ op: 'percentOf' }] } },
        ];
        for (const spec of hostile) {
            const v = resolveSetVariableValue(spec, vars);
            expect(typeof v === 'number' ? Number.isFinite(v) : true).toBe(true);
        }
    });
});

describe('compare-to-variable conditions', () => {
    it('resolveConditionValue reads the other variable; dangling falls back to the literal', () => {
        expect(resolveConditionValue({ variableId: 'gold', operator: '>', value: 99, compareVariableId: 'luck' } as any, vars)).toBe(3);
        expect(resolveConditionValue({ variableId: 'gold', operator: '>', value: 99, compareVariableId: 'gone' } as any, vars)).toBe(99);
        expect(resolveConditionValue({ variableId: 'gold', operator: '>', value: 99 } as any, vars)).toBe(99);
    });
    it('evaluateConditions compares variable vs variable for numbers', () => {
        expect(evaluateConditions([{ variableId: 'gold', operator: '>', value: 0, compareVariableId: 'luck' } as any], vars)).toBe(true);  // 10 > 3
        expect(evaluateConditions([{ variableId: 'luck', operator: '>', value: 0, compareVariableId: 'gold' } as any], vars)).toBe(false); // 3 > 10
        expect(evaluateConditions([{ variableId: 'gold', operator: '==', value: 0, compareVariableId: 'gold' } as any], vars)).toBe(true);
    });
    it('works for text too', () => {
        const v2 = { ...vars, secret: 'yuki' };
        expect(evaluateConditions([{ variableId: 'name', operator: '==', value: 'nope', compareVariableId: 'secret' } as any], v2)).toBe(true); // case-insensitive
        expect(evaluateConditions([{ variableId: 'name', operator: 'contains', value: '', compareVariableId: 'secret' } as any], v2)).toBe(true);
    });
    it('dangling compare falls back to the literal (old behavior)', () => {
        expect(evaluateConditions([{ variableId: 'gold', operator: '>', value: 5, compareVariableId: 'gone' } as any], vars)).toBe(true); // 10 > 5
    });
    it('band operators ignore compareVariableId (value stays the band id)', () => {
        const defs: any = { gold: { id: 'gold', name: 'Gold', type: 'number', bands: [{ id: 'b1', name: 'Rich', min: 5, max: 100 }] } };
        expect(evaluateConditions([{ variableId: 'gold', operator: 'inBand', value: 'b1', compareVariableId: 'luck' } as any], vars, defs)).toBe(true);
    });
});

describe('byte-identity: factories never emit the new fields', () => {
    it('createCommand(SetVariable) has no valueSource/valueVariableId/calc keys', () => {
        const project: any = { characters: {}, backgrounds: {}, images: {}, audio: {}, videos: {}, items: {}, scenes: {}, variables: {}, uiScreens: {}, commonEvents: {} };
        const cmd = createCommand(CommandType.SetVariable as any, project) as any;
        expect(cmd).toBeTruthy();
        for (const key of ['valueSource', 'valueVariableId', 'calc']) expect(key in cmd).toBe(false);
    });
    it('defaultActionForType(SetVariable) has no new keys; conditions carry no compareVariableId', () => {
        const project: any = { characters: {}, backgrounds: {}, images: {}, audio: {}, videos: {}, items: {}, scenes: {}, variables: {}, uiScreens: {}, commonEvents: {} };
        const action = defaultActionForType(UIActionType.SetVariable, project) as any;
        expect(action).toBeTruthy();
        for (const key of ['valueSource', 'valueVariableId', 'calc', 'compareVariableId']) expect(JSON.stringify(action)).not.toContain(key);
    });
});
