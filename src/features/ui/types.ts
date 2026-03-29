import { VNID } from '../../types';
import type { VNScreenOverlayEffect } from '../../types';
import { VNCondition, VNConditionOperator, VNUIAction, VNTextAlign, VNVAlign } from '../../types/shared';

import { VNTextShadow, VNTextGradient, VNTextBorder, ImageMapRegion } from '../scene/types';

export interface VNFontSettings {
    family: string;
    size: number;
    color: string;
    weight: 'normal' | 'bold';
    italic: boolean;
    align?: 'left' | 'center' | 'right';
    letterSpacing?: number;
    textShadow?: VNTextShadow;
    textGradient?: VNTextGradient;
    textBorder?: VNTextBorder;
}

export interface VNDefaultGameSettings {
    textSpeed: number;
    musicVolume: number;
    sfxVolume: number;
    voiceVolume: number;
    ambientVolume: number;
    enableSkip: boolean;
    autoAdvance: boolean;
    autoAdvanceDelay: number;
}

export interface VNProjectUI {
    titleScreenId: VNID | null;
    settingsScreenId: VNID | null;
    saveScreenId: VNID | null;
    loadScreenId: VNID | null;
    pauseScreenId: VNID | null;
    gameHudScreenId: VNID | null;
    dialogueBoxImage: UIAsset | null;
    dialogueBoxBorderImage: UIAsset | null;
    dialogueBorderPadding?: number; // px of border visible around the background (default 12)
    dialogueBoxWidth?: number; // percentage 30-100 of screen width (default 100)
    dialogueBoxHeight?: number; // px explicit height, 0/undefined = auto (default auto)
    dialogueBoxBottomMargin?: number; // px from bottom of screen (default 20)
    dialogueBoxPadding?: number; // px inner content padding (default 20)
    dialogueBoxSizeMode?: 'stretch' | 'contain' | 'cover' | 'tile' | 'nine-slice'; // how the background image fits (default 'stretch')
    dialogueBoxSlice?: number; // for 9-slice mode: border-image-slice value in px (default 30)
    dialogueBoxColor?: string; // background color hex (default '#0f172a')
    dialogueBoxOpacity?: number; // 0-100, background opacity percentage (default 90)
    dialogueBoxBorderRadius?: number; // px corner radius (default 8)
    // Namebox (character name label)
    nameboxImage?: UIAsset | null; // optional image for the name label background
    nameboxColor?: string; // background color hex (default '#0f172a')
    nameboxOpacity?: number; // 0-100 background opacity (default 92)
    nameboxPadding?: number; // px inner padding (default 8)
    nameboxHorizontalPadding?: number; // px left/right padding (default 14)
    nameboxBorderRadius?: number; // px corner radius (default 6)
    nameboxOffsetX?: number; // px horizontal offset from dialogue box left (default 20)
    nameboxOffsetY?: number; // px gap above dialogue box, 0 = flush (default 0)
    nameboxSizeMode?: 'stretch' | 'contain' | 'cover' | 'nine-slice'; // how the namebox image fits (default 'stretch')
    choiceButtonImage: UIAsset | null;
    choiceButtonBorderImage: UIAsset | null;
    choiceBorderPadding?: number; // px of border visible around the background (default 8)
    choiceButtonWidth?: number; // px explicit width, 0/undefined = auto (default auto)
    choiceButtonHeight?: number; // px explicit height, 0/undefined = auto (default auto)
    choiceButtonPadding?: number; // px inner content padding (default 16)
    choiceButtonSizeMode?: 'stretch' | 'contain' | 'cover' | 'tile' | 'nine-slice'; // how the background image fits (default 'stretch')
    choiceButtonSlice?: number; // for 9-slice mode (default 15)
    choiceButtonColor?: string; // background color hex (default '#1e293b')
    choiceButtonOpacity?: number; // 0-100, background opacity (default 90)
    choiceButtonBorderRadius?: number; // px corner radius (default 8)
    choiceHoverImage?: UIAsset | null; // separate image for hover state
    choiceHoverColor?: string; // background color on hover (default '#334155')
    inputBoxImage: UIAsset | null;
    inputBoxBorderImage: UIAsset | null;
    inputBorderPadding?: number; // px of border visible around the background (default 8)
    inputBoxWidth?: number; // px explicit width, 0/undefined = auto (default auto, max-w-md)
    inputBoxPadding?: number; // px inner content padding (default 24)
    inputBoxSizeMode?: 'stretch' | 'contain' | 'cover' | 'tile' | 'nine-slice'; // how the background image fits (default 'stretch')
    inputBoxSlice?: number; // for 9-slice mode (default 20)
    inputBoxColor?: string; // background color hex (default '#0f172a')
    inputBoxOpacity?: number; // 0-100 background opacity (default 92)
    inputBoxBorderRadius?: number; // px corner radius (default 8)
    // Quick menu (skip/auto/log/back buttons)
    quickMenuPosition?: 'above-dialogue' | 'top-right' | 'bottom-right' | 'hidden'; // default 'above-dialogue'
    quickMenuColor?: string; // button background color hex (default '#0f172a')
    quickMenuOpacity?: number; // 0-100 button opacity (default 75)
    quickMenuBorderRadius?: number; // px button corner radius (default 4)
    // ─── Layout positions (percentages of game canvas) ─── //
    // Dialogue box position/size (percentages)
    dialogueBoxX?: number; // default: centre based on dialogueBoxWidth
    dialogueBoxY?: number; // default: bottom of screen minus margin
    // Namebox position relative & override
    nameboxX?: number; // percentage, undefined = auto (offset from dialogue)
    nameboxY?: number; // percentage, undefined = auto (above dialogue)
    nameboxWidth?: number; // percentage, undefined = auto-fit
    nameboxHeight?: number; // percentage, undefined = auto-fit
    // Choice button layout position
    choiceButtonX?: number; // percentage of canvas, default 50 (centred)
    choiceButtonY?: number; // percentage of canvas, default 40 (upper middle)
    // Input box layout position
    inputBoxX?: number; // percentage, default 50 (centred)
    inputBoxY?: number; // percentage, default 50 (centred)
    inputBoxHeight?: number; // px or percentage
    // Quick menu layout position
    quickMenuX?: number; // percentage, default derived from quickMenuPosition
    quickMenuY?: number; // percentage, default derived from quickMenuPosition
    quickMenuWidth?: number; // percentage
    quickMenuHeight?: number; // percentage
    // Text padding inside dialogue box (px, controls where typed text starts)
    dialogueTextPaddingTop?: number; // default 0
    dialogueTextPaddingBottom?: number; // default 0
    dialogueTextPaddingLeft?: number; // default 0
    dialogueTextPaddingRight?: number; // default 0
    inputPromptFont: VNFontSettings;
    inputFieldFont: VNFontSettings;
    inputSubmitFont: VNFontSettings;
    dialogueNameFont: VNFontSettings;
    dialogueTextFont: VNFontSettings;
    choiceTextFont: VNFontSettings;
    /** Author-defined initial game settings (text speed, volume, etc.) */
    defaultGameSettings?: VNDefaultGameSettings;

