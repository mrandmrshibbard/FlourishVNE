/**
 * Story Flow Map — graph extractor.
 *
 * Pure, editor-only. Walks a VNProject and produces the node-graph the Story Flow Map draws:
 * scenes (plus the screens / common events / mini-games / maps they route through) as NODES,
 * story transitions as EDGES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THING EVERY OTHER VN FLOW MAP GETS WRONG — implicit fall-through.
 * When a scene's commands run out, the engine does NOT end the story: it advances to the NEXT
 * SCENE IN `Object.keys(project.scenes)` ORDER (see LivePreview: "Last scene completed" logic).
 * Only the LAST scene in that order is a true terminal. So a scene with no Jump is still connected.
 * If we modelled only explicit jumps, the map would show a sea of islands and falsely flag half the
 * project unreachable. We emit a `fallthrough` edge instead — which ALSO surfaces *accidental*
 * fall-through ("this quietly continues to X — did you mean that?"), a common hidden bug.
 *
 * TWO SUBTLETIES THAT LOOK LIKE BUGS (they are not — do not "fix" them):
 *  1. `JumpToLabel` as a COMMAND is cross-scene (it searches the current scene, then every other
 *     scene in record order). As a UI ACTION (`UIActionType.JumpToLabel`) it is CURRENT-SCENE ONLY.
 *     So the action never emits a cross-scene edge. This asymmetry is real engine behaviour.
 *  2. A hub (common event / screen / map / mini-game) is walked EXACTLY ONCE globally, and its
 *     outgoing edges leave from the HUB's node — not from each caller. Callers just emit one edge
 *     INTO the hub. This is what stops an auto-run Common Event with a Jump from fanning N edges
 *     out of every scene in the project (which would make the map unreadable), and it doubles as
 *     the recursion guard.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { VNID } from '../types';
import { VNProject } from '../types/project';
import { CommandType, VNCommand } from '../features/scene/types';
import { UIActionType, VNUIAction } from '../types/shared';

export type FlowNodeKind = 'scene' | 'screen' | 'commonEvent' | 'miniGame' | 'map';

export type FlowEdgeKind =
    | 'jump'         // Jump command / JumpToScene action — a hard jump
    | 'choice'       // via a Choice option, button, hot spot, phone reply…
    | 'fallthrough'  // IMPLICIT: commands ran out → next scene in record order
    | 'fallback'     // VNScene.fallbackSceneId (the scene's conditions failed)
    | 'label'        // JumpToLabel command that resolved into a DIFFERENT scene
    | 'call'         // CallCommonEvent → the common-event node
    | 'opens'        // ShowScreen / ShowMap / ShowMiniGame → that hub's node
    | 'outcome';     // a mini-game win/lose/skip/tier, or a map location

export type FlowTerminal = 'title' | 'exit' | 'credits' | 'endOfList';

export interface FlowNode {
    key: string;                // `${kind}:${id}` — the graph's identity
    kind: FlowNodeKind;
    id: VNID;
    name: string;
    /** e.g. "12 steps" — plain language, no jargon. */
    subtitle: string;
    isStart: boolean;
    isEntry: boolean;
    terminals: FlowTerminal[];
    /** Has terminals AND no outgoing edges → a real ending. */
    isTerminalOnly: boolean;
    isUnreachable: boolean;
    /** No way out at all and no ending → the player gets stuck. */
    isDeadEnd: boolean;
    /** A script (or Load Game) may jump somewhere we cannot know without running the game. */
    hasDynamicExit: boolean;
    /** Scene quietly continues to this scene because it has no explicit ending/jump. */
    fallsThroughTo?: VNID;
    /** Common event with trigger 'auto'/'parallel' — it runs in EVERY scene. */
    alwaysRuns?: boolean;
}

