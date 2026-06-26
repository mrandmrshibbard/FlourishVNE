import { VNID, VNPosition, VNTransition } from '../../types';
import { VNSetVariableOperator } from '../variables/types';
import { JumpToSceneAction, SetVariableAction, VNTextAlign, VNVAlign, VNCondition, VNUIAction, VNParallaxSettings } from '../../types/shared';
import type { VNScreenOverlayEffectType, VNSnowAshVariant } from '../../types';
import type { EasingType } from '../../components/live-preview/systems/easingFunctions';
import type { PhonePortraitSource } from '../ui/types';

/**
 * Command execution modifiers for parallel/async execution
 */
export interface CommandModifiers {
    /** If true, don't wait for this command to complete before advancing to next command */
    runAsync?: boolean;
    /** Visual grouping ID - commands with same stackId are displayed on the same line */
    stackId?: string;
    /** Order within a stack (lower numbers execute first) */
    stackOrder?: number;
}

/**
 * Commands that should NEVER run async (blocking by nature)
 */
export const BLOCKING_COMMAND_TYPES = [
    'Dialogue',
    'Choice',
    'TextInput',
    'BranchStart',
    'BranchElseIf',
    'BranchElse',
    'BranchEnd',
    'Jump',
    'JumpToLabel',
    'ShowScreen',
] as const;

/**
 * Commands that CAN run async but may have unpredictable results
 */
export const UNPREDICTABLE_ASYNC_COMMANDS = [
    'PlayMovie',
    'Wait',
] as const;

export enum CommandType {
    Dialogue = 'Dialogue',
    SetBackground = 'SetBackground',
    ShowCharacter = 'ShowCharacter',
    HideCharacter = 'HideCharacter',
    SetCharacterLayer = 'SetCharacterLayer',
    Choice = 'Choice',
    BranchStart = 'BranchStart',
    BranchElseIf = 'BranchElseIf',
    BranchElse = 'BranchElse',
    BranchEnd = 'BranchEnd',
    SetVariable = 'SetVariable',
    TextInput = 'TextInput',
    Jump = 'Jump',
    Label = 'Label',
    JumpToLabel = 'JumpToLabel',
    PlayMusic = 'PlayMusic',
    StopMusic = 'StopMusic',
    PlaySoundEffect = 'PlaySoundEffect',
    StopSoundEffect = 'StopSoundEffect',
    PlayMovie = 'PlayMovie',
    StopMovie = 'StopMovie',
    Wait = 'Wait',
    ShakeScreen = 'ShakeScreen',
    TintScreen = 'TintScreen',
    PanZoomScreen = 'PanZoomScreen',
    ResetScreenEffects = 'ResetScreenEffects',
    FlashScreen = 'FlashScreen',
    SetScreenOverlayEffect = 'SetScreenOverlayEffect',
    ShowScreen = 'ShowScreen',
    ShowText = 'ShowText',
    ShowImage = 'ShowImage',
    HideText = 'HideText',
    HideImage = 'HideImage',
    ShowButton = 'ShowButton',
    HideButton = 'HideButton',
    ShowItem = 'ShowItem',
    CreditRoll = 'CreditRoll',
    Group = 'Group', // Visual grouping only, no execution
    RunScript = 'RunScript', // Execute a user-defined script
    SpawnParticles = 'SpawnParticles', // Spawn a particle effect on stage
    StopParticles = 'StopParticles', // Stop/clear particle effects
    CallCommonEvent = 'CallCommonEvent', // Invoke a reusable Common Event
    ShowHotSpot = 'ShowHotSpot', // Place an interactive hot spot on the scene (click / hover / drop target)
    HideHotSpot = 'HideHotSpot', // Remove a scene hot spot
    TweenElement = 'TweenElement', // Animate position/size/opacity/etc. of an on-stage element over time
    GiveItem = 'GiveItem',     // Give the player N of an inventory item
    UseItem = 'UseItem',       // Consume one of an item (+ run its use-effect)
    DestroyItem = 'DestroyItem', // Remove N (or all) of an item
    RestockCollection = 'RestockCollection', // Refill an item list/collection's stock
    BuyItem = 'BuyItem',       // Buy an item from a shop list (spends currency)
    SellItem = 'SellItem',     // Sell an item to a shop list (gains currency)
    Lightning = 'Lightning',   // One-shot lightning flash(es), optionally synced with a thunder SFX
    Flashlight = 'Flashlight', // Darken the screen except a soft circle of light that follows the mouse
    Fireworks = 'Fireworks',   // One-shot fireworks burst/volley, optionally synced with a boom SFX
    PlaceLights = 'PlaceLights', // Place individually-positioned twinkling lights (candle/star/christmas)
    ClearLights = 'ClearLights', // Remove all placed lights
    // ─── Phone (in-game cellphone / messaging) ─── //
    ShowPhone = 'ShowPhone',         // Open the phone overlay
    HidePhone = 'HidePhone',         // Close the phone overlay
    ShowPhoneText = 'ShowPhoneText', // Append a message to the chat (auto-opens the phone). Labeled "Show Text"
    HidePhoneText = 'HidePhoneText', // Clear the chat conversation. Labeled "Hide Text"
    PhoneIncomingText = 'PhoneIncomingText', // A text "arrives": banner+ding (or auto-open), with replies/follow-ups
    PhoneIncomingCall = 'PhoneIncomingCall', // A call rings: accept/decline overlay (or non-blocking ring)
}

/**
 * Visual/state commands that may opt into live (reactive) conditions via
 * `liveConditions`. These place a persistent visual whose visibility can sensibly
 * follow a variable; sequential commands (Dialogue, Choice, Jump, SetVariable, audio,
 * Wait) are intentionally excluded — re-evaluating them live would break story flow.
 */
export const REACTIVE_VISUAL_TYPES: ReadonlySet<CommandType> = new Set([
    CommandType.SetBackground,
    CommandType.ShowImage,
    CommandType.ShowText,
    CommandType.ShowButton,
    CommandType.ShowItem,
    CommandType.ShowCharacter,
    CommandType.ShowHotSpot,
]);

