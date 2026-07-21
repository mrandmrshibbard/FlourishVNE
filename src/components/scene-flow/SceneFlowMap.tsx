/**
 * Story Flow Map — the map view of the Scenes tab.
 *
 * A zoomable/pannable node-graph of the whole project. Scenes (plus the screens, common events,
 * mini-games and maps they route through) are nodes; story transitions are edges. Endings are
 * highlighted; unreachable scenes and dead ends are flagged.
 *
 * The graph itself is built by the PURE extractor in utils/storyGraph.ts (unit-tested) — this file
 * is only presentation + interaction. Editor-only: the game engine never reads any of it.
 *
 * PERF — the load-bearing bits:
 *  • buildStoryGraph is memoized on the exact project slices it reads. Without that it re-walks
 *    every command of every scene on every render.
 *  • Node cards are React.memo'd, so a pan is ONE style write on the wrapper, not 500 re-renders.
 *  • A node drag keeps its position in LOCAL state and dispatches exactly ONCE on release →
 *    exactly one undo step (the project dispatch is history-wrapped).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNID } from '../../types';
import { buildStoryGraph, FlowNode, FlowNodeKind, nodeKey } from '../../utils/storyGraph';
import { layoutStoryGraph } from '../../utils/storyLayout';
import {
    clearCoverage, computeCoverageStats, loadCoverage, COVERAGE_UPDATED_EVENT,
} from '../../utils/routeCoverage';
import { computeVariableFlow, fmtRange } from '../../utils/variableFlow';
import { VNVariable } from '../../features/variables/types';
import FlowEdgeLayer, { NODE_W, NODE_H } from './FlowEdgeLayer';
import FlowNodeCard from './FlowNodeCard';
import { SceneManagerProps } from '../SceneManagerList';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2;

type Filter = 'endings' | 'unreachable' | 'deadEnds' | 'untested' | null;

interface Props extends SceneManagerProps {
    headerSlot?: React.ReactNode;
    onOpenScene: (id: VNID) => void;
}

const KIND_LABEL: Record<FlowNodeKind, string> = {
    scene: 'Scenes', screen: 'Screens', commonEvent: 'Common events', miniGame: 'Mini games', map: 'Maps',
};

const SceneFlowMap: React.FC<Props> = ({ project, activeSceneId, headerSlot, onOpenScene }) => {
    const { dispatch } = useProject();
    const { t } = useTranslation(['scenes']);

    // ── the graph (pure) ──────────────────────────────────────────────────────
    // Memoized on the exact reducer-replaced references it reads. THE most important perf line here.
    const graph = useMemo(
        () => buildStoryGraph(project),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [project.scenes, project.commonEvents, project.uiScreens, project.maps, project.miniGames, project.items, project.startSceneId, project.ui]
    );
    const layout = useMemo(() => layoutStoryGraph(graph), [graph]);

    const saved = project.flowMap?.nodes;
    /** Auto-layout is always computed; a saved position simply overrides it. */
    const positions = useMemo(() => {
        const out: Record<string, { x: number; y: number }> = {};
        for (const n of graph.nodes) {
            const s = saved?.[n.key];
            out[n.key] = s ? { x: s.x, y: s.y } : (layout.positions[n.key] ?? { x: 0, y: 0 });
        }
        return out;
    }, [graph.nodes, layout.positions, saved]);

    const nodesByKey = useMemo(() => new Map(graph.nodes.map(n => [n.key, n])), [graph.nodes]);
    const sceneNameById = useCallback((id: string) => project.scenes[id]?.name ?? id, [project.scenes]);

    /** Adjacency for the hover highlight — precomputed so hovering is O(1). */
    const edgesByNode = useMemo(() => {
        const m = new Map<string, Set<string>>();
        for (const e of graph.edges) {
            (m.get(e.from) ?? m.set(e.from, new Set()).get(e.from)!).add(e.id);
            (m.get(e.to) ?? m.set(e.to, new Set()).get(e.to)!).add(e.id);
        }
        return m;
    }, [graph.edges]);

    // ── view state ────────────────────────────────────────────────────────────
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const [view, setView] = useState({ s: 1, tx: 0, ty: 0 });
    const [hovered, setHovered] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>(null);
    const [hiddenKinds, setHiddenKinds] = useState<Set<FlowNodeKind>>(new Set());
    const [showLegend, setShowLegend] = useState(true);

    // ── route coverage ────────────────────────────────────────────────────────
    // What the author has actually play-tested. Lives in localStorage, per project, on this machine —
    // it never touches the project file, so test-playing doesn't dirty the story or show up in
    // Compare & Merge. See utils/routeCoverage.ts.
    const [showCoverage, setShowCoverage] = useState(() => localStorage.getItem('flourish:flowMapCoverage') === '1');
    const [coverage, setCoverage] = useState(() => loadCoverage(project.id));

    useEffect(() => { localStorage.setItem('flourish:flowMapCoverage', showCoverage ? '1' : '0'); }, [showCoverage]);

    /**
     * Re-read coverage whenever it could have changed. Three triggers, because test-play can run in
     * THIS window (the preview overlay) or in a popped-out window that shares our localStorage but
     * cannot call our setState:
     *   • COVERAGE_UPDATED_EVENT — same-window test-play, repaints live as you play.
     *   • flourish:playended     — the preview overlay closed.
     *   • window focus           — you clicked back from the popped-out test-play window.
     */
    useEffect(() => {
        const reload = () => setCoverage(loadCoverage(project.id));
        reload();
        window.addEventListener(COVERAGE_UPDATED_EVENT, reload);
        window.addEventListener('flourish:playended', reload);
        window.addEventListener('focus', reload);
        return () => {
            window.removeEventListener(COVERAGE_UPDATED_EVENT, reload);
            window.removeEventListener('flourish:playended', reload);
            window.removeEventListener('focus', reload);
        };
    }, [project.id]);

    const stats = useMemo(() => computeCoverageStats(graph, coverage), [graph, coverage]);
    const coveredEdges = showCoverage ? stats.coveredEdges : null;

    // ── follow a variable ─────────────────────────────────────────────────────
    // Pick a number variable and the map becomes about THAT: +5/−3 chips on the scenes that change it,
    // the value you could arrive at each scene carrying, a comet of light along the edges that carry a
    // changed value downstream — and the thing no VN tool tells you: which gates no route can open.
    const [followId, setFollowId] = useState<VNID | ''>('');
    const numberVariables = useMemo(
        () => (Object.values(project.variables ?? {}) as VNVariable[])
            .filter(v => v.type === 'number' && !v.isInternal),
        [project.variables],
    );
    const followed = followId ? project.variables[followId] : undefined;
    const flow = useMemo(
        () => (followed ? computeVariableFlow(project, graph, followId as VNID) : null),
        [project, graph, followId, followed],
    );
    const flowingEdges = flow ? flow.flowingEdges : null;
    const [showDeadGates, setShowDeadGates] = useState(true);

    // A variable that gets deleted while we're following it must not leave the map in a broken mode.
    useEffect(() => {
        if (followId && !project.variables[followId]) setFollowId('');
    }, [project.variables, followId]);

    const resetCoverage = () => {
        if (!window.confirm(t('flowMap.coverageResetConfirm', 'Forget everything you have play-tested so far? The story itself is not changed.'))) return;
        clearCoverage(project.id);
        setCoverage(loadCoverage(project.id));
    };

    // Drag state (node drag lives in LOCAL state — no dispatch until release)
    const dragRef = useRef<{ key: string; startX: number; startY: number; ox: number; oy: number; moved: boolean } | null>(null);
    const [dragPos, setDragPos] = useState<{ key: string; x: number; y: number } | null>(null);
    const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
    const movedRef = useRef(false);   // swallow the click that ends a pan/drag

    const visibleNodes = useMemo(
        () => graph.nodes.filter(n => !hiddenKinds.has(n.kind)),
        [graph.nodes, hiddenKinds]
    );
    const visibleKeys = useMemo(() => new Set(visibleNodes.map(n => n.key)), [visibleNodes]);
    const visibleEdges = useMemo(
        () => graph.edges.filter(e => visibleKeys.has(e.from) && visibleKeys.has(e.to)),
        [graph.edges, visibleKeys]
    );

    /** Content bounds (so Fit-to-view actually fits). */
    const bounds = useMemo(() => {
        if (!visibleNodes.length) return { x: 0, y: 0, w: 1, h: 1 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of visibleNodes) {
            const p = positions[n.key]; if (!p) continue;
            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + NODE_H);
        }
        if (!isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 };
        return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
    }, [visibleNodes, positions]);

    const fitToView = useCallback(() => {
        const el = viewportRef.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const s = Math.max(MIN_ZOOM, Math.min(1, Math.min(r.width / (bounds.w + 80), r.height / (bounds.h + 80))));
        setView({
            s,
            tx: (r.width - bounds.w * s) / 2 - bounds.x * s,
            ty: (r.height - bounds.h * s) / 2 - bounds.y * s,
        });
    }, [bounds]);

    // Fit once, on first mount with content.
    const didFit = useRef(false);
    useEffect(() => {
        if (didFit.current || !graph.nodes.length) return;
        didFit.current = true;
        fitToView();
    }, [graph.nodes.length, fitToView]);

    // ── zoom (focal, about the cursor) — the math is the one proven in MapSurface ──
    const zoomTo = useCallback((nextS: number, fx: number, fy: number) => {
        setView(prev => {
            const s2 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextS));
            const cx = (fx - prev.tx) / prev.s, cy = (fy - prev.ty) / prev.s;
            return { s: s2, tx: fx - cx * s2, ty: fy - cy * s2 };   // free pan — no clamp (a graph isn't a photo)
        });
    }, []);

    const onWheel = (e: React.WheelEvent) => {
        const r = viewportRef.current?.getBoundingClientRect(); if (!r) return;
        zoomTo(view.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
    };
    const bump = (f: number) => {
        const r = viewportRef.current?.getBoundingClientRect(); if (!r) return;
        zoomTo(view.s * f, r.width / 2, r.height / 2);
    };

    // ── pan (empty canvas) vs node drag — unambiguous, no modifier needed ─────
    const onNodePointerDown = useCallback((e: React.PointerEvent, key: string) => {
        e.stopPropagation();
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        const p = positions[key];
        dragRef.current = { key, startX: e.clientX, startY: e.clientY, ox: p.x, oy: p.y, moved: false };
        movedRef.current = false;
        setSelected(key);
    }, [positions]);

    const onViewportPointerDown = (e: React.PointerEvent) => {
        if (dragRef.current) return;
        panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
        movedRef.current = false;
        setSelected(null);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const d = dragRef.current;
        if (d) {
            // CRITICAL: under a zoom transform, pointer deltas must be divided by the scale.
            const dx = (e.clientX - d.startX) / view.s;
            const dy = (e.clientY - d.startY) / view.s;
            if (Math.abs(dx) + Math.abs(dy) > 2) { d.moved = true; movedRef.current = true; }
            setDragPos({ key: d.key, x: d.ox + dx, y: d.oy + dy });
            return;
        }
        const p = panRef.current;
        if (p) {
            const dx = e.clientX - p.x, dy = e.clientY - p.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) movedRef.current = true;
            setView(v => ({ ...v, tx: p.tx + dx, ty: p.ty + dy }));
        }
    };

    const onPointerUp = () => {
        const d = dragRef.current;
        if (d && dragPos && d.moved) {
            // ONE dispatch → ONE undo step. (Dispatching per mousemove would bury the undo stack.)
            dispatch({
                type: 'UPDATE_PROJECT',
                payload: {
                    flowMap: {
                        ...(project.flowMap ?? {}),
                        nodes: {
                            ...(project.flowMap?.nodes ?? {}),
                            [d.key]: { ...(project.flowMap?.nodes?.[d.key] ?? {}), x: Math.round(dragPos.x), y: Math.round(dragPos.y) },
                        },
                    },
                },
            } as any);
        }
        dragRef.current = null;
        panRef.current = null;
        setDragPos(null);
    };

    /** Tidy up — drop every hand-placed position and let auto-layout take over. ONE undo step. */
    const tidyUp = () => {
        dispatch({ type: 'UPDATE_PROJECT', payload: { flowMap: { ...(project.flowMap ?? {}), nodes: {} } } } as any);
        setTimeout(fitToView, 0);
    };

    // ── highlight / dim ───────────────────────────────────────────────────────
    const focusKey = hovered ?? selected;
    const highlightedEdges = useMemo(() => (focusKey ? (edgesByNode.get(focusKey) ?? new Set<string>()) : null), [focusKey, edgesByNode]);
    const neighbourKeys = useMemo(() => {
        if (!focusKey) return null;
        const s = new Set<string>([focusKey]);
        for (const e of graph.edges) {
            if (e.from === focusKey) s.add(e.to);
            if (e.to === focusKey) s.add(e.from);
        }
        return s;
    }, [focusKey, graph.edges]);

    const q = search.trim().toLowerCase();
    const matchesSearch = (n: FlowNode) => !q || n.name.toLowerCase().includes(q);
    const matchesFilter = (n: FlowNode) =>
        !filter ||
        (filter === 'endings' && n.isTerminalOnly) ||
        (filter === 'unreachable' && n.isUnreachable) ||
        (filter === 'deadEnds' && n.isDeadEnd) ||
        (filter === 'untested' && stats.untestedNodes.has(n.key));

    const isDimmed = (n: FlowNode) =>
        !matchesSearch(n) || !matchesFilter(n) || (!!neighbourKeys && !neighbourKeys.has(n.key));

    const counts = graph.diagnostics;

    // ── chrome ────────────────────────────────────────────────────────────────
    const chip = (active: boolean, onClick: () => void, label: string, colour = 'var(--accent-pink)') => (
        <button onClick={onClick}
            className="text-[10px] px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap"
            style={{
                borderColor: active ? colour : 'var(--border-subtle)',
                background: active ? `color-mix(in srgb, ${colour} 20%, transparent)` : 'transparent',
                color: active ? colour : 'var(--text-secondary)',
            }}>
            {label}
        </button>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-2 py-1.5 border-b flex-wrap flex-shrink-0"
                style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-secondary)' }}>
                <h2 className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                    🗺 {t('flowMap.title', 'Story map')}
                </h2>
                {headerSlot}

                <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                    placeholder={t('flowMap.search', 'Find a scene…')}
                    className="text-[11px] px-2 py-0.5 rounded-md border bg-transparent outline-none"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', width: 130 }}
                />

                <div className="flex items-center gap-1">
                    {chip(filter === 'endings', () => setFilter(filter === 'endings' ? null : 'endings'),
                        `🏁 ${t('flowMap.endings', 'Endings')} ${counts.endings.length}`, 'var(--accent-yellow)')}
                    {chip(filter === 'unreachable', () => setFilter(filter === 'unreachable' ? null : 'unreachable'),
                        `⚠ ${t('flowMap.unreachable', 'Nothing leads here')} ${counts.unreachable.length}`, 'var(--accent-peach)')}
                    {chip(filter === 'deadEnds', () => setFilter(filter === 'deadEnds' ? null : 'deadEnds'),
                        `⛔ ${t('flowMap.deadEnds', 'Stops here')} ${counts.deadEnds.length}`, 'var(--accent-coral)')}
                </div>

                {/* Route coverage — "what have I actually play-tested?" */}
                <div className="flex items-center gap-1 pl-2 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
                    {chip(showCoverage, () => setShowCoverage(v => !v),
                        `✅ ${t('flowMap.coverage', 'What I have played')}`, 'var(--accent-green)')}
                    {showCoverage && (
                        <>
                            <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}
                                title={t('flowMap.coverageHint', 'Counted while you test-play. It is only saved on this computer, and never changes your story.')}>
                                {t('flowMap.coverageStats', '{{scenesSeen}}/{{scenesTotal}} scenes · {{routesSeen}}/{{routesTotal}} routes', stats)}
                            </span>
                            {stats.hasData
                                ? chip(filter === 'untested', () => setFilter(filter === 'untested' ? null : 'untested'),
                                    `👁 ${t('flowMap.untested', 'Never played')} ${stats.untestedNodes.size}`, 'var(--text-muted)')
                                : (
                                    <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                                        {t('flowMap.coverageEmpty', '— test-play your story to fill this in')}
                                    </span>
                                )}
                            {stats.hasData && (
                                <button onClick={resetCoverage}
                                    title={t('flowMap.coverageResetHint', 'Start counting again from scratch. Your story is not changed.')}
                                    className="text-[10px] px-2 py-0.5 rounded-md border"
                                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                                    ↺ {t('flowMap.coverageReset', 'Reset')}
                                </button>
                            )}
                        </>
                    )}
                </div>

                {/* Follow a variable through the story. */}
                {numberVariables.length > 0 && (
                    <div className="flex items-center gap-1 pl-2 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
                        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('flowMap.follow', 'Follow')}
                        </span>
                        <select
                            value={followId}
                            onChange={e => setFollowId(e.target.value as VNID | '')}
                            className="text-[11px] px-1.5 py-0.5 rounded-md border bg-transparent outline-none"
                            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', maxWidth: 150 }}
                            title={t('flowMap.followHint', 'Watch a number move through your story — and find endings no route can ever reach.')}
                        >
                            <option value="">{t('flowMap.followNone', 'a variable…')}</option>
                            {numberVariables.map(v => (
                                <option key={v.id} value={v.id}>{v.icon ? `${v.icon} ` : ''}{v.name}</option>
                            ))}
                        </select>
                        {flow && flow.deadGates.length > 0 && (
                            <button
                                onClick={() => setShowDeadGates(s => !s)}
                                className="text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap"
                                style={{
                                    borderColor: 'var(--accent-coral)',
                                    background: 'color-mix(in srgb, var(--accent-coral) 20%, transparent)',
                                    color: 'var(--accent-coral)',
                                }}
                            >
                                ⛔ {t('flowMap.deadGates', '{{count}} unreachable', { count: flow.deadGates.length })}
                            </button>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-1 ml-auto">
                    {(Object.keys(KIND_LABEL) as FlowNodeKind[]).map(k => (
                        <React.Fragment key={k}>
                            {chip(
                                !hiddenKinds.has(k),
                                () => setHiddenKinds(prev => {
                                    const n = new Set(prev);
                                    if (n.has(k)) n.delete(k); else n.add(k);
                                    return n;
                                }),
                                t(`flowMap.kind.${k}`, KIND_LABEL[k]),
                                'var(--accent-lavender)',
                            )}
                        </React.Fragment>
                    ))}
                    <button onClick={tidyUp} title={t('flowMap.tidyHint', 'Re-arrange every node automatically')}
                        className="text-[10px] px-2 py-0.5 rounded-md border"
                        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                        ✨ {t('flowMap.tidy', 'Tidy up')}
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <div
                ref={viewportRef}
                onWheel={onWheel}
                onPointerDown={onViewportPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="relative flex-1 min-h-0"
                style={{ overflow: 'hidden', touchAction: 'none', cursor: panRef.current ? 'grabbing' : 'default' }}
            >
                {!graph.nodes.length && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t('flowMap.empty', 'Add a scene and your story map will appear here.')}
                    </div>
                )}

                {/* THE payoff: a branch whose condition no route through the story can ever satisfy.
                    Nothing errors today — the ending simply never happens, and the author concludes the
                    engine is broken. */}
                {flow && showDeadGates && flow.deadGates.length > 0 && (
                    <div
                        onPointerDown={e => e.stopPropagation()}
                        className="absolute top-2 left-1/2 -translate-x-1/2 z-10 rounded-lg p-2.5 max-w-lg"
                        style={{
                            background: 'color-mix(in srgb, var(--bg-secondary) 96%, transparent)',
                            border: '1px solid var(--accent-coral)',
                            boxShadow: '0 8px 24px -8px rgba(0,0,0,0.6)',
                        }}
                    >
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-xs font-bold" style={{ color: 'var(--accent-coral)' }}>
                                ⛔ {t('flowMap.deadGatesTitle', 'These can never happen')}
                            </span>
                            <button onClick={() => setShowDeadGates(false)} style={{ color: 'var(--text-muted)' }}>✕</button>
                        </div>
                        <ul className="space-y-1">
                            {flow.deadGates.slice(0, 4).map((g, i) => (
                                <li key={i}>
                                    <button
                                        onClick={() => { const n = nodesByKey.get(g.nodeKey); if (n?.kind === 'scene') onOpenScene(n.id); }}
                                        className="text-left text-[11px] hover:underline"
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        {g.message}
                                    </button>
                                </li>
                            ))}
                            {flow.deadGates.length > 4 && (
                                <li className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
                                    {t('flowMap.deadGatesMore', '…and {{count}} more', { count: flow.deadGates.length - 4 })}
                                </li>
                            )}
                        </ul>
                        {flow.incomplete && (
                            <p className="text-[10px] mt-1.5 pt-1.5 border-t" style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' }}>
                                {t('flowMap.flowIncomplete', 'Some routes (scripts, or a loop with no limit) can’t be worked out, so a few places were skipped rather than guessed at.')}
                            </p>
                        )}
                    </div>
                )}

                {/* ONE transform wrapper — edges and nodes share it, so they can never drift apart. */}
                <div style={{
                    position: 'absolute', inset: 0, transformOrigin: '0 0',
                    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
                    willChange: 'transform',
                }}>
                    <FlowEdgeLayer
                        edges={visibleEdges}
                        positions={dragPos ? { ...positions, [dragPos.key]: { x: dragPos.x, y: dragPos.y } } : positions}
                        backEdges={layout.backEdges}
                        nodesByKey={nodesByKey}
                        highlighted={highlightedEdges}
                        coveredEdges={coveredEdges}
                        flowingEdges={flowingEdges}
                        width={bounds.x + bounds.w + 200}
                        height={bounds.y + bounds.h + 200}
                    />

                    {visibleNodes.map(n => {
                        const p = dragPos && dragPos.key === n.key ? { x: dragPos.x, y: dragPos.y } : positions[n.key];
                        if (!p) return null;
                        return (
                            <FlowNodeCard
                                key={n.key}
                                node={n}
                                pos={p}
                                isActive={n.kind === 'scene' && n.id === activeSceneId}
                                isSelected={selected === n.key}
                                isDimmed={isDimmed(n)}
                                softenUnreachable={graph.diagnostics.hasDynamicRoutes}
                                played={showCoverage ? !stats.untestedNodes.has(n.key) : null}
                                flow={(() => {
                                    const f = flow?.nodes.get(n.key);
                                    if (!f) return null;
                                    return {
                                        summary: f.summary,
                                        arrive: f.arrive ? fmtRange(f.arrive) : null,
                                        unbounded: f.unbounded,
                                    };
                                })()}
                                sceneNameById={sceneNameById}
                                onPointerDown={onNodePointerDown}
                                onDoubleClick={(node) => { if (node.kind === 'scene') onOpenScene(node.id); }}
                                onHover={setHovered}
                                t={t as any}
                            />
                        );
                    })}
                </div>

                {/* Chrome — OUTSIDE the transform so it stays a constant size */}
                <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
                    {[['+', () => bump(1.25)], ['−', () => bump(1 / 1.25)], ['⤢', fitToView]].map(([label, fn], i) => (
                        <button key={i} onClick={fn as any} onPointerDown={e => e.stopPropagation()}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>
                            {label as string}
                        </button>
                    ))}
                </div>

                {showLegend && (
                    <div className="absolute left-3 bottom-3 rounded-lg p-2 text-[10px] space-y-1"
                        onPointerDown={e => e.stopPropagation()}
                        style={{ background: 'color-mix(in srgb, var(--bg-secondary) 92%, transparent)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', maxWidth: 250 }}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{t('flowMap.legend', 'What the arrows mean')}</span>
                            <button onClick={() => setShowLegend(false)} style={{ color: 'var(--text-muted)' }}>✕</button>
                        </div>
                        {followed ? (
                            <>
                                <div>
                                    <span style={{ color: 'var(--accent-cyan)' }}>✦</span>{' '}
                                    {t('flowMap.legendFlow', 'The light shows {{name}} flowing on from a scene that changed it', { name: followed.name })}
                                </div>
                                <div>{t('flowMap.legendFlowChip', '“+5” is what a scene does to it; “arrive with 5–20” is what the player could be carrying.')}</div>
                                <div style={{ color: 'var(--text-muted)' }}>{t('flowMap.legendFlowNote', 'A range means it depends on the player’s choices.')}</div>
                            </>
                        ) : showCoverage ? (
                            <>
                                <div>— <span style={{ color: 'var(--accent-green)' }}>{t('flowMap.legendPlayed', 'You have played this route')}</span></div>
                                <div>— <span style={{ color: 'var(--text-muted)' }}>{t('flowMap.legendUnplayed', 'You have never tested this route')}</span></div>
                                <div style={{ color: 'var(--text-muted)' }}>{t('flowMap.legendCoverageNote', 'Counted as you test-play. Saved on this computer only — it never changes your story.')}</div>
                            </>
                        ) : (
                            <>
                                <div>— <span style={{ color: 'var(--accent-pink)' }}>{t('flowMap.legendChoice', 'The player picked a choice')}</span></div>
                                <div>— <span style={{ color: 'var(--accent-lavender)' }}>{t('flowMap.legendJump', 'Jumps straight there')}</span></div>
                                <div>— <span style={{ color: 'var(--text-muted)' }}>{t('flowMap.legendFallthrough', 'Just continues to the next scene')}</span></div>
                            </>
                        )}
                        <div>┈ {t('flowMap.legendConditional', 'Only sometimes (there is a condition)')}</div>
                        <div>🏁 {t('flowMap.legendEnding', 'An ending')}</div>
                        <div className="pt-1" style={{ color: 'var(--text-muted)' }}>{t('flowMap.legendOpen', 'Double-click a scene to open it.')}</div>
                    </div>
                )}
                {!showLegend && (
                    <button onClick={() => setShowLegend(true)} onPointerDown={e => e.stopPropagation()}
                        className="absolute left-3 bottom-3 text-[10px] px-2 py-1 rounded-md"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                        ? {t('flowMap.legendShow', 'Legend')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default SceneFlowMap;