export interface FlowEdge {
    id: string;
    from: string;               // node key
    to: string;                 // node key
    kind: FlowEdgeKind;
    /** Inside a Branch, or the action/option/location carries `conditions` → may not be taken. */
    conditional: boolean;
    /** Plain-language label, e.g. the choice's text. May be ''. */
    label: string;
    /** Merged duplicates (5 choices to the same scene = one arrow ×5). */
    count: number;
    origin?: { sceneId?: VNID; commandIndex?: number };
}

export interface FlowDiagnostics {
    unreachable: string[];      // node keys
    deadEnds: string[];
    endings: string[];
    /** Points at a scene/label/hub that no longer exists. */
    danglingTargets: { from: string; target: string; what: string }[];
    /** True when anything in the project can jump somewhere we can't see (script / load). */
    hasDynamicRoutes: boolean;
}

export interface StoryGraph {
    nodes: FlowNode[];
    edges: FlowEdge[];
    entryPoints: string[];
    diagnostics: FlowDiagnostics;
}

export const nodeKey = (kind: FlowNodeKind, id: VNID): string => `${kind}:${id}`;

/** Guard against a data shape nobody anticipated (e.g. a timer whose onComplete starts a timer). */
const MAX_DEPTH = 64;

interface Ctx {
    project: VNProject;
    nodes: Map<string, FlowNode>;
    edges: Map<string, FlowEdge>;
    /** Hubs already walked (or in progress) — walk each exactly once; also the cycle guard. */
    hubsWalked: Set<string>;
    /** labelId → scene ids (record order) that define that Label. */
    labelIndex: Map<string, VNID[]>;
    dangling: { from: string; target: string; what: string }[];
    /** Set while walking a scene at branch-depth 0 and the scene provably leaves/ends. */
    terminates: boolean;
    dynamic: boolean;
}

// ── node helpers ─────────────────────────────────────────────────────────────

function ensureNode(ctx: Ctx, kind: FlowNodeKind, id: VNID, name: string, subtitle = ''): FlowNode | null {
    if (!id) return null;
    const key = nodeKey(kind, id);
    let n = ctx.nodes.get(key);
    if (!n) {
        n = {
            key, kind, id, name, subtitle,
            isStart: false, isEntry: false,
            terminals: [], isTerminalOnly: false,
            isUnreachable: false, isDeadEnd: false, hasDynamicExit: false,
        };
        ctx.nodes.set(key, n);
    }
    return n;
}

function addEdge(ctx: Ctx, from: string, to: string, kind: FlowEdgeKind, conditional: boolean, label: string, origin?: FlowEdge['origin']) {
    if (!from || !to) return;
    const k = `${from}|${to}|${kind}|${conditional ? 1 : 0}`;
    const existing = ctx.edges.get(k);
    if (existing) {
        existing.count += 1;
        // Two different labels merged → show the count instead of a misleading single label.
        if (label && existing.label && existing.label !== label) existing.label = '';
        else if (label && !existing.label) existing.label = label;
        return;
    }
    ctx.edges.set(k, { id: k, from, to, kind, conditional, label, count: 1, origin });
}

function markTerminal(ctx: Ctx, ownerKey: string, t: FlowTerminal, isSceneOwner: boolean, branchDepth: number) {
    const n = ctx.nodes.get(ownerKey);
    if (n && !n.terminals.includes(t)) n.terminals.push(t);
    if (isSceneOwner && branchDepth === 0) ctx.terminates = true;
}

// ── hub resolution: walk each hub once; callers just link INTO it ─────────────

function linkHub(ctx: Ctx, fromKey: string, kind: FlowNodeKind, id: VNID, edgeKind: FlowEdgeKind, conditional: boolean, label: string, origin?: FlowEdge['origin']): void {
    const p = ctx.project;
    let name = '';
    if (kind === 'commonEvent') name = (p.commonEvents as any)?.[id]?.name;
    else if (kind === 'screen') name = (p.uiScreens as any)?.[id]?.name;
    else if (kind === 'map') name = (p.maps as any)?.[id]?.name;
    else if (kind === 'miniGame') name = (p.miniGames as any)?.[id]?.name;
    if (!name) {
        ctx.dangling.push({ from: fromKey, target: id, what: kind });
        return;
    }
    const key = nodeKey(kind, id);
    ensureNode(ctx, kind, id, name);
    addEdge(ctx, fromKey, key, edgeKind, conditional, label, origin);
    walkHub(ctx, kind, id);
}

