import { VNID, VNContentBox } from '../../types';
import type { VNScreenOverlayEffect } from '../../types';
import { VNCondition, VNConditionOperator, VNUIAction, VNTextAlign, VNVAlign, VNParallaxSettings } from '../../types/shared';

import { VNTextShadow, VNTextGradient, VNTextBorder, draggableImageElementRegion } from '../scene/types';
import type { PhoneCallConversation, PhoneConversationEntry } from '../scene/types';
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

/** Where a phone avatar / caller portrait image comes from, chosen per text/call so authors aren't
 *  locked to the character's base sprite. `base` (default) = the character's base sprite; `expression`
 *  = composite a chosen pose/expression (optionally hiding the base layer); `custom` = an uploaded
 *  image. Additive-optional everywhere — unset/`base` keeps today's behavior. */
export interface PhonePortraitSource {
    mode?: 'base' | 'expression' | 'custom';
    /** For mode 'expression': which expression/pose to composite. */
    expressionId?: VNID;
    /** For mode 'expression': hide the base sprite so a full standalone pose shows alone. */
    hideBase?: boolean;
    /** For mode 'custom': the uploaded image (or video frame). */
    customImage?: { type: 'image' | 'video'; id: VNID } | null;
}

/** A button in the in-game Phone's bottom bar (Chat / Contacts / Gallery / Map / Close …). Each is a
 *  fully configurable button: a built-in library icon OR a custom image, plus any UI action. */
export interface PhoneButtonConfig {
    id: VNID;
    label?: string;
    /** Built-in icon id from the phone icon library (e.g. 'chat','contacts','gallery','map','close','phone'). */
    builtinIcon?: string;
    /** Custom icon image — overrides builtinIcon when set. */
    iconImage?: { type: 'image' | 'video'; id: VNID } | null;
    /** Opens a built-in phone app (registry id: 'chat','contacts','history','gallery','map',
     *  'settings'…). WINS over `action` when set — the simple, non-coder path. Additive-optional:
     *  older buttons only have `action` and behave exactly as before. */
    appId?: string;
    /** What clicking does — any UI action (e.g. ShowPhoneText to open chat, HidePhone to close).
     *  Used when `appId` is unset ("custom action" mode). */
    action?: VNUIAction;
    /** Only shown when all conditions pass. */
    conditions?: VNCondition[];
    /** Visible in the bar. Default true (undefined = shown). */
    show?: boolean;
    /** Free-layout placement on the phone screen (percent of the screen area) — used when
     *  `phoneButtonLayout: 'free'`. Ignored in the default bottom-bar layout. Additive-optional. */
    x?: number; y?: number; width?: number; height?: number;
}

/** A registered contact in the in-game phone's Contacts app. References a character; each row offers a
 *  Call button (→ outgoing "Calling…" screen + optional callAction) and a Message button (→ that
 *  character's chat thread). Additive-optional. */
export interface PhoneContact {
    id: VNID;
    /** The character this contact represents (its base sprite/name are the defaults). */
    characterId: VNID;
    /** Override the displayed name (default = the character's name). */
    displayName?: string;
    /** Override the contact's avatar (default = the character's base sprite). */
    avatar?: PhonePortraitSource;
    /** A small status line under the name — interpolates variables, e.g. "Affection: {mia_love}". */
    statusText?: string;
    /** Only listed when all conditions pass (so contacts can unlock over the story). */
    conditions?: VNCondition[];
    /** Pinned contacts sort to the top of the list. */
    pinned?: boolean;
    /** What the Call button does after the "Calling…" screen shows (e.g. Call Common Event / Jump To
     *  Scene to run the conversation). Optional — without it, Call just shows the calling screen. */
    callAction?: VNUIAction;
    /** Scripted in-call conversation for the Contacts "Call" button (voiced transcript with
     *  replies) — WINS over callAction when set. Additive-optional.
     *  LEGACY single slot: when `callConversations` (the gated LIST) has a passing entry, the
     *  list wins; this remains the always-eligible fallback. */
    callConversation?: PhoneCallConversation;
    /** Condition-gated CALL conversations — first entry whose conditions pass (and isn't a
     *  played-out `once`) plays when the player calls. Additive-optional. */
    callConversations?: PhoneConversationEntry[];
    /** Condition-gated TEXT conversations — first passing entry auto-plays (typing dots, lines,
     *  replies) when the player opens this contact's message thread. Additive-optional. */
    textConversations?: PhoneConversationEntry[];
    /** Hide the Call button for this contact (text-only). */
    hideCall?: boolean;
    /** Hide the Message button for this contact (call-only). */
    hideMessage?: boolean;
    /** Per-thread chat background (overrides the global chat background for this contact's conversation). */
    chatBackground?: { type: 'image' | 'video'; id: VNID } | null;
}

