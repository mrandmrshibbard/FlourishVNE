import { VNProject } from '../../../types/project';
import { migrateProjectToUnifiedScreens } from '../../../utils/unifiedScreenMigration';
import { migrateProjectRemoveLegacyCommands } from '../../../utils/legacyCommandMigration';
import { migrateItemCountVariableBounds } from '../../../utils/itemVariableMigration';

export type ProjectAction_Project =
  | { type: 'SET_PROJECT'; payload: VNProject }
  | { type: 'UPDATE_PROJECT'; payload: Partial<VNProject> }
  | { type: 'UPDATE_PROJECT_TITLE'; payload: { title: string } };

export const projectReducer = (state: VNProject, action: ProjectAction_Project): VNProject => {
  switch (action.type) {
    case 'SET_PROJECT':
      // Every project that enters the store is run through the load migrations:
      // unified-screens schema + removal of retired scene commands + item-count
      // min:0 backfill. All idempotent, so already-migrated projects pass through cheaply.
      return migrateItemCountVariableBounds(migrateProjectRemoveLegacyCommands(migrateProjectToUnifiedScreens(action.payload)));

    case 'UPDATE_PROJECT': {
        return {
            ...state,
            ...action.payload,
        };
    }
    
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