/** Walk a hub's body ONCE. Its outgoing edges leave from the hub's own node. */
function walkHub(ctx: Ctx, kind: FlowNodeKind, id: VNID): void {
    const key = nodeKey(kind, id);
    if (ctx.hubsWalked.has(key)) return;   // already done, or in progress → cycle-safe
    ctx.hubsWalked.add(key);
    const p = ctx.project;

    if (kind === 'commonEvent') {
        const ce = (p.commonEvents as any)?.[id];
        if (ce?.commands) walkCommands(ctx, ce.commands as VNCommand[], key, false);
        return;
    }
    if (kind === 'screen') {
        const screen = (p.uiScreens as any)?.[id];
        if (screen) collectScreenActions(screen).forEach(({ actions, label, conditional }) =>
            walkActions(ctx, actions, key, false, 0, conditional, label, 0));
        return;
    }
    if (kind === 'map') {
        const map = (p.maps as any)?.[id];
        for (const loc of (map?.locations ?? [])) {
            const cond = !!loc?.conditions?.length;
            const label = loc?.label || loc?.name || '';
            // Legacy single-target (migrated into `actions`, but the runtime still honours it).
            if (loc?.targetSceneId) linkScene(ctx, key, loc.targetSceneId, 'outcome', cond, label);
            walkActions(ctx, (loc?.actions ?? []) as VNUIAction[], key, false, 0, cond, label, 0);
        }
        return;
    }
    if (kind === 'miniGame') {
        const g = (p.miniGames as any)?.[id];
        if (!g) return;
        walkActions(ctx, (g.winActions ?? []) as VNUIAction[], key, false, 0, true, 'Win', 0);
        walkActions(ctx, (g.failActions ?? []) as VNUIAction[], key, false, 0, true, 'Lose', 0);
        walkActions(ctx, (g.skipActions ?? []) as VNUIAction[], key, false, 0, true, 'Skip', 0);
        for (const tier of (g.score?.tiers ?? [])) {
            walkActions(ctx, (tier?.actions ?? []) as VNUIAction[], key, false, 0, true, tier?.name || '', 0);
        }
    }
}

function linkScene(ctx: Ctx, fromKey: string, sceneId: VNID, kind: FlowEdgeKind, conditional: boolean, label: string, origin?: FlowEdge['origin']) {
    if (!ctx.project.scenes[sceneId]) {
        ctx.dangling.push({ from: fromKey, target: sceneId, what: 'scene' });
        return;
    }
    addEdge(ctx, fromKey, nodeKey('scene', sceneId), kind, conditional, label, origin);
}

// ── screens: every element type can carry actions, not just buttons ──────────

interface ActionBundle { actions: VNUIAction[]; label: string; conditional: boolean }

/** Collect every action attached anywhere on a screen. Exported for direct unit-testing. */
export function collectScreenActions(screen: any): ActionBundle[] {
    const out: ActionBundle[] = [];
    const push = (actions: any, label = '', conditional = false) => {
        if (Array.isArray(actions) && actions.length) out.push({ actions, label, conditional });
    };
    for (const el of Object.values<any>(screen?.elements ?? {})) {
        const label = el?.text || el?.name || '';
        const cond = !!el?.conditions?.length;
        if (el?.action) push([el.action], label, cond);       // UIButtonElement.action (singular)
        push(el?.actions, label, cond);                        // BaseUIElement.actions — EVERY element type
        push(el?.slotButtonActions, label, cond);              // inventory slot buttons
        for (const r of (el?.draggableImageElementRegions ?? [])) push(r?.actions, r?.name || label, cond || !!r?.conditions?.length);
    }
    push(screen?.onCloseActions, 'On close');
    push(screen?.winCondition?.actions, 'On win');
    for (const hs of (screen?._legacyHotZone?.hotSpots ?? [])) push(hs?.actions, hs?.name || '');
    for (const he of (screen?._legacyHotZone?.hotZoneElements ?? [])) push(he?.actions, he?.name || '');
    return out;
}

