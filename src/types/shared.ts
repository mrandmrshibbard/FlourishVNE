import { VNID } from '.';
import { VNSetVariableOperator } from '../features/variables/types';

// Moved from ui/types.ts
export type VNTextAlign = 'left' | 'center' | 'right';
export type VNVAlign = 'top' | 'middle' | 'bottom';

// Moved from scene/types.ts
export type VNConditionOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'is true' | 'is false' | 'contains' | 'startsWith';

export interface VNCondition {
    variableId: VNID;
    operator: VNConditionOperator;
    value?: string | number | boolean;
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
    CycleLayerAsset = 'CycleLayerAsset',
    ToggleScreen = 'ToggleScreen',
}

export interface BaseUIAction { type: UIActionType; }
export interface GoToScreenAction extends BaseUIAction { type: UIActionType.GoToScreen; targetScreenId: VNID; }
// FIX: Renamed targetScreenId to targetSceneId to match its purpose and usage.
export interface JumpToSceneAction extends BaseUIAction { type: UIActionType.JumpToScene; targetSceneId: VNID; }
export interface JumpToLabelAction extends BaseUIAction { type: UIActionType.JumpToLabel; targetLabel: string; }
export interface SetVariableAction extends BaseUIAction { type: UIActionType.SetVariable; variableId: VNID; operator: VNSetVariableOperator; value: string | number | boolean; randomMin?: number; randomMax?: number; }
export interface LoadGameAction extends BaseUIAction { type: UIActionType.LoadGame; slotNumber: number; }
export interface SaveGameAction extends BaseUIAction { type: UIActionType.SaveGame; slotNumber: number; }
export interface CycleLayerAssetAction extends BaseUIAction { type: UIActionType.CycleLayerAsset; characterId: VNID; layerId: VNID; variableId: VNID; direction: 'next' | 'prev'; }
export interface ToggleScreenAction extends BaseUIAction { type: UIActionType.ToggleScreen; targetScreenId: VNID; }

export type VNUIAction = BaseUIAction | GoToScreenAction | JumpToSceneAction | JumpToLabelAction | SetVariableAction | LoadGameAction | SaveGameAction | CycleLayerAssetAction | ToggleScreenAction;
