import { useCanvasZoom } from '../hooks/useCanvasZoom';
import CanvasZoomControls from './ui/CanvasZoomControls';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { VNID, VNPosition, VNTransition, VNPositionPreset, VNContentBox } from '../types';
import type { VNScreenOverlayEffect } from '../types';
import { VNProject } from '../types/project';
import {
    CommandType, ShowCharacterCommand, DialogueCommand, FlashScreenCommand, ChoiceOption,
    ChoiceCommand, SetBackgroundCommand, ShowTextCommand, ShowImageCommand, VNScene, ShowButtonCommand,
    PlayMovieCommand, VNCommand, TextInputCommand, ShowItemCommand, PlaceLightsCommand, VNLight
} from '../features/scene/types';
import { useProject } from '../contexts/ProjectContext';
import ResizableDraggable from './menu-editor/ResizableDraggable';
import CanvasSnapGuides from './menu-editor/CanvasSnapGuides';
import { snapRect, insetRect, SnapGuide, SnapRect } from '../utils/canvasSnap';
import { computeCharacterFitPlacement } from '../utils/characterFit';
import { computeGrade, gradeToBackgroundStyle, gradeToCharacterFilter, gradeToSpriteTint } from './live-preview/systems/dayNightGrade';
import ContentBoxEditor from './menu-editor/ContentBoxEditor';
import { computeAlphaBounds } from '../utils/alphaBounds';
import { resolveCommandCharacterId } from '../utils/playerCharacter';

/** Drag-only marker for positioning a placed light on the scene preview (editor only). */
const LightMarker: React.FC<{ light: VNLight; index: number; onMove: (x: number, y: number) => void }> = ({ light, index, onMove }) => {
    const { t } = useTranslation('staging');
    const onPointerDown = (e: React.PointerEvent) => {
        e.stopPropagation(); e.preventDefault();
        const parent = (e.currentTarget as HTMLElement).parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        const move = (ev: PointerEvent) => {
            const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
            const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
            onMove(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };
    const color = light.type === 'candle' ? '#ffb13b' : (light.color || (light.type === 'star' ? '#ffffff' : '#ff3b3b'));
    return (
        <div
            onPointerDown={onPointerDown}
            title={t('lightMarkerTitle', { type: t('light' + light.type.charAt(0).toUpperCase() + light.type.slice(1)), n: index + 1 })}
            style={{ position: 'absolute', left: `${light.x}%`, top: `${light.y}%`, transform: 'translate(-50%, -50%)', cursor: 'grab', pointerEvents: 'auto', zIndex: 41 }}
        >
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: color, boxShadow: `0 0 10px 3px ${color}`, border: '2px solid rgba(255,255,255,0.95)' }} />
        </div>
    );
};

/** A corner resize grab-handle for a stage overlay. Shared by image / text / hot-spot / button / movie.
 *  When a content `box` is given, the handle sits at the matching corner of the visible content box
 *  (so it's reachable on an image with lots of transparent padding) instead of the element corner. */
const ResizeHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void; title?: string; corner?: 'br' | 'tr' | 'bl' | 'tl'; box?: VNContentBox }> = ({ onMouseDown, title, corner = 'br', box }) => {
    const cursor = (corner === 'br' || corner === 'tl') ? 'nwse-resize' : 'nesw-resize';
    const hasBox = !!box && ((box.left || 0) > 0.005 || (box.top || 0) > 0.005 || (box.right || 0) > 0.005 || (box.bottom || 0) > 0.005);
    let pos: React.CSSProperties;
    if (hasBox && box) {
        const x = corner.includes('l') ? box.left : 1 - box.right;
        const y = corner.includes('t') ? box.top : 1 - box.bottom;
        pos = { left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)' };
    } else {
        pos = corner === 'br' ? { right: -6, bottom: -6 } : corner === 'tr' ? { right: -6, top: -6 } : corner === 'bl' ? { left: -6, bottom: -6 } : { left: -6, top: -6 };
    }
    return <div onMouseDown={onMouseDown} title={title} style={{ position: 'absolute', width: 12, height: 12, borderRadius: 3, background: '#0ea5e9', border: '2px solid #fff', boxShadow: '0 0 3px rgba(0,0,0,0.6)', cursor, zIndex: 60, ...pos }} />;
};
// FIX: VNCondition is not exported from scene/types, but from shared types.
import { VNCondition } from '../types/shared';
import { combineConditions, resolveConditionValue } from '../utils/conditionLogic';
import { stripDialogueTextCodes } from './live-preview/dialogueTextCodes';
import { flattenStagingCommands, CeMeta } from './staging/flattenStagingCommands';
import { normalizeSetVariableOperatorByType, calculateVariableValue, resolveSetVariableValue } from '../utils/variableUtils';
import { VNFontSettings } from '../features/ui/types';
import { VNCharacterLayer } from '../features/character/types';
import { assetArtForPose, characterBaseArtForPose, resolvePoseId } from '../features/character/poseArt';
import { layerBoxStyle, layerOrderForPose, poseHiddenLayerIds, resolveLayerBox, normalizeLayerBox } from '../features/character/layout';
import type { VNLayerBox } from '../features/character/types';

/** Shared canvas composite builder (mirrors the runtime's buildCharacterMedia, images only):
 *  base first, then each layer in POSE ORDER, skipping pose-hidden layers, with the piece's
 *  Pose Studio box parallel to each url. `imageBoxes` is omitted entirely when nothing is
 *  boxed so legacy previews stay pixel-identical. */
const buildStagingComposite = (
    cData: any,
    sel: Record<string, string | null>,
    poseId?: string,
): { imageUrls: string[]; imageBoxes?: Array<VNLayerBox | null> } => {
    const imageUrls: string[] = [];
    const imageBoxes: Array<VNLayerBox | null> = [];
    const base = characterBaseArtForPose(cData, poseId);
    if (base.imageUrl) { imageUrls.push(base.imageUrl); imageBoxes.push(null); }
    const hidden = poseHiddenLayerIds(cData, poseId);
    layerOrderForPose(cData, poseId).forEach((layer: VNCharacterLayer) => {
        if (hidden.has(layer.id)) return;
        const aId = sel[layer.id];
        const asset = aId ? layer.assets[aId] : null;
        const art = asset ? assetArtForPose(asset, poseId) : null;
        if (art?.imageUrl) {
            imageUrls.push(art.imageUrl);
            imageBoxes.push(asset ? (normalizeLayerBox(resolveLayerBox(layer, asset, poseId)) ?? null) : null);
        }
    });
    return { imageUrls, ...(imageBoxes.some(Boolean) ? { imageBoxes } : {}) };
};
import { resolveBoolLabels } from '../features/variables/booleanLabels';
import { compareBand, isBandOperator, formatBandedValue, resolveBand } from '../features/variables/bands';
import { EyeIcon, EyeSlashIcon, FilmIcon, VariablesIcon } from './icons';
import { computeArrangedPositions } from '../utils/characterArrange';
import Panel from './ui/Panel';
import CanvasEdgeFrame from './ui/CanvasEdgeFrame';
import TrimmedVideo from './ui/TrimmedVideo';
import { canvasPointPick, useCanvasPointPick } from '../utils/canvasPointPick';
import { useCommandRadial } from './inspector/CommandRadialContext';
import { fontSettingsToStyle, extractTextGradientStyle, buildTextEffectStyles, buildOrientationTransform, cssFontFamily } from '../utils/styleUtils';
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
import { interpolateVariables, resolveCharacterDisplayName } from '../utils/variableInterpolation';

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
    contentBox?: VNContentBox;
}

interface ButtonOverlay {
    id: VNID;
    layer?: number;
    text: string;
    x: number;
    y: number;
    /** 0-1 anchor (which point of the button sits on x/y); default 0.5 = center. */
    anchorX: number;
    anchorY: number;
    width: number;
    height: number;
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontWeight: string;
    textAlign: 'left' | 'center' | 'right';
    paddingX: number;
    borderRadius: number;
    opacity?: number;
    imageUrl?: string;
    hoverImageUrl?: string;
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    contentBox?: VNContentBox;
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
    contentBox?: VNContentBox;
    /** Resolved per-layer asset selection so SetCharacterLayer can patch one layer in the editor preview. */
    layerSelections?: Record<VNID, VNID | null>;
}

interface StageState {
    backgroundUrl: string | null;
    /** True when backgroundUrl points at a video asset (render <video>, not <img>). */
    backgroundIsVideo?: boolean;
    /** Per-use video trim (seconds) for the base background, mirrored from the SetBackground command. */
    backgroundTrimStart?: number;
    backgroundTrimEnd?: number;
    /** Stacked background planes (SetBackground with `stack`) — shown in editor at their layer. */
    backgroundStack?: { commandId: string; url: string | null; color?: string; parallaxDepth?: number; layer?: number; isVideo?: boolean; trimStart?: number; trimEnd?: number }[];
    characters: Record<VNID, StageCharacterState>;
    textOverlays: TextOverlay[];
    imageOverlays: ImageOverlay[];
    buttonOverlays: ButtonOverlay[];
    hotSpotOverlays: { id: string; name: string; x: number; y: number; width: number; height: number; shape: 'rect' | 'circle'; trigger: string; visible?: boolean; highlightColor?: string; rotation?: number; flipX?: boolean; flipY?: boolean }[];
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
        trimStart?: number;
        trimEnd?: number;
    } | null;
    flash: { color: string } | null;
    choices: ChoiceOption[] | null;
    choiceLayout?: 'vertical' | 'horizontal' | 'free';
    choiceCommandId?: string | null;
    textInput: { prompt: string; placeholder?: string } | null;
    commandIndicator: { type: string; details: string } | null;
    variables: Record<string, string | number | boolean>;
}

/** Editor-only chip on elements a Call Common Event puts on stage — tells the author this
 *  element lives in a SHARED event (edits here change every scene that calls it). */
const CeBadge: React.FC<{ name: string }> = ({ name }) => (
    <span
        className="absolute -top-2.5 -left-2.5 z-[70] pointer-events-none px-1 py-[1px] rounded bg-violet-600/90 text-white text-[9px] leading-tight shadow whitespace-nowrap max-w-[160px] truncate"
        aria-hidden
    >
        🧩 {name}
    </span>
);

/** Dashed violet outline marking an event-owned element (pairs with CeBadge). */
const CE_OUTLINE_STYLE: React.CSSProperties = { outline: '1px dashed rgba(167,139,250,0.85)', outlineOffset: 2 };

