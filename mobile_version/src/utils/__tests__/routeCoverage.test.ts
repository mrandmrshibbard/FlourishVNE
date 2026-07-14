import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    CoverageRecorder, CoverageSnapshot, clearCoverage, computeCoverageStats, loadCoverage,
    mergeCoverage, routeKey, coverageStorageKey,
} from '../routeCoverage';
import { FlowEdge, FlowNode, StoryGraph } from '../storyGraph';

// jsdom gives us a real localStorage; start every test from a clean one.
beforeEach(() => localStorage.clear());

const snap = (o: Partial<CoverageSnapshot> = {}): CoverageSnapshot => ({
    sceneId: null, screenId: null, commonEventId: null, mapId: null, miniGameId: null, ...o,
});

/** Drive the recorder through a sequence of snapshots and read back what it stored. */
function play(steps: Array<CoverageSnapshot | 'reset'>) {
    const rec = new CoverageRecorder('p1');
    for (const s of steps) {
        if (s === 'reset') rec.resetCursor();
        else rec.observe(s);
    }
    rec.flush();
    return loadCoverage('p1');
}

describe('CoverageRecorder — the routes it records', () => {
    it('records a scene-to-scene route', () => {
        const cov = play([snap({ sceneId: 's1' }), snap({ sceneId: 's2' })]);
        expect([...cov.visited].sort()).toEqual(['scene:s1', 'scene:s2']);
        expect([...cov.traversed]).toEqual([routeKey('scene:s1', 'scene:s2')]);
    });

    it('records the FIRST scene as visited but as no route (it came from nowhere)', () => {
        const cov = play([snap({ sceneId: 's1' })]);
        expect(cov.visited.has('scene:s1')).toBe(true);
        expect(cov.traversed.size).toBe(0);
    });

    it('routes THROUGH a screen: scene → screen, then screen → the scene it jumped to', () => {
        // ShowScreen, then a button on that screen jumps to s2 (the screen closes in the SAME batch).
        const cov = play([
            snap({ sceneId: 's1' }),
            snap({ sceneId: 's1', screenId: 'menu' }),
            snap({ sceneId: 's2' }),
        ]);
        expect([...cov.traversed].sort()).toEqual([
            routeKey('scene:s1', 'screen:menu'),
            routeKey('screen:menu', 'scene:s2'),
        ]);
    });

    it('closing a screen without going anywhere is NOT a route', () => {
        const cov = play([
            snap({ sceneId: 's1' }),
            snap({ sceneId: 's1', screenId: 'menu' }),
            snap({ sceneId: 's1' }),                       // closed, back where we were
            snap({ sceneId: 's2' }),                       // and now the story moves on
        ]);
        // Crucially: scene:s1 → scene:s2, NOT screen:menu → scene:s2 (which would be a false green
        // on a route out of the menu the author never took).
        expect(cov.traversed.has(routeKey('scene:s1', 'scene:s2'))).toBe(true);
        expect(cov.traversed.has(routeKey('screen:menu', 'scene:s2'))).toBe(false);
    });

    it('records a common event, and the route back out of it when it jumps', () => {
        const cov = play([
            snap({ sceneId: 's1' }),
            snap({ sceneId: 's1', commonEventId: 'ce1' }),
            snap({ sceneId: 's9' }),                       // the CE jumped; its stack was cleared
        ]);
        expect([...cov.traversed].sort()).toEqual([
            routeKey('commonEvent:ce1', 'scene:s9'),
            routeKey('scene:s1', 'commonEvent:ce1'),
        ]);
    });

    it('records maps and mini games as places the player went', () => {
        const cov = play([
            snap({ sceneId: 's1' }),
            snap({ sceneId: 's1', miniGameId: 'mg1' }),
            snap({ sceneId: 's2' }),
        ]);
        expect(cov.visited.has('miniGame:mg1')).toBe(true);
        expect(cov.traversed.has(routeKey('miniGame:mg1', 'scene:s2'))).toBe(true);
    });
});

describe('CoverageRecorder — what it must REFUSE to record (false green is the dangerous failure)', () => {
    it('does not record a route when the player is teleported (new game / load / rewind)', () => {
        const cov = play([
            snap({ sceneId: 's1' }),
            snap({ sceneId: 's2' }),
            'reset',                                        // ← load a save / rewind / start over
            snap({ sceneId: 's5' }),
        ]);
        expect(cov.visited.has('scene:s5')).toBe(true);     // they DID see s5
        expect(cov.traversed.has(routeKey('scene:s2', 'scene:s5'))).toBe(false);   // but not by walking there
        expect([...cov.traversed]).toEqual([routeKey('scene:s1', 'scene:s2')]);
    });

    it('a rewind cannot light up the reverse edge of a story loop', () => {
        // s1 → s2 forward, then the author rewinds back to s1. A naive recorder would store s2→s1,
        // which in a loop (s2 legitimately jumps back to s1) would be marked as "tested".
        const cov = play([
            snap({ sceneId: 's1' }),
            snap({ sceneId: 's2' }),
            'reset',
            snap({ sceneId: 's1' }),
        ]);
        expect(cov.traversed.has(routeKey('scene:s2', 'scene:s1'))).toBe(false);
    });
});