// ── the action walker ────────────────────────────────────────────────────────

function walkActions(ctx: Ctx, actions: VNUIAction[] | undefined, ownerKey: string, isSceneOwner: boolean,
                     branchDepth: number, baseConditional: boolean, label: string, depth: number): void {
    if (!Array.isArray(actions) || depth > MAX_DEPTH) return;
    const p = ctx.project;
    for (const a of actions) {
        if (!a) continue;
        const cond = baseConditional || branchDepth > 0 || !!(a as any).conditions?.length;
        const act = a as any;
        switch (a.type) {
            case UIActionType.JumpToScene:
                linkScene(ctx, ownerKey, act.targetSceneId, 'jump', cond, label);
                if (isSceneOwner && branchDepth === 0 && !baseConditional) ctx.terminates = true;
                break;
            // NOTE: JumpToLabel as an ACTION is CURRENT-SCENE ONLY (unlike the command) → no edge.
            case UIActionType.JumpToLabel:
                break;
            case UIActionType.CallCommonEvent:
                linkHub(ctx, ownerKey, 'commonEvent', act.commonEventId, 'call', cond, label);
                break;
            case UIActionType.GoToScreen:
            case UIActionType.ToggleScreen:
                linkHub(ctx, ownerKey, 'screen', act.targetScreenId, 'opens', cond, label);
                break;
            case UIActionType.ShowMap:
                linkHub(ctx, ownerKey, 'map', act.mapId, 'opens', cond, label);
                break;
            case UIActionType.ShowMiniGame:
                linkHub(ctx, ownerKey, 'miniGame', act.gameId, 'opens', cond, label);
                break;
            case UIActionType.StartNewGame:
                linkScene(ctx, ownerKey, p.startSceneId, 'jump', cond, label);
                break;
            case UIActionType.QuitToTitle:
                markTerminal(ctx, ownerKey, 'title', isSceneOwner, branchDepth);
                break;
            case UIActionType.ExitGame:
                markTerminal(ctx, ownerKey, 'exit', isSceneOwner, branchDepth);
                break;
            case UIActionType.LoadGame:
            case UIActionType.ContinueGame: {
                // Target depends on the save file — unknowable without running the game.
                const n = ctx.nodes.get(ownerKey);
                if (n) n.hasDynamicExit = true;
                ctx.dynamic = true;
                break;
            }
            case UIActionType.StartTimer:
                walkActions(ctx, act.onComplete, ownerKey, isSceneOwner, branchDepth, cond, label, depth + 1);
                break;
            case UIActionType.UseItem:
            case UIActionType.CarryItem: {
                const item = (p.items as any)?.[act.itemId];
                if (item) {
                    walkActions(ctx, item.useEffect, ownerKey, isSceneOwner, branchDepth, true, item.name || label, depth + 1);
                    walkActions(ctx, item.slotButtonActions, ownerKey, isSceneOwner, branchDepth, true, item.name || label, depth + 1);
                }
                break;
            }
            case UIActionType.UseSelectedItem: {
                // No item id — whichever item the player has selected. Every usable item is a candidate.
                for (const item of Object.values<any>(p.items ?? {})) {
                    walkActions(ctx, item?.useEffect, ownerKey, isSceneOwner, branchDepth, true, item?.name || '', depth + 1);
                }
                break;
            }
            default:
                break;
        }
    }
}

// ── the command walker ───────────────────────────────────────────────────────

