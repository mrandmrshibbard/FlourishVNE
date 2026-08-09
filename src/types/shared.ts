import { VNID } from '.';
import { VNSetVariableOperator } from '../features/variables/types';

// Moved from ui/types.ts
export type VNTextAlign = 'left' | 'center' | 'right';
export type VNVAlign = 'top' | 'middle' | 'bottom';

/**
 * Parallax configuration for a scene stage or a UI screen (author's choice of driver).
 * `mode` 'off' (default/undefined) disables it. 'mouse' follows the pointer; 'camera'
 * (Phase 3) ties depth to PanZoom camera moves; 'both' sums them. `intensity` scales the
 * overall shift (default 1). Per-element movement = pointer/camera offset × intensity ×
 * the element's `parallaxDepth`. Render-time only — never written to stored positions.
 */
export type VNParallaxMode = 'off' | 'mouse' | 'camera' | 'both';
export interface VNParallaxSettings {
    mode?: VNParallaxMode;
    intensity?: number;
}

// Moved from scene/types.ts
/**
 * The three band operators (`inBand`, `atLeastBand`, `belowBand`) are the only ones whose `value` is
 * not a literal — it is a BAND ID (see features/variables/bands.ts).
 *
 * WHY THEY ARE SYMBOLIC. It is tempting to compile "Affection is Friend or better" down to the
 * ordinary condition `>= 21` and add no operators at all. That rots: the day the author moves the
 * Friend band to start at 25, every such condition still says 21 — silently wrong, and no longer
 * even displayable as a band. Referring to the band BY IDENTITY means renaming or re-numbering a
 * band updates every condition that mentions it, for free.
 *
 * The cost is that evaluating one needs the variable's DEFINITION, not just its value — hence
 * `setVariableDefinitions` in live-preview/systems/conditionEvaluator.ts. Every evaluator must
 * handle these three; miss one and the condition silently reads false in that surface.
 */
export type VNConditionOperator =
    | '==' | '!=' | '>' | '<' | '>=' | '<=' | 'is true' | 'is false' | 'contains' | 'startsWith'
    | 'inBand' | 'atLeastBand' | 'belowBand';

export interface VNCondition {
    variableId: VNID;
    operator: VNConditionOperator;
    value?: string | number | boolean;
    /** How this condition joins to the PREVIOUS one in the list. Ignored on the
     *  first condition. Defaults to 'and' (so existing all-AND lists are unchanged).
     *  Evaluated left-to-right with no operator precedence:
     *  `A or B and C` === `((A or B) and C)`. */
    connector?: 'and' | 'or';
    /** Compare against another variable's CURRENT value instead of `value`. A separate field
     *  on purpose: `value` already doubles as a band id for band operators (the editor resets
     *  it when crossing that line) — overloading it again would repeat that hazard. Dangling
     *  id → evaluators fall back to `value`. Never set together with a band operator. */
    compareVariableId?: VNID;
}

/** One operand in a Set Variable calculation: a typed number or another variable's value. */
export interface VNCalcOperand {
    source: 'number' | 'variable';
    value?: number;
    variableId?: VNID;
}

export type VNCalcOp = 'add' | 'subtract' | 'multiply' | 'divide' | 'percentOf';

export interface VNCalcStep extends VNCalcOperand {
    op: VNCalcOp;
}

/** A Set Variable value worked out from other variables. Steps run strictly left to right —
 *  no operator precedence (same rule, and same visible hint, as condition lists). */
export interface VNValueCalc {
    first: VNCalcOperand;
    steps: VNCalcStep[];
    /** Rounding of the calc result, applied once at the end. Absent = 'nearest'. */
    round?: 'none' | 'nearest' | 'down' | 'up';
}

