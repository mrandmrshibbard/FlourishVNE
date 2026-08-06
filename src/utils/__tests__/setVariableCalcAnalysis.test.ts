/**
 * Analysis + cleanup layers for Set Variable value sources and compare-to-variable conditions:
 * variableFlow must stay HONEST (abstain, never invent dead gates), variableUsage must index the
 * read side, buildValidator must warn on dangling/miscast refs, and DELETE_VARIABLE must freeze
 * the deleted variable's default into the math (Brad's rule) instead of dropping steps.
 */
import { describe, it, expect } from 'vitest';
import { computeVariableFlow } from '../variableFlow';
import { buildStoryGraph } from '../storyGraph';
import { buildVariableUsageIndex } from '../variableUsage';
import { validateProjectForBuild } from '../buildValidator';
import { variableReducer } from '../../features/variables/state/variableReducer';
import { CommandType } from '../../features/scene/types';
import { UIActionType } from '../../types/shared';

const baseProject = (commands: any[], extraVars: Record<string, any> = {}): any => ({
    id: 'p', name: 'P', startSceneId: 's1',
    scenes: {
        s1: { id: 's1', name: 'Start', commands },
    },
    variables: {
        gold: { id: 'gold', name: 'Gold', type: 'number', defaultValue: 0 },
        luck: { id: 'luck', name: 'Luck', type: 'number', defaultValue: 3, min: 1, max: 6 },
        ...extraVars,
    },
    characters: {}, backgrounds: {}, images: {}, audio: {}, videos: {}, items: {}, uiScreens: {}, commonEvents: {},
    ui: {},
});

describe('variableFlow honesty with dynamic values', () => {
    it('a calc-valued set upstream of a > gate produces NO dead-gate warning and flags incomplete', () => {
        const project = baseProject([
            { id: 'c1', type: CommandType.SetVariable, variableId: 'gold', operator: 'set', value: 0, valueSource: 'calc', calc: { first: { source: 'number', value: 1 }, steps: [] } },
            { id: 'c2', type: CommandType.Dialogue, characterId: null, text: 'hi', conditions: [{ variableId: 'gold', operator: '>', value: 100 }] },
        ]);
        const graph = buildStoryGraph(project);
        const flow = computeVariableFlow(project, graph, 'gold' as any);
        expect(flow.deadGates).toEqual([]);
        // The calc's reach is honestly "anything" (±Infinity), which is what makes the
        // dead-gate analysis abstain — the old code DROPPED the op and would have warned.
        const node = [...flow.nodes.values()].find(n => n.ops.length)!;
        expect(node.leave && !Number.isFinite(node.leave.hi)).toBe(true);
    });
    it('a from-a-BOUNDED-variable set stays finite and honest (no dead gate within bounds)', () => {
        const project = baseProject([
            { id: 'c1', type: CommandType.SetVariable, variableId: 'gold', operator: 'set', value: 0, valueSource: 'variable', valueVariableId: 'luck' },
            { id: 'c2', type: CommandType.Dialogue, characterId: null, text: 'hi', conditions: [{ variableId: 'gold', operator: '>=', value: 6 }] },
        ]);
        const graph = buildStoryGraph(project);
        const flow = computeVariableFlow(project, graph, 'gold' as any);
        expect(flow.deadGates).toEqual([]); // luck can reach 6
        const node = [...flow.nodes.values()].find(n => n.ops.length);
        expect(node?.leave).toEqual({ lo: 1, hi: 6 }); // tightened to the SOURCE variable's bounds
    });
    it('a bounded-source set DOES prove a gate beyond the source range dead', () => {
        const project = baseProject([
            { id: 'c1', type: CommandType.SetVariable, variableId: 'gold', operator: 'set', value: 0, valueSource: 'variable', valueVariableId: 'luck' },
            { id: 'c2', type: CommandType.Dialogue, characterId: null, text: 'hi', conditions: [{ variableId: 'gold', operator: '>', value: 50 }] },
        ]);
        const graph = buildStoryGraph(project);
        const flow = computeVariableFlow(project, graph, 'gold' as any);
        expect(flow.deadGates.length).toBe(1); // gold can only ever be 0 (start) … 6
    });
    it('a compare-to-variable gate is never reported dead', () => {
        const project = baseProject([
            { id: 'c1', type: CommandType.SetVariable, variableId: 'gold', operator: 'set', value: 1 },
            { id: 'c2', type: CommandType.Dialogue, characterId: null, text: 'hi', conditions: [{ variableId: 'gold', operator: '>', value: 100, compareVariableId: 'luck' }] },
        ]);
        const graph = buildStoryGraph(project);
        const flow = computeVariableFlow(project, graph, 'gold' as any);
        expect(flow.deadGates).toEqual([]);
    });
});

