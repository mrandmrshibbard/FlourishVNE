import { CommandType } from '../features/scene/types';
import { VNProject } from '../types/project';
import { VNCommand } from '../features/scene/types';
import { UIActionType } from '../types/shared';


const generateId = () => `opt-${Math.random().toString(36).substring(2, 9)}`;

const generateBranchId = () => `branch-${Math.random().toString(36).substring(2, 9)}`;

type CreateCommandOptions = {
    branchId?: string;
};

export const createCommand = (type: CommandType, project: VNProject, options: CreateCommandOptions = {}): Omit<VNCommand, 'id'> | null => {
    const firstCharId = Object.keys(project.characters)[0];
    const firstBgId = Object.keys(project.backgrounds)[0];
    const firstImageId = Object.keys(project.images || {})[0];
    const firstAudioId = Object.keys(project.audio)[0];
    const firstVideoId = Object.keys(project.videos)[0];
    const firstVarId = Object.keys(project.variables)[0];
    const firstSceneId = Object.keys(project.scenes)[0];
    const firstScreenId = Object.keys(project.uiScreens)[0];
    const firstChar = firstCharId ? project.characters[firstCharId] : null;
    const firstExpressionId = firstChar ? Object.keys(firstChar.expressions)[0] : '';

    switch(type) {
        case CommandType.Dialogue: {
            const command = { type, characterId: null, text: 'New dialogue...' };
            return command;
        }
        case CommandType.SetBackground: {
            const command = { type, backgroundId: firstBgId || firstImageId || '', transition: 'fade', duration: 1 };
            return command;
        }
        case CommandType.ShowCharacter: {
            const command = { type, characterId: firstCharId || '', expressionId: firstExpressionId || '', position: 'center', transition: 'fade', duration: 1 };
            return command;
        }
        case CommandType.HideCharacter: {
            const command = { type, characterId: firstCharId || '', transition: 'fade', duration: 1 };
            return command;
        }
        case CommandType.Choice: {
            const command = {
                type,
                options: [{
                    id: generateId(),
                    text: 'Option 1',
                    actions: [{ type: UIActionType.JumpToScene, targetSceneId: firstSceneId || '' }]
                }]
            };
            return command;
        }
        case CommandType.BranchStart: {
            const branchId = options.branchId || generateBranchId();
            const command = { type, name: 'New Branch', color: '#38bdf8', branchId, isCollapsed: false };
            return command;
        }
        case CommandType.BranchEnd: {
            const branchId = options.branchId || generateBranchId();
            const command = { type, branchId };
            return command;
        }
        case CommandType.PlayMusic: {
            const command = { type, audioId: firstAudioId || '', loop: true, fadeDuration: 1 };
            return command;
        }
        case CommandType.StopMusic: {
            const command = { type, fadeDuration: 1 };
            return command;
        }
        case CommandType.PlaySoundEffect: {
            const command = { type, audioId: firstAudioId || '' };
            return command;
        }
        case CommandType.StopSoundEffect: {
            const command = { type };
            return command;
        }
        case CommandType.PlayMovie: {
            const command = { type, videoId: firstVideoId || '', waitsForCompletion: true };
            return command;
        }
        case CommandType.SetVariable: {
            const firstVar = project.variables[firstVarId || ''];
            let defaultValue: string | number | boolean = 0;
            if (firstVar) {
                if (firstVar.type === 'boolean') {
                    defaultValue = false;
                } else if (firstVar.type === 'number') {
                    defaultValue = 0;
                } else {
                    defaultValue = '';
                }
            }
            const command = { type, variableId: firstVarId || '', operator: 'set', value: defaultValue };
            return command;
        }
        case CommandType.TextInput: {
            const command = { type, variableId: firstVarId || '', prompt: 'Enter your name:', placeholder: 'Type here...', maxLength: 50 };
            return command;
        }
        case CommandType.Jump: {
            const command = { type, targetSceneId: firstSceneId || '' };
            return command;
        }
        case CommandType.Wait: {
            const command = { type, duration: 1, waitForInput: true };
            return command;
        }
        case CommandType.ShakeScreen: {
            const command = { type, duration: 0.5, intensity: 5 };
            return command;
        }
        case CommandType.TintScreen: {
            const command = { type, color: '#00000080', duration: 1 };
            return command;
        }
        case CommandType.PanZoomScreen: {
            const command = { type, zoom: 1.2, panX: 0, panY: 0, duration: 1 };
            return command;
        }
        case CommandType.ResetScreenEffects: {
            const command = { type, duration: 1 };
            return command;
        }
        case CommandType.FlashScreen: {
            const command = { type, color: '#FFFFFF', duration: 0.5 };
            return command;
        }
        case CommandType.ShowScreen: {
            const command = { type, screenId: firstScreenId || '' };
            return command;
        }
        case CommandType.ShowText: {
            const command = {
                type,
                text: 'Sample Text',
                x: 50,
                y: 50,
                fontSize: 24,
                fontFamily: 'Arial',
                color: '#FFFFFF',
                width: 400,
                textAlign: 'center' as const,
                verticalAlign: 'middle' as const,
                transition: 'fade' as const,
                duration: 0.5,
            };
            return command;
        }
        case CommandType.ShowImage: {
            const command = {
                type,
                imageId: firstImageId || '',
                x: 50,
                y: 50,
                width: 200,
                height: 200,
                rotation: 0,
                opacity: 1,
                scaleX: 1,
                scaleY: 1,
                transition: 'fade' as const,
                duration: 0.5,
            };
            return command;
        }
        case CommandType.Label: {
            const command = { type, labelId: 'new_label' };
            return command;
        }
        case CommandType.JumpToLabel: {
            const command = { type, labelId: 'new_label' };
            return command;
        }
        case CommandType.HideText: {
            const command = {
                type,
                targetCommandId: '',
                transition: 'fade' as const,
                duration: 0.5,
            };
            return command;
        }
        case CommandType.HideImage: {
            const command = {
                type,
                targetCommandId: '',
                transition: 'fade' as const,
                duration: 0.5,
            };
            return command;
        }
        case CommandType.ShowButton: {
            const command = {
                type,
                text: 'Button',
                x: 50,
                y: 80,
                width: 20,
                height: 8,
                anchorX: 0.5,
                anchorY: 0.5,
                backgroundColor: '#6366f1',
                textColor: '#ffffff',
                fontSize: 18,
                fontWeight: 'normal' as const,
                borderRadius: 8,
                image: null,
                hoverImage: null,
                onClick: { type: 'None' as const },
                clickSound: null,
                waitForClick: false,
                transition: 'fade' as const,
                duration: 0.3,
                showConditions: [],
            };
            return command;
        }
        case CommandType.HideButton: {
            const command = {
                type,
                targetCommandId: '',
                transition: 'fade' as const,
                duration: 0.3,
            };
            return command;
        }
        case CommandType.Group: {
            const command = {
                type,
                name: 'New Group',
                commandIds: [],
                collapsed: false,
            };
            return command;
        }
        default: 
            return null;
    }
};
