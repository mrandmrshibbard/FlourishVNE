import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNVariable, VNVariableScope } from '../../variables/types';
import { UIAsset } from '../../ui/types';
import { VNUIAction } from '../../../types/shared';
import { VNItem, VNItemCollection, VNCollectionEntry } from '../types';

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
    | { type: 'DELETE_ITEM'; payload: { itemId: VNID; deleteCountVariable?: boolean } }
    // ── Item collections (independent item lists: shop, library, chest…) ── //
    | { type: 'ADD_ITEM_COLLECTION'; payload: { id?: VNID; name: string } }
    | { type: 'UPDATE_ITEM_COLLECTION'; payload: { collectionId: VNID; updates: Partial<VNItemCollection> } }
    | { type: 'DELETE_ITEM_COLLECTION'; payload: { collectionId: VNID; deleteCountVariables?: boolean } }
    | { type: 'ADD_COLLECTION_ENTRY'; payload: { collectionId: VNID; itemId: VNID; startQty?: number; scope?: VNVariableScope } }
    | { type: 'UPDATE_COLLECTION_ENTRY'; payload: { collectionId: VNID; itemId: VNID; updates: Partial<VNCollectionEntry> } }
    | { type: 'REMOVE_COLLECTION_ENTRY'; payload: { collectionId: VNID; itemId: VNID; deleteCountVariable?: boolean } };

// Builds the auto-managed, hidden count variable that backs a single (collection, item) entry's stock.
const makeEntryCountVar = (id: VNID, name: string, startQty: number, scope?: VNVariableScope): VNVariable => ({
    id,
    name,
    type: 'number',
    defaultValue: Math.max(0, Math.floor(startQty) || 0),
    scope: scope || 'global',
    min: 0,           // stock never goes negative
    isInternal: true, // hidden from the Variables manager (kept calm); still works by id everywhere
});

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
                    min: 0, // inventory counts never go negative (Use/Destroy clamp here)
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

        case 'ADD_ITEM_COLLECTION': {
            const p = action.payload;
            const id = p.id || `coll-${generateId()}`;
            const collections = state.itemCollections || {};
            const newCollection: VNItemCollection = {
                id,
                name: p.name,
                entries: [],
                order: Object.keys(collections).length,
            };
            return { ...state, itemCollections: { ...collections, [id]: newCollection } };
        }

        case 'UPDATE_ITEM_COLLECTION': {
            const { collectionId, updates } = action.payload;
            const collections = state.itemCollections || {};
            const existing = collections[collectionId];
            if (!existing) return state;
            const merged: VNItemCollection = { ...existing, ...updates };

            // If the list was renamed, re-sync its entries' (hidden) count-var names so any
            // {name} interpolation stays readable: "Item — List".
            let variables = state.variables;
            if (updates.name && updates.name !== existing.name) {
                merged.entries.forEach(e => {
                    const v = variables[e.countVariableId];
                    if (v) {
                        const itemName = state.items?.[e.itemId]?.name || 'Item';
                        variables = { ...variables, [e.countVariableId]: { ...v, name: `${itemName} — ${updates.name}` } };
                    }
                });
            }

            return { ...state, variables, itemCollections: { ...collections, [collectionId]: merged } };
        }

        case 'DELETE_ITEM_COLLECTION': {
            const { collectionId, deleteCountVariables } = action.payload;
            const collections = state.itemCollections || {};
            const existing = collections[collectionId];
            if (!existing) return state;
            const { [collectionId]: _removed, ...remaining } = collections;

            let variables = state.variables;
            // A player-inventory list's entries reuse the global item count vars — never delete those.
            if (deleteCountVariables && !existing.tracksOwnedItems) {
                variables = { ...variables };
                existing.entries.forEach(e => { delete variables[e.countVariableId]; });
            }

            return { ...state, variables, itemCollections: remaining };
        }

        case 'ADD_COLLECTION_ENTRY': {
            const { collectionId, itemId, startQty, scope } = action.payload;
            const collections = state.itemCollections || {};
            const existing = collections[collectionId];
            if (!existing) return state;
            if (existing.entries.some(e => e.itemId === itemId)) return state; // already in this list

            // Player-inventory lists track the OWNED count (the item's global count var) — no separate
            // stock var. Shop/storage lists get their own backing count var.
            if (existing.tracksOwnedItems) {
                const ownedVarId = state.items?.[itemId]?.countVariableId;
                if (!ownedVarId) return state;
                const entry: VNCollectionEntry = { itemId, countVariableId: ownedVarId };
                return { ...state, itemCollections: { ...collections, [collectionId]: { ...existing, entries: [...existing.entries, entry] } } };
            }

            const countVariableId = `var-${generateId()}`;
            const itemName = state.items?.[itemId]?.name || 'Item';
            const countVar = makeEntryCountVar(countVariableId, `${itemName} — ${existing.name}`, startQty ?? 0, scope);

            const entry: VNCollectionEntry = { itemId, countVariableId, startQty: startQty ?? 0 };
            const merged: VNItemCollection = { ...existing, entries: [...existing.entries, entry] };

            return {
                ...state,
                variables: { ...state.variables, [countVariableId]: countVar },
                itemCollections: { ...collections, [collectionId]: merged },
            };
        }

        case 'UPDATE_COLLECTION_ENTRY': {
            const { collectionId, itemId, updates } = action.payload;
            const collections = state.itemCollections || {};
            const existing = collections[collectionId];
            if (!existing) return state;
            const idx = existing.entries.findIndex(e => e.itemId === itemId);
            if (idx < 0) return state;
            const entry = existing.entries[idx];
            const mergedEntry: VNCollectionEntry = { ...entry, ...updates };
            const entries = [...existing.entries];
            entries[idx] = mergedEntry;

            // Keep the backing variable's defaultValue in step with the starting quantity.
            let variables = state.variables;
            if (updates.startQty !== undefined && variables[entry.countVariableId]) {
                variables = {
                    ...variables,
                    [entry.countVariableId]: { ...variables[entry.countVariableId], defaultValue: Math.max(0, Math.floor(updates.startQty) || 0) },
                };
            }

            return { ...state, variables, itemCollections: { ...collections, [collectionId]: { ...existing, entries } } };
        }

        case 'REMOVE_COLLECTION_ENTRY': {
            const { collectionId, itemId, deleteCountVariable } = action.payload;
            const collections = state.itemCollections || {};
            const existing = collections[collectionId];
            if (!existing) return state;
            const entry = existing.entries.find(e => e.itemId === itemId);
            if (!entry) return state;

            let variables = state.variables;
            // Never delete the var for a player-inventory entry — it's the shared global item count var.
            if (deleteCountVariable !== false && !existing.tracksOwnedItems && variables[entry.countVariableId]) {
                const { [entry.countVariableId]: _v, ...rest } = variables;
                variables = rest;
            }

            return {
                ...state,
                variables,
                itemCollections: { ...collections, [collectionId]: { ...existing, entries: existing.entries.filter(e => e.itemId !== itemId) } },
            };
        }

        default:
            return state;
    }
};
