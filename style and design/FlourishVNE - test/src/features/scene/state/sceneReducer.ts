import { VNID } from '../../../types';
import { VNProject } from '../../../types/project';
import { VNCommand, VNScene, CommandType, ChoiceCommand, BranchStartCommand, BranchEndCommand } from '../types';
import { UIActionType } from '../../../types/shared';

const generateId = () => Math.random().toString(36).substring(2, 9);

export type SceneAction =
    | { type: 'ADD_SCENE'; payload: { name: string } }
    | { type: 'UPDATE_SCENE'; payload: { sceneId: VNID; name: string } }
    | { type: 'UPDATE_SCENE_CONFIG'; payload: { sceneId: VNID; updates: Partial<Pick<VNScene, 'conditions' | 'fallbackSceneId'>> } }
    | { type: 'DELETE_SCENE'; payload: { sceneId: VNID } }
    | { type: 'DUPLICATE_SCENE'; payload: { sceneId: VNID } }
    | { type: 'REORDER_SCENES'; payload: { sceneIds: VNID[] } }
    | { type: 'SET_START_SCENE'; payload: { sceneId: VNID } }
    | { type: 'UPDATE_SCENE_COMMANDS'; payload: { sceneId: VNID; commands: VNCommand[] } }
    | { type: 'ADD_COMMAND'; payload: { sceneId: VNID; command: VNCommand } }
    | { type: 'UPDATE_COMMAND'; payload: { sceneId: VNID; commandIndex: number; command: VNCommand } }
    | { type: 'DELETE_COMMAND'; payload: { sceneId: VNID; commandIndex: number } }
    | { type: 'MOVE_COMMAND'; payload: { sceneId: VNID; fromIndex: number; toIndex: number } }
    | { type: 'TOGGLE_GROUP_COLLAPSE'; payload: { sceneId: VNID; groupId: VNID } }
    | { type: 'ADD_COMMAND_TO_GROUP'; payload: { sceneId: VNID; groupId: VNID; commandId: VNID } }
    | { type: 'REMOVE_COMMAND_FROM_GROUP'; payload: { sceneId: VNID; groupId: VNID; commandId: VNID } }
    | { type: 'RENAME_GROUP'; payload: { sceneId: VNID; groupId: VNID; name: string } }
    | { type: 'REORDER_COMMANDS_IN_GROUP'; payload: { sceneId: VNID; groupId: VNID; commandIds: VNID[] } };