interface BaseCommand {
    id: VNID;
    type: CommandType;
    conditions?: VNCondition[];
    /**
     * Opt-in for the visual/state commands (see REACTIVE_VISUAL_TYPES): when true the
     * command's visual is always created and its `conditions` are re-evaluated every
     * render (show/hide live as variables change), instead of the default one-time
     * "run if conditions met when reached" behavior. Ignored for non-visual commands.
     */
    liveConditions?: boolean;
    modifiers?: CommandModifiers;
    /**
     * Stage stacking order for visual commands (ShowImage/ShowCharacter/ShowText/
     * ShowButton/PlayMovie/hot spots/image maps). Higher = nearer the viewer. Optional;
     * when undefined the visual uses its default type-band order (back-compat, no
     * migration). Confined to the scene stage — never overlaps the dialogue/HUD bands.
     */
    layer?: number;
    /**
     * Parallax depth for visual commands. 0/undefined = locked (no parallax). Higher moves
     * more with the pointer/camera. Render-time offset only; composes with `layer`. The
     * scene's `parallax` setting decides whether/how it's driven.
     */
    parallaxDepth?: number;
}

/**
 * Text effect types for per-character animated dialogue text
 */
export type VNTextEffectType = 'none' | 'shake' | 'wave' | 'rainbow' | 'glitch' | 'pulse' | 'fade-in' | 'bounce' | 'typewriter-bounce';

export interface VNDialogueTextEffect {
    /** The effect type to apply */
    type: VNTextEffectType;
    /** Effect speed multiplier (0.1-5, default 1) */
    speed?: number;
    /** Effect intensity/amplitude (0.1-3, default 1) */
    intensity?: number;
}

export interface DialogueCommand extends BaseCommand {
    type: CommandType.Dialogue;
    characterId: VNID | null;
    text: string;
    /** Optional voice audio clip to play with this dialogue line */
    voiceAudioId?: VNID | null;
    /** Per-line text effect override (if not set, uses character default) */
    textEffect?: VNDialogueTextEffect;
    /** Per-line textbox theme override (project.textboxThemes). Overrides the speaker's default
     *  textbox/theme for this line only. Unset = use the character's textbox/theme. */
    textboxThemeId?: VNID | null;
    /** If true, keeps this dialogue box open when the next command is a Choice command */
    keepOpenDuringChoices?: boolean;
    /** Per-line text-speed override (chars/sec scale, same 1-100 range as the global Text Speed
     *  setting). Unset = use the player's global text speed. Additive-optional. */
    textSpeed?: number;
}

export interface SetBackgroundCommand extends BaseCommand {
    type: CommandType.SetBackground;
    /** Asset id of the background image/video. Ignored when `backgroundColor` is set. */
    backgroundId: VNID;
    /**
     * Optional solid color background (e.g. `#1a102c` or `rgba(...)`).
     * When defined, the engine renders a solid color instead of resolving
     * `backgroundId` to an image/video. Use this for color-only scenes.
     */
    backgroundColor?: string;
    transition: VNTransition;
    duration: number; // in seconds
    /** Loop the video while shown (additive; SetBackground reads the asset's loop flag when unset). */
    loop?: boolean;
    /** Play only a slice of a video background (seconds). Overrides the asset's default trim. */
    trimStart?: number;
    trimEnd?: number;
    /**
     * When true, this background is ADDED as its own persistent plane (keyed by command id)
     * at its `layer`/`parallaxDepth` instead of replacing the base background. Lets authors
     * stack multiple backdrops for multi-plane parallax scrolling. Default/undefined = the
     * normal replace behavior. Each stacked plane plays its own entry transition once on
     * mount. Additive-optional — older projects/saves are unaffected.
     */
    stack?: boolean;
}

/**
 * Per-character visual effect types
 */
export type VNCharacterVisualEffectType = 'none' | 'shake' | 'bounce' | 'float' | 'pulse' | 'glow' | 'tint' | 'silhouette' | 'breathing' | 'flicker';

export interface VNCharacterVisualEffect {
    /** The visual effect to apply to the character on stage */
    type: VNCharacterVisualEffectType;
    /** Effect speed multiplier (0.1-5, default 1) */
    speed?: number;
    /** Effect intensity/amplitude (0.1-3, default 1) */
    intensity?: number;
    /** Optional color for tint/glow/silhouette effects */
    color?: string;
}

export interface ShowCharacterCommand extends BaseCommand {
    type: CommandType.ShowCharacter;
    characterId: VNID;
    expressionId: VNID;
    position: VNPosition;
    transition: VNTransition;
    duration: number; // in seconds
    startPosition?: VNPosition; // for slide transitions
    endPosition?: VNPosition; // for slide transitions
    /** When true and the character is already on stage, keep its current position (only the
     *  expression/pose changes — `position` is ignored). Default off. Additive-optional. */
    keepPosition?: boolean;
    /** Scale multiplier (1 = 100%). Controls character sprite size on stage. */
    scale?: number;
    /** When true, flips the character sprite horizontally (scaleX = -1). Acts as flipX. */
    inverted?: boolean;
    /** Rotation in degrees (positive = clockwise). */
    rotation?: number;
    /** When true, flips the character sprite vertically. */
    flipY?: boolean;
    /** Optional visual effects applied to the character while on stage (multiple can stack) */
    visualEffects?: VNCharacterVisualEffect[];
    /** @deprecated Use visualEffects instead — kept for backward compatibility */
    visualEffect?: VNCharacterVisualEffect;
    /** Per-layer overrides applied ON TOP of the expression (the optional "preset"): layerId → assetId,
     *  or null to clear that layer. Lets a look compose (e.g. happy face + school outfit + blush on)
     *  without a dedicated expression. Additive-optional; empty = today's behavior. */
    layerOverrides?: Record<VNID, VNID | null>;
}

export interface HideCharacterCommand extends BaseCommand {
    type: CommandType.HideCharacter;
    characterId: VNID;
    transition: VNTransition;
    duration: number; // in seconds
    startPosition?: VNPosition; // for slide transitions
    endPosition?: VNPosition; // for slide transitions
}

