/**
 * systemBuilder — now just the always-on inventory HUD bar (a quick-use strip of owned
 * items added to the pass-through Game HUD screen). The old hand-built inventory/shop
 * SCREEN builders (button-grid / image-map / drag-drop) were retired: the wizards now
 * generate the real system — a VNItemCollection + a bound UIInventoryGridElement — so
 * generated screens get sort/grouping/stock/sell/restock + the Player Inventory settings.
 */
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNUIElement, UIElementType, VNFontSettings, UIImageElement, UITextElement } from '../ui/types';
import { UIActionType, VNUIAction, VNCondition } from '../../types/shared';

let _seq = 0;
const eid = (): VNID => `elem-${Date.now().toString(36)}-${(_seq++).toString(36)}`;

/** One resolved item (linked to its count variable + registry id). */
export interface BuiltItemRef {
    itemId: VNID;
    name: string;
    /** number variable tracking how many are owned (source of truth). */
    countVariableId: VNID;
    iconAssetId?: VNID | null;
    price?: number;
    unique?: boolean;
    useEffect?: VNUIAction[];
    usable?: boolean;
}

// ── element helpers ────────────────────────────────────────────────────────
const baseEl = (x: number, y: number, width: number, height: number) => ({
    id: eid(), x, y, width, height, anchorX: 0, anchorY: 0,
});

function imageEl(opts: { x: number; y: number; w: number; h: number; assetId?: VNID | null; name?: string; conditions?: VNCondition[]; draggable?: boolean; snapBack?: boolean; actions?: VNUIAction[] }): UIImageElement {
    return {
        ...baseEl(opts.x, opts.y, opts.w, opts.h),
        name: opts.name || 'Image', type: UIElementType.Image,
        background: opts.assetId ? { type: 'image', assetId: opts.assetId } : { type: 'color', value: 'rgba(255,255,255,0.06)' },
        image: opts.assetId ? { type: 'image', id: opts.assetId } : null,
        objectFit: 'contain',
        ...(opts.conditions ? { conditions: opts.conditions } : {}),
        ...(opts.draggable ? { draggable: true, interactive: true, snapBack: opts.snapBack ?? true } : {}),
        ...(opts.actions ? { actions: opts.actions } : {}),
    };
}

function textEl(opts: { x: number; y: number; w: number; h: number; text: string; font: VNFontSettings; align?: 'left' | 'center' | 'right'; name?: string; conditions?: VNCondition[] }): UITextElement {
    return {
        ...baseEl(opts.x, opts.y, opts.w, opts.h),
        name: opts.name || 'Text', type: UIElementType.Text,
        text: opts.text, font: opts.font,
        textAlign: opts.align || 'center', verticalAlign: 'middle',
        ...(opts.conditions ? { conditions: opts.conditions } : {}),
    };
}

const setVar = (variableId: VNID, operator: 'set' | 'add' | 'subtract', value: number): VNUIAction =>
    ({ type: UIActionType.SetVariable, variableId, operator, value } as VNUIAction);
const cond = (variableId: VNID, operator: VNCondition['operator'], value: number): VNCondition => ({ variableId, operator, value });
function smallFont(project: VNProject): VNFontSettings { return { ...project.ui.dialogueTextFont, size: 13 }; }

// ── INVENTORY HUD BAR (always-on, click-to-use) ──────────────────────────────
export interface HudBarConfig {
    items: BuiltItemRef[];
    /** Where the strip sits. */
    corner?: 'bottom' | 'top';
    /** Percent width per icon. */
    iconSize?: number;
}

/**
 * An always-on quick-use strip of the player's owned items, added to the (pass-through)
 * Game HUD screen. Each owned item shows as an icon + quantity; usable items are clickable
 * to consume one and run their effect. Items auto-hide at 0 (conditions) and reappear when
 * re-acquired. Icons are draggable so authors can reuse them in same-screen drag puzzles.
 */
export function buildInventoryHudElements(project: VNProject, config: HudBarConfig): VNUIElement[] {
    const els: VNUIElement[] = [];
    const size = config.iconSize ?? 7;
    const gap = 1.5;
    const total = config.items.length * (size + gap) - gap;
    const startX = Math.max(2, 50 - total / 2);
    const y = config.corner === 'top' ? 4 : 90;

    config.items.forEach((item, i) => {
        const x = startX + i * (size + gap) + size / 2;
        const owned: VNCondition[] = [cond(item.countVariableId, '>=', 1)];
        const useActions: VNUIAction[] = item.usable
            ? [setVar(item.countVariableId, 'subtract', 1), ...(item.useEffect || [])]
            : [];
        els.push(imageEl({
            x, y, w: size, h: size * 1.4, assetId: item.iconAssetId,
            name: `HUD ${item.name}`, conditions: owned,
            draggable: true, snapBack: true,
            actions: useActions.length ? useActions : undefined,
        }));
        els.push(textEl({
            x: x + size * 0.35, y: y - size * 0.5, w: size * 0.8, h: size * 0.5,
            text: `x{${item.name}}`, font: smallFont(project), name: `HUD ${item.name} Qty`,
            conditions: owned,
        }));
    });
    return els;
}
