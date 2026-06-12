import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNVariable } from '../../variables/types';
import { UIAsset } from '../../ui/types';
import { VNStat } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 9);

export interface AddStatPayload {
    id?: VNID;
    name: string;
    description?: string;
    icon?: UIAsset | null;
    min?: number;          // default 0
    max?: number;          // default 100
    defaultValue?: number; // default min
    color?: string;
    appliesTo?: 'global' | 'characters'; // default 'global'
    characterIds?: VNID[];
    order?: number;
}

export type StatAction =
    | { type: 'ADD_STAT'; payload: AddStatPayload }
    | { type: 'UPDATE_STAT'; payload: { statId: VNID; updates: Partial<VNStat> } }
    | { type: 'DELETE_STAT'; payload: { statId: VNID; deleteVariables?: boolean } }
    | { type: 'SET_STAT_CHARACTERS'; payload: { statId: VNID; characterIds: VNID[] } };

/** The display name for a stat's backing variable: "Alice — Affection" or just "Affection" (global). */
export const statVarName = (statName: string, characterName?: string): string =>
    characterName ? `${characterName} — ${statName}` : statName;

// Builds the auto-managed number variable that backs one (stat, target) pair. Public
// (NOT isInternal) — like item count variables, these are the user-facing product:
// they appear in condition/action pickers and work with {name} interpolation.
const makeStatVar = (id: VNID, name: string, stat: Pick<VNStat, 'min' | 'max' | 'defaultValue'>): VNVariable => ({
    id,
    name,
    type: 'number',
    defaultValue: stat.defaultValue,
    scope: 'global',
    min: stat.min,
    max: stat.max,
});

export const statReducer = (state: VNProject, action: StatAction): VNProject => {
    switch (action.type) {
        case 'ADD_STAT': {
            const p = action.payload;
            const statId = p.id || `stat-${generateId()}`;
            const stats = state.stats || {};
            const min = p.min ?? 0;
            const max = p.max ?? 100;
            const defaultValue = p.defaultValue ?? min;
            const appliesTo = p.appliesTo || 'global';
            const characterIds = appliesTo === 'characters' ? (p.characterIds || []) : undefined;

            // Materialize one backing variable per target.
            let variables = state.variables;
            const variableIds: Record<string, VNID> = {};
            const targets: (VNID | 'global')[] = appliesTo === 'characters' ? (characterIds || []) : ['global'];
            for (const target of targets) {
                const charName = target === 'global' ? undefined : state.characters[target]?.name;
                if (target !== 'global' && !charName) continue; // skip unknown characters
                const varId = `var-${generateId()}`;
                variables = { ...variables, [varId]: makeStatVar(varId, statVarName(p.name, charName), { min, max, defaultValue }) };
                variableIds[target] = varId;
            }

            const newStat: VNStat = {
                id: statId,
                name: p.name,
                description: p.description,
                icon: p.icon ?? null,
                min, max, defaultValue,
                color: p.color,
                appliesTo,
                characterIds,
                variableIds,
                order: p.order ?? Object.keys(stats).length,
            };

            return { ...state, variables, stats: { ...stats, [statId]: newStat } };
        }

        case 'UPDATE_STAT': {
            const { statId, updates } = action.payload;
            const stats = state.stats || {};
            const existing = stats[statId];
            if (!existing) return state;
            const merged: VNStat = { ...existing, ...updates };

            // Write metadata changes through to every backing variable: name re-sync
            // (like itemReducer keeps count-var names in sync) and range/default.
            let variables = state.variables;
            const rangeChanged = updates.min !== undefined || updates.max !== undefined || updates.defaultValue !== undefined;
            if (updates.name || rangeChanged) {
                const next = { ...variables };
                for (const [target, varId] of Object.entries(existing.variableIds)) {
                    const v = next[varId];
                    if (!v) continue;
                    const charName = target === 'global' ? undefined : state.characters[target]?.name;
                    next[varId] = {
                        ...v,
                        name: updates.name ? statVarName(merged.name, charName) : v.name,
                        min: merged.min,
                        max: merged.max,
                        defaultValue: rangeChanged ? merged.defaultValue : v.defaultValue,
                    };
                }
                variables = next;
            }

            return { ...state, variables, stats: { ...stats, [statId]: merged } };
        }

        case 'DELETE_STAT': {
            const { statId, deleteVariables } = action.payload;
            const stats = state.stats || {};
            const existing = stats[statId];
            if (!existing) return state;
            const { [statId]: _removed, ...remainingStats } = stats;

            let variables = state.variables;
            if (deleteVariables) {
                const next = { ...variables };
                for (const varId of Object.values(existing.variableIds)) delete next[varId];
                variables = next;
            }

            return { ...state, variables, stats: remainingStats };
        }

        case 'SET_STAT_CHARACTERS': {
            const { statId, characterIds } = action.payload;
            const stats = state.stats || {};
            const existing = stats[statId];
            if (!existing || existing.appliesTo !== 'characters') return state;

            const prev = new Set(existing.characterIds || []);
            const next = new Set(characterIds);
            let variables = { ...state.variables };
            const variableIds: Record<string, VNID> = { ...existing.variableIds };

            // Removed characters: delete their backing variable + backlink.
            for (const charId of prev) {
                if (!next.has(charId)) {
                    const varId = variableIds[charId];
                    if (varId) delete variables[varId];
                    delete variableIds[charId];
                }
            }
            // Added characters: materialize a backing variable.
            for (const charId of next) {
                if (!prev.has(charId)) {
                    const charName = state.characters[charId]?.name;
                    if (!charName) continue;
                    const varId = `var-${generateId()}`;
                    variables[varId] = makeStatVar(varId, statVarName(existing.name, charName), existing);
                    variableIds[charId] = varId;
                }
            }

            return {
                ...state,
                variables,
                stats: { ...stats, [statId]: { ...existing, characterIds: [...next], variableIds } },
            };
        }

        default:
            return state;
    }
};
