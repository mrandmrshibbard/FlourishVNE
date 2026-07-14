/**
 * Follow one variable through the whole story.
 *
 * Pick Affection on the Story Flow Map and this answers, for every scene: how much does this scene
 * change it, and — the part no VN tool does — **what value could the player possibly arrive here
 * with?** Which in turn answers the question that costs authors days:
 *
 *     "Your 'true love' ending needs Affection ≥ 70, and NO ROUTE THROUGH YOUR STORY can reach 70."
 *
 * That is a bug you currently cannot find without playing every branch, because nothing errors — the
 * ending simply never happens, and the author concludes the engine is broken.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW IT WORKS: interval arithmetic over the story graph.
 *
 * A scene doesn't change a variable by one number — it changes it by a RANGE, because the player's
 * choices and the scene's conditions decide what actually runs. So every value here is a range
 * [lo, hi] meaning "could be anywhere in here", and a scene is a FUNCTION from range to range:
 *
 *     +5 unconditionally        → [lo+5, hi+5]
 *     +5 only if a condition    → union([lo,hi], [lo+5,hi+5])   — it might not fire
 *     set to 10                 → [10, 10]                       — history is erased, not added to
 *     a choice: +5 or −2        → union of both, because the player picks exactly one
 *
 * Then we push those ranges along the graph's edges to a fixed point.
 *
 * THREE THINGS THAT MAKE THIS HONEST RATHER THAN CLEVER:
 *  1. **Cycles.** Story loops mean a naive propagation never terminates (+1 forever). We iterate to a
 *     fixed point with a hard cap, and any node still growing when the cap hits is marked `unbounded`
 *     rather than reported with a made-up number.
 *  2. **`min`/`max` clamping** is applied at every step, exactly as the engine clamps writes. That is
 *     what makes most loops converge, and it is why a capped variable gives a real answer.
 *  3. **When in doubt, DON'T warn.** A gate is only reported unreachable when the arrival range and
 *     the condition provably cannot overlap. Anything we can't see (a script, an unbounded loop) makes
 *     the analysis give up on that node instead of crying wolf. A false "this is unreachable" would be
 *     far worse than silence — the author would go and "fix" working content.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pure. Editor-only.
 */
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { VNCondition } from '../types/shared';
import { UIActionType } from '../types/shared';
import { CommandType, VNCommand } from '../features/scene/types';
import { VNVariable } from '../features/variables/types';
import { FlowEdge, FlowNode, nodeKey, StoryGraph } from './storyGraph';
import { sortedBands, bandById, isBandOperator, nextBand } from '../features/variables/bands';
import { variableLabel } from './variableLanguage';

export interface Range { lo: number; hi: number }

/** One thing a scene does to the variable. `optional` = it might not happen (a condition, a choice). */
export interface FlowOp {
    kind: 'add' | 'set' | 'random';
    /** For add: the delta (negative for a subtract). For set: the value. */
    value: number;
    /** For random. */
    lo?: number;
    hi?: number;
    optional: boolean;
}

export interface NodeFlow {
    /** What could the player be carrying when they get here? null = we never reach it. */
    arrive: Range | null;
    /** …and when they leave. */
    leave: Range | null;
    ops: FlowOp[];
    /** "+5" · "−3" · "0 to +5" · "set to 10" · '' when it doesn't touch the variable. */
    summary: string;
    /** A story loop kept growing the value — we stopped rather than invent a number. */
    unbounded: boolean;
}

export interface DeadGate {
    nodeKey: string;
    nodeName: string;
    /** Plain sentence: what it needs, and what's actually reachable. */
    message: string;
}

export interface VariableFlow {
    variableId: VNID;
    nodes: Map<string, NodeFlow>;
    /** Edges leaving a node that CHANGED the variable — these are the ones that get the light trail. */
    flowingEdges: Set<string>;
    /** Conditions on this variable that no route can ever satisfy. THE payoff. */
    deadGates: DeadGate[];
    /** True if anything (a script, an unreachable region) made us give up somewhere. */
    incomplete: boolean;
}

// ── range maths ──────────────────────────────────────────────────────────────

const union = (a: Range | null, b: Range | null): Range | null =>
    !a ? b : !b ? a : { lo: Math.min(a.lo, b.lo), hi: Math.max(a.hi, b.hi) };

const same = (a: Range | null, b: Range | null): boolean =>
    (!a && !b) || (!!a && !!b && a.lo === b.lo && a.hi === b.hi);

