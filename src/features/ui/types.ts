import { VNID } from '../../types';
import type { VNScreenOverlayEffect } from '../../types';
import { VNCondition, VNConditionOperator, VNUIAction, VNTextAlign, VNVAlign, VNParallaxSettings } from '../../types/shared';

import { VNTextShadow, VNTextGradient, VNTextBorder, ImageMapRegion } from '../scene/types';
import type { VNCharacterTextbox } from '../character/types';

/**
 * A variable-reactive appearance state for the BUILT-IN dialogue box + nameplate (not a placeable
 * screen element). When its conditions all match, its defined textbox fields layer on top of the
 * current per-character/theme look, tweened by `transitionMs`. First matching state wins.
 * Additive-optional. Authored in the In-Game UI Editor → Dialogue Box → Reactive States.
 */
export interface VNReactiveTextboxState extends VNCharacterTextbox {
    id: VNID;
    name?: string;
    conditions: VNCondition[];
    /** Hide the nameplate entirely while this state is active. */
    hideNamebox?: boolean;
    /** Tween duration (ms) for the change; 0/undefined = instant. */
    transitionMs?: number;
}

/** A variable-reactive appearance state for the built-in Quick Menu BAR (whole-bar, not per-button). */
export interface VNReactiveQuickMenuState {
    id: VNID;
    name?: string;
    conditions: VNCondition[];
    color?: string;
    opacity?: number; // 0-100
    hide?: boolean;   // hide the whole bar while active
    transitionMs?: number;
}

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
    /** When true (independent layout, custom art), the clickable area + visible art shrink to the
     *  fitted image rect — no oversized hitbox/empty margin around the icon. Additive-optional;
     *  undefined/false = legacy (art fills the slot box, whole box clickable). */
    fitToContent?: boolean;
    /** Optional custom action that OVERRIDES the button's built-in behavior. When set (and not
     *  `None`), clicking runs this action through the normal UI-action pipeline instead of the
     *  hard-coded skip/log/auto/save/load handler. Additive-optional; undefined/None = default. */
    action?: VNUIAction;
}

/** An author-defined extra Quick Menu button. Reuses QuickMenuButtonConfig (art / position / size /
 *  fitToContent / action) and adds an id + label. Its `action` is its behavior (None = does nothing). */
export interface QuickMenuCustomButton extends QuickMenuButtonConfig {
    id: VNID;
    label: string;
    /** Visible in the quick menu. Default true (undefined = shown). */
    show?: boolean;
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
    /** Variable-reactive states for the built-in dialogue box + nameplate (first match wins). */
    dialogueReactiveStates?: VNReactiveTextboxState[];
    /** Variable-reactive states for the built-in Quick Menu bar (whole-bar; first match wins). */
    quickMenuReactiveStates?: VNReactiveQuickMenuState[];
    /** Speaker emphasis: while a character is speaking, brighten + slightly enlarge them and dim the
     *  others (a mouth-art-free "who's talking" cue). Off by default. */
    speakerEmphasisEnabled?: boolean;
    /** Brightness (0-1) applied to NON-speaking characters when speaker emphasis is on (default 0.5). */
    speakerEmphasisDim?: number;
    /** Scale multiplier applied to the speaking character (default 1.04). */
    speakerEmphasisScale?: number;
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
    /** Author-defined EXTRA quick-menu buttons (beyond the 6 built-ins). Each runs its own action.
     *  In grouped layout they sit inline after the built-ins; in independent layout they can be
     *  moved/resized like any other quick-menu button. Additive-optional. */
    quickMenuCustomButtons?: QuickMenuCustomButton[];
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
    Inventory = 'Inventory',
    HotSpot = 'HotSpot',
    ImageMap = 'ImageMap',
    Meter = 'Meter',
}

/**
 * A variable-reactive appearance override for a UI element. When its `conditions` are all met,
 * the element renders with these style overrides applied; the FIRST matching state in the list
 * wins, otherwise the element uses its own base styling. All override fields are optional.
 *
 * `primaryColor` maps to the element's "main" colour per type (Meter fill, Text colour, Button
 * background); on elements with no obvious main colour it is used as the glow colour. `image`
 * swaps the picture on Image/Button elements. The universal fields (opacity/scale/rotation/glow)
 * apply to any element. `transitionMs` tweens the change instead of snapping it.
 * Additive-optional: elements without `appearanceStates` render exactly as before.
 */
