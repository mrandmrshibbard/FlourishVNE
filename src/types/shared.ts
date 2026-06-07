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
    /** Invokes a Common Event (optionally with arguments) from a button/choice. */
    CallCommonEvent = 'CallCommonEvent',
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
export interface CycleLayerAssetAction extends BaseUIAction { type: UIActionType.CycleLayerAsset; characterId: VNID; layerId: VNID; variableId: VNID; direction: 'next' | 'prev'; }
export interface ToggleScreenAction extends BaseUIAction { type: UIActionType.ToggleScreen; targetScreenId: VNID; }
export interface OpenURLAction extends BaseUIAction { type: UIActionType.OpenURL; url: string; newTab?: boolean; }
export interface PlayAnimationAction extends BaseUIAction { type: UIActionType.PlayAnimation; targetElementId: VNID; animation: string; duration?: number; }
export interface ChangeImageAction extends BaseUIAction { type: UIActionType.ChangeImage; targetElementId: VNID; newImageId: VNID; }
export interface CallCommonEventAction extends BaseUIAction { type: UIActionType.CallCommonEvent; commonEventId: VNID; arguments?: Record<VNID, string | number | boolean>; }

export type VNUIAction = BaseUIAction | GoToScreenAction | JumpToSceneAction | JumpToLabelAction | SetVariableAction | ResetVariableAction | PlaySoundAction | LoadGameAction | SaveGameAction | CycleLayerAssetAction | ToggleScreenAction | OpenURLAction | PlayAnimationAction | ChangeImageAction | CallCommonEventAction;