function clamp(r: Range, variable: VNVariable): Range {
    let { lo, hi } = r;
    if (variable.min !== undefined) { lo = Math.max(lo, variable.min); hi = Math.max(hi, variable.min); }
    if (variable.max !== undefined) { lo = Math.min(lo, variable.max); hi = Math.min(hi, variable.max); }
    return { lo, hi };
}

/** Apply one scene's worth of ops to an incoming range. This IS the model — see the header. */
export function applyOps(start: Range, ops: FlowOp[], variable: VNVariable): Range {
    let r = start;
    for (const op of ops) {
        let next: Range;
        if (op.kind === 'add') next = { lo: r.lo + op.value, hi: r.hi + op.value };
        else if (op.kind === 'set') next = { lo: op.value, hi: op.value };
        else next = { lo: op.lo ?? 0, hi: op.hi ?? 0 };
        // "Might not happen" means the OLD range is still possible alongside the new one.
        r = clamp(op.optional ? (union(r, next) as Range) : next, variable);
    }
    return r;
}

// ── reading the ops out of a scene ───────────────────────────────────────────

const opFromSetVariable = (c: any, optional: boolean): FlowOp | null => {
    const n = Number(c.value);
    switch (c.operator) {
        case 'add': return Number.isFinite(n) ? { kind: 'add', value: n, optional } : null;
        case 'subtract': return Number.isFinite(n) ? { kind: 'add', value: -n, optional } : null;
        case 'random': return { kind: 'random', value: 0, lo: Number(c.randomMin ?? 0), hi: Number(c.randomMax ?? 100), optional };
        case 'set': return Number.isFinite(n) ? { kind: 'set', value: n, optional } : null;
        default: return null;
    }
};

/**
 * Everything in this command list that touches our variable.
 *
 * `optional` is the load-bearing flag. A command is optional when it might not run:
 *   • it carries its own `conditions`
 *   • it sits INSIDE a Branch (an if-block — tracked by depth through the Branch markers)
 *   • it hangs off a choice option (the player picks exactly one, so across the whole choice the
 *     effect is a union — which is what marking each one optional gives us)
 */
function readOps(commands: VNCommand[], variableId: VNID): FlowOp[] {
    const ops: FlowOp[] = [];
    let branchDepth = 0;

    for (const command of commands) {
        const c = command as any;
        const type = command.type;

        if (type === CommandType.BranchStart) { branchDepth++; continue; }
        if (type === CommandType.BranchEnd) { branchDepth = Math.max(0, branchDepth - 1); continue; }

        const conditional = branchDepth > 0 || (Array.isArray(c.conditions) && c.conditions.length > 0);

        if (type === CommandType.SetVariable && c.variableId === variableId) {
            const op = opFromSetVariable(c, conditional);
            if (op) ops.push(op);
        }

        // A choice's options: the player takes exactly ONE, so each is a "might happen".
        if (type === CommandType.Choice) {
            for (const opt of (c.options ?? []) as any[]) {
                for (const a of (opt?.actions ?? []) as any[]) {
                    if (a?.type === UIActionType.SetVariable && a.variableId === variableId) {
                        const op = opFromSetVariable(a, true);
                        if (op) ops.push(op);
                    }
                }
            }
        }

        // Any other action list hanging off this command (a button, a hot spot, a timer).
        for (const key of ['actions', 'onClick', 'onComplete', 'timeoutActions']) {
            const list = Array.isArray(c[key]) ? c[key] : (c[key] ? [c[key]] : []);
            for (const a of list as any[]) {
                if (a?.type === UIActionType.SetVariable && a.variableId === variableId) {
                    const op = opFromSetVariable(a, true);
                    if (op) ops.push(op);
                }
            }
        }

        // The player types a number in — we cannot know what.
        if (type === CommandType.TextInput && c.variableId === variableId) {
            ops.push({ kind: 'random', value: 0, lo: -Infinity, hi: Infinity, optional: false });
        }
    }
    return ops;
}

/** "+5" / "−3" / "0 to +5" / "set to 10" — what the chip on the node card says. */
function summarise(ops: FlowOp[], variable: VNVariable): string {
    if (!ops.length) return '';
    // The common, readable case: only plain adds/subtracts that all definitely happen.
    if (ops.every(o => o.kind === 'add' && !o.optional)) {
        const total = ops.reduce((s, o) => s + o.value, 0);
        if (total === 0) return '±0';
        return total > 0 ? `+${total}` : `−${Math.abs(total)}`;
    }
    if (ops.length === 1 && ops[0].kind === 'set') return `set to ${ops[0].value}`;

    // Otherwise show the possible swing, measured from zero.
    const r = applyOps({ lo: 0, hi: 0 }, ops.map(o => ({ ...o })), { ...variable, min: undefined, max: undefined });
    if (!Number.isFinite(r.lo) || !Number.isFinite(r.hi)) return 'changes';
    const fmt = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
    return r.lo === r.hi ? fmt(r.lo) : `${fmt(r.lo)} to ${fmt(r.hi)}`;
}

