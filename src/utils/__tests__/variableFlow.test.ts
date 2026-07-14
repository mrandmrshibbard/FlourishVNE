import { describe, it, expect } from 'vitest';
import { computeVariableFlow, applyOps, fmtRange } from '../variableFlow';
import { buildStoryGraph } from '../storyGraph';
import { VNProject } from '../../types/project';
import { CommandType } from '../../features/scene/types';
import { UIActionType } from '../../types/shared';

const aff = { id: 'aff', name: 'Affection', type: 'number', defaultValue: 0, min: 0, max: 100 } as any;

/** Scenes are walked in RECORD ORDER — the engine falls through to the next one. */
const proj = (scenes: Record<string, any>, variable = aff): VNProject => ({
    id: 'p', name: 'p', startSceneId: Object.keys(scenes)[0],
    variables: { [variable.id]: variable },
    scenes, uiScreens: {}, commonEvents: {}, maps: {}, miniGames: {},
    items: {}, itemCollections: {}, stats: {}, scripts: {}, ui: {},
} as unknown as VNProject);

const scene = (id: string, name: string, commands: any[] = []) => ({ id, name, commands });
const setVar = (op: string, value: number, over: any = {}) =>
    ({ id: `c-${Math.random()}`, type: CommandType.SetVariable, variableId: 'aff', operator: op, value, ...over });

const flowOf = (project: VNProject) => computeVariableFlow(project, buildStoryGraph(project), 'aff' as any);

describe('applyOps — a scene is a function from range to range', () => {
    it('adds', () => {
        expect(applyOps({ lo: 0, hi: 0 }, [{ kind: 'add', value: 5, optional: false }], aff)).toEqual({ lo: 5, hi: 5 });
    });

    it('a MIGHT-happen change widens the range instead of moving it', () => {
        // The whole model in one line: if it's behind a condition, the old value is still possible.
        expect(applyOps({ lo: 0, hi: 0 }, [{ kind: 'add', value: 5, optional: true }], aff)).toEqual({ lo: 0, hi: 5 });
    });

    it('"set" ERASES what came before rather than adding to it', () => {
        expect(applyOps({ lo: 40, hi: 60 }, [{ kind: 'set', value: 10, optional: false }], aff)).toEqual({ lo: 10, hi: 10 });
    });

    it('clamps to the variable’s own min/max, exactly as the engine clamps writes', () => {
        expect(applyOps({ lo: 95, hi: 95 }, [{ kind: 'add', value: 20, optional: false }], aff)).toEqual({ lo: 100, hi: 100 });
        expect(applyOps({ lo: 5, hi: 5 }, [{ kind: 'add', value: -20, optional: false }], aff)).toEqual({ lo: 0, hi: 0 });
    });
});