function walkCommands(ctx: Ctx, cmds: VNCommand[], ownerKey: string, isSceneOwner: boolean): void {
    if (!Array.isArray(cmds)) return;
    // Branch markers are FLAT, delimited by matching branchId. Anything emitted while the stack is
    // non-empty is conditional (it may not run).
    const branchStack: VNID[] = [];
    for (let i = 0; i < cmds.length; i++) {
        const cmd: any = cmds[i];
        if (!cmd) continue;
        if (cmd.type === CommandType.BranchStart) { branchStack.push(cmd.branchId); continue; }
        if (cmd.type === CommandType.BranchElseIf || cmd.type === CommandType.BranchElse) continue;
        if (cmd.type === CommandType.BranchEnd) {
            // Pop until we remove the matching id (tolerates malformed data; never loops forever).
            const idx = branchStack.lastIndexOf(cmd.branchId);
            if (idx >= 0) branchStack.length = idx; else branchStack.pop();
            continue;
        }
        const depth = branchStack.length;
        const cmdCond = depth > 0 || !!cmd.conditions?.length;
        const origin = isSceneOwner ? { sceneId: ownerKey.slice(6), commandIndex: i } : undefined;
        visitCommand(ctx, cmd, ownerKey, isSceneOwner, depth, cmdCond, origin);
    }
}

function visitCommand(ctx: Ctx, cmd: any, ownerKey: string, isSceneOwner: boolean, depth: number, cond: boolean, origin?: FlowEdge['origin']): void {
    const p = ctx.project;
    switch (cmd.type) {
        case CommandType.Jump:
            linkScene(ctx, ownerKey, cmd.targetSceneId, 'jump', cond, '', origin);
            if (isSceneOwner && depth === 0 && !cmd.conditions?.length) ctx.terminates = true;
            break;

        case CommandType.JumpToLabel: {
            // COMMAND form is CROSS-SCENE: current scene first, else the first other scene that
            // defines the label. (The ACTION form is current-scene only — see walkActions.)
            const owners = ctx.labelIndex.get(cmd.labelId);
            if (!owners || !owners.length) {
                ctx.dangling.push({ from: ownerKey, target: cmd.labelId, what: 'label' });
                break;
            }
            const here = isSceneOwner ? ownerKey.slice(6) : null;
            if (here && owners.includes(here)) break;   // resolves in-scene → a goto/loop, not an edge
            const target = owners[0];
            linkScene(ctx, ownerKey, target, 'label', cond, cmd.labelId, origin);
            if (isSceneOwner && depth === 0 && !cmd.conditions?.length) ctx.terminates = true;
            break;
        }

        case CommandType.CallCommonEvent:
            linkHub(ctx, ownerKey, 'commonEvent', cmd.commonEventId, 'call', cond, '', origin);
            break;

        case CommandType.Choice: {
            for (const opt of (cmd.options ?? [])) {
                const oCond = cond || !!opt?.conditions?.length;
                const label = opt?.text || '';
                if (opt?.targetSceneId) linkScene(ctx, ownerKey, opt.targetSceneId, 'choice', oCond, label, origin);
                walkActions(ctx, opt?.actions, ownerKey, isSceneOwner, depth, oCond, label, 0);
            }
            walkActions(ctx, cmd.timeoutActions, ownerKey, isSceneOwner, depth, true, 'Time runs out', 0);
            break;
        }

        case CommandType.ShowButton:
            if (cmd.onClick) walkActions(ctx, [cmd.onClick], ownerKey, isSceneOwner, depth, cond, cmd.text || '', 0);
            walkActions(ctx, cmd.actions, ownerKey, isSceneOwner, depth, cond, cmd.text || '', 0);
            break;

        case CommandType.ShowItem:
        case CommandType.ShowHotSpot:
            walkActions(ctx, cmd.actions, ownerKey, isSceneOwner, depth, cond, cmd.name || '', 0);
            break;

        case CommandType.StartTimer:
            walkActions(ctx, cmd.onComplete, ownerKey, isSceneOwner, depth, cond, '', 0);
            break;

        case CommandType.ShowScreen:
            linkHub(ctx, ownerKey, 'screen', cmd.screenId, 'opens', cond, '', origin);
            break;

        case CommandType.ShowMap:
            linkHub(ctx, ownerKey, 'map', cmd.mapId, 'opens', cond, '', origin);
            break;

        case CommandType.ShowMiniGame:
            linkHub(ctx, ownerKey, 'miniGame', cmd.gameId, 'opens', cond, '', origin);
            break;

        case CommandType.CreditRoll:
            if (cmd.onComplete === 'title') markTerminal(ctx, ownerKey, 'credits', isSceneOwner, depth);
            break;

        case CommandType.RunScript: {
            // A script may call game.jumpToScene(<runtime string>) — not knowable statically.
            const n = ctx.nodes.get(ownerKey);
            if (n) n.hasDynamicExit = true;
            ctx.dynamic = true;
            break;
        }

        // Phone: every reply / outcome list can carry actions.
        case CommandType.PhoneIncomingText:
            for (const r of (cmd.replies ?? [])) walkActions(ctx, r?.actions, ownerKey, isSceneOwner, depth, true, r?.text || '', 0);
            break;
        case CommandType.PhoneIncomingCall:
            walkActions(ctx, cmd.acceptActions, ownerKey, isSceneOwner, depth, true, 'Answer', 0);
            walkActions(ctx, cmd.declineActions, ownerKey, isSceneOwner, depth, true, 'Decline', 0);
            walkActions(ctx, cmd.timeoutActions, ownerKey, isSceneOwner, depth, true, 'Missed', 0);
            walkConversation(ctx, cmd.conversation, ownerKey, isSceneOwner, depth);
            break;
        case CommandType.StartPhoneCall:
            walkConversation(ctx, cmd.conversation, ownerKey, isSceneOwner, depth);
            break;
        case CommandType.PhoneNotify:
            walkActions(ctx, cmd.tapActions, ownerKey, isSceneOwner, depth, true, '', 0);
            break;
        case CommandType.ShowPhoneText:
            for (const opt of (cmd.choices ?? [])) {
                walkActions(ctx, opt?.actions, ownerKey, isSceneOwner, depth, cond || !!opt?.conditions?.length, opt?.text || '', 0);
            }
            break;

        default:
            break;
    }
}

