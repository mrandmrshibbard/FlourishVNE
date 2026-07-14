/**
 * Story Flow Map — auto-layout. Pure, no dependencies (the app is offline-bundled; no d3/dagre).
 *
 * A "Sugiyama-lite" layered layout, left→right (layers are COLUMNS — stories read left-to-right and
 * node cards are wide, so LR wastes far less space than top-down):
 *
 *   1. Cycle removal   — iterative DFS (never recursive: a 500-scene chain would blow the JS stack)
 *                        with 3-colour marking. Edges pointing at a node still on the stack are
 *                        BACK-EDGES; they're excluded from layering and drawn as loop-backs.
 *   2. Layering        — longest-path via Kahn topological order. Longest-path (not BFS-shortest)
 *                        guarantees every forward edge strictly increases the layer, so arrows never
 *                        point backwards except the loop-backs we deliberately style that way.
 *   3. Ordering        — barycenter heuristic, 2 down-sweeps + 2 up-sweeps, STABLE, with the project's
 *                        record order as the tie-break. So a linear story lays out in exactly the order
 *                        the author wrote it — free, and a big usability win.
 *   4. Packing         — lay out each weakly-connected component separately and stack them vertically:
 *                        the component containing the start scene first, orphan islands LAST. Orphans
 *                        literally end up in a lonely block at the bottom, which is the point.
 *
 * Deterministic: no Math.random, no reliance on object identity ordering.
 */
import { StoryGraph, FlowEdge } from './storyGraph';

export interface LayoutOptions { nodeW: number; nodeH: number; gapX: number; gapY: number; componentGap: number }
export interface LayoutResult {
    positions: Record<string, { x: number; y: number }>;
    /** Edge ids that point "backwards" (a loop) — the renderer routes these differently. */
    backEdges: Set<string>;
    width: number;
    height: number;
}

const DEFAULTS: LayoutOptions = { nodeW: 210, nodeH: 96, gapX: 90, gapY: 26, componentGap: 90 };