export interface VNProjectUI {
    titleScreenId: VNID | null;
    settingsScreenId: VNID | null;
    saveScreenId: VNID | null;
    loadScreenId: VNID | null;
    pauseScreenId: VNID | null;
    gameHudScreenId: VNID | null;
    /** "Player's Character" pointers — the persistent string variables that remember the character
     *  the player created in a Character Creator: which base character (a character id) and their
     *  chosen name. Set by the Character Creator wizard. Read by commands/elements whose
     *  `characterSource === 'player'`. Additive-optional (older projects/saves unaffected). */
    playerCharacterVarId?: VNID | null;
    playerCharacterNameVarId?: VNID | null;
    /** The screen generated as THE player-character creator (Systems hub "Edit" link).
     *  Editor-only bookkeeping; nothing reads it at runtime. Additive-optional. */
    characterCreatorScreenId?: VNID | null;
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
    /** Reveal highlight ("karaoke"): while a line types out, the word currently being revealed
     *  is emphasized. Off by default; all additive-optional. */
    dialogueRevealHighlight?: {
        enabled?: boolean;
        /** 'color' recolors the word; 'glow' adds a soft glow; 'underline' underlines it. */
        style?: 'color' | 'glow' | 'underline';
        /** Highlight color (default '#facc15'). Ignored when useSpeakerColor is on and the line has a speaker. */
        color?: string;
        /** Use the speaking character's name color as the highlight color. */
        useSpeakerColor?: boolean;
        /** On voiced lines, drive the highlight from the CLIP's estimated word timings
         *  (loudness-envelope analysis — highlights surge and pause with the actor)
         *  instead of the typewriter. Unvoiced lines fall back to typewriter tracking. */
        syncToVoice?: boolean;
    };
    /** On voiced lines, pace the typewriter so the reveal finishes together with the clip
     *  (per-line textSpeed overrides still win). Off by default. */
    voicePacedText?: boolean;
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
    // Submit button of the text-input box (full styling — additive-optional, all fall back to defaults)
    inputSubmitLabel?: string; // button text (default "Submit")
    inputSubmitColor?: string; // background color hex (default a slate grey)
    inputSubmitBorderRadius?: number; // px corner radius
    inputSubmitImage?: UIAsset | null; // optional background image for the submit button
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

