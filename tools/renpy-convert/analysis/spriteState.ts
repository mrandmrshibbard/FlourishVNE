/**
 * What is each portrait wearing at every `show`?
 *
 * Ren'Py keeps sprite pieces in a PERSISTENT dict: `ChangePortrait` mutates
 * `characterSprites[name].spriteParts`, and a later `show <tag>` displays whatever that dict holds
 * at that moment. Nothing about the visual state lives on the `show` statement itself. The old
 * converter ignored this entirely - it emitted a bare `SetCharacterLayer` per call (355 of which
 * fired while the character was off-stage and did nothing) and then let every `ShowCharacter`
 * reset the look to an arbitrary "first asset per layer".
 *
 * So we reconstruct the dict with a forward dataflow over the control-flow graph, on the standard
 * three-point lattice:
 *
 *     bottom  - never assigned on any path reaching here
 *     const   - definitely this value on every path
 *     top     - assigned different values on different paths
 *
 * A `show` then emits `layerOverrides` for `const` slots only. `top` slots are OMITTED so the
 * engine's resolver falls through to the character's existing selections, which is exactly what
 * Ren'Py's persistent dict does. Guessing a value for a `top` slot would put clothing on a
 * character the original never shows.
 *
 * CONTENT RULE: this module handles slot names and asset values, never dialogue.
 */
import type { Node, Pos } from '../ir/nodes';
import { matchChangePortrait } from '../parse/changePortrait';

/**
 * The colour grade is stored in `spriteParts` under the key `matrix` and read back by
 * `GetRender`, so it PERSISTS across calls exactly like an art slot. Tracking it as a pseudo-slot
 * means the same lattice answers "which grade is active at this show?" - and the prologue's ten
 * identity matrices correctly read as resets rather than as nothing at all.
 */
export const MATRIX_SLOT = '__matrix';

export type SlotValue =
    | { kind: 'bottom' }
    | { kind: 'const'; value: string }
    | { kind: 'top' };

export const BOTTOM: SlotValue = { kind: 'bottom' };
export const TOP: SlotValue = { kind: 'top' };

/** portrait -> slot -> value */
export type SpriteState = Map<string, Map<string, SlotValue>>;

export function joinValue(a: SlotValue, b: SlotValue): SlotValue {
    if (a.kind === 'bottom') return b;
    if (b.kind === 'bottom') return a;
    if (a.kind === 'top' || b.kind === 'top') return TOP;
    return a.value === b.value ? a : TOP;
}

export function cloneState(s: SpriteState): SpriteState {
    const out: SpriteState = new Map();
    for (const [p, slots] of s) out.set(p, new Map(slots));
    return out;
}

export function joinStates(states: SpriteState[]): SpriteState {
    const out: SpriteState = new Map();
    const portraits = new Set<string>();
    for (const s of states) for (const p of s.keys()) portraits.add(p);
    for (const p of portraits) {
        const slots = new Set<string>();
        for (const s of states) for (const k of s.get(p)?.keys() ?? []) slots.add(k);
        const merged = new Map<string, SlotValue>();
        for (const slot of slots) {
            let acc: SlotValue = BOTTOM;
            for (const s of states) acc = joinValue(acc, s.get(p)?.get(slot) ?? BOTTOM);
            merged.set(slot, acc);
        }
        out.set(p, merged);
    }
    return out;
}

export function statesEqual(a: SpriteState, b: SpriteState): boolean {
    if (a.size !== b.size) return false;
    for (const [p, slots] of a) {
        const other = b.get(p);
        if (!other || other.size !== slots.size) return false;
        for (const [slot, v] of slots) {
            const o = other.get(slot);
            if (!o || o.kind !== v.kind) return false;
            if (v.kind === 'const' && o.kind === 'const' && v.value !== o.value) return false;
        }
    }
    return true;
}

/** One `show` statement together with the sprite state that reaches it. */
export interface ShowSnapshot {
    pos: Pos;
    /** The image tag as written, e.g. `cove_8`. */
    tag: string;
    /** Slots with a definite value at this point. */
    determinate: Record<string, string>;
    /** Slots that differ across incoming paths - deliberately left to the engine to preserve. */
    indeterminate: string[];
    /** True when the same tag was hidden earlier with no full re-dress in between. */
    afterHide: boolean;
    /** The `im.matrix` expression active here, if any - it persists until replaced. */
    matrix: string | null;
}

/**
 * A `ChangePortrait` that happens while the sprite is ALREADY on screen.
 *
 * `ChangePortrait` ends with `renpy.redraw`, so the visual updates live - no `show` needed. With
 * 333 calls against only 29 shows, the overwhelming majority of the prologue's expression changes
 * are these, and they must become real layer-change commands. Calls made while the tag is off
 * stage only seed the dict for the next `show` and must NOT emit a command; the old converter
 * emitted one for every call, and 355 of them fired off-stage as silent no-ops.
 */