describe('propagation along the story', () => {
    it('carries the value forward through implicit fall-through', () => {
        const p = proj({
            a: scene('a', 'One', [setVar('add', 5)]),
            b: scene('b', 'Two', [setVar('add', 3)]),
        });
        const f = flowOf(p);
        expect(f.nodes.get('scene:a')!.arrive).toEqual({ lo: 0, hi: 0 });
        expect(f.nodes.get('scene:a')!.leave).toEqual({ lo: 5, hi: 5 });
        expect(f.nodes.get('scene:b')!.arrive).toEqual({ lo: 5, hi: 5 });
        expect(f.nodes.get('scene:b')!.leave).toEqual({ lo: 8, hi: 8 });
    });

    it('a CHOICE makes the arrival a RANGE — the player takes exactly one branch', () => {
        const p = proj({
            a: scene('a', 'One', [{
                id: 'c', type: CommandType.Choice, options: [
                    { text: 'Kind', actions: [{ type: UIActionType.SetVariable, variableId: 'aff', operator: 'add', value: 10 }] },
                    { text: 'Cruel', actions: [{ type: UIActionType.SetVariable, variableId: 'aff', operator: 'subtract', value: 5 }] },
                ],
            }]),
            b: scene('b', 'Two'),
        });
        // 0 → could be −5 (clamped to 0) or +10 → arrives somewhere in 0–10.
        expect(flowOf(p).nodes.get('scene:b')!.arrive).toEqual({ lo: 0, hi: 10 });
    });

    it('a change inside a Branch might not happen', () => {
        const p = proj({
            a: scene('a', 'One', [
                { id: 'bs', type: CommandType.BranchStart, conditions: [] },
                setVar('add', 20),
                { id: 'be', type: CommandType.BranchEnd },
            ]),
            b: scene('b', 'Two'),
        });
        expect(flowOf(p).nodes.get('scene:b')!.arrive).toEqual({ lo: 0, hi: 20 });
    });

    it('summarises what a scene does, in the chip’s words', () => {
        const f = flowOf(proj({
            a: scene('a', 'One', [setVar('add', 5), setVar('subtract', 2)]),
            b: scene('b', 'Two', [setVar('add', 10, { conditions: [{ variableId: 'aff', operator: '>', value: 1 }] })]),
            c: scene('c', 'Three', [setVar('set', 50)]),
        }));
        expect(f.nodes.get('scene:a')!.summary).toBe('+3');
        expect(f.nodes.get('scene:b')!.summary).toBe('0 to +10');
        expect(f.nodes.get('scene:c')!.summary).toBe('set to 50');
    });

    it('marks the edges that carry a changed value — these get the light trail', () => {
        const graph = buildStoryGraph(proj({ a: scene('a', 'One', [setVar('add', 5)]), b: scene('b', 'Two') }));
        const f = computeVariableFlow(proj({ a: scene('a', 'One', [setVar('add', 5)]), b: scene('b', 'Two') }), graph, 'aff' as any);
        const edge = graph.edges.find(e => e.from === 'scene:a')!;
        expect(f.flowingEdges.has(edge.id)).toBe(true);
    });
});

