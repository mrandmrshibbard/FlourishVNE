/**
 * systemBuilder — turns a high-level Inventory/Shop config into a plain VNUIScreen
 * made entirely of native primitives (Text / Image / Button / HotSpot / draggableImageElement
 * elements + SetVariable actions + conditions). Nothing here is a bespoke runtime
 * mechanic: every element this emits is something a user could place and wire by
 * hand in the UI screen editor, which keeps generated systems fully re-customizable.
 *
 * Both the Inventory and Shop wizards call into this so layout + logic live in one place.
 */
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import {
    VNUIScreen, VNUIElement, UIElementType, VNFontSettings,
    UIButtonElement, UITextElement, UIImageElement, UIHotSpotElement, UIdraggableImageElementElement,
} from '../ui/types';
import { UIActionType, VNUIAction, VNCondition } from '../../types/shared';

let _seq = 0;
const eid = (): VNID => `elem-${Date.now().toString(36)}-${(_seq++).toString(36)}`;

export type InteractionMode = 'buttonGrid' | 'draggableImageElement' | 'dragDrop';

/** One resolved item the builder lays out (already linked to its count variable). */
export interface BuiltItemRef {
    name: string;
    /** number variable tracking how many are owned (source of truth). */
    countVariableId: VNID;
    /** image/video asset id for the icon (optional). */
    iconAssetId?: VNID | null;
    /** shop price (shop only). */
    price?: number;
    /** one-of item (sold out after purchase / not stackable). */
    unique?: boolean;
    /** extra actions when used (inventory "use"). */
    useEffect?: VNUIAction[];
    usable?: boolean;
}

export interface ShopBuildConfig {
    screenId: VNID;
    screenName: string;
    backgroundColor?: string;
    mode: InteractionMode;
    columns?: number;
    currency: { variableId: VNID; name: string; icon?: string };
    items: BuiltItemRef[];
    /** image asset for draggableImageElement / dragDrop board (mode-dependent). */
    boardImageAssetId?: VNID | null;
    closeAction?: VNUIAction;
}

export interface InventoryBuildConfig {
    screenId: VNID;
    screenName: string;
    backgroundColor?: string;
    mode: InteractionMode;
    columns?: number;
    items: BuiltItemRef[];
    boardImageAssetId?: VNID | null;
    closeAction?: VNUIAction;
    /** When true, only show a slot if the player owns at least one (count >= 1). */
    hideUnowned?: boolean;
}

// ── element helpers ────────────────────────────────────────────────────────

const baseEl = (x: number, y: number, width: number, height: number) => ({
    id: eid(), x, y, width, height, anchorX: 0, anchorY: 0,
});

function textEl(opts: { x: number; y: number; w: number; h: number; text: string; font: VNFontSettings; align?: 'left' | 'center' | 'right'; name?: string; conditions?: VNCondition[] }): UITextElement {
    return {
        ...baseEl(opts.x, opts.y, opts.w, opts.h),
        name: opts.name || 'Text', type: UIElementType.Text,
        text: opts.text, font: opts.font,
        textAlign: opts.align || 'center', verticalAlign: 'middle',
        ...(opts.conditions ? { conditions: opts.conditions } : {}),
    };
}

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

function buttonEl(project: VNProject, opts: { x: number; y: number; w: number; h: number; text: string; actions: VNUIAction[]; name?: string; conditions?: VNCondition[]; disabledConditions?: VNCondition[]; bg?: string }): UIButtonElement {
    return {
        ...baseEl(opts.x, opts.y, opts.w, opts.h),
        name: opts.name || 'Button', type: UIElementType.Button,
        text: opts.text, font: project.ui.choiceTextFont,
        action: opts.actions[0] || { type: UIActionType.None },
        actions: opts.actions,
        image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null,
        backgroundColor: opts.bg || '#4D3273', hoverBackgroundColor: '#6B4C9A',
        ...(opts.conditions ? { conditions: opts.conditions } : {}),
        ...(opts.disabledConditions ? { disabledConditions: opts.disabledConditions } : {}),
    };
}

