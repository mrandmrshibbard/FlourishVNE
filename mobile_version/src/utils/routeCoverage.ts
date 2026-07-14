/**
 * Route coverage — "which parts of my story have I actually play-tested?"
 *
 * Test-play records every node the player reached and every route they took between nodes.
 * The Story Flow Map then paints the graph: green = you have played this, grey = you have never
 * tested it. Writers of branching stories genuinely cannot tell what they have QA'd; this tells them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE RULES THIS FILE EXISTS TO ENFORCE — break one and the feature lies to the author.
 *
 *  1. IT NEVER RUNS IN A SHIPPED GAME. LivePreview gates every call on `!isStandalone`, and
 *     LivePreview is vendored wholesale into `gameEngineBundle.ts`, so that guard is load-bearing
 *     rather than cosmetic. A player's playthrough must never write to the author's coverage.
 *
 *  2. IT NEVER TOUCHES THE PROJECT. Coverage lives in localStorage, per project, on this machine
 *     (Brad's call). Play-testing therefore does not dirty the project, does not churn autosave, and
 *     does not show up as noise in Compare & Merge. The trade is that coverage does not travel with
 *     the .flourish — which is correct: "have *I* tested this" is a property of the author, not the story.
 *
 *  3. WHEN IN DOUBT, SHOW GREY. A route we failed to record reads as "not tested yet" — mildly
 *     annoying. A route we record that the player never took reads as "tested" — and the author
 *     ships a broken branch. So every ambiguous case here resolves towards under-reporting.
 *     Concretely: runtime transitions that match no edge in the static graph are silently dropped,
 *     and the cursor is reset (rather than guessed) on load / new game / rewind.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { VNID } from '../types';
import { FlowEdge, FlowNode, nodeKey, StoryGraph } from './storyGraph';

/** Bumped only if the stored shape ever changes incompatibly (a stale blob is simply discarded). */
const COVERAGE_VERSION = 1;

/**
 * A runaway safety net, not a real limit: even a 500-scene project with every route walked lands in
 * the low thousands. If we somehow blow past this, stop growing rather than bloat localStorage.
 */
const MAX_ENTRIES = 20000;

/** Fired on `window` after coverage is written, so an open Story Flow Map repaints immediately. */
export const COVERAGE_UPDATED_EVENT = 'flourish:coverageUpdated';

export interface StoredCoverage {
    v: number;
    /** Node keys (`scene:abc`) the player reached. */
    visited: string[];
    /** Routes taken, as `${fromKey}->${toKey}`. */
    traversed: string[];
    updatedAt: number;
}

export interface Coverage {
    visited: Set<string>;
    traversed: Set<string>;
    updatedAt: number;
}

export const EMPTY_COVERAGE: Coverage = { visited: new Set(), traversed: new Set(), updatedAt: 0 };

export const coverageStorageKey = (projectId: string): string => `flourish:coverage:${projectId}`;

/** A route's identity. The Flow Map intersects these with the static graph's edges. */
export const routeKey = (from: string, to: string): string => `${from}->${to}`;

// ── store ────────────────────────────────────────────────────────────────────

export function loadCoverage(projectId: string): Coverage {
    try {
        const raw = localStorage.getItem(coverageStorageKey(projectId));
        if (!raw) return { visited: new Set(), traversed: new Set(), updatedAt: 0 };
        const parsed = JSON.parse(raw) as StoredCoverage;
        if (!parsed || parsed.v !== COVERAGE_VERSION) return { visited: new Set(), traversed: new Set(), updatedAt: 0 };
        return {
            visited: new Set(Array.isArray(parsed.visited) ? parsed.visited : []),
            traversed: new Set(Array.isArray(parsed.traversed) ? parsed.traversed : []),
            updatedAt: parsed.updatedAt ?? 0,
        };
    } catch {
        return { visited: new Set(), traversed: new Set(), updatedAt: 0 };
    }
}

function writeCoverage(projectId: string, cov: Coverage): void {
    try {
        const payload: StoredCoverage = {
            v: COVERAGE_VERSION,
            visited: [...cov.visited].slice(0, MAX_ENTRIES),
            traversed: [...cov.traversed].slice(0, MAX_ENTRIES),
            updatedAt: cov.updatedAt,
        };
        localStorage.setItem(coverageStorageKey(projectId), JSON.stringify(payload));
    } catch {
        /* Storage full or unavailable — coverage is a convenience, never worth breaking test-play over. */
    }
}

function announce(projectId: string): void {
    try {
        window.dispatchEvent(new CustomEvent(COVERAGE_UPDATED_EVENT, { detail: { projectId } }));
    } catch { /* no window (tests) */ }
}

/**
 * Union new findings into what is already stored. Read-modify-write, because a popped-out test-play
 * window and the editor window share one localStorage partition and must not clobber each other.
 */
export function mergeCoverage(projectId: string, visited: Set<string>, traversed: Set<string>, now: number): void {
    if (!visited.size && !traversed.size) return;
    const existing = loadCoverage(projectId);
    for (const v of visited) existing.visited.add(v);
    for (const tr of traversed) existing.traversed.add(tr);
    existing.updatedAt = now;
    writeCoverage(projectId, existing);
    announce(projectId);
}

export function clearCoverage(projectId: string): void {
    try {
        localStorage.removeItem(coverageStorageKey(projectId));
    } catch { /* ignore */ }
    announce(projectId);
}

// ── stats (pure — this is what the Flow Map's readout and filters are built on) ───────────────

export interface CoverageStats {
    scenesSeen: number;
    scenesTotal: number;
    routesSeen: number;
    routesTotal: number;
    /** Node keys never reached (scenes and hubs alike). */
    untestedNodes: Set<string>;
    /** Edge ids never traversed. */
    untestedEdges: Set<string>;
    /** Edge ids traversed at least once. */
    coveredEdges: Set<string>;
    /** True once anything at all has been recorded — until then the map shows no coverage colours. */
    hasData: boolean;
}

