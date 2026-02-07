import { describe, it, expect } from 'vitest';
import { validateProjectForBuild, ValidationResult } from '../buildValidator';
import { VNProject } from '../../types/project';
import { CommandType, VNCommand } from '../../features/scene/types';

function createValidProject(overrides: Partial<VNProject> = {}): VNProject {
  return {
    id: 'test-project',
    title: 'Test Project',
    startSceneId: 'scene-1',
    scenes: {
      'scene-1': {
        id: 'scene-1',
        name: 'Opening Scene',
        commands: [
          { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'Hello!' } as VNCommand,
        ],
      },
    },
    characters: {},
    backgrounds: { 'bg-1': { id: 'bg-1', name: 'Forest', imageUrl: 'forest.png' } },
    images: {},
    audio: { 'audio-1': { id: 'audio-1', name: 'BGM', audioUrl: 'bgm.mp3' } },
    videos: {},
    variables: { 'var-1': { id: 'var-1', name: 'score', type: 'number', defaultValue: 0 } },
    fonts: {},
    ui: {
      titleScreenId: null,
      settingsScreenId: null,
      saveScreenId: null,
      loadScreenId: null,
      pauseScreenId: null,
      gameHudScreenId: null,
      dialogueBoxImage: null,
      choiceButtonImage: null,
      dialogueNameFont: { family: 'sans-serif', size: 16, color: '#ffffff', weight: 'bold', italic: false },
      dialogueTextFont: { family: 'sans-serif', size: 14, color: '#ffffff', weight: 'normal', italic: false },
      choiceTextFont: { family: 'sans-serif', size: 14, color: '#ffffff', weight: 'normal', italic: false },
    },
    uiScreens: {},
    ...overrides,
  };
}

describe('Build Validator', () => {
  describe('valid project', () => {
    it('passes validation for a well-formed project', () => {
      const project = createValidProject();
      const result = validateProjectForBuild(project);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('missing start scene', () => {
    it('reports error when startSceneId is empty', () => {
      const project = createValidProject({ startSceneId: '' });
      const result = validateProjectForBuild(project);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Start scene'))).toBe(true);
    });

    it('reports error when startSceneId references a non-existent scene', () => {
      const project = createValidProject({ startSceneId: 'non-existent-scene' });
      const result = validateProjectForBuild(project);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('Start scene'))).toBe(true);
    });
  });

  describe('no scenes', () => {
    it('reports error when project has no scenes', () => {
      const project = createValidProject({ scenes: {}, startSceneId: '' });
      const result = validateProjectForBuild(project);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('no scenes'))).toBe(true);
    });
  });

  describe('empty scene warning', () => {
    it('warns when a scene has no commands', () => {
      const project = createValidProject({
        scenes: {
          'scene-1': { id: 'scene-1', name: 'Empty Scene', commands: [] },
        },
      });
      const result = validateProjectForBuild(project);

      expect(result.warnings.some(w => w.message.includes('no commands'))).toBe(true);
    });
  });

  describe('broken scene references', () => {
    it('detects Jump commands targeting non-existent scenes', () => {
      const project = createValidProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'Hi' } as VNCommand,
              { id: 'cmd-2', type: CommandType.Jump, targetSceneId: 'scene-missing' } as VNCommand,
            ],
          },
        },
      });
      const result = validateProjectForBuild(project);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes("doesn't exist"))).toBe(true);
    });

    it('accepts Jump commands targeting existing scenes', () => {
      const project = createValidProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'Hi' } as VNCommand,
              { id: 'cmd-2', type: CommandType.Jump, targetSceneId: 'scene-2' } as VNCommand,
            ],
          },
          'scene-2': {
            id: 'scene-2',
            name: 'Scene Two',
            commands: [
              { id: 'cmd-3', type: CommandType.Dialogue, characterId: null, text: 'Bye' } as VNCommand,
            ],
          },
        },
      });
      const result = validateProjectForBuild(project);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('missing asset references', () => {
    it('reports error for SetBackground referencing missing background', () => {
      const project = createValidProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'Hi' } as VNCommand,
              { id: 'cmd-2', type: CommandType.SetBackground, backgroundId: 'missing-bg', transition: 'fade', duration: 1 } as VNCommand,
            ],
          },
        },
      });
      const result = validateProjectForBuild(project);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('missing background'))).toBe(true);
    });

    it('warns for missing audio references', () => {
      const project = createValidProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'Hi' } as VNCommand,
              { id: 'cmd-2', type: CommandType.PlayMusic, audioId: 'missing-audio', loop: true, fadeDuration: 1 } as VNCommand,
            ],
          },
        },
      });
      const result = validateProjectForBuild(project);

      expect(result.warnings.some(w => w.message.includes('missing audio'))).toBe(true);
    });
  });

  describe('missing character references', () => {
    it('reports error for ShowCharacter referencing missing character', () => {
      const project = createValidProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'Hi' } as VNCommand,
              {
                id: 'cmd-2', type: CommandType.ShowCharacter,
                characterId: 'missing-char', expressionId: 'expr-1',
                position: 'center', transition: 'fade', duration: 0.5,
              } as VNCommand,
            ],
          },
        },
      });
      const result = validateProjectForBuild(project);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('missing character'))).toBe(true);
    });
  });

  describe('choice validation', () => {
    it('warns when a Choice command has no options', () => {
      const project = createValidProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Scene One',
            commands: [
              { id: 'cmd-1', type: CommandType.Dialogue, characterId: null, text: 'Hi' } as VNCommand,
              { id: 'cmd-2', type: CommandType.Choice, options: [] } as VNCommand,
            ],
          },
        },
      });
      const result = validateProjectForBuild(project);

      expect(result.warnings.some(w => w.message.includes('no options'))).toBe(true);
    });
  });

  describe('no dialogue warning', () => {
    it('warns when no scene has any Dialogue commands', () => {
      const project = createValidProject({
        scenes: {
          'scene-1': {
            id: 'scene-1',
            name: 'Empty Commands Scene',
            commands: [
              { id: 'cmd-1', type: CommandType.Jump, targetSceneId: 'scene-1' } as VNCommand,
            ],
          },
        },
      });
      const result = validateProjectForBuild(project);

      expect(result.warnings.some(w => w.message.includes('No dialogue'))).toBe(true);
    });
  });
});
