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
}
