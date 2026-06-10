import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { VNID, VNPosition, VNTransition, VNPositionPreset } from '../types';
import type { VNScreenOverlayEffect } from '../types';
import { VNProject } from '../types/project';
import {
    CommandType, ShowCharacterCommand, DialogueCommand, FlashScreenCommand, ChoiceOption,
    ChoiceCommand, SetBackgroundCommand, ShowTextCommand, ShowImageCommand, VNScene, ShowButtonCommand,
    PlayMovieCommand, VNCommand, TextInputCommand
} from '../features/scene/types';
import { useProject } from '../contexts/ProjectContext';
import ResizableDraggable from './menu-editor/ResizableDraggable';
// FIX: VNCondition is not exported from scene/types, but from shared types.
import { VNCondition } from '../types/shared';
import { combineConditions } from '../utils/conditionLogic';
import { VNFontSettings } from '../features/ui/types';
import { VNCharacterLayer } from '../features/character/types';
import { resolveBoolLabels } from '../features/variables/booleanLabels';
import { EyeIcon, EyeSlashIcon, FilmIcon, VariablesIcon } from './icons';
import { computeArrangedPositions } from '../utils/characterArrange';
import Panel from './ui/Panel';
import { useCommandRadial } from './inspector/CommandRadialContext';
import { fontSettingsToStyle, extractTextGradientStyle, buildTextEffectStyles, buildOrientationTransform } from '../utils/styleUtils';
import { GradientText } from './ui/GradientText';

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
    layer?: number;
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
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
}

interface ImageOverlay {
    id: VNID;
    layer?: number;
    imageUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    scaleX: number;
    scaleY: number;
    flipX?: boolean;
    flipY?: boolean;
    fitToContent?: boolean;
}

interface ButtonOverlay {
    id: VNID;
    layer?: number;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontWeight: string;
    textAlign: 'left' | 'center' | 'right';
    paddingX: number;
    borderRadius: number;
    imageUrl?: string;
    hoverImageUrl?: string;
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
}

interface StageCharacterState {
    charId: VNID;
    layer?: number;
    position: VNPosition;
    imageUrls: string[];
    transition?: VNTransition;
    sourceCommandId?: string;
    scale?: number;
    inverted?: boolean;
    rotation?: number;
    flipY?: boolean;
}