describe('THE PAYOFF — a gate no route can ever open', () => {
    it('finds an ending whose requirement is arithmetically unreachable', () => {
        // The player can gain at most 10 across the whole story, but the good ending wants 70.
        // Nothing errors today; the ending simply never happens.
        const p = proj({
            a: scene('a', 'Meet', [setVar('add', 10)]),
            b: scene('b', 'True Love Ending', [
                { id: 'd', type: CommandType.Dialogue, text: 'She loves you.', conditions: [{ variableId: 'aff', operator: '>=', value: 70 }] },
            ]),
        });
        const gates = flowOf(p).deadGates;
        expect(gates).toHaveLength(1);
        expect(gates[0].nodeName).toBe('True Love Ending');
        expect(gates[0].message).toContain('never happen');
        expect(gates[0].message).toContain('70');
    });

    it('does NOT cry wolf when the gate is reachable', () => {
        const p = proj({
            a: scene('a', 'Meet', [setVar('add', 80)]),
            b: scene('b', 'Ending', [
                { id: 'd', type: CommandType.Dialogue, text: 'hi', conditions: [{ variableId: 'aff', operator: '>=', value: 70 }] },
            ]),
        });
        expect(flowOf(p).deadGates).toEqual([]);
    });

    it('does NOT cry wolf when a CHOICE could get there', () => {
        const p = proj({
            a: scene('a', 'Meet', [{
                id: 'c', type: CommandType.Choice, options: [
                    { text: 'Kind', actions: [{ type: UIActionType.SetVariable, variableId: 'aff', operator: 'add', value: 90 }] },
                    { text: 'Cruel', actions: [] },
                ],
            }]),
            b: scene('b', 'Ending', [
                { id: 'd', type: CommandType.Dialogue, text: 'hi', conditions: [{ variableId: 'aff', operator: '>=', value: 70 }] },
            ]),
        });
        expect(flowOf(p).deadGates).toEqual([]);
    });

    it('stays silent when it cannot be sure — a false alarm is worse than none', () => {
        // The player TYPES the value in, and the variable has no ceiling: it could become anything, so
        // we must not claim any gate is unreachable. (Note the variable must be UNCAPPED for this to be
        // unknowable — a variable capped at 100 genuinely can never reach 9999 no matter what the
        // player types, and flagging THAT is correct, which the next test pins down.)
        const uncapped = { id: 'aff', name: 'Affection', type: 'number', defaultValue: 0 } as any;
        const p = proj({
            a: scene('a', 'Ask', [{ id: 'ti', type: CommandType.TextInput, variableId: 'aff', prompt: 'How much?' }]),
            b: scene('b', 'Ending', [
                { id: 'd', type: CommandType.Dialogue, text: 'hi', conditions: [{ variableId: 'aff', operator: '>=', value: 9999 }] },
            ]),
        }, uncapped);
        expect(flowOf(p).deadGates).toEqual([]);
    });

    it('but a CAPPED variable can never exceed its ceiling, whatever the player types', () => {
        const p = proj({
            a: scene('a', 'Ask', [{ id: 'ti', type: CommandType.TextInput, variableId: 'aff', prompt: 'How much?' }]),
            b: scene('b', 'Ending', [
                { id: 'd', type: CommandType.Dialogue, text: 'hi', conditions: [{ variableId: 'aff', operator: '>=', value: 9999 }] },
            ]),
        });
        expect(flowOf(p).deadGates).toHaveLength(1);   // aff is capped at 100 → 9999 is unreachable, full stop
    });

    it('works on BAND conditions too', () => {
        const banded = { ...aff, bands: [{ id: 'b1', name: 'Stranger', min: 0 }, { id: 'b2', name: 'In love', min: 80 }] };
        const p = proj({
            a: scene('a', 'Meet', [setVar('add', 10)]),
            b: scene('b', 'Wedding', [
                { id: 'd', type: CommandType.Dialogue, text: 'hi', conditions: [{ variableId: 'aff', operator: 'atLeastBand', value: 'b2' }] },
            ]),
        }, banded);
        const gates = flowOf(p).deadGates;
        expect(gates).toHaveLength(1);
        expect(gates[0].message).toContain('In love');
    });
});

describe('story loops', () => {
    it('a loop that keeps adding is reported as unbounded, not as a made-up number', () => {
        // No max → +1 forever. We must not print whatever value the loop happened to stop on.
        const uncapped = { id: 'aff', name: 'Affection', type: 'number', defaultValue: 0 } as any;
        const p = proj({
            a: scene('a', 'Loop', [
                setVar('add', 1),
                { id: 'j', type: CommandType.Jump, targetSceneId: 'a' },
            ]),
        }, uncapped);
        const f = flowOf(p);
        expect(f.nodes.get('scene:a')!.unbounded).toBe(true);
        expect(f.incomplete).toBe(true);
        expect(f.deadGates).toEqual([]);          // never claim a gate is dead in an unbounded region
    });

    it('a CAPPED loop settles, because the engine clamps every write', () => {
        const p = proj({
            a: scene('a', 'Loop', [
                setVar('add', 1),
                { id: 'j', type: CommandType.Jump, targetSceneId: 'a' },
            ]),
        });
        const f = flowOf(p);
        expect(f.nodes.get('scene:a')!.unbounded).toBe(false);
        expect(f.nodes.get('scene:a')!.arrive).toEqual({ lo: 0, hi: 100 });   // capped at max
    });
});

describe('guards', () => {
    it('a non-number variable yields nothing', () => {
        const p = proj({ a: scene('a', 'One') }, { id: 'aff', name: 'x', type: 'string', defaultValue: '' } as any);
        expect(flowOf(p).nodes.size).toBe(0);
    });

    it('fmtRange reads like a person wrote it', () => {
        expect(fmtRange({ lo: 5, hi: 5 })).toBe('5');
        expect(fmtRange({ lo: 5, hi: 20 })).toBe('5–20');
        expect(fmtRange({ lo: -Infinity, hi: Infinity })).toBe('anything');
    });
});
