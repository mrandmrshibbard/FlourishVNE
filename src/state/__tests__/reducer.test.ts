import { describe, it, expect } from 'vitest';
import { sceneReducer } from '../../features/scene/state/sceneReducer';
import { projectReducer } from '../../features/project/state/projectReducer';
import { rootReducer } from '../rootReducer';
import { VNProject } from '../../types/project';
import { CommandType, VNCommand } from '../../features/scene/types';

function createEmptyProject(overrides: Partial<VNProject> = {}): VNProject {
  return {
    id: 'test-project',
    title: 'Test Project',
    startSceneId: 'scene-1',
    scenes: {
      'scene-1': { id: 'scene-1', name: 'Scene One', commands: [] },
    },
    characters: {},
    backgrounds: {},
    images: {},
    audio: {},
    videos: {},
    variables: {},
    fonts: {},
    ui: {
      titleScreenId: null,
      settingsScreenId: null,
      saveScreenId: null,
      loadScreenId: null,
      pauseScreenId: null,
      gameHudScreenId: null,
      dialogueBoxImage: null,
      dialogueBoxBorderImage: null,
      choiceButtonImage: null,
      choiceButtonBorderImage: null,
      dialogueNameFont: { family: 'sans-serif', size: 16, color: '#ffffff', weight: 'bold', italic: false },
      dialogueTextFont: { family: 'sans-serif', size: 14, color: '#ffffff', weight: 'normal', italic: false },
      choiceTextFont: { family: 'sans-serif', size: 14, color: '#ffffff', weight: 'normal', italic: false },
      inputBoxImage: null,
      inputBoxBorderImage: null,
      inputPromptFont: { family: 'sans-serif', size: 14, color: '#ffffff', weight: 'normal', italic: false },
      inputFieldFont: { family: 'sans-serif', size: 14, color: '#ffffff', weight: 'normal', italic: false },
      inputSubmitFont: { family: 'sans-serif', size: 14, color: '#ffffff', weight: 'normal', italic: false },
    },
    uiScreens: {},
    ...overrides,
  };
}

