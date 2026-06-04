import { VNID } from '../../types';
import { UIAsset } from '../ui/types';
import { VNUIAction } from '../../types/shared';

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
}