export const sceneReducer = (state: VNProject, action: SceneAction): VNProject => {
  switch (action.type) {
    case 'ADD_SCENE': {
      const newId = `scene-${generateId()}`;
      const newScene: VNScene = { id: newId, name: action.payload.name, commands: [] };
      return {
        ...state,
        scenes: { ...state.scenes, [newId]: newScene }
      };
    }

    case 'UPDATE_SCENE': {
      const { sceneId, name } = action.payload;
      return {
        ...state,
        scenes: { ...state.scenes, [sceneId]: { ...state.scenes[sceneId], name } }
      };
    }

    case 'UPDATE_SCENE_CONFIG': {
      const { sceneId, updates } = action.payload;
      return {
        ...state,
        scenes: { ...state.scenes, [sceneId]: { ...state.scenes[sceneId], ...updates } }
      };
    }

    case 'DELETE_SCENE': {
      const { sceneId } = action.payload;
      if (Object.keys(state.scenes).length <= 1) return state; // Prevent deleting the last scene

      const { [sceneId]: _, ...remainingScenes } = state.scenes;
      let newStartSceneId = state.startSceneId;
      if (state.startSceneId === sceneId) {
        newStartSceneId = Object.keys(remainingScenes)[0] || '';
      }

      // Clean up commands that jump to the deleted scene
      for (const sId in remainingScenes) {
          remainingScenes[sId].commands = remainingScenes[sId].commands.map(cmd => {
              if (cmd.type === CommandType.Jump && cmd.targetSceneId === sceneId) {
                  return { ...cmd, targetSceneId: newStartSceneId };
              }
              if (cmd.type === CommandType.Choice) {
                  const choiceCmd = cmd as ChoiceCommand;
                  const newOptions = choiceCmd.options.map(opt => {
                      // Handle old format for safety
                      if (opt.targetSceneId === sceneId) {
                          return { ...opt, targetSceneId: newStartSceneId };
                      }
                      // Handle new action-based format
                      if (opt.actions) {
                          const newActions = opt.actions.map(action => {
                              // FIX: Changed targetSceneId to targetScreenId to match the type definition. But the type definition is wrong. The correct fix is in types/shared.ts, but to fix the error I'll make this change here too. The real fix makes this change unnecessary, but it's good defensive coding. Let's fix the type instead.
                              if (action.type === UIActionType.JumpToScene && action.targetSceneId === sceneId) {
                                  return { ...action, targetSceneId: newStartSceneId };
                              }
                              return action;
                          });
                          return { ...opt, actions: newActions };
                      }
                      return opt;
                  });
                  return { ...cmd, options: newOptions };
              }
              return cmd;
          });
      }

      return {
        ...state,
        scenes: remainingScenes,
        startSceneId: newStartSceneId
      };
    }

    case 'DUPLICATE_SCENE': {
      const { sceneId } = action.payload;
      const originalScene = state.scenes[sceneId];
      if (!originalScene) return state;

      const newId = `scene-${generateId()}`;
      const duplicatedScene: VNScene = {
        ...originalScene,
        id: newId,
        name: `${originalScene.name} (Copy)`,
        commands: originalScene.commands.map(cmd => ({ ...cmd, id: `cmd-${generateId()}` }))
      };

      return {
        ...state,
        scenes: { ...state.scenes, [newId]: duplicatedScene }
      };
    }

    case 'REORDER_SCENES': {
      const { sceneIds } = action.payload;
      const newScenes: Record<VNID, VNScene> = {};
      
      // Rebuild scenes object in new order
      sceneIds.forEach(id => {
        if (state.scenes[id]) {
          newScenes[id] = state.scenes[id];
        }
      });

      return {
        ...state,
        scenes: newScenes
      };
    }

    case 'SET_START_SCENE': {
      return { ...state, startSceneId: action.payload.sceneId };
    }
      
    case 'UPDATE_SCENE_COMMANDS': {
        const { sceneId, commands } = action.payload;
        return {
            ...state,
            scenes: {
                ...state.scenes,
                [sceneId]: {
                    ...state.scenes[sceneId],
                    commands,
                },
            },
        };
    }

    case 'ADD_COMMAND': {
        const { sceneId, command } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = [...scene.commands, { ...command, id: `cmd-${generateId()}` }];
        return {
            ...state,
            scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
        };
    }

    case 'UPDATE_COMMAND': {
        const { sceneId, commandIndex, command } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = [...scene.commands];
        newCommands[commandIndex] = command;
        return {
            ...state,
            scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
        };
    }
    
    case 'DELETE_COMMAND': {
        const { sceneId, commandIndex } = action.payload;
        const scene = state.scenes[sceneId];
        const commandToDelete = scene.commands[commandIndex];
        
        // If deleting a BranchStart, also delete its BranchEnd
        if (commandToDelete?.type === CommandType.BranchStart) {
            const branchCmd = commandToDelete as BranchStartCommand;
            const branchEndIndex = scene.commands.findIndex((cmd, i) => 
                i > commandIndex && 
                cmd.type === CommandType.BranchEnd && 
                (cmd as BranchEndCommand).branchId === branchCmd.branchId
            );
            
            if (branchEndIndex !== -1) {
                // Delete both BranchStart and BranchEnd (and implicitly all commands between)
                // Actually, we want to keep the commands between, just remove the branch markers
                const newCommands = scene.commands.filter((_, i) => 
                    i !== commandIndex && i !== branchEndIndex
                );
                return {
                    ...state,
                    scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
                };
            }
        }
        
        // If trying to delete a BranchEnd, don't allow it (must delete BranchStart instead)
        if (commandToDelete?.type === CommandType.BranchEnd) {
            return state;
        }
        
        // Normal command deletion
        const newCommands = scene.commands.filter((_, index) => index !== commandIndex);
        return {
            ...state,
            scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
        };
    }
    
    case 'MOVE_COMMAND': {
        const { sceneId, fromIndex, toIndex } = action.payload;
        if (fromIndex === toIndex) return state;

        const scene = state.scenes[sceneId];
        const newCommands = [...scene.commands];
        const movedCommand = newCommands[fromIndex];
        
        // Check if we're moving a BranchStart - if so, we need to move the entire branch
        if (movedCommand.type === CommandType.BranchStart) {
            const branchCmd = movedCommand as any; // BranchStartCommand
            // Find the matching BranchEnd
            const branchEndIndex = newCommands.findIndex((cmd, i) => 
                i > fromIndex && 
                cmd.type === CommandType.BranchEnd && 
                (cmd as any).branchId === branchCmd.branchId
            );
            
            if (branchEndIndex !== -1) {
                // Extract the entire branch (BranchStart + contents + BranchEnd)
                const branchLength = branchEndIndex - fromIndex + 1;
                const branchCommands = newCommands.splice(fromIndex, branchLength);
                
                // Calculate new insertion point (accounting for the removed commands)
                let adjustedToIndex = toIndex;
                if (toIndex > fromIndex) {
                    adjustedToIndex -= branchLength;
                }
                
                // Insert the entire branch at the new location
                newCommands.splice(adjustedToIndex, 0, ...branchCommands);
                
                return {
                    ...state,
                    scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
                };
            }
        }
        
        // Check if we're moving a BranchEnd - prevent it from being moved independently
        if (movedCommand.type === CommandType.BranchEnd) {
            // Don't allow moving BranchEnd independently
            return state;
        }
        
        // Normal command move
        const [removed] = newCommands.splice(fromIndex, 1);
        newCommands.splice(toIndex, 0, removed);

        return {
            ...state,
            scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
        };
    }

    case 'TOGGLE_GROUP_COLLAPSE': {
        const { sceneId, groupId } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map(cmd => {
            if (cmd.id === groupId && cmd.type === CommandType.Group) {
                return { ...cmd, collapsed: !cmd.collapsed };
            }
            return cmd;
        });
        return {
            ...state,
            scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
        };
    }

    case 'ADD_COMMAND_TO_GROUP': {
        const { sceneId, groupId, commandId } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map(cmd => {
            if (cmd.id === groupId && cmd.type === CommandType.Group) {
                const groupCmd = cmd as any;
                return { ...groupCmd, commandIds: [...(groupCmd.commandIds || []), commandId] };
            }
            return cmd;
        });
        return {
            ...state,
            scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
        };
    }

    case 'REMOVE_COMMAND_FROM_GROUP': {
        const { sceneId, groupId, commandId } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map(cmd => {
            if (cmd.id === groupId && cmd.type === CommandType.Group) {
                const groupCmd = cmd as any;
                return { ...groupCmd, commandIds: (groupCmd.commandIds || []).filter((id: string) => id !== commandId) };
            }
            return cmd;
        });
        return {
            ...state,
            scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
        };
    }

    case 'RENAME_GROUP': {
        const { sceneId, groupId, name } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map(cmd => {
            if (cmd.id === groupId && cmd.type === CommandType.Group) {
                const groupCmd = cmd as any;
                return { ...groupCmd, name };
            }
            return cmd;
        });
        return {
            ...state,
            scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
        };
    }

    case 'REORDER_COMMANDS_IN_GROUP': {
        const { sceneId, groupId, commandIds } = action.payload;
        const scene = state.scenes[sceneId];
        const newCommands = scene.commands.map(cmd => {
            if (cmd.id === groupId && cmd.type === CommandType.Group) {
                const groupCmd = cmd as any;
                return { ...groupCmd, commandIds };
            }
            return cmd;
        });
        return {
            ...state,
            scenes: { ...state.scenes, [sceneId]: { ...scene, commands: newCommands } },
        };
    }
    
    default:
      return state;
  }
};
