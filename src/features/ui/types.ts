import { VNID } from '../../types';
import type { VNScreenOverlayEffect } from '../../types';
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
    TextInput = 'TextInput',
    Dropdown = 'Dropdown',
    Checkbox = 'Checkbox',
    AssetCycler = 'AssetCycler',
}

interface BaseUIElement {
    id: VNID;
    name: string;
    type: UIElementType;
    x: number; y: number; width: number; height: number;
    anchorX: number; anchorY: number;
    conditions?: VNCondition[];
    disabledConditions?: VNCondition[];
    // Element-level transitions
    transitionIn?: 'none' | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'scale';
    transitionDuration?: number; // Duration in milliseconds (default 300)
    transitionDelay?: number; // Delay before starting transition in milliseconds (default 0)
}

export interface UIButtonElement extends BaseUIElement {
    type: UIElementType.Button;
    text: string;
    font: VNFontSettings;
    action: VNUIAction;
    actions?: VNUIAction[]; // Multiple actions support
    image: UIAsset | null;
    hoverImage: UIAsset | null;
    clickSoundId: VNID | null;
    hoverSoundId: VNID | null;
    backgroundColor?: string; // Background color when no image is set
    hoverBackgroundColor?: string; // Background color on hover when no image is set
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
    background?: { type: 'image' | 'video', assetId: VNID } | { type: 'color', value: string }; // Image/video from assets or solid color
    image: UIAsset | null; // Deprecated, kept for backward compatibility
    objectFit?: 'contain' | 'cover' | 'fill'; // How the image/video should fit in the element
}
export interface UISaveSlotGridElement extends BaseUIElement {
    type: UIElementType.SaveSlotGrid;
    slotCount: number;
    font: VNFontSettings;
    emptySlotText: string;
    slotBackgroundColor?: string;
    slotBorderColor?: string;
    slotHoverBorderColor?: string;
    slotHeaderColor?: string;
}
export type GameSetting = 'musicVolume' | 'sfxVolume' | 'textSpeed';
export interface UISettingsSliderElement extends BaseUIElement {
    type: UIElementType.SettingsSlider;
    setting: GameSetting;
    thumbColor?: string;
    trackColor?: string;
    thumbImage?: UIAsset | null;
    trackImage?: UIAsset | null;
    // Variable control
    variableId?: VNID; // Optional: control a variable instead of/in addition to a setting
    minValue?: number;
    maxValue?: number;
    actions?: VNUIAction[]; // Multiple actions on value change
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
    // Variable control
    variableId?: VNID; // Optional: control a variable instead of/in addition to a setting
    checkedValue?: string | number | boolean; // Value when checked
    uncheckedValue?: string | number | boolean; // Value when unchecked
    actions?: VNUIAction[]; // Multiple actions on toggle
}
export interface UICharacterPreviewElement extends BaseUIElement {
    type: UIElementType.CharacterPreview;
    characterId: VNID;
    expressionId?: VNID; // Default expression to show (for layers without variable mappings)
    layerVariableMap: Record<VNID, VNID>; // layerId -> variableId
}

export interface UITextInputElement extends BaseUIElement {
    type: UIElementType.TextInput;
    placeholder: string;
    variableId: VNID; // Variable to set with the input value
    font: VNFontSettings;
    backgroundColor?: string;
    borderColor?: string;
    maxLength?: number;
}

export interface DropdownOption {
    id: VNID;
    label: string; // Display text
    value: string | number | boolean; // Actual value to set in variable
}

export interface UIDropdownElement extends BaseUIElement {
    type: UIElementType.Dropdown;
    variableId: VNID; // Variable to set with the selected value
    options: DropdownOption[]; // List of options
    font: VNFontSettings;
    backgroundColor?: string;
    borderColor?: string;
    hoverColor?: string;
    actions?: VNUIAction[]; // Multiple actions on selection change
}

export interface UICheckboxElement extends BaseUIElement {
    type: UIElementType.Checkbox;
    label: string; // Text label next to checkbox
    variableId: VNID; // Variable to modify
    checkedValue: string | number | boolean; // Value when checked
    uncheckedValue: string | number | boolean; // Value when unchecked
    font: VNFontSettings;
    checkboxColor?: string; // Color of the checkbox when checked
    labelColor?: string; // Color of the label text
    actions?: VNUIAction[]; // Multiple actions on toggle
}

export interface UIAssetCyclerElement extends BaseUIElement {
    type: UIElementType.AssetCycler;
    characterId: VNID; // Which character to pull assets from
    layerId: VNID; // Which layer to cycle assets for
    variableId: VNID; // Variable to store the selected asset ID
    assetIds: VNID[]; // List of asset IDs to cycle through
    label?: string; // Optional label to show above the cycler (e.g., "Hair Color")
    font: VNFontSettings; // Font for label and current asset name
    showAssetName?: boolean; // Whether to show the asset name in the middle
    arrowColor?: string; // Color of arrow buttons
    arrowSize?: number; // Size of arrows in pixels
    backgroundColor?: string; // Background color of the cycler
    visible?: boolean; // Whether the cycler is visible (defaults to true)
    filterPattern?: string; // Pattern to filter assets (e.g., "{body_type}_{skin_tone}" supports multiple variables)
    filterVariableId?: VNID; // DEPRECATED: Use filterVariableIds instead
    filterVariableIds?: VNID[]; // Array of variables to use for filtering (pattern uses {varId} placeholder syntax)
}

export type VNUIElement = 
    | UIButtonElement | UITextElement | UIImageElement | UISaveSlotGridElement
    | UISettingsSliderElement | UISettingsToggleElement | UICharacterPreviewElement | UITextInputElement | UIDropdownElement | UICheckboxElement | UIAssetCyclerElement;

export interface VNUIScreen {
    id: VNID;
    name:string;
    background: { type: 'color', value: string } | { type: 'image' | 'video', assetId: VNID | null };
    music: { audioId: VNID | null, policy: 'continue' | 'stop' };
    ambientNoise: { audioId: VNID | null, policy: 'continue' | 'stop' };
    elements: Record<VNID, VNUIElement>;
    effects?: VNScreenOverlayEffect[];
    transitionIn?: 'none' | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight';
    transitionOut?: 'none' | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight';
    transitionDuration?: number; // Duration in milliseconds (default 300)
    showDialogue?: boolean; // Whether to show the dialogue box on this screen
}