export interface UIAppearanceState {
    id: VNID;
    name?: string;
    conditions: VNCondition[];
    primaryColor?: string;
    image?: UIAsset | null;
    opacity?: number;   // 0-1
    scale?: number;     // multiplier, 1 = normal
    rotation?: number;  // degrees
    glowColor?: string;
    glowSize?: number;  // px blur radius
    transitionMs?: number; // tween duration for the change (default 0 = instant)
}

interface BaseUIElement {
    id: VNID;
    name: string;
    type: UIElementType;
    x: number; y: number; width: number; height: number;
    anchorX: number; anchorY: number;
    opacity?: number; // 0-1, default 1 (fully opaque)
    /** When true, the element starts invisible (and click-through) at runtime until a ShowElement
     *  action reveals it. Pairs with Show/HideElement actions for multi-page documents and reveals.
     *  Additive-optional: undefined/false = always-visible legacy behavior. Editor still shows it
     *  (dimmed, with a badge) so it stays selectable/editable. */
    startHidden?: boolean;
    /** Stacking order among elements on the screen. Higher = nearer the viewer. Optional;
     *  when undefined the element keeps its insertion order (back-compat, no migration). */
    layer?: number;
    /** Parallax depth (0/undefined = locked). The screen's `parallax` setting drives it. */
    parallaxDepth?: number;
    /** When true, the element's rendered media is fit (object-contain, undistorted) to its box
     *  and BOTH the visible footprint and the clickable area shrink to the fitted art — so there
     *  is no empty/letterbox margin (visible dead-space or stray click target) around it.
     *  Additive-optional: undefined/false = legacy behavior (media fills the box). Only affects
     *  media/art-bearing elements (Image, or Button with a background image). */
    fitToContent?: boolean;
    conditions?: VNCondition[];
    disabledConditions?: VNCondition[];
    /** Variable-reactive appearance overrides; first state whose conditions match wins. */
    appearanceStates?: UIAppearanceState[];
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
    /** Inner horizontal padding in % of the button width (default 0). Keeps left/right-aligned
     *  text off the edge. */
    paddingX?: number;
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
    background?: { type: 'image' | 'video', assetId: VNID, loop?: boolean } | { type: 'color', value: string }; // Image/video from assets or solid color. `loop` (video only, default true): off = play once and hold last frame.
    image: UIAsset | null; // Deprecated, kept for backward compatibility
    objectFit?: 'contain' | 'cover' | 'fill'; // How the image/video should fit in the element
}
/**
 * A single freely-positioned slot rectangle, in screen-percent coordinates
 * (same coordinate space as a UI element's x/y/width/height). Used by
 * SaveSlotGrid and CGGallery when slotLayout === 'free'. Index = slot/entry index.
 */
export interface UISlotRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface UISaveSlotGridElement extends BaseUIElement {
    type: UIElementType.SaveSlotGrid;
    slotCount: number;
    font: VNFontSettings;
    emptySlotText: string;
    /**
     * Slot arrangement. Absent or 'grid' = the classic auto-arranged 2×2 paginated
     * grid (unchanged). 'free' = each slot is placed individually via slotRects.
     */
    slotLayout?: 'grid' | 'free';
    /**
     * Per-slot rectangles in screen-percent, index = slot index (0-based).
     * Only consulted when slotLayout === 'free'. Slots without a rect are not shown.
     */
    slotRects?: UISlotRect[];
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
    /** Which side the disclosure arrow sits on (default 'right'; use 'left' for RTL layouts). */
    arrowSide?: 'left' | 'right';
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
    /**
     * Thumbnail arrangement. Absent or 'grid' = the classic auto-flowed column grid
     * (unchanged). 'free' = each entry is placed individually via slotRects, in entry
     * order; only entries that have a placed rect are shown.
     */
    slotLayout?: 'grid' | 'free';
    /**
     * Per-slot rectangles in screen-percent, index = entry index (sorted order).
     * Only consulted when slotLayout === 'free'.
     */
    slotRects?: UISlotRect[];
    /** Remove the dark container panel behind the thumbnails (lets background art show through). */
    hideBackgroundPanel?: boolean;
}

/** Inventory Grid — auto-renders the player's owned items (from project.items) in a CSS grid:
 *  icon + name + live quantity, with an optional Use button. Data-driven like the CG gallery, so
 *  there's no per-item hand placement. */
