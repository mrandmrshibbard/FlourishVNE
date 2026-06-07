import { VNProject } from '../types/project';
import { CommandType, VNCommand } from '../features/scene/types';
import { VNID } from '../types';

export interface ValidationIssue {
    severity: 'error' | 'warning';
    message: string;
    location?: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
}

export function validateProjectForBuild(project: VNProject): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    if (!project.startSceneId || !project.scenes[project.startSceneId]) {
        errors.push({
            severity: 'error',
            message: 'Start scene is missing or not set. The game will not know where to begin.',
            location: 'Project Settings'
        });
    }

    const sceneIds = new Set(Object.keys(project.scenes));
    if (sceneIds.size === 0) {
        errors.push({
            severity: 'error',
            message: 'Project has no scenes. Add at least one scene before building.',
            location: 'Scenes'
        });
    }

    for (const [sceneId, scene] of Object.entries(project.scenes)) {
        if (scene.commands.length === 0) {
            warnings.push({
                severity: 'warning',
                message: `Scene "${scene.name}" has no commands and will appear blank.`,
                location: `Scene: ${scene.name}`
            });
        }

        for (const cmd of scene.commands) {
            validateCommand(cmd, project, scene.name, sceneIds, errors, warnings);
        }
    }

    const hasDialogue = Object.values(project.scenes).some(scene =>
        scene.commands.some(cmd => cmd.type === CommandType.Dialogue)
    );
    if (!hasDialogue) {
        warnings.push({
            severity: 'warning',
            message: 'No dialogue commands found in any scene. Is this intentional?',
            location: 'Project'
        });
    }

    // Validate CG Gallery
    if (project.cgGallery) {
        const entries = Object.values(project.cgGallery.entries || {});
        for (const entry of entries) {
            const e = entry as any;
            if (!e.assetId) {
                warnings.push({
                    severity: 'warning',
                    message: `CG Gallery entry "${e.name || e.id}" has no asset assigned.`,
                    location: 'CG Gallery'
                });
            } else if (!project.images?.[e.assetId] && !project.backgrounds?.[e.assetId] && !project.videos?.[e.assetId]) {
                errors.push({
                    severity: 'error',
                    message: `CG Gallery entry "${e.name || e.id}" references a missing asset (ID: ${e.assetId}).`,
                    location: 'CG Gallery'
                });
            }
            if (e.unlockable && e.unlockVariableId) {
                if (!project.variables[e.unlockVariableId]) {
                    errors.push({
                        severity: 'error',
                        message: `CG Gallery entry "${e.name || e.id}" references a missing unlock variable (ID: ${e.unlockVariableId}).`,
                        location: 'CG Gallery'
                    });
                }
            }
        }
        if (project.cgGallery.lockedPlaceholderAssetId) {
            const phId = project.cgGallery.lockedPlaceholderAssetId;
            if (!project.images?.[phId] && !project.backgrounds?.[phId]) {
                warnings.push({
                    severity: 'warning',
                    message: 'CG Gallery locked placeholder references a missing image asset.',
                    location: 'CG Gallery'
                });
            }
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

function validateCommand(
    cmd: VNCommand,
    project: VNProject,
    sceneName: string,
    sceneIds: Set<string>,
    errors: ValidationIssue[],
    warnings: ValidationIssue[]
) {
    const loc = `Scene: ${sceneName}`;

    switch (cmd.type) {
        case CommandType.ShowCharacter: {
            if (!project.characters[cmd.characterId]) {
                errors.push({
                    severity: 'error',
                    message: `ShowCharacter references missing character (ID: ${cmd.characterId}).`,
                    location: loc
                });
            } else if (!project.characters[cmd.characterId]?.expressions?.[cmd.expressionId]) {
                warnings.push({
                    severity: 'warning',
                    message: `ShowCharacter references missing expression for character "${project.characters[cmd.characterId]?.name}".`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.HideCharacter: {
            if (!project.characters[cmd.characterId]) {
                warnings.push({
                    severity: 'warning',
                    message: `HideCharacter references missing character (ID: ${cmd.characterId}).`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.SetBackground: {
            // Skip asset check when using solid color background
            if (!cmd.backgroundColor && !project.backgrounds[cmd.backgroundId] && !project.images?.[cmd.backgroundId]) {
                errors.push({
                    severity: 'error',
                    message: `SetBackground references missing background asset (ID: ${cmd.backgroundId}).`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.Jump: {
            if (!sceneIds.has(cmd.targetSceneId)) {
                errors.push({
                    severity: 'error',
                    message: `Jump command targets a scene that doesn't exist (ID: ${cmd.targetSceneId}).`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.PlayMusic:
        case CommandType.PlaySoundEffect: {
            if (!project.audio[cmd.audioId]) {
                warnings.push({
                    severity: 'warning',
                    message: `Audio command references missing audio asset (ID: ${cmd.audioId}).`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.PlayMovie: {
            if (!project.videos[cmd.videoId]) {
                warnings.push({
                    severity: 'warning',
                    message: `PlayMovie references missing video asset (ID: ${cmd.videoId}).`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.SetVariable:
        case CommandType.TextInput: {
            if (!project.variables[cmd.variableId]) {
                warnings.push({
                    severity: 'warning',
                    message: `Command references missing variable (ID: ${cmd.variableId}).`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.ShowImage: {
            if (!project.images[cmd.imageId]) {
                warnings.push({
                    severity: 'warning',
                    message: `ShowImage references missing image asset (ID: ${cmd.imageId}).`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.ShowScreen: {
            if (!project.uiScreens[cmd.screenId]) {
                warnings.push({
                    severity: 'warning',
                    message: `ShowScreen references missing UI screen (ID: ${cmd.screenId}).`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.Choice: {
            if (cmd.options.length === 0) {
                warnings.push({
                    severity: 'warning',
                    message: `Choice command has no options. Players will be stuck.`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.RunScript: {
            const scripts = project.scripts || {};
            if (!cmd.scriptId || !scripts[cmd.scriptId]) {
                errors.push({
                    severity: 'error',
                    message: `RunScript references missing script (ID: ${cmd.scriptId || 'none'}).`,
                    location: loc
                });
            } else if (!scripts[cmd.scriptId].enabled) {
                warnings.push({
                    severity: 'warning',
                    message: `RunScript references disabled script "${scripts[cmd.scriptId].name}".`,
                    location: loc
                });
            }
            break;
        }
    }
}