function walkConversation(ctx: Ctx, convo: any, ownerKey: string, isSceneOwner: boolean, depth: number) {
    if (!convo) return;
    for (const line of (convo.lines ?? [])) {
        for (const r of (line?.replies ?? [])) walkActions(ctx, r?.actions, ownerKey, isSceneOwner, depth, true, r?.text || '', 0);
    }
    walkActions(ctx, convo.endActions, ownerKey, isSceneOwner, depth, true, 'Call ends', 0);
}

// ── entry point ──────────────────────────────────────────────────────────────

export function buildStoryGraph(project: VNProject, opts?: { includeFallthrough?: boolean }): StoryGraph {
    const includeFallthrough = opts?.includeFallthrough !== false;
    const ctx: Ctx = {
        project,
        nodes: new Map(), edges: new Map(), hubsWalked: new Set(),
        labelIndex: new Map(), dangling: [], terminates: false, dynamic: false,
    };

    const sceneIds = Object.keys(project.scenes ?? {});

    // Label index (record order) — a JumpToLabel command resolves to the FIRST scene defining it.
    for (const sid of sceneIds) {
        for (const c of (project.scenes[sid]?.commands ?? [])) {
            if ((c as any)?.type === CommandType.Label && (c as any).labelId) {
                const arr = ctx.labelIndex.get((c as any).labelId) ?? [];
                arr.push(sid);
                ctx.labelIndex.set((c as any).labelId, arr);
            }
        }
    }

    // Every scene is a node (we need them all for orphan detection).
    for (const sid of sceneIds) {
        const s = project.scenes[sid];
        ensureNode(ctx, 'scene', sid, s?.name || sid, `${(s?.commands ?? []).length} steps`);
    }

    // Common events that run automatically are nodes up-front: they run in EVERY scene, so their
    // edges leave from THEIR node (never fanned out of every scene — that would be 200 arrows).
    for (const ce of Object.values<any>(project.commonEvents ?? {})) {
        if (!ce?.enabled) continue;
        if (ce.trigger === 'auto' || ce.trigger === 'parallel') {
            const n = ensureNode(ctx, 'commonEvent', ce.id, ce.name || ce.id);
            if (n) { n.alwaysRuns = true; n.isEntry = true; }
            walkHub(ctx, 'commonEvent', ce.id);
        }
    }

    // Walk each scene.
    for (let i = 0; i < sceneIds.length; i++) {
        const sid = sceneIds[i];
        const scene = project.scenes[sid];
        const key = nodeKey('scene', sid);
        ctx.terminates = false;

        walkCommands(ctx, scene?.commands ?? [], key, true);

        // The scene's own conditions failing sends the player here.
        if (scene?.fallbackSceneId) linkScene(ctx, key, scene.fallbackSceneId, 'fallback', true, '');

        // ── THE IMPLICIT EDGE (see file header) ──
        if (includeFallthrough && !ctx.terminates) {
            const next = sceneIds[i + 1];
            const node = ctx.nodes.get(key)!;
            if (next) {
                node.fallsThroughTo = next;
                addEdge(ctx, key, nodeKey('scene', next), 'fallthrough', false, '');
            } else {
                if (!node.terminals.includes('endOfList')) node.terminals.push('endOfList');
            }
        }
    }

    // The title screen is a genuine entry surface: a JumpToScene on it starts the game there.
    const titleId = (project.ui as any)?.titleScreenId;
    if (titleId && (project.uiScreens as any)?.[titleId]) {
        const tKey = nodeKey('screen', titleId);
        ensureNode(ctx, 'screen', titleId, (project.uiScreens as any)[titleId].name || 'Title');
        const t = ctx.nodes.get(tKey); if (t) t.isEntry = true;
        walkHub(ctx, 'screen', titleId);
    }

    // ── entry points ──
    const entryPoints: string[] = [];
    const startKey = project.startSceneId ? nodeKey('scene', project.startSceneId) : '';
    if (startKey && ctx.nodes.has(startKey)) {
        ctx.nodes.get(startKey)!.isStart = true;
        ctx.nodes.get(startKey)!.isEntry = true;
        entryPoints.push(startKey);
    }
    for (const n of ctx.nodes.values()) if (n.isEntry && !entryPoints.includes(n.key)) entryPoints.push(n.key);

    const nodes = Array.from(ctx.nodes.values());
    const edges = Array.from(ctx.edges.values());

    // ── reachability (BFS over ALL edges, fall-through included — that's the point) ──
    const adj = new Map<string, string[]>();
    for (const e of edges) {
        const a = adj.get(e.from) ?? []; a.push(e.to); adj.set(e.from, a);
    }
    const reached = new Set<string>(entryPoints);
    const queue = [...entryPoints];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const to of (adj.get(cur) ?? [])) {
            if (!reached.has(to)) { reached.add(to); queue.push(to); }
        }
    }

    const outCount = new Map<string, number>();
    for (const e of edges) outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);

    for (const n of nodes) {
        const outs = outCount.get(n.key) ?? 0;
        n.isUnreachable = !reached.has(n.key);
        n.isTerminalOnly = n.terminals.length > 0 && outs === 0;
        n.isDeadEnd = outs === 0 && n.terminals.length === 0 && !n.hasDynamicExit;
    }

    const diagnostics: FlowDiagnostics = {
        unreachable: nodes.filter(n => n.isUnreachable).map(n => n.key),
        deadEnds: nodes.filter(n => n.isDeadEnd).map(n => n.key),
        endings: nodes.filter(n => n.isTerminalOnly).map(n => n.key),
        danglingTargets: ctx.dangling,
        hasDynamicRoutes: ctx.dynamic,
    };

    return { nodes, edges, entryPoints, diagnostics };
}