// Moved from ui/types.ts
export enum UIActionType {
    None = 'None',
    StartNewGame = 'StartNewGame',
    GoToScreen = 'GoToScreen',
    LoadGame = 'LoadGame',
    SaveGame = 'SaveGame',
    /** Erases a save slot (clears it for both the Save and Load screens). Confirmed via the
     *  customizable "Erase Save" confirmation dialog. */
    DeleteSave = 'DeleteSave',
    /** In-game phone: open / close the phone, or show / clear the chat view. So any button (incl. the
     *  phone's own bottom buttons) can drive the phone. ShowPhoneText (no message) just opens the chat. */
    ShowPhone = 'ShowPhone',
    HidePhone = 'HidePhone',
    ShowPhoneText = 'ShowPhoneText',
    HidePhoneText = 'HidePhoneText',
    /** Open the phone's recents/history (call log + chat) view. */
    ShowPhoneHistory = 'ShowPhoneHistory',
    /** Open the phone's Contacts app (roster with per-contact Call / Message). */
    ShowPhoneContacts = 'ShowPhoneContacts',
    /** Open a specific phone app by id (opens the phone if closed). The generic form of
     *  ShowPhoneHistory/ShowPhoneContacts, covering registry apps (gallery, map, settings…). */
    OpenPhoneApp = 'OpenPhoneApp',
    /** Show a travel map full-screen (buttons/hotspots; the scene keeps its current position). */
    ShowMap = 'ShowMap',
    /** Show a mini game full-screen (buttons/hotspots; the scene keeps its current position). */
    ShowMiniGame = 'ShowMiniGame',
    ReturnToGame = 'ReturnToGame',
    ReturnToPreviousScreen = 'ReturnToPreviousScreen',
    QuitToTitle = 'QuitToTitle',
    ExitGame = 'ExitGame',
    JumpToScene = 'JumpToScene',
    JumpToLabel = 'JumpToLabel',
    SetVariable = 'SetVariable',
    /** Resets a single variable (or all variables) back to its defined default value. */
    ResetVariable = 'ResetVariable',
    /** Plays a selected audio asset (one-shot or looping) when the button is clicked. */
    PlaySound = 'PlaySound',
    /** Plays a track as background MUSIC (single music channel, cross-fades, loops) — same as the Play Music command. */
    PlayMusic = 'PlayMusic',
    /** Fades out and stops the background music — same as the Stop Music command. */
    StopMusic = 'StopMusic',
    /** Stops playing sound effects (one specific sound, or all of them), with optional fade. */
    StopSound = 'StopSound',
    /** Plays a full-screen video. Can block input while playing and run actions when it ends. */
    PlayVideo = 'PlayVideo',
    /** Turn the save/load slot grid to its next page (for custom Next buttons). */
    SaveSlotsNextPage = 'SaveSlotsNextPage',
    /** Turn the save/load slot grid to its previous page (for custom Previous buttons). */
    SaveSlotsPrevPage = 'SaveSlotsPrevPage',
    /** Show a spotlight beam (carries its own look, so a screen button can turn one on from scratch). */
    ShowSpotlight = 'ShowSpotlight',
    /** Turn the current spotlight beam off. */
    HideSpotlight = 'HideSpotlight',
    /** Show a flashlight (carries its own look, so a screen button can turn one on from scratch). */
    ShowFlashlight = 'ShowFlashlight',
    /** Turn the flashlight off. */
    HideFlashlight = 'HideFlashlight',
    CycleLayerAsset = 'CycleLayerAsset',
    ToggleScreen = 'ToggleScreen',
    OpenURL = 'OpenURL',
    PlayAnimation = 'PlayAnimation',
    /** Character-stage actions — the button equivalents of the Change Pose / Show Character /
     *  Play Animation scene commands. They share their stage logic with those commands (see
     *  buildPoseStagePatch and friends) so a button and a command can't mean different things. */
    ChangePose = 'ChangePose',
    ChangeCharacter = 'ChangeCharacter',
    PlayCharacterAnimation = 'PlayCharacterAnimation',
    ChangeImage = 'ChangeImage',
    /** Reveals a target element (overrides its current/`startHidden` state). Pairs with HideElement
     *  so one button can show the next "page" while hiding the previous — multi-page documents,
     *  before/after reveals, layered maps, etc. Honors the element's own fade transition. */
    ShowElement = 'ShowElement',
    /** Hides a target element (fades it out + makes it click-through). Counterpart to ShowElement. */
    HideElement = 'HideElement',
    ContinueGame = 'ContinueGame',
    // ─── Quick-menu equivalents (let any user-designed button drive these features) ─── //
    /** Opens the text history / log overlay. */
    ShowLog = 'ShowLog',
    /** Toggles auto-advance mode on / off. */
    ToggleAutoAdvance = 'ToggleAutoAdvance',
    /** Toggles fast-forward / skip mode on / off. */
    ToggleSkip = 'ToggleSkip',
    /** Rewinds to the previous dialogue entry (history pop). */
    SkipBackward = 'SkipBackward',
    /** Pauses the game and opens the configured pause screen — the same as pressing
     *  Esc, but usable from a button. Needed for touch/mobile builds with no keyboard. */
    OpenPauseMenu = 'OpenPauseMenu',
    /** Invokes a Common Event (optionally with arguments) from a button/choice. */
    CallCommonEvent = 'CallCommonEvent',
    // ─── Inventory items (sugar over each item's count variable) ─── //
    /** Gives the player N of an item (adds to its count; unique items become owned). */
    GiveItem = 'GiveItem',
    /** Uses (consumes one of) an item and runs its use-effect. */
    UseItem = 'UseItem',
    /** Removes N of an item (or all of it). */
    DestroyItem = 'DestroyItem',
    /** Uses whichever inventory item the player has currently selected (no fixed item id). */
    UseSelectedItem = 'UseSelectedItem',
    /** Picks up an item onto the cursor so the player can click a hot spot to use it there
     *  (point-and-click "carry" use). Closes the inventory overlay it was picked from. */
    CarryItem = 'CarryItem',
    /** Restocks an item list/collection to its configured amounts (reset or random range). */
    RestockCollection = 'RestockCollection',
    /** Buys one of an item from a shop list (spends the shop's currency, moves stock to the player). */
    BuyItem = 'BuyItem',
    /** Sells one of an item to a shop list (gives the player currency, removes it from their inventory). */
    SellItem = 'SellItem',
    /** Buys whichever grid item the player has selected from a shop list (no fixed item id). */
    BuySelectedItem = 'BuySelectedItem',
    /** Sells whichever grid item the player has selected to a shop list (no fixed item id). */
    SellSelectedItem = 'SellSelectedItem',
    // ─── Timers (let a button start/stop a countdown or stopwatch) ─── //
    /** Starts a countdown/stopwatch (optionally ticking a number variable). */
    StartTimer = 'StartTimer',
    /** Stops a running timer by id. */
    StopTimer = 'StopTimer',
    /** Sets/advances the day/night clock (drives the time-of-day color grade). */
    SetTimeOfDay = 'SetTimeOfDay',
    /** Reverts the palette→UI restyle a coloring mini game applied (clears
     *  playerState.uiPaletteOverride so the UI returns to its authored colors). */
    ClearUiPalette = 'ClearUiPalette',
}

