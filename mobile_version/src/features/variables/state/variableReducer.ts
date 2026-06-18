import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { CommandType, ChoiceCommand } from '../../scene/types';
// FIX: UIActionType is exported from shared types, not ui types.
import { UIActionType } from '../../../types/shared';
import { VNVariable, VNVariableType } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 9);

export type VariableAction =
    | { type: 'ADD_VARIABLE'; payload: { name: string; type: VNVariableType; defaultValue: string | number | boolean; id?: VNID } }
    | { type: 'UPDATE_VARIABLE'; payload: { variableId: VNID; updates: Partial<VNVariable> } }
    | { type: 'DELETE_VARIABLE'; payload: { variableId: VNID } };

export const variableReducer = (state: VNProject, action: VariableAction): VNProject => {
  switch (action.type) {
    case 'ADD_VARIABLE': {
      const newId = action.payload.id || `var-${generateId()}`;
      const newVar: VNVariable = { id: newId, name: action.payload.name, type: action.payload.type, defaultValue: action.payload.defaultValue };
      return {
        ...state,
        variables: { ...state.variables, [newId]: newVar }
      };
    }

    case 'UPDATE_VARIABLE': {
        const { variableId, updates } = action.payload;
        return {
            ...state,
            variables: { ...state.variables, [variableId]: { ...state.variables[variableId], ...updates } }
        };
    }

    case 'DELETE_VARIABLE': {
      const { variableId } = action.payload;
      console.log('[variableReducer] DELETE_VARIABLE received for:', variableId);
      console.log('[variableReducer] Current variables:', Object.keys(state.variables));
      const { [variableId]: deletedVar, ...remainingVars } = state.variables;
      console.log('[variableReducer] Deleted variable:', deletedVar?.name || 'NOT FOUND');
      console.log('[variableReducer] Remaining variables:', Object.keys(remainingVars));

      // Clean up commands that use the deleted variable
      const newScenes = { ...state.scenes };
      for (const sceneId in newScenes) {
          newScenes[sceneId].commands = newScenes[sceneId].commands
              .filter(cmd => !(cmd.type === CommandType.SetVariable && cmd.variableId === variableId))
              .map(cmd => {
                  let newCmd = { ...cmd };
                  if (newCmd.conditions) {
                      const filteredConditions = newCmd.conditions.filter(c => c.variableId !== variableId);
                      if (filteredConditions.length === 0) {
                          delete newCmd.conditions;
                      } else {
                          newCmd.conditions = filteredConditions;
                      }
                  }
                  if (newCmd.type === CommandType.Choice) {
                      const newOptions = (newCmd as ChoiceCommand).options.map(opt => {
                          const newOpt = { ...opt };
                           if (newOpt.conditions) {
                                newOpt.conditions = newOpt.conditions.filter(c => c.variableId !== variableId);
                                if (newOpt.conditions.length === 0) {
                                    delete newOpt.conditions;
                                }
                            }
                          // Also check inside actions
                          if (opt.actions) {
                            // FIX: Rewrote filter to be more explicit and type-safe.
                            const filteredActions = opt.actions.filter(action => {
                                if (action.type === UIActionType.SetVariable) {
                                    return (action as any).variableId !== variableId;
                                }
                                return true;
                            });
                            newOpt.actions = filteredActions;
                          }
                          return newOpt;
                      });
                      return { ...newCmd, options: newOptions };
                  }
                  return newCmd;
              });
      }

      return {
        ...state,
        variables: remainingVars,
        scenes: newScenes
      };
    }

    default:
        return state;
  }
};
