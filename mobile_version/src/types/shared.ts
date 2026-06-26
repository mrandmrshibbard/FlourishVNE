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
export type VNConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'is true' | 'is false' | 'contains' | 'startsWith';

export interface VNCondition {
    variableId: VNID;
    operator: VNConditionOperator;
    value?: string | number | boolean;
    /** How this condition joins to the PREVIOUS one in the list. Ignored on the
     *  first condition. Defaults to 'and' (so existing all-AND lists are unchanged).
     *  Evaluated left-to-right with no operator precedence:
     *  `A or B and C` === `((A or B) and C)`. */
    connector?: 'and' | 'or';
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
    CycleLayerAsset = 'CycleLayerAsset',
    ToggleScreen = 'ToggleScreen',
    OpenURL = 'OpenURL',
    PlayAnimation = 'PlayAnimation',
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
export interface JumpToSceneAction extends BaseUIAction { type: UIActionType.JumpToScene; targetSceneId: VNID; }
export interface JumpToLabelAction extends BaseUIAction { type: UIActionType.JumpToLabel; targetLabel: string; }
export interface SetVariableAction extends BaseUIAction { type: UIActionType.SetVariable; variableId: VNID; operator: VNSetVariableOperator; value: string | number | boolean; randomMin?: number; randomMax?: number; }
/** Sentinel `variableId` for a ResetVariable action that resets every variable. */
export const RESET_ALL_VARIABLES = '__ALL_VARIABLES__' as VNID;
export interface ResetVariableAction extends BaseUIAction { type: UIActionType.ResetVariable; variableId: VNID; }
export interface PlaySoundAction extends BaseUIAction { type: UIActionType.PlaySound; audioId: VNID; volume?: number; loop?: boolean; }
export interface LoadGameAction extends BaseUIAction { type: UIActionType.LoadGame; slotNumber: number; }
export interface SaveGameAction extends BaseUIAction { type: UIActionType.SaveGame; slotNumber: number; }
export interface DeleteSaveAction extends BaseUIAction { type: UIActionType.DeleteSave; slotNumber: number; }
export interface ShowPhoneAction extends BaseUIAction { type: UIActionType.ShowPhone; }
export interface HidePhoneAction extends BaseUIAction { type: UIActionType.HidePhone; }
export interface ShowPhoneTextAction extends BaseUIAction { type: UIActionType.ShowPhoneText; }
export interface HidePhoneTextAction extends BaseUIAction { type: UIActionType.HidePhoneText; }
export interface ShowPhoneHistoryAction extends BaseUIAction { type: UIActionType.ShowPhoneHistory; }
export interface ShowPhoneContactsAction extends BaseUIAction { type: UIActionType.ShowPhoneContacts; }
export interface CycleLayerAssetAction extends BaseUIAction { type: UIActionType.CycleLayerAsset; characterId: VNID; layerId: VNID; variableId: VNID; direction: 'next' | 'prev'; }
export interface ToggleScreenAction extends BaseUIAction { type: UIActionType.ToggleScreen; targetScreenId: VNID; }
export interface OpenURLAction extends BaseUIAction { type: UIActionType.OpenURL; url: string; newTab?: boolean; }
export interface PlayAnimationAction extends BaseUIAction { type: UIActionType.PlayAnimation; targetElementId: VNID; animation: string; duration?: number; }
export interface ChangeImageAction extends BaseUIAction { type: UIActionType.ChangeImage; targetElementId: VNID; newImageId: VNID; }
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

export type VNUIAction = BaseUIAction | GoToScreenAction | JumpToSceneAction | JumpToLabelAction | SetVariableAction | ResetVariableAction | PlaySoundAction | LoadGameAction | SaveGameAction | CycleLayerAssetAction | ToggleScreenAction | OpenURLAction | PlayAnimationAction | ChangeImageAction | ShowElementAction | HideElementAction | CallCommonEventAction | GiveItemAction | UseItemAction | DestroyItemAction | UseSelectedItemAction | CarryItemAction | RestockCollectionAction | BuyItemAction | SellItemAction | BuySelectedItemAction | SellSelectedItemAction | DeleteSaveAction | ShowPhoneAction | HidePhoneAction | ShowPhoneTextAction | HidePhoneTextAction | ShowPhoneHistoryAction | ShowPhoneContactsAction;