    // ─── In-game Phone (built-in chrome; messaging) ──────────────────── //
    /** Master on/off for the phone feature (shows the chrome + enables Phone commands/actions). */
    phoneEnabled?: boolean;
    /** Where the phone sits when open (used to derive x/y if not explicitly set). */
    phonePosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
    phoneX?: number; phoneY?: number; phoneWidth?: number; phoneHeight?: number; // screen-percent
    phoneScale?: number;            // overall size multiplier (%), default 100 — scales width+height together
    phoneShellColor?: string;       // the casing/body color (frame around the screen)
    phoneShellImage?: { type: 'image'; id: VNID } | null;
    phoneBorderRadius?: number;
    phoneOpacity?: number;          // 0-100
    // Casing → screen separation (makes the inner screen look inset in the phone body)
    phoneBezelWidth?: number;       // px gap between casing edge and screen (default 8)
    phoneScreenColor?: string;      // inner screen background (default '#0b0d12')
    phoneScreenBorderColor?: string;// thin border around the inner screen (default 'rgba(255,255,255,0.12)')
    // Home button (decorative + closes the phone) on the bottom-center chin
    phoneShowHomeButton?: boolean;  // default true
    phoneHomeButtonColor?: string;  // default 'rgba(255,255,255,0.28)'
    /** Keyboard key that toggles the phone open/closed (e.g. "p"). */
    phoneOpenHotkey?: string;
    /** What closing the phone (home button / Hide Phone action) does to the story: 'resume'/unset =
     *  nothing (the player advances normally); 'advance' = step the scene forward one beat on close,
     *  so reading + closing the phone continues the story without an extra click. Additive-optional. */
    phoneOnCloseBehavior?: 'resume' | 'advance';
    // Status / notification bar
    phoneShowStatusBar?: boolean;
    phoneStatusBarColor?: string;
    phoneStatusIconColor?: string;
    phoneClockText?: string;        // shown at left; supports {variable} interpolation (liveText)
    phoneShowSignal?: boolean;
    phoneSignalBars?: number;       // how many signal bars (default 4)
    phoneSignalVariableId?: VNID;   // optional: drive how many bars are filled from a number variable (live → conditionals)
    phoneSignalColor?: string;      // signal bars color (default = status icon color)
    phoneShowBattery?: boolean;
    phoneBatteryVariableId?: VNID;  // optional: drive the battery icon level from a number variable
    phoneBatteryColor?: string;     // battery fill color (default = status icon color)
    // Header + fonts
    phoneHeaderText?: string;       // e.g. "MESSAGES"
    phoneTitleFont?: VNFontSettings;
    phoneFont?: VNFontSettings;     // chat/body font
    // Chat bubbles
    phoneIncomingBubbleColor?: string;
    phoneOutgoingBubbleColor?: string;
    phoneBubbleTextColor?: string;
    phoneShowAvatars?: boolean;
    // Bottom button bar
    phoneButtons?: PhoneButtonConfig[];
    /** App-button layout: 'bar' (default) = fixed bottom bar; 'free' = each button placed by its
     *  own x/y on the phone screen; 'grid' = a full-screen home grid of app icons (real phone
     *  style — icons flow into rows, sized/labelled by the phoneHomeGrid* fields below). */
    phoneButtonLayout?: 'bar' | 'free' | 'grid';
    phoneButtonBarColor?: string;
    phoneButtonIconColor?: string;
    phoneButtonActiveColor?: string;
    // ── Home grid ('grid' layout) ──────────────────────────────────────────────
    /** Icons per row (default 3). */
    phoneHomeGridColumns?: number;
    /** Icon tile size as % of the screen width (default 18). */
    phoneHomeIconSize?: number;
    /** Show app labels under icons (default true). */
    phoneHomeShowLabels?: boolean;
    phoneHomeLabelFont?: VNFontSettings;
    /** Icon tile backing (unset = transparent, icon floats on the wallpaper). */
    phoneHomeIconBgColor?: string;
    phoneHomeIconRadius?: number;
    // ─── Dynamic events: incoming-text banner, badge, typing dots, call screen, history (Track B/C/D/E) ─── //
    // Incoming-text notification banner (non-blocking arrival)
    phoneNotifPosition?: 'top' | 'bottom';     // where the banner slides in (default top)
    phoneNotifColor?: string;                  // banner background
    phoneNotifTextColor?: string;
    phoneNotifFont?: VNFontSettings;
    phoneNotifSoundId?: VNID | null;           // default ding when a text arrives
    phoneNotifAutoMs?: number;                 // auto-dismiss after N ms (default 6000; 0 = stay)
    phoneNotifX?: number; phoneNotifY?: number;// optional free banner position (screen-%); overrides the top/bottom preset
    // Notification badge (on the dialogue box / phone HUD icon)
    phoneBadgeColor?: string;                  // dot/badge color (default red)
    phoneBadgeTextColor?: string;
    phoneBadgeSize?: number;                   // px (default 14)
    /** Badge appearance: 'dot' (plain), 'count' (unread number), 'ring' (hollow), 'square' (rounded
     *  square), 'icon' (a glyph from phoneBadgeIcon), 'pulse' (dot with a pulsing halo). */
    phoneBadgeShape?: 'dot' | 'count' | 'ring' | 'square' | 'icon' | 'pulse';
    phoneBadgeIcon?: string;                   // built-in glyph id when shape='icon' (e.g. 'chat','phone')
    phoneBadgeLabel?: string;                  // optional caption under the badge (e.g. "Messages", "Missed call")
    phoneBadgeLabelColor?: string;
    phoneBadgeX?: number; phoneBadgeY?: number;// screen-% position (default top-right area)
    // Typing indicator
    phoneTypingColor?: string;                 // dots color (default = incoming bubble)
    // Incoming-call screen
    phoneCallBgColor?: string;                 // call overlay background (default dark)
    phoneCallBgImage?: { type: 'image'; id: VNID } | null;
    phoneCallNameFont?: VNFontSettings;
    phoneCallRingtoneId?: VNID | null;         // default ringtone (per-call / per-character override)
    phoneCallAcceptColor?: string;             // accept button color (default green)
    phoneCallAcceptLabel?: string;             // default "Accept"
    phoneCallAcceptIcon?: string;              // built-in glyph id
    phoneCallAcceptImage?: { type: 'image'; id: VNID } | null;
    phoneCallDeclineColor?: string;            // decline button color (default red)
    phoneCallDeclineLabel?: string;            // default "Decline"
    phoneCallDeclineIcon?: string;
    phoneCallDeclineImage?: { type: 'image'; id: VNID } | null;
    phoneCallPortraitShape?: 'circle' | 'square';
    // In-call transcript (scripted call conversations)
    /** End Call button styling/label (defaults: "End Call", red). */
    phoneCallEndLabel?: string;
    phoneCallEndColor?: string;
    phoneCallEndIcon?: string;
    phoneCallEndImage?: { type: 'image'; id: VNID } | null;
    /** Live call timer color (default dimmed white). */
    phoneCallTimerColor?: string;
    /** Transcript line bubbles (voice-styled). Defaults follow the chat bubble colors. */
    phoneCallLineIncomingColor?: string;
    phoneCallLineOutgoingColor?: string;
    /** "Calling…" text on the outgoing dialing screen (default "Calling…"). */
    phoneCallDialingText?: string;
    // Settings app: player wallpaper picker + decorative home widgets
    /** Wallpapers the PLAYER can pick from in the phone's Settings app (choice persists in
     *  saves). Entries with conditions unlock over the story. Unset/empty = Settings app hidden. */
    phoneWallpapers?: Array<{
        id: VNID;
        name?: string;
        image: { type: 'image' | 'video'; id: VNID };
        thumbnail?: { type: 'image'; id: VNID } | null;
        conditions?: VNCondition[];
    }>;
    phoneSettingsHeader?: string;              // default "Settings"
    phoneSettingsWallpaperLabel?: string;      // default "Wallpaper"
    /** Decorative widgets on the phone's HOME screen (clock/text/image), % of the screen. */
    phoneHomeWidgets?: Array<{
        id: VNID;
        type: 'clock' | 'text' | 'image';
        x: number; y: number; width: number; height?: number;
        text?: string;                          // interpolates {variables}; clock uses phoneClockText
        font?: VNFontSettings;
        color?: string;
        image?: { type: 'image' | 'video'; id: VNID } | null;
        conditions?: VNCondition[];
    }>;
    // Map app (free-roam travel from the phone; the map itself lives in project.maps)
    /** Which map the phone's Map app shows. Unset = Map app disabled. */
    phoneMapId?: VNID | null;
    phoneMapHeader?: string;                   // default "Map"
    /** The travel gate: tapping a location only travels when these pass (browsing always works).
     *  E.g. `can_travel is true` — flip it with Set Variable when the story allows moving. */
    phoneMapTravelConditions?: VNCondition[];
    phoneMapTravelLockedText?: string;         // default "You can't leave right now."
    // Gallery app (Photos tab = camera roll from texts; Collection tab = the project's CG gallery)
    phoneGalleryHeader?: string;               // default "Gallery"
    phoneGalleryColumns?: number;              // default = cgGallery.columns or 3
    /** Show the CG-gallery Collection tab (default true when the project has a CG gallery). */
    phoneGalleryShowCG?: boolean;
    phoneGalleryPhotosLabel?: string;          // default "Photos"
    phoneGalleryCGLabel?: string;              // default "Collection"
    phoneGalleryEmptyText?: string;            // default "No photos yet"
    // Recents / history view
    phoneHistoryHeader?: string;               // default "Recents"
    phoneHistoryRowColor?: string;
    phoneHistoryTextColor?: string;