export interface BaseUIAction {
    type: UIActionType;
    /** Optional per-action conditions: when set, the action only fires if these
     *  conditions are currently met. Lets a single button branch (e.g. a "Use"
     *  button whose actions each check `selected_item == "key"`). */
    conditions?: VNCondition[];
}
export interface GoToScreenAction extends BaseUIAction { type: UIActionType.GoToScreen; targetScreenId: VNID; }
// FIX: Renamed targetScreenId to targetSceneId to match its purpose and usage.
/** `transition` optionally overrides the leaving scene's exit transition for this jump only —
 *  a built-in name or `custom:<id>` (project.customTransitions). Unset = the scene's own setting. */
export interface JumpToSceneAction extends BaseUIAction { type: UIActionType.JumpToScene; targetSceneId: VNID; transition?: string; }
export interface JumpToLabelAction extends BaseUIAction { type: UIActionType.JumpToLabel; targetLabel: string; }
/** `valueSource` absent = the typed `value` (always the case for old projects). 'variable' reads
 *  `valueVariableId`'s current value; 'calc' works `calc` out left to right. Number variables only. */
export interface SetVariableAction extends BaseUIAction { type: UIActionType.SetVariable; variableId: VNID; operator: VNSetVariableOperator; value: string | number | boolean; randomMin?: number; randomMax?: number; valueSource?: 'variable' | 'calc'; valueVariableId?: VNID; calc?: VNValueCalc; }
/** Sentinel `variableId` for a ResetVariable action that resets every variable. */
export const RESET_ALL_VARIABLES = '__ALL_VARIABLES__' as VNID;
export interface ResetVariableAction extends BaseUIAction { type: UIActionType.ResetVariable; variableId: VNID; }
export interface PlaySoundAction extends BaseUIAction { type: UIActionType.PlaySound; audioId: VNID; volume?: number; loop?: boolean; audioAdjust?: import('../features/scene/types').VNAudioAdjust; }
/** `audioAdjust` here is speed/keep-pitch only — reverse is ignored on the music channel. */
export interface PlayMusicAction extends BaseUIAction { type: UIActionType.PlayMusic; audioId: VNID; volume?: number; loop?: boolean; fadeDuration?: number; audioAdjust?: import('../features/scene/types').VNAudioAdjust; }
export interface StopMusicAction extends BaseUIAction { type: UIActionType.StopMusic; fadeDuration?: number; }
/** Stop sound effects: a specific sound (audioId) or ALL currently playing (audioId unset). */
export interface StopSoundAction extends BaseUIAction { type: UIActionType.StopSound; audioId?: VNID | null; fadeDuration?: number; }
/** Full-screen video from a button/screen. Works on menus AND during gameplay. `blockInput`
 *  removes click-to-skip; `onEndActions` run when the video finishes (or is skipped). */