function hotSpotEl(opts: { x: number; y: number; w: number; h: number; name?: string; trigger?: 'click' | 'hover' | 'drag-drop'; actions: VNUIAction[]; acceptedElementIds?: VNID[]; conditions?: VNCondition[] }): UIHotSpotElement {
    return {
        ...baseEl(opts.x, opts.y, opts.w, opts.h),
        name: opts.name || 'Hot Spot', type: UIElementType.HotSpot,
        shape: 'rect', trigger: opts.trigger || 'click',
        actions: opts.actions,
        ...(opts.acceptedElementIds ? { acceptedElementIds: opts.acceptedElementIds } : {}),
        ...(opts.conditions ? { conditions: opts.conditions } : {}),
        highlightColor: 'rgba(99,102,241,0.3)', visible: false,
        interactive: true,
    } as UIHotSpotElement;
}

const setVar = (variableId: VNID, operator: 'set' | 'add' | 'subtract', value: number): VNUIAction =>
    ({ type: UIActionType.SetVariable, variableId, operator, value } as VNUIAction);

const cond = (variableId: VNID, operator: VNCondition['operator'], value: number): VNCondition => ({ variableId, operator, value });

function titleFont(project: VNProject): VNFontSettings { return { ...project.ui.dialogueNameFont, size: 28 }; }
function bodyFont(project: VNProject): VNFontSettings { return { ...project.ui.dialogueTextFont, size: 16 }; }
function smallFont(project: VNProject): VNFontSettings { return { ...project.ui.dialogueTextFont, size: 13 }; }

function emptyScreen(id: VNID, name: string, bg?: string): VNUIScreen {
    return {
        id, name,
        background: { type: 'color', value: bg || '#1a102c' },
        music: { audioId: null, policy: 'continue', volume: 0.8 },
        ambientNoise: { audioId: null, policy: 'continue', volume: 0.8 },
        elements: {},
        effects: [],
        transitionIn: 'fade', transitionOut: 'fade', transitionDuration: 300,
        showDialogue: false,
    };
}

function collect(screen: VNUIScreen, els: VNUIElement[]): VNUIScreen {
    const elements: Record<VNID, VNUIElement> = { ...screen.elements };
    for (const el of els) elements[el.id] = el;
    return { ...screen, elements };
}

// ── SHOP ─────────────────────────────────────────────────────────────────────

export function buildShopScreen(project: VNProject, config: ShopBuildConfig): VNUIScreen {
    let screen = emptyScreen(config.screenId, config.screenName, config.backgroundColor);
    const els: VNUIElement[] = [];
    const icon = config.currency.icon ? `${config.currency.icon} ` : '';

    // Title + live currency readout (variable interpolation).
    els.push(textEl({ x: 50, y: 4, w: 80, h: 8, text: config.screenName, font: titleFont(project), name: 'Shop Title' }));
    els.push(textEl({ x: 50, y: 12, w: 80, h: 5, text: `${icon}{${config.currency.name}}`, font: bodyFont(project), name: 'Currency Display' }));

    if (config.mode === 'buttonGrid') {
        layoutItemGrid(project, config.items, config.columns || 3, (item, slot) => {
            const price = item.price ?? 0;
            const buyActions: VNUIAction[] = [
                setVar(config.currency.variableId, 'subtract', price),
                setVar(item.countVariableId, 'add', 1),
            ];
            const cardEls = shopCard(project, slot, item, icon, price, config.currency.variableId, buyActions);
            els.push(...cardEls);
        });
    } else if (config.mode === 'draggableImageElement') {
        // One artwork; each item gets an invisible click hot spot laid over its art.
        if (config.boardImageAssetId) {
            els.push(imageEl({ x: 50, y: 55, w: 90, h: 70, assetId: config.boardImageAssetId, name: 'Shop Board' }));
        }
        layoutItemGrid(project, config.items, config.columns || 3, (item, slot) => {
            const price = item.price ?? 0;
            els.push(hotSpotEl({
                x: slot.cx, y: slot.cy, w: slot.w, h: slot.h, name: `Buy ${item.name} (region)`,
                trigger: 'click',
                actions: [setVar(config.currency.variableId, 'subtract', price), setVar(item.countVariableId, 'add', 1)],
                conditions: [cond(config.currency.variableId, '>=', price)],
            }));
        });
    } else if (config.mode === 'dragDrop') {
        // Draggable coins/items dropped on a "Buy" hot spot, or drag item to cart.
        layoutItemGrid(project, config.items, config.columns || 3, (item, slot) => {
            const price = item.price ?? 0;
            const dragId = eid();
            const drag = imageEl({ x: slot.cx, y: slot.cy, w: slot.w * 0.6, h: slot.h * 0.6, assetId: item.iconAssetId, name: `${item.name} (drag)`, draggable: true, snapBack: true });
            drag.id = dragId;
            els.push(drag);
            els.push(textEl({ x: slot.cx, y: slot.cy + slot.h * 0.4, w: slot.w, h: 4, text: `${icon}${price}`, font: smallFont(project), name: `${item.name} Price` }));
            els.push(hotSpotEl({
                x: slot.cx, y: slot.cy, w: slot.w, h: slot.h, name: `Buy ${item.name} drop`,
                trigger: 'drag-drop', acceptedElementIds: [dragId],
                actions: [setVar(config.currency.variableId, 'subtract', price), setVar(item.countVariableId, 'add', 1)],
                conditions: [cond(config.currency.variableId, '>=', price)],
            }));
        });
    }

    // Close button.
    els.push(buttonEl(project, {
        x: 50, y: 93, w: 18, h: 6, text: 'Close', name: 'Close Button',
        actions: [config.closeAction || { type: UIActionType.ReturnToGame }], bg: '#1e293b',
    }));

    return collect(screen, els);
}