// ── conditions ───────────────────────────────────────────────────────────────

/** Could `range` ever satisfy this condition? Only `false` when it PROVABLY cannot. */
function canSatisfy(cond: VNCondition, range: Range, variable: VNVariable): boolean {
    if (!Number.isFinite(range.lo) || !Number.isFinite(range.hi)) return true;   // unknown → don't warn

    if (isBandOperator(cond.operator)) {
        const band = bandById(variable, cond.value);
        if (!band) return true;
        const above = nextBand(variable, band);
        const bandLo = band.min;
        const bandHi = above ? above.min - Number.EPSILON : Infinity;
        if (cond.operator === 'inBand') return range.hi >= bandLo && range.lo <= bandHi;
        if (cond.operator === 'atLeastBand') return range.hi >= bandLo;
        return range.lo < bandLo;                                                 // belowBand
    }

    const v = Number(cond.value);
    if (!Number.isFinite(v)) return true;
    switch (cond.operator) {
        case '>': return range.hi > v;
        case '>=': return range.hi >= v;
        case '<': return range.lo < v;
        case '<=': return range.lo <= v;
        case '==': return range.lo <= v && v <= range.hi;
        default: return true;                                                     // !=, contains… → never claim dead
    }
}

/** What the condition asks for, in words. */
function describeNeed(cond: VNCondition, variable: VNVariable): string {
    if (isBandOperator(cond.operator)) {
        const band = bandById(variable, cond.value);
        const name = band?.name ?? '…';
        return cond.operator === 'inBand' ? `to be ${name}`
            : cond.operator === 'atLeastBand' ? `to be ${name} or better`
            : `to be below ${name}`;
    }
    const word = cond.operator === '>' ? 'more than'
        : cond.operator === '>=' ? 'at least'
        : cond.operator === '<' ? 'less than'
        : cond.operator === '<=' ? 'at most'
        : 'to be';
    return `${word} ${cond.value}`;
}

/** Every condition on OUR variable, anywhere in a scene's commands (including choice options). */
function readConditions(commands: VNCommand[], variableId: VNID): VNCondition[] {
    const out: VNCondition[] = [];
    const take = (list: unknown) => {
        if (!Array.isArray(list)) return;
        for (const c of list as VNCondition[]) if (c?.variableId === variableId) out.push(c);
    };
    for (const command of commands) {
        const c = command as any;
        take(c.conditions);
        take(c.showConditions);
        take(c.waitConditions);
        for (const opt of (c.options ?? []) as any[]) take(opt?.conditions);
    }
    return out;
}

// ── the analysis ─────────────────────────────────────────────────────────────

/**
 * Fixed-point loop settings.
 *
 * A story loop grows the value one step per pass, so a `+1` loop on a 0–100 variable would need a
 * hundred passes to settle, and a loop on an UNCAPPED variable would never settle at all. Iterating
 * harder doesn't fix that — the second case has no answer.
 *
 * So after WIDEN_AFTER passes we stop crawling and JUMP a still-growing range straight to its limit:
 * the variable's own min/max if it has them, and ±Infinity if it doesn't. (This is "widening", the
 * standard trick for exactly this problem.) A capped loop therefore lands on its true answer — 0–100 —
 * immediately, and an uncapped one becomes explicitly infinite, which is the honest result: we then
 * report it as `unbounded` and refuse to make any claim about what is reachable there.
 */
const WIDEN_AFTER = 6;
const MAX_PASSES = 40;