export function layoutStoryGraph(graph: StoryGraph, options?: Partial<LayoutOptions>): LayoutResult {
    const opt = { ...DEFAULTS, ...options };
    const positions: Record<string, { x: number; y: number }> = {};
    const backEdges = new Set<string>();

    const keys = graph.nodes.map(n => n.key);
    if (!keys.length) return { positions, backEdges, width: 0, height: 0 };

    const order = new Map<string, number>();       // record order — the stable tie-break
    keys.forEach((k, i) => order.set(k, i));

    // Real edges only: drop self-loops (they're drawn as a little arc, they don't affect layering).
    const edges = graph.edges.filter(e => e.from !== e.to && order.has(e.from) && order.has(e.to));

    // ── 1. cycle removal (iterative DFS, 3-colour) ───────────────────────────
    const out = new Map<string, FlowEdge[]>();
    for (const e of edges) { const a = out.get(e.from) ?? []; a.push(e); out.set(e.from, a); }

    const WHITE = 0, GREY = 1, BLACK = 2;
    const colour = new Map<string, number>(keys.map(k => [k, WHITE]));
    // Seed from the entry points first so the "main" traversal starts where the story starts.
    const roots = [...graph.entryPoints.filter(k => order.has(k)), ...keys];
    for (const root of roots) {
        if (colour.get(root) !== WHITE) continue;
        // frame = [node, index-of-next-out-edge-to-explore]
        const stack: [string, number][] = [[root, 0]];
        colour.set(root, GREY);
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const [n, i] = frame;
            const outs = out.get(n) ?? [];
            if (i >= outs.length) { colour.set(n, BLACK); stack.pop(); continue; }
            frame[1] = i + 1;
            const e = outs[i];
            const c = colour.get(e.to);
            if (c === GREY) { backEdges.add(e.id); continue; }   // points at an ancestor → a loop
            if (c === WHITE) { colour.set(e.to, GREY); stack.push([e.to, 0]); }
        }
    }

    const dag = edges.filter(e => !backEdges.has(e.id));

    // ── weakly-connected components (over the UNdirected graph, back-edges included) ──
    const comp = new Map<string, number>();
    let compCount = 0;
    const undirected = new Map<string, string[]>();
    for (const e of edges) {
        (undirected.get(e.from) ?? undirected.set(e.from, []).get(e.from)!).push(e.to);
        (undirected.get(e.to) ?? undirected.set(e.to, []).get(e.to)!).push(e.from);
    }
    for (const k of keys) {
        if (comp.has(k)) continue;
        const id = compCount++;
        const q = [k];
        comp.set(k, id);
        while (q.length) {
            const cur = q.shift()!;
            for (const nb of (undirected.get(cur) ?? [])) {
                if (!comp.has(nb)) { comp.set(nb, id); q.push(nb); }
            }
        }
    }

    const startKey = graph.entryPoints[0];
    const entrySet = new Set(graph.entryPoints);
    const components: string[][] = Array.from({ length: compCount }, () => []);
    for (const k of keys) components[comp.get(k)!].push(k);

    // Main component (contains the start) first; then components with an entry point; orphans last.
    const rank = (members: string[]) => {
        if (startKey && members.includes(startKey)) return 0;
        if (members.some(m => entrySet.has(m))) return 1;
        return 2;
    };
    const ordered = components
        .map((members, i) => ({ members, i }))
        .sort((a, b) => (rank(a.members) - rank(b.members)) || (b.members.length - a.members.length) || (a.i - b.i));

    // ── lay out each component, stacking them vertically ─────────────────────
    let yCursor = 0;
    let maxWidth = 0;

    for (const { members } of ordered) {
        const inComp = new Set(members);
        const cDag = dag.filter(e => inComp.has(e.from) && inComp.has(e.to));

        // 2. layering — longest path via Kahn
        const indeg = new Map<string, number>(members.map(k => [k, 0]));
        const cOut = new Map<string, string[]>();
        for (const e of cDag) {
            indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
            (cOut.get(e.from) ?? cOut.set(e.from, []).get(e.from)!).push(e.to);
        }
        const layer = new Map<string, number>(members.map(k => [k, 0]));
        // Stable seed order so layout is deterministic.
        const queue = members.filter(k => (indeg.get(k) ?? 0) === 0).sort((a, b) => order.get(a)! - order.get(b)!);
        const processed = new Set<string>();
        while (queue.length) {
            const n = queue.shift()!;
            processed.add(n);
            for (const m of (cOut.get(n) ?? [])) {
                layer.set(m, Math.max(layer.get(m) ?? 0, (layer.get(n) ?? 0) + 1));
                const d = (indeg.get(m) ?? 0) - 1;
                indeg.set(m, d);
                if (d === 0) queue.push(m);
            }
        }
        // Anything left (shouldn't happen post-cycle-removal) keeps layer 0 — never drop a node.

        const maxLayer = members.reduce((m, k) => Math.max(m, layer.get(k) ?? 0), 0);
        const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
        for (const k of members.slice().sort((a, b) => order.get(a)! - order.get(b)!)) {
            layers[layer.get(k) ?? 0].push(k);
        }

        // 3. ordering — barycenter, 2 down + 2 up sweeps (stable; ties keep record order)
        const preds = new Map<string, string[]>();
        const succs = new Map<string, string[]>();
        for (const e of cDag) {
            (preds.get(e.to) ?? preds.set(e.to, []).get(e.to)!).push(e.from);
            (succs.get(e.from) ?? succs.set(e.from, []).get(e.from)!).push(e.to);
        }
        const indexIn = (L: number) => {
            const m = new Map<string, number>();
            layers[L]?.forEach((k, i) => m.set(k, i));
            return m;
        };
        const sweep = (L: number, neighbours: Map<string, string[]>, refLayer: number) => {
            if (!layers[L] || refLayer < 0 || refLayer >= layers.length) return;
            const ref = indexIn(refLayer);
            const bary = new Map<string, number>();
            layers[L].forEach((k, i) => {
                const nb = (neighbours.get(k) ?? []).map(x => ref.get(x)).filter((v): v is number => v !== undefined);
                bary.set(k, nb.length ? nb.reduce((a, b) => a + b, 0) / nb.length : i);
            });
            // Stable sort: equal barycenters keep their current (record-derived) order.
            layers[L] = layers[L]
                .map((k, i) => ({ k, i, b: bary.get(k)! }))
                .sort((a, b) => (a.b - b.b) || (a.i - b.i))
                .map(x => x.k);
        };
        for (let pass = 0; pass < 2; pass++) {
            for (let L = 1; L <= maxLayer; L++) sweep(L, preds, L - 1);
            for (let L = maxLayer - 1; L >= 0; L--) sweep(L, succs, L + 1);
        }

        // 4. coordinates — columns, vertically centred against the tallest column
        const colHeights = layers.map(col => col.length * opt.nodeH + Math.max(0, col.length - 1) * opt.gapY);
        const tallest = Math.max(0, ...colHeights);
        layers.forEach((col, L) => {
            const offset = (tallest - colHeights[L]) / 2;
            col.forEach((k, i) => {
                positions[k] = {
                    x: L * (opt.nodeW + opt.gapX),
                    y: yCursor + offset + i * (opt.nodeH + opt.gapY),
                };
            });
        });

        const compWidth = (maxLayer + 1) * opt.nodeW + maxLayer * opt.gapX;
        maxWidth = Math.max(maxWidth, compWidth);
        yCursor += tallest + opt.componentGap;
    }

    return {
        positions,
        backEdges,
        width: maxWidth,
        height: Math.max(0, yCursor - opt.componentGap),
    };
}
