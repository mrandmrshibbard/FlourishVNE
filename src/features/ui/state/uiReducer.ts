import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
// FIX: GoToScreenAction and UIActionType are exported from shared types.
import { VNFontSettings, VNProjectUI, VNUIScreen, VNUIElement, UIElementType, UIButtonElement } from '../types';
import { GoToScreenAction, UIActionType } from '../../../types/shared';
import { createDefaultUIScreens } from '../../../constants';

const generateId = () => Math.random().toString(36).substring(2, 9);

export type UIAction =
    | { type: 'UPDATE_UI'; payload: Partial<VNProjectUI> }
    | { type: 'UPDATE_UI_CONFIG'; payload: { key: keyof VNProjectUI, value: string | null } }
    | { type: 'UPDATE_UI_FONT_CONFIG'; payload: {
          target: 'dialogueNameFont' | 'dialogueTextFont' | 'choiceTextFont';
          property: keyof VNFontSettings;
          value: string | number | boolean;
      } }
    | { type: 'ADD_UI_SCREEN', payload: { name: string; id?: VNID } }
    | { type: 'UPDATE_UI_SCREEN', payload: { screenId: VNID, updates: Partial<VNUIScreen> } }
    | { type: 'DELETE_UI_SCREEN', payload: { screenId: VNID } }
    | { type: 'DUPLICATE_UI_SCREEN', payload: { screenId: VNID } }
    | { type: 'ADD_UI_ELEMENT', payload: { screenId: VNID, element: VNUIElement } }
    | { type: 'UPDATE_UI_ELEMENT', payload: { screenId: VNID, elementId: VNID, updates: Partial<VNUIElement> } }
    | { type: 'DELETE_UI_ELEMENT', payload: { screenId: VNID, elementId: VNID } }
    | { type: 'RESTORE_DEFAULT_UI_SCREENS' };