describe('Scene Reducer', () => {
  describe('ADD_SCENE', () => {
    it('adds a new scene to the project', () => {
      const state = createEmptyProject();
      const result = sceneReducer(state, { type: 'ADD_SCENE', payload: { name: 'New Scene' } });

      const sceneIds = Object.keys(result.scenes);
      expect(sceneIds.length).toBe(2);

      const newSceneId = sceneIds.find(id => id !== 'scene-1')!;
      expect(result.scenes[newSceneId].name).toBe('New Scene');
      expect(result.scenes[newSceneId].commands).toEqual([]);
    });

    it('generates a unique ID for the new scene', () => {
      const state = createEmptyProject();
      const result1 = sceneReducer(state, { type: 'ADD_SCENE', payload: { name: 'A' } });
      const result2 = sceneReducer(state, { type: 'ADD_SCENE', payload: { name: 'B' } });

      const newId1 = Object.keys(result1.scenes).find(id => id !== 'scene-1');
      const newId2 = Object.keys(result2.scenes).find(id => id !== 'scene-1');
      expect(newId1).toMatch(/^scene-/);
      expect(newId2).toMatch(/^scene-/);
    });
  });

  describe('DELETE_SCENE', () => {
    it('removes a scene from the project', () => {
      const state = createEmptyProject({
        scenes: {
          'scene-1': { id: 'scene-1', name: 'Scene One', commands: [] },
          'scene-2': { id: 'scene-2', name: 'Scene Two', commands: [] },
        },
      });
      const result = sceneReducer(state, { type: 'DELETE_SCENE', payload: { sceneId: 'scene-2' } });

      expect(Object.keys(result.scenes)).toEqual(['scene-1']);
      expect(result.scenes['scene-2']).toBeUndefined();
    });

    it('prevents deleting the last scene', () => {
      const state = createEmptyProject();
      const result = sceneReducer(state, { type: 'DELETE_SCENE', payload: { sceneId: 'scene-1' } });

      expect(result).toBe(state);
      expect(Object.keys(result.scenes).length).toBe(1);
    });

    it('updates startSceneId when deleting the start scene', () => {
      const state = createEmptyProject({
        startSceneId: 'scene-1',
        scenes: {
          'scene-1': { id: 'scene-1', name: 'Scene One', commands: [] },
          'scene-2': { id: 'scene-2', name: 'Scene Two', commands: [] },
        },
      });
      const result = sceneReducer(state, { type: 'DELETE_SCENE', payload: { sceneId: 'scene-1' } });

      expect(result.startSceneId).toBe('scene-2');
    });

    it('updates Jump commands that reference the deleted scene', () => {
      const state = createEmptyProject({
        startSceneId: 'scene-1',
        scenes: {
          'scene-1': { id: 'scene-1', name: 'Scene One', commands: [{
            id: 'cmd-1', type: CommandType.Jump, targetSceneId: 'scene-2'
          } as VNCommand] },
          'scene-2': { id: 'scene-2', name: 'Scene Two', commands: [] },
          'scene-3': { id: 'scene-3', name: 'Scene Three', commands: [] },
        },
      });
      const result = sceneReducer(state, { type: 'DELETE_SCENE', payload: { sceneId: 'scene-2' } });

      const jumpCmd = result.scenes['scene-1'].commands[0];
      expect(jumpCmd.type).toBe(CommandType.Jump);
      if (jumpCmd.type === CommandType.Jump) {
        expect(jumpCmd.targetSceneId).toBe('scene-1');
      }
    });
  });

  describe('ADD_COMMAND', () => {
    it('adds a command to a scene', () => {
      const state = createEmptyProject();
      const command: VNCommand = {
        id: 'temp',
        type: CommandType.Dialogue,
        characterId: null,
        text: 'Hello world',
      };
      const result = sceneReducer(state, {
        type: 'ADD_COMMAND',
        payload: { sceneId: 'scene-1', command },
      });

      expect(result.scenes['scene-1'].commands.length).toBe(1);
      expect(result.scenes['scene-1'].commands[0].type).toBe(CommandType.Dialogue);
      expect((result.scenes['scene-1'].commands[0] as any).text).toBe('Hello world');
    });

    it('assigns a new ID to the added command', () => {
      const state = createEmptyProject();
      const command: VNCommand = {
        id: 'temp-id',
        type: CommandType.Dialogue,
        characterId: null,
        text: 'Test',
      };
      const result = sceneReducer(state, {
        type: 'ADD_COMMAND',
        payload: { sceneId: 'scene-1', command },
      });

      expect(result.scenes['scene-1'].commands[0].id).not.toBe('temp-id');
      expect(result.scenes['scene-1'].commands[0].id).toMatch(/^cmd-/);
    });
  });

  describe('DELETE_COMMAND', () => {
    it('removes a command by index', () => {
      const state = createEmptyProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'First' } as VNCommand,
              { id: 'cmd-2', type: CommandType.Dialogue, characterId: null, text: 'Second' } as VNCommand,
            ],
          },
        },
      });
      const result = sceneReducer(state, {
        type: 'DELETE_COMMAND',
        payload: { sceneId: 'scene-1', commandIndex: 0 },
      });

      expect(result.scenes['scene-1'].commands.length).toBe(1);
      expect((result.scenes['scene-1'].commands[0] as any).text).toBe('Second');
    });

    it('prevents deleting a BranchEnd command independently', () => {
      const state = createEmptyProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.BranchStart, name: 'Branch', color: '#ff0000', branchId: 'branch-1' } as VNCommand,
              { id: 'cmd-2', type: CommandType.Dialogue, characterId: null, text: 'Inside branch' } as VNCommand,
              { id: 'cmd-3', type: CommandType.BranchEnd, branchId: 'branch-1' } as VNCommand,
            ],
          },
        },
      });
      const result = sceneReducer(state, {
        type: 'DELETE_COMMAND',
        payload: { sceneId: 'scene-1', commandIndex: 2 },
      });

      expect(result).toBe(state);
    });

    it('deletes both BranchStart and BranchEnd when deleting a BranchStart', () => {
      const state = createEmptyProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.BranchStart, name: 'Branch', color: '#ff0000', branchId: 'branch-1' } as VNCommand,
              { id: 'cmd-2', type: CommandType.Dialogue, characterId: null, text: 'Inside branch' } as VNCommand,
              { id: 'cmd-3', type: CommandType.BranchEnd, branchId: 'branch-1' } as VNCommand,
            ],
          },
        },
      });
      const result = sceneReducer(state, {
        type: 'DELETE_COMMAND',
        payload: { sceneId: 'scene-1', commandIndex: 0 },
      });

      expect(result.scenes['scene-1'].commands.length).toBe(1);
      expect((result.scenes['scene-1'].commands[0] as any).text).toBe('Inside branch');
    });
  });

  describe('SET_START_SCENE', () => {
    it('updates the start scene ID', () => {
      const state = createEmptyProject({
        scenes: {
          'scene-1': { id: 'scene-1', name: 'Scene One', commands: [] },
          'scene-2': { id: 'scene-2', name: 'Scene Two', commands: [] },
        },
      });
      const result = sceneReducer(state, {
        type: 'SET_START_SCENE',
        payload: { sceneId: 'scene-2' },
      });

      expect(result.startSceneId).toBe('scene-2');
    });
  });

  describe('MOVE_COMMAND', () => {
    it('moves a command from one index to another', () => {
      const state = createEmptyProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'First' } as VNCommand,
              { id: 'cmd-2', type: CommandType.Dialogue, characterId: null, text: 'Second' } as VNCommand,
              { id: 'cmd-3', type: CommandType.Dialogue, characterId: null, text: 'Third' } as VNCommand,
            ],
          },
        },
      });
      const result = sceneReducer(state, {
        type: 'MOVE_COMMAND',
        payload: { sceneId: 'scene-1', fromIndex: 0, toIndex: 2 },
      });

      expect((result.scenes['scene-1'].commands[0] as any).text).toBe('Second');
      expect((result.scenes['scene-1'].commands[1] as any).text).toBe('Third');
      expect((result.scenes['scene-1'].commands[2] as any).text).toBe('First');
    });

    it('returns state unchanged when fromIndex equals toIndex', () => {
      const state = createEmptyProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'First' } as VNCommand,
            ],
          },
        },
      });
      const result = sceneReducer(state, {
        type: 'MOVE_COMMAND',
        payload: { sceneId: 'scene-1', fromIndex: 0, toIndex: 0 },
      });

      expect(result).toBe(state);
    });

    it('prevents moving a BranchEnd independently', () => {
      const state = createEmptyProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'Before' } as VNCommand,
              { id: 'cmd-2', type: CommandType.BranchEnd, branchId: 'branch-1' } as VNCommand,
            ],
          },
        },
      });
      const result = sceneReducer(state, {
        type: 'MOVE_COMMAND',
        payload: { sceneId: 'scene-1', fromIndex: 1, toIndex: 0 },
      });

      expect(result).toBe(state);
    });
  });
});

describe('Root Reducer', () => {
  it('returns state unchanged for unknown action types', () => {
    const state = createEmptyProject();
    const result = rootReducer(state, { type: 'UNKNOWN_ACTION' } as any);

    expect(result).toBe(state);
  });

  it('delegates scene actions to sceneReducer', () => {
    const state = createEmptyProject();
    const result = rootReducer(state, { type: 'ADD_SCENE', payload: { name: 'Via Root' } });

    expect(Object.keys(result.scenes).length).toBe(2);
  });

  it('delegates project actions to projectReducer', () => {
    const state = createEmptyProject();
    const result = rootReducer(state, { type: 'UPDATE_PROJECT_TITLE', payload: { title: 'New Title' } });

    expect(result.title).toBe('New Title');
  });
});