/** Change one or more LAYERS on a character already on stage, without re-showing the whole sprite
 *  (e.g. blush on, draw weapon, swap hat). Composes with the character's current look. */
export interface SetCharacterLayerCommand extends BaseCommand {
    type: CommandType.SetCharacterLayer;
    characterId: VNID;
    layers: Array<{ layerId: VNID; assetId: VNID | null }>; // null clears that layer
    transition?: VNTransition;  // optional crossfade of the character to the new look ('instant'/undefined = swap)
    duration?: number;          // transition duration in seconds (default 0.3)
}

// Choice actions now support all UI button actions for maximum flexibility
export type ChoiceAction = VNUIAction;

export interface ChoiceOption {
    id: VNID;
    text: string;
    actions?: ChoiceAction[];
    conditions?: VNCondition[];
    targetSceneId?: VNID; // Deprecated, for migration
    // ── Per-option placement (only used when the Choice's layout is 'free') ──
    // Percentages of the stage, top-left anchored (matches quick-menu independent layout).
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    // ── Per-option appearance overrides (any layout). Unset → global project.ui.choice* style. ──
    image?: { type: 'image' | 'video'; id: VNID; trimStart?: number; trimEnd?: number } | null;
    hoverImage?: { type: 'image' | 'video'; id: VNID; trimStart?: number; trimEnd?: number } | null;
    backgroundColor?: string;
    hoverBackgroundColor?: string;
    textColor?: string;
    fontSize?: number;       // px
    borderRadius?: number;   // px
}
export interface ChoiceCommand extends BaseCommand {
    type: CommandType.Choice;
    options: ChoiceOption[];
    /** How the choice buttons are arranged. undefined/'vertical' = the classic centered stack
     *  (unchanged default); 'horizontal' = a centered row; 'free' = each option positioned by its
     *  own x/y/width/height (drag/resize on the canvas). Additive-optional. */
    layout?: 'vertical' | 'horizontal' | 'free';
}

export interface BranchStartCommand extends BaseCommand {
    type: CommandType.BranchStart;
    name: string;
    color: string;
    branchId: VNID;
    isCollapsed?: boolean;
}

// "Otherwise if" — an additional condition segment in the same branch (shares branchId).
// Conditions come from BaseCommand. Additive/optional: branches without these behave exactly
// as a plain if-block, so projects saved before this load and run unchanged.
export interface BranchElseIfCommand extends BaseCommand {
    type: CommandType.BranchElseIf;
    branchId: VNID;
}

// "Otherwise" — the fallback segment that runs when no prior condition matched (shares branchId).
export interface BranchElseCommand extends BaseCommand {
    type: CommandType.BranchElse;
    branchId: VNID;
}

export interface BranchEndCommand extends BaseCommand {
    type: CommandType.BranchEnd;
    branchId: VNID;
}

export interface SetVariableCommand extends BaseCommand {
    type: CommandType.SetVariable;
    variableId: VNID;
    operator: VNSetVariableOperator;
    value: string | number | boolean;
    randomMin?: number; // For random operator - minimum value (inclusive)
    randomMax?: number; // For random operator - maximum value (inclusive)
}

export interface TextInputCommand extends BaseCommand {
    type: CommandType.TextInput;
    variableId: VNID;
    prompt: string;
    placeholder?: string;
    maxLength?: number;
}

export interface JumpCommand extends BaseCommand {
    type: CommandType.Jump;
    targetSceneId: VNID;
}

export interface LabelCommand extends BaseCommand {
    type: CommandType.Label;
    labelId: string;
}

export interface JumpToLabelCommand extends BaseCommand {
    type: CommandType.JumpToLabel;
    labelId: string;
}

export interface PlayMusicCommand extends BaseCommand {
    type: CommandType.PlayMusic;
    audioId: VNID;
    loop: boolean;
    fadeDuration: number; // in seconds
    volume?: number; // optional per-command volume override (0-1)
}
export interface StopMusicCommand extends BaseCommand {
    type: CommandType.StopMusic;
    fadeDuration: number; // in seconds
}
export interface PlaySoundEffectCommand extends BaseCommand {
    type: CommandType.PlaySoundEffect;
    audioId: VNID;
    volume?: number; // optional per-sfx volume (0-1)
    /** Loop the sound until a Stop Sound Effect command (or, when live, until its condition fails). */
    loop?: boolean;
    // NOTE: `conditions` + `liveConditions` (on BaseCommand) drive live evaluation — when
    // `liveConditions` is set, the sound plays while the conditions are met (looping) or fires
    // once each time they become true (non-loop), re-evaluated as variables change.
}
export interface StopSoundEffectCommand extends BaseCommand {
    type: CommandType.StopSoundEffect;
    /** Target sound to stop. Empty/undefined = stop all sound effects. */
    audioId?: VNID;
    /** Fade-out duration in seconds. 0/undefined = stop instantly. */
    fadeDuration?: number;
}
export interface PlayMovieCommand extends BaseCommand {
    type: CommandType.PlayMovie;
    videoId: VNID;
    waitsForCompletion: boolean;
    /** Play only a slice of the source video (seconds) — reuse one long video as many clips.
     *  Overrides the asset's default trim. With `loop`, the slice loops; else it holds the end. */
    trimStart?: number;
    trimEnd?: number;
    /** How the movie is displayed: 'fullscreen' = opaque black overlay, 'overlay' = transparent layer over stage */
    displayMode?: 'fullscreen' | 'overlay';
    /** Whether the movie loops continuously */
    loop?: boolean;
    /** When the (non-looping) movie ends, freeze on its last frame instead of clearing/advancing.
     *  Lets a one-shot clip hold its final frame (e.g. a video transition that should stay). */
    holdLastFrame?: boolean;
    /** Entry transition for the movie when it appears (fade/dissolve/etc.). Default = instant. */
    transition?: VNTransition;
    /** Entry transition duration in seconds (default 0.5). */
    transitionDuration?: number;
    /** X position as percentage (0-100). Default: 0 (left edge) */
    x?: number;
    /** Y position as percentage (0-100). Default: 0 (top edge) */
    y?: number;
    /** Width as percentage of stage (0-100). Default: 100 */
    width?: number;
    /** Height as percentage of stage (0-100). Default: 100 */
    height?: number;
    /** Opacity (0-1). Default: 1 */
    opacity?: number;
    /** How the video fits within its container. 'custom' = use x/y/width/height for manual positioning */
    objectFit?: 'cover' | 'contain' | 'fill' | 'custom';
}
export interface StopMovieCommand extends BaseCommand {
    type: CommandType.StopMovie;
}

