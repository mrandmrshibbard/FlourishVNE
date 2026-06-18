import { VNID } from '../../types';
import { UIAsset } from '../ui/types';

/**
 * A first-class gameplay stat (affection, health, XP, reputation…).
 *
 * Like items, a stat is deliberately *sugar over native primitives*: each stat
 * materializes one `number` variable per target — a single variable for a
 * global stat, or one per chosen character ("Alice — Affection") — so all
 * existing tooling (conditions, SetVariable actions, `{name}` interpolation,
 * the Meter element) works on it unchanged, and a user could rebuild the same
 * thing by hand. The registry just stores the metadata (range, default, color)
 * and keeps the backing variables in sync.
 */
export interface VNStat {
    id: VNID;
    name: string;
    description?: string;
    /** Optional icon shown beside the stat in editors/screens. References a project image/video asset. */
    icon?: UIAsset | null;
    /** Lower bound for every backing variable (e.g. 0). */
    min: number;
    /** Upper bound for every backing variable (e.g. 100). */
    max: number;
    /** Starting value for every backing variable. */
    defaultValue: number;
    /** Suggested fill color for meters bound to this stat. */
    color?: string;
    /** Whether this is a single global value or tracked per character. */
    appliesTo: 'global' | 'characters';
    /** When appliesTo is 'characters': which characters have this stat. */
    characterIds?: VNID[];
    /** Backlinks to the auto-managed backing variables: 'global' or a characterId → variableId. */
    variableIds: Record<VNID | 'global', VNID>;
    /** Sort order within the registry. */
    order?: number;
}
