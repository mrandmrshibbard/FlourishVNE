import { describe, it, expect } from 'vitest';
import {
    compareBand, resolveBand, sortedBands, nextBand, bandRange, describeBand,
    formatBandedValue, hasBands, isBandOperator, makeBand, validateBands, valueIsInBand,
} from '../bands';
import { VNVariable } from '../types';
import { describeConditions } from '../../../utils/conditionLogic';
import { evaluateConditions, setVariableDefinitions } from '../../../components/live-preview/systems/conditionEvaluator';

/** Affection, 0–100, with the classic relationship ladder. */
const affection = (over: Partial<VNVariable> = {}): VNVariable => ({
    id: 'v1', name: 'Affection', type: 'number', defaultValue: 0, min: 0, max: 100,
    bands: [
        { id: 'b-friend', name: 'Friend', min: 41 },       // deliberately NOT in sorted order,
        { id: 'b-stranger', name: 'Stranger', min: 0 },     // to prove we never trust stored order
        { id: 'b-love', name: 'In love', min: 81 },
    ],
    ...over,
});

describe('band resolution', () => {
    it('sorts bands by their starting number, whatever order they were stored in', () => {
        expect(sortedBands(affection()).map(b => b.name)).toEqual(['Stranger', 'Friend', 'In love']);
    });

    it('a value lands in the highest band it reaches', () => {
        const v = affection();
        expect(resolveBand(v, 0)?.name).toBe('Stranger');
        expect(resolveBand(v, 40)?.name).toBe('Stranger');
        expect(resolveBand(v, 41)?.name).toBe('Friend');     // the boundary belongs to the band above
        expect(resolveBand(v, 80)?.name).toBe('Friend');
        expect(resolveBand(v, 81)?.name).toBe('In love');
        expect(resolveBand(v, 999)?.name).toBe('In love');
    });

    it('a value BELOW every band has no band (we show the number rather than invent a name)', () => {
        const v = affection({ bands: [{ id: 'b', name: 'Friend', min: 10 }] });
        expect(resolveBand(v, 3)).toBeNull();
        expect(formatBandedValue({ ...v, showAs: 'band' }, 3)).toBe('3');
    });

    it('ignores values that are not numbers', () => {
        expect(resolveBand(affection(), 'banana')).toBeNull();
    });

    it('hasBands is false for a number with no bands, and for non-numbers', () => {
        expect(hasBands(affection())).toBe(true);
        expect(hasBands({ ...affection(), bands: [] })).toBe(false);
        expect(hasBands({ id: 's', name: 'Route', type: 'string', defaultValue: '', bands: [{ id: 'b', name: 'x', min: 0 }] })).toBe(false);
    });
});

describe('compareBand — the three operators every evaluator delegates here', () => {
    const v = affection();

    it('inBand: the value is inside THIS band, not merely above its floor', () => {
        expect(compareBand(v, 50, 'b-friend', 'inBand')).toBe(true);
        expect(compareBand(v, 40, 'b-friend', 'inBand')).toBe(false);   // still a Stranger
        expect(compareBand(v, 90, 'b-friend', 'inBand')).toBe(false);   // moved past Friend
    });

    it('the TOP band has no ceiling', () => {
        expect(compareBand(v, 100, 'b-love', 'inBand')).toBe(true);
        expect(compareBand(v, 10000, 'b-love', 'inBand')).toBe(true);
    });

    it('atLeastBand: this band OR ANY ABOVE IT — "a Friend or better"', () => {
        expect(compareBand(v, 40, 'b-friend', 'atLeastBand')).toBe(false);
        expect(compareBand(v, 41, 'b-friend', 'atLeastBand')).toBe(true);
        expect(compareBand(v, 95, 'b-friend', 'atLeastBand')).toBe(true);   // In love IS "Friend or better"
    });

    it('belowBand: beneath this band entirely', () => {
        expect(compareBand(v, 40, 'b-friend', 'belowBand')).toBe(true);
        expect(compareBand(v, 41, 'b-friend', 'belowBand')).toBe(false);
    });

    it('a DELETED band reads false rather than throwing — a broken condition must not kill a playthrough', () => {
        expect(compareBand(v, 50, 'b-gone', 'inBand')).toBe(false);
        expect(valueIsInBand(undefined, 50, 'b-friend')).toBe(false);
    });

    it('isBandOperator recognises exactly the three', () => {
        expect(['inBand', 'atLeastBand', 'belowBand'].every(isBandOperator)).toBe(true);
        expect(isBandOperator('>=')).toBe(false);
    });
});

