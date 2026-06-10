import { describe, it, expect } from 'vitest';
import { interpolateVariables } from '../variableInterpolation';
import { VNProject } from '../../types/project';

// Minimal project containing only what interpolateVariables touches (variables + empty asset
// collections so the asset-name lookup branch is safe). Cast to VNProject for the call.
const makeProject = (variables: any): VNProject => ({
    variables,
    backgrounds: {}, images: {}, videos: {}, audio: {}, characters: {},
} as unknown as VNProject);

describe('interpolateVariables — boolean labels', () => {
    it('renders a boolean with no custom labels as Yes/No', () => {
        const project = makeProject({ flag: { id: 'flag', name: 'flag', type: 'boolean', defaultValue: false } });
        expect(interpolateVariables('{flag}', { flag: true }, project)).toBe('Yes');
        expect(interpolateVariables('{flag}', { flag: false }, project)).toBe('No');
    });

    it('uses per-variable trueLabel/falseLabel when set', () => {
        const project = makeProject({
            door: { id: 'door', name: 'door', type: 'boolean', defaultValue: false, trueLabel: 'Locked', falseLabel: 'Unlocked' },
        });
        expect(interpolateVariables('Door is {door}', { door: true }, project)).toBe('Door is Locked');
        expect(interpolateVariables('Door is {door}', { door: false }, project)).toBe('Door is Unlocked');
    });

    it('leaves numbers and strings untouched, and unknown tokens as-is', () => {
        const project = makeProject({
            score: { id: 'score', name: 'score', type: 'number', defaultValue: 0 },
            who: { id: 'who', name: 'who', type: 'string', defaultValue: '' },
        });
        expect(interpolateVariables('Score: {score}', { score: 42 }, project)).toBe('Score: 42');
        expect(interpolateVariables('Hi {who}', { who: 'Sam' }, project)).toBe('Hi Sam');
        expect(interpolateVariables('{missing}', {}, project)).toBe('{missing}');
    });
});