export interface WaitCommand extends BaseCommand {
    type: CommandType.Wait;
    duration: number; // in seconds
    waitForInput?: boolean; // Allow early advancement via input while still respecting duration
    waitIndefinitelyForInput?: boolean; // Wait indefinitely until user input (ignores duration)
    /** Wait until the player has collected the target item(s) (owned count >= 1), then advance.
     *  Pairs with Show Item pickups / Give Item. Ignores duration like waitIndefinitelyForInput. */
    waitForItems?: boolean;
    /** Items to wait for (collected = the item's count variable is >= 1). */
    targetItemIds?: VNID[];
    /** Whether ALL target items must be collected (default) or ANY one of them. */
    itemsMode?: 'all' | 'any';
}
export interface ShakeScreenCommand extends BaseCommand {
    type: CommandType.ShakeScreen;
    duration: number; // in seconds
    intensity: number;
}

export interface TintScreenCommand extends BaseCommand {
    type: CommandType.TintScreen;
    color: string;
    duration: number; // in seconds
}
export interface PanZoomScreenCommand extends BaseCommand {
    type: CommandType.PanZoomScreen;
    zoom: number;
    panX: number; // percentage (0-100)
    panY: number; // percentage (0-100)
    duration: number; // in seconds
}
export interface ResetScreenEffectsCommand extends BaseCommand {
    type: CommandType.ResetScreenEffects;
    duration: number; // in seconds
}
export interface FlashScreenCommand extends BaseCommand {
    type: CommandType.FlashScreen;
    color: string;
    duration: number; // in seconds
}

export interface LightningCommand extends BaseCommand {
    type: CommandType.Lightning;
    color?: string;        // flash color (default near-white #EAF2FF)
    intensity?: number;    // 0..1 peak brightness (default 0.9)
    duration?: number;     // total flicker duration in seconds (default 0.7)
    flashes?: 1 | 2 | 3;   // flicker pattern (default 2)
    thunderSfxId?: VNID | null; // optional thunder audio asset
    thunderDelay?: number; // seconds after the flash before thunder plays (default 0.6)
    thunderVolume?: number; // 0..1 (default uses sfx volume)
    /** When false, the flash sits BEHIND the dialogue box so it isn't lit (default true = flashes everything). */
    affectsDialogue?: boolean;
}

export interface FireworksCommand extends BaseCommand {
    type: CommandType.Fireworks;
    colors?: string[];      // burst colors, chosen at random per burst (default festive palette)
    bursts?: number;        // rockets in this volley (default 3)
    duration?: number;      // total seconds the volley runs (default 2.5)
    intensity?: number;     // 0..1 overall brightness/opacity (default 1)
    burstHeight?: number;   // 0..1 how high the bursts explode (0 = low, 1 = near top; default 0.7)
    sfxId?: VNID | null;    // optional boom SFX
    sfxDelay?: number;      // seconds before the first boom (default 0.3)
    sfxVolume?: number;     // 0..1
    sfxPerBurst?: boolean;  // play the boom on every burst instead of once (default false)
    /** When false, fireworks sit BEHIND the dialogue box (default true). */
    affectsDialogue?: boolean;
}

export type VNLightType = 'candle' | 'star' | 'christmas';
/** Twinkle styles (mainly for christmas bulbs; candle = warm flicker, star = gentle sparkle). */
export type VNLightTwinkle = 'steady' | 'fade' | 'blink' | 'chase';

/** A single placed, twinkling light. Position is a percentage of the stage (0..100). */
export interface VNLight {
    id: VNID;
    type: VNLightType;
    x: number;
    y: number;
    size?: number;        // relative size multiplier (~0.5..3, default 1)
    color?: string;       // bulb/star color (candle ignores this — always warm)
    twinkle?: VNLightTwinkle; // christmas blink style (default 'fade')
    twinkleSpeed?: number;    // speed multiplier (default 1)
    brightness?: number;      // 0..1 (default 1)
}

export interface PlaceLightsCommand extends BaseCommand {
    type: CommandType.PlaceLights;
    lights: VNLight[];
    /** Render the lights in FRONT of characters (default false = behind characters, on the scene). */
    aboveCharacters?: boolean;
}

export interface ClearLightsCommand extends BaseCommand {
    type: CommandType.ClearLights;
}

export interface FlashlightCommand extends BaseCommand {
    type: CommandType.Flashlight;
    /** Turn the flashlight on or off. */
    enabled: boolean;
    /** Light circle radius as % of the smaller screen dimension (default 22). */
    radius?: number;
    /** Edge softness/feather, 0..1 (default 0.6 = soft falloff). */
    softness?: number;
    /** How dark the rest of the screen gets, 0..1 (default 0.85). */
    darkness?: number;
    /** Darkness/vignette color (default black). */
    color?: string;
    /** Optional key the player can press to toggle the flashlight on/off (e.g. "f"). */
    toggleKey?: string;
    /** Optional SFX played when the flashlight turns on (e.g. a click). */
    sfxId?: VNID | null;
    /** When false, the dialogue box stays fully lit above the darkness (default true = it dims too). */
    affectsDialogue?: boolean;
    /** When true, switching the flashlight OFF (toggle key) keeps the screen pitch-black instead of
     *  revealing it — for dark rooms. The darkness only ends via a Flashlight → Turn off command.
     *  Default false (off reveals the scene). */
    darkWhenOff?: boolean;
}