describe('bands survive being edited — the reason they are symbolic, not compiled to numbers', () => {
    it('MOVING a band updates every condition that mentions it, for free', () => {
        // The author decides you have to work harder to be a Friend: 41 → 60.
        const before = affection();
        const after = affection({
            bands: [
                { id: 'b-stranger', name: 'Stranger', min: 0 },
                { id: 'b-friend', name: 'Friend', min: 60 },
                { id: 'b-love', name: 'In love', min: 81 },
            ],
        });
        // The SAME stored condition now means something different — which is what the author wanted.
        // Had we compiled "Friend or better" down to `>= 41`, it would still say 41 here: silently wrong.
        expect(compareBand(before, 50, 'b-friend', 'atLeastBand')).toBe(true);
        expect(compareBand(after, 50, 'b-friend', 'atLeastBand')).toBe(false);
    });

    it('RENAMING a band re-words every condition that mentions it', () => {
        const renamed = affection({
            bands: [
                { id: 'b-stranger', name: 'Stranger', min: 0 },
                { id: 'b-friend', name: 'Best mate', min: 41 },
                { id: 'b-love', name: 'In love', min: 81 },
            ],
        });
        const cond = [{ variableId: 'v1', operator: 'atLeastBand' as const, value: 'b-friend' }];
        expect(describeConditions(cond, { v1: renamed })).toBe('Affection is Best mate or better');
    });
});

describe('bandRange / describeBand', () => {
    it('reads as an inclusive range, and the top band runs on', () => {
        const v = affection();
        const [stranger, friend, love] = sortedBands(v);
        expect(bandRange(v, stranger)).toEqual({ from: 0, to: 40 });
        expect(bandRange(v, friend)).toEqual({ from: 41, to: 80 });
        expect(bandRange(v, love)).toEqual({ from: 81, to: 100 });   // capped by the variable's max
        expect(describeBand(v, friend)).toBe('Friend (41–80)');
    });

    it('refuses to print a fractional range as a whole-number lie', () => {
        // A band above starting at 20.5 means this one ends "just under 20.5" — not 19.5.
        const v = affection({ bands: [{ id: 'a', name: 'Low', min: 0 }, { id: 'b', name: 'High', min: 20.5 }] });
        expect(bandRange(v, sortedBands(v)[0]).to).toBeNull();
        expect(describeBand(v, sortedBands(v)[0])).toBe('Low (0 and up)');
    });

    it('nextBand is null at the top', () => {
        const v = affection();
        expect(nextBand(v, sortedBands(v)[2])).toBeNull();
    });
});

describe('formatBandedValue — what the PLAYER reads in {text}', () => {
    it('is unchanged unless the author opts in (so adding bands never rewrites an existing story)', () => {
        expect(formatBandedValue(affection(), 50)).toBe('50');                       // showAs unset
        expect(formatBandedValue(affection({ showAs: 'number' }), 50)).toBe('50');
    });

    it('prints the word, or both', () => {
        expect(formatBandedValue(affection({ showAs: 'band' }), 50)).toBe('Friend');
        expect(formatBandedValue(affection({ showAs: 'both' }), 50)).toBe('Friend (50)');
    });
});

describe('the evaluator answers band conditions through the definition registry', () => {
    it('resolves inBand from the published definitions', () => {
        setVariableDefinitions({ v1: affection() });
        const cond = [{ variableId: 'v1', operator: 'inBand' as const, value: 'b-friend' }];
        expect(evaluateConditions(cond, { v1: 50 })).toBe(true);
        expect(evaluateConditions(cond, { v1: 90 })).toBe(false);
    });

    it('an explicit definitions argument beats the registry', () => {
        setVariableDefinitions({});
        const cond = [{ variableId: 'v1', operator: 'atLeastBand' as const, value: 'b-friend' }];
        expect(evaluateConditions(cond, { v1: 50 })).toBe(false);              // registry is empty
        expect(evaluateConditions(cond, { v1: 50 }, { v1: affection() })).toBe(true);
    });

    it('combines with ordinary conditions via AND/OR', () => {
        setVariableDefinitions({ v1: affection() });
        expect(evaluateConditions([
            { variableId: 'v1', operator: 'atLeastBand', value: 'b-friend' },
            { variableId: 'v1', operator: '<', value: 90, connector: 'and' },
        ], { v1: 50 })).toBe(true);
    });
});

describe('validateBands — problems an author would otherwise hit at runtime', () => {
    it('flags two bands starting on the same number', () => {
        const v = affection({ bands: [{ id: 'a', name: 'A', min: 10 }, { id: 'b', name: 'B', min: 10 }] });
        expect(validateBands(v).some(p => p.includes('both start at 10'))).toBe(true);
    });

    it('flags a band that can never be reached', () => {
        const v = affection({ max: 50, bands: [{ id: 'a', name: 'A', min: 0 }, { id: 'b', name: 'Unreachable', min: 90 }] });
        expect(validateBands(v).some(p => p.includes('never be reached'))).toBe(true);
    });

    it('flags an unnamed band', () => {
        const v = affection({ bands: [{ id: 'a', name: '', min: 0 }] });
        expect(validateBands(v).some(p => p.includes('no name'))).toBe(true);
    });

    it('says nothing about a healthy ladder', () => {
        expect(validateBands(affection())).toEqual([]);
    });
});

describe('makeBand', () => {
    it('slots a new band above the top one', () => {
        expect(makeBand(affection(), 'x').min).toBe(91);
    });
    it('starts at the variable floor when there are none', () => {
        expect(makeBand({ id: 'v', name: 'n', type: 'number', defaultValue: 0, min: 5 }, 'x').min).toBe(5);
    });
});
