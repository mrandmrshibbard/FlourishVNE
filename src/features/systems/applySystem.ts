/**
 * applySystemWizardResult — turns a Shop/Inventory wizard result into the REAL inventory
 * system using existing reducer actions: items (ADD_ITEM), a currency variable + a shop
 * VNItemCollection (ADD_ITEM_COLLECTION / ADD_COLLECTION_ENTRY) for shops, and a screen
 * whose single element is a bound UIInventoryGridElement (so it inherits sort/grouping/
 * stock/sell/restock + the Player Inventory settings). Inventory wizards make an unbound
 * (player-inventory) grid; an optional always-on HUD bar is still element-based.
 * IDs are generated up front so the screen can reference freshly-created data.
 */
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { UIActionType } from '../../types/shared';
import { UIElementType, UIButtonElement, UIInventoryGridElement } from '../ui/types';
import { buildInventoryHudElements, BuiltItemRef } from './systemBuilder';
import { createUIElement } from '../../utils/uiElementFactory';

const gid = (p: string) => `${p}-${Math.random().toString(36).substring(2, 9)}`;

export interface WizardItemSpec {
    /** Reuse an existing registry item by id. */
    itemId?: VNID;
    /** New-item fields (used when itemId is absent). */
    name: string;
    iconAssetId?: VNID | null;
    price?: number;
    usable?: boolean;
    unique?: boolean;
}

export interface SystemWizardResult {
    kind: 'shop' | 'inventory';
    screenName: string;
    backgroundColor?: string;
    columns: number;
    hideUnowned?: boolean;
    currency?: { name: string; icon?: string; startAmount: number; variableId?: VNID };
    items: WizardItemSpec[];
    /** Add a button to the game HUD that opens this screen. */
    addHudButton?: boolean;
    /** Inventory only: where the generated inventory lives. */
    inventoryOutput?: 'screen' | 'hud' | 'both';
}

type Dispatch = (action: any) => void;

