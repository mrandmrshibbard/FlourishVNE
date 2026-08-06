/**
 * Item command handler — Give / Use / Destroy. Items are sugar over a per-item count variable,
 * so these just compute the new count (clamped to the variable's min/max, default min 0). Use also
 * applies the item's use-effect (the variable-mutating ones; navigation effects belong on buttons).
 */
import { GiveItemCommand, UseItemCommand, DestroyItemCommand, RestockCollectionCommand, BuyItemCommand, SellItemCommand, CommandType } from '../../../features/scene/types';
import { UIActionType } from '../../../types/shared';
import { CommandContext, CommandResult } from './types';
import { normalizeSetVariableOperatorByType, calculateVariableValue, resolveSetVariableValue } from '../../../utils/variableUtils';
import { computeCollectionRestock } from '../../../features/items/restock';
import { computeBuy, computeSell } from '../../../features/items/trade';

type ItemCommand = GiveItemCommand | UseItemCommand | DestroyItemCommand;

export const handleItemCommand = (command: ItemCommand, context: CommandContext): CommandResult => {
    const { project, playerState } = context;
    const item = project.items?.[command.itemId];
    if (!item) return { advance: true, updates: {} };

    const vars: Record<string, string | number | boolean> = { ...playerState.variables };
    const countVar = project.variables[item.countVariableId];
    const clamp = (n: number): number => {
        const min = (countVar as any)?.min ?? 0;
        const max = (countVar as any)?.max;
        let v = Math.max(min, n);
        if (max !== undefined) v = Math.min(max, v);
        return v;
    };
    const cur = Number(vars[item.countVariableId] ?? 0);

    if (command.type === CommandType.GiveItem) {
        vars[item.countVariableId] = item.unique ? 1 : clamp(cur + ((command as GiveItemCommand).quantity ?? 1));
    } else if (command.type === CommandType.DestroyItem) {
        const c = command as DestroyItemCommand;
        vars[item.countVariableId] = c.all ? clamp(0) : clamp(cur - (c.quantity ?? 1));
    } else { // UseItem
        if (item.consumeOnUse !== false) vars[item.countVariableId] = clamp(cur - 1);
        // Apply the use-effect's variable mutations (health +50, flags, etc.).
        for (const eff of (item.useEffect || [])) {
            if (eff.type === UIActionType.SetVariable) {
                const ea = eff as any;
                const ev = project.variables[ea.variableId];
                if (!ev) continue;
                const { effectiveOperator } = normalizeSetVariableOperatorByType(ev.type, ev.name, ea.operator);
                // Reads the local clone so sequential use-effects see each other's writes.
                const changeValue = resolveSetVariableValue(ea, vars);
                vars[ea.variableId] = calculateVariableValue(effectiveOperator, ev.type, vars[ea.variableId], changeValue, ea.randomMin, ea.randomMax, undefined, ev.min, ev.max);
            } else if (eff.type === UIActionType.ResetVariable) {
                const ev = project.variables[(eff as any).variableId];
                if (ev) vars[(eff as any).variableId] = ev.defaultValue;
            }
        }
    }

    return { advance: true, updates: { variables: vars } };
};

/** Restock an item list (collection) to its configured amounts (reset or random range). */
export const handleRestockCollectionCommand = (command: RestockCollectionCommand, context: CommandContext): CommandResult => {
    const { project, playerState } = context;
    const collection = project.itemCollections?.[command.collectionId];
    if (!collection) return { advance: true, updates: {} };
    const restocked = computeCollectionRestock(collection, project.variables);
    return { advance: true, updates: { variables: { ...playerState.variables, ...restocked } } };
};

/** Buy an item from a shop list (spends currency, moves stock to the player). No-op if blocked. */
export const handleBuyItemCommand = (command: BuyItemCommand, context: CommandContext): CommandResult => {
    const { project, playerState } = context;
    const collection = project.itemCollections?.[command.collectionId];
    if (!collection) return { advance: true, updates: {} };
    const res = computeBuy(command.itemId, collection, project, playerState.variables);
    if ('blocked' in res) return { advance: true, updates: {} };
    return { advance: true, updates: { variables: { ...playerState.variables, ...res.updates } } };
};

/** Sell an item to a shop list (credits currency, removes it from the player). No-op if blocked. */
export const handleSellItemCommand = (command: SellItemCommand, context: CommandContext): CommandResult => {
    const { project, playerState } = context;
    const collection = project.itemCollections?.[command.collectionId];
    if (!collection) return { advance: true, updates: {} };
    const res = computeSell(command.itemId, collection, project, playerState.variables);
    if ('blocked' in res) return { advance: true, updates: {} };
    return { advance: true, updates: { variables: { ...playerState.variables, ...res.updates } } };
};
