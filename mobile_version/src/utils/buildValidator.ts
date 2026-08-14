import { VNProject } from '../types/project';
import { CommandType, VNCommand } from '../features/scene/types';
import { VNID } from '../types';
import { collectTranslatableText } from '../features/localization/walkTranslatable';
import { hashSource } from '../features/localization/store';

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

    // Validate Music Gallery
    if (project.musicGallery) {
        const songs = Object.values(project.musicGallery.entries || {});
        for (const song of songs) {
            const s = song as any;
            if (!s.audioId) {
                warnings.push({
                    severity: 'warning',
                    message: `Music Gallery song "${s.name || s.id}" has no music file chosen.`,
                    location: 'Music Gallery'
                });
            } else if (!project.audio?.[s.audioId]) {
                errors.push({
                    severity: 'error',
                    message: `Music Gallery song "${s.name || s.id}" references a missing audio file (ID: ${s.audioId}).`,
                    location: 'Music Gallery'
                });
            }
            if (s.artworkAssetId && !project.images?.[s.artworkAssetId] && !project.backgrounds?.[s.artworkAssetId]) {
                warnings.push({
                    severity: 'warning',
                    message: `Music Gallery song "${s.name || s.id}" references a missing cover picture (ID: ${s.artworkAssetId}).`,
                    location: 'Music Gallery'
                });
            }
            if (s.unlockable && s.unlockVariableId && !project.variables[s.unlockVariableId]) {
                errors.push({
                    severity: 'error',
                    message: `Music Gallery song "${s.name || s.id}" references a missing unlock variable (ID: ${s.unlockVariableId}).`,
                    location: 'Music Gallery'
                });
            }
        }
        const defArt = project.musicGallery.defaultArtworkAssetId;
        if (defArt && !project.images?.[defArt] && !project.backgrounds?.[defArt]) {
            warnings.push({
                severity: 'warning',
                message: 'Music Gallery default cover picture references a missing image asset.',
                location: 'Music Gallery'
            });
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

    validateLanguages(project, warnings);

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * What's worth saying about a game that ships in more than one language.
 *
 * All WARNINGS, never errors — shipping a partly-translated game is a legitimate choice (early
 * access, a language a fan is still working on), and the untranslated lines fall back to the
 * original rather than breaking. The author needs to know, not to be stopped.
 *
 * The wording matters here: this is the last thing between an author and a public release, so each
 * message says what the player will actually experience, not what a field is set to.
 */
function validateLanguages(project: VNProject, warnings: ValidationIssue[]): void {
    const localization: any = (project as any).localization;
    if (!localization?.languages?.length) return;

    const enabled = localization.languages.filter((l: any) => l?.enabled);
    if (!enabled.length) return;

    const sites = collectTranslatableText(project);
    const total = sites.length;
    if (!total) return;

    for (const language of enabled) {
        let translated = 0, needsReview = 0, stale = 0;
        for (const site of sites) {
            const entry = localization.strings?.[site.key]?.[language.code];
            if (!entry?.text) continue;
            translated++;
            if (entry.needsReview) needsReview++;
            if (entry.sourceHash && entry.sourceHash !== hashSource(site.value)) stale++;
        }

        const name = `${language.name || language.code} (${language.code})`;
        const percent = Math.round((translated / total) * 100);

        if (translated === 0) {
            warnings.push({
                severity: 'warning',
                message: `${name} is offered to players but nothing has been translated into it yet — they'd see the whole game in the original language.`,
                location: 'Languages',
            });
            continue;
        }

        if (translated < total) {
            warnings.push({
                severity: 'warning',
                message: `${name} is ${percent}% translated. The remaining ${total - translated} lines will appear in the original language.`,
                location: 'Languages',
            });
        }

        if (needsReview > 0) {
            warnings.push({
                severity: 'warning',
                message: `${name} has ${needsReview} machine-translated ${needsReview === 1 ? 'line' : 'lines'} nobody has checked yet. Machine translation is a starting point — it's worth reading before players do.`,
                location: 'Languages',
            });
        }

        if (stale > 0) {
            warnings.push({
                severity: 'warning',
                message: `${name} has ${stale} ${stale === 1 ? 'translation' : 'translations'} made from wording you've since changed, so ${stale === 1 ? 'it no longer matches' : 'they no longer match'} the original.`,
                location: 'Languages',
            });
        }
    }

    if (enabled.length && !(project as any).ui?.languageScreenId) {
        warnings.push({
            severity: 'warning',
            message: `This game has other languages but no language screen, so players have no way to switch. Add one under Settings → Screens, or a button with the "Set Language" action.`,
            location: 'Languages',
        });
    }
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

    // A condition comparing against another variable must point at one that still exists —
    // a dangling reference silently falls back to the typed value at runtime, so say so here.
    for (const c of (Array.isArray((cmd as any).conditions) ? (cmd as any).conditions : [])) {
        if (c?.compareVariableId && !project.variables[c.compareVariableId]) {
            warnings.push({
                severity: 'warning',
                message: `A condition compares against a missing variable (ID: ${c.compareVariableId}).`,
                location: loc
            });
        }
    }

    // "Play backwards" only works on files the engine can afford to decode (≤ ~4 MB of audio).
    // Oversized files silently play FORWARD at runtime — warn at build time instead.
    if (cmd.type === CommandType.PlaySoundEffect) {
        const c = cmd as any;
        const asset: any = c.audioId ? project.audio[c.audioId] : null;
        const reverse = c.audioAdjust?.reverse ?? asset?.audioAdjust?.reverse;
        if (reverse && typeof asset?.audioUrl === 'string' && asset.audioUrl.startsWith('data:')) {
            const approxBytes = Math.floor((asset.audioUrl.length - (asset.audioUrl.indexOf(',') + 1)) * 3 / 4);
            if (approxBytes > 4 * 1024 * 1024) {
                warnings.push({
                    severity: 'warning',
                    message: `"${asset.name}" is set to play backwards but is larger than 4 MB — it will play forward instead. Tip: open it in Assets and use "Save a reversed copy" — the baked copy plays backwards everywhere, at any size.`,
                    location: loc
                });
            }
        }
        // On DESKTOP only WAV files can reverse (compressed decode crashes Electron's renderer,
        // so the engine refuses it and plays forward). Web games reverse mp3/ogg fine.
        if (reverse && typeof asset?.audioUrl === 'string') {
            const url = asset.audioUrl;
            const looksWav = url.startsWith('data:audio/wav') || url.startsWith('data:audio/x-wav') || /\.wav($|[?#])/i.test(url);
            if (!looksWav) {
                warnings.push({
                    severity: 'warning',
                    message: `"${asset.name}" is set to play backwards, but on desktop only WAV files can reverse — it will play forward there. Convert it to a WAV, or use "Save a reversed copy" in Assets — the baked copy plays backwards everywhere, even as music.`,
                    location: loc
                });
            }
        }
    }

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
            // From-a-variable / calculation value sources: every referenced variable must exist
            // and be a number (the math is number-only).
            const sv = cmd as any;
            const checkMathRef = (id: unknown, what: string) => {
                if (typeof id !== 'string' || !id) {
                    warnings.push({ severity: 'warning', message: `Set Variable ${what} has no variable picked.`, location: loc });
                    return;
                }
                const v = project.variables[id];
                if (!v) {
                    warnings.push({ severity: 'warning', message: `Set Variable ${what} references a missing variable (ID: ${id}).`, location: loc });
                } else if (v.type !== 'number') {
                    warnings.push({ severity: 'warning', message: `Set Variable ${what} uses "${v.name}" in math, but it isn't a number.`, location: loc });
                }
            };
            if (sv.valueSource === 'variable') checkMathRef(sv.valueVariableId, 'value');
            if (sv.valueSource === 'calc' && sv.calc) {
                if (sv.calc.first?.source === 'variable') checkMathRef(sv.calc.first.variableId, 'calculation start');
                for (const step of (sv.calc.steps ?? [])) {
                    if (step?.source === 'variable') checkMathRef(step.variableId, 'calculation step');
                    if (step?.op === 'divide' && step?.source === 'number' && (step?.value ?? 0) === 0) {
                        warnings.push({ severity: 'warning', message: `Set Variable calculation divides by zero — that step will be skipped.`, location: loc });
                    }
                }
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
