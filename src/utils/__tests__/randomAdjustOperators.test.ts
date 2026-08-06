/**
 * addRandom / subtractRandom SetVariable operators (user request): randomly ADJUST the
 * current value by an amount in [randomMin, randomMax] — unlike 'random', which REPLACES it.
 */
import { describe, it, expect } from 'vitest';
import { calculateVariableValue, normalizeSetVariableOperator } from '../variableUtils';
import { describeSetVariable, summarizeSetVariable } from '../variableLanguage';
import { applyOps, FlowOp } from '../variableFlow';

describe('calculateVariableValue addRandom/subtractRandom', () => {
    it('addRandom lands within current + [min, max], every run', () => {
        for (let i = 0; i < 50; i++) {
            const v = calculateVariableValue('addRandom', 'number', 10, 0, 2, 5) as number;
            expect(v).toBeGreaterThanOrEqual(12);
            expect(v).toBeLessThanOrEqual(15);
        }
    });
    it('subtractRandom lands within current - [max, min], every run', () => {
        for (let i = 0; i < 50; i++) {
            const v = calculateVariableValue('subtractRandom', 'number', 10, 0, 2, 5) as number;
            expect(v).toBeGreaterThanOrEqual(5);
            expect(v).toBeLessThanOrEqual(8);
        }
    });
    it('respects the variable min/max clamp bounds', () => {
        for (let i = 0; i < 30; i++) {
            const v = calculateVariableValue('addRandom', 'number', 95, 0, 5, 20, undefined, 0, 100) as number;
            expect(v).toBeLessThanOrEqual(100);
        }
        for (let i = 0; i < 30; i++) {
            const v = calculateVariableValue('subtractRandom', 'number', 5, 0, 5, 20, undefined, 0, 100) as number;
            expect(v).toBeGreaterThanOrEqual(0);
        }
    });
    it("'random' with NO authored range rolls within the variable's bounds — not 0..100-then-clamp", () => {
        // The old default (0..100 clamped into bounds) piled ~95% of rolls onto the max
        // (user report: a 1..6 variable "almost always picks the max number").
        const seen = new Set<number>();
        for (let i = 0; i < 300; i++) {
            const v = calculateVariableValue('random', 'number', 3, 0, undefined, undefined, undefined, 1, 6) as number;
            expect(v).toBeGreaterThanOrEqual(1);
            expect(v).toBeLessThanOrEqual(6);
            seen.add(v);
        }
        // A fair 1..6 roll over 300 tries hits every face (P(miss any) ≈ 0).
        expect(seen.size).toBe(6);
    });
    it("'random' without range OR bounds keeps the legacy 0..100", () => {
        for (let i = 0; i < 20; i++) {
            const v = calculateVariableValue('random', 'number', 0, 0) as number;
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(100);
        }
    });
    it("an authored range still wins over the variable's bounds (then clamps)", () => {
        for (let i = 0; i < 50; i++) {
            const v = calculateVariableValue('random', 'number', 3, 0, 2, 4, undefined, 1, 6) as number;
            expect(v).toBeGreaterThanOrEqual(2);
            expect(v).toBeLessThanOrEqual(4);
        }
    });

    it('treats a missing current value as 0 (same as add/subtract)', () => {
        const v = calculateVariableValue('addRandom', 'number', undefined, 0, 3, 3) as number;
        expect(v).toBe(3);
    });
    it('non-number variables coerce the operators to set', () => {
        expect(normalizeSetVariableOperator('string', 'v', 'addRandom')).toBe('set');
        expect(normalizeSetVariableOperator('boolean', 'v', 'subtractRandom')).toBe('set');
        expect(normalizeSetVariableOperator('number', 'v', 'addRandom')).toBe('addRandom');
    });
});

describe('plain-language previews', () => {
    const project: any = { variables: { v1: { id: 'v1', name: 'Luck', type: 'number' } } };
    it('sentences say increase/decrease by a random amount', () => {
        expect(describeSetVariable(project, { variableId: 'v1', operator: 'addRandom', randomMin: 1, randomMax: 6 }))
            .toBe('Increase Luck by a random amount from 1 to 6');
        expect(describeSetVariable(project, { variableId: 'v1', operator: 'subtractRandom', randomMin: 1, randomMax: 6 }))
            .toBe('Decrease Luck by a random amount from 1 to 6');
    });
    it('compact chips show signed ranges', () => {
        expect(summarizeSetVariable(project, { variableId: 'v1', operator: 'addRandom', randomMin: 1, randomMax: 6 }))
            .toBe('Luck +1–6 (random)');
        expect(summarizeSetVariable(project, { variableId: 'v1', operator: 'subtractRandom', randomMin: 1, randomMax: 6 }))
            .toBe('Luck −1–6 (random)');
    });
});

describe('variableFlow models random adjustments as delta ranges', () => {
    const variable: any = { id: 'v1', name: 'Luck', type: 'number' };
    it('addRange shifts the incoming range by [lo, hi]', () => {
        const ops: FlowOp[] = [{ kind: 'addRange', value: 0, lo: 2, hi: 5, optional: false }];
        expect(applyOps({ lo: 10, hi: 10 }, ops, variable)).toEqual({ lo: 12, hi: 15 });
    });
    it('a negated addRange models subtractRandom', () => {
        const ops: FlowOp[] = [{ kind: 'addRange', value: 0, lo: -5, hi: -2, optional: false }];
        expect(applyOps({ lo: 10, hi: 10 }, ops, variable)).toEqual({ lo: 5, hi: 8 });
    });
    it('optional random adjustments union with the unchanged range', () => {
        const ops: FlowOp[] = [{ kind: 'addRange', value: 0, lo: 2, hi: 5, optional: true }];
        expect(applyOps({ lo: 10, hi: 10 }, ops, variable)).toEqual({ lo: 10, hi: 15 });
    });
});
