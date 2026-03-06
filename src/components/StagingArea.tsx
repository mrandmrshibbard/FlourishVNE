import React, { useState, useCallback, useEffect } from 'react';
import { VNID, VNPosition, VNTransition, VNPositionPreset } from '../types';
import type { VNScreenOverlayEffect } from '../types';
import { VNProject } from '../types/project';
import {
    CommandType, ShowCharacterCommand, DialogueCommand, FlashScreenCommand, ChoiceOption,
    ChoiceCommand, SetBackgroundCommand, ShowTextCommand, ShowImageCommand, VNScene, ShowButtonCommand,
    PlayMovieCommand, VNCommand
} from '../features/scene/types';
import { useProject } from '../contexts/ProjectContext';
// FIX: VNCondition is not exported from scene/types, but from shared types.
import { VNCondition } from '../types/shared';
import { VNFontSettings } from '../features/ui/types';
import { VNCharacterLayer } from '../features/character/types';
import { EyeIcon, EyeSlashIcon, FilmIcon, VariablesIcon } from './icons';
import Panel from './ui/Panel';
import { fontSettingsToStyle, extractTextGradientStyle } from '../utils/styleUtils';

/** Convert hex color + opacity (0-100) to rgba string */
function hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

/** Build CSS background style based on size mode */
function buildImageBackgroundStyle(url: string, sizeMode: string, slicePx?: number): React.CSSProperties {
    switch (sizeMode) {
        case 'nine-slice': {
            const s = slicePx ?? 30;
            return {
                borderImageSource: `url(${url})`,
                borderImageSlice: `${s} fill`,
                borderImageWidth: `calc(var(--font-scale,1) * ${s}px)`,
                borderImageRepeat: 'stretch',
                borderStyle: 'solid',
                borderColor: 'transparent',
                borderWidth: `calc(var(--font-scale,1) * ${s}px)`,
            };
        }
        case 'contain':
            return { backgroundImage: `url(${url})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
        case 'cover':
            return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
        case 'tile':
            return { backgroundImage: `url(${url})`, backgroundSize: 'auto', backgroundRepeat: 'repeat' };
        case 'stretch':
        default:
            return { backgroundImage: `url(${url})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    }
}
import { interpolateVariables } from '../utils/variableInterpolation';

interface TextOverlay {
    id: VNID;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    width?: number;
    height?: number;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    letterSpacing?: number;
    textShadow?: { enabled: boolean; offsetX: number; offsetY: number; blur: number; color: string };
    textGradient?: { enabled: boolean; type: 'linear' | 'radial'; angle: number; colors: string[] };
    textBorder?: { enabled: boolean; width: number; color: string };
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
}

interface ImageOverlay {
    id: VNID;
    imageUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    scaleX: number;
    scaleY: number;
}

interface ButtonOverlay {
    id: VNID;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontWeight: string;
    borderRadius: number;
    imageUrl?: string;
    hoverImageUrl?: string;
}

interface StageCharacterState {
    charId: VNID;
    position: VNPosition;
    imageUrls: string[];
    transition?: VNTransition;
    sourceCommandId?: string;
}

interface StageState {
    backgroundUrl: string | null;
    characters: Record<VNID, StageCharacterState>;
    textOverlays: TextOverlay[];
    imageOverlays: ImageOverlay[];
    buttonOverlays: ButtonOverlay[];
    screen: {
        shake: { active: boolean; intensity: number };
        tint: string;
        zoom: number;
        panX: number;
        panY: number;
        overlayEffects: VNScreenOverlayEffect[];
    };
    dialogue: {
        characterName: string;
        characterColor: string;
        characterId: string | null;
        text: string;
    } | null;
    movie: {
        videoUrl: string;
        videoName: string;
        displayMode: 'fullscreen' | 'overlay';
        x: number;
        y: number;
        width: number;
        height: number;
        opacity: number;
        objectFit: string;
    } | null;
    flash: { color: string } | null;
    choices: ChoiceOption[] | null;
    commandIndicator: { type: string; details: string } | null;
    variables: Record<string, string | number | boolean>;
}

const StagingArea: React.FC<{
    project: VNProject;
    activeSceneId: VNID;
    selectedCommandIndex: number | null;
    className?: string;
    style?: React.CSSProperties;
}> = ({ project, activeSceneId, selectedCommandIndex, className, style }) => {
    const { dispatch } = useProject();
    const [showCommandIndicators, setShowCommandIndicators] = React.useState(true);
    const [showVariableState, setShowVariableState] = React.useState(false);
    const stageRef = React.useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = React.useState({ width: 1280, height: 720 }); // Default 16:9 at 720p
    const [stageState, setStageState] = React.useState<StageState>({
        backgroundUrl: null,
        characters: {},
        textOverlays: [],
        imageOverlays: [],
        buttonOverlays: [],
        screen: {
            shake: { active: false, intensity: 0 },
            tint: 'transparent',
            zoom: 1,
            panX: 0,
            panY: 0,
            overlayEffects: [],
        },
        dialogue: null,
        movie: null,
        flash: null,
        choices: null,
        commandIndicator: null,
        variables: {},
    });

    // Track stage size for proper scaling
    React.useEffect(() => {
        if (!stageRef.current) return;
        
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setStageSize({ width, height });
            }
        });
        
        observer.observe(stageRef.current);
        return () => observer.disconnect();
    }, []);

    React.useEffect(() => {
        const scene = project.scenes[activeSceneId];
        if (!scene) {
            setStageState({
                backgroundUrl: null, characters: {}, textOverlays: [], imageOverlays: [], buttonOverlays: [],
                screen: { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0, overlayEffects: [] },
                dialogue: null, movie: null, flash: null, choices: null, commandIndicator: null, variables: {},
            });
            return;
        }

        const evaluateConditions = (conditions: VNCondition[] | undefined, currentVariables: StageState['variables']): boolean => {
            if (!conditions || conditions.length === 0) return true;
            return conditions.every(condition => {
                const varValue = currentVariables[condition.variableId];
                const projectVar = project.variables[condition.variableId];
                const effectiveVarValue = varValue !== undefined ? varValue : (projectVar ? projectVar.defaultValue : undefined);
                if (effectiveVarValue === undefined) return false;
                switch (condition.operator) {
                    case 'is true': return !!effectiveVarValue;
                    case 'is false': return !effectiveVarValue;
                    case '==': return String(effectiveVarValue).toLowerCase() == String(condition.value).toLowerCase();
                    case '!=': return String(effectiveVarValue).toLowerCase() != String(condition.value).toLowerCase();
                    case '>': return Number(effectiveVarValue) > Number(condition.value);
                    case '<': return Number(effectiveVarValue) < Number(condition.value);
                    case '>=': return Number(effectiveVarValue) >= Number(condition.value);
                    case '<=': return Number(effectiveVarValue) <= Number(condition.value);
                    case 'contains': return String(effectiveVarValue).toLowerCase().includes(String(condition.value).toLowerCase());
                    case 'startsWith': return String(effectiveVarValue).toLowerCase().startsWith(String(condition.value).toLowerCase());
                    default: return false;
                }
            });
        };

        // Initialize states
        let backgroundUrl: string | null = null;
        let characters: Record<VNID, StageCharacterState> = {};
        let textOverlays: TextOverlay[] = [];
        let imageOverlays: ImageOverlay[] = [];
        let buttonOverlays: ButtonOverlay[] = [];
        let screen = { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0, overlayEffects: [] as VNScreenOverlayEffect[] };
        let dialogue: StageState['dialogue'] = null;
        let movie: StageState['movie'] = null;
        let flash: StageState['flash'] = null;
        let choices: StageState['choices'] = null;
        let commandIndicator: StageState['commandIndicator'] = null;
        let currentVariables: StageState['variables'] = {};

        // Initialize variables with project defaults
        (Object.values(project.variables) as import('../features/variables/types').VNVariable[]).forEach(v => {
            currentVariables[v.id] = v.defaultValue;
        });

        const endIndex = selectedCommandIndex === null ? scene.commands.length : selectedCommandIndex + 1;
        const activeCommands = scene.commands.slice(0, endIndex);

        // Process commands up to the selected one to build the stage's state
        activeCommands.forEach((command) => {
            if (!command || !evaluateConditions(command.conditions, currentVariables)) {
                return; // Skip this command if conditions are not met
            }

            switch (command.type) {
                case CommandType.SetBackground:
                    backgroundUrl = project.backgrounds[command.backgroundId]?.imageUrl || 
                                   project.backgrounds[command.backgroundId]?.videoUrl ||
                                   project.images?.[command.backgroundId]?.imageUrl || 
                                   project.images?.[command.backgroundId]?.videoUrl ||
                                   null;
                    break;
                case CommandType.ShowCharacter:
                    const charData = project.characters[command.characterId];
                    const exprData = charData?.expressions[command.expressionId];
                    if (charData && exprData) {
                        const imageUrls: string[] = [];
                        if (charData.baseImageUrl) imageUrls.push(charData.baseImageUrl);
                        Object.values(charData.layers).forEach((layer: VNCharacterLayer) => {
                            const assetId = exprData.layerConfiguration[layer.id];
                            if (assetId) {
                                const asset = layer.assets[assetId];
                                if (asset?.imageUrl) imageUrls.push(asset.imageUrl);
                            }
                        });
                        characters[command.characterId] = { charId: command.characterId, position: command.position, imageUrls, transition: command.transition, sourceCommandId: command.id };
                    }
                    break;
                case CommandType.HideCharacter:
                    delete characters[command.characterId];
                    break;
                case CommandType.SetVariable:
                    const variable = project.variables[command.variableId];
                    if (variable) {
                        const currentVal = currentVariables[command.variableId];
                        let newVal: string | number | boolean = command.value;
                        if (command.operator === 'add') {
                            newVal = (Number(currentVal) || 0) + (Number(command.value) || 0);
                        } else if (command.operator === 'subtract') {
                            newVal = (Number(currentVal) || 0) - (Number(command.value) || 0);
                        } else {
                            switch (variable.type) {
                                case 'number': newVal = Number(command.value) || 0; break;
                                case 'boolean': newVal = String(command.value).toLowerCase() === 'true'; break;
                                default: newVal = String(command.value);
                            }
                        }
                        currentVariables[command.variableId] = newVal;
                    }
                    break;
                case CommandType.TintScreen: screen.tint = command.color; break;
                case CommandType.PanZoomScreen: screen.zoom = command.zoom; screen.panX = command.panX; screen.panY = command.panY; break;
                case CommandType.ResetScreenEffects: screen = { ...screen, tint: 'transparent', zoom: 1, panX: 0, panY: 0 }; break;
                case CommandType.ShowText:
                    textOverlays.push({
                        id: command.id, text: command.text, x: command.x, y: command.y,
                        fontSize: command.fontSize, fontFamily: command.fontFamily, color: command.color,
                        width: command.width, height: command.height, textAlign: command.textAlign, verticalAlign: command.verticalAlign,
                        fontWeight: command.fontWeight, fontStyle: command.fontStyle, letterSpacing: command.letterSpacing,
                        textShadow: command.textShadow, textGradient: command.textGradient, textBorder: command.textBorder,
                    });
                    break;
                case CommandType.HideText:
                    textOverlays = textOverlays.filter(o => o.id !== command.targetCommandId);
                    break;
                case CommandType.ShowImage:
                    const imageUrl = project.images[command.imageId]?.imageUrl || project.backgrounds[command.imageId]?.imageUrl;
                    if (imageUrl) {
                        imageOverlays.push({
                            id: command.id, imageUrl, x: command.x, y: command.y,
                            width: command.width, height: command.height, rotation: command.rotation, opacity: command.opacity,
                            scaleX: command.scaleX ?? 1, scaleY: command.scaleY ?? 1,
                        });
                    }
                    break;
                case CommandType.HideImage:
                    imageOverlays = imageOverlays.filter(o => o.id !== command.targetCommandId);
                    break;
                case CommandType.ShowButton:
                    if (evaluateConditions(command.showConditions, currentVariables)) {
                        const buttonCmd = command as ShowButtonCommand;
                        const imageUrl = buttonCmd.image?.type === 'image' ? project.images[buttonCmd.image.id]?.imageUrl :
                                       buttonCmd.image?.type === 'video' ? project.videos[buttonCmd.image.id]?.videoUrl : undefined;
                        const hoverImageUrl = buttonCmd.hoverImage?.type === 'image' ? project.images[buttonCmd.hoverImage.id]?.imageUrl :
                                            buttonCmd.hoverImage?.type === 'video' ? project.videos[buttonCmd.hoverImage.id]?.videoUrl : undefined;
                        buttonOverlays.push({
                            id: buttonCmd.id,
                            text: buttonCmd.text,
                            x: buttonCmd.x,
                            y: buttonCmd.y,
                            width: buttonCmd.width,
                            height: buttonCmd.height,
                            backgroundColor: buttonCmd.backgroundColor,
                            textColor: buttonCmd.textColor,
                            fontSize: buttonCmd.fontSize,
                            fontWeight: buttonCmd.fontWeight,
                            borderRadius: buttonCmd.borderRadius,
                            imageUrl,
                            hoverImageUrl,
                        });
                    }
                    break;
                case CommandType.HideButton:
                    buttonOverlays = buttonOverlays.filter(o => o.id !== command.buttonId);
                    break;
            }
        });

        const currentCommand = selectedCommandIndex !== null ? scene.commands[selectedCommandIndex] : null;

        if (currentCommand && evaluateConditions(currentCommand.conditions, currentVariables)) {
            switch (currentCommand.type) {
                case CommandType.Dialogue:
                    const char = currentCommand.characterId ? project.characters[currentCommand.characterId] : null;
                    dialogue = { characterName: char?.name || 'Narrator', characterColor: char?.color || '#FFFFFF', characterId: currentCommand.characterId || null, text: currentCommand.text };
                    break;
                case CommandType.Choice:
                    choices = currentCommand.options.filter(opt => evaluateConditions(opt.conditions, currentVariables));
                    break;
                case CommandType.PlayMovie: {
                    const movieCmd = currentCommand as PlayMovieCommand;
                    const videoAsset = project.videos[movieCmd.videoId];
                    const videoUrl = videoAsset?.videoUrl || null;
                    movie = {
                        videoUrl: videoUrl || '',
                        videoName: videoAsset?.name || 'N/A',
                        displayMode: movieCmd.displayMode || 'fullscreen',
                        x: movieCmd.x ?? 0,
                        y: movieCmd.y ?? 0,
                        width: movieCmd.width ?? 100,
                        height: movieCmd.height ?? 100,
                        opacity: movieCmd.opacity ?? 1,
                        objectFit: movieCmd.objectFit || 'cover',
                    };
                    break;
                }
                case CommandType.FlashScreen:
                    flash = { color: currentCommand.color };
                    break;
                case CommandType.SetVariable:
                case CommandType.PlayMusic:
                case CommandType.PlaySoundEffect:
                case CommandType.StopMusic:
                case CommandType.StopMovie:
                case CommandType.Jump:
                case CommandType.Wait:
                case CommandType.TextInput:
                    commandIndicator = { type: currentCommand.type, details: '' };
                    break;
            }
        }

        setStageState({ backgroundUrl, characters, textOverlays, imageOverlays, buttonOverlays, screen, dialogue, movie, flash, choices, commandIndicator, variables: currentVariables });

    }, [activeSceneId, selectedCommandIndex, project]);

    // --- Drag-to-Position State ---
    type DragKind = 'character' | 'text' | 'image' | 'button';
    const [overlayDrag, setOverlayDrag] = useState<{
        kind: DragKind;
        overlayId: string;
        sourceCommandId: string;
        startMouseX: number;
        startMouseY: number;
        startPosX: number;
        startPosY: number;
    } | null>(null);
    const [overlayDragOffset, setOverlayDragOffset] = useState<{ x: number; y: number } | null>(null);

    const handleCharMouseDown = useCallback((e: React.MouseEvent, char: StageCharacterState) => {
        if (!char.sourceCommandId) return;
        e.preventDefault();
        e.stopPropagation();
        const isCustom = typeof char.position === 'object';
        const presetToCoords: Record<string, { x: number; y: number }> = {
            'left': { x: 25, y: 10 }, 'center': { x: 50, y: 10 }, 'right': { x: 75, y: 10 },
            'off-left': { x: -25, y: 10 }, 'off-right': { x: 125, y: 10 },
        };
        const startPos = isCustom
            ? (char.position as { x: number; y: number })
            : (presetToCoords[char.position as string] || { x: 50, y: 10 });
        setOverlayDrag({
            kind: 'character',
            overlayId: char.charId,
            sourceCommandId: char.sourceCommandId,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startPosX: startPos.x,
            startPosY: startPos.y,
        });
        setOverlayDragOffset(null);
    }, []);

    const handleOverlayMouseDown = useCallback((e: React.MouseEvent, kind: DragKind, id: string, x: number, y: number) => {
        e.preventDefault();
        e.stopPropagation();
        setOverlayDrag({
            kind,
            overlayId: id,
            sourceCommandId: id,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startPosX: x,
            startPosY: y,
        });
        setOverlayDragOffset(null);
    }, []);

    useEffect(() => {
        if (!overlayDrag) return;
        const sw = stageSize.width || 1;
        const sh = stageSize.height || 1;
        const SNAP = 5;
        const onMove = (e: MouseEvent) => {
            const dx = ((e.clientX - overlayDrag.startMouseX) / sw) * 100;
            const dy = ((e.clientY - overlayDrag.startMouseY) / sh) * 100;
            let nx = overlayDrag.startPosX + dx;
            let ny = overlayDrag.startPosY + dy;
            if (e.shiftKey) {
                nx = Math.round(nx / SNAP) * SNAP;
                ny = Math.round(ny / SNAP) * SNAP;
            }
            nx = Math.round(nx * 10) / 10;
            ny = Math.round(ny * 10) / 10;
            setOverlayDragOffset({ x: nx, y: ny });
        };
        const onUp = () => {
            const drag = overlayDrag;
            const offset = overlayDragOffset;
            setOverlayDrag(null);
            setOverlayDragOffset(null);
            if (!offset) return;
            const newX = offset.x;
            const newY = offset.y;
            for (const scene of Object.values(project.scenes)) {
                const idx = scene.commands.findIndex((c: VNCommand) => c.id === drag.sourceCommandId);
                if (idx < 0) continue;
                const cmd = scene.commands[idx];
                if (drag.kind === 'character') {
                    dispatch({
                        type: 'UPDATE_COMMAND',
                        payload: { sceneId: scene.id, commandIndex: idx, command: { ...cmd, position: { x: newX, y: newY } } },
                    });
                } else {
                    dispatch({
                        type: 'UPDATE_COMMAND',
                        payload: { sceneId: scene.id, commandIndex: idx, command: { ...cmd, x: newX, y: newY } },
                    });
                }
                break;
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [overlayDrag, overlayDragOffset, project.scenes, dispatch, stageSize]);

    const getPositionStyle = (position: VNPosition): React.CSSProperties => {
        if (typeof position === 'object') {
            // Custom coordinates - use exact position without centering transform
            return { left: `${position.x}%`, top: `${position.y}%` };
        }
        // Preset positions - apply horizontal centering
        const presetStyles: Record<VNPositionPreset, React.CSSProperties> = {
            'left': { top: '10%', left: '25%', transform: 'translate(-50%, 0)' },
            'center': { top: '10%', left: '50%', transform: 'translate(-50%, 0)' },
            'right': { top: '10%', left: '75%', transform: 'translate(-50%, 0)' },
            'off-left': { top: '10%', left: '-25%', transform: 'translate(-50%, 0)' },
            'off-right': { top: '10%', left: '125%', transform: 'translate(-50%, 0)' },
        };
        return presetStyles[position];
    };
    
    const { dialogue: currentDialogue, choices: currentChoices, variables: currentVariables } = stageState;

    // Resolve dialogue box image URL
    const dialogueBoxImageUrl = project.ui.dialogueBoxImage 
        ? (project.images[project.ui.dialogueBoxImage.id]?.imageUrl || project.backgrounds[project.ui.dialogueBoxImage.id]?.imageUrl)
        : null;

    // Resolve dialogue box border image URL
    const dialogueBorderImageUrl = project.ui.dialogueBoxBorderImage
        ? (project.images[project.ui.dialogueBoxBorderImage.id]?.imageUrl || project.backgrounds[project.ui.dialogueBoxBorderImage.id]?.imageUrl)
        : null;
    const dialogueBorderPadding = project.ui.dialogueBorderPadding ?? 12;

    // Dialogue box layout settings
    const dialogueBoxWidth = project.ui.dialogueBoxWidth ?? 100;
    const dialogueBoxHeight = project.ui.dialogueBoxHeight || 0;
    const dialogueBoxBottomMargin = project.ui.dialogueBoxBottomMargin ?? 20;
    const dialogueBoxPadding = project.ui.dialogueBoxPadding ?? 20;

    // New appearance settings
    const dialogueSizeMode = project.ui.dialogueBoxSizeMode ?? 'stretch';
    const dialogueSlice = project.ui.dialogueBoxSlice ?? 30;
    const dialogueColor = project.ui.dialogueBoxColor ?? '#0f172a';
    const dialogueOpacity = project.ui.dialogueBoxOpacity ?? 90;
    const dialogueBorderRadius = project.ui.dialogueBoxBorderRadius ?? 8;

    // Namebox settings
    const nameboxImageUrl = project.ui.nameboxImage
        ? (project.images[project.ui.nameboxImage.id]?.imageUrl || project.backgrounds[project.ui.nameboxImage.id]?.imageUrl)
        : null;
    const nameboxColor = project.ui.nameboxColor ?? '#0f172a';
    const nameboxOpacity = project.ui.nameboxOpacity ?? 92;
    const nameboxPadding = project.ui.nameboxPadding ?? 8;
    const nameboxHPadding = project.ui.nameboxHorizontalPadding ?? 14;
    const nameboxBorderRadius = project.ui.nameboxBorderRadius ?? 6;
    const nameboxOffsetX = project.ui.nameboxOffsetX ?? 20;
    const nameboxOffsetY = project.ui.nameboxOffsetY ?? 0;
    const nameboxSizeMode = project.ui.nameboxSizeMode ?? 'stretch';

    // Resolve choice button image URL
    const choiceButtonImageUrl = project.ui.choiceButtonImage 
        ? (project.images[project.ui.choiceButtonImage.id]?.imageUrl || project.backgrounds[project.ui.choiceButtonImage.id]?.imageUrl)
        : null;

    // Resolve choice button border image URL
    const choiceBorderImageUrl = project.ui.choiceButtonBorderImage
        ? (project.images[project.ui.choiceButtonBorderImage.id]?.imageUrl || project.backgrounds[project.ui.choiceButtonBorderImage.id]?.imageUrl)
        : null;
    const choiceBorderPadding = project.ui.choiceBorderPadding ?? 8;

    // Choice button layout settings
    const choiceWidth = project.ui.choiceButtonWidth || 0;
    const choiceHeight = project.ui.choiceButtonHeight || 0;
    const choicePadding = project.ui.choiceButtonPadding ?? 16;

    // New choice appearance settings
    const choiceSizeMode = project.ui.choiceButtonSizeMode ?? 'stretch';
    const choiceSlice = project.ui.choiceButtonSlice ?? 15;
    const choiceColor = project.ui.choiceButtonColor ?? '#1e293b';
    const choiceOpacity = project.ui.choiceButtonOpacity ?? 90;
    const choiceBorderRadius = project.ui.choiceButtonBorderRadius ?? 8;

    const hasCustomDialogueImage = dialogueBoxImageUrl || dialogueBorderImageUrl;
    const hasCustomChoiceImage = choiceButtonImageUrl || choiceBorderImageUrl;

    // Build background styles
    const dialogueBgColor = hexToRgba(dialogueColor, dialogueOpacity);
    const dialogueImageStyle: React.CSSProperties = dialogueBoxImageUrl
        ? buildImageBackgroundStyle(dialogueBoxImageUrl, dialogueSizeMode, dialogueSlice)
        : {};
    /** Scale a pixel value by the --font-scale CSS variable so layout proportions
     *  remain consistent regardless of actual container size. */
    const s = (px: number) => `calc(var(--font-scale,1) * ${px}px)`;

    const nameboxBgStyle: React.CSSProperties = nameboxImageUrl
        ? { ...buildImageBackgroundStyle(nameboxImageUrl, nameboxSizeMode), borderRadius: s(nameboxBorderRadius) }
        : { backgroundColor: hexToRgba(nameboxColor, nameboxOpacity), borderRadius: s(nameboxBorderRadius) };
    const choiceBgColor = hexToRgba(choiceColor, choiceOpacity);

    /* ── Percentage-based layout rects (matching InGameUIEditor) ── */
    const gameW = project.gameResolution?.width || 1920;
    const gameH = project.gameResolution?.height || 1080;

    const dialogueHPct = dialogueBoxHeight ? (dialogueBoxHeight * 100 / gameH) : 20;
    const dialogueXPct = project.ui.dialogueBoxX ?? ((100 - dialogueBoxWidth) / 2);
    const bmPct = dialogueBoxBottomMargin * 100 / gameH;
    const dialogueYPct = project.ui.dialogueBoxY ?? (100 - dialogueHPct - bmPct);

    const nameWPct = project.ui.nameboxWidth ?? 15;
    const nameHPct = project.ui.nameboxHeight ?? 5;
    const nameXPct = project.ui.nameboxX ?? (dialogueXPct + nameboxOffsetX * 100 / gameW);
    const nameYPct = project.ui.nameboxY ?? (dialogueYPct - nameHPct - nameboxOffsetY * 100 / gameH);

    const choiceWPct = choiceWidth ? (choiceWidth * 100 / gameW) : 30;
    const choiceHPct = choiceHeight ? (choiceHeight * 100 / gameH) : 25;
    const choiceXPct = project.ui.choiceButtonX ?? (50 - choiceWPct / 2);
    const choiceYPct = project.ui.choiceButtonY ?? 35;

    const textPadTop = project.ui.dialogueTextPaddingTop ?? 0;
    const textPadBot = project.ui.dialogueTextPaddingBottom ?? 0;
    const textPadLeft = project.ui.dialogueTextPaddingLeft ?? 0;
    const textPadRight = project.ui.dialogueTextPaddingRight ?? 0;

    const renderDialogueBox = (dialogue: NonNullable<StageState['dialogue']>) => {
        const interpolatedText = interpolateVariables(dialogue.text, currentVariables, project);
        const showNamebox = dialogue.characterName !== 'Narrator';
        const nameStyle: React.CSSProperties = {
            ...fontSettingsToStyle(project.ui.dialogueNameFont),
            ...(dialogue.characterColor && dialogue.characterColor !== '#FFFFFF' ? { color: dialogue.characterColor } : {})
        };

        // Character-specific font overrides (matching LivePreview)
        const character = dialogue.characterId ? project.characters[dialogue.characterId] : null;
        const dialogueTextStyle: React.CSSProperties = {
            ...fontSettingsToStyle(project.ui.dialogueTextFont),
            ...(character?.fontFamily ? { fontFamily: character.fontFamily } : {}),
            ...(character?.fontSize ? { fontSize: s(character.fontSize) } : {}),
            ...(character?.fontWeight ? { fontWeight: character.fontWeight } : {}),
            ...(character?.fontItalic ? { fontStyle: 'italic' } : {}),
        };
        return (
            <>
                {/* Namebox – positioned independently (matching InGameUIEditor) */}
                {showNamebox && (
                    <div className="absolute z-[21]"
                         style={{
                             left: `${nameXPct}%`,
                             top: `${nameYPct}%`,
                             width: `${nameWPct}%`,
                             height: `${nameHPct}%`,
                         }}>
                        <div style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            ...nameboxBgStyle,
                            padding: `${s(nameboxPadding)} ${s(nameboxHPadding)}`,
                            ...(hasCustomDialogueImage || nameboxImageUrl ? {} : {
                                border: '1px solid rgba(148,163,184,0.35)',
                            }),
                        }}>
                            <span style={{...nameStyle, lineHeight: 1.3}}>
                                <span style={extractTextGradientStyle(project.ui.dialogueNameFont) || undefined}>{dialogue.characterName}</span>
                            </span>
                        </div>
                    </div>
                )}
                {/* Dialogue box – percentage positioned (matching InGameUIEditor) */}
                <div className="absolute z-20"
                     style={{
                         left: `${dialogueXPct}%`,
                         top: `${dialogueYPct}%`,
                         width: `${dialogueBoxWidth}%`,
                         height: `${dialogueHPct}%`,
                         ...(dialogueBorderImageUrl 
                             ? { ...buildImageBackgroundStyle(dialogueBorderImageUrl, dialogueSizeMode, dialogueSlice), padding: s(dialogueBorderPadding), borderRadius: s(dialogueBorderRadius) }
                             : {})
                     }}>
                    <div className="relative"
                         style={{
                             borderRadius: s(dialogueBorderRadius),
                             overflow: 'hidden',
                             width: '100%',
                             height: '100%',
                             ...(hasCustomDialogueImage ? {} : {
                                 backgroundColor: dialogueBgColor,
                                 border: '1px solid rgba(148,163,184,0.25)',
                                 boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                             }),
                             ...(dialogueBoxImageUrl 
                                 ? { 
                                     ...dialogueImageStyle,
                                     backgroundColor: dialogueBgColor,
                                     ...(dialogueSizeMode !== 'nine-slice' ? { padding: s(dialogueBoxPadding) } : {})
                                   } 
                                 : { padding: s(dialogueBoxPadding) })
                         }}>
                        <div style={{
                            position: 'relative',
                            zIndex: 1,
                            padding: dialogueSizeMode === 'nine-slice' && dialogueBoxImageUrl ? s(dialogueBoxPadding) : undefined,
                            paddingTop: textPadTop ? s(textPadTop) : undefined,
                            paddingBottom: textPadBot ? s(textPadBot) : undefined,
                            paddingLeft: textPadLeft ? s(textPadLeft) : undefined,
                            paddingRight: textPadRight ? s(textPadRight) : undefined,
                        }}>
                            <p className="leading-relaxed" style={{...dialogueTextStyle, wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const}}>
                                <span style={extractTextGradientStyle(project.ui.dialogueTextFont) || undefined}>{interpolatedText}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </>
        );
    };

    const renderChoiceMenu = (choices: NonNullable<StageState['choices']>) => (
        <div className="absolute z-30 flex flex-col items-center justify-center"
             style={{
                 left: `${choiceXPct}%`,
                 top: `${choiceYPct}%`,
                 width: `${choiceWPct}%`,
                 height: `${choiceHPct}%`,
             }}>
            {choices.map((choice) => {
                 const interpolatedText = interpolateVariables(choice.text, currentVariables, project);
                return (
                    <div key={choice.id}
                         className="mb-3"
                         style={choiceBorderImageUrl 
                             ? { ...buildImageBackgroundStyle(choiceBorderImageUrl, choiceSizeMode, choiceSlice), padding: s(choiceBorderPadding), width: '100%', borderRadius: s(choiceBorderRadius) }
                             : { width: '100%' }}>
                        <button className="relative overflow-hidden w-full transition-all duration-200 hover:scale-[1.03]"
                                style={{
                                    borderRadius: s(choiceBorderRadius),
                                    ...(choiceButtonImageUrl 
                                        ? { ...buildImageBackgroundStyle(choiceButtonImageUrl, choiceSizeMode, choiceSlice), backgroundColor: choiceBgColor } 
                                        : !hasCustomChoiceImage 
                                            ? {
                                                backgroundColor: choiceBgColor,
                                                border: '1px solid rgba(148,163,184,0.3)',
                                                boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
                                              } 
                                            : {}),
                                    padding: `${s(choicePadding)} ${s(choicePadding * 2)}`,
                                    ...(choiceHeight ? { height: s(choiceHeight) } : {}),
                                    ...fontSettingsToStyle(project.ui.choiceTextFont),
                                    textAlign: 'center' as const,
                                    wordBreak: 'break-word' as const,
                                    overflowWrap: 'break-word' as const,
                                    cursor: 'pointer',
                                }}>
                            <span style={extractTextGradientStyle(project.ui.choiceTextFont) || undefined}>{interpolatedText}</span>
                        </button>
                    </div>
                )
            })}
        </div>
    );
    
    // Convert pixel values to percentages based on reference resolution (1280x720)
    const REFERENCE_WIDTH = 1280;
    const REFERENCE_HEIGHT = 720;
    
    const pxToPercentWidth = (px: number) => (px / REFERENCE_WIDTH) * 100;
    const pxToPercentHeight = (px: number) => (px / REFERENCE_HEIGHT) * 100;
    
    // Scale font size based on stage size
    const scaleFontSize = (fontSize: number) => {
        const scale = stageSize.width / REFERENCE_WIDTH;
        return fontSize * scale;
    };

    return (
        <Panel 
            title="Staging Area" 
            className={className} 
            style={{ 
                height: style?.height || 'var(--canvas-height)',
                ...style 
            }}
        >
            <div className="w-full h-full flex items-center justify-center p-2">
                <div 
                    ref={stageRef}
                    className="relative bg-[var(--bg-primary)]/50 rounded-md overflow-hidden" 
                    style={{ aspectRatio: `${project.gameResolution?.width || 16} / ${project.gameResolution?.height || 9}`, width: '100%', height: 'auto', maxHeight: '100%', maxWidth: '100%', '--font-scale': stageSize.width > 0 ? stageSize.width / (project.gameResolution?.width || 1920) : 1 } as React.CSSProperties}
                >
                    {stageState.backgroundUrl && <img src={stageState.backgroundUrl} alt="background" className="absolute inset-0 w-full h-full object-cover" />}

                {/* Movie/video - renders BEHIND characters (z-index 2) */}
                {stageState.movie && stageState.movie.videoUrl && (
                    stageState.movie.displayMode === 'fullscreen' ? (
                        <video
                            key={`stage-movie-${stageState.movie.videoUrl}`}
                            src={stageState.movie.videoUrl}
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="absolute pointer-events-none"
                            style={{
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: (stageState.movie.objectFit || 'cover') as React.CSSProperties['objectFit'],
                                opacity: stageState.movie.opacity,
                                zIndex: 2,
                            }}
                        />
                    ) : (
                        <video
                            key={`stage-movie-${stageState.movie.videoUrl}`}
                            src={stageState.movie.videoUrl}
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="absolute pointer-events-none"
                            style={{
                                left: `${stageState.movie.x}%`,
                                top: `${stageState.movie.y}%`,
                                width: `${stageState.movie.width}%`,
                                height: `${stageState.movie.height}%`,
                                objectFit: (stageState.movie.objectFit || 'cover') as React.CSSProperties['objectFit'],
                                opacity: stageState.movie.opacity,
                                zIndex: 2,
                            }}
                        />
                    )
                )}
                {/* Fallback: if video URL is missing, show an indicator */}
                {stageState.movie && !stageState.movie.videoUrl && (
                    <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center text-white bg-black/60">
                        <FilmIcon className="w-12 h-12 opacity-50" />
                        <p className="text-sm opacity-70 mt-2">Video: {stageState.movie.videoName}</p>
                    </div>
                )}

                {(Object.values(stageState.characters) as StageCharacterState[]).map((char) => {
                    let posStyle = getPositionStyle(char.position);
                    const isCustomPosition = typeof char.position === 'object';
                    const isDragging = overlayDrag?.kind === 'character' && overlayDrag.overlayId === char.charId;
                    if (isDragging && overlayDragOffset) {
                        posStyle = { left: `${overlayDragOffset.x}%`, top: `${overlayDragOffset.y}%` };
                    }
                    // For preset positions, anchor to bottom. For custom positions, respect the exact coordinates
                    const finalStyle = isCustomPosition || (isDragging && overlayDragOffset)
                        ? { ...posStyle, height: '90%' }
                        : { ...posStyle, height: '90%', bottom: '0', top: 'auto' };
                    return (
                        <div
                            key={char.charId}
                            className="absolute w-auto aspect-[3/4]"
                            style={{
                                ...finalStyle,
                                zIndex: isDragging ? 50 : undefined,
                                cursor: char.sourceCommandId ? (isDragging ? 'grabbing' : 'grab') : undefined,
                            }}
                            onMouseDown={char.sourceCommandId ? (e) => handleCharMouseDown(e, char) : undefined}
                        >
                            {char.imageUrls.map((url, index) => <img key={index} src={url} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ zIndex: index }} />)}
                            {isDragging && overlayDragOffset && (
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 text-sky-300 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none z-50">
                                    {overlayDragOffset.x}%, {overlayDragOffset.y}%
                                </div>
                            )}
                        </div>
                    );
                })}
                {stageState.textOverlays.map(o => {
                     const isDragging = overlayDrag?.kind === 'text' && overlayDrag.overlayId === o.id;
                     const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : o.x;
                     const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : o.y;
                     const textStyle: React.CSSProperties = {
                        position: 'absolute', 
                        left: `${displayX}%`, 
                        top: `${displayY}%`,
                        width: o.width ? `${pxToPercentWidth(o.width)}%` : 'auto', 
                        height: o.height ? `${pxToPercentHeight(o.height)}%` : 'auto',
                        transform: 'translate(-50%, -50%)', 
                        ...fontSettingsToStyle({ family: o.fontFamily, size: o.fontSize, color: o.color, weight: o.fontWeight || 'normal', italic: o.fontStyle === 'italic' }),
                        fontSize: `${scaleFontSize(o.fontSize)}px`,
                        textAlign: o.textAlign,
                        letterSpacing: o.letterSpacing ? `${o.letterSpacing}px` : undefined,
                        cursor: isDragging ? 'grabbing' : 'grab',
                        zIndex: isDragging ? 50 : undefined,
                     };
                     if (o.textShadow?.enabled) {
                         textStyle.textShadow = `${o.textShadow.offsetX}px ${o.textShadow.offsetY}px ${o.textShadow.blur}px ${o.textShadow.color}`;
                     }
                     if (o.textBorder?.enabled) {
                         (textStyle as any).WebkitTextStroke = `${o.textBorder.width}px ${o.textBorder.color}`;
                     }
                     let gradientStyle: React.CSSProperties | undefined;
                     if (o.textGradient?.enabled && o.textGradient.colors.length >= 2) {
                         const g = o.textGradient;
                         gradientStyle = {
                             background: g.type === 'radial'
                                 ? `radial-gradient(circle, ${g.colors.join(', ')})`
                                 : `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})`,
                             WebkitBackgroundClip: 'text',
                             WebkitTextFillColor: 'transparent',
                             backgroundClip: 'text',
                         } as React.CSSProperties;
                     }
                     return (
                         <React.Fragment key={o.id}>
                             <div style={textStyle} onMouseDown={e => handleOverlayMouseDown(e, 'text', o.id, o.x, o.y)}>
                                 <span style={gradientStyle}>{o.text}</span>
                             </div>
                             {isDragging && overlayDragOffset && (
                                 <div className="absolute bg-black/80 text-sky-300 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none"
                                      style={{ left: `${overlayDragOffset.x}%`, top: `${overlayDragOffset.y}%`, transform: 'translate(-50%, -120%)', zIndex: 999 }}>
                                     {overlayDragOffset.x}%, {overlayDragOffset.y}%
                                 </div>
                             )}
                         </React.Fragment>
                     );
                })}
                 {stageState.imageOverlays.map(o => {
                     const isDragging = overlayDrag?.kind === 'image' && overlayDrag.overlayId === o.id;
                     const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : o.x;
                     const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : o.y;
                     return (
                         <React.Fragment key={o.id}>
                             <div
                                 style={{
                                     position: 'absolute', 
                                     left: `${displayX}%`, 
                                     top: `${displayY}%`,
                                     width: `${pxToPercentWidth(o.width)}%`, 
                                     height: `${pxToPercentHeight(o.height)}%`,
                                     transform: `translate(-50%, -50%) rotate(${o.rotation}deg) scale(${o.scaleX}, ${o.scaleY})`,
                                     opacity: o.opacity,
                                     cursor: isDragging ? 'grabbing' : 'grab',
                                     zIndex: isDragging ? 50 : undefined,
                                 }}
                                 onMouseDown={e => handleOverlayMouseDown(e, 'image', o.id, o.x, o.y)}
                             >
                                 <img src={o.imageUrl} alt="" className="w-full h-full object-contain" />
                             </div>
                             {isDragging && overlayDragOffset && (
                                 <div className="absolute bg-black/80 text-sky-300 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none"
                                      style={{ left: `${overlayDragOffset.x}%`, top: `${overlayDragOffset.y}%`, transform: 'translate(-50%, -120%)', zIndex: 999 }}>
                                     {overlayDragOffset.x}%, {overlayDragOffset.y}%
                                 </div>
                             )}
                         </React.Fragment>
                     );
                 })}
                {stageState.buttonOverlays.map(btn => {
                    const scaledBorderRadius = btn.borderRadius * (stageSize.width / REFERENCE_WIDTH);
                    const scaledButtonFontSize = scaleFontSize(btn.fontSize);
                    const isDragging = overlayDrag?.kind === 'button' && overlayDrag.overlayId === btn.id;
                    const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : btn.x;
                    const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : btn.y;
                    
                    return (
                        <React.Fragment key={btn.id}>
                            <div
                                style={{
                                    position: 'absolute',
                                    left: `${displayX}%`,
                                    top: `${displayY}%`,
                                    width: `${btn.width}%`,
                                    height: `${btn.height}%`,
                                    transform: 'translate(-50%, -50%)',
                                    cursor: isDragging ? 'grabbing' : 'grab',
                                    zIndex: isDragging ? 50 : undefined,
                                }}
                                onMouseDown={e => handleOverlayMouseDown(e, 'button', btn.id, btn.x, btn.y)}
                            >
                                {btn.imageUrl ? (
                                    <div className="w-full h-full relative">
                                        <img src={btn.imageUrl} alt="" className="w-full h-full object-cover" style={{ borderRadius: `${scaledBorderRadius}px` }} />
                                        <div className="absolute inset-0 flex items-center justify-center" style={{
                                            color: btn.textColor,
                                            fontSize: `${scaledButtonFontSize}px`,
                                            fontWeight: btn.fontWeight,
                                        }}>
                                            {btn.text}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center" style={{
                                        backgroundColor: btn.backgroundColor,
                                        color: btn.textColor,
                                        fontSize: `${scaledButtonFontSize}px`,
                                        fontWeight: btn.fontWeight,
                                        borderRadius: `${scaledBorderRadius}px`,
                                    }}>
                                        {btn.text}
                                    </div>
                                )}
                            </div>
                            {isDragging && overlayDragOffset && (
                                <div className="absolute bg-black/80 text-sky-300 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none"
                                     style={{ left: `${overlayDragOffset.x}%`, top: `${overlayDragOffset.y}%`, transform: 'translate(-50%, -120%)', zIndex: 999 }}>
                                    {overlayDragOffset.x}%, {overlayDragOffset.y}%
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}

                {currentDialogue && renderDialogueBox(currentDialogue)}
                {currentChoices && renderChoiceMenu(currentChoices)}

                 {stageState.flash && (
                    <div className="absolute inset-0 z-50" style={{ backgroundColor: stageState.flash.color, opacity: 0.7 }}></div>
                )}
                {showCommandIndicators && stageState.commandIndicator && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 p-4 rounded-lg text-center z-50">
                        <h4 className="font-bold text-sky-400 text-lg">{stageState.commandIndicator.type.replace(/([A-Z])/g, ' $1').trim()}</h4>
                        <p>{stageState.commandIndicator.details}</p>
                    </div>
                )}
                
                {showVariableState && (
                    <div className="absolute top-2 left-2 bg-black/70 p-2 rounded-lg text-xs max-w-xs max-h-48 overflow-y-auto z-50">
                        <h4 className="font-bold mb-1">Variable State</h4>
                        <ul>
                            {Object.entries(currentVariables).map(([id, value]) => {
                                const varName = project.variables[id]?.name || id;
                                return <li key={id}>{varName}: {String(value)}</li>
                            })}
                        </ul>
                    </div>
                )}

                 <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
                    <button
                        onClick={() => setShowCommandIndicators(s => !s)}
                        className={`p-2 rounded-full transition-all border ${
                            showCommandIndicators
                                ? 'bg-sky-500/80 border-sky-400/50 text-white shadow-lg shadow-sky-500/20'
                                : 'bg-[var(--bg-primary)]/70 border-[var(--border-default)]/40 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/80 hover:border-slate-400/50'
                        }`}
                        title={showCommandIndicators ? 'Hide Event Indicators' : 'Show Event Indicators'}
                    >
                        {showCommandIndicators ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => setShowVariableState(s => !s)}
                        className={`p-2 rounded-full transition-all border ${
                            showVariableState
                                ? 'bg-sky-500/80 border-sky-400/50 text-white shadow-lg shadow-sky-500/20'
                                : 'bg-[var(--bg-primary)]/70 border-[var(--border-default)]/40 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/80 hover:border-slate-400/50'
                        }`}
                        title={showVariableState ? 'Hide Variable State' : 'Show Variable State'}
                    >
                        <VariablesIcon className="w-4 h-4" />
                    </button>
                 </div>
                </div>
            </div>
        </Panel>
    );
};

export default StagingArea;