export interface SetScreenOverlayEffectCommand extends BaseCommand {
    type: CommandType.SetScreenOverlayEffect;
    effectType: VNScreenOverlayEffectType;
    /** 0..1 (0 disables) */
    intensity: number;
    /** Only used for snowAsh */
    variant?: VNSnowAshVariant;
    /** Optional color for the effect (hex string like #FFAA00) */
    color?: string;
    /** Duration in seconds before effect auto-removes. 0 = persistent (until cleared). */
    duration?: number;
    /** Optional per-effect parameters */
    params?: import('../../types/screen-effects').VNEffectParams;
}
export interface ShowScreenCommand extends BaseCommand {
    type: CommandType.ShowScreen;
    screenId: VNID;
}

export interface VNTextShadow {
    enabled: boolean;
    offsetX: number;
    offsetY: number;
    blur: number;
    color: string;
}

export interface VNTextGradient {
    enabled: boolean;
    type: 'linear' | 'radial';
    angle: number; // degrees, for linear
    colors: string[]; // at least 2 stops
}

export interface VNTextBorder {
    enabled: boolean;
    width: number; // px
    color: string;
}

export interface ShowTextCommand extends BaseCommand {
    type: CommandType.ShowText;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    width?: number;
    height?: number;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    letterSpacing?: number;
    textShadow?: VNTextShadow;
    textGradient?: VNTextGradient;
    textBorder?: VNTextBorder;
    textAlign?: VNTextAlign;
    verticalAlign?: VNVAlign;
    transition: VNTransition;
    duration: number; // in seconds
    // Orientation (shared across visual elements)
    rotation?: number;  // degrees, positive = clockwise
    flipX?: boolean;    // mirror horizontally
    flipY?: boolean;    // mirror vertically
    /** When true, the on-stage text re-interpolates its {variable} tokens against the CURRENT
     *  variable values on every render, so displayed values update live (e.g. a running score).
     *  Default (unset) keeps today's behavior: text is interpolated once when the command runs.
     *  Additive-optional. */
    liveText?: boolean;
}

export interface ShowImageCommand extends BaseCommand {
    type: CommandType.ShowImage;
    imageId: VNID;
    /** Play only a slice of a video (seconds). Overrides the asset's default trim. */
    trimStart?: number;
    trimEnd?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    scaleX?: number;
    scaleY?: number;
    flipX?: boolean;    // mirror horizontally (composed with scaleX)
    flipY?: boolean;    // mirror vertically (composed with scaleY)
    transition: VNTransition;
    duration: number; // in seconds
    /** When true, width/height act as a max bound and the displayed image + its footprint shrink
     *  to the fitted (undistorted) art — no empty margin around it. Additive-optional. */
    fitToContent?: boolean;
}

export interface HideTextCommand extends BaseCommand {
    type: CommandType.HideText;
    targetCommandId: VNID;
    transition: VNTransition;
    duration: number; // in seconds
}

export interface HideImageCommand extends BaseCommand {
    type: CommandType.HideImage;
    targetCommandId: VNID;
    transition: VNTransition;
    duration: number; // in seconds
}

export interface ShowButtonCommand extends BaseCommand {
    type: CommandType.ShowButton;
    text: string;
    x: number; // percentage
    y: number; // percentage
    width?: number; // percentage, optional
    height?: number; // percentage, optional
    anchorX?: number; // 0-1, default 0.5
    anchorY?: number; // 0-1, default 0.5
    // Styling
    backgroundColor?: string;
    textColor?: string;
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    textAlign?: 'left' | 'center' | 'right'; // horizontal text alignment, default 'center'
    paddingX?: number; // inner horizontal padding in % of button width; keeps non-centered text off the edge; default 0
    borderRadius?: number; // pixels
    opacity?: number; // 0-1, default 1
    // Images (optional)
    image?: { type: 'image' | 'video', id: VNID, trimStart?: number, trimEnd?: number } | null;
    hoverImage?: { type: 'image' | 'video', id: VNID, trimStart?: number, trimEnd?: number } | null;
    // Actions
    onClick: VNUIAction;
    actions?: VNUIAction[]; // Multiple actions support
    clickSound?: VNID | null;
    waitForClick?: boolean; // If true, pause execution until button is clicked
    /** Quick-menu mode: when true, clicking the button fires its actions WITHOUT
     *  advancing the dialogue and WITHOUT consuming the click. Useful for
     *  user-designed Log / Auto / Skip / Settings buttons that should sit on top
     *  of the dialogue without interrupting it — same behavior as the built-in
     *  quick menu buttons. The button also stays on screen instead of being
     *  dismissed (no need to be re-shown). */
    quickMenuMode?: boolean;
    // Transition
    transition?: VNTransition;
    duration?: number; // in seconds
    // Orientation (shared across visual elements)
    rotation?: number;  // degrees, positive = clockwise
    flipX?: boolean;    // mirror horizontally
    flipY?: boolean;    // mirror vertically
    // Conditions
    showConditions?: VNCondition[];
}

export interface HideButtonCommand extends BaseCommand {
    type: CommandType.HideButton;
    targetCommandId: VNID;
    transition?: VNTransition;
    duration?: number; // in seconds
}

/** A clickable item placed in the scene. Shows the item's icon; clicking it gives the item to the
 *  player and (by default) removes itself. Reuses the ButtonOverlay render/staging path. */
export interface ShowItemCommand extends BaseCommand {
    type: CommandType.ShowItem;
    itemId: VNID;
    quantity?: number;                 // given on pickup (default 1; unique items set to 1)
    x: number; // percentage
    y: number; // percentage
    width?: number;  // percentage (default ~10%)
    height?: number; // percentage (default auto from icon)
    anchorX?: number; // 0-1, default 0.5
    anchorY?: number; // 0-1, default 0.5
    opacity?: number; // 0-1, default 1
    /** Optional visual override; defaults to the item's registry icon. */
    image?: { type: 'image' | 'video', id: VNID, trimStart?: number, trimEnd?: number } | null;
    hoverImage?: { type: 'image' | 'video', id: VNID, trimStart?: number, trimEnd?: number } | null;
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    giveOnClick?: boolean;        // default true → click runs GiveItem(itemId, quantity)
    /** When true, the player can press-and-drag this on-scene item onto a drop-zone hot spot (uses the
     *  item's Drag tag to match). On a successful drop the hot spot's actions fire + the icon is
     *  removed. A plain click still does giveOnClick. Additive-optional. No inventory required. */
    draggable?: boolean;
    removeAfterPickup?: boolean;  // default true → the icon disappears on click
    pickUpOnce?: boolean;         // default true → remembered across scene revisits + saves
    actions?: VNUIAction[];       // extra on-click actions
    clickSound?: VNID | null;
    showConditions?: VNCondition[];
    transition?: VNTransition;
    duration?: number; // in seconds
}

