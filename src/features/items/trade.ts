/**
 * Buy/sell math for shop lists (collections). Pure: given the current variable values + the project,
 * returns the new values for the variables a trade touches (currency, shop stock, player count), or a
 * `blocked` reason. Shared by the Buy/Sell command handlers and the grid's slot button (both to perform
 * the trade and to disable the button when it can't happen).
 *
 * A shop is an item collection with a `currencyVariableId`. Price comes from the per-shop entry override
 * or the item's base `price`. Stock lives in the entry's count variable unless the entry is infinite.
 * The PLAYER's count is always the item's own `countVariableId` (never the collection-swapped one).
 */
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNItemCollection } from './types';
import { clampNumberToBounds } from '../../utils/variableUtils';

type Vars = Record<VNID, string | number | boolean>;
export type TradeResult = { updates: Record<VNID, number> } | { blocked: 'funds' | 'stock' | 'owned' | 'invalid' };

const num = (v: unknown) => Number(v ?? 0);
const clampVar = (project: VNProject, varId: VNID, value: number) => {
    const v = project.variables[varId];
    return clampNumberToBounds(value, v?.min, v?.max);
};

/** Price the player pays/receives for an item in this shop (entry override → item price → 0). */
export const tradePrice = (item: { price?: number } | undefined, entry: { price?: number } | undefined): number =>
    Math.max(0, Math.floor(entry?.price ?? item?.price ?? 0));

/** Buy one of `itemId` from the shop `collection`: spend currency, move a unit of stock to the player. */
export const computeBuy = (itemId: VNID, collection: VNItemCollection, project: VNProject, vars: Vars): TradeResult => {
    const item = project.items?.[itemId];
    const entry = collection.entries.find(e => e.itemId === itemId);
    if (!item || !entry) return { blocked: 'invalid' };
    const price = tradePrice(item, entry);
    const currencyId = collection.currencyVariableId;

    if (currencyId && num(vars[currencyId]) < price) return { blocked: 'funds' };
    if (!entry.infiniteStock && num(vars[entry.countVariableId]) < 1) return { blocked: 'stock' };

    const updates: Record<VNID, number> = {};
    if (currencyId) updates[currencyId] = clampVar(project, currencyId, num(vars[currencyId]) - price);
    if (!entry.infiniteStock) updates[entry.countVariableId] = clampVar(project, entry.countVariableId, num(vars[entry.countVariableId]) - 1);
    // The player's own count (unique items cap at 1).
    updates[item.countVariableId] = item.unique ? 1 : clampVar(project, item.countVariableId, num(vars[item.countVariableId]) + 1);
    return { updates };
};

/** Sell one of `itemId` to the shop `collection`: remove from the player, credit currency (× sellMultiplier). */
export const computeSell = (itemId: VNID, collection: VNItemCollection, project: VNProject, vars: Vars): TradeResult => {
    const item = project.items?.[itemId];
    if (!item) return { blocked: 'invalid' };
    if (num(vars[item.countVariableId]) < 1) return { blocked: 'owned' };
    const entry = collection.entries.find(e => e.itemId === itemId);
    const price = tradePrice(item, entry);
    const gain = Math.floor(price * (collection.sellMultiplier ?? 0.5));
    const currencyId = collection.currencyVariableId;

    const updates: Record<VNID, number> = {};
    updates[item.countVariableId] = clampVar(project, item.countVariableId, num(vars[item.countVariableId]) - 1);
    if (currencyId) updates[currencyId] = clampVar(project, currencyId, num(vars[currencyId]) + gain);
    // Optionally the sold unit re-enters the shop's stock.
    if (collection.sellRestocksShop && entry) updates[entry.countVariableId] = clampVar(project, entry.countVariableId, num(vars[entry.countVariableId]) + 1);
    return { updates };
};