/** A shop item card (button-grid): icon, name, price, affordability-gated Buy + sold-out state. */
function shopCard(project: VNProject, slot: Slot, item: BuiltItemRef, icon: string, price: number, currencyVarId: VNID, buyActions: VNUIAction[]): VNUIElement[] {
    const out: VNUIElement[] = [];
    out.push(imageEl({ x: slot.cx, y: slot.cy - slot.h * 0.18, w: slot.w * 0.5, h: slot.h * 0.45, assetId: item.iconAssetId, name: `${item.name} Icon` }));
    out.push(textEl({ x: slot.cx, y: slot.cy + slot.h * 0.12, w: slot.w * 0.95, h: slot.h * 0.16, text: item.name, font: bodyFont(project), name: `${item.name} Name` }));
    out.push(textEl({ x: slot.cx, y: slot.cy + slot.h * 0.28, w: slot.w * 0.95, h: slot.h * 0.14, text: `${icon}${price}`, font: smallFont(project), name: `${item.name} Price` }));

    if (item.unique) {
        // Sold out once owned (count >= 1): grey "Owned" label replaces Buy.
        out.push(buttonEl(project, {
            x: slot.cx, y: slot.cy + slot.h * 0.42, w: slot.w * 0.7, h: slot.h * 0.18, text: 'Buy',
            name: `Buy ${item.name}`, actions: buyActions,
            conditions: [cond(item.countVariableId, '<', 1)],
            disabledConditions: [cond(currencyVarId, '<', price)],
        }));
        out.push(textEl({
            x: slot.cx, y: slot.cy + slot.h * 0.42, w: slot.w * 0.7, h: slot.h * 0.18, text: 'Owned',
            font: smallFont(project), name: `${item.name} Owned`,
            conditions: [cond(item.countVariableId, '>=', 1)],
        }));
    } else {
        out.push(buttonEl(project, {
            x: slot.cx, y: slot.cy + slot.h * 0.42, w: slot.w * 0.7, h: slot.h * 0.18, text: 'Buy',
            name: `Buy ${item.name}`, actions: buyActions,
            disabledConditions: [cond(currencyVarId, '<', price)],
        }));
    }
    return out;
}

// ── INVENTORY ──────────────────────────────────────────────────────────────

