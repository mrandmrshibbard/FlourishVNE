import { CommandType } from '../features/scene/types';
import { VNProject } from '../types/project';
import { VNCommand } from '../features/scene/types';
import { UIActionType } from '../types/shared';
import { pluginManager } from '../features/plugins/PluginManagerService';


const generateId = () => `opt-${Math.random().toString(36).substring(2, 9)}`;

const generateBranchId = () => `branch-${Math.random().toString(36).substring(2, 9)}`;

type CreateCommandOptions = {
    branchId?: string;
};

export const createCommand = (type: CommandType | string, project: VNProject, options: CreateCommandOptions = {}): Omit<VNCommand, 'id'> | null => {
    // Custom command registered by a plugin (type = "pluginId.command"): build a command
    // object carrying the parameter defaults under `params`.
    const customDef = pluginManager.getCommand(type as string);
    if (customDef) {
        const params: Record<string, any> = {};
        for (const p of customDef.parameters || []) params[p.name] = p.defaultValue ?? (p.type === 'number' ? 0 : p.type === 'boolean' ? false : '');
        return { type, params } as unknown as Omit<VNCommand, 'id'>;
    }
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
        case CommandType.SetCharacterLayer: {
            const command = { type, characterId: firstCharId || '', layers: [], duration: 0.3 };
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
        case CommandType.BranchElseIf: {
            const branchId = options.branchId || generateBranchId();
            const command = { type, branchId };
            return command;
        }
        case CommandType.BranchElse: {
            const branchId = options.branchId || generateBranchId();
            const command = { type, branchId };
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
            const command = { type, audioId: '', fadeDuration: 0 };
            return command;
        }
        case CommandType.PlayMovie: {
            const command = { type, videoId: firstVideoId || '', waitsForCompletion: true, displayMode: 'fullscreen' as const, loop: false, x: 0, y: 0, width: 100, height: 100, opacity: 1, objectFit: 'cover' as const };
            return command;
        }
        case CommandType.StopMovie: {
            const command = { type };
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
        case CommandType.Lightning: {
            const command = { type, color: '#EAF2FF', intensity: 0.9, duration: 0.7, flashes: 2 as const, thunderSfxId: null, thunderDelay: 0.6 };
            return command;
        }
        case CommandType.Fireworks: {
            const command = { type, colors: [] as string[], bursts: 3, duration: 2.5, intensity: 1, burstHeight: 0.7, sfxId: null, sfxDelay: 0.3, sfxPerBurst: false };
            return command;
        }
        case CommandType.PlaceLights: {
            const command = { type, lights: [] as any[], aboveCharacters: false };
            return command;
        }
        case CommandType.ClearLights: {
            const command = { type };
            return command;
        }
        case CommandType.ShowPhone:
        case CommandType.HidePhone:
        case CommandType.HidePhoneText: {
            return { type };
        }
        case CommandType.ShowPhoneText: {
            const command = { type, senderId: firstCharId || 'player', text: '', choices: [] as any[] };
            return command;
        }
        case CommandType.PhoneIncomingText: {
            const command = { type, senderId: firstCharId || 'player', text: '', presentation: 'notify', showBadge: true, replies: [] as any[] };
            return command;
        }
        case CommandType.PhoneIncomingCall: {
            const command = { type, callerId: firstCharId || 'player', mode: 'modal', ringDurationMs: 12000, onTimeout: 'missed', acceptActions: [] as any[], declineActions: [] as any[], timeoutActions: [] as any[], showBadge: true };
            return command;
        }
        case CommandType.Flashlight: {
            const command = { type, enabled: true, radius: 22, softness: 0.6, darkness: 0.85, color: '#000000', toggleKey: 'f', sfxId: null };
            return command;
        }
        case CommandType.SetScreenOverlayEffect: {
            const command = { type, effectType: 'crtScanlines' as const, intensity: 0.5, duration: 0 };
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
                fontWeight: 'normal' as const,
                fontStyle: 'normal' as const,
                letterSpacing: 0,
                textShadow: { enabled: false, offsetX: 2, offsetY: 2, blur: 4, color: '#000000' },
                textGradient: { enabled: false, type: 'linear' as const, angle: 90, colors: ['#ff00a5', '#8a2be2'] },
                textBorder: { enabled: false, width: 1, color: '#000000' },
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
                opacity: 1,
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
        case CommandType.ShowItem: {
            const firstItemId = Object.keys(project.items || {})[0] || '';
            const command = {
                type,
                itemId: firstItemId,
                quantity: 1,
                x: 50,
                y: 50,
                width: 10,
                height: 10,
                anchorX: 0.5,
                anchorY: 0.5,
                opacity: 1,
                image: null,
                hoverImage: null,
                giveOnClick: true,
                removeAfterPickup: true,
                pickUpOnce: true,
                actions: [],
                clickSound: null,
                showConditions: [],
                transition: 'fade' as const,
                duration: 0.3,
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
        case CommandType.CreditRoll: {
            const command = {
                type,
                entries: [
                    { kind: 'heading' as const, label: 'Credits' },
                    { kind: 'credit' as const, label: 'Created with', value: 'Flourish Visual Novel Engine' },
                ],
                duration: 15,
                scrollSpeed: 60,
                backgroundColor: '#000000FF',
                textColor: '#FFFFFF',
                allowSkip: true,
                onComplete: 'advance' as const,
                backgrounds: [] as Array<{ assetId: null; displayDuration: number; transition: string; transitionDuration: number }>,
            };
            return command;
        }
        case CommandType.RunScript: {
            const firstScriptId = Object.keys(project.scripts || {})[0];
            const command = { type, scriptId: firstScriptId || '', waitForCompletion: true };
            return command;
        }
        case CommandType.SpawnParticles: {
            const command = {
                type,
                // Empty by default so the runtime derives a unique tag per command
                // (`particles_<id>`). A hardcoded shared tag made multiple emitters
                // collide and made Stop Particles ambiguous. Users can still name it.
                particleTag: '',
                config: {
                    preset: 'fireflies',
                    shape: 'circle' as const,
                    colors: ['#FFFF66', '#CCFF33'],
                    emitRate: 10,
                    lifetime: 3,
                    speedMin: 10,
                    speedMax: 30,
                    sizeMin: 2,
                    sizeMax: 6,
                    gravity: 0,
                    wind: 0,
                    directionMin: 0,
                    directionMax: 360,
                    emitterX: 50,
                    emitterY: 50,
                    emitterWidth: 100,
                    emitterHeight: 100,
                    fadeOut: true,
                    shrink: false,
                    rotationSpeed: 0,
                    opacity: 0.9,
                },
                duration: 0,
            };
            return command;
        }
        case CommandType.StopParticles: {
            const command = {
                type,
                particleTag: '',
                fadeDuration: 1,
            };
            return command;
        }
        case CommandType.ShowHotSpot: {
            return {
                type,
                name: 'Hot Spot',
                x: 40,
                y: 40,
                width: 20,
                height: 20,
                shape: 'rect' as const,
                trigger: 'click' as const,
                actions: [],
                conditions: [],
                acceptedTag: '',
                highlightColor: 'rgba(99,102,241,0.35)',
                visible: false,
                advanceOnTrigger: false,
            } as Omit<VNCommand, 'id'>;
        }
        case CommandType.HideHotSpot: {
            return {
                type,
                targetCommandId: '',
            } as Omit<VNCommand, 'id'>;
        }
        case CommandType.CallCommonEvent: {
            return {
                type,
                commonEventId: '',
            } as Omit<VNCommand, 'id'>;
        }
        case CommandType.TweenElement: {
            return {
                type,
                targetId: '',
                targetType: 'character' as const,
                duration: 1,
                easing: 'easeInOutCubic',
                waitForCompletion: true,
            } as Omit<VNCommand, 'id'>;
        }
        default: 
            return null;
    }
};