    // ─── Confirmation Dialogs ────────────────────────────────────────── //
    /** Settings for in-game confirmation popups (quit, new game, etc.) */
    confirmDialogs?: VNConfirmDialogSettings;
}

export interface VNConfirmDialogSettings {
    /** Quit / Exit confirmation */
    quitTitle?: string;          // default "Quit Game"
    quitMessage?: string;        // default "Are you sure you want to quit?"
    quitConfirmLabel?: string;   // default "Quit"
    quitCancelLabel?: string;    // default "Cancel"
    /** New Game confirmation (shown when a game is already in progress) */
    newGameTitle?: string;       // default "Start New Game"
    newGameMessage?: string;     // default "Any unsaved progress will be lost. Are you sure?"
    newGameConfirmLabel?: string;// default "New Game"
    newGameCancelLabel?: string; // default "Cancel"
    /** Visual styling */
    backgroundColor?: string;   // default '#0f172a'
    backgroundOpacity?: number;  // 0-100, default 92
    borderRadius?: number;       // px, default 12
    overlayColor?: string;       // backdrop colour, default 'rgba(0,0,0,0.75)'
    titleFont?: VNFontSettings;
    messageFont?: VNFontSettings;
    buttonFont?: VNFontSettings;
    confirmButtonColor?: string; // default gradient pink→purple
    cancelButtonColor?: string;  // default '#1e293b'
    backgroundImage?: UIAsset | null;
    backgroundSizeMode?: 'stretch' | 'contain' | 'cover' | 'nine-slice';
    backgroundSlice?: number;    // for nine-slice, default 20
    /** Border image (drawn around the dialog) */
    borderImage?: UIAsset | null;
    borderPadding?: number;      // px of border visible around the background (default 12)
    /** Dialog sizing */
    dialogWidth?: number;        // px explicit width, 0/undefined = auto (default auto, 320-440)
    dialogPadding?: number;      // px inner content padding (default 32)
    /** Button images & hover */
    confirmButtonImage?: UIAsset | null;
    cancelButtonImage?: UIAsset | null;
    confirmHoverImage?: UIAsset | null;
    cancelHoverImage?: UIAsset | null;
    confirmHoverColor?: string;  // hover color for confirm button
    cancelHoverColor?: string;   // hover color for cancel button (default '#334155')
    /** Button sizing */
    buttonPadding?: number;      // px inner padding (default 8 12)
    buttonBorderRadius?: number; // px corner radius (default borderRadius - 4)
    buttonSizeMode?: 'stretch' | 'contain' | 'cover' | 'nine-slice';
    buttonSlice?: number;        // for nine-slice on button images
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
    CGGallery = 'CGGallery',
}