export function applySystemWizardResult(result: SystemWizardResult, project: VNProject, dispatch: Dispatch): { screenId: VNID } {
    // 1. Resolve / create items → refs (with itemId + stable countVariableId).
    //    Reuse an existing registry item — explicitly by id, or by matching name — so re-running
    //    the wizard (or typing an item that already exists) never creates a duplicate item/variable.
    const norm = (s: string) => s.trim().toLowerCase();
    const byName = (name: string) => Object.values(project.items || {}).find(it => norm(it.name) === norm(name));
    const refs: BuiltItemRef[] = result.items.map(spec => {
        const it = (spec.itemId && project.items?.[spec.itemId]) ? project.items[spec.itemId] : byName(spec.name);
        if (it) {
            return {
                itemId: it.id, name: it.name, countVariableId: it.countVariableId,
                iconAssetId: it.icon?.id ?? null, price: spec.price ?? it.price,
                unique: it.unique, usable: it.usable, useEffect: it.useEffect,
            };
        }
        const itemId = gid('item');
        const countVariableId = gid('var');
        dispatch({
            type: 'ADD_ITEM',
            payload: {
                id: itemId, countVariableId, name: spec.name,
                icon: spec.iconAssetId ? { type: 'image', id: spec.iconAssetId } : null,
                price: spec.price, usable: spec.usable, unique: spec.unique, scope: 'global',
            },
        });
        return { itemId, name: spec.name, countVariableId, iconAssetId: spec.iconAssetId ?? null, price: spec.price, unique: spec.unique, usable: spec.usable };
    });

    // 2. Shop: currency variable + a real collection (currency + per-item price/stock entries).
    let currencyVarId = result.currency?.variableId;
    let shopCollectionId: VNID | undefined;
    if (result.kind === 'shop' && result.currency) {
        if (!currencyVarId || !project.variables[currencyVarId]) {
            // Reuse an existing number variable with the same name (e.g. "Gold") rather than minting
            // a duplicate currency each run; only create one if none matches.
            const existingCur = (Object.values(project.variables) as any[]).find(v => v.type === 'number' && !v.isInternal && norm(v.name) === norm(result.currency!.name));
            if (existingCur) {
                currencyVarId = existingCur.id;
            } else {
                currencyVarId = gid('var');
                dispatch({ type: 'ADD_VARIABLE', payload: { id: currencyVarId, name: result.currency.name, type: 'number', defaultValue: result.currency.startAmount, scope: 'global' } });
            }
        }
        shopCollectionId = gid('coll');
        dispatch({ type: 'ADD_ITEM_COLLECTION', payload: { id: shopCollectionId, name: result.screenName } });
        dispatch({ type: 'UPDATE_ITEM_COLLECTION', payload: { collectionId: shopCollectionId, updates: { currencyVariableId: currencyVarId, sellMultiplier: 0.5 } } });
        refs.forEach(r => {
            // Generated shops default to infinite stock (no "sold out" surprise); author can switch to finite + restock.
            dispatch({ type: 'ADD_COLLECTION_ENTRY', payload: { collectionId: shopCollectionId, itemId: r.itemId, startQty: 0, scope: 'global' } });
            dispatch({ type: 'UPDATE_COLLECTION_ENTRY', payload: { collectionId: shopCollectionId, itemId: r.itemId, updates: { price: r.price ?? 0, infiniteStock: true } } });
        });
    }

    // 3. Surfaces. Shops are always a (modal) screen; inventory can be screen / HUD / both.
    const output: 'screen' | 'hud' | 'both' = result.kind === 'shop' ? 'screen' : (result.inventoryOutput || 'screen');
    let mainScreenId: VNID = '';

    // 3a. Dedicated screen: one bound (shop) / unbound (inventory) Inventory grid + a close button.
    if (output === 'screen' || output === 'both') {
        const screenId = gid('screen');
        mainScreenId = screenId;
        const anyUsable = refs.some(r => r.usable);
        const grid = createUIElement(UIElementType.Inventory, project) as UIInventoryGridElement;
        grid.name = result.kind === 'shop' ? 'Shop Grid' : 'Inventory Grid';
        grid.columns = result.columns || grid.columns || 4;
        if (result.backgroundColor) grid.backgroundColor = result.backgroundColor;
        if (result.kind === 'shop') {
            grid.collectionId = shopCollectionId;
            grid.slotButton = 'buy';
            grid.hideUnowned = false;
        } else {
            grid.slotButton = anyUsable ? 'use' : 'none';
            grid.hideUnowned = result.hideUnowned !== false;
        }
        const closeBtn = createUIElement(UIElementType.Button, project) as UIButtonElement;
        closeBtn.name = 'Close'; closeBtn.text = '✕';
        closeBtn.x = 94; closeBtn.y = 6; closeBtn.width = 7; closeBtn.height = 7; closeBtn.anchorX = 0.5; closeBtn.anchorY = 0.5;
        closeBtn.action = { type: UIActionType.ReturnToGame };
        closeBtn.actions = [{ type: UIActionType.ReturnToGame }];

        dispatch({ type: 'ADD_UI_SCREEN', payload: { id: screenId, name: result.screenName } });
        dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId, updates: { category: 'system', showDialogue: false, pauseSceneWhileOpen: true, backdropOpacity: 0.6 } } });
        dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: grid } });
        dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId, element: closeBtn } });
    }

    // 3b. Always-on quick-use HUD bar on the (pass-through) Game HUD screen.
    let hudScreenId = project.ui.gameHudScreenId;
    if (result.kind === 'inventory' && (output === 'hud' || output === 'both')) {
        if (!hudScreenId) {
            hudScreenId = gid('screen');
            dispatch({ type: 'ADD_UI_SCREEN', payload: { id: hudScreenId, name: 'Game HUD' } });
            dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId: hudScreenId, updates: { passThrough: true, showDialogue: false } } });
            dispatch({ type: 'UPDATE_UI_CONFIG', payload: { key: 'gameHudScreenId', value: hudScreenId } });
        }
        const hudEls = buildInventoryHudElements(project, { items: refs, corner: 'bottom' });
        hudEls.forEach(el => dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: hudScreenId, element: el } }));
    }

    // 4. Optional open-button on the HUD (only when a dedicated screen exists).
    if (result.addHudButton && mainScreenId && hudScreenId) {
        const btn: UIButtonElement = {
            id: gid('elem'), name: `Open ${result.screenName}`, type: UIElementType.Button,
            x: 88, y: 6, width: 18, height: 7, anchorX: 0.5, anchorY: 0.5,
            text: result.screenName, font: project.ui.choiceTextFont,
            action: { type: UIActionType.GoToScreen, targetScreenId: mainScreenId },
            actions: [{ type: UIActionType.GoToScreen, targetScreenId: mainScreenId }],
            image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null,
            backgroundColor: '#4D3273', hoverBackgroundColor: '#6B4C9A',
        };
        dispatch({ type: 'ADD_UI_ELEMENT', payload: { screenId: hudScreenId, element: btn } });
    }

    return { screenId: mainScreenId || hudScreenId || '' };
}