export interface LiveChange {
    pos: Pos;
    portrait: string;
    /** The image tag that is currently on stage for this portrait. */
    tag: string;
    /** Slot -> value for this call only (not the accumulated state). */
    slots: Record<string, string>;
    /**
     * The FULL determinate piece set on screen after this call. Needed because a grade applies to
     * the whole portrait at render time, so scoping a bake from the changed slots alone would miss
     * every piece that was already up when the grade changed.
     */
    determinate: Record<string, string>;
    /** The grade active after this call. */
    matrix: string | null;
}

export interface AnalysisResult {
    shows: ShowSnapshot[];
    /** Calls that change a sprite already on screen - these need commands. */
    liveChanges: LiveChange[];
    /** Calls made while the sprite is off stage - state only, no command. */
    offStageCalls: number;
    /** Shows that follow a hide but cannot be fully reconstructed - these are blockers. */
    blockers: { pos: Pos; tag: string; missing: string[] }[];
    /** Labels the walk never reached from the entry label. */
    unreachableLabels: string[];
}

/** `chara` in ChangePortrait is the Portrait NAME; `show <tag>` names the image TAG. */
export interface TagMap {
    /** image tag (lowercase, as written in `show`) -> Portrait name used by ChangePortrait. */
    tagToPortrait: Map<string, string>;
}

type Flow =
    | { kind: 'fall'; state: SpriteState }   // control continues after this block
    | { kind: 'end' };                        // jump/return - nothing falls through

export function analyse(labels: { name: string; body: Node[] }[], tags: TagMap): AnalysisResult {
    const byName = new Map(labels.map(l => [l.name, l]));
    const entry: Map<string, SpriteState> = new Map();
    if (labels.length) entry.set(labels[0].name, new Map());

    // Pass 1: iterate label entry states to a fixpoint. Shows are ignored here because early
    // iterations see partial state; only the settled states are meaningful.
    let changed = true;
    let guard = 0;
    while (changed) {
        changed = false;
        if (++guard > 1000) throw new Error('spriteState: entry states failed to converge');
        for (const [idx, label] of labels.entries()) {
            const start = entry.get(label.name);
            if (!start) continue;                       // not reached yet
            const seen = new Map<string, SpriteState>();
            const flow = walk(label.body, cloneState(start), null, seen, tags, byName);
            // Ren'Py FALLS THROUGH from one label into the next when the body does not end in a
            // jump or return. Ignoring that would leave the next label looking unreachable and
            // its shows analysed from an empty state.
            const next = labels[idx + 1];
            if (flow.kind === 'fall' && next) {
                const prior = seen.get(next.name);
                seen.set(next.name, prior ? joinStates([prior, flow.state]) : flow.state);
            }
            for (const [target, st] of seen) {
                const prior = entry.get(target);
                const merged = prior ? joinStates([prior, st]) : st;
                if (!prior || !statesEqual(prior, merged)) { entry.set(target, merged); changed = true; }
            }
        }
    }

    // Pass 2: collect shows and live changes against the settled entry states.
    const shows: ShowSnapshot[] = [];
    const liveChanges: LiveChange[] = [];
    const counters = { offStage: 0 };
    for (const label of labels) {
        const start = entry.get(label.name);
        if (!start) continue;
        walk(label.body, cloneState(start), shows, new Map(), tags, byName, new Set(), liveChanges, counters);
    }

    const blockers = shows
        .filter(s => s.afterHide && s.indeterminate.length > 0)
        .map(s => ({ pos: s.pos, tag: s.tag, missing: s.indeterminate }));

    // A label with no entry state is dead code: nothing jumps to it and nothing falls into it.
    const unreachableLabels = labels.filter(l => !entry.has(l.name)).map(l => l.name);
    return { shows, liveChanges, offStageCalls: counters.offStage, blockers, unreachableLabels };
}

/**
 * Walk a statement list.
 * `shows` collects snapshots when non-null; `jumps` accumulates the state flowing into each label.
 */
