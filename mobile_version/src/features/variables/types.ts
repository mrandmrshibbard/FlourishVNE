import { VNID } from '../../types';

export type VNVariableType = 'string' | 'number' | 'boolean';
export type VNSetVariableOperator = 'set' | 'add' | 'subtract' | 'random';

/**
 * Variable scope determines lifetime and persistence behaviour.
 * - **local**: Scene-scoped – reset when the scene changes.
 * - **global**: Playthrough-scoped – persists across scenes within a single playthrough but resets on new game.
 * - **persistent**: Cross-session – saved to long-term storage and survives between play sessions (e.g. CG Gallery unlocks).
 */
export type VNVariableScope = 'local' | 'global' | 'persistent';

/**
 * A named range of a NUMBER variable — "0–20 is Stranger, 21–50 is Friend".
 *
 * This is boolean labels, but for numbers: the author names the numbers once, and every surface
 * (conditions, {text}, the live tracker, meters) can speak in words instead of arithmetic. A band
 * owns everything from its `min` up to (but not including) the next band's `min`.
 */
export interface VNVariableBand {
    id: VNID;
    /** What the author calls this range, e.g. "Friend". Story content — never translated. */
    name: string;
    /** Inclusive lower bound. Bands are always sorted by this. */
    min: number;
    /** Optional colour, so a meter can warm up as it fills. A CSS var or hex. */
    color?: string;
    /** Optional emoji shown beside the name. */
    icon?: string;
}

/** How a banded number variable presents itself to the PLAYER in {text} and to the author in trackers. */
export type VNVariableShowAs = 'number' | 'band' | 'both';

export interface VNVariable {
    id: VNID;
    name: string;
    type: VNVariableType;
    defaultValue: string | number | boolean;
    /** Lifetime scope – defaults to 'global' for backwards compatibility */
    scope?: VNVariableScope;
    /** Optional inclusive lower bound for NUMBER variables. When set, every write is clamped so the
     *  value never goes below this (e.g. set to 0 to stop affection going negative). Additive-optional. */
    min?: number;
    /** Optional inclusive upper bound for NUMBER variables. When set, every write is clamped to this max. */
    max?: number;
    /** Optional custom display label for the `true` value of a BOOLEAN variable (e.g. "Locked", "On").
     *  Unset → the global default ("Yes"). Pure display; the stored value stays a real boolean.
     *  Additive-optional, so old/new projects round-trip. */
    trueLabel?: string;
    /** Optional custom display label for the `false` value of a BOOLEAN variable (e.g. "Unlocked", "Off").
     *  Unset → the global default ("No"). */
    falseLabel?: string;
    /** When true, this variable is auto-generated/managed by a system (e.g. an item-collection's per-list
     *  stock count) and is hidden from the Variables manager to keep that list calm. It still works
     *  everywhere by id (conditions, {name} interpolation, SetVariable). Additive-optional. */
    isInternal?: boolean;

    // ── Meaning (all additive-optional; an old project simply has none of it) ─────────────────────
    /** Emoji shown wherever this variable appears, so it's recognised by shape, not by reading. */
    icon?: string;
    /** Colour chip, likewise. A CSS var or hex. */
    color?: string;
    /** Plain-language "what this means in your story" — the thing a name alone can never carry. */
    description?: string;
    /** NUMBER only. Named ranges, sorted ascending by `min`. See VNVariableBand. */
    bands?: VNVariableBand[];
    /** NUMBER + bands only. How the value reads in {text} and trackers. Unset → 'number' (unchanged). */
    showAs?: VNVariableShowAs;
}