export interface GroupCommand extends BaseCommand {
    type: CommandType.Group;
    name: string;
    /** IDs of commands contained in this group */
    commandIds: VNID[];
    /** Visual state - collapsed or expanded */
    collapsed?: boolean;
}

/** A credit entry: either a heading/section title or a role+name pair */
export interface CreditEntry {
    /** 'heading' for section titles (e.g. "Cast"), 'credit' for role/name pairs */
    kind: 'heading' | 'credit';
    /** Section title or role (e.g. "Director", "Lead Writer") */
    label: string;
    /** Name(s) — only used when kind='credit' */
    value?: string;
}

export interface CreditRollCommand extends BaseCommand {
    type: CommandType.CreditRoll;
    /** Structured credit entries */
    entries: CreditEntry[];
    /** Total scroll duration in seconds (used as fallback if scrollSpeed is not set) */
    duration: number;
    /** Scroll speed in pixels per second (overrides duration-based calculation) */
    scrollSpeed?: number;
    /** Background color behind credits (hex with alpha) */
    backgroundColor: string;
    /** Text color (hex) */
    textColor: string;
    /** Whether clicking/pressing skips the credit roll */
    allowSkip: boolean;
    /** What happens when credits finish: 'advance' continues to next command, 'title' returns to title screen */
    onComplete: 'advance' | 'title';
    /** Optional slideshow backgrounds that cycle while credits scroll */
    backgrounds?: CreditBackground[];
    /** Optional foreground media items shown during credit roll (images/videos with positioning) */
    media?: CreditMedia[];
}

/** A foreground media item displayed during credit roll */
export interface CreditMedia {
    /** Asset ID referencing an image or video */
    assetId: VNID | null;
    /** Play only a slice of a video (seconds). Overrides the asset's default trim. */
    trimStart?: number;
    trimEnd?: number;
    /** X position as percentage (0-100) */
    x: number;
    /** Y position as percentage (0-100) */
    y: number;
    /** Width as percentage of stage (0-100) */
    width: number;
    /** Height as percentage of stage (0-100) */
    height: number;
    /** Opacity (0-1). Default: 1 */
    opacity: number;
    /** How the media fits within its container. 'custom' = manual positioning */
    objectFit: 'cover' | 'contain' | 'fill' | 'custom';
    /** When to show this media (seconds from start, 0 = immediately) */
    showAt: number;
    /** When to hide this media (seconds from start, 0 = show for entire credits) */
    hideAt: number;
    /** Transition to use when showing/hiding */
    transition: 'fade' | 'instant';
    /** Transition duration in seconds */
    transitionDuration: number;
}

/** A background slide shown during credit roll */
export interface CreditBackground {
    /** Asset ID referencing a background or image */
    assetId: VNID | null;
    /** Play only a slice of a video (seconds). Overrides the asset's default trim. */
    trimStart?: number;
    trimEnd?: number;
    /** How long this slide is displayed (seconds) */
    displayDuration: number;
    /** Transition to use when switching TO this slide */
    transition: 'fade' | 'dissolve' | 'instant';
    /** Transition duration in seconds */
    transitionDuration: number;
    /** X position as percentage (0-100). Default: 0 */
    x?: number;
    /** Y position as percentage (0-100). Default: 0 */
    y?: number;
    /** Width as percentage of stage (0-100). Default: 100 */
    width?: number;
    /** Height as percentage of stage (0-100). Default: 100 */
    height?: number;
    /** Opacity (0-1). Default: 1 */
    opacity?: number;
    /** How the media fits within its container. 'custom' = manual positioning */
    objectFit?: 'cover' | 'contain' | 'fill' | 'custom';
}

export interface RunScriptCommand extends BaseCommand {
    type: CommandType.RunScript;
    /** ID of the script to execute (references project.scripts) */
    scriptId: VNID;
    /** Whether to wait for async scripts to complete before advancing */
    waitForCompletion: boolean;
    /** Argument values for the script's params, keyed by param ID. Additive/optional. */
    arguments?: Record<VNID, string | number | boolean>;
}

/**
 * Particle shape presets for the particle system
 */
export type VNParticleShape = 'circle' | 'square' | 'star' | 'heart' | 'sparkle' | 'custom';

/**
 * Particle emitter configuration
 */
export interface VNParticleConfig {
    /** Display name for this particle effect */
    name?: string;
    /** Particle preset: built-in configurations for common effects */
    preset?: 'none' | 'fireflies' | 'sparks' | 'bubbles' | 'confetti' | 'embers' | 'dust' | 'petals' | 'magic' | 'stars';
    /** Particle shape */
    shape: VNParticleShape;
    /** Particle color(s) - multiple for random selection */
    colors: string[];
    /** Particles emitted per second */
    emitRate: number;
    /** Particle lifetime in seconds */
    lifetime: number;
    /** Min starting speed (pixels/sec) */
    speedMin: number;
    /** Max starting speed (pixels/sec) */
    speedMax: number;
    /** Min particle size in pixels */
    sizeMin: number;
    /** Max particle size in pixels */
    sizeMax: number;
    /** Gravity force (positive = down, negative = up) */
    gravity: number;
    /** Horizontal wind force */
    wind: number;
    /** Emission direction in degrees (0 = right, 90 = up, 180 = left, 270 = down) */
    directionMin: number;
    /** Emission direction max (particles spawn with direction uniformly in [min, max]) */
    directionMax: number;
    /** Emitter X position as % of stage width (0-100) */
    emitterX: number;
    /** Emitter Y position as % of stage height (0-100) */
    emitterY: number;
    /** Emitter width spread as % of stage width (0-100, 0 = point source) */
    emitterWidth: number;
    /** Emitter height spread as % of stage height (0-100, 0 = point source) */
    emitterHeight: number;
    /** Whether particles fade out over lifetime */
    fadeOut: boolean;
    /** Whether particles shrink over lifetime */
    shrink: boolean;
    /** Rotation speed in degrees/sec (0 = no rotation) */
    rotationSpeed: number;
    /** Opacity of particles (0-1) */
    opacity: number;
    /** Blend mode for particle rendering */
    blendMode?: 'source-over' | 'screen' | 'lighter' | 'overlay';
    /** Optional image asset ID for custom particle shape */
    customImageId?: VNID | null;
}