/** True if this node counts as played. */
function isNodeCovered(node: FlowNode, cov: Coverage, anySceneVisited: boolean): boolean {
    // An 'auto'/'parallel' common event runs in EVERY scene by definition — if the author has played
    // any scene at all, they have run it. Claiming otherwise would be a lie the author can't act on.
    if (node.alwaysRuns) return anySceneVisited;
    return cov.visited.has(node.key);
}

export function computeCoverageStats(graph: StoryGraph, cov: Coverage): CoverageStats {
    const anySceneVisited = graph.nodes.some(n => n.kind === 'scene' && cov.visited.has(n.key));

    const untestedNodes = new Set<string>();
    let scenesSeen = 0;
    let scenesTotal = 0;
    for (const n of graph.nodes) {
        const covered = isNodeCovered(n, cov, anySceneVisited);
        if (!covered) untestedNodes.add(n.key);
        if (n.kind === 'scene') {
            scenesTotal++;
            if (covered) scenesSeen++;
        }
    }

    const coveredEdges = new Set<string>();
    const untestedEdges = new Set<string>();
    for (const e of graph.edges) {
        if (isEdgeCovered(e, cov)) coveredEdges.add(e.id);
        else untestedEdges.add(e.id);
    }

    return {
        scenesSeen,
        scenesTotal,
        routesSeen: coveredEdges.size,
        routesTotal: graph.edges.length,
        untestedNodes,
        untestedEdges,
        coveredEdges,
        hasData: cov.visited.size > 0,
    };
}

function isEdgeCovered(e: FlowEdge, cov: Coverage): boolean {
    return cov.traversed.has(routeKey(e.from, e.to));
}

// ── the recorder (lives inside the running game) ──────────────────────────────

/**
 * Everything the recorder needs to know about "where the player is right now", assembled by
 * LivePreview from state it already holds. All ids, no React.
 */
export interface CoverageSnapshot {
    sceneId: VNID | null;
    /**
     * The top *blocking* screen. Non-blocking HUD overlays (a health bar) MUST be left out: the
     * player is not "in" them, and treating one as the cursor would credit the author with taking a
     * route out of a screen they never opened. That is the false-green failure mode of rule 3.
     */
    screenId: VNID | null;
    /** Common event currently executing (top command-stack frame). */
    commonEventId: VNID | null;
    mapId: VNID | null;
    miniGameId: VNID | null;
}

const EMPTY_SNAPSHOT: CoverageSnapshot = {
    sceneId: null, screenId: null, commonEventId: null, mapId: null, miniGameId: null,
};

/** Debounced so a fast-clicking author doesn't hit localStorage on every command. */
const FLUSH_MS = 600;

export class CoverageRecorder {
    private readonly projectId: string;
    /** Where the player is. A route is recorded whenever this moves. */
    private cursor: string | null = null;
    private prev: CoverageSnapshot = EMPTY_SNAPSHOT;
    private visited = new Set<string>();
    private traversed = new Set<string>();
    private dirty = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    constructor(projectId: string) {
        this.projectId = projectId;
    }

    /**
     * Forget where we were, WITHOUT recording a route. Call before any jump the player did not
     * "walk": starting a new game, loading a save, and rewinding history. Each of those moves the
     * scene, and crediting that move as a route the author tested would be a lie — a rewind from B
     * back to A would light up A→B's twin edge in a story loop.
     */
    resetCursor(): void {
        this.cursor = null;
        this.prev = EMPTY_SNAPSHOT;
    }

    observe(snap: CoverageSnapshot): void {
        if (this.disposed) return;
        const prev = this.prev;

        const move = (key: string) => {
            if (this.cursor && this.cursor !== key) this.traversed.add(routeKey(this.cursor, key));
            this.cursor = key;
            this.visited.add(key);
            this.dirty = true;
        };

        // Hubs first: entering one is what the player did, and the scene change (if any) in this same
        // React batch is the hub's CONSEQUENCE — so the route out of a screen leaves FROM the screen.
        if (snap.commonEventId && snap.commonEventId !== prev.commonEventId) move(nodeKey('commonEvent', snap.commonEventId));
        if (snap.screenId && snap.screenId !== prev.screenId) move(nodeKey('screen', snap.screenId));
        if (snap.mapId && snap.mapId !== prev.mapId) move(nodeKey('map', snap.mapId));
        if (snap.miniGameId && snap.miniGameId !== prev.miniGameId) move(nodeKey('miniGame', snap.miniGameId));

        if (snap.sceneId && snap.sceneId !== prev.sceneId) {
            move(nodeKey('scene', snap.sceneId));
        } else if (snap.sceneId && !snap.screenId && !snap.mapId && !snap.miniGameId && !snap.commonEventId) {
            // Every hub closed and we are back in the scene we never left → return the cursor to it,
            // but record NO route: closing a screen isn't a story transition.
            this.cursor = nodeKey('scene', snap.sceneId);
        }

        this.prev = snap;
        if (this.dirty) this.scheduleFlush();
    }

    private scheduleFlush(): void {
        if (this.timer !== null) return;
        this.timer = setTimeout(() => { this.timer = null; this.flush(); }, FLUSH_MS);
    }

    /** Union what we've seen into the store. Safe to call any number of times. */
    flush(): void {
        if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
        if (!this.dirty) return;
        this.dirty = false;
        mergeCoverage(this.projectId, this.visited, this.traversed, Date.now());
    }

    dispose(): void {
        this.flush();
        this.disposed = true;
    }
}
