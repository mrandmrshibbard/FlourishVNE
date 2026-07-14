import { describe, it, expect } from 'vitest';
import { layoutStoryGraph } from '../storyLayout';
import { StoryGraph, FlowNode, FlowEdge } from '../storyGraph';

const n = (key: string): FlowNode => ({
    key, kind: 'scene', id: key, name: key, subtitle: '',
    isStart: false, isEntry: false, terminals: [], isTerminalOnly: false,
    isUnreachable: false, isDeadEnd: false, hasDynamicExit: false,
});
const e = (from: string, to: string): FlowEdge => ({
    id: `${from}->${to}`, from, to, kind: 'jump', conditional: false, label: '', count: 1,
});
const graph = (nodes: string[], edges: [string, string][], entryPoints: string[] = [nodes[0]]): StoryGraph => ({
    nodes: nodes.map(n),
    edges: edges.map(([a, b]) => e(a, b)),
    entryPoints,
    diagnostics: { unreachable: [], deadEnds: [], endings: [], danglingTargets: [], hasDynamicRoutes: false },
});

describe('layoutStoryGraph', () => {
    it('lays a linear chain out left-to-right with strictly increasing x', () => {
        const r = layoutStoryGraph(graph(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]));
        expect(r.positions['a'].x).toBeLessThan(r.positions['b'].x);
        expect(r.positions['b'].x).toBeLessThan(r.positions['c'].x);
    });

    it('puts the two sides of a diamond in the SAME column, and the join after both', () => {
        const r = layoutStoryGraph(graph(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]));
        expect(r.positions['b'].x).toBe(r.positions['c'].x);          // same layer
        expect(r.positions['b'].y).not.toBe(r.positions['c'].y);      // but not stacked on top of each other
        expect(r.positions['d'].x).toBeGreaterThan(r.positions['b'].x);
    });

    it('terminates on a cycle and records exactly one back-edge', () => {
        const r = layoutStoryGraph(graph(['a', 'b'], [['a', 'b'], ['b', 'a']]));
        expect(r.backEdges.size).toBe(1);
        expect(Number.isFinite(r.positions['a'].x)).toBe(true);
        expect(Number.isFinite(r.positions['b'].x)).toBe(true);
    });

    it('survives a long cycle without blowing the stack (iterative DFS)', () => {
        const keys = Array.from({ length: 2000 }, (_, i) => `s${i}`);
        const edges: [string, string][] = keys.map((k, i) => [k, keys[(i + 1) % keys.length]] as [string, string]);
        expect(() => layoutStoryGraph(graph(keys, edges))).not.toThrow();
    });

    it('stacks disconnected components without overlapping, orphans last', () => {
        // Main story a→b; an orphan island x→y that nothing reaches.
        const g = graph(['a', 'b', 'x', 'y'], [['a', 'b'], ['x', 'y']], ['a']);
        const r = layoutStoryGraph(g);
        const mainBottom = Math.max(r.positions['a'].y, r.positions['b'].y);
        const orphanTop = Math.min(r.positions['x'].y, r.positions['y'].y);
        expect(orphanTop).toBeGreaterThan(mainBottom);   // the island sits below the main story
    });

    it('is deterministic — same input, identical output', () => {
        const g = graph(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]);
        expect(layoutStoryGraph(g).positions).toEqual(layoutStoryGraph(g).positions);
    });

    it('places every node, including ones with no edges at all', () => {
        const r = layoutStoryGraph(graph(['a', 'lonely'], [], ['a']));
        expect(r.positions['a']).toBeDefined();
        expect(r.positions['lonely']).toBeDefined();
    });

    it('handles an empty graph', () => {
        const r = layoutStoryGraph({ nodes: [], edges: [], entryPoints: [], diagnostics: { unreachable: [], deadEnds: [], endings: [], danglingTargets: [], hasDynamicRoutes: false } });
        expect(r.width).toBe(0);
        expect(r.height).toBe(0);
    });
});