    // Messages app (threads inbox — the screen the Messages icon opens to)
    phoneMessagesHeader?: string;              // default "Messages"
    phoneMessagesEmptyText?: string;           // default "No messages yet"
    phoneMessagesNewHint?: string;             // preview on a thread with an unplayed scripted conversation (default "New conversation")

    // Contacts app
    phoneContacts?: PhoneContact[];
    phoneContactsHeader?: string;              // default "Contacts"
    phoneContactRowColor?: string;             // contact row background (defaults to history row color)
    phoneContactTextColor?: string;            // contact row text (defaults to history text color)
    phoneContactCallLabel?: string;            // default "Call"
    phoneContactMessageLabel?: string;         // default "Message"

    // Sounds
    phoneTapSoundId?: VNID;                     // played when any phone button / app icon / reply is tapped
    phoneOpenSoundId?: VNID;                    // played when the phone opens
    phoneCloseSoundId?: VNID;                   // played when the phone closes

    // Backgrounds / wallpaper
    phoneWallpaperImage?: { type: 'image' | 'video'; id: VNID } | null;       // behind the whole screen (home + apps)
    phoneChatBackgroundImage?: { type: 'image' | 'video'; id: VNID } | null;  // behind chat threads (overrides wallpaper); per-contact can override again

    // Portrait / avatar sizing (so tall full-body sprites fit)
    phoneContactAvatarSize?: number;           // contacts-list avatar size in em (default 2.4)
    phoneContactAvatarFit?: 'cover' | 'contain';   // default cover
    phoneChatAvatarSize?: number;              // chat bubble avatar size in em (default 2.2)
    phoneChatAvatarFit?: 'cover' | 'contain';      // default cover
    phoneCallPortraitSize?: number;            // call-screen portrait size, % of the screen width (default 22)
    phoneCallPortraitFit?: 'cover' | 'contain';    // default cover; 'contain' shows a full-body sprite uncropped
    phoneCallPortraitPosition?: string;        // CSS object-position, e.g. "center top" (default "center")
    phoneCallPortraitX?: number;               // free position on the call screen (% of screen); unset = centered
    phoneCallPortraitY?: number;
    // Per-screen fonts (additive; fall back to phoneFont / sensible defaults)
    phoneContactNameFont?: VNFontSettings;     // contacts-list name
    phoneContactStatusFont?: VNFontSettings;   // contacts-list status line
    // Contacts list placement: when set, the scrollable roster occupies this sub-region of the
    // phone screen (% of the phone, like free app buttons); unset = fills the content area.
    phoneContactsRegion?: { x: number; y: number; width: number; height: number };

    // ─── Player Inventory (the implicit, unbound item grid) ─── additive; unset = current behavior
    inventoryDefaultSort?: 'manual' | 'alpha' | 'category';  // unset → 'manual' (sort by item.order)
    inventoryDefaultHideUnowned?: boolean;                    // unset → true
    inventoryDefaultShowNames?: boolean;                      // unset → true
    inventoryDefaultShowQuantity?: boolean;                   // unset → true
    inventoryDefaultColumns?: number;                         // unset → 4
    inventoryCategoryOrder?: string[];                        // author-ordered category names; uncategorized always last
    inventoryGroupByCategory?: boolean;                       // unset/false → flat positional grid (unchanged)
}

/**
 * Per-variant overridable look of a confirmation dialog (everything EXCEPT the text, which is
 * authored per-variant separately). Every field is optional; an unset field falls back to the
 * shared base on VNConfirmDialogSettings, which in turn falls back to a hard-coded default.
 */
export interface VNConfirmVariantStyle {
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
    /** Free layout: when true, the box and each button are positioned/sized by the rects below
     *  (screen-percent, like the Quick Menu's independent layout) instead of the centred auto-layout. */
    independentLayout?: boolean;
    boxRect?: { x: number; y: number; width: number; height: number };
    confirmRect?: { x: number; y: number; width: number; height: number };
    cancelRect?: { x: number; y: number; width: number; height: number };
}

/**
 * Confirmation dialogs (Quit / New Game). Text is per-variant (quit* / newGame*). The styling fields
 * inherited from VNConfirmVariantStyle act as the SHARED BASE — preserved for backward compatibility
 * with projects authored before per-variant styling. `variants.{quit,newGame}` hold per-variant style
 * overrides; the effective look of a variant = { ...base, ...variants[variant] }. Fully additive: a
 * project with no `variants` renders both dialogs from the shared base exactly as before.
 */
export interface VNConfirmDialogSettings extends VNConfirmVariantStyle {
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
    /** Erase Save confirmation (shown before a save slot is deleted) */
    eraseSaveTitle?: string;       // default "Erase Save"
    eraseSaveMessage?: string;     // default "Erase this save? This cannot be undone."
    eraseSaveConfirmLabel?: string;// default "Erase"
    eraseSaveCancelLabel?: string; // default "Cancel"
    /** Per-variant style overrides (full independence). Unset → inherit the shared base above. */
    variants?: { quit?: VNConfirmVariantStyle; newGame?: VNConfirmVariantStyle; eraseSave?: VNConfirmVariantStyle };
}