export interface SpawnParticlesCommand extends BaseCommand {
    type: CommandType.SpawnParticles;
    /** Unique tag to identify this particle effect (for stopping later) */
    particleTag: string;
    /** Particle emitter configuration */
    config: VNParticleConfig;
    /** Duration before auto-stop (0 = persistent until StopParticles) */
    duration: number;
}

export interface StopParticlesCommand extends BaseCommand {
    type: CommandType.StopParticles;
    /** Tag of particle effect to stop (empty = stop all) */
    particleTag: string;
    /** Fade out duration in seconds (0 = instant) */
    fadeDuration: number;
}

export interface CallCommonEventCommand extends BaseCommand {
    type: CommandType.CallCommonEvent;
    /** ID of the Common Event to invoke */
    commonEventId: VNID;
    /** Argument values keyed by parameter ID (for parameterised events) */
    arguments?: Record<VNID, string | number | boolean>;
}

/** A clickable region within an image map */
export interface draggableImageElementRegion {
    id: VNID;
    name: string;
    shape: 'rect' | 'circle' | 'poly';
    /** For rect: [x%, y%, width%, height%]. For circle: [cx%, cy%, radius%]. For poly: [x1%, y1%, x2%, y2%, ...] */
    coords: number[];
    /** Actions triggered when this region is clicked */
    actions: VNUIAction[];
    /** Optional hover tooltip text */
    tooltip?: string;
    /** Cursor on hover (default 'pointer') */
    cursor?: string;
    /** Highlight color on hover (CSS color, semi-transparent recommended) */
    highlightColor?: string;
    /** Only active when these conditions are met */
    conditions?: VNCondition[];
}

/** An interactive hot spot placed on the scene stage. Click/hover fires its actions;
 *  a drag-drop spot is a drop target reachable from any surface via the drop-target
 *  registry (e.g. drag an item from the HUD onto it). Mirrors screen hot spots. */
export interface ShowHotSpotCommand extends BaseCommand {
    type: CommandType.ShowHotSpot;
    name: string;
    x: number; // percentage
    y: number; // percentage
    width: number; // percentage
    height: number; // percentage
    shape: 'rect' | 'circle';
    trigger: 'click' | 'hover' | 'drag-drop';
    /** Actions fired when triggered (clicked, hovered, or dropped onto). */
    actions: VNUIAction[];
    /** Only active when these conditions are met. */
    conditions?: VNCondition[];
    /** For drag-drop: only accept a dragged element carrying this tag (empty = accept any). */
    acceptedTag?: string;
    /** Outline colour for edit-time + when visible. */
    highlightColor?: string;
    /** Draw the spot at runtime (otherwise it's an invisible hit area). */
    visible?: boolean;
    /** If true, a click trigger also advances the dialogue (default false — the click is consumed). */
    advanceOnTrigger?: boolean;
}

export interface HideHotSpotCommand extends BaseCommand {
    type: CommandType.HideHotSpot;
    targetCommandId: VNID;
}

/** Target element type for tween commands */
export type TweenTargetType = 'character' | 'image' | 'text' | 'button' | 'screen' | 'movie';

/**
 * Tween command — smoothly animates properties of an on-stage element over time.
 * Works with characters, images, text overlays, buttons, and screen effects.
 */
export interface TweenElementCommand extends BaseCommand {
    type: CommandType.TweenElement;
    /** ID of the target element (characterId for characters, command id for overlays) */
    targetId: VNID;
    /** Type of the target element */
    targetType: TweenTargetType;
    /** Duration of the tween in seconds */
    duration: number;
    /** Easing function (default: 'easeInOutCubic') */
    easing?: EasingType;
    /** Whether to wait for the tween to complete before advancing (default: true) */
    waitForCompletion?: boolean;
    // ── Animatable properties (only include those you want to change) ──
    /** Target X position (percentage) */
    x?: number;
    /** Target Y position (percentage) */
    y?: number;
    /** Target width (pixels for images, percentage for buttons) */
    width?: number;
    /** Target height (pixels for images, percentage for buttons) */
    height?: number;
    /** Target opacity (0-1) */
    opacity?: number;
    /** Target rotation (degrees, for images) */
    rotation?: number;
    /** Target horizontal scale */
    scaleX?: number;
    /** Target vertical scale */
    scaleY?: number;
    /** Target uniform scale (for characters) */
    scale?: number;
    /** Target font size (for text overlays) */
    fontSize?: number;
    /** Target border radius (for buttons) */
    borderRadius?: number;
    /** Target color (hex string, for text/tint) */
    color?: string;
    /** Target background color (hex string, for buttons) */
    backgroundColor?: string;
    /** Target screen zoom level */
    zoom?: number;
    /** Target screen pan X (percentage) */
    panX?: number;
    /** Target screen pan Y (percentage) */
    panY?: number;
}