export function computeVariableFlow(project: VNProject, graph: StoryGraph, variableId: VNID): VariableFlow {
    const variable = project.variables[variableId];
    const empty: VariableFlow = { variableId, nodes: new Map(), flowingEdges: new Set(), deadGates: [], incomplete: false };
    if (!variable || variable.type !== 'number') return empty;

    // 1. What does each node DO to the variable?
    const opsByNode = new Map<string, FlowOp[]>();
    const condsByNode = new Map<string, VNCondition[]>();
    for (const node of graph.nodes) {
        const commands: VNCommand[] =
            node.kind === 'scene' ? ((project.scenes as any)[node.id]?.commands ?? [])
            : node.kind === 'commonEvent' ? (((project as any).commonEvents ?? {})[node.id]?.commands ?? [])
            : [];
        if (!commands.length) continue;
        const ops = readOps(commands, variableId);
        if (ops.length) opsByNode.set(node.key, ops);
        const conds = readConditions(commands, variableId);
        if (conds.length) condsByNode.set(node.key, conds);
    }

    // 2. Push value ranges along the edges to a fixed point.
    const start = Number(variable.defaultValue) || 0;
    const arrive = new Map<string, Range | null>();
    for (const node of graph.nodes) arrive.set(node.key, null);

    const entries = graph.entryPoints.length
        ? graph.entryPoints
        : [nodeKey('scene', project.startSceneId)];
    for (const key of entries) {
        if (arrive.has(key)) arrive.set(key, clamp({ lo: start, hi: start }, variable));
    }

    const outgoing = new Map<string, FlowEdge[]>();
    for (const e of graph.edges) {
        if (!outgoing.has(e.from)) outgoing.set(e.from, []);
        outgoing.get(e.from)!.push(e);
    }

    const leaveOf = (key: string): Range | null => {
        const a = arrive.get(key) ?? null;
        if (!a) return null;
        return applyOps(a, opsByNode.get(key) ?? [], variable);
    };

    /** Push a still-growing range straight to its limit — see WIDEN_AFTER. */
    const widen = (before: Range, after: Range): Range => ({
        lo: after.lo < before.lo ? (variable.min ?? -Infinity) : after.lo,
        hi: after.hi > before.hi ? (variable.max ?? Infinity) : after.hi,
    });

    let passes = 0;
    let changed = true;
    while (changed && passes < MAX_PASSES) {
        changed = false;
        passes++;
        for (const node of graph.nodes) {
            const out = leaveOf(node.key);
            if (!out) continue;
            for (const e of outgoing.get(node.key) ?? []) {
                const before = arrive.get(e.to) ?? null;
                let merged = union(before, out);
                if (before && merged && passes > WIDEN_AFTER) merged = widen(before, merged);
                if (!same(before, merged)) {
                    arrive.set(e.to, merged);
                    changed = true;
                }
            }
        }
    }

    // A node is "unbounded" when its reachable range is literally infinite — a story loop that adds to
    // an uncapped variable. We then make NO claim about what's reachable there.
    const unbounded = new Set<string>();
    for (const node of graph.nodes) {
        const a = arrive.get(node.key);
        if (a && (!Number.isFinite(a.lo) || !Number.isFinite(a.hi))) unbounded.add(node.key);
    }

    // 3. Build the per-node result.
    const nodes = new Map<string, NodeFlow>();
    for (const node of graph.nodes) {
        const ops = opsByNode.get(node.key) ?? [];
        const a = arrive.get(node.key) ?? null;
        nodes.set(node.key, {
            arrive: a,
            leave: leaveOf(node.key),
            ops,
            summary: summarise(ops, variable),
            unbounded: unbounded.has(node.key),
        });
    }

    // 4. Which edges carry a CHANGED value downstream? Those get the light trail.
    const flowingEdges = new Set<string>();
    for (const e of graph.edges) {
        const f = nodes.get(e.from);
        if (f && f.ops.length) flowingEdges.add(e.id);
    }

    // 5. THE PAYOFF: gates no route can ever open.
    const byKey = new Map(graph.nodes.map(n => [n.key, n] as [string, FlowNode]));
    const deadGates: DeadGate[] = [];
    for (const [key, conds] of condsByNode) {
        const flow = nodes.get(key);
        if (!flow || !flow.arrive || flow.unbounded) continue;      // never reached, or we can't be sure
        // Be generous: the condition might be checked before or after this scene's own changes, so
        // test against everything the value could be while we're here. Erring toward "reachable".
        const span = union(flow.arrive, flow.leave)!;
        for (const cond of conds) {
            if (canSatisfy(cond, span, variable)) continue;
            const node = byKey.get(key);
            deadGates.push({
                nodeKey: key,
                nodeName: node?.name ?? key,
                message: `“${node?.name ?? key}” needs ${variableLabel(variable)} ${describeNeed(cond, variable)}, but no route through your story can get it past ${fmtRange(span)}. That branch can never happen.`,
            });
        }
    }

    return {
        variableId,
        nodes,
        flowingEdges,
        deadGates,
        incomplete: graph.diagnostics.hasDynamicRoutes || unbounded.size > 0,
    };
}

export function fmtRange(r: Range): string {
    if (!Number.isFinite(r.lo) || !Number.isFinite(r.hi)) return 'anything';
    const round = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    return r.lo === r.hi ? round(r.lo) : `${round(r.lo)}–${round(r.hi)}`;
}