export const uiReducer = (state: VNProject, action: UIAction): VNProject => {
  switch (action.type) {
    case 'UPDATE_UI': {
        return {
            ...state,
            ui: {
                ...state.ui,
                ...action.payload,
            }
        };
    }
    
    case 'UPDATE_UI_CONFIG': {
        const { key, value } = action.payload;
        return {
            ...state,
            ui: {
                ...state.ui,
                [key]: value,
            }
        };
    }
    
    case 'UPDATE_UI_FONT_CONFIG': {
        const { target, property, value } = action.payload;
        return {
            ...state,
            ui: {
                ...state.ui,
                [target]: {
                    ...state.ui[target],
                    [property]: value,
                }
            }
        };
    }

    case 'RESTORE_DEFAULT_UI_SCREENS': {
        const { screens: defaultScreens, specialIds } = createDefaultUIScreens();
        return {
            ...state,
            uiScreens: {
                ...state.uiScreens,
                ...defaultScreens,
            },
            ui: {
                ...state.ui,
                titleScreenId: specialIds.titleScreenId,
                settingsScreenId: specialIds.settingsScreenId,
                saveScreenId: specialIds.saveScreenId,
                loadScreenId: specialIds.loadScreenId,
                pauseScreenId: specialIds.pauseScreenId,
            },
        };
    }

    case 'ADD_UI_SCREEN': {
        const { name, id } = action.payload;
        const newId = id || `screen-${generateId()}`;
        const newScreen: VNUIScreen = { 
            id: newId, 
            name, 
            background: { type: 'color', value: '#0f172a' }, 
            music: { audioId: null, policy: 'continue' },
            ambientNoise: { audioId: null, policy: 'continue' },
            elements: {} 
        };
        return { ...state, uiScreens: { ...state.uiScreens, [newId]: newScreen }};
    }

    case 'UPDATE_UI_SCREEN': {
        const { screenId, updates } = action.payload;
        const screen = state.uiScreens[screenId];
        if (!screen) return state;
        return { ...state, uiScreens: { ...state.uiScreens, [screenId]: { ...screen, ...updates } } };
    }

    case 'DELETE_UI_SCREEN': {
        const { screenId } = action.payload;
        
        const specialScreenIds = [
            state.ui.titleScreenId,
            state.ui.settingsScreenId,
            state.ui.saveScreenId,
            state.ui.loadScreenId,
            state.ui.pauseScreenId,
        ];
        if (specialScreenIds.includes(screenId)) {
            console.warn(`Attempted to delete a special UI screen (${screenId}), which is not allowed.`);
            return state;
        }

        const { [screenId]: _, ...remainingScreens } = state.uiScreens;
        
        const newUiConfig = { ...state.ui };
        let uiConfigChanged = false;

        // Nullify references to the deleted screen in the main UI config
        if (state.ui.titleScreenId === screenId) { newUiConfig.titleScreenId = null; uiConfigChanged = true; }
        if (state.ui.settingsScreenId === screenId) { newUiConfig.settingsScreenId = null; uiConfigChanged = true; }
        if (state.ui.saveScreenId === screenId) { newUiConfig.saveScreenId = null; uiConfigChanged = true; }
        if (state.ui.loadScreenId === screenId) { newUiConfig.loadScreenId = null; uiConfigChanged = true; }

        // Clean up any GoToScreen actions in other screens pointing to the deleted screen
        const cleanedScreens = Object.keys(remainingScreens).reduce((acc, sId) => {
            const screen = remainingScreens[sId];
            let screenModified = false;
            const newElements = Object.keys(screen.elements).reduce((elAcc, elId) => {
                const element = screen.elements[elId];
                if (element.type === UIElementType.Button) {
                    const buttonAction = (element as UIButtonElement).action;
                    if (buttonAction.type === UIActionType.GoToScreen && (buttonAction as GoToScreenAction).targetScreenId === screenId) {
                        elAcc[elId] = { ...element, action: { type: UIActionType.None } };
                        screenModified = true;
                    } else {
                        elAcc[elId] = element;
                    }
                } else {
                    elAcc[elId] = element;
                }
                return elAcc;
            }, {} as Record<VNID, VNUIElement>);

            if (screenModified) {
                acc[sId] = { ...screen, elements: newElements };
            } else {
                acc[sId] = screen;
            }
            return acc;
        }, {} as Record<VNID, VNUIScreen>);
        
        return { 
            ...state, 
            uiScreens: cleanedScreens,
            ...(uiConfigChanged && { ui: newUiConfig }),
        };
    }
      
    case 'DUPLICATE_UI_SCREEN': {
        const { screenId } = action.payload;
        console.log('[DUPLICATE_UI_SCREEN] Duplicating screen:', screenId);
        const originalScreen = state.uiScreens[screenId];
        if (!originalScreen) {
            console.error('[DUPLICATE_UI_SCREEN] Screen not found:', screenId);
            return state;
        }

        const newScreenId = `screen-${generateId()}`;
        const newScreen: VNUIScreen = JSON.parse(JSON.stringify(originalScreen));

        newScreen.id = newScreenId;
        newScreen.name = `Copy of ${originalScreen.name}`;

        const newElements: Record<VNID, VNUIElement> = {};
        for (const element of Object.values(originalScreen.elements)) {
            const newElementId = `elem-${generateId()}`;
            newElements[newElementId] = { ...element, id: newElementId };
        }
        newScreen.elements = newElements;
        
        console.log('[DUPLICATE_UI_SCREEN] Created new screen:', newScreenId, 'with name:', newScreen.name);
        
        return {
            ...state,
            uiScreens: {
                ...state.uiScreens,
                [newScreenId]: newScreen,
            }
        };
    }

    case 'ADD_UI_ELEMENT': {
        const { screenId, element } = action.payload;
        const screen = state.uiScreens[screenId];
        if (!screen) return state;
        const newElements = { ...screen.elements, [element.id]: element };
        return { ...state, uiScreens: { ...state.uiScreens, [screenId]: { ...screen, elements: newElements } } };
    }

    case 'UPDATE_UI_ELEMENT': {
        const { screenId, elementId, updates } = action.payload;
        const screen = state.uiScreens[screenId];
        const element = screen?.elements[elementId];
        if (!element) return state;
        const newElement = { ...element, ...updates } as VNUIElement;
        const newElements = { ...screen.elements, [elementId]: newElement };
        return { ...state, uiScreens: { ...state.uiScreens, [screenId]: { ...screen, elements: newElements } } };
    }

    case 'DELETE_UI_ELEMENT': {
        const { screenId, elementId } = action.payload;
        const screen = state.uiScreens[screenId];
        if (!screen) return state;
        const { [elementId]: _, ...remainingElements } = screen.elements;
        return { ...state, uiScreens: { ...state.uiScreens, [screenId]: { ...screen, elements: remainingElements } } };
    }
    
    default:
      return state;
  }
};
