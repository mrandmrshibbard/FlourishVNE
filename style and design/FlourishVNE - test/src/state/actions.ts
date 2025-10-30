import { ProjectAction_Project } from '../features/project/state/projectReducer';
import { AssetAction } from '../features/assets/state/assetReducer';
import { CharacterAction } from '../features/character/state/characterReducer';
import { SceneAction } from '../features/scene/state/sceneReducer';
import { UIAction } from '../features/ui/state/uiReducer';
import { VariableAction } from '../features/variables/state/variableReducer';

export type ProjectAction =
    | ProjectAction_Project
    | AssetAction
    | CharacterAction
    | SceneAction
    | UIAction
    | VariableAction;
