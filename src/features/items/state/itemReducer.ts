import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNVariable, VNVariableScope } from '../../variables/types';
import { UIAsset } from '../../ui/types';
import { VNUIAction } from '../../../types/shared';
import { VNItem } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 9);

export interface AddItemPayload {
    id?: VNID;
    name: string;
    description?: string;
    icon?: UIAsset | null;
    usable?: boolean;
    useEffect?: VNUIAction[];
    price?: number;
    unique?: boolean;
    category?: string;
    order?: number;
    /** Provide an existing count variable, or one is created automatically. */
    countVariableId?: VNID;
    /** Scope for the auto-created count variable (default 'global'). */
    scope?: VNVariableScope;
}

export type ItemAction =
    | { type: 'ADD_ITEM'; payload: AddItemPayload }
    | { type: 'UPDATE_ITEM'; payload: { itemId: VNID; updates: Partial<VNItem> } }
    | { type: 'DELETE_ITEM'; payload: { itemId: VNID; deleteCountVariable?: boolean } };

export const itemReducer = (state: VNProject, action: ItemAction): VNProject => {
    switch (action.type) {
        case 'ADD_ITEM': {
            const p = action.payload;
            const itemId = p.id || `item-${generateId()}`;
            const items = state.items || {};

            // Ensure a backing count variable exists (the source of truth for quantity).
            let variables = state.variables;
            let countVariableId = p.countVariableId;
            if (!countVariableId || !variables[countVariableId]) {
                countVariableId = countVariableId || `var-${generateId()}`;
                const countVar: VNVariable = {
                    id: countVariableId,
                    name: p.name,
                    type: 'number',
                    defaultValue: 0,
                    scope: p.scope || 'global',
                };
                variables = { ...variables, [countVariableId]: countVar };
            }

            const newItem: VNItem = {
                id: itemId,
                name: p.name,
                description: p.description,
                icon: p.icon ?? null,
                countVariableId,
                usable: p.usable ?? false,
                useEffect: p.useEffect,
                price: p.price,
                unique: p.unique,
                category: p.category,
                order: p.order ?? Object.keys(items).length,
            };

            return {
                ...state,
                variables,
                items: { ...items, [itemId]: newItem },
            };
        }

        case 'UPDATE_ITEM': {
            const { itemId, updates } = action.payload;
            const items = state.items || {};
            const existing = items[itemId];
            if (!existing) return state;
            const merged: VNItem = { ...existing, ...updates };

            // Keep the backing count variable's name in sync with the item name so
            // `{item name}` interpolation always reflects the current label.
            let variables = state.variables;
            if (updates.name && existing.countVariableId && variables[existing.countVariableId]) {
                variables = {
                    ...variables,
                    [existing.countVariableId]: { ...variables[existing.countVariableId], name: updates.name },
                };
            }

            return {
                ...state,
                variables,
                items: { ...items, [itemId]: merged },
            };
        }

        case 'DELETE_ITEM': {
            const { itemId, deleteCountVariable } = action.payload;
            const items = state.items || {};
            const existing = items[itemId];
            if (!existing) return state;
            const { [itemId]: _removed, ...remainingItems } = items;

            let variables = state.variables;
            if (deleteCountVariable && existing.countVariableId && variables[existing.countVariableId]) {
                const { [existing.countVariableId]: _v, ...rest } = variables;
                variables = rest;
            }

            return {
                ...state,
                variables,
                items: remainingItems,
            };
        }

        default:
            return state;
    }
};