interface BaseUIElement {
    id: VNID;
    name: string;
    type: UIElementType;
    x: number; y: number; width: number; height: number;
    anchorX: number; anchorY: number;
    opacity?: number; // 0-1, default 1 (fully opaque)
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

export interface UITextShadow {
    enabled: boolean;
    offsetX: number;
    offsetY: number;
    blur: number;
    color: string;
}

export interface UITextGradient {
    enabled: boolean;
    type: 'linear' | 'radial';
    angle: number;
    colors: string[];
}

export interface UITextElement extends BaseUIElement {
    type: UIElementType.Text;
    text: string;
    font: VNFontSettings;
    textAlign: VNTextAlign;
    verticalAlign: VNVAlign;
    /** @deprecated Use font.textShadow instead */
    textShadow?: VNTextShadow;
    /** @deprecated Use font.textGradient instead */
    textGradient?: VNTextGradient;
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
export type GameSetting = 'musicVolume' | 'sfxVolume' | 'voiceVolume' | 'ambientVolume' | 'textSpeed';
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

// Asset condition for the new simplified filtering system
// Instead of complex filter patterns, users define explicit rules:
// "When variable X = value AND variable Y = value, show this asset"
export interface AssetCondition {
    assetId: VNID; // The asset to show when conditions are met
    conditions: {
        variableId: VNID; // The variable to check
        value: string; // The value it must equal (asset ID from another cycler)
    }[];
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
    // NEW: Simple condition-based filtering (replaces filterPattern)
    assetConditions?: AssetCondition[]; // Define which assets to show based on other variable values
    // DEPRECATED: Old filter pattern system (kept for backwards compatibility)
    filterPattern?: string; // Pattern to filter assets (e.g., "{body_type}_{skin_tone}" supports multiple variables)
    filterVariableId?: VNID; // DEPRECATED: Use filterVariableIds instead
    filterVariableIds?: VNID[]; // Array of variables to use for filtering (pattern uses {varId} placeholder syntax)
}

export interface UICGGalleryElement extends BaseUIElement {
    type: UIElementType.CGGallery;
    /** Number of columns in the thumbnail grid */
    columns: number;
    /** Gap between thumbnails in pixels */
    gap: number;
    /** Background color for the gallery area */
    backgroundColor?: string;
    /** Border color for each thumbnail slot */
    thumbnailBorderColor?: string;
    /** Border radius for each thumbnail slot in pixels */
    thumbnailBorderRadius?: number;
    /** Whether to show entry names beneath thumbnails */
    showNames?: boolean;
    /** Font settings for entry names */
    nameFont?: VNFontSettings;
    /** Background color for locked entries */
    lockedColor?: string;
    /** Text to show on locked entries (e.g., "???", "🔒") */
    lockedText?: string;
    /** Filter by category (empty = show all) */
    categoryFilter?: string;
}

export type VNUIElement = 
    | UIButtonElement | UITextElement | UIImageElement | UISaveSlotGridElement
    | UISettingsSliderElement | UISettingsToggleElement | UICharacterPreviewElement | UITextInputElement | UIDropdownElement | UICheckboxElement | UIAssetCyclerElement | UICGGalleryElement;

export interface VNUIScreen {
    id: VNID;
    name:string;
    screenType?: 'standard' | 'hotzone'; // defaults to 'standard'
    background: { type: 'color', value: string } | { type: 'image' | 'video', assetId: VNID | null };
    music: { audioId: VNID | null, policy: 'continue' | 'stop', volume?: number };
    ambientNoise: { audioId: VNID | null, policy: 'continue' | 'stop', volume?: number };
    elements: Record<VNID, VNUIElement>;
    effects?: VNScreenOverlayEffect[];
    transitionIn?: 'none' | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'crossfade';
    transitionOut?: 'none' | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'crossfade';
    transitionDuration?: number; // Legacy fallback duration in milliseconds (default 300)
    transitionInDuration?: number; // Duration for transition-in in milliseconds (default 300)
    transitionOutDuration?: number; // Duration for transition-out in milliseconds (default 300)
    showDialogue?: boolean; // Whether to show the dialogue box on this screen
    // Hot Zone fields (only used when screenType === 'hotzone')
    hotSpots?: Record<VNID, VNHotSpot>;
    hotZoneElements?: Record<VNID, VNHotZoneElement>;
    winCondition?: VNHotZoneWinCondition;
}

// --- Hot Zone Types ---

export type HotSpotShape = 'rect' | 'circle';

export type HotSpotTrigger = 'click' | 'hover' | 'drag-drop';

export interface VNHotSpot {
    id: VNID;
    name: string;
    shape: HotSpotShape;
    x: number; // percentage
    y: number; // percentage
    width: number; // percentage
    height: number; // percentage
    trigger: HotSpotTrigger;
    acceptedElementIds?: VNID[]; // For drag-drop: which elements can be dropped here
    actions: VNUIAction[]; // Actions to run when triggered
    conditions?: VNCondition[]; // Only active when conditions are met
    highlightColor?: string; // Visual feedback color (debug/hover)
    visible?: boolean; // Whether to show the spot visually (default false)
}

export type HotZoneElementType = 'image' | 'text' | 'button' | 'video' | 'textInput' | 'imageMap';

export interface VNHotZoneElement {
    id: VNID;
    name: string;
    elementType?: HotZoneElementType; // default 'image'
    imageId: VNID; // Reference to project image asset (for image/button types)
    videoId?: VNID; // Reference to project video asset (for video type)
    videoLoop?: boolean; // Loop video playback
    videoMuted?: boolean; // Mute video audio
    text?: string; // Display text (for text/button types)
    font?: VNFontSettings; // Font settings (for text/button/textInput types)
    placeholder?: string; // Placeholder text (for textInput type)
    variableId?: VNID; // Variable to bind (for textInput type)
    backgroundColor?: string; // Background color (for textInput/button types)
    borderColor?: string; // Border color (for textInput type)
    maxLength?: number; // Max character length (for textInput type)
    x: number; // percentage
    y: number; // percentage
    width: number; // percentage
    height: number; // percentage
    draggable?: boolean;
    snapBack?: boolean; // Return to original position if not dropped on valid spot
    snapToHotSpot?: boolean; // Snap to hot spot center when dropped
    conditions?: VNCondition[]; // Only visible when conditions are met
    actions?: VNUIAction[]; // Actions on click (when not dragging)
    clickSoundId?: VNID | null;
    hoverSoundId?: VNID | null;
    hoverImageId?: VNID; // Hover state image (for imageMap type, Ren'Py-style)
    imageMapRegions?: ImageMapRegion[]; // Clickable regions (for imageMap type)
}

export interface VNHotZoneWinCondition {
    type: 'allPlaced' | 'variable';
    variableId?: VNID; // For variable-based win condition
    operator?: VNConditionOperator; // Comparison operator
    value?: string | number | boolean;
    actions: VNUIAction[]; // Actions to run when win condition is met
}