export interface PlayVideoAction extends BaseUIAction { type: UIActionType.PlayVideo; videoId: VNID | null; loop?: boolean; blockInput?: boolean; onEndActions?: VNUIAction[]; }
/** Turn a save/load slot grid's page (custom Next/Previous buttons). `targetElementId` picks a
 *  specific grid element; empty = every grid on the open screen (the common single-grid case). */
export interface SaveSlotsPageAction extends BaseUIAction { type: UIActionType.SaveSlotsNextPage | UIActionType.SaveSlotsPrevPage; targetElementId?: VNID | null; }
export interface ShowSpotlightAction extends BaseUIAction { type: UIActionType.ShowSpotlight; spotlightId?: string; sourceX?: number; sourceY?: number; aimAngle?: number; intensity?: number; beamWidth?: number; sourceWidth?: number; height?: number; falloff?: number; color?: string; followMouse?: boolean; swivelMax?: number; toggleKey?: string; affectsDialogue?: boolean; sfxId?: VNID | null; }
export interface HideSpotlightAction extends BaseUIAction { type: UIActionType.HideSpotlight; spotlightId?: string; }
export interface ShowFlashlightAction extends BaseUIAction { type: UIActionType.ShowFlashlight; radius?: number; softness?: number; darkness?: number; color?: string; toggleKey?: string; affectsDialogue?: boolean; sfxId?: VNID | null; }
export interface HideFlashlightAction extends BaseUIAction { type: UIActionType.HideFlashlight; }
export interface LoadGameAction extends BaseUIAction { type: UIActionType.LoadGame; slotNumber: number; }
export interface SaveGameAction extends BaseUIAction { type: UIActionType.SaveGame; slotNumber: number; }
export interface DeleteSaveAction extends BaseUIAction { type: UIActionType.DeleteSave; slotNumber: number; }
export interface ShowPhoneAction extends BaseUIAction { type: UIActionType.ShowPhone; }
export interface HidePhoneAction extends BaseUIAction { type: UIActionType.HidePhone; }
export interface ShowPhoneTextAction extends BaseUIAction { type: UIActionType.ShowPhoneText; }
export interface HidePhoneTextAction extends BaseUIAction { type: UIActionType.HidePhoneText; }
export interface ShowPhoneHistoryAction extends BaseUIAction { type: UIActionType.ShowPhoneHistory; }
export interface ShowPhoneContactsAction extends BaseUIAction { type: UIActionType.ShowPhoneContacts; }
/** appId matches PhoneAppId (live-preview/types/gameState.ts) — kept as string here so shared
 *  types stay dependency-free; the runtime falls back to 'home' for unknown/disabled ids. */