describe('variableUsage indexes the read side', () => {
    it('valueVariableId, calc operands, and compareVariableId all show as usages', () => {
        const project = baseProject([
            { id: 'c1', type: CommandType.SetVariable, variableId: 'gold', operator: 'set', value: 0, valueSource: 'calc', calc: { first: { source: 'variable', variableId: 'luck' }, steps: [{ op: 'add', source: 'variable', variableId: 'boost' }] } },
            { id: 'c2', type: CommandType.Dialogue, characterId: null, text: 'hi', conditions: [{ variableId: 'gold', operator: '>', value: 0, compareVariableId: 'boost' }] },
        ], { boost: { id: 'boost', name: 'Boost', type: 'number', defaultValue: 2 } });
        const index = buildVariableUsageIndex(project);
        const luckUses = index.byVariable.get('luck' as any) ?? [];
        expect(luckUses.some(u => /work out/.test(u.what))).toBe(true);
        const boostUses = index.byVariable.get('boost' as any) ?? [];
        expect(boostUses.some(u => /work out/.test(u.what))).toBe(true);
        expect(boostUses.some(u => /Compared against/.test(u.what))).toBe(true);
    });
});

describe('buildValidator warnings', () => {
    it('dangling and non-number math refs + zero divisors + dangling compare refs warn', () => {
        const project = baseProject([
            { id: 'c1', type: CommandType.SetVariable, variableId: 'gold', operator: 'set', value: 0, valueSource: 'variable', valueVariableId: 'gone' },
            { id: 'c2', type: CommandType.SetVariable, variableId: 'gold', operator: 'set', value: 0, valueSource: 'calc', calc: { first: { source: 'variable', variableId: 'word' }, steps: [{ op: 'divide', source: 'number', value: 0 }] } },
            { id: 'c3', type: CommandType.Dialogue, characterId: null, text: 'hi', conditions: [{ variableId: 'gold', operator: '>', value: 0, compareVariableId: 'gone2' }] },
        ], { word: { id: 'word', name: 'Word', type: 'string', defaultValue: '' } });
        const { warnings } = validateProjectForBuild(project);
        const messages = warnings.map(w => w.message).join('\n');
        expect(messages).toMatch(/missing variable \(ID: gone\)/);
        expect(messages).toMatch(/"Word" in math, but it isn't a number/);
        expect(messages).toMatch(/divides by zero/);
        expect(messages).toMatch(/compares against a missing variable \(ID: gone2\)/);
    });
});

describe('DELETE_VARIABLE freeze rules', () => {
    const state = (commands: any[]): any => baseProject(commands, { boost: { id: 'boost', name: 'Boost', type: 'number', defaultValue: 7 } });

    it('valueVariableId reverts to a typed value frozen at the deleted default', () => {
        const s = state([{ id: 'c1', type: CommandType.SetVariable, variableId: 'gold', operator: 'add', value: 1, valueSource: 'variable', valueVariableId: 'boost' }]);
        const next = variableReducer(s, { type: 'DELETE_VARIABLE', payload: { variableId: 'boost' } } as any);
        const cmd = next.scenes.s1.commands[0] as any;
        expect(cmd.valueSource).toBeUndefined();
        expect(cmd.valueVariableId).toBeUndefined();
        expect(cmd.value).toBe(7);
    });
    it('calc operands referencing the deleted variable become frozen numbers', () => {
        const s = state([{ id: 'c1', type: CommandType.SetVariable, variableId: 'gold', operator: 'set', value: 0, valueSource: 'calc', calc: { first: { source: 'variable', variableId: 'boost' }, steps: [{ op: 'add', source: 'variable', variableId: 'luck' }] } }]);
        const next = variableReducer(s, { type: 'DELETE_VARIABLE', payload: { variableId: 'boost' } } as any);
        const cmd = next.scenes.s1.commands[0] as any;
        expect(cmd.calc.first).toEqual({ source: 'number', value: 7 });
        expect(cmd.calc.steps[0]).toEqual({ op: 'add', source: 'variable', variableId: 'luck' }); // untouched
    });
    it('compareVariableId becomes a frozen literal', () => {
        const s = state([{ id: 'c1', type: CommandType.Dialogue, characterId: null, text: 'hi', conditions: [{ variableId: 'gold', operator: '>', value: 0, compareVariableId: 'boost' }] }]);
        const next = variableReducer(s, { type: 'DELETE_VARIABLE', payload: { variableId: 'boost' } } as any);
        const cond = (next.scenes.s1.commands[0] as any).conditions[0];
        expect(cond.compareVariableId).toBeUndefined();
        expect(cond.value).toBe(7);
    });
    it('choice-option actions get the same freeze', () => {
        const s = state([{
            id: 'c1', type: CommandType.Choice, options: [{
                text: 'go',
                actions: [{ type: UIActionType.SetVariable, variableId: 'gold', operator: 'add', value: 0, valueSource: 'variable', valueVariableId: 'boost' }],
            }],
        }]);
        const next = variableReducer(s, { type: 'DELETE_VARIABLE', payload: { variableId: 'boost' } } as any);
        const action = (next.scenes.s1.commands[0] as any).options[0].actions[0];
        expect(action.valueSource).toBeUndefined();
        expect(action.value).toBe(7);
    });
});
