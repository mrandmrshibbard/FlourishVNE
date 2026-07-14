import { describe, it, expect } from 'vitest';
import { buildStoryGraph, nodeKey, FlowEdgeKind } from '../storyGraph';
import { VNProject } from '../../types/project';
import { CommandType } from '../../features/scene/types';
import { UIActionType } from '../../types/shared';

/** Minimal project fixture — only the fields the graph extractor reads. */
function makeProject(scenes: Record<string, { name?: string; commands?: any[]; fallbackSceneId?: string }>, extra: any = {}): VNProject {
    const scenesOut: any = {};
    // Object key insertion order IS the story's fall-through order — preserve it exactly.
    for (const [id, s] of Object.entries(scenes)) {
        scenesOut[id] = { id, name: s.name ?? id, commands: s.commands ?? [], ...(s.fallbackSceneId ? { fallbackSceneId: s.fallbackSceneId } : {}) };
    }
    return {
        id: 'p', title: 'P',
        startSceneId: extra.startSceneId ?? Object.keys(scenes)[0],
        scenes: scenesOut,
        uiScreens: extra.uiScreens ?? {},
        commonEvents: extra.commonEvents ?? {},
        maps: extra.maps ?? {},
        miniGames: extra.miniGames ?? {},
        items: extra.items ?? {},
        ui: extra.ui ?? {},
    } as any as VNProject;
}

const S = (id: string) => nodeKey('scene', id);
const edgeBetween = (g: any, from: string, to: string, kind?: FlowEdgeKind) =>
    g.edges.filter((e: any) => e.from === from && e.to === to && (!kind || e.kind === kind));
const node = (g: any, key: string) => g.nodes.find((n: any) => n.key === key);

const jump = (target: string) => ({ id: 'c', type: CommandType.Jump, targetSceneId: target });
const dialogue = () => ({ id: 'd', type: CommandType.Dialogue, text: 'hi' });

describe('buildStoryGraph — implicit fall-through (the thing other tools get wrong)', () => {
    it('connects scenes that have no jump, in record order, and only the LAST scene is terminal', () => {
        const g = buildStoryGraph(makeProject({ a: {}, b: {}, c: {} }));

        expect(edgeBetween(g, S('a'), S('b'), 'fallthrough')).toHaveLength(1);
        expect(edgeBetween(g, S('b'), S('c'), 'fallthrough')).toHaveLength(1);

        // The last scene just stops — that IS the ending, and nothing is unreachable.
        expect(node(g, S('c')).terminals).toContain('endOfList');
        expect(g.diagnostics.unreachable).toHaveLength(0);
        expect(node(g, S('a')).fallsThroughTo).toBe('b');
    });

    it('an unconditional Jump REPLACES the fall-through', () => {
        const g = buildStoryGraph(makeProject({ a: { commands: [jump('c')] }, b: {}, c: {} }));

        expect(edgeBetween(g, S('a'), S('c'), 'jump')).toHaveLength(1);
        expect(edgeBetween(g, S('a'), S('b'))).toHaveLength(0);   // no fall-through — it jumped away
        expect(node(g, S('a')).fallsThroughTo).toBeUndefined();
        // b is now only reachable via fall-through from... nothing. It IS an orphan.
        expect(g.diagnostics.unreachable).toContain(S('b'));
    });

    it('a Jump INSIDE a branch keeps the fall-through (it might not run)', () => {
        const g = buildStoryGraph(makeProject({
            a: {
                commands: [
                    { id: 'bs', type: CommandType.BranchStart, branchId: 'br1' },
                    jump('c'),
                    { id: 'be', type: CommandType.BranchEnd, branchId: 'br1' },
                ],
            },
            b: {}, c: {},
        }));

        const conditionalJump = edgeBetween(g, S('a'), S('c'), 'jump');
        expect(conditionalJump).toHaveLength(1);
        expect(conditionalJump[0].conditional).toBe(true);
        // BOTH routes exist — the branch may not fire, in which case it falls through to b.
        expect(edgeBetween(g, S('a'), S('b'), 'fallthrough')).toHaveLength(1);
    });
});

