import { VNProject } from '../../../types/project';

export type ProjectAction_Project =
  | { type: 'SET_PROJECT'; payload: VNProject }
  | { type: 'UPDATE_PROJECT_TITLE'; payload: { title: string } };

export const projectReducer = (state: VNProject, action: ProjectAction_Project): VNProject => {
  switch (action.type) {
    case 'SET_PROJECT':
      return action.payload;
    
    case 'UPDATE_PROJECT_TITLE': {
        return {
            ...state,
            title: action.payload.title,
        };
    }
    default:
      // This is a pattern for combining reducers. If the action is not for this reducer, it returns the state unchanged.
      // This check needs to be broad enough not to mis-classify actions from other reducers.
      if (action && (action as any).type && !(action as any).type.startsWith('UPDATE_PROJECT_')) {
          return state;
      }
      return state;
  }
};