export type UIAsset = {
    type: 'image' | 'video';
    id: VNID;
    /** Per-use video clip (seconds). Overrides the asset's default trim. Ignored for images. */
    trimStart?: number;
    trimEnd?: number;
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
    draggableImageElement = 'draggableImageElement',
    Meter = 'Meter',
    Customizer = 'Customizer',
    /** An invisible (or countdown) element that runs actions after a delay once its screen opens. */
    Timer = 'Timer',
    /** A registry item placed on a screen: shows its icon (+ optional name/count). Display mode can
     *  be drag-and-dropped onto hot spots; Pickup mode is click-to-take (point-and-click rooms). */
    Item = 'Item',
    /** An element type contributed by an extension (rendered via a registered HTML renderer). */
    Custom = 'Custom',
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
    /** Fade in while entering. Default TRUE (the historical behaviour). Off = the element arrives
     *  fully visible and just slides/scales into place — a user-requested pure movement. */
    transitionFade?: boolean;
    /** Slide distance as a % of the element's own size. Unset = each direction's classic default. */
    transitionDistance?: number;
    /** Replay the entrance whenever this element is REVEALED by a Show Element action (not just on
     *  screen open). Default false — a reveal historically just faded, and existing projects keep that. */
    transitionOnReveal?: boolean;
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
    /** Optional label so hot spots can accept this draggable by tag instead of by id. */
    dragTag?: string;
    /** Optional inventory item this draggable represents — consumed (unless reusable) + use-effect
     *  runs on a successful drop; its tag is used for matching when dragTag is unset. */
    boundItemId?: VNID;
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
    /** Corner rounding in px (matches the scene Show Button's borderRadius). Absent = the
     *  legacy default (~4px) so existing buttons are unchanged. Additive-optional. */
    borderRadius?: number;
    /** Inner horizontal padding in % of the button width (default 0). Keeps left/right-aligned
     *  text off the edge. */
    paddingX?: number;
    /** Visible/clickable sub-region (see VNContentBox): snapping/fit/guide + in-game click hit-area
     *  for image buttons. Additive-optional. */
    contentBox?: VNContentBox;
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
    background?: { type: 'image' | 'video', assetId: VNID, loop?: boolean, trimStart?: number, trimEnd?: number, muted?: boolean } | { type: 'color', value: string }; // Image/video from assets or solid color. `loop` (video only, default true): off = play once and hold last frame. trimStart/trimEnd (seconds) play only a slice. `muted` (video only, default false): play the video's audio; set true for a silent decorative loop.
    image: UIAsset | null; // Deprecated, kept for backward compatibility
    objectFit?: 'contain' | 'cover' | 'fill'; // How the image/video should fit in the element
    /** Visible sub-region (see VNContentBox): snapping/fit/guide. Additive-optional. */
    contentBox?: VNContentBox;
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
/** One placeable piece inside a custom-designed save slot. Coordinates are PERCENT of the
 *  slot box (not the screen), so the design scales with however the slot is sized/tiled. */
export interface UISlotDesignPart {
    id: string;
    /** 'screenshot' = the save's gameplay screenshot (cropped to fill its box);
     *  'image' = the author's own art; 'text' = static text with tokens. */
    partType: 'screenshot' | 'image' | 'text';
    x: number;
    y: number;
    width: number;
    height: number;
    /** Art for 'image' parts. */
    asset?: UIAsset | null;
    /** How screenshot/image fills its box. Screenshot defaults to 'cover' (a cropped portion). */
    objectFit?: 'contain' | 'cover' | 'fill';
    /** Text for 'text' parts. Tokens: {slot} {scene} {date} {time} fill in per save. */
    text?: string;
    font?: VNFontSettings;
    /** Corner rounding in px for this part's box. */
    borderRadius?: number;
    /** When the part renders: always (default), only on slots holding a save, or only on empty slots. */
    visibleWhen?: 'always' | 'occupied' | 'empty';
}
/** A fully author-designed save slot: background + freely placed parts. When enabled, this
 *  REPLACES the classic card layout (screenshot strip + info bar + slot label); the erase ✕
 *  and click behavior stay. Absent/disabled = classic card, pixel-identical to before. */
export interface UISlotDesign {
    enabled?: boolean;
    background?: { type: 'color'; value: string } | { type: 'image'; assetId: VNID | null };
    parts: UISlotDesignPart[];
}
export interface UISaveSlotGridElement extends BaseUIElement {
    type: UIElementType.SaveSlotGrid;
    /** TOTAL number of slots across all pages (the editor keeps this = slotsPerPage × pages). */
    slotCount: number;
    /** How many slots each page shows (grid layout only). Absent = the classic 4. */
    slotsPerPage?: number;
    /** How many columns the page arranges slots into. Absent = auto (2 for ≤4 per page,
     *  otherwise near-square). */
    slotColumns?: number;
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
    /** Hide the per-slot erase (✕) button shown on occupied slots. Default = shown. */
    hideEraseButtons?: boolean;
    /** Author-designed slot look (background art + freely placed screenshot/text/image parts).
     *  Absent or disabled = the classic card, unchanged. */
    slotDesign?: UISlotDesign;
    /** Hide the built-in ◀ Prev / Next ▶ buttons (for authors using their own Button elements
     *  with the "Save slots: next/previous page" actions). Default = shown. */
    hideNavButtons?: boolean;
    /** Hide the "Page 1 / 2" indicator between the nav buttons. Default = shown. */
    hidePageIndicator?: boolean;
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
    /** Pose shown in this preview (absent = the character's Default pose). Additive-optional. */
    poseId?: VNID;
    /** ⟨Player's Character⟩ targeting. When 'player', this element displays whichever character the
     *  player created (project.ui.playerCharacterVarId) and auto-detects that character's customizer
     *  outfit variables — no manual layerVariableMap needed. Absent/'fixed' = show `characterId`.
     *  Additive-optional. */
    characterSource?: 'fixed' | 'player';
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
    /** @deprecated Legacy single spacing — read only as a fallback for old projects.
     *  New grids use columnGap/rowGap; do not write this. */
    gap?: number;
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
    /** @deprecated Superseded by `slotButton`. Migrated to `slotButton:'use'` on load; no longer
     *  read or written. Kept so pre-migration projects still type-check. */
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
    /** Extra actions run when the slot button is clicked, AFTER the built-in Use/Buy/Sell — lets a
     *  purchase also play a sound, set a variable, jump, call a Common Event, etc. Element-level
     *  (applies to every slot's button). Additive-optional. */
    slotButtonActions?: VNUIAction[];
    // ── Free placement (parity with Save/Load + CG Gallery) ──
    /** 'grid' (default) auto-arranges; 'free' places each slot via `slotRects`. */
    slotLayout?: 'grid' | 'free';
    /** Per-slot rectangles (screen-%) when `slotLayout==='free'`; items fill them in order. */
    slotRects?: UISlotRect[];
    /** Drop the grid's background panel so the inventory floats over custom art (like CG Gallery). */
    hideBackgroundPanel?: boolean;
    /** Force square (1:1) slots. Undefined/true = today's look; false = slot fills its cell/rect. */
    squareSlots?: boolean;
    /** Drop each slot's box/border/fill so only the item (icon, name, button) shows. */
    hideSlotBox?: boolean;
    // ── Quantity badge appearance (when showQuantity) — defaults match today's top-right black ×N ──
    quantityFont?: VNFontSettings;
    quantityColor?: string;
    quantityBgColor?: string;
    quantityPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/** Hot spot — a trigger zone that fires actions on click, hover, or drag-drop.
 *  Lives as a regular UIElement; rendering is just a debug outline (visible? flag) and a hit-test area. */
export interface UIHotSpotElement extends BaseUIElement {
    type: UIElementType.HotSpot;
    shape: HotSpotShape;
    trigger: HotSpotTrigger;
    /** For drag-drop hot spots: which draggable element ids are accepted here */
    acceptedElementIds?: VNID[];
    /** For drag-drop hot spots: accept any dragged object whose `dragTag` matches this. */
    acceptTag?: string;
    /** Sticky visual cue colour (used for debug/edit-time and the visible-flag display) */
    highlightColor?: string;
    /** When true, the spot is drawn at runtime; otherwise it's only visible in the editor */
    visible?: boolean;
    /** How solid the drawn spot looks when `visible` is on (0..1, default 1). Purely visual —
     *  the click/drop area is unaffected. */
    visibleOpacity?: number;
}

/** A registry item shown on a screen — the item's icon renders automatically (stays in sync when
 *  the item's art changes), with an optional name label and a live count badge.
 *  Two modes:
 *   - 'display' (default): a showcase of something the player owns. Optionally visible only while
 *     owned, and (via the shared `draggable` flag) drag-and-droppable onto hot spots — the drop
 *     pipeline consumes/uses the item exactly like an inventory drag.
 *   - 'pickup': an item lying in the room. Click gives it to the player (optionally only once,
 *     recorded like the Show Item command's pickups), then the element hides.
 *  The shared BaseUIElement `actions` list runs on click in BOTH modes (after the give, for
 *  pickups) so authors can react dynamically. All fields additive-optional. */
export interface UIItemElement extends BaseUIElement {
    type: UIElementType.Item;
    /** Which registry item (project.items) this element shows. */
    itemId: VNID | null;
    /** 'display' (default) or 'pickup' — see above. */
    mode?: 'display' | 'pickup';
    /** Show the item's name under the icon. Default false. */
    showName?: boolean;
    /** Show a live ×N count badge (from the item's count variable). Default false. */
    showCount?: boolean;
    /** Display mode: only render while the player owns at least one. Default false. */
    onlyWhileOwned?: boolean;
    /** Pickup mode: how many the click gives (default 1). */
    pickupQuantity?: number;
    /** Pickup mode: once taken it stays gone (recorded like Show Item pickups). Default true. */
    pickupOnce?: boolean;
}

/** Image map — an image with clickable polygon/rect/circle regions. */
export interface UIdraggableImageElementElement extends BaseUIElement {
    type: UIElementType.draggableImageElement;
    image: UIAsset | null;
    /** Optional alternate image rendered, clipped to the currently-hovered region (Ren'Py-style) */
    hoverImage?: UIAsset | null;
    draggableImageElementRegions?: draggableImageElementRegion[];
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
    /** 'band' prints the NAME of the variable's current named range ("Friend") instead of a number.
     *  Falls back to the number if the variable has no bands, or the value sits below them all. */
    valueFormat?: 'value' | 'valueMax' | 'percent' | 'band';
    valueFont?: VNFontSettings;
    /** Take the fill colour from the variable's current named range, so the bar changes colour as it
     *  fills (cold → warm affection; green → red health). No bands → no effect. Additive-optional. */
    fillFromBand?: boolean;
    /** Visual style of the meter. 'bar' (default) = the classic clip-path fill; 'battery' = a phone-
     *  style battery (rounded body + terminal nub); 'segments' = N discrete cells; 'icons' = a symbol
     *  repeated N times (e.g. a hearts lives system). Additive-optional; unset/'bar' renders byte-
     *  identically to existing meters. */
    style?: 'bar' | 'battery' | 'segments' | 'icons';
    segmentCount?: number;   // for 'segments' (default 10)
    segmentGap?: number;     // px between segments (default 2)
    /** 'icons' style: repeat a symbol/image to make a lives/hearts display. */
    iconImage?: UIAsset | null;        // the "full" symbol (e.g. a full heart)
    iconEmptyImage?: UIAsset | null;   // optional empty/background symbol; absent → the full symbol dimmed
    iconCount?: number;                // how many symbols to show (default 3)
    iconStep?: 'full' | 'half' | 'quarter'; // smallest fill increment per symbol (default 'full')
    iconSize?: number;                 // symbol size in px (default 24)
    iconGap?: number;                  // px between symbols (default 4)
    /** Resource animations. The LOW-state set plays continuously while fill ≤ lowThresholdPct; the
     *  on-change animations play once when the value rises/falls. All optional → meters without them
     *  render exactly as before. */
    lowThresholdPct?: number;          // fill % at/below which the meter is "low" (default 25)
    lowAnimations?: Array<'shake' | 'pulse' | 'flash' | 'wave'>; // combine any
    lowFlashColor?: string;            // color for the 'flash' low effect (default red)
    changeAnimationUp?: 'none' | 'pop' | 'flash' | 'shake' | 'wave';   // when the value increases
    changeAnimationDown?: 'none' | 'pop' | 'flash' | 'shake' | 'wave'; // when the value decreases
    changeFlashColorUp?: string;       // flash color for an increase (default green)
    changeFlashColorDown?: string;     // flash color for a decrease (default red)
    /** Alignment of the content inside the element's bounding box. Most useful for the 'icons' style so
     *  hearts can sit centered and don't clip the edges; default left/top. */
    alignX?: 'left' | 'center' | 'right';
    alignY?: 'top' | 'center' | 'bottom';
}

/** Player-facing character customization / dress-up. Bundles what the old AssetCycler +
 *  CharacterPreview did into ONE element: it reads the character's existing layers as "categories",
 *  each category lets the player pick from that layer's assets, and the choice is stored in an
 *  auto-managed variable — so the look flows into scenes automatically (ShowCharacter reads the same
 *  variables). Additive: old projects keep their AssetCycler/CharacterPreview elements. */
/* NOTE: UICustomizerElement.poseId / UICharacterPreviewElement.poseId — "Pose shown in this
 * preview" — let a dress-up screen pin e.g. the head-on pose while the story shows others. */
export interface UICustomizerCategory {
    layerId: VNID;        // the character layer this category customizes
    label?: string;       // shown above the picker (defaults to the layer name)
    variableId: VNID;     // auto-created string variable holding the selected asset id
    pickerStyle?: 'swatches' | 'arrows' | 'buttons' | 'dropdown'; // how the player picks (default 'swatches')
}

/** Per-option (per-asset) rules for a Customizer, keyed by asset id. Replaces the old AssetCycler
 *  filterPattern with plain conditions. */
export interface UICustomizerOptionMeta {
    conditions?: VNCondition[];   // gating conditions (other category vars, coins, flags…)
    whenUnmet?: 'hide' | 'lock';  // conditions fail → hide the option (default) or show it locked
    swatchImage?: UIAsset | null; // optional custom thumbnail shown in the picker for this option
}
export interface UICustomizerElement extends BaseUIElement {
    type: UIElementType.Customizer;
    characterId: VNID;
    /** Pose shown in the dress-up preview (absent = Default pose). Additive-optional. */
    poseId?: VNID;
    expressionId?: VNID;          // fallback look for layers without a category/selection
    categories: UICustomizerCategory[];
    layout?: 'preview-left' | 'preview-right' | 'preview-top' | 'free';
    previewPercent?: number;      // % of the element devoted to the live preview (default 45)
    // ── Free placement (layout === 'free'): preview + pickers panel are two independently
    //    positioned/sized boxes (screen-%), like the Save/Load + Inventory free-slot system. ──
    previewRect?: UISlotRect;     // the character-preview box (free mode only)
    pickersRect?: UISlotRect;     // the controls/pickers panel box (free mode only)
    // Preview "box" styling — ALL default unset = NO box (the sprite floats over the author's own art).
    previewBackgroundColor?: string;
    previewBackgroundImage?: UIAsset | null;
    previewBorderColor?: string;
    previewBorderRadius?: number;
    hidePickersPanel?: boolean;   // drop the controls panel's bg/border/frame so the pickers float too
    showLabels?: boolean;         // show category labels (default true)
    font?: VNFontSettings;        // labels + asset names
    backgroundColor?: string;     // element panel background
    borderColor?: string;
    borderRadius?: number;
    swatchSize?: number;          // px per swatch (default 48)
    swatchGap?: number;           // px between swatches (default 6)
    selectedColor?: string;       // highlight ring for the selected swatch / button
    // 2b theming — all additive-optional
    backgroundImage?: UIAsset | null;  // frame/panel image behind the whole element
    arrowImage?: UIAsset | null;       // custom arrow for the 'arrows' picker (left side is mirrored)
    arrowColor?: string;               // arrow tint when no arrowImage (default light)
    arrowSize?: number;                // arrow size in px (default 28)
    buttonColor?: string;              // 'buttons' picker: unselected button background
    buttonTextColor?: string;          // 'buttons' picker: button text color
    // 2c — per-option rules + quick actions
    optionMeta?: Record<VNID, UICustomizerOptionMeta>; // per-asset rules, keyed by asset id
    showRandomize?: boolean;           // show a Randomize button
    showReset?: boolean;               // show a Reset-to-default button
    randomizeLabel?: string;           // default "Randomize"
    resetLabel?: string;               // default "Reset"
}

/**
 * An element type contributed by an extension (Phase C4). The extension registers a renderer
 * (`api.registerUIElementType`) that returns an HTML string from `props`; the editor canvas and the game
 * engine both render it inside the standard positioned/resizable element box. `props` holds the values
 * the user edits in the generated inspector. If the owning extension is missing, the element renders
 * nothing (save/load-safe).
 */
export interface UICustomElement extends BaseUIElement {
    type: UIElementType.Custom;
    /** The registered custom element type id (namespaced: `pluginId.typeId`). */
    pluginType: string;
    /** Field values configured in the inspector (keys defined by the type's `inspector` spec). */
    props: Record<string, any>;
}

/**
 * A Timer element: when its screen opens, it waits `durationSeconds` and then runs `actions`.
 * Great for a static screen that fires actions after some time (auto-advance, ambience, etc.).
 * Gated by the inherited `conditions` (if they fail the element never mounts, so the timer never starts).
 */
export interface UITimerElement extends BaseUIElement {
    type: UIElementType.Timer;
    /** Delay in seconds before the actions fire (after the screen opens). */
    durationSeconds: number;
    /** Show a small live countdown on the element (otherwise it's invisible during play). */
    showCountdown?: boolean;
    /** Re-arm and fire again every `durationSeconds` instead of once. */
    loop?: boolean;
    /** Actions run when the timer elapses (BaseUIElement already declares `actions?` optional). */
    actions?: VNUIAction[];
}

export type VNUIElement =
    | UIButtonElement | UITextElement | UIImageElement | UISaveSlotGridElement
    | UISettingsSliderElement | UISettingsToggleElement | UICharacterPreviewElement | UITextInputElement | UIDropdownElement | UICheckboxElement | UIAssetCyclerElement | UICGGalleryElement | UIInventoryGridElement
    | UIHotSpotElement | UIdraggableImageElementElement | UIMeterElement | UICustomizerElement | UITimerElement | UIItemElement | UICustomElement;

/** An extra background plane on a screen (for multi-plane parallax backdrops). */
export interface VNScreenBackgroundLayer {
    id: VNID;
    background: { type: 'color', value: string, opacity?: number } | { type: 'image' | 'video', assetId: VNID | null, loop?: boolean, trimStart?: number, trimEnd?: number, opacity?: number };
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
    background: { type: 'color', value: string, opacity?: number } | { type: 'image' | 'video', assetId: VNID | null, loop?: boolean, trimStart?: number, trimEnd?: number, opacity?: number };
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
    /** When true, the `Show Screen` COMMAND shows this screen as a non-blocking HUD overlay: the
     *  story keeps playing (the command advances immediately, parallel events keep running, and
     *  closing it does NOT advance the scene). Default (unset) = modal — `Show Screen` pauses the
     *  scene on this command until the screen is closed (today's behavior, so old projects are
     *  unchanged). Use for HP bars / status overlays that update as the game runs. Additive-optional. */
    hudNonBlocking?: boolean;
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
    acceptedElementIds?: VNID[]; // For drag-drop: which specific elements can be dropped here
    /** For drag-drop: accept ANY dragged object whose `dragTag` matches this (e.g. "key").
     *  Empty = fall back to acceptedElementIds (or accept anything if that's empty too). */
    acceptTag?: string;
    actions: VNUIAction[]; // Actions to run when triggered
    conditions?: VNCondition[]; // Only active when conditions are met
    highlightColor?: string; // Visual feedback color (debug/hover)
    visible?: boolean; // Whether to show the spot visually (default false)
    /** How solid the drawn spot looks when `visible` is on (0..1, default 1). Purely visual —
     *  the click/drop area is unaffected. */
    visibleOpacity?: number;
}

export type HotZoneElementType = 'image' | 'text' | 'button' | 'video' | 'textInput' | 'draggableImageElement';

export interface VNHotZoneElement {
    id: VNID;
    name: string;
    elementType?: HotZoneElementType; // default 'image'
    imageId: VNID; // Reference to project image asset (for image/button types)
    videoId?: VNID; // Reference to project video asset (for video type)
    videoLoop?: boolean; // Loop video playback
    videoMuted?: boolean; // Mute video audio
    videoTrimStart?: number; // Play only a slice (seconds); overrides the asset's default trim
    videoTrimEnd?: number;
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
    /** Optional label so hot spots can accept this object by tag instead of by id (e.g. tag every
     *  key "key", then a door hot spot that accepts "key" takes any of them). Additive-optional. */
    dragTag?: string;
    /** Optional inventory item this draggable represents. On a successful drop the item is consumed
     *  (unless reusable) and its use-effect runs. If `dragTag` is unset, the item's tag is used for
     *  hot-spot matching. Lets authors drag an item to a hot spot without an inventory. Additive-optional. */
    boundItemId?: VNID;
    conditions?: VNCondition[]; // Only visible when conditions are met
    actions?: VNUIAction[]; // Actions on click (when not dragging)
    clickSoundId?: VNID | null;
    hoverSoundId?: VNID | null;
    hoverImageId?: VNID; // Hover state image (for draggableImageElement type, Ren'Py-style)
    draggableImageElementRegions?: draggableImageElementRegion[]; // Clickable regions (for draggableImageElement type)
}

export interface VNHotZoneWinCondition {
    type: 'allPlaced' | 'variable';
    variableId?: VNID; // For variable-based win condition
    operator?: VNConditionOperator; // Comparison operator
    value?: string | number | boolean;
    actions: VNUIAction[]; // Actions to run when win condition is met
}
