import { VNID } from '../../types';
import { VNCondition, VNUIAction, VNTextAlign, VNVAlign } from '../../types/shared';

export interface VNFontSettings {
    family: string;
    size: number;
    color: string;
    weight: 'normal' | 'bold';
    italic: boolean;
}

export interface VNProjectUI {
    titleScreenId: VNID | null;
    settingsScreenId: VNID | null;
    saveScreenId: VNID | null;
    loadScreenId: VNID | null;
    pauseScreenId: VNID | null;
    gameHudScreenId: VNID | null;
    dialogueBoxImage: UIAsset | null;
    choiceButtonImage: UIAsset | null;
    dialogueNameFont: VNFontSettings;
    dialogueTextFont: VNFontSettings;
    choiceTextFont: VNFontSettings;
}

export type UIAsset = {
    type: 'image' | 'video';
    id: VNID;
}

export enum UIElementType {
    Button = 'Button',
    Text = 'Text',
    Image = 'Image',
    SaveSlotGrid = 'SaveSlotGrid',
    SettingsSlider = 'SettingsSlider',
    SettingsToggle = 'SettingsToggle',
    CharacterPreview = 'CharacterPreview',
}

interface BaseUIElement {
    id: VNID;
    name: string;
    type: UIElementType;
    x: number; y: number; width: number; height: number;
    anchorX: number; anchorY: number;
    conditions?: VNCondition[];
    disabledConditions?: VNCondition[];
}

export interface UIButtonElement extends BaseUIElement {
    type: UIElementType.Button;
    text: string;
    font: VNFontSettings;
    action: VNUIAction;
    image: UIAsset | null;
    hoverImage: UIAsset | null;
    clickSoundId: VNID | null;
    hoverSoundId: VNID | null;
}

export interface UITextElement extends BaseUIElement {
    type: UIElementType.Text;
    text: string;
    font: VNFontSettings;
    textAlign: VNTextAlign;
    verticalAlign: VNVAlign;
}
export interface UIImageElement extends BaseUIElement {
    type: UIElementType.Image;
    image: UIAsset | null;
    objectFit?: 'contain' | 'cover' | 'fill'; // How the image/video should fit in the element
}
export interface UISaveSlotGridElement extends BaseUIElement {
    type: UIElementType.SaveSlotGrid;
    slotCount: number;
    font: VNFontSettings;
    emptySlotText: string;
}
export type GameSetting = 'musicVolume' | 'sfxVolume' | 'textSpeed';
export interface UISettingsSliderElement extends BaseUIElement {
    type: UIElementType.SettingsSlider;
    setting: GameSetting;
    thumbColor?: string;
    trackColor?: string;
    thumbImage?: UIAsset | null;
    trackImage?: UIAsset | null;
}
export type GameToggleSetting = 'enableSkip';
export interface UISettingsToggleElement extends BaseUIElement {
    type: UIElementType.SettingsToggle;
    setting: GameToggleSetting;
    text: string;
    font: VNFontSettings;
    checkedImage?: UIAsset | null;
    uncheckedImage?: UIAsset | null;
    checkboxColor?: string;
}
export interface UICharacterPreviewElement extends BaseUIElement {
    type: UIElementType.CharacterPreview;
    characterId: VNID;
    expressionId?: VNID; // Default expression to show (for layers without variable mappings)
    layerVariableMap: Record<VNID, VNID>; // layerId -> variableId
}

export type VNUIElement = 
    | UIButtonElement | UITextElement | UIImageElement | UISaveSlotGridElement
    | UISettingsSliderElement | UISettingsToggleElement | UICharacterPreviewElement;

export interface VNUIScreen {
    id: VNID;
    name:string;
    background: { type: 'color', value: string } | { type: 'image' | 'video', assetId: VNID | null };
    music: { audioId: VNID | null, policy: 'continue' | 'stop' };
    ambientNoise: { audioId: VNID | null, policy: 'continue' | 'stop' };
    elements: Record<VNID, VNUIElement>;
}
