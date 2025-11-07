import { VNProject } from './types/project';
import { VNID } from './types';
import { VNScene, CommandType } from './features/scene/types';
// FIX: UIActionType is exported from shared types.
import { VNProjectUI, VNUIScreen, UIElementType, UISettingsSliderElement, UISettingsToggleElement, VNUIElement, UIButtonElement, UISaveSlotGridElement, UITextElement } from './features/ui/types';
import { UIActionType } from './types/shared';

const generateId = (prefix: string) => `${prefix}-${Math.random().toString(36).substring(2, 9)}`;

export const createDefaultUIScreens = (): { screens: Record<VNID, VNUIScreen>, specialIds: Omit<VNProjectUI, 'gameHudScreenId' | 'dialogueBoxImage' | 'choiceButtonImage' | 'dialogueNameFont' | 'dialogueTextFont' | 'choiceTextFont'> } => {
    const titleScreenId = generateId('screen');
    const saveScreenId = generateId('screen');
    const loadScreenId = generateId('screen');
    const settingsScreenId = generateId('screen');
    const pauseScreenId = generateId('screen');

    const defaultFont = { family: 'Poppins, sans-serif', size: 24, color: '#f0e6ff', weight: 'normal' as const, italic: false };
    const titleFont = { family: 'Poppins, sans-serif', size: 64, color: '#f0e6ff', weight: 'bold' as const, italic: false };
    const headerFont = { family: 'Poppins, sans-serif', size: 48, color: '#f0e6ff', weight: 'bold' as const, italic: false };

    const titleScreenElements: Record<VNID, VNUIElement> = {};
    const titleTextId = generateId('el');
    titleScreenElements[titleTextId] = { id: titleTextId, name: 'Title Text', type: UIElementType.Text, text: 'My Visual Novel', x: 50, y: 30, width: 60, height: 15, anchorX: 0.5, anchorY: 0.5, font: titleFont, textAlign: 'center', verticalAlign: 'middle' } as UITextElement;
    const newGameBtnId = generateId('el');
    titleScreenElements[newGameBtnId] = { id: newGameBtnId, name: 'New Game Button', type: UIElementType.Button, text: 'New Game', x: 50, y: 55, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.StartNewGame }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const loadGameBtnId = generateId('el');
    titleScreenElements[loadGameBtnId] = { id: loadGameBtnId, name: 'Load Game Button', type: UIElementType.Button, text: 'Load Game', x: 50, y: 65, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: loadScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const settingsBtnId = generateId('el');
    titleScreenElements[settingsBtnId] = { id: settingsBtnId, name: 'Settings Button', type: UIElementType.Button, text: 'Settings', x: 50, y: 75, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: settingsScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };

    const saveScreenElements: Record<VNID, VNUIElement> = {};
    const saveHeaderId = generateId('el');
    saveScreenElements[saveHeaderId] = { id: saveHeaderId, name: 'Header', type: UIElementType.Text, text: 'Save Game', x: 50, y: 10, width: 60, height: 10, anchorX: 0.5, anchorY: 0.5, font: headerFont, textAlign: 'center', verticalAlign: 'middle' } as UITextElement;
    const saveGridId = generateId('el');
    saveScreenElements[saveGridId] = { id: saveGridId, name: 'Save Slots', type: UIElementType.SaveSlotGrid, slotCount: 8, font: defaultFont, emptySlotText: '[ Empty Slot ]', x: 50, y: 50, width: 80, height: 65, anchorX: 0.5, anchorY: 0.5 } as UISaveSlotGridElement;
    const saveBackBtnId = generateId('el');
    saveScreenElements[saveBackBtnId] = { id: saveBackBtnId, name: 'Back Button', type: UIElementType.Button, text: 'Back', x: 50, y: 90, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.ReturnToPreviousScreen }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };


    const loadScreenElements: Record<VNID, VNUIElement> = {};
    const loadHeaderId = generateId('el');
    loadScreenElements[loadHeaderId] = { id: loadHeaderId, name: 'Header', type: UIElementType.Text, text: 'Load Game', x: 50, y: 10, width: 60, height: 10, anchorX: 0.5, anchorY: 0.5, font: headerFont, textAlign: 'center', verticalAlign: 'middle' } as UITextElement;
    const loadGridId = generateId('el');
    loadScreenElements[loadGridId] = { id: loadGridId, name: 'Load Slots', type: UIElementType.SaveSlotGrid, slotCount: 8, font: defaultFont, emptySlotText: '[ Empty Slot ]', x: 50, y: 50, width: 80, height: 65, anchorX: 0.5, anchorY: 0.5 } as UISaveSlotGridElement;
    const loadBackBtnId = generateId('el');
    loadScreenElements[loadBackBtnId] = { id: loadBackBtnId, name: 'Back Button', type: UIElementType.Button, text: 'Back', x: 50, y: 90, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.ReturnToPreviousScreen }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };


    const settingsScreenElements: Record<VNID, VNUIElement> = {};
    const settingsHeaderId = generateId('el');
    settingsScreenElements[settingsHeaderId] = { id: settingsHeaderId, name: 'Header', type: UIElementType.Text, text: 'Settings', x: 50, y: 10, width: 60, height: 10, anchorX: 0.5, anchorY: 0.5, font: headerFont, textAlign: 'center', verticalAlign: 'middle' } as UITextElement;
    const musicLabelId = generateId('el');
    settingsScreenElements[musicLabelId] = { id: musicLabelId, name: 'Music Volume Label', type: UIElementType.Text, text: 'Music Volume', x: 35, y: 30, width: 20, height: 5, anchorX: 0.5, anchorY: 0.5, font: defaultFont, textAlign: 'left', verticalAlign: 'middle' } as UITextElement;
    const musicSliderId = generateId('el');
    settingsScreenElements[musicSliderId] = { id: musicSliderId, name: 'Music Volume Slider', type: UIElementType.SettingsSlider, setting: 'musicVolume', x: 65, y: 30, width: 40, height: 5, anchorX: 0.5, anchorY: 0.5} as UISettingsSliderElement;
    const sfxLabelId = generateId('el');
    settingsScreenElements[sfxLabelId] = { id: sfxLabelId, name: 'SFX Volume Label', type: UIElementType.Text, text: 'Sound FX Volume', x: 35, y: 40, width: 20, height: 5, anchorX: 0.5, anchorY: 0.5, font: defaultFont, textAlign: 'left', verticalAlign: 'middle' } as UITextElement;
    const sfxSliderId = generateId('el');
    settingsScreenElements[sfxSliderId] = { id: sfxSliderId, name: 'SFX Volume Slider', type: UIElementType.SettingsSlider, setting: 'sfxVolume', x: 65, y: 40, width: 40, height: 5, anchorX: 0.5, anchorY: 0.5} as UISettingsSliderElement;
    const textSpeedLabelId = generateId('el');
    settingsScreenElements[textSpeedLabelId] = { id: textSpeedLabelId, name: 'Text Speed Label', type: UIElementType.Text, text: 'Text Speed', x: 35, y: 50, width: 20, height: 5, anchorX: 0.5, anchorY: 0.5, font: defaultFont, textAlign: 'left', verticalAlign: 'middle' } as UITextElement;
    const textSpeedSliderId = generateId('el');
    settingsScreenElements[textSpeedSliderId] = { id: textSpeedSliderId, name: 'Text Speed Slider', type: UIElementType.SettingsSlider, setting: 'textSpeed', x: 65, y: 50, width: 40, height: 5, anchorX: 0.5, anchorY: 0.5 } as UISettingsSliderElement;
    const skipToggleId = generateId('el');
    settingsScreenElements[skipToggleId] = { id: skipToggleId, name: 'Enable Skip Toggle', type: UIElementType.SettingsToggle, setting: 'enableSkip', text: "Enable Skip", x: 50, y: 60, width: 30, height: 5, anchorX: 0.5, anchorY: 0.5, font: defaultFont } as UISettingsToggleElement;
    const backBtnId = generateId('el');
    settingsScreenElements[backBtnId] = { id: backBtnId, name: 'Back Button', type: UIElementType.Button, text: 'Back', x: 50, y: 85, width: 20, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.ReturnToPreviousScreen }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };

    const pauseScreenElements: Record<VNID, VNUIElement> = {};
    const returnBtnId = generateId('el');
    pauseScreenElements[returnBtnId] = { id: returnBtnId, name: 'Return Button', type: UIElementType.Button, text: 'Return to Game', x: 50, y: 30, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.ReturnToGame }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const pauseSaveBtnId = generateId('el');
    pauseScreenElements[pauseSaveBtnId] = { id: pauseSaveBtnId, name: 'Save Game Button', type: UIElementType.Button, text: 'Save Game', x: 50, y: 40, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: saveScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const pauseLoadBtnId = generateId('el');
    pauseScreenElements[pauseLoadBtnId] = { id: pauseLoadBtnId, name: 'Load Game Button', type: UIElementType.Button, text: 'Load Game', x: 50, y: 50, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: loadScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const pauseSettingsBtnId = generateId('el');
    pauseScreenElements[pauseSettingsBtnId] = { id: pauseSettingsBtnId, name: 'Settings Button', type: UIElementType.Button, text: 'Settings', x: 50, y: 60, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.GoToScreen, targetScreenId: settingsScreenId }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };
    const pauseQuitBtnId = generateId('el');
    pauseScreenElements[pauseQuitBtnId] = { id: pauseQuitBtnId, name: 'Quit Button', type: UIElementType.Button, text: 'Quit to Title', x: 50, y: 70, width: 30, height: 8, anchorX: 0.5, anchorY: 0.5, font: defaultFont, action: { type: UIActionType.QuitToTitle }, image: null, hoverImage: null, clickSoundId: null, hoverSoundId: null };


    const screens: Record<VNID, VNUIScreen> = {
        [titleScreenId]: {
            id: titleScreenId, name: 'Title Screen', background: { type: 'color', value: '#1a102c' }, music: { audioId: null, policy: 'continue'}, ambientNoise: { audioId: null, policy: 'continue' },
            elements: titleScreenElements,
        },
        [saveScreenId]: { id: saveScreenId, name: 'Save Screen', background: { type: 'color', value: '#1a102c' }, music: { audioId: null, policy: 'continue' }, ambientNoise: { audioId: null, policy: 'continue' }, elements: saveScreenElements },
        [loadScreenId]: { id: loadScreenId, name: 'Load Screen', background: { type: 'color', value: '#1a102c' }, music: { audioId: null, policy: 'continue' }, ambientNoise: { audioId: null, policy: 'continue' }, elements: loadScreenElements },
        [settingsScreenId]: {
            id: settingsScreenId, name: 'Settings Screen', background: { type: 'color', value: '#1a102c' }, music: { audioId: null, policy: 'continue' }, ambientNoise: { audioId: null, policy: 'continue' },
            elements: settingsScreenElements,
        },
        [pauseScreenId]: {
            id: pauseScreenId, name: 'Pause Menu', background: { type: 'color', value: '#1a102c' }, music: { audioId: null, policy: 'continue' }, ambientNoise: { audioId: null, policy: 'continue' },
            elements: pauseScreenElements,
        }
    };

    const specialIds = { titleScreenId, saveScreenId, loadScreenId, settingsScreenId, pauseScreenId };
    
    return { screens, specialIds };
};