describe('coverage store', () => {
    it('unions with what is already stored, rather than clobbering it', () => {
        // Two test-play windows can both be writing. Neither may lose the other's routes.
        mergeCoverage('p1', new Set(['scene:a']), new Set(['scene:a->scene:b']), 1);
        mergeCoverage('p1', new Set(['scene:c']), new Set(['scene:c->scene:d']), 2);
        const cov = loadCoverage('p1');
        expect([...cov.visited].sort()).toEqual(['scene:a', 'scene:c']);
        expect(cov.traversed.size).toBe(2);
    });

    it('is scoped per project', () => {
        mergeCoverage('p1', new Set(['scene:a']), new Set(), 1);
        expect(loadCoverage('p2').visited.size).toBe(0);
    });

    it('clears', () => {
        mergeCoverage('p1', new Set(['scene:a']), new Set(), 1);
        clearCoverage('p1');
        expect(loadCoverage('p1').visited.size).toBe(0);
    });

    it('survives a corrupt or stale blob instead of throwing', () => {
        localStorage.setItem(coverageStorageKey('p1'), '{{{not json');
        expect(loadCoverage('p1').visited.size).toBe(0);
        localStorage.setItem(coverageStorageKey('p1'), JSON.stringify({ v: 99, visited: ['x'] }));
        expect(loadCoverage('p1').visited.size).toBe(0);   // wrong version → discarded, not trusted
    });

    it('never lets a storage failure break test-play', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
        expect(() => mergeCoverage('p1', new Set(['scene:a']), new Set(), 1)).not.toThrow();
        spy.mockRestore();
    });
});

describe('computeCoverageStats', () => {
    const node = (key: string, over: Partial<FlowNode> = {}): FlowNode => ({
        key, kind: key.split(':')[0] as any, id: key.split(':')[1], name: key, subtitle: '',
        isStart: false, isEntry: false, terminals: [], isTerminalOnly: false, isUnreachable: false,
        isDeadEnd: false, hasDynamicExit: false, ...over,
    });
    const edge = (from: string, to: string): FlowEdge =>
        ({ id: `${from}|${to}`, from, to, kind: 'jump', conditional: false, label: '', count: 1 });

    const graph: StoryGraph = {
        nodes: [node('scene:s1'), node('scene:s2'), node('scene:s3'), node('commonEvent:auto', { alwaysRuns: true })],
        edges: [edge('scene:s1', 'scene:s2'), edge('scene:s1', 'scene:s3')],
        entryPoints: ['scene:s1'],
        diagnostics: { unreachable: [], deadEnds: [], endings: [], danglingTargets: [], hasDynamicRoutes: false },
    };

    it('counts scenes and routes, and names what is still untested', () => {
        const cov = { visited: new Set(['scene:s1', 'scene:s2']), traversed: new Set(['scene:s1->scene:s2']), updatedAt: 1 };
        const s = computeCoverageStats(graph, cov);
        expect([s.scenesSeen, s.scenesTotal]).toEqual([2, 3]);
        expect([s.routesSeen, s.routesTotal]).toEqual([1, 2]);
        expect(s.untestedNodes.has('scene:s3')).toBe(true);
        expect([...s.untestedEdges]).toEqual(['scene:s1|scene:s3']);   // the branch they never tried
    });

    it('treats an always-running common event as played once ANY scene has been played', () => {
        // It runs in every scene by definition — calling it "never played" would be a lie the author
        // cannot act on.
        const cov = { visited: new Set(['scene:s1']), traversed: new Set<string>(), updatedAt: 1 };
        expect(computeCoverageStats(graph, cov).untestedNodes.has('commonEvent:auto')).toBe(false);

        const nothing = { visited: new Set<string>(), traversed: new Set<string>(), updatedAt: 0 };
        expect(computeCoverageStats(graph, nothing).untestedNodes.has('commonEvent:auto')).toBe(true);
    });

    it('reports hasData=false before anything has been played (so the map shows no colours yet)', () => {
        const s = computeCoverageStats(graph, { visited: new Set(), traversed: new Set(), updatedAt: 0 });
        expect(s.hasData).toBe(false);
    });
});
