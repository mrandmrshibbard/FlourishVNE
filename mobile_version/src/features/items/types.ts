import { VNID } from '../../types';
import { UIAsset } from '../ui/types';
import { VNUIAction, VNCondition } from '../../types/shared';

/**
 * A first-class inventory/shop item.
 *
 * An item is deliberately *sugar over native primitives*: its quantity is a
 * real `number` variable (`countVariableId`) so all existing tooling — the
 * `{name}` text interpolation, `conditions`, the SetVariable command/action —
 * works on it, and a user could rebuild the same thing by hand (a number
 * variable + an image asset + buttons). The registry just stores the metadata
 * (name, icon, price, use-effect) and keeps Inventory & Shop in sync.
 */
export interface VNItem {
    id: VNID;
    name: string;
    description?: string;
    /** Icon shown in inventory/shop slots. References a project image/video asset. */
    icon?: UIAsset | null;
    /** The `number` variable that tracks how many the player owns (source of truth for quantity). */
    countVariableId: VNID;
    /** Whether the item can be consumed/used from the inventory. */
    usable?: boolean;
    /** Whether using the item decreases its count by one. Default true (consumable). Set false for
     *  reusable items (e.g. a tool/key) that fire their use-effect without being spent. Additive-optional. */
    consumeOnUse?: boolean;
    /** Extra actions run when the item is used (the count is decremented automatically alongside these). */
    useEffect?: VNUIAction[];
    /** Default shop price in the shop's currency. Items not sold can leave this undefined. */
    price?: number;
    /** When true the item is a one-of flag (owned 0 or 1) — shops mark it sold-out once bought. */
    unique?: boolean;
    /** Optional grouping label (e.g. "Consumables", "Key Items"). */
    category?: string;
    /** Sort order within the registry / a generated screen. */
    order?: number;
    /** When true, this item is hidden from an inventory grid once its count hits 0 — even on a grid
     *  that otherwise shows unowned items. (A grid's own "hide unowned" setting already hides every
     *  0-count item; this is the per-item override for grids that show empties.) Additive-optional. */
    hideWhenEmpty?: boolean;
}

/**
 * An independent item *list* (collection) — e.g. the player's bag, a shop's stock, a library, a chest.
 * Collections are a layer on top of the global item registry: the same `VNItem` can belong to several
 * lists, each holding its OWN per-item quantity. Quantity stays "sugar over a count variable" — every
 * entry gets its own backing number variable (flagged `isInternal`), so a list's stock is conditionable
 * (`Store has ≥ 1 Sword`) and interpolatable just like the player's counts.
 *
 * The player's own inventory is NOT a collection — it remains the global item counts
 * (`VNItem.countVariableId`) for backwards compatibility. Collections are additive-optional.
 */
export interface VNItemCollection {
    id: VNID;
    name: string;
    description?: string;
    /** Sort order in the Systems tree. */
    order?: number;
    /** Which items this list holds + their per-list stock. */
    entries: VNCollectionEntry[];
    /** When true, this list IS the player's inventory: its entries track the player's OWNED counts (the
     *  global `item.countVariableId`) instead of having separate stock, so Give/Buy/Use/Sell stay in sync.
     *  Empty entries = show everything the player owns; add entries to curate which items appear. */
    tracksOwnedItems?: boolean;
    /** Optional automatic restock behaviour. */
    restock?: RestockRule;
    /** ── Shop settings (optional — turns this list into a buyable/sellable shop) ── */
    /** Number variable that holds the player's money for this shop (Buy spends it, Sell adds to it). */
    currencyVariableId?: VNID;
    /** Fraction of an item's price returned when the player sells it here (default 0.5). */
    sellMultiplier?: number;
    /** When true, selling an item adds it back into this list's stock. Default false (sold items vanish). */
    sellRestocksShop?: boolean;
}

export interface VNCollectionEntry {
    /** References an item in `project.items`. */
    itemId: VNID;
    /** Per-collection backing count variable (auto-created, `isInternal`). Source of truth for this list's stock. */
    countVariableId: VNID;
    /** Starting stock for a new game (backs the count variable's defaultValue). */
    startQty?: number;
    /** Restock target: the value for `reset`, or the MAX for `randomRange`. */
    restockTo?: number;
    /** Restock minimum for `randomRange` (inclusive). */
    restockMin?: number;
    /** Per-shop price override (falls back to `VNItem.price`). */
    price?: number;
    /** When true, this item never runs out in this shop — buying doesn't decrement stock. Default false. */
    infiniteStock?: boolean;
}

/** How much a restock puts back. */
export type RestockAmountMode = 'reset' | 'randomRange';
/** What causes a restock. */
export type RestockTrigger = 'manual' | 'condition' | 'variableChange';

export interface RestockRule {
    /** `reset` → each entry's `restockTo`; `randomRange` → random int in [restockMin, restockTo] per entry. */
    amount: RestockAmountMode;
    /** `manual` → only via the Restock command/action; `condition` → auto on a false→true transition;
     *  `variableChange` → auto whenever `watchVariableId` changes value. */
    trigger: RestockTrigger;
    /** Conditions to watch when `trigger === 'condition'`. Restocks once each time they become true. */
    condition?: VNCondition[];
    /** Variable to watch when `trigger === 'variableChange'`. Restocks whenever its value changes. */
    watchVariableId?: VNID;
}
