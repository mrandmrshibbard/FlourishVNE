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

/** The six built-in quick-menu buttons that can be individually customized. */
export type QuickMenuButtonKey =
    | 'skipBackward' | 'log' | 'autoAdvance' | 'skipForward' | 'save' | 'load';

/** Per-button customization for the quick menu (custom art + independent position). */
export interface QuickMenuButtonConfig {
    image?: { type: 'image' | 'video'; id: VNID } | null;
    hoverImage?: { type: 'image' | 'video'; id: VNID } | null;
    x?: number;       // % of canvas (independent layout); undefined = computed default
    y?: number;       // % of canvas
    width?: number;   // % of canvas width
    height?: number;  // % of canvas height; art uses object-contain so it never distorts
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
    // Quick menu (skip/auto/log/back/save/load buttons)
    quickMenuPosition?: 'above-dialogue' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'hidden'; // default 'above-dialogue'
    quickMenuColor?: string; // button background color hex (default '#0f172a')
    quickMenuOpacity?: number; // 0-100 button opacity (default 75)
    quickMenuBorderRadius?: number; // px button corner radius (default 4)
    /** If true, quick menu floats above dialogue box instead of reserving space for it */
    quickMenuFloatOverDialogue?: boolean; // default false
    // ─── Quick Menu Button Visibility ─── //
    quickMenuShowSkipBackward?: boolean; // Show Skip Backward button (default true)
    quickMenuShowLog?: boolean; // Show Log/History button (default true)
    quickMenuShowAutoAdvance?: boolean; // Show Auto-Advance button (default true)
    quickMenuShowSkipForward?: boolean; // Show Skip Forward button (default true)
    quickMenuShowSave?: boolean; // Show Save button (default true)
    quickMenuShowLoad?: boolean; // Show Load button (default true)
    /** When true, each quick-menu button can be placed independently (per-button x/y/width).
     *  When false (default) the buttons render as a single grouped bar. */
    quickMenuIndependentLayout?: boolean;
    /** Per-button customization (custom art + independent position), keyed by button. */
    quickMenuButtons?: Partial<Record<QuickMenuButtonKey, QuickMenuButtonConfig>>;
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
    HotSpot = 'HotSpot',
    ImageMap = 'ImageMap',
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
    // ─── Hot zone interactivity (any element can opt in) ─── //
    /** Marks an element as "born" inside the hot zone system. Migrated hot zone elements,
     *  quick-added draggable / hot spot / image map entries, and any element the user
     *  treats as interactive carry this flag. The flag keeps the element pinned to the
     *  hot zone overlay + inspector even if `draggable` is toggled off — so users can't
     *  accidentally orphan a hot zone element by unchecking one box. */
    interactive?: boolean;
    /** When true, the player can grab and drag this element on the screen */
    draggable?: boolean;
    /** Return to original position if not dropped on a hot spot */
    snapBack?: boolean;
    /** Snap to a hot spot's center when dropped on it */
    snapToHotSpot?: boolean;
    /** Hide the element after snapping to a hot spot (only applies when snapToHotSpot is true) */
    hideOnDrop?: boolean;
    /** Actions fired when the element is clicked (when not draggable). For draggable elements,
     *  these are typically empty — hot spots own the drop logic. */
    actions?: VNUIAction[];
    /** Sound effect played when the element is clicked */
    clickSoundId?: VNID | null;
    /** Sound effect played when the element is hovered */
    hoverSoundId?: VNID | null;
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
    /** Color for text in empty slots and save metadata */
    slotTextColor?: string;
    /** Color for empty slot placeholder text in screenshot area */
    emptySlotTextColor?: string;
    /** Full font settings for the empty slot placeholder text (overrides emptySlotTextColor) */
    emptySlotFont?: VNFontSettings;
    /** Font settings for the page indicator (e.g., "1/2") */
    pageIndicatorFont?: VNFontSettings;
    /** Label for the Previous page button (default "◀ Prev") */
    prevButtonText?: string;
    /** Label for the Next page button (default "Next ▶") */
    nextButtonText?: string;
    /** Font settings for the Prev/Next navigation buttons */
    navButtonFont?: VNFontSettings;
    /** Hide the entire info bar (slot label + save metadata strip) */
    hideInfoBar?: boolean;
    /** Hide only the "Slot N" label inside the info bar */
    hideSlotLabel?: boolean;
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

/** Hot spot — a trigger zone that fires actions on click, hover, or drag-drop.
 *  Lives as a regular UIElement; rendering is just a debug outline (visible? flag) and a hit-test area. */
export interface UIHotSpotElement extends BaseUIElement {
    type: UIElementType.HotSpot;
    shape: HotSpotShape;
    trigger: HotSpotTrigger;
    /** For drag-drop hot spots: which draggable element ids are accepted here */
    acceptedElementIds?: VNID[];
    /** Sticky visual cue colour (used for debug/edit-time and the visible-flag display) */
    highlightColor?: string;
    /** When true, the spot is drawn at runtime; otherwise it's only visible in the editor */
    visible?: boolean;
}

/** Image map — an image with clickable polygon/rect/circle regions. */
export interface UIImageMapElement extends BaseUIElement {
    type: UIElementType.ImageMap;
    image: UIAsset | null;
    /** Optional alternate image rendered, clipped to the currently-hovered region (Ren'Py-style) */
    hoverImage?: UIAsset | null;
    imageMapRegions?: ImageMapRegion[];
}

export type VNUIElement =
    | UIButtonElement | UITextElement | UIImageElement | UISaveSlotGridElement
    | UISettingsSliderElement | UISettingsToggleElement | UICharacterPreviewElement | UITextInputElement | UIDropdownElement | UICheckboxElement | UIAssetCyclerElement | UICGGalleryElement
    | UIHotSpotElement | UIImageMapElement;

export interface VNUIScreen {
    id: VNID;
    name:string;
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
    /** When true the screen is a transparent pass-through overlay: empty areas let
     *  clicks/taps fall through to the scene/game beneath, and only visible elements
     *  capture input. Intended for the in-game HUD and ShowScreen overlays so the
     *  player can still advance dialogue and interact with the scene. Defaults to
     *  true for the Game HUD screen when unset. Leave false for modal screens. */
    passThrough?: boolean; // default: true for the Game HUD screen, false otherwise
    /** Win-condition logic that fires actions when met. Available on any screen. */
    winCondition?: VNHotZoneWinCondition;
    /** Pre-migration backup of the original hot zone data, written automatically the first time this
     *  screen is migrated to the unified schema. Lets us rebuild the screen verbatim if migration had
     *  a bug. Safe to delete by hand once you're confident the migration worked. */
    _legacyHotZone?: {
        hotSpots?: Record<VNID, VNHotSpot>;
        hotZoneElements?: Record<VNID, VNHotZoneElement>;
        screenType?: 'standard' | 'hotzone';
    };
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
    hideOnDrop?: boolean; // Hide element after it snaps to a hot spot (only applies when snapToHotSpot is true)
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