export interface OpenPhoneAppAction extends BaseUIAction { type: UIActionType.OpenPhoneApp; appId: string; }
export interface ShowMapAction extends BaseUIAction { type: UIActionType.ShowMap; mapId: VNID; }
export interface ShowMiniGameAction extends BaseUIAction { type: UIActionType.ShowMiniGame; gameId: VNID; }
export interface CycleLayerAssetAction extends BaseUIAction { type: UIActionType.CycleLayerAsset; characterId: VNID; layerId: VNID; variableId: VNID; direction: 'next' | 'prev'; }
export interface ToggleScreenAction extends BaseUIAction { type: UIActionType.ToggleScreen; targetScreenId: VNID; }
export interface OpenURLAction extends BaseUIAction { type: UIActionType.OpenURL; url: string; newTab?: boolean; }
export interface PlayAnimationAction extends BaseUIAction { type: UIActionType.PlayAnimation; targetElementId: VNID; animation: string; duration?: number; }
export interface ChangeImageAction extends BaseUIAction { type: UIActionType.ChangeImage; targetElementId: VNID; newImageId: VNID; }
/** Change an on-stage character's pose. Empty poseId = back to their Default pose. */
export interface ChangePoseAction extends BaseUIAction { type: UIActionType.ChangePose; characterId: VNID; poseId?: VNID | null; transition?: string | null; duration?: number; }
/** Swap who is standing in a spot, keeping the position/scale of the character being replaced. */
export interface ChangeCharacterAction extends BaseUIAction { type: UIActionType.ChangeCharacter; fromCharacterId: VNID; toCharacterId: VNID; expressionId?: VNID | null; poseId?: VNID | null; }
/** Start (or, with no animationId, stop) a character's frame animation. */
export interface PlayCharacterAnimationAction extends BaseUIAction { type: UIActionType.PlayCharacterAnimation; characterId: VNID; animationId?: VNID | null; }
export interface ShowElementAction extends BaseUIAction { type: UIActionType.ShowElement; targetElementId: VNID; }
export interface HideElementAction extends BaseUIAction { type: UIActionType.HideElement; targetElementId: VNID; }
export interface CallCommonEventAction extends BaseUIAction { type: UIActionType.CallCommonEvent; commonEventId: VNID; arguments?: Record<VNID, string | number | boolean>; }
export interface GiveItemAction extends BaseUIAction { type: UIActionType.GiveItem; itemId: VNID; quantity?: number; }
export interface UseItemAction extends BaseUIAction { type: UIActionType.UseItem; itemId: VNID; }
export interface DestroyItemAction extends BaseUIAction { type: UIActionType.DestroyItem; itemId: VNID; quantity?: number; all?: boolean; }
export interface UseSelectedItemAction extends BaseUIAction { type: UIActionType.UseSelectedItem; }
export interface CarryItemAction extends BaseUIAction { type: UIActionType.CarryItem; itemId: VNID; }
export interface RestockCollectionAction extends BaseUIAction { type: UIActionType.RestockCollection; collectionId: VNID; }
export interface BuyItemAction extends BaseUIAction { type: UIActionType.BuyItem; itemId: VNID; collectionId: VNID; quantity?: number; }
export interface SellItemAction extends BaseUIAction { type: UIActionType.SellItem; itemId: VNID; collectionId: VNID; quantity?: number; }
export interface BuySelectedItemAction extends BaseUIAction { type: UIActionType.BuySelectedItem; collectionId: VNID; }
export interface SellSelectedItemAction extends BaseUIAction { type: UIActionType.SellSelectedItem; collectionId: VNID; }
/** Start a timer from a button. `variableId` is optional (only to show it on a Meter / conditions);
 *  the timer runs regardless. For on-finish ACTIONS or pausing the story, use the Start Timer COMMAND. */
export interface StartTimerAction extends BaseUIAction { type: UIActionType.StartTimer; timerId?: string; variableId?: VNID; mode?: 'countdown' | 'stopwatch'; duration: number; from?: number; interval?: number; loop?: boolean; resume?: boolean; keepAcrossGames?: boolean; rememberBetweenSessions?: boolean; onComplete?: VNUIAction[]; }
export interface StopTimerAction extends BaseUIAction { type: UIActionType.StopTimer; timerId?: string; }
/** Set/advance the day/night clock from a button. */
export interface SetTimeOfDayAction extends BaseUIAction { type: UIActionType.SetTimeOfDay; mode: 'set' | 'advance'; hour?: number; hours?: number; transitionDuration?: number; }
/** Clear the palette→UI restyle applied by a coloring mini game. */
export interface ClearUiPaletteAction extends BaseUIAction { type: UIActionType.ClearUiPalette; }

export type VNUIAction = BaseUIAction | GoToScreenAction | JumpToSceneAction | JumpToLabelAction | SetVariableAction | ResetVariableAction | PlaySoundAction | PlayMusicAction | StopMusicAction | SaveSlotsPageAction | ShowSpotlightAction | HideSpotlightAction | ShowFlashlightAction | HideFlashlightAction | LoadGameAction | SaveGameAction | CycleLayerAssetAction | ToggleScreenAction | OpenURLAction | PlayAnimationAction | ChangeImageAction | ChangePoseAction | ChangeCharacterAction | PlayCharacterAnimationAction | ShowElementAction | HideElementAction | CallCommonEventAction | GiveItemAction | UseItemAction | DestroyItemAction | UseSelectedItemAction | CarryItemAction | RestockCollectionAction | BuyItemAction | SellItemAction | BuySelectedItemAction | SellSelectedItemAction | DeleteSaveAction | ShowPhoneAction | HidePhoneAction | ShowPhoneTextAction | HidePhoneTextAction | ShowPhoneHistoryAction | ShowPhoneContactsAction | OpenPhoneAppAction | ShowMapAction | ShowMiniGameAction | StartTimerAction | StopTimerAction | SetTimeOfDayAction | ClearUiPaletteAction | StopSoundAction | PlayVideoAction;
