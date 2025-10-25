import { VNProject } from '../types/project';
import { ProjectAction } from './actions';
import { projectReducer } from '../features/project/state/projectReducer';
import { assetReducer } from '../features/assets/state/assetReducer';
import { characterReducer } from '../features/character/state/characterReducer';
import { sceneReducer } from '../features/scene/state/sceneReducer';
import { uiReducer } from '../features/ui/state/uiReducer';
import { variableReducer } from '../features/variables/state/variableReducer';

const reducers = [
  projectReducer,
  assetReducer,
  characterReducer,
  sceneReducer,
  uiReducer,
  variableReducer,
];

export const rootReducer = (state: VNProject, action: ProjectAction): VNProject => {
  for (const reducer of reducers) {
    // We cast to `any` because each reducer expects its specific action type,
    // but the root reducer receives a union of all possible actions.
    // The individual reducers will ignore actions they don't handle.
    const newState = reducer(state, action as any);
    // If a reducer modified the state, we return the new state immediately.
    if (newState !== state) {
      return newState;
    }
  }
  // If no reducer handled the action, return the original state.
  return state;
};
