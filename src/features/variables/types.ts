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
}