describe('buildStoryGraph — choices, endings, dead ends', () => {
    it('emits one labelled edge per choice option', () => {
        const g = buildStoryGraph(makeProject({
            a: {
                commands: [{
                    id: 'ch', type: CommandType.Choice, options: [
                        { id: 'o1', text: 'Go left', actions: [{ type: UIActionType.JumpToScene, targetSceneId: 'b' }] },
                        { id: 'o2', text: 'Go right', actions: [{ type: UIActionType.JumpToScene, targetSceneId: 'c' }] },
                    ],
                }],
            },
            b: {}, c: {},
        }));

        expect(edgeBetween(g, S('a'), S('b'), 'jump')[0].label).toBe('Go left');
        expect(edgeBetween(g, S('a'), S('c'), 'jump')[0].label).toBe('Go right');
    });

    it('merges duplicate routes into one arrow with a count', () => {
        const g = buildStoryGraph(makeProject({
            a: {
                commands: [{
                    id: 'ch', type: CommandType.Choice, options: [
                        { id: 'o1', text: 'Yes', actions: [{ type: UIActionType.JumpToScene, targetSceneId: 'b' }] },
                        { id: 'o2', text: 'No', actions: [{ type: UIActionType.JumpToScene, targetSceneId: 'b' }] },
                    ],
                }],
            },
            b: {},
        }));
        const e = edgeBetween(g, S('a'), S('b'), 'jump');
        expect(e).toHaveLength(1);
        expect(e[0].count).toBe(2);
    });

    it('a scene whose only exit is Quit To Title is a real ending (and does not fall through)', () => {
        const g = buildStoryGraph(makeProject({
            a: { commands: [jump('b')] },
            b: { commands: [{ id: 'x', type: CommandType.ShowButton, text: 'The End', onClick: { type: UIActionType.QuitToTitle } }] },
            c: {},
        }));
        const b = node(g, S('b'));
        expect(b.terminals).toContain('title');
        expect(b.isTerminalOnly).toBe(true);
        expect(edgeBetween(g, S('b'), S('c'))).toHaveLength(0);  // terminated → no fall-through
        expect(g.diagnostics.endings).toContain(S('b'));
    });

    it('flags a scene nothing leads to as unreachable', () => {
        const g = buildStoryGraph(makeProject({
            a: { commands: [jump('c')] },
            orphan: { commands: [dialogue()] },
            c: {},
        }, { startSceneId: 'a' }));
        expect(g.diagnostics.unreachable).toContain(S('orphan'));
        expect(g.diagnostics.unreachable).not.toContain(S('c'));
    });
});

describe('buildStoryGraph — JumpToLabel asymmetry (command is cross-scene, action is not)', () => {
    const label = (id: string) => ({ id: 'l', type: CommandType.Label, labelId: id });

    it('a label in the SAME scene is a loop, not an edge', () => {
        const g = buildStoryGraph(makeProject({
            a: { commands: [label('top'), { id: 'j', type: CommandType.JumpToLabel, labelId: 'top' }] },
            b: {},
        }));
        expect(g.edges.filter((e: any) => e.kind === 'label')).toHaveLength(0);
    });

    it('a label in ANOTHER scene is a cross-scene edge (first definer in record order wins)', () => {
        const g = buildStoryGraph(makeProject({
            a: { commands: [{ id: 'j', type: CommandType.JumpToLabel, labelId: 'ending' }] },
            b: { commands: [label('ending')] },
            c: { commands: [label('ending')] },   // also defines it — but b comes first
        }));
        expect(edgeBetween(g, S('a'), S('b'), 'label')).toHaveLength(1);
        expect(edgeBetween(g, S('a'), S('c'), 'label')).toHaveLength(0);
    });

    it('JumpToLabel as an ACTION emits NO cross-scene edge (engine restricts it to the current scene)', () => {
        const g = buildStoryGraph(makeProject({
            a: {
                commands: [{
                    id: 'ch', type: CommandType.Choice,
                    options: [{ id: 'o', text: 'go', actions: [{ type: UIActionType.JumpToLabel, targetLabel: 'ending' }] }],
                }],
            },
            b: { commands: [label('ending')] },
        }));
        expect(g.edges.filter((e: any) => e.kind === 'label')).toHaveLength(0);
    });

    it('a label that exists nowhere is reported, not crashed on', () => {
        const g = buildStoryGraph(makeProject({ a: { commands: [{ id: 'j', type: CommandType.JumpToLabel, labelId: 'nope' }] } }));
        expect(g.diagnostics.danglingTargets.some(d => d.target === 'nope')).toBe(true);
    });
});