export interface UIInventoryGridElement extends BaseUIElement {
    type: UIElementType.Inventory;
    /** Columns in the item grid. */
    columns: number;
    /** Gap between slots in pixels (legacy/base — used when columnGap/rowGap are unset). */
    gap: number;
    /** Minimum number of rows — pads the grid with empty slots up to columns×rows (a fixed
     *  "backpack" look). Unset/0 = auto-grow with the number of items. */
    rows?: number;
    /** Horizontal spacing between columns (px). Falls back to `gap`. */
    columnGap?: number;
    /** Vertical spacing between rows (px). Falls back to `gap`. */
    rowGap?: number;
    /** Background color for the grid area. */
    backgroundColor?: string;
    /** Per-slot background color. */
    slotColor?: string;
    /** Per-slot border color. */
    slotBorderColor?: string;
    /** Per-slot border radius (px). */
    slotBorderRadius?: number;
    /** Show item names under icons (default true). */
    showNames?: boolean;
    /** Show a quantity badge (default true; only shows when qty > 1). */
    showQuantity?: boolean;
    /** Show a "Use" button on usable items (default false). */
    showUseButton?: boolean;
    /** Allow the player to drag-rearrange items in-game (their order persists per save). Default true. */
    allowReorder?: boolean;
    /** ── Use-button appearance (when showUseButton) ── */
    useButtonText?: string;                                    // label (default "Use")
    useButtonImage?: { type: 'image' | 'video'; id: VNID } | null;       // custom art
    useButtonHoverImage?: { type: 'image' | 'video'; id: VNID } | null;  // custom hover art
    useButtonColor?: string;                                   // background (no-art)
    useButtonHoverColor?: string;
    useButtonTextColor?: string;
    useButtonFont?: VNFontSettings;
    useButtonRadius?: number;                                  // px
    /** Hide items the player doesn't own (count < 1). Default true. */
    hideUnowned?: boolean;
    /** Font for item names. */
    nameFont?: VNFontSettings;
    /** Only show items in this category (empty = all). */
    categoryFilter?: string;
    /** Text shown when the grid is empty (e.g. "Your bag is empty"). */
    emptyText?: string;
    /** Highlight ring colour for the currently-selected item slot. Default #38bdf8. */
    selectedBorderColor?: string;
    /** Bind this grid to a specific item list (collection). Unset = the player's own inventory
     *  (legacy: all owned items from the global registry). Additive-optional. */
    collectionId?: VNID;
    /** What the per-slot button does. Unset = derived from `showUseButton` (true→'use', else 'none')
     *  for backward compatibility. 'buy'/'sell' turn this grid into a shop control. */
    slotButton?: 'use' | 'buy' | 'sell' | 'none';
    /** For a 'sell' grid (the player's inventory shown on a shop screen): which shop list receives the
     *  sale — provides the currency, sell rate, and optional restock target. */
    sellToCollectionId?: VNID;
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

/** A progress-bar bound to a number variable (stat vars included): affection meters, HP bars,
 *  XP… Reads the variable live; min/max default to the variable's own bounds. All fields are
 *  additive-optional (old projects unaffected; old engines render nothing for unknown types). */
export interface UIMeterElement extends BaseUIElement {
    type: UIElementType.Meter;
    /** The number variable this meter displays. */
    variableId?: VNID;
    /** Bounds overrides; undefined → the variable's min/max → 0/100. */
    minValue?: number;
    maxValue?: number;
    /** Fill direction. Default 'ltr'. */
    direction?: 'ltr' | 'rtl' | 'up';
    fillColor?: string;
    /** When set, the fill becomes a gradient from fillColor to this. */
    fillColorEnd?: string;
    /** Art-based fill: an image revealed proportionally instead of a solid fill. */
    fillImage?: UIAsset | null;
    backgroundColor?: string;
    backgroundImage?: UIAsset | null;
    borderColor?: string;
    borderRadius?: number;
    /** Optional caption (e.g. the stat/character name) rendered before the bar. */
    showLabel?: boolean;
    label?: string;
    labelFont?: VNFontSettings;
    /** Optional numeric readout rendered on the bar. */
    showValue?: boolean;
    valueFormat?: 'value' | 'valueMax' | 'percent';
    valueFont?: VNFontSettings;
}

export type VNUIElement =
    | UIButtonElement | UITextElement | UIImageElement | UISaveSlotGridElement
    | UISettingsSliderElement | UISettingsToggleElement | UICharacterPreviewElement | UITextInputElement | UIDropdownElement | UICheckboxElement | UIAssetCyclerElement | UICGGalleryElement | UIInventoryGridElement
    | UIHotSpotElement | UIImageMapElement | UIMeterElement;

/** An extra background plane on a screen (for multi-plane parallax backdrops). */
export interface VNScreenBackgroundLayer {
    id: VNID;
    background: { type: 'color', value: string } | { type: 'image' | 'video', assetId: VNID | null, loop?: boolean };
    /** Stacking order vs. the main background and elements (default 0). */
    layer?: number;
    /** Parallax depth (0/undefined = locked). Driven by the screen's `parallax` setting. */
    parallaxDepth?: number;
    /** Entry transition for this background plane (plays once when the screen appears). */
    transition?: VNScreenBgTransition;
    transitionDuration?: number; // ms, default 400
}

/** Per-background entry transition for screen backgrounds (video + image). */
export type VNScreenBgTransition = 'none' | 'fade' | 'crossfade' | 'dissolve' | 'slide' | 'iris' | 'wipe';

/** What kind of screen this is — purely an editor-organization aid (color + grouping in the
 *  screen list, filtering in the Systems hub). Has NO runtime effect. Unset = inferred from the
 *  screen's role (see utils/screenCategory). */
export type VNScreenCategory = 'menu' | 'hud' | 'overlay' | 'system' | 'screen';

export interface VNUIScreen {
    id: VNID;
    name:string;
    /** Optional editor-only category (color/grouping). Unset → inferred. Additive-optional. */
    category?: VNScreenCategory;
    background: { type: 'color', value: string } | { type: 'image' | 'video', assetId: VNID | null, loop?: boolean };
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
    /** Optional parallax for this screen's elements (off by default). */
    parallax?: VNParallaxSettings;
    /** Parallax depth for the screen's own background (0/undefined = locked). Lets the
     *  backdrop drift without needing a stretched image element. The background is
     *  slightly over-scaled when this is set so the shift doesn't reveal its edges. */
    backgroundParallaxDepth?: number;
    /** Stacking order of the screen's own background (default 0 = behind 0-layer elements).
     *  Lets you interleave the backdrop with element layers for multi-plane parallax (e.g.
     *  a far element behind the background at a lower layer). */
    backgroundLayer?: number;
    /** Entry transition for the main background (video + image) — plays once when the screen
     *  appears, independent of the whole-screen transition. */
    backgroundTransition?: VNScreenBgTransition;
    backgroundTransitionDuration?: number; // ms, default 400
    /** Extra background planes layered with the main background for multi-plane parallax —
     *  each renders at its own `layer` (zIndex) with `parallaxDepth`. Additive-optional. */
    additionalBackgrounds?: VNScreenBackgroundLayer[];
    /** When a pass-through HUD, render ABOVE the dialogue box + choices (default: below) so the
     *  player can bring up and interact with this overlay while dialogue/choices are showing.
     *  Empty areas still pass clicks through to advance dialogue. Additive-optional. */
    hudAboveDialogue?: boolean;
    /** When true, opening this screen as an in-game overlay FREEZES the scene beneath: auto-advance,
     *  skip, and manual advance are all suspended (the scene stays visible but paused) until the
     *  overlay closes. Default (unset) = the scene keeps running behind it. Additive-optional. */
    pauseSceneWhileOpen?: boolean;
    /** When true (default for new screens), opening this screen clears any runtime Show/Hide-Element
     *  overrides for its elements, so `startHidden` pages reset to their defaults each time it opens
     *  (a re-opened document starts on page 1). Set false to make reveals cumulative/persistent
     *  across opens (e.g. a map you progressively uncover). Additive-optional: undefined = reset. */
    resetElementVisibilityOnOpen?: boolean;
    /** Optional dark backdrop opacity (0–1) drawn between the scene/dialogue and this overlay while
     *  it's open (a "dim the room behind the popup" effect). 0/undefined = no backdrop. */
    backdropOpacity?: number;
    /** Optional blur (px) applied to everything behind this overlay while it's open. 0/undefined = none. */
    backdropBlur?: number;
    /** What happens when this overlay closes (via ReturnToPreviousScreen / ReturnToGame / toggle-off):
     *  'default'/undefined preserves today's behavior; 'resume' returns without advancing the story;
     *  'advance' advances one step; 'runActions' runs `onCloseActions` then resumes. Additive-optional. */
    onCloseBehavior?: 'default' | 'resume' | 'advance' | 'runActions';
    /** Actions run when this overlay closes (used when onCloseBehavior === 'runActions'). */
    onCloseActions?: VNUIAction[];
    /** Optional keyboard key that TOGGLES this screen open/closed during gameplay (e.g. 'i' for an
     *  inventory). Matched case-insensitively; ignored while typing or with another overlay/history open.
     *  Built-in shortcuts (Space/Enter advance, H history, Ctrl skip, Esc pause) take priority.
     *  Additive-optional. */
    openHotkey?: string;
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