interface StageState {
    backgroundUrl: string | null;
    /** True when backgroundUrl points at a video asset (render <video>, not <img>). */
    backgroundIsVideo?: boolean;
    /** Stacked background planes (SetBackground with `stack`) — shown in editor at their layer. */
    backgroundStack?: { commandId: string; url: string | null; color?: string; parallaxDepth?: number; layer?: number; isVideo?: boolean }[];
    characters: Record<VNID, StageCharacterState>;
    textOverlays: TextOverlay[];
    imageOverlays: ImageOverlay[];
    buttonOverlays: ButtonOverlay[];
    hotSpotOverlays: { id: string; name: string; x: number; y: number; width: number; height: number; shape: 'rect' | 'circle'; trigger: string; visible?: boolean; highlightColor?: string }[];
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
        sourceCommandId?: string;
    } | null;
    flash: { color: string } | null;
    choices: ChoiceOption[] | null;
    choiceLayout?: 'vertical' | 'horizontal' | 'free';
    choiceCommandId?: string | null;
    textInput: { prompt: string; placeholder?: string } | null;
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
    const { t } = useTranslation('staging');
    const commandRadial = useCommandRadial();
    const [showCommandIndicators, setShowCommandIndicators] = React.useState(true);
    const [showVariableState, setShowVariableState] = React.useState(false);
    // Bumped when Test Play closes so the canvas <video> remounts (the browser evicts a video
    // that sat behind the fullscreen preview and won't auto-resume otherwise).
    const [videoReloadNonce, setVideoReloadNonce] = React.useState(0);
    React.useEffect(() => {
        const onPlayEnded = () => setVideoReloadNonce(n => n + 1);
        window.addEventListener('flourish:playended', onPlayEnded);
        return () => window.removeEventListener('flourish:playended', onPlayEnded);
    }, []);
    const stageRef = React.useRef<HTMLDivElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = React.useState({ width: 1280, height: 720 }); // Default 16:9 at 720p
    const [stageState, setStageState] = React.useState<StageState>({
        backgroundUrl: null,
        characters: {},
        textOverlays: [],
        imageOverlays: [],
        buttonOverlays: [],
        hotSpotOverlays: [],
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
        textInput: null,
        commandIndicator: null,
        variables: {},
    });

    // Track stage size for proper scaling — measure the parent container and compute
    // the largest stage that fits while preserving the game's aspect ratio.
    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        
        const observer = new ResizeObserver(() => {
            const pw = el.clientWidth - 16; // p-2 = 8px each side
            const ph = el.clientHeight - 16;
            const arW = project.gameResolution?.width || 1920;
            const arH = project.gameResolution?.height || 1080;
            const ar = arW / arH;
            let w = pw;
            let h = w / ar;
            if (h > ph) {
                h = ph;
                w = h * ar;
            }
            if (w > 0 && h > 0) {
                setStageSize({ width: Math.round(w), height: Math.round(h) });
            }
        });
        
        observer.observe(el);
        return () => observer.disconnect();
    }, [project.gameResolution]);

    React.useEffect(() => {
        const scene = project.scenes[activeSceneId];
        if (!scene) {
            setStageState({
                backgroundUrl: null, characters: {}, textOverlays: [], imageOverlays: [], buttonOverlays: [], hotSpotOverlays: [],
                screen: { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0, overlayEffects: [] },
                dialogue: null, movie: null, flash: null, choices: null, textInput: null, commandIndicator: null, variables: {},
            });
            return;
        }

        const evaluateConditions = (conditions: VNCondition[] | undefined, currentVariables: StageState['variables']): boolean => {
            if (!conditions || conditions.length === 0) return true;
            return combineConditions(conditions, condition => {
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
        let backgroundIsVideo = false;
        let backgroundStack: NonNullable<StageState['backgroundStack']> = [];
        let characters: Record<VNID, StageCharacterState> = {};
        let textOverlays: TextOverlay[] = [];
        let imageOverlays: ImageOverlay[] = [];
        let buttonOverlays: ButtonOverlay[] = [];
        let hotSpotOverlays: StageState['hotSpotOverlays'] = [];
        let screen = { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0, overlayEffects: [] as VNScreenOverlayEffect[] };
        let dialogue: StageState['dialogue'] = null;
        let movie: StageState['movie'] = null;
        let flash: StageState['flash'] = null;
        let choices: StageState['choices'] = null;
        let choiceLayout: StageState['choiceLayout'] = undefined;
        let choiceCommandId: StageState['choiceCommandId'] = null;
        let textInput: StageState['textInput'] = null;
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
                case CommandType.SetBackground: {
                    // Resolve across collections AND detect whether the asset is actually a video
                    // (a video can be uploaded under the Backgrounds/Images tab, and the image picker
                    // lists videos — so render by the ACTUAL asset, not the declared type).
                    const bgAsset = command.backgroundColor ? null : (
                        project.backgrounds[command.backgroundId] ||
                        project.images?.[command.backgroundId] ||
                        (project.videos?.[command.backgroundId] as any) ||
                        null
                    );
                    const bgIsVid = !!(bgAsset && ((bgAsset as any).isVideo || (bgAsset as any).videoUrl) && !(bgAsset as any).imageUrl);
                    const resolvedBgUrl = command.backgroundColor ? null : (
                        bgIsVid
                            ? ((bgAsset as any)?.videoUrl || null)
                            : ((bgAsset as any)?.imageUrl || (bgAsset as any)?.videoUrl || null)
                    );
                    if (command.stack) {
                        // Stacked plane: add/replace its own plane (keyed by command id) instead
                        // of replacing the base background — mirrors the runtime so the editor
                        // shows every stacked backdrop.
                        backgroundStack = [
                            ...backgroundStack.filter(p => p.commandId !== command.id),
                            { commandId: command.id, url: resolvedBgUrl, color: command.backgroundColor, parallaxDepth: command.parallaxDepth, layer: command.layer, isVideo: bgIsVid },
                        ];
                    } else {
                        backgroundUrl = resolvedBgUrl;
                        backgroundIsVideo = bgIsVid;
                    }
                    break;
                }
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
                        // "Keep current position": if the character is already on stage and the command
                        // opts in, preview it at its existing position (mirrors the runtime handler) so the
                        // author sees an expression change stay put instead of snapping to center.
                        const keptPosition = command.keepPosition && characters[command.characterId]
                            ? characters[command.characterId].position
                            : command.position;
                        characters[command.characterId] = { charId: command.characterId, layer: command.layer, position: keptPosition, imageUrls, transition: command.transition, sourceCommandId: command.id, scale: command.scale, inverted: command.inverted, rotation: command.rotation, flipY: command.flipY };
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
                        id: command.id, layer: command.layer, text: command.text, x: command.x, y: command.y,
                        fontSize: command.fontSize, fontFamily: command.fontFamily, color: command.color,
                        width: command.width, height: command.height, textAlign: command.textAlign, verticalAlign: command.verticalAlign,
                        fontWeight: command.fontWeight, fontStyle: command.fontStyle, letterSpacing: command.letterSpacing,
                        textShadow: command.textShadow, textGradient: command.textGradient, textBorder: command.textBorder,
                        rotation: command.rotation, flipX: command.flipX, flipY: command.flipY,
                    });
                    break;
                case CommandType.HideText:
                    textOverlays = textOverlays.filter(o => o.id !== command.targetCommandId);
                    break;
                case CommandType.ShowImage:
                    const imageUrl = project.images[command.imageId]?.imageUrl || project.backgrounds[command.imageId]?.imageUrl;
                    if (imageUrl) {
                        imageOverlays.push({
                            id: command.id, layer: command.layer, imageUrl, x: command.x, y: command.y,
                            width: command.width, height: command.height, rotation: command.rotation, opacity: command.opacity,
                            scaleX: command.scaleX ?? 1, scaleY: command.scaleY ?? 1,
                            flipX: command.flipX, flipY: command.flipY, fitToContent: command.fitToContent,
                        });
                    }
                    break;
                case CommandType.HideImage:
                    imageOverlays = imageOverlays.filter(o => o.id !== command.targetCommandId);
                    break;
                case CommandType.ShowButton:
                    if (evaluateConditions(command.showConditions, currentVariables)) {
                        const buttonCmd = command as ShowButtonCommand;
                        // Resolve the button image the SAME way the runtime assetResolver does
                        // (backgrounds first, then images, then videos, with video/image url
                        // fallbacks). The old code only checked project.images, so a button
                        // image stored under backgrounds never showed on the canvas.
                        const resolveBtnAsset = (asset?: { type: 'image' | 'video'; id: VNID } | null): string | undefined => {
                            if (!asset?.id) return undefined;
                            const id = asset.id;
                            return project.backgrounds[id]?.videoUrl || project.backgrounds[id]?.imageUrl ||
                                   project.images?.[id]?.videoUrl || project.images?.[id]?.imageUrl ||
                                   project.videos[id]?.videoUrl || undefined;
                        };
                        const imageUrl = resolveBtnAsset(buttonCmd.image);
                        const hoverImageUrl = resolveBtnAsset(buttonCmd.hoverImage);
                        buttonOverlays.push({
                            id: buttonCmd.id,
                            layer: buttonCmd.layer,
                            text: buttonCmd.text,
                            x: buttonCmd.x,
                            y: buttonCmd.y,
                            // Mirror the runtime defaults (overlayHandler) so a button with
                            // unset size/colors still renders on the canvas instead of
                            // collapsing to an invisible 0-size element.
                            width: buttonCmd.width || 20,
                            height: buttonCmd.height || 8,
                            backgroundColor: buttonCmd.backgroundColor || '#6366f1',
                            textColor: buttonCmd.textColor || '#ffffff',
                            fontSize: buttonCmd.fontSize || 18,
                            fontWeight: buttonCmd.fontWeight || 'normal',
                            textAlign: buttonCmd.textAlign || 'center',
                            paddingX: buttonCmd.paddingX ?? 0,
                            borderRadius: buttonCmd.borderRadius ?? 8,
                            imageUrl,
                            hoverImageUrl,
                            rotation: buttonCmd.rotation, flipX: buttonCmd.flipX, flipY: buttonCmd.flipY,
                        });
                    }
                    break;
                case CommandType.HideButton:
                    buttonOverlays = buttonOverlays.filter(o => o.id !== command.buttonId);
                    break;
                case CommandType.ShowHotSpot:
                    if (evaluateConditions(command.conditions, currentVariables)) {
                        hotSpotOverlays.push({
                            id: command.id, name: command.name, x: command.x, y: command.y,
                            width: command.width, height: command.height, shape: command.shape,
                            trigger: command.trigger, visible: command.visible, highlightColor: command.highlightColor,
                        });
                    }
                    break;
                case CommandType.HideHotSpot:
                    hotSpotOverlays = hotSpotOverlays.filter(o => o.id !== command.targetCommandId);
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
                    choiceLayout = currentCommand.layout;
                    choiceCommandId = currentCommand.id;
                    break;
                case CommandType.PlayMovie: {
                    const movieCmd = currentCommand as PlayMovieCommand;
                    // A video can live in videos OR backgrounds/images (uploaded under those tabs).
                    const videoAsset = (project.videos[movieCmd.videoId]
                        || (project.backgrounds as any)[movieCmd.videoId]
                        || (project.images as any)?.[movieCmd.videoId]) as any;
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
                        sourceCommandId: movieCmd.id,
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
                    commandIndicator = { type: currentCommand.type, details: '' };
                    break;
                case CommandType.TextInput: {
                    const tiCmd = currentCommand as TextInputCommand;
                    textInput = { prompt: tiCmd.prompt || 'Enter text…', placeholder: tiCmd.placeholder };
                    commandIndicator = { type: currentCommand.type, details: '' };
                    break;
                }
            }
        }

        setStageState({ backgroundUrl, backgroundIsVideo, backgroundStack, characters, textOverlays, imageOverlays, buttonOverlays, hotSpotOverlays, screen, dialogue, movie, flash, choices, choiceLayout, choiceCommandId, textInput, commandIndicator, variables: currentVariables });

    }, [activeSceneId, selectedCommandIndex, project]);

    // --- Drag-to-Position State ---
    type DragKind = 'character' | 'text' | 'image' | 'button' | 'hotspot' | 'movie';
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

    // --- Resize (scale) State ---
    const [overlayResize, setOverlayResize] = useState<{
        kind: DragKind;
        overlayId: string;
        sourceCommandId: string;
        startMouseX: number;
        startMouseY: number;
        startW: number;
        startH: number;
    } | null>(null);
    const [overlayResizeSize, setOverlayResizeSize] = useState<{ width: number; height: number } | null>(null);

    const handleOverlayResizeMouseDown = useCallback((e: React.MouseEvent, kind: DragKind, overlayId: string, width: number, height: number, sourceCommandId?: string) => {
        e.preventDefault();
        e.stopPropagation();
        setOverlayResize({
            kind,
            overlayId,
            // For most overlays the overlay id IS the command id; characters key on charId but
            // their command lives at sourceCommandId, so allow it to be passed explicitly.
            sourceCommandId: sourceCommandId ?? overlayId,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startW: width,
            startH: height,
        });
        setOverlayResizeSize(null);
    }, []);

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
            for (const scene of Object.values(project.scenes) as VNScene[]) {
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

    // Resize drag: the overlay is center-anchored, so growing width/height by 2× the
    // mouse delta keeps the dragged corner under the cursor.
    useEffect(() => {
        if (!overlayResize) return;
        const sw = stageSize.width || 1;
        const sh = stageSize.height || 1;
        const MIN = 1; // percent
        const isCharacter = overlayResize.kind === 'character';
        const onMove = (e: MouseEvent) => {
            const dx = ((e.clientX - overlayResize.startMouseX) / sw) * 100;
            const dy = ((e.clientY - overlayResize.startMouseY) / sh) * 100;
            if (isCharacter) {
                // Characters scale uniformly. They render at ~90% of stage height, so dragging the
                // handle down by dy% of the stage grows the scale by dy/90. startW holds the start scale.
                let s = overlayResize.startW + dy / 90;
                if (e.shiftKey) s = Math.round(s * 10) / 10;
                s = Math.max(0.1, Math.round(s * 100) / 100);
                setOverlayResizeSize({ width: s, height: s });
                return;
            }
            let nw = overlayResize.startW + dx * 2;
            let nh = overlayResize.startH + dy * 2;
            if (e.shiftKey) { nw = Math.round(nw); nh = Math.round(nh); }
            nw = Math.max(MIN, Math.round(nw * 10) / 10);
            nh = Math.max(MIN, Math.round(nh * 10) / 10);
            setOverlayResizeSize({ width: nw, height: nh });
        };
        const onUp = () => {
            const resize = overlayResize;
            const size = overlayResizeSize;
            setOverlayResize(null);
            setOverlayResizeSize(null);
            if (!size) return;
            for (const scene of Object.values(project.scenes) as VNScene[]) {
                const idx = scene.commands.findIndex((c: VNCommand) => c.id === resize.sourceCommandId);
                if (idx < 0) continue;
                const cmd = scene.commands[idx];
                const patch = resize.kind === 'character'
                    ? { scale: size.width }
                    : { width: size.width, height: size.height };
                dispatch({
                    type: 'UPDATE_COMMAND',
                    payload: { sceneId: scene.id, commandIndex: idx, command: { ...cmd, ...patch } },
                });
                break;
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [overlayResize, overlayResizeSize, project.scenes, dispatch, stageSize]);

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

    // Input box settings
    const inputBoxImageUrl = project.ui.inputBoxImage
        ? (project.images[project.ui.inputBoxImage.id]?.imageUrl || project.backgrounds[project.ui.inputBoxImage.id]?.imageUrl)
        : null;
    const inputBorderImageUrl = (project.ui as any).inputBoxBorderImage
        ? (project.images[(project.ui as any).inputBoxBorderImage.id]?.imageUrl || project.backgrounds[(project.ui as any).inputBoxBorderImage.id]?.imageUrl)
        : null;
    const inputBorderPadding = (project.ui as any).inputBorderPadding ?? 8;
    const inputBoxPadding = project.ui.inputBoxPadding ?? 24;
    const inputSizeMode = project.ui.inputBoxSizeMode ?? 'stretch';
    const inputSlice = project.ui.inputBoxSlice ?? 20;
    const inputColor = project.ui.inputBoxColor ?? '#0f172a';
    const inputOpacity = project.ui.inputBoxOpacity ?? 92;
    const inputBorderRadius = project.ui.inputBoxBorderRadius ?? 8;
    const inputBgColor = hexToRgba(inputColor, inputOpacity);
    const hasCustomInputImage = inputBoxImageUrl || inputBorderImageUrl;

    // Quick menu settings
    const qmPosition = project.ui.quickMenuPosition ?? 'above-dialogue';
    const qmColor = project.ui.quickMenuColor ?? '#0f172a';
    const qmOpacity = project.ui.quickMenuOpacity ?? 75;
    const qmBorderRadius = project.ui.quickMenuBorderRadius ?? 4;

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
    // If a bottom Quick Menu preset is active and the user hasn't overridden
    // the dialogue Y or Quick Menu Y, reserve vertical space at the bottom so
    // the dialogue is pushed up and the menu can sit cleanly underneath.
    // Skip reservation if quickMenuFloatOverDialogue is enabled.
    const _isBottomQmPreset = qmPosition === 'bottom-right' || qmPosition === 'bottom-left';
    const _shouldFloatQm = project.ui.quickMenuFloatOverDialogue ?? false;
    const _qmBottomReservePct = (!_shouldFloatQm && _isBottomQmPreset && project.ui.quickMenuY === undefined)
        ? ((project.ui.quickMenuHeight ?? 4) + 2)
        : 0;
    const dialogueYPct = project.ui.dialogueBoxY ?? (100 - dialogueHPct - bmPct - _qmBottomReservePct);

    const nameWPct = project.ui.nameboxWidth ?? 15;
    const nameHPct = project.ui.nameboxHeight ?? 5;
    const nameXPct = project.ui.nameboxX ?? (dialogueXPct + nameboxOffsetX * 100 / gameW);
    const nameYPct = project.ui.nameboxY ?? (dialogueYPct - nameHPct - nameboxOffsetY * 100 / gameH);

    const choiceWPct = choiceWidth ? (choiceWidth * 100 / gameW) : 30;
    const choiceHPct = choiceHeight ? (choiceHeight * 100 / gameH) : 25;
    const choiceXPct = project.ui.choiceButtonX ?? (50 - choiceWPct / 2);
    const choiceYPct = project.ui.choiceButtonY ?? 35;

    // Input box layout rect
    const inputBoxWidth = project.ui.inputBoxWidth || 0;
    const inputWPct = inputBoxWidth ? (inputBoxWidth * 100 / gameW) : 30;
    const inputHPct = project.ui.inputBoxHeight ? (project.ui.inputBoxHeight * 100 / gameH) : 20;
    const inputXPct = project.ui.inputBoxX ?? (50 - inputWPct / 2);
    const inputYPct = project.ui.inputBoxY ?? 40;

    // Quick menu layout rect
    const qmWPct = project.ui.quickMenuWidth ?? 40;
    const qmHPct = project.ui.quickMenuHeight ?? 4;
    // Bottom presets sit at the screen bottom; the dialogue box has already
    // been pushed up to make room (see _qmBottomReservePct above).
    const getQmDefaultPos = () => {
        if (qmPosition === 'top-right') return { x: 100 - qmWPct - 1, y: 1 };
        if (qmPosition === 'top-left') return { x: 1, y: 1 };
        if (qmPosition === 'bottom-right') return { x: 100 - qmWPct - 1, y: 100 - qmHPct - 1 };
        if (qmPosition === 'bottom-left') return { x: 1, y: 100 - qmHPct - 1 };
        // above-dialogue
        return { x: dialogueXPct, y: dialogueYPct - qmHPct - 1 };
    };
    const qmDefPos = getQmDefaultPos();
    const qmXPct = project.ui.quickMenuX ?? qmDefPos.x;
    const qmYPct = project.ui.quickMenuY ?? qmDefPos.y;

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
                            justifyContent: project.ui.dialogueNameFont?.align === 'center' ? 'center' : project.ui.dialogueNameFont?.align === 'right' ? 'flex-end' : 'flex-start',
                            ...nameboxBgStyle,
                            padding: `${s(nameboxPadding)} ${s(nameboxHPadding)}`,
                            ...(hasCustomDialogueImage || nameboxImageUrl ? {} : {
                                border: '1px solid rgba(148,163,184,0.35)',
                            }),
                        }}>
                            <span style={{...nameStyle, lineHeight: 1.3}}>
                                <GradientText style={extractTextGradientStyle(project.ui.dialogueNameFont)}>{dialogue.characterName}</GradientText>
                            </span>
                        </div>
                    </div>
                )}
                {/* Dialogue box – percentage positioned (matching InGameUIEditor).
                    Right-click opens the radial for the underlying Dialogue COMMAND
                    (text/speaker/effect/logic) — not the dialogue-box styling, which
                    lives in the In-Game UI editor. */}
                <div className="absolute z-20"
                     onContextMenu={commandRadial && selectedCommandIndex !== null
                         ? (e) => { e.preventDefault(); commandRadial.openByIndex(selectedCommandIndex, e.clientX, e.clientY); }
                         : undefined}
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
                                <GradientText style={extractTextGradientStyle(project.ui.dialogueTextFont)}>{interpolatedText}</GradientText>
                            </p>
                        </div>
                    </div>
                </div>
            </>
        );
    };

    const renderChoiceMenu = (choices: NonNullable<StageState['choices']>) => {
        const layout = stageState.choiceLayout;

        // One preview button, applying per-option appearance overrides (art/color/radius/fontSize/text)
        // with fallback to the global choice style — mirrors the runtime ChoiceMenu.
        const resolveOptImg = (a?: { type: 'image' | 'video'; id: VNID } | null): string | null =>
            (a && a.type !== 'video') ? (project.images[a.id]?.imageUrl || project.backgrounds[a.id]?.imageUrl || null) : null;
        const renderBtn = (opt: ChoiceOption, fill: boolean) => {
            const text = interpolateVariables(opt.text, currentVariables, project);
            const baseImg = resolveOptImg(opt.image) || choiceButtonImageUrl;
            const bg = opt.backgroundColor ? hexToRgba(opt.backgroundColor, choiceOpacity) : choiceBgColor;
            const radius = opt.borderRadius ?? choiceBorderRadius;
            const hasImg = !!(baseImg || choiceBorderImageUrl);
            return (
                <button className="relative overflow-hidden w-full transition-all duration-200 hover:scale-[1.03]"
                    style={{
                        borderRadius: s(radius),
                        ...(fill ? { height: '100%' } : {}),
                        ...(baseImg
                            ? { ...buildImageBackgroundStyle(baseImg, choiceSizeMode, choiceSlice), backgroundColor: bg }
                            : !hasImg
                                ? { backgroundColor: bg, border: '1px solid rgba(148,163,184,0.3)', boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)' }
                                : {}),
                        padding: `${s(choicePadding)} ${s(choicePadding * 2)}`,
                        ...(!fill && choiceHeight ? { height: s(choiceHeight) } : {}),
                        ...fontSettingsToStyle(project.ui.choiceTextFont),
                        ...(opt.fontSize ? { fontSize: s(opt.fontSize) } : {}),
                        ...(opt.textColor ? { color: opt.textColor } : {}),
                        textAlign: (project.ui.choiceTextFont?.align || 'center') as any,
                        wordBreak: 'break-word' as const,
                        overflowWrap: 'break-word' as const,
                        cursor: 'pointer',
                    }}>
                    <GradientText style={extractTextGradientStyle(project.ui.choiceTextFont)}>{text}</GradientText>
                </button>
            );
        };

        // ── Free layout: each option positioned by x/y/width/height. Drag + resize on the canvas
        //    when this Choice command is the one being edited (selected). ──
        if (layout === 'free') {
            const scene = project.scenes[activeSceneId];
            const editCmd = (selectedCommandIndex != null && (scene?.commands[selectedCommandIndex] as any)?.type === CommandType.Choice && (scene?.commands[selectedCommandIndex] as any)?.id === stageState.choiceCommandId)
                ? (scene!.commands[selectedCommandIndex] as ChoiceCommand) : null;
            const opts = editCmd ? editCmd.options : choices;
            const updateOpt = (i: number, u: { x: number; y: number; width: number; height: number }) => {
                if (!editCmd || selectedCommandIndex == null) return;
                const newOptions = editCmd.options.map((o, idx) => idx === i ? { ...o, x: u.x, y: u.y, width: u.width, height: u.height } : o);
                dispatch({ type: 'UPDATE_COMMAND', payload: { sceneId: activeSceneId, commandIndex: selectedCommandIndex, command: { ...editCmd, options: newOptions } } });
            };
            return (
                <div className="absolute inset-0 z-30">
                    {opts.map((opt, i) => {
                        const bx = opt.x ?? (34 + i * 2), by = opt.y ?? (40 + i * 12), bw = opt.width ?? 25, bh = opt.height ?? 9;
                        if (editCmd && stageSize.width > 0) {
                            return (
                                <ResizableDraggable key={opt.id} x={bx} y={by} width={bw} height={bh} anchorX={0} anchorY={0}
                                    parentSize={stageSize} isSelected={true} onSelect={() => {}} onUpdate={u => updateOpt(i, u)}
                                    label={`Choice ${i + 1}`}>
                                    {renderBtn(opt, true)}
                                </ResizableDraggable>
                            );
                        }
                        return <div key={opt.id} style={{ position: 'absolute', left: `${bx}%`, top: `${by}%`, width: `${bw}%`, height: `${bh}%` }}>{renderBtn(opt, true)}</div>;
                    })}
                </div>
            );
        }

        // ── Vertical (default) / Horizontal stack ──
        const horizontal = layout === 'horizontal';
        return (
            <div className={`absolute z-30 flex ${horizontal ? 'flex-row flex-wrap gap-3' : 'flex-col'} items-center justify-center`}
                 style={{ left: `${choiceXPct}%`, top: `${choiceYPct}%`, width: `${choiceWPct}%`, height: `${choiceHPct}%` }}>
                {choices.map((opt) => (
                    <div key={opt.id}
                         className={horizontal ? '' : 'mb-3'}
                         style={{
                             ...(horizontal ? {} : { width: '100%' }),
                             ...(choiceBorderImageUrl ? { ...buildImageBackgroundStyle(choiceBorderImageUrl, choiceSizeMode, choiceSlice), padding: s(choiceBorderPadding), borderRadius: s(choiceBorderRadius) } : {}),
                         }}>
                        {renderBtn(opt, false)}
                    </div>
                ))}
            </div>
        );
    };

    const renderInputBox = (ti: NonNullable<StageState['textInput']>) => {
        const promptStyle: React.CSSProperties = project.ui.inputPromptFont
            ? { ...fontSettingsToStyle(project.ui.inputPromptFont), textAlign: project.ui.inputPromptFont.align || 'center' }
            : { color: '#FFFFFF', textAlign: 'center' };
        const fieldStyle: React.CSSProperties = project.ui.inputFieldFont
            ? fontSettingsToStyle(project.ui.inputFieldFont)
            : { color: '#FFFFFF' };
        const submitStyle: React.CSSProperties = project.ui.inputSubmitFont
            ? fontSettingsToStyle(project.ui.inputSubmitFont)
            : { color: '#FFFFFF' };

        return (
            <div className="absolute z-30 flex flex-col items-center justify-center"
                 style={{
                     left: `${inputXPct}%`,
                     top: `${inputYPct}%`,
                     width: `${inputWPct}%`,
                     height: `${inputHPct}%`,
                 }}>
                <div className="relative"
                     style={{
                         borderRadius: s(inputBorderRadius),
                         width: '100%',
                         ...(inputBorderImageUrl
                             ? { ...buildImageBackgroundStyle(inputBorderImageUrl, inputSizeMode, inputSlice), padding: s(inputBorderPadding) }
                             : {}),
                     }}>
                    <div className="relative"
                         style={{
                             borderRadius: s(inputBorderRadius),
                             overflow: 'hidden',
                             ...(hasCustomInputImage ? {} : {
                                 backgroundColor: inputBgColor,
                                 border: '1px solid rgba(148,163,184,0.3)',
                                 boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                             }),
                             ...(inputBoxImageUrl
                                 ? { ...buildImageBackgroundStyle(inputBoxImageUrl, inputSizeMode, inputSlice), backgroundColor: inputBgColor, ...(inputSizeMode !== 'nine-slice' ? { padding: s(inputBoxPadding) } : {}) }
                                 : { padding: s(inputBoxPadding) }),
                         }}>
                        <div style={{
                            position: 'relative',
                            zIndex: 1,
                            padding: inputSizeMode === 'nine-slice' && inputBoxImageUrl ? s(inputBoxPadding) : undefined,
                        }}>
                            <p className="mb-4" style={promptStyle}>
                                <GradientText style={extractTextGradientStyle(project.ui.inputPromptFont)}>{ti.prompt}</GradientText>
                            </p>
                            <div className="w-full px-3 py-2"
                                 style={{
                                     ...fieldStyle,
                                     backgroundColor: 'rgba(15,23,42,0.6)',
                                     border: '1px solid rgba(148,163,184,0.3)',
                                     borderRadius: s(Math.max(4, inputBorderRadius - 4)),
                                 }}>
                                <span style={{ opacity: 0.4 }}>{ti.placeholder || t('inputPlaceholder')}</span>
                            </div>
                            <div className="mt-3 text-center">
                                <span className="inline-block px-4 py-1 rounded bg-sky-600/80" style={submitStyle}>
                                    <GradientText style={extractTextGradientStyle(project.ui.inputSubmitFont)}>{t('submitButton')}</GradientText>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderQuickMenu = () => {
        if (qmPosition === 'hidden') return null;
        const qmBg = hexToRgba(qmColor, qmOpacity);
        const labels = [t('quickMenuBack'), t('quickMenuLog'), t('quickMenuAuto'), t('quickMenuSkip')];
        return (
            <div className="absolute z-25 flex items-center justify-center"
                 style={{
                     left: `${qmXPct}%`,
                     top: `${qmYPct}%`,
                     width: `${qmWPct}%`,
                     height: `${qmHPct}%`,
                     pointerEvents: 'none',
                 }}>
                <div className="flex items-center gap-1.5">
                    {labels.map(lbl => (
                        <div key={lbl} style={{
                            backgroundColor: qmBg,
                            borderRadius: s(qmBorderRadius),
                            fontSize: s(12),
                            padding: `${s(4)} ${s(10)}`,
                            color: 'rgba(255,255,255,0.8)',
                            border: '1px solid rgba(148,163,184,0.2)',
                        }}>
                            {lbl}
                        </div>
                    ))}
                </div>
            </div>
        );
    };
    
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
            title={t('panelTitle')}
            className={className} 
            style={{ 
                height: style?.height || 'var(--canvas-height)',
                ...style 
            }}
        >
            <div ref={containerRef} className="w-full h-full flex items-center justify-center p-2">
                <div
                    ref={stageRef}
                    className="relative bg-[var(--bg-primary)]/50 rounded-md overflow-hidden"
                    // `isolation: isolate` makes the stage its own stacking context so per-element
                    // `layer` z-indices stay confined here (mirroring the runtime's panZoom transform
                    // context) and never float overlays above the editor chrome.
                    style={{ isolation: 'isolate', width: stageSize.width, height: stageSize.height, '--font-scale': stageSize.width > 0 ? stageSize.width / (project.gameResolution?.width || 1920) : 1 } as React.CSSProperties}
                >
                    {stageState.backgroundUrl && (stageState.backgroundIsVideo
                        ? <video key={`stage-bg-${videoReloadNonce}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={stageState.backgroundUrl} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                        : <img src={stageState.backgroundUrl} alt="background" className="absolute inset-0 w-full h-full object-cover" />
                    )}

                    {/* Stacked background planes (SetBackground `stack`): shown at their layer so the
                        author can arrange multi-plane parallax backdrops. Static (no parallax drift)
                        in the editor — over-scaled to match the runtime's at-rest framing when a depth
                        is set. */}
                    {(stageState.backgroundStack || []).map(plane => {
                        if (!plane.url && !plane.color) return null;
                        return (
                            <div key={plane.commandId} className="absolute inset-0 overflow-hidden" style={{ zIndex: plane.layer ?? 0, backgroundColor: plane.color }}>
                                {plane.url && (plane.isVideo
                                    ? <video key={`stage-bgplane-${plane.commandId}-${videoReloadNonce}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={plane.url} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" style={plane.parallaxDepth ? { transform: 'scale(1.15)', transformOrigin: 'center' } : undefined} />
                                    : <img src={plane.url} alt="background layer" className="absolute inset-0 w-full h-full object-cover" style={plane.parallaxDepth ? { transform: 'scale(1.15)', transformOrigin: 'center' } : undefined} />
                                )}
                            </div>
                        );
                    })}

                {/* Movie/video - renders BEHIND characters (z-index 2) */}
                {stageState.movie && stageState.movie.videoUrl && (
                    stageState.movie.displayMode === 'fullscreen' ? (
                        <video
                            key={`stage-movie-fs-${videoReloadNonce}`}
                            ref={(el) => { if (el) el.play().catch(() => {}); }}
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
                    ) : stageState.movie.objectFit === 'custom' ? (() => {
                        // Placed (resizable) video: draggable + resize handle on the canvas. The video
                        // uses object-fit:contain so resizing never squishes it.
                        const m = stageState.movie!;
                        const cmdId = m.sourceCommandId || '';
                        const isDragging = overlayDrag?.kind === 'movie' && overlayDrag.overlayId === cmdId;
                        const isResizing = overlayResize?.kind === 'movie' && overlayResize.overlayId === cmdId;
                        const dispX = isDragging && overlayDragOffset ? overlayDragOffset.x : m.x;
                        const dispY = isDragging && overlayDragOffset ? overlayDragOffset.y : m.y;
                        const dispW = isResizing && overlayResizeSize ? overlayResizeSize.width : m.width;
                        const dispH = isResizing && overlayResizeSize ? overlayResizeSize.height : m.height;
                        return (
                            <div
                                style={{
                                    position: 'absolute',
                                    left: `${dispX}%`, top: `${dispY}%`,
                                    width: `${dispW}%`, height: `${dispH}%`,
                                    opacity: m.opacity,
                                    zIndex: (isDragging || isResizing) ? 100000 : 2,
                                    cursor: isResizing ? 'nwse-resize' : (isDragging ? 'grabbing' : 'grab'),
                                }}
                                onMouseDown={cmdId ? (e) => handleOverlayMouseDown(e, 'movie', cmdId, m.x, m.y) : undefined}
                                onContextMenu={commandRadial && cmdId ? (e) => { e.preventDefault(); commandRadial.openById(cmdId, e.clientX, e.clientY); } : undefined}
                            >
                                <video key={`stage-movie-custom-${videoReloadNonce}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={m.videoUrl} autoPlay muted loop playsInline
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
                                {cmdId && (
                                    <div
                                        onMouseDown={e => handleOverlayResizeMouseDown(e, 'movie', cmdId, m.width, m.height)}
                                        title={t('dragToResize')}
                                        style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, borderRadius: 3, background: '#0ea5e9', border: '2px solid #fff', boxShadow: '0 0 3px rgba(0,0,0,0.6)', cursor: 'nwse-resize', zIndex: 60 }}
                                    />
                                )}
                            </div>
                        );
                    })() : (
                        <video
                            key={`stage-movie-nc-${videoReloadNonce}`}
                            ref={(el) => { if (el) el.play().catch(() => {}); }}
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
                    )
                )}
                {/* Fallback: if video URL is missing, show an indicator */}
                {stageState.movie && !stageState.movie.videoUrl && (
                    <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center text-white bg-black/60">
                        <FilmIcon className="w-12 h-12 opacity-50" />
                        <p className="text-sm opacity-70 mt-2">{t('videoLabel', { name: stageState.movie.videoName })}</p>
                    </div>
                )}

                {(() => {
                    const allChars = Object.values(stageState.characters) as StageCharacterState[];
                    const arranged = project.autoArrangeCharacters
                        ? computeArrangedPositions(allChars.map(c => ({ id: c.charId, position: c.position })))
                        : null;
                    return allChars.map((char) => {
                    const arrangedX = arranged?.get(char.charId);
                    let posStyle = arrangedX !== undefined
                        ? { top: '10%', left: `${arrangedX}%`, transform: 'translate(-50%, 0)' }
                        : getPositionStyle(char.position);
                    const isCustomPosition = typeof char.position === 'object';
                    const isDragging = overlayDrag?.kind === 'character' && overlayDrag.overlayId === char.charId;
                    const isResizingChar = overlayResize?.kind === 'character' && overlayResize.overlayId === char.charId;
                    if (isDragging && overlayDragOffset) {
                        posStyle = { left: `${overlayDragOffset.x}%`, top: `${overlayDragOffset.y}%` };
                    }
                    // For preset positions, anchor to bottom. For custom positions, respect the exact coordinates
                    // Build transform including scale and inversion
                    let transformStr = posStyle.transform || '';
                    const liveScale = (isResizingChar && overlayResizeSize) ? overlayResizeSize.width : (char.scale ?? 1);
                    if (char.rotation) {
                        transformStr = `${transformStr} rotate(${char.rotation}deg)`.trim();
                    }
                    if (liveScale !== 1 || char.inverted || char.flipY) {
                        const scaleX = (char.inverted ? -1 : 1) * liveScale;
                        const scaleY = (char.flipY ? -1 : 1) * liveScale;
                        transformStr = `${transformStr} scale(${scaleX}, ${scaleY})`.trim();
                    }
                    const finalStyle = isCustomPosition || (isDragging && overlayDragOffset)
                        ? { ...posStyle, height: '90%', ...(transformStr ? { transform: transformStr, transformOrigin: 'center bottom' } : {}) }
                        : { ...posStyle, height: '90%', bottom: '0', top: 'auto', ...(transformStr ? { transform: transformStr, transformOrigin: 'center bottom' } : {}) };
                    return (
                        <div
                            key={char.charId}
                            className="absolute w-auto aspect-[3/4]"
                            style={{
                                ...finalStyle,
                                zIndex: isDragging ? 100000 : 5 + (char.layer ?? 0) * 100,
                                cursor: char.sourceCommandId ? (isDragging ? 'grabbing' : 'grab') : undefined,
                            }}
                            onMouseDown={char.sourceCommandId ? (e) => handleCharMouseDown(e, char) : undefined}
                            onContextMenu={(commandRadial && char.sourceCommandId) ? (e) => { e.preventDefault(); commandRadial.openById(char.sourceCommandId!, e.clientX, e.clientY); } : undefined}
                        >
                            {char.imageUrls.map((url, index) => <img key={index} src={url} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ zIndex: index }} />)}
                            {/* Resize handle (bottom-right) — drag to scale the character sprite. */}
                            {char.sourceCommandId && (
                                <div
                                    onMouseDown={e => handleOverlayResizeMouseDown(e, 'character', char.charId, char.scale ?? 1, char.scale ?? 1, char.sourceCommandId)}
                                    title={t('dragToResizeScale')}
                                    style={{
                                        position: 'absolute', right: 0, bottom: 0, width: 14, height: 14,
                                        borderRadius: 3, background: '#0ea5e9', border: '2px solid #fff',
                                        boxShadow: '0 0 3px rgba(0,0,0,0.6)', cursor: 'nwse-resize', zIndex: 60,
                                    }}
                                />
                            )}
                            {isDragging && overlayDragOffset && (
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 text-sky-300 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none z-50">
                                    {overlayDragOffset.x}%, {overlayDragOffset.y}%
                                </div>
                            )}
                            {isResizingChar && overlayResizeSize && (
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 text-sky-300 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none z-50">
                                    {overlayResizeSize.width.toFixed(2)}×
                                </div>
                            )}
                        </div>
                    );
                });
                })()}
                {stageState.textOverlays.map(o => {
                     // Interpolate {variables} against the scrubbed state so the preview shows real
                     // values (matching dialogue/choices). For liveText commands this reflects the
                     // value at the selected command.
                     const overlayText = project ? interpolateVariables(o.text, currentVariables, project) : o.text;
                     const isDragging = overlayDrag?.kind === 'text' && overlayDrag.overlayId === o.id;
                     const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : o.x;
                     const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : o.y;
                     const textStyle: React.CSSProperties = {
                        position: 'absolute', 
                        left: `${displayX}%`, 
                        top: `${displayY}%`,
                        width: o.width ? `${pxToPercentWidth(o.width)}%` : 'auto', 
                        height: o.height ? `${pxToPercentHeight(o.height)}%` : 'auto',
                        transform: `translate(-50%, -50%) ${buildOrientationTransform({ rotation: o.rotation, flipX: o.flipX, flipY: o.flipY })}`.trim(),
                        ...fontSettingsToStyle({ family: o.fontFamily, size: o.fontSize, color: o.color, weight: o.fontWeight || 'normal', italic: o.fontStyle === 'italic' }),
                        fontSize: `${scaleFontSize(o.fontSize)}px`,
                        textAlign: o.textAlign,
                        letterSpacing: o.letterSpacing ? `${o.letterSpacing}px` : undefined,
                        cursor: isDragging ? 'grabbing' : 'grab',
                        zIndex: isDragging ? 100000 : 1 + (o.layer ?? 0) * 100,
                     };
                     // Apply text shadow / border / gradient via shared helper so editor matches gameplay.
                     // When a gradient is active the shadow is moved to the gradient span as drop-shadow
                     // so it renders behind the transparent text instead of on top.
                     const { containerStyle: effectsContainerStyle, gradientSpanStyle } = buildTextEffectStyles({
                         textShadow: o.textShadow,
                         textGradient: o.textGradient,
                         textBorder: o.textBorder,
                     });
                     Object.assign(textStyle, effectsContainerStyle);
                     return (
                         <React.Fragment key={o.id}>
                             <div style={textStyle} onMouseDown={e => handleOverlayMouseDown(e, 'text', o.id, o.x, o.y)}
                                 onContextMenu={commandRadial ? (e) => { e.preventDefault(); commandRadial.openById(o.id, e.clientX, e.clientY); } : undefined}>
                                 {/* GradientText forces Chromium to re-clip the gradient when colors change live. */}
                                 {gradientSpanStyle ? <GradientText style={gradientSpanStyle}>{overlayText}</GradientText> : <span>{overlayText}</span>}
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
                                     // "Fit to content": box shrinks to the fitted art (width/height become a max bound).
                                     ...(o.fitToContent
                                         ? { width: 'auto', height: 'auto', maxWidth: `${pxToPercentWidth(o.width)}%`, maxHeight: `${pxToPercentHeight(o.height)}%` }
                                         : { width: `${pxToPercentWidth(o.width)}%`, height: `${pxToPercentHeight(o.height)}%` }),
                                     transform: `translate(-50%, -50%) rotate(${o.rotation}deg) scale(${o.scaleX * (o.flipX ? -1 : 1)}, ${o.scaleY * (o.flipY ? -1 : 1)})`,
                                     opacity: o.opacity,
                                     cursor: isDragging ? 'grabbing' : 'grab',
                                     zIndex: isDragging ? 100000 : 1 + (o.layer ?? 0) * 100,
                                 }}
                                 onMouseDown={e => handleOverlayMouseDown(e, 'image', o.id, o.x, o.y)}
                                 onContextMenu={commandRadial ? (e) => { e.preventDefault(); commandRadial.openById(o.id, e.clientX, e.clientY); } : undefined}
                             >
                                 {o.fitToContent
                                     ? <img src={o.imageUrl} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }} />
                                     : <img src={o.imageUrl} alt="" className="w-full h-full object-contain" />}
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
                    const isResizing = overlayResize?.kind === 'button' && overlayResize.overlayId === btn.id;
                    const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : btn.x;
                    const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : btn.y;
                    const displayW = isResizing && overlayResizeSize ? overlayResizeSize.width : btn.width;
                    const displayH = isResizing && overlayResizeSize ? overlayResizeSize.height : btn.height;

                    return (
                        <React.Fragment key={btn.id}>
                            <div
                                style={{
                                    position: 'absolute',
                                    left: `${displayX}%`,
                                    top: `${displayY}%`,
                                    width: `${displayW}%`,
                                    // Image buttons let the height follow the image aspect (box conforms to art).
                                    height: btn.imageUrl ? 'auto' : `${displayH}%`,
                                    transform: `translate(-50%, -50%) ${buildOrientationTransform({ rotation: btn.rotation, flipX: btn.flipX, flipY: btn.flipY })}`.trim(),
                                    cursor: isResizing ? 'nwse-resize' : (isDragging ? 'grabbing' : 'grab'),
                                    zIndex: (isDragging || isResizing) ? 100000 : 1 + (btn.layer ?? 0) * 100,
                                }}
                                onMouseDown={e => handleOverlayMouseDown(e, 'button', btn.id, btn.x, btn.y)}
                                onContextMenu={commandRadial ? (e) => { e.preventDefault(); commandRadial.openById(btn.id, e.clientX, e.clientY); } : undefined}
                            >
                                {/* Resize handle (bottom-right corner) — drag to scale the button. */}
                                <div
                                    onMouseDown={e => handleOverlayResizeMouseDown(e, 'button', btn.id, btn.width, btn.height)}
                                    title={t('dragToResize')}
                                    style={{
                                        position: 'absolute',
                                        right: -6,
                                        bottom: -6,
                                        width: 12,
                                        height: 12,
                                        borderRadius: 3,
                                        background: '#0ea5e9',
                                        border: '2px solid #fff',
                                        boxShadow: '0 0 3px rgba(0,0,0,0.6)',
                                        cursor: 'nwse-resize',
                                        zIndex: 60,
                                    }}
                                />
                                {btn.imageUrl ? (
                                    <div className="relative" style={{ width: '100%' }}>
                                        <img src={btn.imageUrl} alt="" style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain', borderRadius: `${scaledBorderRadius}px` }} />
                                        <div className={`absolute inset-0 flex items-center ${ { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[btn.textAlign] }`} style={{
                                            color: btn.textColor,
                                            fontSize: `${scaledButtonFontSize}px`,
                                            fontWeight: btn.fontWeight,
                                            paddingLeft: `${btn.paddingX}%`,
                                            paddingRight: `${btn.paddingX}%`,
                                            boxSizing: 'border-box',
                                            textAlign: btn.textAlign,
                                        }}>
                                            {btn.text}
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`w-full h-full flex items-center ${ { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[btn.textAlign] }`} style={{
                                        backgroundColor: btn.backgroundColor,
                                        color: btn.textColor,
                                        fontSize: `${scaledButtonFontSize}px`,
                                        fontWeight: btn.fontWeight,
                                        borderRadius: `${scaledBorderRadius}px`,
                                        paddingLeft: `${btn.paddingX}%`,
                                        paddingRight: `${btn.paddingX}%`,
                                        boxSizing: 'border-box',
                                        textAlign: btn.textAlign,
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
                            {isResizing && overlayResizeSize && (
                                <div className="absolute bg-black/80 text-sky-300 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none"
                                     style={{ left: `${displayX}%`, top: `${displayY}%`, transform: 'translate(-50%, -120%)', zIndex: 999 }}>
                                    {overlayResizeSize.width}% × {overlayResizeSize.height}%
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}

                {/* Hot spots (ShowHotSpot) — always shown in the editor (with a label) so authors
                    can see/position them, even when set invisible for the final game. Top-left
                    anchored to match the runtime. */}
                {stageState.hotSpotOverlays.map(hs => {
                    const isDragging = overlayDrag?.kind === 'hotspot' && overlayDrag.overlayId === hs.id;
                    const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : hs.x;
                    const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : hs.y;
                    const outline = hs.highlightColor || 'rgba(99,102,241,0.9)';
                    return (
                        <React.Fragment key={hs.id}>
                            <div
                                style={{
                                    position: 'absolute',
                                    left: `${displayX}%`, top: `${displayY}%`,
                                    width: `${hs.width}%`, height: `${hs.height}%`,
                                    borderRadius: hs.shape === 'circle' ? '50%' : 6,
                                    border: `2px dashed ${outline}`,
                                    background: hs.visible ? (hs.highlightColor || 'rgba(99,102,241,0.25)') : 'rgba(99,102,241,0.08)',
                                    cursor: isDragging ? 'grabbing' : 'grab',
                                    zIndex: isDragging ? 50 : 9,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                                onMouseDown={e => handleOverlayMouseDown(e, 'hotspot', hs.id, hs.x, hs.y)}
                                title={`${hs.name} (${hs.trigger})`}
                            >
                                <span className="text-[10px] text-white/90 px-1 py-0.5 rounded bg-black/50 pointer-events-none truncate max-w-full">
                                    🎯 {hs.name}
                                </span>
                            </div>
                            {isDragging && overlayDragOffset && (
                                <div className="absolute bg-black/80 text-sky-300 text-[10px] px-2 py-0.5 rounded whitespace-nowrap pointer-events-none"
                                     style={{ left: `${overlayDragOffset.x}%`, top: `${overlayDragOffset.y}%`, transform: 'translate(0, -120%)', zIndex: 999 }}>
                                    {overlayDragOffset.x}%, {overlayDragOffset.y}%
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}

                {currentDialogue && renderDialogueBox(currentDialogue)}
                {currentDialogue && renderQuickMenu()}
                {currentChoices && renderChoiceMenu(currentChoices)}
                {stageState.textInput && renderInputBox(stageState.textInput)}

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
                    <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm p-2.5 rounded-lg text-xs max-w-xs max-h-56 overflow-y-auto z-[9999] border border-white/10 shadow-xl">
                        <h4 className="font-bold mb-1.5 flex items-center gap-1.5 text-sky-300"><VariablesIcon className="w-3.5 h-3.5" />{t('variableStateHeading')}</h4>
                        {Object.keys(currentVariables).length === 0 ? (
                            <p className="text-[var(--text-muted)] italic">{t('variableStateEmpty')}</p>
                        ) : (
                            <ul className="space-y-0.5">
                                {Object.entries(currentVariables).map(([id, value]) => {
                                    const def = project.variables[id];
                                    const varName = def?.name || id;
                                    const bl = resolveBoolLabels(def, t('boolOn'), t('boolOff'));
                                    const display = def?.type === 'boolean' ? (value ? bl.yes : bl.no) : String(value);
                                    return (
                                        <li key={id} className="flex items-center justify-between gap-3">
                                            <span className="text-slate-300 truncate">{varName}</span>
                                            <span className="font-mono text-white flex-shrink-0">{display}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}

                 {/* Preview controls — kept above all per-layer stage content (characters/overlays can
                     reach z-index 100+, which previously covered these buttons and ate their clicks). */}
                 <div className="absolute top-2 right-2 flex flex-col gap-2 z-[10000]">
                    <button
                        onClick={() => setShowVariableState(s => !s)}
                        className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                            showVariableState
                                ? 'bg-sky-500/80 border-sky-400/50 text-white shadow-lg shadow-sky-500/20'
                                : 'bg-[var(--bg-primary)]/80 border-[var(--border-default)]/50 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/90 hover:border-slate-400/60'
                        }`}
                        title={t('variableTrackerTip')}
                    >
                        <VariablesIcon className="w-4 h-4 flex-shrink-0" />
                        <span>{t('variableTrackerToggle')}</span>
                    </button>
                    <button
                        onClick={() => setShowCommandIndicators(s => !s)}
                        className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                            showCommandIndicators
                                ? 'bg-sky-500/80 border-sky-400/50 text-white shadow-lg shadow-sky-500/20'
                                : 'bg-[var(--bg-primary)]/80 border-[var(--border-default)]/50 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/90 hover:border-slate-400/60'
                        }`}
                        title={t('eventNotificationsTip')}
                    >
                        {showCommandIndicators ? <EyeIcon className="w-4 h-4 flex-shrink-0" /> : <EyeSlashIcon className="w-4 h-4 flex-shrink-0" />}
                        <span>{t('eventNotificationsToggle')}</span>
                    </button>
                 </div>
                </div>
            </div>
        </Panel>
    );
};

export default StagingArea;
