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

    // Validate travel maps (locations jump to scenes) + the phone's Map app pointer.
    for (const map of Object.values(project.maps || {})) {
        for (const locEntry of map.locations || []) {
            if (locEntry.targetSceneId && !sceneIds.has(locEntry.targetSceneId)) {
                errors.push({
                    severity: 'error',
                    message: `Map "${map.name}" location "${locEntry.name}" travels to a scene that doesn't exist (ID: ${locEntry.targetSceneId}).`,
                    location: `Map: ${map.name}`
                });
            }
        }
    }
    if (project.ui.phoneMapId && !project.maps?.[project.ui.phoneMapId]) {
        warnings.push({
            severity: 'warning',
            message: `The phone's Map app points at a deleted map — the app will be hidden in-game.`,
            location: 'In-Game UI → Phone'
        });
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
        case CommandType.ShowMap: {
            const m = (project.maps || {})[(cmd as any).mapId];
            if (!m) {
                errors.push({
                    severity: 'error',
                    message: `Show Map references a map that doesn't exist (ID: ${(cmd as any).mapId || 'none'}).`,
                    location: loc
                });
            }
            break;
        }
        case CommandType.ShowMiniGame: {
            const g = (project.miniGames || {})[(cmd as any).gameId];
            if (!g) {
                errors.push({
                    severity: 'error',
                    message: `Show Mini Game references a mini game that doesn't exist (ID: ${(cmd as any).gameId || 'none'}).`,
                    location: loc
                });
            } else if (!g.stages?.length) {
                warnings.push({
                    severity: 'warning',
                    message: `Mini game "${g.name}" has no stages — it will be skipped at runtime.`,
                    location: loc
                });
            } else {
                // Per-stage config sanity: half-configured stages fall back to a tap-through
                // placeholder at runtime (never brick), but the author should know.
                g.stages.forEach((st: any, i: number) => {
                    const where = `Mini game "${g.name}" stage ${i + 1}`;
                    if (st.stageType === 'memory' && !(st.faces?.length)) {
                        warnings.push({ severity: 'warning', message: `${where} (memory match) has no card faces — it shows a tap-to-continue placeholder.`, location: loc });
                    }
                    if (st.stageType === 'hidden') {
                        if (!st.sceneImageId) warnings.push({ severity: 'warning', message: `${where} (hidden objects) has no scene image — it shows a tap-to-continue placeholder.`, location: loc });
                        else if (!(st.hotspots?.length)) warnings.push({ severity: 'warning', message: `${where} (hidden objects) has no objects placed — it shows a tap-to-continue placeholder.`, location: loc });
                    }
                    if (st.stageType === 'sliding' && !st.imageId) {
                        warnings.push({ severity: 'warning', message: `${where} (sliding puzzle) has no image — it shows a tap-to-continue placeholder.`, location: loc });
                    }
                    if (st.stageType === 'assemble') {
                        const mode = st.sourceMode || (st.sliceImageId ? 'slice' : 'pieces');
                        if (mode === 'slice' && !st.sliceImageId) warnings.push({ severity: 'warning', message: `${where} (assemble) has no image to cut up — it shows a tap-to-continue placeholder.`, location: loc });
                        if (mode === 'pieces' && !(st.pieces?.length)) warnings.push({ severity: 'warning', message: `${where} (assemble) has no pieces — it shows a tap-to-continue placeholder.`, location: loc });
                    }
                    if (st.stageType === 'paint' && !(st.regions?.length)) {
                        warnings.push({ severity: 'warning', message: `${where} (painting) has no paintable areas — it shows a tap-to-continue placeholder.`, location: loc });
                    }
                    if (st.stageType === 'qte') {
                        if (!(st.prompts?.length)) {
                            warnings.push({ severity: 'warning', message: `${where} (quick taps) has no prompts — it shows a tap-to-continue placeholder.`, location: loc });
                        } else if ((st.prompts || []).some((p: any) => p.kind === 'key')) {
                            warnings.push({ severity: 'warning', message: `${where} (quick taps) uses keyboard prompts — players on phones/tablets can't press keys. Prefer tap targets for mobile builds.`, location: loc });
                        }
                    }
                });
                // Reacting character must reference a real character.
                if (g.character?.characterId && !project.characters[g.character.characterId]) {
                    warnings.push({ severity: 'warning', message: `Mini game "${g.name}" reacting character references a character that doesn't exist — it won't appear.`, location: loc });
                }
                // Score export variables must exist.
                if (g.score) {
                    (['hitsVariableId', 'missesVariableId', 'accuracyVariableId'] as const).forEach(k => {
                        const vid = (g.score as any)[k];
                        if (vid && !project.variables[vid]) warnings.push({ severity: 'warning', message: `Mini game "${g.name}" score exports to a variable that doesn't exist (${k}).`, location: loc });
                    });
                }
                // Palette→UI mappings must point at slots that actually exist in some stage.
                if (g.paletteToUi?.length) {
                    const slots = new Set<string>();
                    g.stages.forEach((s2: any) => {
                        (s2.regions || []).forEach((r: any) => r.colorSlot && slots.add(r.colorSlot));
                        (s2.pieces || []).forEach((pc: any) => pc.colorSlot && slots.add(pc.colorSlot));
                    });
                    g.paletteToUi.forEach((m: any) => {
                        if (m.slot && !slots.has(m.slot)) {
                            warnings.push({ severity: 'warning', message: `Mini game "${g.name}" maps color slot "${m.slot}" to the UI, but no paint area / piece has that slot name.`, location: loc });
                        }
                    });
                }
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