export type VNCommand =
  | DialogueCommand | SetBackgroundCommand | ShowCharacterCommand | HideCharacterCommand | SetCharacterLayerCommand
    | ChoiceCommand | BranchStartCommand | BranchElseIfCommand | BranchElseCommand | BranchEndCommand | SetVariableCommand | TextInputCommand | JumpCommand | LabelCommand | JumpToLabelCommand
  | PlayMusicCommand | StopMusicCommand | PlaySoundEffectCommand | StopSoundEffectCommand | PlayMovieCommand | StopMovieCommand | WaitCommand
  | ShakeScreenCommand | TintScreenCommand | PanZoomScreenCommand | ResetScreenEffectsCommand
    | FlashScreenCommand | LightningCommand | FlashlightCommand | FireworksCommand | PlaceLightsCommand | ClearLightsCommand | SetScreenOverlayEffectCommand | ShowScreenCommand | ShowTextCommand | ShowImageCommand
  | HideTextCommand | HideImageCommand | ShowButtonCommand | HideButtonCommand | ShowItemCommand | CreditRollCommand | GroupCommand | RunScriptCommand
  | SpawnParticlesCommand | StopParticlesCommand | CallCommonEventCommand
  | ShowHotSpotCommand | HideHotSpotCommand
  | TweenElementCommand
  | GiveItemCommand | UseItemCommand | DestroyItemCommand | RestockCollectionCommand | BuyItemCommand | SellItemCommand
  | ShowPhoneCommand | HidePhoneCommand | ShowPhoneTextCommand | HidePhoneTextCommand
  | PhoneIncomingTextCommand | PhoneIncomingCallCommand;

/** Phone (in-game cellphone) commands. */
export interface ShowPhoneCommand extends BaseCommand { type: CommandType.ShowPhone; }
export interface HidePhoneCommand extends BaseCommand { type: CommandType.HidePhone; }
/** Appends one chat message; auto-opens the phone. `senderId` = a character id, or 'player' for the
 *  player's own (right-aligned) bubble. Optional `choices` present reply options (reuses ChoiceOption). */
export interface ShowPhoneTextCommand extends BaseCommand {
    type: CommandType.ShowPhoneText;
    senderId: VNID | 'player';
    text: string;
    choices?: ChoiceOption[];
    /** Optional avatar source for this message (base sprite / chosen pose / custom). Unset = base. */
    portrait?: PhonePortraitSource;
}
/** Clears the chat conversation (the phone shell can stay open). */
export interface HidePhoneTextCommand extends BaseCommand { type: CommandType.HidePhoneText; }

/** A follow-up message the SENDER texts back (after the player picks a reply, or as a chained
 *  arrival). Played in sequence with a brief "…" typing indicator before each one lands. */
export interface PhoneFollowUp {
    senderId: VNID | 'player';
    text: string;
    portrait?: PhonePortraitSource;
    soundId?: VNID | null;   // optional ding for this follow-up
    delayMs?: number;        // typing delay before it lands (default ~900ms)
}

/** One reply the player can tap on an incoming text. Beyond the player's own bubble, it can make the
 *  sender text back (followUps) and/or run any UI actions (jumps/variables/etc.). */
export interface PhoneReply {
    id: VNID;
    text: string;
    conditions?: VNCondition[];
    followUps?: PhoneFollowUp[];
    actions?: VNUIAction[];
}

/** A text "arrives" mid-scene. `presentation:'notify'` (default) shows a non-blocking banner + ding +
 *  badge and the story keeps playing (tap to read); `'open'` opens the phone straight to the message. */
export interface PhoneIncomingTextCommand extends BaseCommand {
    type: CommandType.PhoneIncomingText;
    senderId: VNID | 'player';
    text: string;
    presentation?: 'notify' | 'open';
    portrait?: PhonePortraitSource;
    soundId?: VNID | null;       // ding; falls back to the themed default
    showBadge?: boolean;         // dialogue-box / HUD notification badge
    typingMs?: number;           // optional "…" beat before the message lands (0 = instant)
    replies?: PhoneReply[];
}

/** A call rings. `mode:'modal'` (default) shows an accept/decline overlay that pauses the scene;
 *  `'nonblocking'` rings in the corner while the scene continues. Accept/Decline each dismiss the call
 *  AND run their own action list; on timeout the call is missed or runs timeout actions. */
export interface PhoneIncomingCallCommand extends BaseCommand {
    type: CommandType.PhoneIncomingCall;
    callerId: VNID | 'player';
    portrait?: PhonePortraitSource;
    mode?: 'modal' | 'nonblocking';
    ringtoneId?: VNID | null;    // falls back to the caller's character ringtone, then themed default
    ringDurationMs?: number;     // time before timeout (default ~12000)
    onTimeout?: 'missed' | 'runActions';
    timeoutActions?: VNUIAction[];
    acceptActions?: VNUIAction[];
    declineActions?: VNUIAction[];
    showBadge?: boolean;
}

/** Inventory item commands — sugar over the item's count variable. */
export interface GiveItemCommand extends BaseCommand { type: CommandType.GiveItem; itemId: VNID; quantity?: number; }
export interface UseItemCommand extends BaseCommand { type: CommandType.UseItem; itemId: VNID; }
export interface DestroyItemCommand extends BaseCommand { type: CommandType.DestroyItem; itemId: VNID; quantity?: number; all?: boolean; }
export interface RestockCollectionCommand extends BaseCommand { type: CommandType.RestockCollection; collectionId: VNID; }
export interface BuyItemCommand extends BaseCommand { type: CommandType.BuyItem; itemId: VNID; collectionId: VNID; quantity?: number; }
export interface SellItemCommand extends BaseCommand { type: CommandType.SellItem; itemId: VNID; collectionId: VNID; quantity?: number; }

export interface VNScene {
    id: VNID;
    name: string;
    commands: VNCommand[];
    conditions?: VNCondition[];     // Scene-level conditions (gate access)
    fallbackSceneId?: VNID;         // Jump here if conditions fail
    outTransition?: 'fade' | 'dissolve' | 'iris-out' | 'wipe-right' | 'slide-left' | 'instant'; // How this scene exits
    outTransitionDuration?: number;  // Exit transition duration in seconds (default 0.5)
    /** Optional parallax for this scene's stage (off by default). */
    parallax?: VNParallaxSettings;
}
