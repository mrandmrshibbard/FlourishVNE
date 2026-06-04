/**
 * applySystemWizardResult — turns a Shop/Inventory wizard result into project
 * mutations using only existing reducer actions (ADD_ITEM / ADD_VARIABLE /
 * ADD_UI_SCREEN / UPDATE_UI_SCREEN / ADD_UI_ELEMENT). IDs are generated up front
 * so the built screen can reference freshly-created items without reading
 * post-dispatch state.
 */
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { UIActionType } from '../../types/shared';
import { UIElementType, UIButtonElement } from '../ui/types';
import {
    buildShopScreen, buildInventoryScreen, buildInventoryHudElements, BuiltItemRef, InteractionMode,
} from './systemBuilder';

const gid = (p: string) => `${p}-${Math.random().toString(36).substring(2, 9)}`;

export interface WizardItemSpec {
    /** Reuse an existing registry item by id (its count variable + icon + price are read from the registry). */
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
    mode: InteractionMode;
    columns: number;
    boardImageAssetId?: VNID | null;
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
    // 1. Resolve / create items → BuiltItemRef list (with stable countVariableIds).
    const refs: BuiltItemRef[] = result.items.map(spec => {
        if (spec.itemId && project.items?.[spec.itemId]) {
            const it = project.items[spec.itemId];
            return {
                name: it.name, countVariableId: it.countVariableId,
                iconAssetId: it.icon?.id ?? null, price: spec.price ?? it.price,
                unique: it.unique, usable: it.usable, useEffect: it.useEffect,
            };
        }
        // New registry item — generate ids so the screen can reference them now.
        const itemId = gid('item');
        const countVariableId = gid('var');
        dispatch({
            type: 'ADD_ITEM',
            payload: {
                id: itemId, countVariableId, name: spec.name,
                icon: spec.iconAssetId ? { type: 'image', id: spec.iconAssetId } : null,
                price: spec.price, usable: spec.usable, unique: spec.unique,
                scope: 'global',
            },
        });
        return {
            name: spec.name, countVariableId, iconAssetId: spec.iconAssetId ?? null,
            price: spec.price, unique: spec.unique, usable: spec.usable,
        };
    });

    // 2. Shop currency variable.
    let currencyVarId = result.currency?.variableId;
    if (result.kind === 'shop' && result.currency) {
        if (!currencyVarId || !project.variables[currencyVarId]) {
            currencyVarId = gid('var');
            dispatch({
                type: 'ADD_VARIABLE',
                payload: { id: currencyVarId, name: result.currency.name, type: 'number', defaultValue: result.currency.startAmount, scope: 'global' },
            });
        }
    }

    // 3. Decide what surfaces to build. Shops are always a (modal) screen; inventory
    //    can be a full screen, an always-on HUD bar, or both.
    const output: 'screen' | 'hud' | 'both' = result.kind === 'shop' ? 'screen' : (result.inventoryOutput || 'screen');
    let mainScreenId: VNID = '';

    // 3a. Build the dedicated screen (shop, or full inventory screen).
    if (output === 'screen' || output === 'both') {
        const screenId = gid('screen');
        mainScreenId = screenId;
        const builtScreen = result.kind === 'shop'
            ? buildShopScreen(project, {
                screenId, screenName: result.screenName, backgroundColor: result.backgroundColor,
                mode: result.mode, columns: result.columns,
                currency: { variableId: currencyVarId!, name: result.currency!.name, icon: result.currency!.icon },
                items: refs, boardImageAssetId: result.boardImageAssetId,
            })
            : buildInventoryScreen(project, {
                screenId, screenName: result.screenName, backgroundColor: result.backgroundColor,
                mode: result.mode, columns: result.columns, items: refs,
                boardImageAssetId: result.boardImageAssetId, hideUnowned: result.hideUnowned,
            });
        dispatch({ type: 'ADD_UI_SCREEN', payload: { id: screenId, name: result.screenName } });
        dispatch({
            type: 'UPDATE_UI_SCREEN',
            payload: {
                screenId,
                updates: {
                    background: builtScreen.background,
                    elements: builtScreen.elements,
                    showDialogue: false,
                    transitionIn: builtScreen.transitionIn,
                    transitionOut: builtScreen.transitionOut,
                    transitionDuration: builtScreen.transitionDuration,
                },
            },
        });
    }

    // 3b. Build the always-on quick-use HUD bar on the (pass-through) Game HUD screen.
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

    // 4. Optional open-button on the HUD (only meaningful when a dedicated screen exists).
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
