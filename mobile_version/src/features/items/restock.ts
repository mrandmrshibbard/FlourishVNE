/**
 * Restock math for item lists (collections). Pure: given a collection and the current variable
 * definitions (for min/max clamping), returns the new stock value for each entry's backing count
 * variable. Shared by the manual Restock command/action and the reactive (condition / variable-change)
 * restock effect so they all behave identically.
 */
import { VNID } from '../../types';
import { VNItemCollection } from './types';
import { VNVariable } from '../variables/types';

export const computeCollectionRestock = (
    collection: VNItemCollection,
    variables: Record<VNID, VNVariable>,
): Record<VNID, number> => {
    const out: Record<VNID, number> = {};
    const mode = collection.restock?.amount || 'reset';
    for (const e of collection.entries) {
        const target = Math.floor(e.restockTo ?? e.startQty ?? 0);
        let val: number;
        if (mode === 'randomRange') {
            const lo = Math.max(0, Math.floor(e.restockMin ?? 0));
            const hi = Math.max(lo, target);
            val = lo + Math.floor(Math.random() * (hi - lo + 1));
        } else {
            val = Math.max(0, target);
        }
        // Respect the backing variable's own bounds if set.
        const v = variables[e.countVariableId];
        if (v) {
            if (typeof v.min === 'number') val = Math.max(v.min, val);
            if (typeof v.max === 'number') val = Math.min(v.max, val);
        }
        out[e.countVariableId] = val;
    }
    return out;
};