export const createInitialProject = (): VNProject => {
    const initialSceneId = 'scene-start';
    const initialScene: VNScene = {
        id: initialSceneId,
        name: 'Start Scene',
        commands: [
            { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'Welcome, storyteller. Your journey begins here.' },
            { id: 'cmd-2', type: CommandType.Dialogue, characterId: null, text: 'You can edit this scene in the Scene Editor, or create new scenes, characters, and menus in the Project Resources panel.' },
            { id: 'cmd-3', type: CommandType.Dialogue, characterId: null, text: 'Variables can be referenced in text using {variableName} or {variableId} syntax.' },
            { id: 'cmd-4', type: CommandType.Dialogue, characterId: null, text: 'For example, the demo variable contains: {Demo Variable}' },
        ],
    };

    const { screens, specialIds } = createDefaultUIScreens();

    return {
        id: `proj-${Date.now()}`,
        title: 'New Visual Novel',
        startSceneId: initialSceneId,
        scenes: { [initialSceneId]: initialScene },
        characters: {},
        backgrounds: {},
        images: {},
        audio: {},
        videos: {},
        variables: {},
        ui: {
            ...specialIds,
            gameHudScreenId: null,
            dialogueBoxImage: null,
            choiceButtonImage: null,
            dialogueNameFont: { family: 'Poppins, sans-serif', size: 22, color: '#FFFFFF', weight: 'bold', italic: false },
            dialogueTextFont: { family: 'Poppins, sans-serif', size: 20, color: '#FFFFFF', weight: 'normal', italic: false },
            choiceTextFont: { family: 'Poppins, sans-serif', size: 18, color: '#FFFFFF', weight: 'normal', italic: false },
        },
        uiScreens: screens,
    };
};