export function buildInventoryScreen(project: VNProject, config: InventoryBuildConfig): VNUIScreen {
    let screen = emptyScreen(config.screenId, config.screenName, config.backgroundColor);
    const els: VNUIElement[] = [];

    els.push(textEl({ x: 50, y: 5, w: 80, h: 8, text: config.screenName, font: titleFont(project), name: 'Inventory Title' }));

    if (config.mode === 'draggableImageElement' && config.boardImageAssetId) {
        els.push(imageEl({ x: 50, y: 55, w: 90, h: 70, assetId: config.boardImageAssetId, name: 'Inventory Board' }));
    }

    layoutItemGrid(project, config.items, config.columns || 4, (item, slot) => {
        const ownedCond: VNCondition[] | undefined = config.hideUnowned ? [cond(item.countVariableId, '>=', 1)] : undefined;

        if (config.mode === 'dragDrop') {
            const dragId = eid();
            const drag = imageEl({ x: slot.cx, y: slot.cy - slot.h * 0.1, w: slot.w * 0.55, h: slot.h * 0.5, assetId: item.iconAssetId, name: `${item.name} (drag)`, draggable: true, snapBack: true, conditions: ownedCond });
            drag.id = dragId;
            els.push(drag);
            if (item.usable) {
                // Drop onto a "Use" hot spot → decrement + effect.
                els.push(hotSpotEl({
                    x: slot.cx, y: slot.cy, w: slot.w, h: slot.h, name: `Use ${item.name} drop`,
                    trigger: 'drag-drop', acceptedElementIds: [dragId],
                    actions: [setVar(item.countVariableId, 'subtract', 1), ...(item.useEffect || [])],
                    conditions: [cond(item.countVariableId, '>=', 1)],
                }));
            }
        } else {
            els.push(imageEl({ x: slot.cx, y: slot.cy - slot.h * 0.12, w: slot.w * 0.5, h: slot.h * 0.45, assetId: item.iconAssetId, name: `${item.name} Icon`, conditions: ownedCond }));
            els.push(textEl({ x: slot.cx, y: slot.cy + slot.h * 0.14, w: slot.w * 0.95, h: slot.h * 0.16, text: `${item.name}`, font: smallFont(project), name: `${item.name} Name`, conditions: ownedCond }));
            // Quantity badge via interpolation.
            els.push(textEl({ x: slot.cx + slot.w * 0.3, y: slot.cy - slot.h * 0.25, w: slot.w * 0.4, h: slot.h * 0.18, text: `x{${item.name}}`, font: smallFont(project), name: `${item.name} Qty`, conditions: ownedCond }));
            if (item.usable) {
                els.push(buttonEl(project, {
                    x: slot.cx, y: slot.cy + slot.h * 0.36, w: slot.w * 0.7, h: slot.h * 0.16, text: 'Use',
                    name: `Use ${item.name}`,
                    actions: [setVar(item.countVariableId, 'subtract', 1), ...(item.useEffect || [])],
                    conditions: [cond(item.countVariableId, '>=', 1)],
                }));
            }
        }
    });

    els.push(buttonEl(project, {
        x: 50, y: 93, w: 18, h: 6, text: 'Close', name: 'Close Button',
        actions: [config.closeAction || { type: UIActionType.ReturnToGame }], bg: '#1e293b',
    }));

    return collect(screen, els);
}

// ── INVENTORY HUD BAR (always-on, click-to-use) ──────────────────────────────

export interface HudBarConfig {
    items: BuiltItemRef[];
    /** Where the strip sits. */
    corner?: 'bottom' | 'top';
    /** Max icons before wrapping is ignored (kept simple: single row). */
    iconSize?: number; // percent width per icon
}

/**
 * Builds an always-on quick-use strip of the player's owned items, to be added to
 * the (pass-through) Game HUD screen. Each owned item shows as an icon + quantity;
 * usable items are clickable to consume one and run their effect. Items auto-hide
 * when the count reaches 0 (conditions) and reappear when re-acquired. Elements are
 * also flagged draggable so authors can reuse them in same-screen drag puzzles.
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

// ── grid layout ──────────────────────────────────────────────────────────────

interface Slot { cx: number; cy: number; w: number; h: number; }

/** Lays items into a centered grid (percent coords) and invokes cb per item with its slot. */
function layoutItemGrid(_project: VNProject, items: BuiltItemRef[], columns: number, cb: (item: BuiltItemRef, slot: Slot) => void) {
    const cols = Math.max(1, columns);
    const rows = Math.ceil(items.length / cols);
    const areaTop = 20, areaBottom = 88;
    const areaH = areaBottom - areaTop;
    const cellW = 90 / cols;        // 90% usable width, centered (left margin 5%)
    const cellH = Math.min(areaH / Math.max(rows, 1), 30);
    items.forEach((item, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const cx = 5 + cellW * c + cellW / 2;
        const cy = areaTop + cellH * r + cellH / 2;
        cb(item, { cx, cy, w: cellW * 0.92, h: cellH * 0.92 });
    });
}