describe('buildStoryGraph — hubs (screens, common events, maps, mini-games)', () => {
    it('an auto-run common event is ONE node badged "always runs", not N edges out of every scene', () => {
        const g = buildStoryGraph(makeProject({ a: {}, b: {}, c: {} }, {
            commonEvents: {
                ce1: { id: 'ce1', name: 'Time limit', enabled: true, trigger: 'auto', commands: [jump('c')] },
            },
        }));
        const ce = node(g, nodeKey('commonEvent', 'ce1'));
        expect(ce.alwaysRuns).toBe(true);
        // The jump leaves from the COMMON EVENT, not from all three scenes.
        expect(edgeBetween(g, ce.key, S('c'), 'jump')).toHaveLength(1);
        expect(edgeBetween(g, S('a'), S('c'))).toHaveLength(0);
        expect(edgeBetween(g, S('b'), S('c'), 'jump')).toHaveLength(0);
    });

    it('mutually recursive common events terminate (no hang) and emit each edge once', () => {
        const g = buildStoryGraph(makeProject({ a: { commands: [{ id: 'c1', type: CommandType.CallCommonEvent, commonEventId: 'ceA' }] }, z: {} }, {
            commonEvents: {
                ceA: { id: 'ceA', name: 'A', enabled: true, trigger: 'called', commands: [{ id: 'x', type: CommandType.CallCommonEvent, commonEventId: 'ceB' }] },
                ceB: { id: 'ceB', name: 'B', enabled: true, trigger: 'called', commands: [{ id: 'y', type: CommandType.CallCommonEvent, commonEventId: 'ceA' }, jump('z')] },
            },
        }));
        expect(edgeBetween(g, S('a'), nodeKey('commonEvent', 'ceA'), 'call')).toHaveLength(1);
        expect(edgeBetween(g, nodeKey('commonEvent', 'ceB'), S('z'), 'jump')).toHaveLength(1);
    });

    it('a screen button jump routes scene → screen → scene', () => {
        const g = buildStoryGraph(makeProject({ a: { commands: [{ id: 's', type: CommandType.ShowScreen, screenId: 'scr1' }] }, b: {} }, {
            uiScreens: {
                scr1: {
                    id: 'scr1', name: 'Map Menu',
                    elements: { e1: { id: 'e1', text: 'Travel', action: { type: UIActionType.JumpToScene, targetSceneId: 'b' } } },
                },
            },
        }));
        const scr = nodeKey('screen', 'scr1');
        expect(edgeBetween(g, S('a'), scr, 'opens')).toHaveLength(1);
        expect(edgeBetween(g, scr, S('b'), 'jump')).toHaveLength(1);
    });

    it('map location actions produce edges (the case buildValidator misses)', () => {
        const g = buildStoryGraph(makeProject({ a: { commands: [{ id: 'm', type: CommandType.ShowMap, mapId: 'map1' }] }, b: {}, c: {} }, {
            maps: {
                map1: {
                    id: 'map1', name: 'World', locations: [
                        { id: 'l1', name: 'Beach', actions: [{ type: UIActionType.JumpToScene, targetSceneId: 'b' }] },
                        { id: 'l2', name: 'Cave', targetSceneId: 'c' },   // legacy field — still honoured
                    ],
                },
            },
        }));
        const m = nodeKey('map', 'map1');
        expect(edgeBetween(g, S('a'), m, 'opens')).toHaveLength(1);
        expect(edgeBetween(g, m, S('b'), 'jump')).toHaveLength(1);
        expect(edgeBetween(g, m, S('c'), 'outcome')).toHaveLength(1);
    });

    it('mini-game win/lose outcomes route onward', () => {
        const g = buildStoryGraph(makeProject({ a: { commands: [{ id: 'g', type: CommandType.ShowMiniGame, gameId: 'mg1' }] }, win: {}, lose: {} }, {
            miniGames: {
                mg1: {
                    id: 'mg1', name: 'Puzzle',
                    winActions: [{ type: UIActionType.JumpToScene, targetSceneId: 'win' }],
                    failActions: [{ type: UIActionType.JumpToScene, targetSceneId: 'lose' }],
                },
            },
        }));
        const mg = nodeKey('miniGame', 'mg1');
        expect(edgeBetween(g, mg, S('win'), 'jump')[0].conditional).toBe(true);
        expect(edgeBetween(g, mg, S('lose'), 'jump')).toHaveLength(1);
    });
});

describe('buildStoryGraph — robustness', () => {
    it('a jump to a deleted scene is reported, not crashed on', () => {
        const g = buildStoryGraph(makeProject({ a: { commands: [jump('ghost')] } }));
        expect(g.diagnostics.danglingTargets.some(d => d.target === 'ghost')).toBe(true);
        expect(g.edges.filter((e: any) => e.to === S('ghost'))).toHaveLength(0);
    });

    it('a script marks the scene as having an unknowable route', () => {
        const g = buildStoryGraph(makeProject({ a: { commands: [{ id: 'r', type: CommandType.RunScript, scriptId: 's1' }] }, b: {} }));
        expect(node(g, S('a')).hasDynamicExit).toBe(true);
        expect(g.diagnostics.hasDynamicRoutes).toBe(true);
    });

    it('a scene fallback (its conditions failed) is a conditional edge', () => {
        const g = buildStoryGraph(makeProject({ a: { fallbackSceneId: 'c' }, b: {}, c: {} }));
        const e = edgeBetween(g, S('a'), S('c'), 'fallback');
        expect(e).toHaveLength(1);
        expect(e[0].conditional).toBe(true);
    });

    it('handles an empty project without throwing', () => {
        expect(() => buildStoryGraph(makeProject({}))).not.toThrow();
    });
});