const StagingArea: React.FC<{
    project: VNProject;
    activeSceneId: VNID;
    selectedCommandIndex: number | null;
    className?: string;
    style?: React.CSSProperties;
    /** Chromeless: render just the stage (no surrounding Panel header) — used by the popped-out canvas window. */
    bare?: boolean;
    /** Optional: select a command by index when its overlay is grabbed on the canvas (click-to-select). */
    onSelectCommand?: (index: number | null) => void;
    /** Optional: deep link into the Common Events tab (double-click on an event-owned element).
     *  Omitted by the popped-out canvas window, where tab switching isn't possible. */
    onOpenCommonEvent?: (eventId: VNID, commandIndex: number) => void;
}> = ({ project, activeSceneId, selectedCommandIndex, className, style, bare, onSelectCommand, onOpenCommonEvent }) => {
    const { dispatch } = useProject();
    const { t } = useTranslation('staging');
    const commandRadial = useCommandRadial();
    const [showCommandIndicators, setShowCommandIndicators] = React.useState(true);
    const [showVariableState, setShowVariableState] = React.useState(false);
    // Canvas point-picker (Move Character "pick A/B on canvas"): when armed, an overlay intercepts
    // the next stage click and writes the {x,y}% back to the command field; Esc cancels.
    const activePick = useCanvasPointPick();
    React.useEffect(() => {
        if (!activePick) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') canvasPointPick.cancel(); };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [activePick]);
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
    // Canvas zoom (1 = fit the panel) — shared with the screens canvas via useCanvasZoom.
    // Multiplied INTO stageSize so every consumer (drag math, font scale, previews) scales together.
    const zoomCtl = useCanvasZoom(containerRef);
    const stageZoom = zoomCtl.zoom;
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

    // Provenance of elements spliced in from Common Events (keyed by producing command id).
    // Drives the badge, parent-call selection, and write-back into the shared event.
    const [ceMeta, setCeMeta] = React.useState<Record<string, CeMeta>>({});

    // Track stage size for proper scaling — measure the parent container and compute
    // the largest stage that fits while preserving the game's aspect ratio.
    React.useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        
        const measure = () => {
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
                // Zoom scales the fitted size; >1 overflows the panel, which scrolls.
                setStageSize({ width: Math.round(w * stageZoom), height: Math.round(h * stageZoom) });
            }
        };
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        measure();
        return () => observer.disconnect();
    }, [project.gameResolution, stageZoom]);

    React.useEffect(() => {
        const scene = project.scenes[activeSceneId];
        if (!scene) {
            setStageState({
                backgroundUrl: null, characters: {}, textOverlays: [], imageOverlays: [], buttonOverlays: [], hotSpotOverlays: [],
                screen: { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0, overlayEffects: [] },
                dialogue: null, movie: null, flash: null, choices: null, textInput: null, commandIndicator: null, variables: {},
            });
            setCeMeta({});
            return;
        }

        const evaluateConditions = (conditions: VNCondition[] | undefined, currentVariables: StageState['variables']): boolean => {
            if (!conditions || conditions.length === 0) return true;
            return combineConditions(conditions, condition => {
                const varValue = currentVariables[condition.variableId];
                const projectVar = project.variables[condition.variableId];
                const effectiveVarValue = varValue !== undefined ? varValue : (projectVar ? projectVar.defaultValue : undefined);
                if (effectiveVarValue === undefined) return false;
                if (isBandOperator(condition.operator)) {
                    return compareBand(projectVar, effectiveVarValue, String(condition.value), condition.operator);
                }
                // Compare-to-variable: the other side may be another variable's current value
                // (same missing→default fallback as the checked variable); dangling → literal.
                const cmpValue = condition.compareVariableId !== undefined
                    ? resolveConditionValue(condition, {
                        [condition.compareVariableId]:
                            currentVariables[condition.compareVariableId]
                            ?? project.variables[condition.compareVariableId]?.defaultValue,
                    })
                    : condition.value;
                switch (condition.operator) {
                    case 'is true': return !!effectiveVarValue;
                    case 'is false': return !effectiveVarValue;
                    case '==': return String(effectiveVarValue).toLowerCase() == String(cmpValue).toLowerCase();
                    case '!=': return String(effectiveVarValue).toLowerCase() != String(cmpValue).toLowerCase();
                    case '>': return Number(effectiveVarValue) > Number(cmpValue);
                    case '<': return Number(effectiveVarValue) < Number(cmpValue);
                    case '>=': return Number(effectiveVarValue) >= Number(cmpValue);
                    case '<=': return Number(effectiveVarValue) <= Number(cmpValue);
                    case 'contains': return String(effectiveVarValue).toLowerCase().includes(String(cmpValue).toLowerCase());
                    case 'startsWith': return String(effectiveVarValue).toLowerCase().startsWith(String(cmpValue).toLowerCase());
                    default: return false;
                }
            });
        };

        // Initialize states
        let backgroundUrl: string | null = null;
        let backgroundIsVideo = false;
        let backgroundTrimStart: number | undefined;
        let backgroundTrimEnd: number | undefined;
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
        // Call Common Event commands expand INLINE (the runtime behavior), so an event's visual
        // elements show up on the canvas and can be arranged here instead of edited blind in the
        // Common Events tab. Each expanded command carries provenance (which event, which scene
        // call) — collected into ceMeta for selection, write-back and the badge.
        const flatEntries = flattenStagingCommands(scene.commands.slice(0, endIndex), project.commonEvents as any);
        const nextCeMeta: Record<string, CeMeta> = {};
        for (const entry of flatEntries) {
            if (entry.ce) nextCeMeta[entry.cmd.id] = entry.ce;
        }

        // Process commands up to the selected one to build the stage's state
        flatEntries.forEach((entry) => {
            // Loosely typed on purpose — the switch below predates strict narrowing and reads
            // per-type fields directly (exactly as the previous `activeCommands` walk did).
            const command = entry.cmd as any;
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
                            { commandId: command.id, url: resolvedBgUrl, color: command.backgroundColor, parallaxDepth: command.parallaxDepth, layer: command.layer, isVideo: bgIsVid, trimStart: (command as any).trimStart, trimEnd: (command as any).trimEnd },
                        ];
                    } else {
                        backgroundUrl = resolvedBgUrl;
                        backgroundIsVideo = bgIsVid;
                        backgroundTrimStart = (command as any).trimStart;
                        backgroundTrimEnd = (command as any).trimEnd;
                    }
                    break;
                }
                case CommandType.ShowCharacter: {
                    // Mirror the runtime handler's resilience (characterHandler.ts): resolve
                    // ⟨Player's Character⟩ to whoever the player variable points at (else the
                    // command's own character), and fall back to the character's FIRST expression
                    // when the stored expressionId doesn't belong to this character. Without these,
                    // a Show Character that renders fine in-game silently vanished from the canvas.
                    const showCharId = resolveCommandCharacterId(command as any, project, currentVariables) || command.characterId;
                    const charData = project.characters[showCharId];
                    const exprData = charData
                        ? (charData.expressions[command.expressionId] || Object.values(charData.expressions)[0])
                        : undefined;
                    if (charData && exprData) {
                        // Resolve each layer: per-layer override wins, else the expression (preset) config.
                        const sel: Record<string, string | null> = {};
                        const prevChar = characters[showCharId];
                        Object.values(charData.layers).forEach((layer: VNCharacterLayer) => {
                            if (command.layerOverrides && Object.prototype.hasOwnProperty.call(command.layerOverrides, layer.id)) sel[layer.id] = command.layerOverrides[layer.id] || null;
                            else if (Object.prototype.hasOwnProperty.call(exprData.layerConfiguration, layer.id)) sel[layer.id] = exprData.layerConfiguration[layer.id] ?? null;
                            // Preserve accessory layers the expression doesn't define (e.g. a hat added via
                            // Set Character Layer) — mirrors the runtime so the canvas doesn't drop them on a flip.
                            else if ((prevChar as any)?.layerSelections && Object.prototype.hasOwnProperty.call((prevChar as any).layerSelections, layer.id)) sel[layer.id] = (prevChar as any).layerSelections[layer.id];
                            else sel[layer.id] = null;
                        });
                        // Pose-aware art + Pose Studio layout (mirrors the runtime).
                        const showPoseId = resolvePoseId(charData, command.poseId);
                        const { imageUrls, imageBoxes } = buildStagingComposite(charData, sel, showPoseId);
                        // "Keep current position": if the character is already on stage and the command
                        // opts in, preview it at its existing position (mirrors the runtime handler) so the
                        // author sees an expression change stay put instead of snapping to center.
                        const keptPosition = command.keepPosition && characters[showCharId]
                            ? characters[showCharId].position
                            : command.position;
                        characters[showCharId] = { charId: showCharId, layer: command.layer, position: keptPosition, imageUrls, ...(imageBoxes ? { imageBoxes } : {}), transition: command.transition, sourceCommandId: command.id, scale: command.scale, inverted: command.inverted, rotation: command.rotation, flipY: command.flipY, contentBox: command.contentBox, layerSelections: sel, ...(showPoseId ? { poseId: showPoseId } : {}) } as any;
                    }
                    break;
                }
                case CommandType.HideCharacter: {
                    // Same ⟨Player's Character⟩ resolution as Show — hide must find the same slot.
                    const hideCharId = resolveCommandCharacterId(command as any, project, currentVariables) || command.characterId;
                    delete characters[hideCharId];
                    break;
                }
                case CommandType.MoveCharacter: {
                    // Mirror the runtime: a Move Character updates where the character RESTS, so a later
                    // "Show Character" with "Keep current position" inherits the moved-to spot instead of
                    // snapping back to the pre-move position.
                    const moveCharId = resolveCommandCharacterId(command as any, project, currentVariables) || command.characterId;
                    const mc = characters[moveCharId];
                    if (mc) {
                        // When the author is editing THIS move, the on-canvas character must belong to the
                        // move command so dragging it sets the move's DESTINATION (point B) — not the
                        // original Show Character's position (which would "reset" where the char starts).
                        const isSelectedMove = selectedCommandIndex !== null && scene.commands[selectedCommandIndex]?.id === command.id;
                        characters[moveCharId] = {
                            ...mc,
                            position: command.toPosition,
                            ...(command.scale !== undefined ? { scale: command.scale } : {}),
                            ...(command.rotation !== undefined ? { rotation: command.rotation } : {}),
                            ...(isSelectedMove ? { sourceCommandId: command.id } : {}),
                        };
                    }
                    break;
                }
                case CommandType.SetCharacterLayer: {
                    const layerCharId = resolveCommandCharacterId(command as any, project, currentVariables) || command.characterId;
                    const cur = characters[layerCharId];
                    const cData = project.characters[layerCharId];
                    if (cur && cData) {
                        const sel: Record<string, string | null> = { ...((cur as any).layerSelections || {}) };
                        (command.layers || []).forEach(({ layerId, assetId }) => { sel[layerId] = assetId || null; });
                        // Rebuild in the character's CURRENT pose (mirrors the runtime handler).
                        const curPoseId = resolvePoseId(cData, (cur as any).poseId);
                        const { imageUrls, imageBoxes } = buildStagingComposite(cData, sel, curPoseId);
                        characters[layerCharId] = { ...cur, imageUrls, imageBoxes, layerSelections: sel } as any;
                    }
                    break;
                }
                case CommandType.SetCharacterPose: {
                    // Change Pose: same outfit/expression/position, new art (mirrors the runtime handler).
                    const poseCharId = resolveCommandCharacterId(command as any, project, currentVariables) || command.characterId;
                    const cur = characters[poseCharId];
                    const cData = project.characters[poseCharId];
                    if (cur && cData) {
                        const newPoseId = resolvePoseId(cData, (command as any).poseId);
                        const sel: Record<string, string | null> = { ...((cur as any).layerSelections || {}) };
                        const { imageUrls, imageBoxes } = buildStagingComposite(cData, sel, newPoseId);
                        characters[poseCharId] = { ...cur, imageUrls, imageBoxes, ...(newPoseId ? { poseId: newPoseId } : { poseId: undefined }) } as any;
                    }
                    break;
                }
                case CommandType.SetVariable:
                    const variable = project.variables[command.variableId];
                    if (variable) {
                        const currentVal = currentVariables[command.variableId];
                        const isRandomOp = command.operator === 'random' || command.operator === 'addRandom' || command.operator === 'subtractRandom';
                        let newVal: string | number | boolean;
                        if (isRandomOp) {
                            // Stage preview is a deterministic walk — rolling here would make the
                            // preview flicker to a new number on every recompute. Keep the old
                            // behavior for random ops (the typed value, coerced).
                            newVal = variable.type === 'number' ? Number(command.value) || 0
                                : variable.type === 'boolean' ? String(command.value).toLowerCase() === 'true'
                                : String(command.value);
                        } else {
                            // Shared engine math (was a hand-rolled duplicate that lacked clamping
                            // and would have diverged on from-a-variable / calculation values).
                            const { effectiveOperator, wasCoerced } = normalizeSetVariableOperatorByType(variable.type, variable.name, command.operator);
                            const changeValue = resolveSetVariableValue(command, currentVariables);
                            newVal = calculateVariableValue(
                                effectiveOperator, variable.type, currentVal, changeValue,
                                command.randomMin, command.randomMax,
                                wasCoerced ? command.operator : undefined,
                                (variable as any).min, (variable as any).max
                            );
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
                        fontSize: command.fontSize, fontFamily: cssFontFamily(command.fontFamily), color: command.color,
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
                            contentBox: command.contentBox,
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
                            anchorX: buttonCmd.anchorX ?? 0.5,
                            anchorY: buttonCmd.anchorY ?? 0.5,
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
                            contentBox: buttonCmd.contentBox,
                        });
                    }
                    break;
                case CommandType.ShowItem:
                    if (evaluateConditions(command.showConditions, currentVariables)) {
                        const itemCmd = command as ShowItemCommand;
                        const item = project.items?.[itemCmd.itemId];
                        // Default the on-canvas visual to the item's registry icon; an
                        // explicit image override wins. Resolve the SAME way the runtime does.
                        const visual = itemCmd.image || item?.icon || null;
                        const resolveItemAsset = (asset?: { type: 'image' | 'video'; id: VNID } | null): string | undefined => {
                            if (!asset?.id) return undefined;
                            const id = asset.id;
                            return project.backgrounds[id]?.videoUrl || project.backgrounds[id]?.imageUrl ||
                                   project.images?.[id]?.videoUrl || project.images?.[id]?.imageUrl ||
                                   project.videos[id]?.videoUrl || undefined;
                        };
                        buttonOverlays.push({
                            id: itemCmd.id,
                            layer: itemCmd.layer,
                            text: '',
                            x: itemCmd.x,
                            y: itemCmd.y,
                            anchorX: itemCmd.anchorX ?? 0.5,
                            anchorY: itemCmd.anchorY ?? 0.5,
                            width: itemCmd.width || 10,
                            height: itemCmd.height || 10,
                            backgroundColor: 'transparent',
                            textColor: '#ffffff',
                            fontSize: 0,
                            fontWeight: 'normal',
                            textAlign: 'center',
                            paddingX: 0,
                            borderRadius: 0,
                            opacity: itemCmd.opacity,
                            imageUrl: resolveItemAsset(visual),
                            hoverImageUrl: resolveItemAsset(itemCmd.hoverImage),
                            rotation: itemCmd.rotation, flipX: itemCmd.flipX, flipY: itemCmd.flipY,
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
                            rotation: (command as any).rotation, flipX: (command as any).flipX, flipY: (command as any).flipY,
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
                    // {Variable} names preview resolved, same variables view the text preview uses.
                    // Editor stage preview is static: strip [pause] codes; prefix appended parts
                    // with "…" so the author sees it continues the previous line.
                    dialogue = { characterName: resolveCharacterDisplayName(char?.name, currentVariables, project) || 'Narrator', characterColor: char?.color || '#FFFFFF', characterId: currentCommand.characterId || null, text: `${(currentCommand as any).append ? '… ' : ''}${stripDialogueTextCodes(currentCommand.text)}` };
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
                        trimStart: (movieCmd as any).trimStart,
                        trimEnd: (movieCmd as any).trimEnd,
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

        setStageState({ backgroundUrl, backgroundIsVideo, backgroundTrimStart, backgroundTrimEnd, backgroundStack, characters, textOverlays, imageOverlays, buttonOverlays, hotSpotOverlays, screen, dialogue, movie, flash, choices, choiceLayout, choiceCommandId, textInput, commandIndicator, variables: currentVariables });
        setCeMeta(nextCeMeta);

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
        /** The element's TRUE on-screen rect (stage %, top-left) measured at drag start. Used for
         *  snapping so the alignment guide sits at the real visible centre regardless of scale /
         *  transform-origin (the analytical scale math drifted). Translated by the drag delta. */
        startVisualRect?: { x: number; y: number; width: number; height: number };
    } | null>(null);
    const [overlayDragOffset, setOverlayDragOffset] = useState<{ x: number; y: number } | null>(null);
    // Latest live drag offset, mirrored in a ref so the commit (onUp) reads it WITHOUT
    // `overlayDragOffset` being a dep of the drag effect — otherwise the window listeners are
    // re-attached every mousemove (per-move churn during a drag).
    const overlayDragOffsetRef = useRef<{ x: number; y: number } | null>(null);

    // --- Resize (scale) State ---
    const [overlayResize, setOverlayResize] = useState<{
        kind: DragKind;
        overlayId: string;
        sourceCommandId: string;
        startMouseX: number;
        startMouseY: number;
        startW: number;
        startH: number;
        /** Which handle is being dragged (e.g. 'br','tl','tr','bl'); drives the grow direction. */
        corner?: string;
    } | null>(null);
    const [overlayResizeSize, setOverlayResizeSize] = useState<{ width: number; height: number } | null>(null);
    // Latest live resize size, mirrored in a ref so the commit (onUp) can read it WITHOUT
    // `overlayResizeSize` being a dependency of the resize effect — otherwise the window
    // mouse listeners are torn down and re-attached on every single mousemove (per-move jank
    // that makes a resize drag feel slow, especially with many sprites on stage).
    const overlayResizeSizeRef = useRef<{ width: number; height: number } | null>(null);

    // Grab-to-select: when an overlay/character is grabbed, select its command (so the inspector
    // follows and the resize handles appear) — without needing to click it in the command list first.
    const selectBySourceId = useCallback((sourceCommandId: string) => {
        if (!onSelectCommand) return;
        const cmds = project.scenes[activeSceneId]?.commands || [];
        const idx = cmds.findIndex((c: VNCommand) => c.id === sourceCommandId);
        if (idx >= 0) { onSelectCommand(idx); return; }
        // Common-event elements aren't in the scene list — select their parent Call command instead.
        const callId = ceMeta[sourceCommandId]?.callCommandId;
        if (!callId) return;
        const callIdx = cmds.findIndex((c: VNCommand) => c.id === callId);
        if (callIdx >= 0) onSelectCommand(callIdx);
    }, [onSelectCommand, project.scenes, activeSceneId, ceMeta]);

    // Measure a DOM element's true on-screen rect in stage-% (top-left). Ground truth for snapping —
    // immune to the character scale/transform-origin math that made the analytical centre drift.
    const measureStageRect = useCallback((el: HTMLElement): { x: number; y: number; width: number; height: number } | undefined => {
        const stage = stageRef.current;
        if (!stage) return undefined;
        const sr = stage.getBoundingClientRect();
        if (!sr.width || !sr.height) return undefined;
        const r = el.getBoundingClientRect();
        return { x: ((r.left - sr.left) / sr.width) * 100, y: ((r.top - sr.top) / sr.height) * 100, width: (r.width / sr.width) * 100, height: (r.height / sr.height) * 100 };
    }, []);

    const handleOverlayResizeMouseDown = useCallback((e: React.MouseEvent, kind: DragKind, overlayId: string, width: number, height: number, sourceCommandId?: string, corner?: string) => {
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
            corner,
        });
        setOverlayResizeSize(null);
    }, []);

    const handleCharMouseDown = useCallback((e: React.MouseEvent, char: StageCharacterState) => {
        if (!char.sourceCommandId) return;
        // When a content box is set, only the VISIBLE region grabs the sprite — clicking the
        // transparent padding outside the box does nothing (so it can't be moved by accident).
        const cb = char.contentBox;
        if (cb && (cb.left > 0.005 || cb.top > 0.005 || cb.right > 0.005 || cb.bottom > 0.005)) {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
                if (fx < cb.left || fx > 1 - cb.right || fy < cb.top || fy > 1 - cb.bottom) return;
            }
        }
        e.preventDefault();
        e.stopPropagation();
        selectBySourceId(char.sourceCommandId);
        const isCustom = typeof char.position === 'object';
        const presetToCoords: Record<string, { x: number; y: number }> = {
            'left': { x: 25, y: 10 }, 'center': { x: 50, y: 10 }, 'right': { x: 75, y: 10 },
            'off-left': { x: -25, y: 10 }, 'off-right': { x: 125, y: 10 },
        };
        let startPos = isCustom
            ? (char.position as { x: number; y: number })
            : (presetToCoords[char.position as string] || { x: 50, y: 10 });
        // Preset positions render CENTER-anchored (transform: translateX(-50%)), but the drag — and
        // the custom {x,y} position it commits — render LEFT-EDGE-anchored. Without converting, the
        // sprite jumps sideways by half its width the instant the drag starts (the "flicker").
        // Convert the preset centre-x to the sprite's actual left-edge-x using its rendered width.
        if (!isCustom && stageSize.width > 0) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const halfWidthPct = (rect.width / stageSize.width) * 100 / 2;
            startPos = { x: startPos.x - halfWidthPct, y: startPos.y };
        }
        setOverlayDrag({
            kind: 'character',
            overlayId: char.charId,
            sourceCommandId: char.sourceCommandId,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startPosX: startPos.x,
            startPosY: startPos.y,
            startVisualRect: measureStageRect(e.currentTarget as HTMLElement),
        });
        setOverlayDragOffset(null);
    }, [stageSize, selectBySourceId, measureStageRect]);

    const handleOverlayMouseDown = useCallback((e: React.MouseEvent, kind: DragKind, id: string, x: number, y: number, cb?: VNContentBox) => {
        // Content box set → only the visible region grabs the element (transparent padding ignored).
        if (cb && (cb.left > 0.005 || cb.top > 0.005 || cb.right > 0.005 || cb.bottom > 0.005)) {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
                if (fx < cb.left || fx > 1 - cb.right || fy < cb.top || fy > 1 - cb.bottom) return;
            }
        }
        e.preventDefault();
        e.stopPropagation();
        selectBySourceId(id);
        setOverlayDrag({
            kind,
            overlayId: id,
            sourceCommandId: id,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startPosX: x,
            startPosY: y,
            startVisualRect: measureStageRect(e.currentTarget as HTMLElement),
        });
        setOverlayDragOffset(null);
    }, [selectBySourceId, measureStageRect]);

    // Start a resize from the element's CURRENTLY RENDERED size (in %), measured from the DOM.
    // Used for image/text overlays whose stored size is px (or 'auto' for text) — measuring keeps
    // the box from jumping on the first resize and works for auto-sized text.
    const startMeasuredResize = useCallback((e: React.MouseEvent, kind: DragKind, id: string, corner?: string) => {
        const el = (e.currentTarget as HTMLElement).parentElement;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const wPct = (r.width / (stageSize.width || 1)) * 100;
        const hPct = (r.height / (stageSize.height || 1)) * 100;
        handleOverlayResizeMouseDown(e, kind, id, wPct, hPct, id, corner);
    }, [stageSize, handleOverlayResizeMouseDown]);

    // ── The ONE command-by-id write path ─────────────────────────────────────────────────
    // Canvas elements can come from the scene OR be spliced in from a Common Event (the
    // Call Common Event expansion). Every canvas edit resolves the producing command by id —
    // scenes first, then common events — and dispatches through the matching reducer action.
    // Editing an event-owned element edits the SHARED event (owner decision): the change
    // shows everywhere the event is used.
    const resolveCommandById = useCallback((commandId: string):
        | { kind: 'scene'; sceneId: VNID; index: number; command: VNCommand }
        | { kind: 'ce'; commonEventId: VNID; index: number; command: VNCommand }
        | null => {
        for (const scene of Object.values(project.scenes) as VNScene[]) {
            const idx = scene.commands.findIndex((c: VNCommand) => c.id === commandId);
            if (idx >= 0) return { kind: 'scene', sceneId: scene.id, index: idx, command: scene.commands[idx] };
        }
        for (const ce of Object.values((project.commonEvents || {}) as Record<string, { id: VNID; commands: VNCommand[] }>)) {
            const idx = (ce.commands || []).findIndex((c: VNCommand) => c.id === commandId);
            if (idx >= 0) return { kind: 'ce', commonEventId: ce.id, index: idx, command: ce.commands[idx] };
        }
        return null;
    }, [project.scenes, project.commonEvents]);

    const applyCommandUpdate = useCallback((commandId: string, updates: Record<string, unknown>) => {
        const found = resolveCommandById(commandId);
        if (!found) return;
        if (found.kind === 'scene') {
            dispatch({ type: 'UPDATE_COMMAND', payload: { sceneId: found.sceneId, commandIndex: found.index, command: { ...found.command, ...updates } } });
        } else {
            dispatch({ type: 'UPDATE_COMMON_EVENT_COMMAND', payload: { commonEventId: found.commonEventId, commandIndex: found.index, updates } });
        }
    }, [resolveCommandById, dispatch]);

    // Commit a character's scale (used by the Fit-to-screen toolbar) — one dispatch = one undo step.
    const commitCharScale = useCallback((sourceCommandId: string, scale: number) => {
        applyCommandUpdate(sourceCommandId, { scale });
    }, [applyCommandUpdate]);

    // Fit-to-screen: set scale AND a custom position so the visible content fills the screen and stays
    // on it (planted at the floor, centred). Converts a preset character to a custom {x,y} position.
    const commitCharFit = useCallback((sourceCommandId: string, mode: 'height' | 'width', box?: VNContentBox) => {
        const placement = computeCharacterFitPlacement(mode, stageSize, box);
        applyCommandUpdate(sourceCommandId, { scale: placement.scale, position: { x: placement.x, y: placement.y } });
    }, [applyCommandUpdate, stageSize]);

    // Content box (visible/interactive sub-region) commit + auto-trim, by command id.
    const commitContentBox = useCallback((sourceCommandId: string, box: VNContentBox | undefined) => {
        applyCommandUpdate(sourceCommandId, { contentBox: box });
    }, [applyCommandUpdate]);
    const trimContentBox = useCallback(async (sourceCommandId: string, imageUrl: string | undefined, boxAspect: number) => {
        if (!imageUrl) return;
        const box = await computeAlphaBounds(imageUrl, { boxAspect });
        if (box) commitContentBox(sourceCommandId, box);
    }, [commitContentBox]);

    // Live alignment-guide lines drawn during a drag/resize (smart snapping). Cleared on release.
    const [overlaySnapGuides, setOverlaySnapGuides] = useState<SnapGuide[]>([]);
    // Smart-snap toggle (editor-only UI pref; default ON). Hold Alt to bypass per-interaction.
    const [snapEnabled, setSnapEnabled] = useState(false);
    // Collapse the canvas-corner button stack (Snap/HUD/Variables/Notifications) — it can sit
    // right on top of art the author is aligning. Persisted per machine.
    const [chromeCollapsed, setChromeCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('flourish:stagingChromeCollapsed') === '1'; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem('flourish:stagingChromeCollapsed', chromeCollapsed ? '1' : '0'); } catch { /* ignore */ }
    }, [chromeCollapsed]);
    // Show the game HUD's click-capturing areas on the scene canvas (default ON) — an always-on
    // HUD renders over every scene in-game, so an author's scene hotspot placed underneath one
    // silently loses the click. Persisted per user.
    const [showHudOverlays, setShowHudOverlays] = useState<boolean>(() => {
        try { return localStorage.getItem('flourish:stagingShowHudOverlays') !== 'off'; } catch { return true; }
    });
    const toggleHudOverlays = () => setShowHudOverlays(s => {
        try { localStorage.setItem('flourish:stagingShowHudOverlays', s ? 'off' : 'on'); } catch { /* ignore */ }
        return !s;
    });
    // The game HUD's interactive (click-capturing) elements: hotspots, buttons, and
    // draggable/interactive elements. Rendered as faint outlines so overlaps are visible.
    const hudInteractiveElements = React.useMemo(() => {
        const hudId = project.ui?.gameHudScreenId;
        const hud = hudId ? project.uiScreens?.[hudId] : null;
        if (!hud) return [];
        return (Object.values(hud.elements || {}) as any[]).filter(el =>
            el.type === 'HotSpot' || el.type === 'Button' || el.type === 'draggableImageElement'
            || el.interactive === true || el.draggable === true
        );
    }, [project.ui?.gameHudScreenId, project.uiScreens]);

    // Top-left-% rect + anchor for every snappable overlay, keyed by command id. Used both as the
    // sibling set for alignment snapping and to convert a dragged overlay's anchor → top-left.
    // Characters are intentionally excluded (their bottom-centre anchor + 90%/aspect sizing makes a
    // reliable rect fragile, and their carefully-tuned drag must not regress).
    // For each overlay: `rect` = the trimmed CONTENT rect at the current position (used as a snap
    // SIBLING); `fullW/fullH/anchor/box` describe the full element so a DRAGGED overlay can be snapped
    // by its content rect and the positional delta applied back to its stored coord.
    type OverlayMetaEntry = { rect: SnapRect; fullW: number; fullH: number; anchor: 'center' | 'topleft'; box?: VNContentBox };
    const overlayMeta = React.useMemo(() => {
        const map = new Map<string, OverlayMetaEntry>();
        const RW = 1280, RH = 720;
        const add = (id: string, fullX: number, fullY: number, w: number, h: number, anchor: 'center' | 'topleft', box?: VNContentBox) => {
            map.set(id, { rect: insetRect({ x: fullX, y: fullY, width: w, height: h }, box), fullW: w, fullH: h, anchor, box });
        };
        for (const o of stageState.textOverlays) {
            const w = o.width ? (o.width / RW) * 100 : 0;
            const h = o.height ? (o.height / RH) * 100 : 0;
            add(o.id, o.x - w / 2, o.y - h / 2, w, h, 'center');
        }
        for (const o of stageState.imageOverlays) {
            const w = (o.width / RW) * 100, h = (o.height / RH) * 100;
            add(o.id, o.x - w / 2, o.y - h / 2, w, h, 'center', o.contentBox);
        }
        for (const b of stageState.buttonOverlays) {
            add(b.id, b.x - b.width / 2, b.y - b.height / 2, b.width, b.height, 'center', b.contentBox);
        }
        for (const hs of stageState.hotSpotOverlays) {
            add(hs.id, hs.x, hs.y, hs.width, hs.height, 'topleft');
        }
        const m = stageState.movie;
        if (m && m.objectFit === 'custom' && m.sourceCommandId) {
            add(m.sourceCommandId, m.x ?? 0, m.y ?? 0, m.width ?? 0, m.height ?? 0, 'topleft');
        }
        return map;
    }, [stageState]);

    // Character snap rects (keyed by charId), in % top-left. Characters render at 90%×scale of stage
    // height with a 3:4 aspect, so width/height derive from scale. y is approximate (bottom-anchored);
    // characters snap on the X axis only, so y is used only for guide spans. Left-edge x mirrors
    // handleCharMouseDown (preset centre → left edge via the computed width).
    const characterRects = React.useMemo(() => {
        const map = new Map<string, { rect: SnapRect; fullW: number; fullH: number; leftX: number; box?: VNContentBox }>();
        const sw = stageSize.width || 1, sh = stageSize.height || 1;
        const presetCenters: Record<string, number> = { 'left': 25, 'center': 50, 'right': 75, 'off-left': -25, 'off-right': 125 };
        for (const ch of Object.values(stageState.characters) as StageCharacterState[]) {
            const scale = ch.scale ?? 1;
            const heightPct = 90 * scale;
            const widthPct = ((0.9 * sh * scale * 0.75) / sw) * 100;
            const leftX = typeof ch.position === 'object'
                ? (ch.position as { x: number }).x
                : (presetCenters[ch.position as string] ?? 50) - widthPct / 2;
            // Visual top: the sprite is a 90%-height box scaled around its bottom-centre, so
            // visualTop = layoutTop + (90 - scaledHeight). layoutTop = position.y (custom) or 10 (preset).
            const layoutTop = typeof ch.position === 'object' ? (ch.position as { y: number }).y : 10;
            const topY = layoutTop + (90 - heightPct);
            const full = { x: leftX, y: topY, width: widthPct, height: heightPct };
            map.set(ch.charId, { rect: insetRect(full, ch.contentBox), fullW: widthPct, fullH: heightPct, leftX, box: ch.contentBox });
        }
        return map;
    }, [stageState.characters, stageSize]);

    useEffect(() => {
        if (!overlayDrag) return;
        const sw = stageSize.width || 1;
        const sh = stageSize.height || 1;
        const SNAP = 5;
        // Measure EVERY element's true on-screen rect once at drag start (stage %), keyed by id, so
        // both the guides and the snap targets match what's actually rendered (the analytical char
        // rects drift with scale). Inset each by its content box so we align by the VISIBLE region.
        const boxFor = (id: string) => overlayMeta.get(id)?.box ?? characterRects.get(id)?.box;
        const measuredRects = new Map<string, SnapRect>();
        const stageEl = stageRef.current;
        if (stageEl) {
            const sr = stageEl.getBoundingClientRect();
            if (sr.width && sr.height) {
                stageEl.querySelectorAll('[data-vn-id]').forEach(el => {
                    const id = (el as HTMLElement).dataset.vnId;
                    if (!id) return;
                    const r = (el as HTMLElement).getBoundingClientRect();
                    measuredRects.set(id, { x: ((r.left - sr.left) / sr.width) * 100, y: ((r.top - sr.top) / sr.height) * 100, width: (r.width / sr.width) * 100, height: (r.height / sr.height) * 100 });
                });
            }
        }
        // Sibling content rects (measured ∪ analytical fallback), excluding the dragged element.
        const siblings: SnapRect[] = [];
        if (measuredRects.size > 0) {
            measuredRects.forEach((rect, id) => { if (id !== overlayDrag.overlayId) siblings.push(insetRect(rect, boxFor(id))); });
        } else {
            overlayMeta.forEach((v, key) => { if (key !== overlayDrag.overlayId) siblings.push(v.rect); });
            characterRects.forEach((r, key) => { if (key !== overlayDrag.overlayId) siblings.push(r.rect); });
        }
        const meta = overlayMeta.get(overlayDrag.overlayId);
        const measuredSelf = measuredRects.get(overlayDrag.overlayId);
        const onMove = (e: MouseEvent) => {
            const dx = ((e.clientX - overlayDrag.startMouseX) / sw) * 100;
            const dy = ((e.clientY - overlayDrag.startMouseY) / sh) * 100;
            let nx = overlayDrag.startPosX + dx;
            let ny = overlayDrag.startPosY + dy;
            if (e.shiftKey) {
                // Legacy coarse grid (muscle memory) — takes precedence over smart snap.
                nx = Math.round(nx / SNAP) * SNAP;
                ny = Math.round(ny / SNAP) * SNAP;
                setOverlaySnapGuides([]);
            } else if (snapEnabled && !e.altKey && (measuredSelf || overlayDrag.startVisualRect)) {
                // Snap by the element's TRUE on-screen rect (measured at drag start, translated by the
                // drag delta) — exact centre regardless of scale / transform-origin. Siblings are
                // measured too (above), so the guides + snap line up with what's actually rendered.
                const svr = measuredSelf || overlayDrag.startVisualRect!;
                const box = boxFor(overlayDrag.overlayId);
                const visual = { x: svr.x + dx, y: svr.y + dy, width: svr.width, height: svr.height };
                const content = insetRect(visual, box);
                const res = snapRect(content, siblings, { mode: 'move' });
                nx += res.rect.x - content.x;
                ny += res.rect.y - content.y;
                setOverlaySnapGuides(res.guides.map(g => ({ ...g, span: undefined })));
            } else if (snapEnabled && !e.altKey && overlayDrag.kind === 'character') {
                // Fallback (no measured rect): analytical visible content rect.
                const dragged = characterRects.get(overlayDrag.overlayId);
                const fullW = dragged?.fullW ?? 0, fullH = dragged?.fullH ?? 0;
                const charSiblings: SnapRect[] = [];
                overlayMeta.forEach(v => charSiblings.push(v.rect));
                characterRects.forEach((r, k) => { if (k !== overlayDrag.overlayId) charSiblings.push(r.rect); });
                const visualTop = ny + 90 - fullH;
                const content = insetRect({ x: nx, y: visualTop, width: fullW, height: fullH }, dragged?.box);
                const res = snapRect(content, charSiblings, { mode: 'move' });
                nx += res.rect.x - content.x;
                ny += res.rect.y - content.y;
                setOverlaySnapGuides(res.guides.map(g => ({ ...g, span: undefined })));
            } else if (snapEnabled && !e.altKey && meta) {
                // Snap by the element's CONTENT rect (visible region), then apply the positional delta
                // back to its stored coord. Full top-left from the live position + anchor.
                const ftl = meta.anchor === 'center'
                    ? { x: nx - meta.fullW / 2, y: ny - meta.fullH / 2 }
                    : { x: nx, y: ny };
                const content = insetRect({ x: ftl.x, y: ftl.y, width: meta.fullW, height: meta.fullH }, meta.box);
                const res = snapRect(content, siblings, { mode: 'move' });
                nx += res.rect.x - content.x;
                ny += res.rect.y - content.y;
                setOverlaySnapGuides(res.guides);
            } else {
                setOverlaySnapGuides([]);
            }
            nx = Math.round(nx * 10) / 10;
            ny = Math.round(ny * 10) / 10;
            const next = { x: nx, y: ny };
            overlayDragOffsetRef.current = next;
            setOverlayDragOffset(next);
        };
        const onUp = () => {
            const drag = overlayDrag;
            const offset = overlayDragOffsetRef.current;
            // Commit the new position BEFORE clearing the drag state so the committed value is what
            // renders next — never an intermediate frame at the pre-drag position.
            if (offset) {
                const newX = offset.x;
                const newY = offset.y;
                const found = resolveCommandById(drag.sourceCommandId);
                if (found) {
                    const cmd = found.command;
                    if (drag.kind === 'character' && cmd.type === CommandType.MoveCharacter) {
                        // Dragging the character while editing a Move command sets its DESTINATION
                        // (point B) — it must NOT touch the original Show Character's position.
                        applyCommandUpdate(drag.sourceCommandId, { toPosition: { x: newX, y: newY } });
                    } else if (drag.kind === 'character') {
                        // Dragging to reposition is an explicit position intent. If this command has
                        // "Keep current position (expression change only)" on, that flag would discard
                        // the new position on the next render (snapping the sprite back to where it was).
                        // So turn it off when the author actually moves the character.
                        applyCommandUpdate(drag.sourceCommandId, {
                            position: { x: newX, y: newY },
                            ...((cmd as any).keepPosition ? { keepPosition: undefined } : {}),
                        });
                    } else {
                        applyCommandUpdate(drag.sourceCommandId, { x: newX, y: newY });
                    }
                }
            }
            setOverlayDrag(null);
            setOverlayDragOffset(null);
            overlayDragOffsetRef.current = null;
            setOverlaySnapGuides([]);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        // overlayDragOffset intentionally not a dep — latest read via ref (listeners attach once per drag).
    }, [overlayDrag, resolveCommandById, applyCommandUpdate, stageSize, overlayMeta, characterRects, snapEnabled]);

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
                // Characters scale uniformly. They render at ~90% of stage height, so dragging a
                // handle OUTWARD by dy% of the stage grows the scale by dy/90. The corner decides the
                // outward direction (top handles grow on up-drag, bottom on down-drag) so every corner
                // feels natural. startW holds the start scale.
                const corner = overlayResize.corner || 'br';
                const sy = corner.includes('t') ? -1 : 1; // top handles: up = grow
                let s = overlayResize.startW + (sy * dy) / 90;
                if (e.shiftKey) s = Math.round(s * 10) / 10;
                s = Math.max(0.1, Math.round(s * 100) / 100);
                const next = { width: s, height: s };
                overlayResizeSizeRef.current = next;
                setOverlayResizeSize(next);
                return;
            }
            // Hot spots are TOP-LEFT anchored (no centring transform), so a bottom-right handle grows
            // by 1× the delta (left/top edges stay put). Image/text/button/movie are centre-anchored
            // (translate(-50%,-50%)), so the corner grows 2× to keep the centre fixed.
            const mult = overlayResize.kind === 'hotspot' ? 1 : 2;
            let nw = overlayResize.startW + dx * mult;
            let nh = overlayResize.startH + dy * mult;
            if (e.shiftKey) { nw = Math.round(nw); nh = Math.round(nh); }
            nw = Math.max(MIN, Math.round(nw * 10) / 10);
            nh = Math.max(MIN, Math.round(nh * 10) / 10);
            const next = { width: nw, height: nh };
            overlayResizeSizeRef.current = next;
            setOverlayResizeSize(next);
        };
        const onUp = () => {
            const resize = overlayResize;
            const size = overlayResizeSizeRef.current;
            setOverlayResize(null);
            setOverlayResizeSize(null);
            overlayResizeSizeRef.current = null;
            if (!size) return;
            // Per-kind units: characters store a uniform `scale`; image/text store px (relative to
            // the 1280×720 reference); button/item/hotspot/movie store % directly.
            const patch = resize.kind === 'character'
                ? { scale: size.width }
                : (resize.kind === 'image' || resize.kind === 'text')
                    ? { width: Math.round((size.width * 1280) / 100), height: Math.round((size.height * 720) / 100) }
                    : { width: size.width, height: size.height };
            applyCommandUpdate(resize.sourceCommandId, patch);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        // NOTE: `overlayResizeSize` is intentionally NOT a dep — the latest size is read via
        // overlayResizeSizeRef in onUp, so the listeners attach once per drag (not per mousemove).
    }, [overlayResize, applyCommandUpdate, stageSize]);

    // Arrow-key nudge: fine-tune the SELECTED command's position pixel-by-pixel (% steps; Shift = coarser).
    // Covers x/y commands (image/text/button/item/hot spot) and ShowCharacter once it has a custom {x,y}
    // position (drag a preset character once to convert it). Mirrors the drag's commit shape.
    useEffect(() => {
        const NUDGE_TYPES = new Set<CommandType>([CommandType.ShowImage, CommandType.ShowText, CommandType.ShowButton, CommandType.ShowItem, CommandType.ShowHotSpot, CommandType.ShowCharacter]);
        const onKey = (e: KeyboardEvent) => {
            if (selectedCommandIndex === null) return;
            if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
            const scene = project.scenes[activeSceneId];
            const cmd: any = scene?.commands[selectedCommandIndex];
            if (!cmd || !NUDGE_TYPES.has(cmd.type)) return;
            const isChar = cmd.type === CommandType.ShowCharacter;
            if (isChar && (typeof cmd.position !== 'object' || !cmd.position)) return; // preset char — drag once first
            e.preventDefault();
            const step = e.shiftKey ? 2 : 0.5;
            const ddx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const ddy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
            const clamp = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 100) / 100;
            const command = isChar
                ? { ...cmd, position: { x: clamp((cmd.position.x ?? 50) + ddx), y: clamp((cmd.position.y ?? 80) + ddy) } }
                : { ...cmd, x: clamp((cmd.x ?? 50) + ddx), y: clamp((cmd.y ?? 50) + ddy) };
            dispatch({ type: 'UPDATE_COMMAND', payload: { sceneId: activeSceneId, commandIndex: selectedCommandIndex, command } });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [project, activeSceneId, selectedCommandIndex, dispatch]);

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
        // Empty resolved names hide the box too — mirrors the runtime rule.
        const showNamebox = !!dialogue.characterName?.trim() && dialogue.characterName !== 'Narrator';
        const nameStyle: React.CSSProperties = {
            ...fontSettingsToStyle(project.ui.dialogueNameFont),
            ...(dialogue.characterColor && dialogue.characterColor !== '#FFFFFF' ? { color: dialogue.characterColor } : {})
        };

        // Character-specific font overrides (matching LivePreview)
        const character = dialogue.characterId ? project.characters[dialogue.characterId] : null;
        const dialogueTextStyle: React.CSSProperties = {
            ...fontSettingsToStyle(project.ui.dialogueTextFont),
            ...(character?.fontFamily ? { fontFamily: cssFontFamily(character.fontFamily) } : {}),
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

    // Draggable markers for positioning the lights of a selected PlaceLights command on the scene.
    const renderLightMarkers = () => {
        const scene = project.scenes[activeSceneId];
        const cmd = (selectedCommandIndex != null && (scene?.commands[selectedCommandIndex] as any)?.type === CommandType.PlaceLights)
            ? (scene!.commands[selectedCommandIndex] as PlaceLightsCommand) : null;
        if (!cmd) return null;
        const lights = cmd.lights || [];
        if (lights.length === 0) return null;
        const moveLight = (i: number, x: number, y: number) => {
            const newLights = lights.map((l, idx) => idx === i ? { ...l, x, y } : l);
            dispatch({ type: 'UPDATE_COMMAND', payload: { sceneId: activeSceneId, commandIndex: selectedCommandIndex!, command: { ...cmd, lights: newLights } } });
        };
        return (
            <div className="absolute inset-0 z-40" style={{ pointerEvents: 'none' }}>
                {lights.map((l, i) => <LightMarker key={l.id} light={l} index={i} onMove={(x, y) => moveLight(i, x, y)} />)}
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

    // The currently-selected command (drives selection-gated resize handles + the character Fit toolbar).
    const selectedCmd = selectedCommandIndex != null ? (project.scenes[activeSceneId]?.commands[selectedCommandIndex] as VNCommand | undefined) : undefined;
    const selectedCmdId = selectedCmd?.id ?? null;
    // A common-event element counts as selected when its parent Call Common Event command is the
    // selection — selecting the Call lights up handles on everything the event puts on stage.
    const isSelectedEl = (id: string | undefined | null): boolean =>
        !!id && !!selectedCmdId && (id === selectedCmdId || ceMeta[id]?.callCommandId === selectedCmdId);

    // Day/night grade preview (WYSIWYG): use the scene's fixed hour, else the time variable's default.
    const dnc = project.dayNightCycle;
    const sceneDN = project.scenes[activeSceneId]?.dayNight;
    const dnPreviewActive = !!(dnc?.enabled && dnc.phases?.length && sceneDN?.mode !== 'off');
    const dnPreviewHour = sceneDN?.mode === 'fixed'
        ? (sceneDN.fixedHour ?? 12)
        : Number((dnc?.timeVariableId ? project.variables[dnc.timeVariableId]?.defaultValue : undefined) ?? 12);
    const dnGrade = dnPreviewActive ? computeGrade(dnPreviewHour, dnc!.phases) : null;
    const dnBg = dnGrade ? gradeToBackgroundStyle(dnGrade.background) : null;
    const dnCharFilter = dnGrade ? gradeToCharacterFilter(dnGrade.sprites) : '';
    const dnSpriteTint = dnGrade ? gradeToSpriteTint(dnGrade.sprites) : null;

    const stageInner = (
            <div ref={containerRef} className="w-full h-full flex overflow-auto p-2">
                <div
                    ref={stageRef}
                    className="relative bg-[var(--bg-primary)]/50 rounded-md overflow-hidden"
                    // `isolation: isolate` makes the stage its own stacking context so per-element
                    // `layer` z-indices stay confined here (mirroring the runtime's panZoom transform
                    // context) and never float overlays above the editor chrome.
                    // margin:auto centers the stage when it fits and lets the container scroll when
                    // zoomed past the panel; flexShrink 0 stops flex from squeezing it back down.
                    style={{ isolation: 'isolate', margin: 'auto', flexShrink: 0, width: stageSize.width, height: stageSize.height, '--font-scale': stageSize.width > 0 ? stageSize.width / (project.gameResolution?.width || 1920) : 1 } as React.CSSProperties}
                >
                    {activePick && activePick.sceneId === activeSceneId && (
                        <div
                            className="absolute inset-0 z-[99999] cursor-crosshair"
                            onClick={(e) => {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
                                const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
                                const sc = project.scenes[activePick.sceneId];
                                const cmd = sc?.commands?.[activePick.commandIndex];
                                if (cmd) dispatch({ type: 'UPDATE_COMMAND', payload: { sceneId: activePick.sceneId, commandIndex: activePick.commandIndex, command: { ...cmd, [activePick.field]: { x, y } } } });
                                canvasPointPick.cancel();
                            }}
                        >
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[var(--accent-lavender)] text-white text-xs shadow-lg pointer-events-none whitespace-nowrap">
                                {activePick.label || 'Click to set point'} — Esc to cancel
                            </div>
                        </div>
                    )}
                    {stageState.backgroundUrl && (stageState.backgroundIsVideo
                        ? <TrimmedVideo key={`stage-bg-${videoReloadNonce}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={stageState.backgroundUrl} autoPlay loop muted trimStart={stageState.backgroundTrimStart} trimEnd={stageState.backgroundTrimEnd} playsInline className="absolute inset-0 w-full h-full object-cover" style={dnBg ? { filter: dnBg.filter } : undefined} />
                        : <img src={stageState.backgroundUrl} alt="background" className="absolute inset-0 w-full h-full object-cover" style={dnBg ? { filter: dnBg.filter } : undefined} />
                    )}
                    {/* Day/night background grade preview (tint), above the background, below characters. */}
                    {dnBg && dnBg.overlayColor !== 'transparent' && (
                        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3, backgroundColor: dnBg.overlayColor }} />
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
                                    ? <TrimmedVideo key={`stage-bgplane-${plane.commandId}-${videoReloadNonce}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={plane.url} autoPlay loop muted trimStart={plane.trimStart} trimEnd={plane.trimEnd} playsInline className="absolute inset-0 w-full h-full object-cover" style={plane.parallaxDepth ? { transform: 'scale(1.15)', transformOrigin: 'center' } : undefined} />
                                    : <img src={plane.url} alt={t('hc.backgroundLayer', 'background layer')} className="absolute inset-0 w-full h-full object-cover" style={plane.parallaxDepth ? { transform: 'scale(1.15)', transformOrigin: 'center' } : undefined} />
                                )}
                            </div>
                        );
                    })}

                {/* Movie/video - renders BEHIND characters (z-index 2) */}
                {stageState.movie && stageState.movie.videoUrl && (
                    stageState.movie.displayMode === 'fullscreen' ? (
                        <TrimmedVideo
                            key={`stage-movie-fs-${videoReloadNonce}`}
                            ref={(el) => { if (el) el.play().catch(() => {}); }}
                            src={stageState.movie.videoUrl}
                            autoPlay
                            muted
                            loop
                            trimStart={stageState.movie.trimStart}
                            trimEnd={stageState.movie.trimEnd}
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
                                data-vn-id={cmdId}
                                onMouseDown={cmdId ? (e) => handleOverlayMouseDown(e, 'movie', cmdId, m.x, m.y) : undefined}
                                onContextMenu={commandRadial && cmdId ? (e) => { e.preventDefault(); commandRadial.openById(cmdId, e.clientX, e.clientY); } : undefined}
                            >
                                <TrimmedVideo key={`stage-movie-custom-${videoReloadNonce}`} ref={(el) => { if (el) el.play().catch(() => {}); }} src={m.videoUrl} autoPlay muted loop trimStart={m.trimStart} trimEnd={m.trimEnd} playsInline
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
                        <TrimmedVideo
                            key={`stage-movie-nc-${videoReloadNonce}`}
                            ref={(el) => { if (el) el.play().catch(() => {}); }}
                            src={stageState.movie.videoUrl}
                            autoPlay
                            muted
                            loop
                            trimStart={stageState.movie.trimStart}
                            trimEnd={stageState.movie.trimEnd}
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
                    // Live drag = a pure SCREEN-SPACE translate added on top of the sprite's REST style —
                    // the position/anchor (preset bottom+centre vs custom top-left) never switches mid-drag,
                    // which is what caused the residual flicker (anchor swap → sub-pixel repaint). Prepended
                    // so it composes AFTER (isn't multiplied by) the sprite's scale(). The committed position
                    // is still derived from overlayDragOffset in onUp, so drop lands byte-identically.
                    if (isDragging && overlayDragOffset && overlayDrag) {
                        const dxPx = (overlayDragOffset.x - overlayDrag.startPosX) / 100 * (stageSize.width || 1);
                        const dyPx = (overlayDragOffset.y - overlayDrag.startPosY) / 100 * (stageSize.height || 1);
                        transformStr = `translate(${dxPx}px, ${dyPx}px) ${transformStr}`.trim();
                    }
                    // Keep the sprite on a STABLE GPU compositing layer at all times. When transformStr
                    // would otherwise be empty (custom position, scale 1, no rotation/flip), the element
                    // flips between "has transform" (composited) and "no transform" (not composited) the
                    // instant you start/stop a drag or resize — a one-frame layer promote/demote repaint.
                    // A constant translateZ(0) pins the layer.
                    transformStr = `${transformStr} translateZ(0)`.trim();
                    const finalStyle = isCustomPosition
                        ? { ...posStyle, height: '90%', transform: transformStr, transformOrigin: 'center bottom' }
                        : { ...posStyle, height: '90%', bottom: '0', top: 'auto', transform: transformStr, transformOrigin: 'center bottom' };
                    const ce = char.sourceCommandId ? ceMeta[char.sourceCommandId] : undefined;
                    return (
                        <div
                            key={char.charId}
                            data-vn-id={char.charId}
                            className="absolute w-auto aspect-[3/4]"
                            style={{
                                ...finalStyle,
                                zIndex: isDragging ? 100000 : 5 + (char.layer ?? 0) * 100,
                                cursor: char.sourceCommandId ? (isDragging ? 'grabbing' : 'grab') : undefined,
                                ...(dnSpriteTint ? { isolation: 'isolate' as const } : {}),
                                ...(ce ? CE_OUTLINE_STYLE : {}),
                            }}
                            title={ce ? t('fromCommonEvent', 'From event: {{name}} — edits change every scene that calls it. Double-click to open.', { name: ce.eventName }) : undefined}
                            onMouseDown={char.sourceCommandId ? (e) => handleCharMouseDown(e, char) : undefined}
                            onDoubleClick={(ce && onOpenCommonEvent) ? (e) => { e.stopPropagation(); onOpenCommonEvent(ce.eventId, ce.ceIndex); } : undefined}
                            onContextMenu={(commandRadial && char.sourceCommandId) ? (e) => { e.preventDefault(); commandRadial.openById(char.sourceCommandId!, e.clientX, e.clientY); } : undefined}
                        >
                            {char.imageUrls.map((url, index) => <img key={index} src={url} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ zIndex: index, filter: dnCharFilter || undefined, ...layerBoxStyle((char as any).imageBoxes?.[index]) }} />)}
                            {/* Day/night sprite tint preview — true color overlay masked to each layer.
                                Pose Studio geometry rides on each copy so the tint hugs the boxed piece. */}
                            {dnSpriteTint && char.imageUrls.map((url, index) => (
                                <div key={`dn-tint-${index}`} aria-hidden className="absolute inset-0" style={{
                                    zIndex: index, backgroundColor: dnSpriteTint.color, opacity: dnSpriteTint.opacity, mixBlendMode: 'multiply', pointerEvents: 'none',
                                    WebkitMaskImage: `url("${url}")`, maskImage: `url("${url}")`,
                                    WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center',
                                    ...layerBoxStyle((char as any).imageBoxes?.[index]),
                                }} />
                            ))}
                            {/* Resize handles — grab ANY corner to scale the sprite uniformly. Placed at the
                                CONTENT BOX corners (the visible art) so they stay reachable even when the
                                sprite has large transparent padding; fall back to the frame corners when
                                no content box is set. */}
                            {char.sourceCommandId && (() => {
                                const cb = char.contentBox || { left: 0, top: 0, right: 0, bottom: 0 };
                                return ([
                                    { c: 'tl', x: cb.left, y: cb.top, cursor: 'nwse-resize' },
                                    { c: 'tr', x: 1 - cb.right, y: cb.top, cursor: 'nesw-resize' },
                                    { c: 'bl', x: cb.left, y: 1 - cb.bottom, cursor: 'nesw-resize' },
                                    { c: 'br', x: 1 - cb.right, y: 1 - cb.bottom, cursor: 'nwse-resize' },
                                ].map(h => (
                                    <div
                                        key={h.c}
                                        onMouseDown={e => handleOverlayResizeMouseDown(e, 'character', char.charId, char.scale ?? 1, char.scale ?? 1, char.sourceCommandId, h.c)}
                                        title={t('dragToResizeScale')}
                                        style={{
                                            position: 'absolute', left: `${h.x * 100}%`, top: `${h.y * 100}%`,
                                            transform: 'translate(-50%, -50%)', width: 14, height: 14,
                                            borderRadius: 3, background: '#0ea5e9', border: '2px solid #fff',
                                            boxShadow: '0 0 3px rgba(0,0,0,0.6)', zIndex: 60, cursor: h.cursor,
                                        }}
                                    />
                                )));
                            })()}
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
                            {ce && <CeBadge name={ce.eventName} />}
                            {char.sourceCommandId && isSelectedEl(char.sourceCommandId) && (
                                <ContentBoxEditor
                                    box={char.contentBox}
                                    onChange={b => commitContentBox(char.sourceCommandId!, b)}
                                    onTrim={(aspect) => trimContentBox(char.sourceCommandId!, char.imageUrls[char.imageUrls.length - 1] || char.imageUrls[0], aspect)}
                                    onReset={() => commitContentBox(char.sourceCommandId!, undefined)}
                                />
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
                     const isResizing = overlayResize?.kind === 'text' && overlayResize.overlayId === o.id;
                     const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : o.x;
                     const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : o.y;
                     const textStyle: React.CSSProperties = {
                        position: 'absolute',
                        left: `${displayX}%`,
                        top: `${displayY}%`,
                        width: isResizing && overlayResizeSize ? `${overlayResizeSize.width}%` : (o.width ? `${pxToPercentWidth(o.width)}%` : 'auto'),
                        height: isResizing && overlayResizeSize ? `${overlayResizeSize.height}%` : (o.height ? `${pxToPercentHeight(o.height)}%` : 'auto'),
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
                     const ce = ceMeta[o.id];
                     if (ce) Object.assign(textStyle, CE_OUTLINE_STYLE);
                     return (
                         <React.Fragment key={o.id}>
                             <div data-vn-id={o.id} style={textStyle} onMouseDown={e => handleOverlayMouseDown(e, 'text', o.id, o.x, o.y)}
                                 title={ce ? t('fromCommonEvent', 'From event: {{name}} — edits change every scene that calls it. Double-click to open.', { name: ce.eventName }) : undefined}
                                 onDoubleClick={(ce && onOpenCommonEvent) ? (e) => { e.stopPropagation(); onOpenCommonEvent(ce.eventId, ce.ceIndex); } : undefined}
                                 onContextMenu={commandRadial ? (e) => { e.preventDefault(); commandRadial.openById(o.id, e.clientX, e.clientY); } : undefined}>
                                 {/* GradientText forces Chromium to re-clip the gradient when colors change live. */}
                                 {gradientSpanStyle ? <GradientText style={gradientSpanStyle}>{overlayText}</GradientText> : <span>{overlayText}</span>}
                                 {ce && <CeBadge name={ce.eventName} />}
                                 {isSelectedEl(o.id) && <ResizeHandle onMouseDown={e => startMeasuredResize(e, 'text', o.id)} title={t('dragToResize')} />}
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
                     const isResizing = overlayResize?.kind === 'image' && overlayResize.overlayId === o.id;
                     const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : o.x;
                     const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : o.y;
                     const ce = ceMeta[o.id];
                     return (
                         <React.Fragment key={o.id}>
                             <div
                                 style={{
                                     position: 'absolute',
                                     left: `${displayX}%`,
                                     top: `${displayY}%`,
                                     ...(ce ? CE_OUTLINE_STYLE : {}),
                                     // While resizing, show explicit live size (in %); otherwise honor the stored px
                                     // size, and "Fit to content" treats width/height as a max bound around the art.
                                     ...(isResizing && overlayResizeSize
                                         ? { width: `${overlayResizeSize.width}%`, height: `${overlayResizeSize.height}%` }
                                         : o.fitToContent
                                             ? { width: 'auto', height: 'auto', maxWidth: `${pxToPercentWidth(o.width)}%`, maxHeight: `${pxToPercentHeight(o.height)}%` }
                                             : { width: `${pxToPercentWidth(o.width)}%`, height: `${pxToPercentHeight(o.height)}%` }),
                                     transform: `translate(-50%, -50%) rotate(${o.rotation}deg) scale(${o.scaleX * (o.flipX ? -1 : 1)}, ${o.scaleY * (o.flipY ? -1 : 1)})`,
                                     opacity: o.opacity,
                                     cursor: isDragging ? 'grabbing' : 'grab',
                                     zIndex: isDragging ? 100000 : 1 + (o.layer ?? 0) * 100,
                                 }}
                                 data-vn-id={o.id}
                                 title={ce ? t('fromCommonEvent', 'From event: {{name}} — edits change every scene that calls it. Double-click to open.', { name: ce.eventName }) : undefined}
                                 onMouseDown={e => handleOverlayMouseDown(e, 'image', o.id, o.x, o.y, o.contentBox)}
                                 onDoubleClick={(ce && onOpenCommonEvent) ? (e) => { e.stopPropagation(); onOpenCommonEvent(ce.eventId, ce.ceIndex); } : undefined}
                                 onContextMenu={commandRadial ? (e) => { e.preventDefault(); commandRadial.openById(o.id, e.clientX, e.clientY); } : undefined}
                             >
                                 {o.fitToContent
                                     ? <img src={o.imageUrl} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }} />
                                     : <img src={o.imageUrl} alt="" className="w-full h-full object-contain" />}
                                 {ce && <CeBadge name={ce.eventName} />}
                                 {isSelectedEl(o.id) && <ResizeHandle onMouseDown={e => startMeasuredResize(e, 'image', o.id)} title={t('dragToResize')} box={o.contentBox} />}
                                 {isSelectedEl(o.id) && (
                                     <ContentBoxEditor
                                         box={o.contentBox}
                                         onChange={b => commitContentBox(o.id, b)}
                                         onTrim={(aspect) => trimContentBox(o.id, o.imageUrl, aspect)}
                                         onReset={() => commitContentBox(o.id, undefined)}
                                     />
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
                {stageState.buttonOverlays.map(btn => {
                    const scaledBorderRadius = btn.borderRadius * (stageSize.width / REFERENCE_WIDTH);
                    const scaledButtonFontSize = scaleFontSize(btn.fontSize);
                    const isDragging = overlayDrag?.kind === 'button' && overlayDrag.overlayId === btn.id;
                    const isResizing = overlayResize?.kind === 'button' && overlayResize.overlayId === btn.id;
                    const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : btn.x;
                    const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : btn.y;
                    const displayW = isResizing && overlayResizeSize ? overlayResizeSize.width : btn.width;
                    const displayH = isResizing && overlayResizeSize ? overlayResizeSize.height : btn.height;
                    const ce = ceMeta[btn.id];

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
                                    // Honor the button's anchor (default 0.5) so the editor preview matches
                                    // the runtime — a non-center anchor no longer renders centered here.
                                    transform: `translate(-${(btn.anchorX ?? 0.5) * 100}%, -${(btn.anchorY ?? 0.5) * 100}%) ${buildOrientationTransform({ rotation: btn.rotation, flipX: btn.flipX, flipY: btn.flipY })}`.trim(),
                                    opacity: btn.opacity ?? 1,
                                    cursor: isResizing ? 'nwse-resize' : (isDragging ? 'grabbing' : 'grab'),
                                    zIndex: (isDragging || isResizing) ? 100000 : 1 + (btn.layer ?? 0) * 100,
                                    ...(ce ? CE_OUTLINE_STYLE : {}),
                                }}
                                data-vn-id={btn.id}
                                title={ce ? t('fromCommonEvent', 'From event: {{name}} — edits change every scene that calls it. Double-click to open.', { name: ce.eventName }) : undefined}
                                onMouseDown={e => handleOverlayMouseDown(e, 'button', btn.id, btn.x, btn.y, btn.contentBox)}
                                onDoubleClick={(ce && onOpenCommonEvent) ? (e) => { e.stopPropagation(); onOpenCommonEvent(ce.eventId, ce.ceIndex); } : undefined}
                                onContextMenu={commandRadial ? (e) => { e.preventDefault(); commandRadial.openById(btn.id, e.clientX, e.clientY); } : undefined}
                            >
                                {/* Resize handle — drag to scale the button. Sits at the content box
                                    corner when one is set (reachable on image buttons with padding). */}
                                <ResizeHandle
                                    onMouseDown={e => handleOverlayResizeMouseDown(e, 'button', btn.id, btn.width, btn.height)}
                                    title={t('dragToResize')}
                                    box={btn.contentBox}
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
                                {ce && <CeBadge name={ce.eventName} />}
                                {isSelectedEl(btn.id) && (
                                    <ContentBoxEditor
                                        box={btn.contentBox}
                                        onChange={b => commitContentBox(btn.id, b)}
                                        onTrim={btn.imageUrl ? (aspect) => trimContentBox(btn.id, btn.imageUrl, aspect) : undefined}
                                        onReset={() => commitContentBox(btn.id, undefined)}
                                    />
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
                    const isResizing = overlayResize?.kind === 'hotspot' && overlayResize.overlayId === hs.id;
                    const displayX = isDragging && overlayDragOffset ? overlayDragOffset.x : hs.x;
                    const displayY = isDragging && overlayDragOffset ? overlayDragOffset.y : hs.y;
                    const displayW = isResizing && overlayResizeSize ? overlayResizeSize.width : hs.width;
                    const displayH = isResizing && overlayResizeSize ? overlayResizeSize.height : hs.height;
                    const outline = hs.highlightColor || 'rgba(99,102,241,0.9)';
                    const ce = ceMeta[hs.id];
                    return (
                        <React.Fragment key={hs.id}>
                            <div
                                style={{
                                    position: 'absolute',
                                    left: `${displayX}%`, top: `${displayY}%`,
                                    width: `${displayW}%`, height: `${displayH}%`,
                                    borderRadius: hs.shape === 'circle' ? '50%' : 6,
                                    // Editor preview of the spot's rotation/flip, matching the runtime.
                                    transform: buildOrientationTransform(hs) || undefined,
                                    border: `2px dashed ${outline}`,
                                    background: hs.visible ? (hs.highlightColor || 'rgba(99,102,241,0.25)') : 'rgba(99,102,241,0.08)',
                                    cursor: isDragging ? 'grabbing' : 'grab',
                                    zIndex: isDragging ? 50 : 9,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    ...(ce ? CE_OUTLINE_STYLE : {}),
                                }}
                                data-vn-id={hs.id}
                                onMouseDown={e => handleOverlayMouseDown(e, 'hotspot', hs.id, hs.x, hs.y)}
                                onDoubleClick={(ce && onOpenCommonEvent) ? (e) => { e.stopPropagation(); onOpenCommonEvent(ce.eventId, ce.ceIndex); } : undefined}
                                title={ce ? t('fromCommonEvent', 'From event: {{name}} — edits change every scene that calls it. Double-click to open.', { name: ce.eventName }) : `${hs.name} (${hs.trigger})`}
                            >
                                <span className="text-[10px] text-white/90 px-1 py-0.5 rounded bg-black/50 pointer-events-none truncate max-w-full">
                                    🎯 {hs.name}
                                </span>
                                {ce && <CeBadge name={ce.eventName} />}
                                {isSelectedEl(hs.id) && <ResizeHandle onMouseDown={e => handleOverlayResizeMouseDown(e, 'hotspot', hs.id, hs.width, hs.height)} title={t('dragToResize')} />}
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
                {renderLightMarkers()}

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
                    <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm p-2.5 rounded-lg text-xs max-w-xs max-h-56 overflow-y-auto z-[8000] border border-white/10 shadow-xl">
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
                                    // Named band, if this number has one — same language as the live tracker.
                                    const band = def?.type === 'number' ? resolveBand(def, value) : null;
                                    return (
                                        <li key={id} className="flex items-center justify-between gap-3">
                                            <span className="text-slate-300 truncate flex items-center gap-1">
                                                {def?.icon && <span>{def.icon}</span>}
                                                <span className="truncate">{varName}</span>
                                            </span>
                                            <span className="flex items-center gap-1 flex-shrink-0">
                                                {band && (
                                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] leading-none whitespace-nowrap"
                                                        style={{
                                                            background: `color-mix(in srgb, ${band.color ?? '#94a3b8'} 25%, transparent)`,
                                                            color: band.color ?? '#cbd5e1',
                                                        }}>
                                                        {band.icon ? `${band.icon} ` : ''}{band.name}
                                                    </span>
                                                )}
                                                <span className="font-mono text-white">{display}</span>
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}

                 {/* Player-screen boundary — marks exactly where the game frame cuts off. */}
                 <CanvasEdgeFrame />

                 {/* Game-HUD awareness: faint outlines of the always-on HUD's click-capturing
                     elements. In-game the HUD sits ABOVE the scene, so a scene hotspot placed
                     under one of these silently loses its clicks — make that visible here. */}
                 {showHudOverlays && hudInteractiveElements.map((el: any) => (
                    <div
                        key={`hud-${el.id}`}
                        className="absolute pointer-events-none"
                        style={{
                            left: `${el.x}%`, top: `${el.y}%`, width: `${el.width}%`, height: `${el.height}%`,
                            border: '1.5px dashed rgba(251,191,36,0.75)',
                            background: 'rgba(251,191,36,0.07)',
                            borderRadius: el.shape === 'circle' ? '50%' : 4,
                            zIndex: 9997,
                        }}
                    >
                        {/* Label above the box, or inside it when the box touches the top edge (would clip). */}
                        <span className={`absolute left-0 text-[9px] font-semibold px-1 py-px rounded-sm whitespace-nowrap ${el.y < 5 ? 'top-0.5' : '-top-0.5 -translate-y-full'}`} style={{ background: 'rgba(251,191,36,0.9)', color: '#1a1a1a' }}>
                            {t('hudOverlayLabel', 'HUD')} · {el.name || el.type}
                        </span>
                    </div>
                 ))}

                 {/* Smart-snap alignment guides (drawn during a drag/resize). */}
                 <CanvasSnapGuides guides={overlaySnapGuides} />

                 {/* Character "fit to screen" toolbar — shown when a ShowCharacter command is selected.
                     Anchored at the BOTTOM so it never overlaps the content-box Trim/Reset toolbar,
                     which sits at the top of the (selected) sprite's content box. */}
                 {selectedCmd?.type === CommandType.ShowCharacter && selectedCmdId && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[var(--bg-primary)]/90 border border-[var(--border-default)]/60 rounded-lg px-1.5 py-1 z-[8000] shadow-lg">
                        <span className="text-[10px] text-[var(--text-muted)] px-1">{t('characterSize')}</span>
                        <button onClick={() => commitCharFit(selectedCmdId, 'height', (selectedCmd as ShowCharacterCommand).contentBox)} title={t('fitHeightTip')} className="text-[10px] px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-sky-600/70 text-[var(--text-primary)]">{t('fitHeight')}</button>
                        <button onClick={() => commitCharFit(selectedCmdId, 'width', (selectedCmd as ShowCharacterCommand).contentBox)} title={t('fitWidthTip')} className="text-[10px] px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-sky-600/70 text-[var(--text-primary)]">{t('fitWidth')}</button>
                        <button onClick={() => commitCharScale(selectedCmdId, 1)} title={t('resetSizeTip')} className="text-[10px] px-2 py-1 rounded bg-[var(--bg-secondary)] hover:bg-sky-600/70 text-[var(--text-primary)]">{t('resetSize')}</button>
                    </div>
                 )}

                 {/* Preview controls — kept above all per-layer stage content (characters/overlays can
                     reach z-index 100+, which previously covered these buttons and ate their clicks).
                     Collapsible: the stack can sit right on top of art/hot spots the author is
                     aligning, so a single chevron tucks it away (remembered per machine). */}
                 <div className="absolute top-2 right-2 flex flex-col gap-2 z-[8000] items-end">
                    <button
                        onClick={() => setChromeCollapsed(s => !s)}
                        className="flex items-center justify-center w-6 h-6 rounded-lg text-xs border bg-[var(--bg-primary)]/70 border-[var(--border-default)]/40 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]/90"
                        title={chromeCollapsed ? t('chromeShow', 'Show canvas buttons') : t('chromeHide', 'Hide canvas buttons (they can cover art you are aligning)')}
                    >
                        {chromeCollapsed ? '◂' : '▸'}
                    </button>
                    {!chromeCollapsed && <>
                    <button
                        onClick={() => setSnapEnabled(s => !s)}
                        className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                            snapEnabled
                                ? 'bg-sky-500/80 border-sky-400/50 text-white shadow-lg shadow-sky-500/20'
                                : 'bg-[var(--bg-primary)]/80 border-[var(--border-default)]/50 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/90 hover:border-slate-400/60'
                        }`}
                        title={t('snapTip')}
                    >
                        <span>{t('snapToggle')}</span>
                    </button>
                    {hudInteractiveElements.length > 0 && (
                        <button
                            onClick={toggleHudOverlays}
                            className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                showHudOverlays
                                    ? 'bg-amber-500/80 border-amber-400/50 text-white shadow-lg shadow-amber-500/20'
                                    : 'bg-[var(--bg-primary)]/80 border-[var(--border-default)]/50 text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/90 hover:border-slate-400/60'
                            }`}
                            title={t('hudOverlayTip', "Show the game HUD's clickable areas on this canvas. The HUD sits above the scene in-game — a scene hot spot underneath one won't receive clicks.")}
                        >
                            <span>{t('hudOverlayToggle', 'HUD areas')}</span>
                        </button>
                    )}
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
                    </>}
                 </div>

                 {/* Canvas zoom — fine-tune tiny images/hot spots (also Ctrl+scroll on the canvas). */}
                 <CanvasZoomControls zoom={zoomCtl} />
                </div>
            </div>
    );

    if (bare) {
        // Chromeless (popped-out canvas window): just the stage, no Panel header.
        return (
            <div className={`flex flex-col overflow-hidden ${className || ''}`} style={{ height: style?.height || '100%', ...style }}>
                {stageInner}
            </div>
        );
    }

    return (
        <Panel
            title={t('panelTitle')}
            className={className}
            style={{
                height: style?.height || 'var(--canvas-height)',
                ...style
            }}
        >
            {stageInner}
        </Panel>
    );
};

export default StagingArea;