function walk(
    nodes: Node[],
    state: SpriteState,
    shows: ShowSnapshot[] | null,
    jumps: Map<string, SpriteState>,
    tags: TagMap,
    byName: Map<string, { name: string; body: Node[] }>,
    onStageIn: Set<string> = new Set(),
    liveChanges: LiveChange[] | null = null,
    counters: { offStage: number } = { offStage: 0 },
): Flow {
    // Tags hidden on this path and not yet fully re-dressed.
    const hidden = new Set<string>();
    // Tags currently on screen. Only a call made while the tag is here needs a command.
    const onStage = new Set(onStageIn);
    const tagFor = (portrait: string): string | undefined => {
        for (const tag of onStage) if (tags.tagToPortrait.get(tag.toLowerCase()) === portrait) return tag;
        return undefined;
    };

    const noteJump = (target: string, st: SpriteState) => {
        const prior = jumps.get(target);
        jumps.set(target, prior ? joinStates([prior, st]) : cloneState(st));
    };

    for (const node of nodes) {
        switch (node.kind) {
            case 'python': {
                const call = matchChangePortrait(node.code, node.pos.line);
                if (!call) break;
                const slots = state.get(call.chara) ?? new Map<string, SlotValue>();
                for (const [slot, value] of Object.entries(call.slots)) {
                    slots.set(slot, { kind: 'const', value });
                }
                if (call.matrix !== undefined) slots.set(MATRIX_SLOT, { kind: 'const', value: call.matrix });
                // A kwarg whose value is an expression is knowable only at runtime.
                for (const slot of Object.keys(call.dynamic)) slots.set(slot, TOP);
                state.set(call.chara, slots);
                const liveTag = tagFor(call.chara);
                if (liveTag) {
                    const active = slots.get(MATRIX_SLOT);
                    const determinate: Record<string, string> = {};
                    for (const [slot, v] of slots) {
                        if (slot !== MATRIX_SLOT && v.kind === 'const') determinate[slot] = v.value;
                    }
                    liveChanges?.push({
                        pos: node.pos, portrait: call.chara, tag: liveTag, slots: { ...call.slots },
                        determinate,
                        matrix: active && active.kind === 'const' ? active.value : null,
                    });
                } else {
                    counters.offStage++;
                }
                break;
            }

            case 'show': {
                const tag = node.image[0];
                if (!tag) break;
                const portrait = tags.tagToPortrait.get(tag.toLowerCase());
                if (!portrait) break;                    // not a character sprite
                const slots = state.get(portrait) ?? new Map<string, SlotValue>();
                const determinate: Record<string, string> = {};
                const indeterminate: string[] = [];
                for (const [slot, v] of slots) {
                    if (slot === MATRIX_SLOT) continue;             // reported separately
                    if (v.kind === 'const') determinate[slot] = v.value;
                    else if (v.kind === 'top') indeterminate.push(slot);
                }
                const mv = slots.get(MATRIX_SLOT);
                shows?.push({
                    pos: node.pos, tag, determinate,
                    indeterminate: indeterminate.sort(),
                    afterHide: hidden.has(tag),
                    matrix: mv && mv.kind === 'const' ? mv.value : null,
                });
                hidden.delete(tag);
                onStage.add(tag);
                break;
            }

            case 'hide': {
                const tag = node.image[0];
                // Ren'Py's hide removes the sprite but NOT its spriteParts, so state is untouched.
                // Flourish drops the character from the stage, so the next show has to carry a
                // complete snapshot - tracked here rather than assumed.
                if (tag) { hidden.add(tag); onStage.delete(tag); }
                break;
            }

            case 'jump':
                noteJump(node.target, state);
                return { kind: 'end' };

            case 'return':
                return { kind: 'end' };

            case 'if': {
                const outs: SpriteState[] = [];
                let hasElse = false;
                for (const clause of node.clauses) {
                    if (clause.condition === null) hasElse = true;
                    const f = walk(clause.body, cloneState(state), shows, jumps, tags, byName, onStage, liveChanges, counters);
                    if (f.kind === 'fall') outs.push(f.state);
                }
                // With no `else`, the "all conditions false" path skips the whole statement.
                if (!hasElse) outs.push(cloneState(state));
                if (!outs.length) return { kind: 'end' };
                const merged = joinStates(outs);
                state.clear();
                for (const [p, s] of merged) state.set(p, s);
                break;
            }

            case 'menu': {
                const outs: SpriteState[] = [];
                for (const opt of node.options) {
                    const f = walk(opt.body, cloneState(state), shows, jumps, tags, byName, onStage, liveChanges, counters);
                    if (f.kind === 'fall') outs.push(f.state);
                }
                // Exactly one option always runs, so there is no skip path to merge in.
                if (!outs.length) return { kind: 'end' };
                const merged = joinStates(outs);
                state.clear();
                for (const [p, s] of merged) state.set(p, s);
                break;
            }

            case 'label': {
                // A nested label is a jump target as well as a fall-through point.
                noteJump(node.name, state);
                const f = walk(node.body, cloneState(state), shows, jumps, tags, byName, onStage, liveChanges, counters);
                if (f.kind === 'end') return f;
                state.clear();
                for (const [p, s] of f.state) state.set(p, s);
                break;
            }

            default:
                break;
        }
    }
    return { kind: 'fall', state };
}
