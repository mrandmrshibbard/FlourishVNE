import { describe, it, expect } from 'vitest';
import { statReducer } from '../statReducer';
import { VNProject } from '../../../../types/project';

// Minimal project containing only what the stat reducer touches.
const makeProject = (over: Partial<VNProject> = {}): VNProject => ({
    variables: {},
    characters: {
        alice: { id: 'alice', name: 'Alice' },
        bob: { id: 'bob', name: 'Bob' },
    },
    stats: {},
    ...over,
} as unknown as VNProject);

describe('statReducer', () => {
    it('ADD_STAT (global) materializes one backing variable with the stat range', () => {
        const out = statReducer(makeProject(), {
            type: 'ADD_STAT',
            payload: { id: 's1', name: 'Reputation', min: 0, max: 100, defaultValue: 10 },
        });
        const stat = out.stats!.s1;
        expect(stat.appliesTo).toBe('global');
        const varId = stat.variableIds.global;
        const v = out.variables[varId] as any;
        expect(v).toBeDefined();
        expect(v.name).toBe('Reputation');
        expect(v.type).toBe('number');
        expect(v.min).toBe(0);
        expect(v.max).toBe(100);
        expect(v.defaultValue).toBe(10);
        expect(v.isInternal).toBeUndefined(); // public, like item count vars
    });

    it('ADD_STAT (per-character) materializes one variable per character, named "Char — Stat"', () => {
        const out = statReducer(makeProject(), {
            type: 'ADD_STAT',
            payload: { id: 's1', name: 'Affection', appliesTo: 'characters', characterIds: ['alice', 'bob'] },
        });
        const stat = out.stats!.s1;
        expect(Object.keys(stat.variableIds).sort()).toEqual(['alice', 'bob']);
        expect((out.variables[stat.variableIds.alice] as any).name).toBe('Alice — Affection');
        expect((out.variables[stat.variableIds.bob] as any).name).toBe('Bob — Affection');
    });

    it('UPDATE_STAT renaming re-syncs every backing variable name', () => {
        let p = statReducer(makeProject(), {
            type: 'ADD_STAT',
            payload: { id: 's1', name: 'Affection', appliesTo: 'characters', characterIds: ['alice'] },
        });
        p = statReducer(p, { type: 'UPDATE_STAT', payload: { statId: 's1', updates: { name: 'Love' } } });
        const varId = p.stats!.s1.variableIds.alice;
        expect((p.variables[varId] as any).name).toBe('Alice — Love');
    });

    it('UPDATE_STAT range changes write through to backing variables', () => {
        let p = statReducer(makeProject(), { type: 'ADD_STAT', payload: { id: 's1', name: 'HP', max: 100 } });
        p = statReducer(p, { type: 'UPDATE_STAT', payload: { statId: 's1', updates: { max: 200, defaultValue: 50 } } });
        const v = p.variables[p.stats!.s1.variableIds.global] as any;
        expect(v.max).toBe(200);
        expect(v.defaultValue).toBe(50);
    });

    it('SET_STAT_CHARACTERS adds and removes backing variables by diff', () => {
        let p = statReducer(makeProject(), {
            type: 'ADD_STAT',
            payload: { id: 's1', name: 'Affection', appliesTo: 'characters', characterIds: ['alice'] },
        });
        const aliceVar = p.stats!.s1.variableIds.alice;
        p = statReducer(p, { type: 'SET_STAT_CHARACTERS', payload: { statId: 's1', characterIds: ['bob'] } });
        const stat = p.stats!.s1;
        expect(stat.variableIds.alice).toBeUndefined();
        expect(p.variables[aliceVar]).toBeUndefined(); // removed char's var deleted
        expect((p.variables[stat.variableIds.bob] as any).name).toBe('Bob — Affection');
        expect(stat.characterIds).toEqual(['bob']);
    });

    it('DELETE_STAT keeps variables by default, deletes them when asked', () => {
        let p = statReducer(makeProject(), { type: 'ADD_STAT', payload: { id: 's1', name: 'HP' } });
        const varId = p.stats!.s1.variableIds.global;
        const kept = statReducer(p, { type: 'DELETE_STAT', payload: { statId: 's1' } });
        expect(kept.stats!.s1).toBeUndefined();
        expect(kept.variables[varId]).toBeDefined();
        const purged = statReducer(p, { type: 'DELETE_STAT', payload: { statId: 's1', deleteVariables: true } });
        expect(purged.variables[varId]).toBeUndefined();
    });

    it('ignores unrelated actions (returns same reference for rootReducer short-circuit)', () => {
        const p = makeProject();
        expect(statReducer(p, { type: 'SOMETHING_ELSE' } as any)).toBe(p);
    });
});
