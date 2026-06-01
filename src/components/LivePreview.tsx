import React, { useState, useEffect, useRef, useCallback, useReducer, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useProject } from '../contexts/ProjectContext';
import { interpolateVariables } from '../utils/variableInterpolation';
import { deriveHotSpotsFromScreen, deriveHotZoneElementsFromScreen } from '../utils/hotZoneShims';
import { XMarkIcon, FilmIcon } from './icons';
import { fontSettingsToStyle, extractTextGradientStyle, buildTextEffectStyles } from '../utils/styleUtils';
import { VNID, VNPosition, VNPositionPreset, VNTransition, normalizeOverlayEffects, upsertOverlayEffect, type VNScreenOverlayEffect } from '../types';
import { VNProject, CGGalleryEntry } from '../types/project';
import {
    VNUIAction, UIActionType, GoToScreenAction, JumpToSceneAction, JumpToLabelAction, SetVariableAction, SaveGameAction, LoadGameAction, CycleLayerAssetAction, OpenURLAction
} from '../types/shared';
import {
    VNUIScreen, VNUIElement, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement,
    UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, UITextInputElement, UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, UICGGalleryElement, GameSetting, GameToggleSetting, UIElementType,
    VNHotSpot, VNHotZoneElement, VNConfirmDialogSettings
} from '../features/ui/types';
import {
    VNCommand, CommandType, ChoiceOption, SetBackgroundCommand, ShowCharacterCommand, HideCharacterCommand, DialogueCommand,
    ChoiceCommand, JumpCommand, SetVariableCommand, TextInputCommand, PlayMusicCommand, StopMusicCommand, PlaySoundEffectCommand,
    PlayMovieCommand, StopMovieCommand, WaitCommand, ShakeScreenCommand, TintScreenCommand, PanZoomScreenCommand, ResetScreenEffectsCommand,
    FlashScreenCommand, LabelCommand, JumpToLabelCommand, ShowTextCommand, ShowImageCommand, HideTextCommand, HideImageCommand,
    ShowButtonCommand, HideButtonCommand, BranchStartCommand, BranchEndCommand, SetScreenOverlayEffectCommand,
    CreditRollCommand, CreditBackground, CreditMedia, RunScriptCommand,
    SpawnParticlesCommand, StopParticlesCommand,
    CallCommonEventCommand,
    ShowImageMapCommand, HideImageMapCommand,
    TweenElementCommand,
} from '../features/scene/types';
// FIX: VNCondition is not exported from scene/types, but from shared types.
import { VNCondition } from '../types/shared';
import { VNCharacter, VNCharacterLayer } from '../features/character/types';
import { VNVariable, VNSetVariableOperator, VNVariableScope } from '../features/variables/types';
import { ScreenOverlayEffects } from './live-preview/ScreenOverlayEffects';
import { ParticleSystem } from './live-preview/ParticleSystem';
import { AnimatedDialogueText, useRainbowTick } from './live-preview/AnimatedDialogueText';
import { 
    normalizeSetVariableOperator as normalizeOperator,
    calculateVariableValue 
} from '../utils/variableUtils';
import { computeArrangedPositions } from '../utils/characterArrange';

/** Convert hex color to approximate hue rotation degrees for CSS filter */
function getHueFromHex(hex: string): number {
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!match) return 0;
    const r = parseInt(match[1], 16) / 255;
    const g = parseInt(match[2], 16) / 255;
    const b = parseInt(match[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0;
    if (max !== min) {
        const d = max - min;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return Math.round(h * 360);
}

function isRuntimeDebugEnabled(): boolean {
    try {
        return window.localStorage.getItem('flourish:runtimeDebug') === '1';
    } catch {
        return false;
    }
}

function runtimeDebugLog(...args: unknown[]): void {
    if (!isRuntimeDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log(...args);
}

function runtimeDebugWarn(...args: unknown[]): void {
    if (!isRuntimeDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.warn(...args);
}

// --- Persistent Variable Helpers ---
/** localStorage key for cross-session persistent variables */
function getPersistentVarsKey(projectId: string): string {
    return `vn-persistent-vars-${projectId}`;
}

/** Load persistent variables from storage (localStorage or Electron) */
function loadPersistentVariables(projectId: string): Record<string, string | number | boolean> {
    try {
        if (typeof window !== 'undefined' && (window as any).electronAPI?.storage) {
            // Electron storage is async — for initial sync load, fall back to localStorage
        }
        const raw = localStorage.getItem(getPersistentVarsKey(projectId));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/** Save a single persistent variable to storage */
function savePersistentVariables(projectId: string, vars: Record<string, string | number | boolean>): void {
    try {
        if (typeof window !== 'undefined' && (window as any).electronAPI?.storage) {
            (window as any).electronAPI.storage.setItem(getPersistentVarsKey(projectId), vars);
        }
        localStorage.setItem(getPersistentVarsKey(projectId), JSON.stringify(vars));
    } catch (e) {
        console.error('Failed to save persistent variables:', e);
    }
}

/** Build initial variable state: defaults + persistent overrides from storage */
function getInitialVariablesWithPersistent(
    projectVariables: Record<string, any>,
    projectId: string
): Record<string, string | number | boolean> {
    const vars: Record<string, string | number | boolean> = {};
    Object.values(projectVariables).forEach((v: any) => {
        vars[v.id] = v.defaultValue;
    });
    // Layer in any persistent-scope values saved from previous sessions
    const persistentVars = loadPersistentVariables(projectId);
    Object.values(projectVariables).forEach((v: any) => {
        if ((v.scope || 'global') === 'persistent' && persistentVars[v.id] !== undefined) {
            vars[v.id] = persistentVars[v.id];
        }
    });
    return vars;
}

/** Get default values for all local-scope variables in a project */
function getLocalVariableDefaults(projectVariables: Record<string, any>): Record<string, string | number | boolean> {
    const defaults: Record<string, string | number | boolean> = {};
    Object.values(projectVariables).forEach((v: any) => {
        if ((v.scope || 'global') === 'local') {
            defaults[v.id] = v.defaultValue;
        }
    });
    return defaults;
}

// Command Handlers
import {
    CommandContext,
    CommandResult,
    RuntimeCommandHelpers,
    handleDialogue,
    handleSetVariable,
    handleChoice,
    handleShowCharacter,
    handleHideCharacter,
    handleSetBackground,
    handlePlayMusic,
    handleStopMusic,
    handlePlaySoundEffect,
    handleStopSoundEffect,
    handleShowText,
    handleHideText,
    handleShowImage,
    handleHideImage,
    handleShowButton,
    handleHideButton,
    handleJump,
    handleJumpToLabel,
    handleLabel,
    handleBranchStart,
    handleBranchEnd,
    handleGroup,
    handleShakeScreen,
    handleTintScreen,
    handlePanZoomScreen,
    handleResetScreenEffects,
    handleFlashScreen,
    handleTextInput,
    handleCreditRoll,
    handleRunScript,
    handleSpawnParticles,
    handleStopParticles,
    handleCallCommonEvent,
    handleShowImageMap,
    handleHideImageMap,
    handleTweenElement,
} from './live-preview/command-handlers';
import { CommandScheduler } from './live-preview/runtime/commandScheduler';
import { RuntimeVariableStore } from './live-preview/runtime/runtimeVariableStore';
import { RuntimeDiagnostics } from './live-preview/runtime/runtimeDiagnostics';

// Import extracted types
import {
    TextOverlay,
    ImageOverlay,
    ButtonOverlay,
    ImageMapOverlay,
    StageCharacterState,
    StageState,
    MusicState,
    PlayerState,
    GameSettings,
    HistoryEntry,
} from './live-preview/types/gameState';

type StageSize = { width: number; height: number };

// Import utility functions from extracted modules
import { getOverlayTransitionClass } from './live-preview/systems/transitionUtils';
import { TweenManager } from './live-preview/systems/tweenManager';
import { useTween } from './live-preview/hooks/useTween';

const defaultSettings: GameSettings = {
    textSpeed: 50,
    musicVolume: 0.8,
    sfxVolume: 0.8,
    voiceVolume: 0.8,
    ambientVolume: 0.8,
    enableSkip: true,
    autoAdvance: false,
    autoAdvanceDelay: 3,
};

// --- Utility Functions (keeping these until they can be extracted) ---
const getPositionStyle = (transition: VNTransition, isHide: boolean): string => {
    switch (transition) {
        case 'fade':
            return isHide ? 'transition-fade-out' : 'transition-dissolve';
        case 'dissolve':
            return isHide ? 'transition-dissolve-out' : 'transition-dissolve';
        case 'slide':
            return 'transition-slide';
        case 'iris-in':
            return isHide ? 'transition-iris-out' : 'transition-iris-in';
        case 'wipe-right':
            return isHide ? 'transition-wipe-out-right' : 'transition-wipe-right';
        default:
            return 'transition-dissolve';
    }
};

const buildSlideStyle = (x: number, _y: number, action: 'show' | 'hide' | undefined, stageSize: StageSize): React.CSSProperties => {
    const horizontalBias = x <= 50 ? -60 : 60;
    const startPercent = action === 'show' ? horizontalBias : 0;
    const endPercent = action === 'hide' ? horizontalBias : 0;

    const style: React.CSSProperties = {
        '--slide-start-x': `${startPercent}%`,
        '--slide-start-y': `0%`,
        '--slide-end-x': `${endPercent}%`,
        '--slide-end-y': `0%`,
    } as React.CSSProperties;

    if (stageSize.width > 0 && stageSize.height > 0) {
        style['--slide-start-px' as any] = `${(startPercent / 100) * stageSize.width}px`;
        style['--slide-end-px' as any] = `${(endPercent / 100) * stageSize.width}px`;
        style['--slide-start-py' as any] = `0px`;
        style['--slide-end-py' as any] = `0px`;
    }

    return style;
};

const TextOverlayElement: React.FC<{ overlay: TextOverlay; stageSize: StageSize }> = ({ overlay, stageSize }) => {
    const tweenValues = useTween(overlay.id, 'text');
    const hasTransition = overlay.transition && overlay.transition !== 'instant';
    const [playTransition, setPlayTransition] = useState<boolean>(overlay.action === 'hide' && !!hasTransition);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (!overlay.transition || overlay.transition === 'instant') {
            setPlayTransition(false);
            return;
        }

        if (overlay.action === 'show') {
            setPlayTransition(false);
            timeoutRef.current = window.setTimeout(() => {
                setPlayTransition(true);
                timeoutRef.current = null;
            }, 0);
            return () => {
                if (timeoutRef.current !== null) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            };
        }

        setPlayTransition(true);
        return () => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [overlay.id, overlay.transition, overlay.action]);

    const applyTransition = playTransition && !!hasTransition;
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === 'hide') : '';
    const animDuration = `${overlay.duration ?? 0.5}s`;
    const isSlideTransition = overlay.transition === 'slide';
    const slideStyle = isSlideTransition ? buildSlideStyle(overlay.x, overlay.y ?? 0, overlay.action, stageSize) : {};

    // Apply tween interpolated values
    const tx = tweenValues?.x ?? overlay.x;
    const ty = tweenValues?.y ?? overlay.y;
    const tFontSize = tweenValues?.fontSize ?? overlay.fontSize;
    const tColor = tweenValues?.color ?? overlay.color;
    const tWidth = tweenValues?.width ?? overlay.width;
    const tHeight = tweenValues?.height ?? overlay.height;

    const baseStyle: React.CSSProperties = {
        left: `${tx}%`,
        top: `${ty}%`,
        ...(isSlideTransition ? {} : { transform: 'translate(-50%, -50%)' }),
        fontSize: `calc(var(--font-scale, 1) * ${tFontSize}px)`,
        fontFamily: overlay.fontFamily,
        color: tColor,
        fontWeight: overlay.fontWeight || 'normal',
        fontStyle: overlay.fontStyle || 'normal',
        letterSpacing: overlay.letterSpacing ? `calc(var(--font-scale, 1) * ${overlay.letterSpacing}px)` : undefined,
        width: tWidth ? `calc(var(--font-scale, 1) * ${tWidth}px)` : 'auto',
        height: tHeight ? `calc(var(--font-scale, 1) * ${tHeight}px)` : 'auto',
        textAlign: overlay.textAlign || 'left',
        display: 'flex',
        alignItems: overlay.verticalAlign === 'top' ? 'flex-start' : overlay.verticalAlign === 'bottom' ? 'flex-end' : 'center',
        justifyContent: overlay.textAlign === 'left' ? 'flex-start' : overlay.textAlign === 'right' ? 'flex-end' : 'center',
        whiteSpace: overlay.width ? 'pre-wrap' : 'nowrap',
        overflow: 'hidden',
    };

    // Apply text shadow / border / gradient via shared helper so editor & built game match.
    // When a gradient is active, the shadow is moved to the gradient span as drop-shadow
    // so it renders behind the transparent text (not on top).
    const { containerStyle: effectsContainerStyle, gradientSpanStyle } = buildTextEffectStyles({
        textShadow: overlay.textShadow,
        textGradient: overlay.textGradient,
        textBorder: overlay.textBorder,
    });
    Object.assign(baseStyle, effectsContainerStyle);

    // Only pre-hide if we're showing WITH a transition that hasn't started yet
    if (overlay.action === 'show' && hasTransition && !playTransition) {
        baseStyle.opacity = 0;
    }

    const className = `absolute${applyTransition ? ` ${transitionClass} transition-base` : ''}`;
    const style = {
        ...baseStyle,
        ...(applyTransition ? { animationDuration: animDuration } : {}),
        ...(isSlideTransition ? slideStyle : {}),
    } as React.CSSProperties;

    return (
        <div className={className} style={style}>
            {gradientSpanStyle ? <span style={gradientSpanStyle}>{overlay.text}</span> : overlay.text}
        </div>
    );
};

const ButtonOverlayElement: React.FC<{ 
    overlay: ButtonOverlay; 
    onAction: (action: VNUIAction) => void;
    playSound: (soundId: VNID | null) => void;
    onAdvance?: () => void;
    onCommitVariables?: () => void;
}> = ({ overlay, onAction, playSound, onAdvance, onCommitVariables }) => {
    const tweenValues = useTween(overlay.id, 'button');
    const [isHovered, setIsHovered] = useState(false);
    const hasTransition = overlay.transition && overlay.transition !== 'instant';
    const [playTransition, setPlayTransition] = useState<boolean>(overlay.action === 'hide' && !!hasTransition);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (!overlay.transition || overlay.transition === 'instant') {
            setPlayTransition(false);
            return;
        }

        if (overlay.action === 'show') {
            setPlayTransition(false);
            timeoutRef.current = window.setTimeout(() => {
                setPlayTransition(true);
                timeoutRef.current = null;
            }, 0);
            return () => {
                if (timeoutRef.current !== null) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            };
        }

        setPlayTransition(true);
        return () => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [overlay.id, overlay.transition, overlay.action]);

    const handleClick = (e?: React.MouseEvent) => {
        runtimeDebugLog('Button clicked:', overlay.text, 'Primary Action:', overlay.onClick, 'Additional Actions:', overlay.actions?.length || 0, 'quickMenuMode:', overlay.quickMenuMode);
        // Always consume the click so the stage's click-to-advance handler doesn't run
        // with stale state. The button's own logic (waitForClick / quickMenuMode) decides
        // whether to advance below.
        if (e) {
            e.stopPropagation();
        }
        if (overlay.clickSound) {
            try {
                playSound(overlay.clickSound);
            } catch (e) {
                console.error('Error playing button click sound:', e);
            }
        }

        const allActions: VNUIAction[] = [overlay.onClick, ...(overlay.actions || [])];
        const setVarActions = allActions.filter(action => action.type === UIActionType.SetVariable);
        const otherActions = allActions.filter(action => action.type !== UIActionType.SetVariable);

        // Process SetVariable actions first
        setVarActions.forEach(action => onAction(action));

        // CRITICAL: Commit variables to playerState BEFORE any navigation
        // This ensures JumpToScene/ReturnToPreviousScreen see the updated values
        if (setVarActions.length > 0 && onCommitVariables) {
            runtimeDebugLog('[Button] Committing', setVarActions.length, 'variable changes before navigation');
            onCommitVariables();
        }

        // Now process navigation/other actions with fresh playerState
        otherActions.forEach(action => onAction(action));

        // If this button requires click to advance, call the advance function
        // BUT: Don't advance if primary action is JumpToScene (it handles its own navigation),
        // and never advance for quick-menu buttons (they fire actions but don't consume the click).
        if (overlay.waitForClick && onAdvance && !overlay.quickMenuMode && overlay.onClick.type !== UIActionType.JumpToScene) {
            onAdvance();
        }
    };

    const applyTransition = playTransition && overlay.transition && overlay.transition !== 'instant';
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === 'hide') : '';
    const animDuration = `${overlay.duration ?? 0.3}s`;

    // Apply tween interpolated values
    const bx = tweenValues?.x ?? overlay.x;
    const by = tweenValues?.y ?? overlay.y;
    const bw = tweenValues?.width ?? overlay.width;
    const bh = tweenValues?.height ?? overlay.height;
    const bOpacity = tweenValues?.opacity ?? overlay.opacity;
    const bFontSize = tweenValues?.fontSize ?? overlay.fontSize;
    const bBorderRadius = tweenValues?.borderRadius ?? overlay.borderRadius;
    const bBgColor = tweenValues?.backgroundColor ?? overlay.backgroundColor;

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${bx}%`,
        top: `${by}%`,
        width: `${bw}%`,
        height: `${bh}%`,
        transform: `translate(-${overlay.anchorX * 100}%, -${overlay.anchorY * 100}%)`,
        pointerEvents: 'auto',
    };

    // Pre-hide if showing WITH a transition that hasn't started yet
    if (overlay.action === 'show' && hasTransition && !playTransition) {
        containerStyle.opacity = 0;
    }

    const buttonStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        backgroundColor: bBgColor,
        color: overlay.textColor,
        fontSize: `calc(var(--font-scale, 1) * ${bFontSize}px)`,
        fontWeight: overlay.fontWeight,
        borderRadius: `${bBorderRadius}px`,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.1s, box-shadow 0.1s',
        boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.2)',
        transform: isHovered ? 'translateY(-2px)' : 'none',
        opacity: bOpacity ?? 1,
    };

    const displayImage = isHovered && overlay.hoverImageUrl ? overlay.hoverImageUrl : overlay.imageUrl;

    return (
        <div
            key={overlay.id}
            style={{...containerStyle, ...(hasTransition ? { animationDuration: animDuration } : {})}}
            className={`${transitionClass}`}
        >
            <button
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={buttonStyle}
            >
                {displayImage ? (
                    <img src={displayImage} alt={overlay.text} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: `${overlay.borderRadius}px` }} />
                ) : (
                    <span>{overlay.text}</span>
                )}
            </button>
        </div>
    );
};

const ImageOverlayElement: React.FC<{ overlay: ImageOverlay; stageSize: StageSize }> = ({ overlay, stageSize }) => {
    const tweenValues = useTween(overlay.id, 'image');
    const hasTransition = overlay.transition && overlay.transition !== 'instant';
    const [playTransition, setPlayTransition] = useState<boolean>(overlay.action === 'hide' && !!hasTransition);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (!overlay.transition || overlay.transition === 'instant') {
            setPlayTransition(false);
            return;
        }

        if (overlay.action === 'show') {
            setPlayTransition(false);
            timeoutRef.current = window.setTimeout(() => {
                setPlayTransition(true);
                timeoutRef.current = null;
            }, 0);
            return () => {
                if (timeoutRef.current !== null) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
            };
        }

        setPlayTransition(true);
        return () => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [overlay.id, overlay.transition, overlay.action]);

    const applyTransition = playTransition && overlay.transition && overlay.transition !== 'instant';
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === 'hide') : '';
    const animDuration = `${overlay.duration ?? 0.5}s`;
    const isSlideTransition = overlay.transition === 'slide';
    const slideStyle = isSlideTransition ? buildSlideStyle(overlay.x, overlay.y ?? 0, overlay.action, stageSize) : {};

    // Apply tween interpolated values
    const ix = tweenValues?.x ?? overlay.x;
    const iy = tweenValues?.y ?? overlay.y;
    const iw = tweenValues?.width ?? overlay.width;
    const ih = tweenValues?.height ?? overlay.height;
    const iOpacity = tweenValues?.opacity ?? overlay.opacity;
    const iRotation = tweenValues?.rotation ?? overlay.rotation;
    const iScaleX = tweenValues?.scaleX ?? overlay.scaleX;
    const iScaleY = tweenValues?.scaleY ?? overlay.scaleY;

    const containerStyle: React.CSSProperties = {
        left: `${ix}%`,
        top: `${iy}%`,
        width: `${iw}px`,
        height: `${ih}px`,
        ...(isSlideTransition ? {} : { transform: 'translate(-50%, -50%)' }),
    };

    // Only pre-hide if we're showing WITH a transition that hasn't started yet
    if (overlay.action === 'show' && hasTransition && !playTransition) {
        containerStyle.opacity = 0;
    }

    const imageStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        transform: `rotate(${iRotation}deg) scale(${iScaleX}, ${iScaleY})`,
        transformOrigin: 'center center',
        opacity: iOpacity,
    };

    const className = `absolute${applyTransition ? ` ${transitionClass} transition-base` : ''}`;
    const style = {
        ...containerStyle,
        ...(applyTransition ? { animationDuration: animDuration } : {}),
        ...(isSlideTransition ? slideStyle : {}),
    } as React.CSSProperties;

    return (
        <div className={className} style={style}>
            {overlay.isVideo && overlay.videoUrl ? (
                <video 
                    src={overlay.videoUrl} 
                    autoPlay 
                    muted 
                    loop={overlay.videoLoop} 
                    playsInline
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
                    style={imageStyle} 
                />
            ) : (
                <img 
                    src={overlay.imageUrl} 
                    alt="" 
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
                    style={imageStyle} 
                />
            )}
        </div>
    );
};

/** Renders a single image map region as a CSS overlay with click handling */
const ImageMapRegionElement: React.FC<{
    region: import('./live-preview/types/gameState').ImageMapRegionOverlay;
    containerWidth: number;
    containerHeight: number;
    hasHoverImage?: boolean;
    onAction: (action: VNUIAction) => void;
    onAdvance?: () => void;
    onCommitVariables?: () => void;
    evaluateConditions: (conditions: VNCondition[] | undefined, variables: Record<VNID, string | number | boolean>) => boolean;
    variables: Record<VNID, string | number | boolean>;
    onRegionHover?: (regionId: string) => void;
    onRegionLeave?: () => void;
}> = ({ region, containerWidth, containerHeight, hasHoverImage, onAction, onAdvance, onCommitVariables, evaluateConditions, variables, onRegionHover, onRegionLeave }) => {
    const [isHovered, setIsHovered] = useState(false);

    if (region.conditions && region.conditions.length > 0) {
        if (!evaluateConditions(region.conditions, variables)) return null;
    }

    const handleClick = () => {
        const setVarActions = region.actions.filter(a => a.type === UIActionType.SetVariable);
        const otherActions = region.actions.filter(a => a.type !== UIActionType.SetVariable);
        setVarActions.forEach(a => onAction(a));
        if (setVarActions.length > 0 && onCommitVariables) onCommitVariables();
        otherActions.forEach(a => onAction(a));
        if (onAdvance) onAdvance();
    };

    const highlightColor = region.highlightColor || 'rgba(100, 149, 237, 0.3)';
    const cursor = region.cursor || 'pointer';

    const handleMouseEnter = () => {
        setIsHovered(true);
        if (onRegionHover) onRegionHover(region.id);
    };
    const handleMouseLeave = () => {
        setIsHovered(false);
        if (onRegionLeave) onRegionLeave();
    };

    if (region.shape === 'rect' && region.coords.length >= 4) {
        const [x, y, w, h] = region.coords;
        return (
            <div
                style={{
                    position: 'absolute',
                    left: `${x}%`, top: `${y}%`,
                    width: `${w}%`, height: `${h}%`,
                    cursor,
                    backgroundColor: isHovered && !hasHoverImage ? highlightColor : 'transparent',
                    transition: 'background-color 0.15s',
                    pointerEvents: 'auto',
                    borderRadius: 2,
                    zIndex: 2,
                }}
                title={region.tooltip}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            />
        );
    }

    if (region.shape === 'circle' && region.coords.length >= 3) {
        const [cx, cy, r] = region.coords;
        return (
            <div
                style={{
                    position: 'absolute',
                    left: `${cx - r}%`, top: `${cy - r}%`,
                    width: `${r * 2}%`, height: `${r * 2}%`,
                    borderRadius: '50%',
                    cursor,
                    backgroundColor: isHovered && !hasHoverImage ? highlightColor : 'transparent',
                    transition: 'background-color 0.15s',
                    pointerEvents: 'auto',
                    zIndex: 2,
                }}
                title={region.tooltip}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            />
        );
    }

    if (region.shape === 'poly' && region.coords.length >= 6) {
        const points = [];
        for (let i = 0; i < region.coords.length; i += 2) {
            points.push(`${(region.coords[i] / 100) * containerWidth},${(region.coords[i + 1] / 100) * containerHeight}`);
        }
        return (
            <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
                <polygon
                    points={points.join(' ')}
                    fill={isHovered && !hasHoverImage ? highlightColor : 'transparent'}
                    style={{ cursor, pointerEvents: 'auto', transition: 'fill 0.15s' }}
                    onClick={handleClick}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    {region.tooltip && <title>{region.tooltip}</title>}
                </polygon>
            </svg>
        );
    }

    return null;
};

/** Computes a CSS clip-path string for a given image map region */
const getRegionClipPath = (region: import('./live-preview/types/gameState').ImageMapRegionOverlay): string | undefined => {
    if (region.shape === 'rect' && region.coords.length >= 4) {
        const [x, y, w, h] = region.coords;
        return `inset(${y}% ${100 - x - w}% ${100 - y - h}% ${x}%)`;
    }
    if (region.shape === 'circle' && region.coords.length >= 3) {
        const [cx, cy, r] = region.coords;
        return `circle(${r}% at ${cx}% ${cy}%)`;
    }
    if (region.shape === 'poly' && region.coords.length >= 6) {
        const points: string[] = [];
        for (let i = 0; i < region.coords.length; i += 2) {
            points.push(`${region.coords[i]}% ${region.coords[i + 1]}%`);
        }
        return `polygon(${points.join(', ')})`;
    }
    return undefined;
};

/** Renders a full image map overlay (image + clickable regions) */
const ImageMapOverlayElement: React.FC<{
    overlay: ImageMapOverlay;
    onAction: (action: VNUIAction) => void;
    onAdvance?: () => void;
    onCommitVariables?: () => void;
    evaluateConditions: (conditions: VNCondition[] | undefined, variables: Record<VNID, string | number | boolean>) => boolean;
    variables: Record<VNID, string | number | boolean>;
}> = ({ overlay, onAction, onAdvance, onCommitVariables, evaluateConditions, variables }) => {
    const tweenValues = useTween(overlay.id, 'imageMap');
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
    const hasTransition = overlay.transition && overlay.transition !== 'instant';
    const [playTransition, setPlayTransition] = useState<boolean>(overlay.action === 'hide' && !!hasTransition);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
        if (!overlay.transition || overlay.transition === 'instant') { setPlayTransition(false); return; }
        if (overlay.action === 'show') {
            setPlayTransition(false);
            timeoutRef.current = window.setTimeout(() => { setPlayTransition(true); timeoutRef.current = null; }, 0);
            return () => { if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; } };
        }
        setPlayTransition(true);
        return () => { if (timeoutRef.current !== null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; } };
    }, [overlay.id, overlay.transition, overlay.action]);

    useEffect(() => {
        if (!containerRef.current) return;
        const obs = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    const applyTransition = playTransition && overlay.transition && overlay.transition !== 'instant';
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === 'hide') : '';
    const animDuration = `${overlay.duration ?? 0.5}s`;

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${tweenValues?.x ?? overlay.x}%`, top: `${tweenValues?.y ?? overlay.y}%`,
        width: `${tweenValues?.width ?? overlay.width}%`, height: `${tweenValues?.height ?? overlay.height}%`,
        opacity: tweenValues?.opacity ?? overlay.opacity,
        pointerEvents: 'auto',
    };

    if (overlay.action === 'show' && hasTransition && !playTransition) {
        containerStyle.opacity = 0;
    }

    return (
        <div
            ref={containerRef}
            className={applyTransition ? transitionClass : ''}
            style={{ ...containerStyle, ...(applyTransition ? { animationDuration: animDuration } : {}),
                // A forwards-filled entrance animation animates opacity and would override the
                // inline opacity, so disable it when a tween controls this element's opacity.
                ...(tweenValues?.opacity !== undefined ? { animationName: 'none' } : {}) }}
        >
            <img src={overlay.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
            {/* Ren'Py-style hover image: full-size overlay clipped to hovered region */}
            {overlay.hoverImageUrl && hoveredRegionId && (() => {
                const hoveredRegion = overlay.regions.find(r => r.id === hoveredRegionId);
                if (!hoveredRegion) return null;
                const clipPath = getRegionClipPath(hoveredRegion);
                if (!clipPath) return null;
                return (
                    <img
                        src={overlay.hoverImageUrl}
                        alt=""
                        style={{
                            position: 'absolute',
                            left: 0, top: 0,
                            width: '100%', height: '100%',
                            objectFit: 'contain',
                            pointerEvents: 'none',
                            clipPath,
                            zIndex: 1,
                        }}
                    />
                );
            })()}
            {overlay.regions.map(region => (
                <ImageMapRegionElement
                    key={region.id}
                    region={region}
                    containerWidth={containerSize.width}
                    containerHeight={containerSize.height}
                    hasHoverImage={!!overlay.hoverImageUrl}
                    onAction={onAction}
                    onAdvance={onAdvance}
                    onCommitVariables={onCommitVariables}
                    evaluateConditions={evaluateConditions}
                    variables={variables}
                    onRegionHover={setHoveredRegionId}
                    onRegionLeave={() => setHoveredRegionId(null)}
                />
            ))}
        </div>
    );
};

// GameStateSave interface (keeping local as it's not in extracted types)
interface GameStateSave {
    timestamp: number;
    sceneName: string;
    playerStateData: {
        currentSceneId: VNID;
        currentCommands: VNCommand[];
        currentIndex: number;
        commandStack: Array<{sceneId: VNID, commands: VNCommand[], index: number}>;
        variables: Record<VNID, string | number | boolean>;
        stageState: StageState;
        musicState: MusicState;
    }
}

// --- Typewriter Hook ---
const useTypewriter = (text: string, speed: number) => {
    const [displayText, setDisplayText] = useState('');
    const hasFinished = displayText.length === text.length;

    useEffect(() => {
        setDisplayText('');
        if (!text) return;

        const interval = setInterval(() => {
            setDisplayText(prev => {
                if (prev.length < text.length) {
                    return text.substring(0, prev.length + 1);
                } else {
                    clearInterval(interval);
                    return prev;
                }
            });
        }, 1000 / speed);

        return () => clearInterval(interval);
    }, [text, speed]);
    
    const skip = () => setDisplayText(text);

    return { displayText, skip, hasFinished };
};

// --- Stage size & measurement hook ---
const useStageSize = (ref: React.RefObject<HTMLElement | null>) => {
    const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });
    // Track ref.current becoming available (e.g. after conditional render)
    const [element, setElement] = useState<HTMLElement | null>(null);

    // Poll for ref.current to handle conditionally-rendered elements
    useEffect(() => {
        if (ref.current) {
            setElement(ref.current);
            return;
        }
        // ref.current is null — poll until the element mounts
        const interval = setInterval(() => {
            if (ref.current) {
                setElement(ref.current);
                clearInterval(interval);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [ref]);

    // Observe the actual element once available
    useEffect(() => {
        if (!element) return;
        let rafId: number | null = null;
        
        const obs = new ResizeObserver(() => {
            // Debounce with RAF to avoid rapid updates
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
            rafId = requestAnimationFrame(() => {
                const r = element.getBoundingClientRect();
                setSize(prev => {
                    // Only update if size actually changed
                    if (prev.width === r.width && prev.height === r.height) {
                        return prev;
                    }
                    return { width: r.width, height: r.height };
                });
            });
        });
        obs.observe(element);
        // initial measure
        const r = element.getBoundingClientRect();
        setSize({ width: r.width, height: r.height });
        return () => {
            obs.disconnect();
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, [element]);

    // Sync if ref changes to a different element (e.g. remount)
    useEffect(() => {
        if (ref.current && ref.current !== element) {
            setElement(ref.current);
        }
    });

    return size;
}

// --- UI Rendering Helpers ---

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

/** Scale a pixel value by the --font-scale CSS variable so layout proportions
 *  remain consistent regardless of actual container size. */
const scalePx = (n: number) => `calc(var(--font-scale,1) * ${n}px)`;

// --- Player UI Components ---
const DialogueBox: React.FC<{ dialogue: PlayerState['uiState']['dialogue'], settings: GameSettings, projectUI: any, onFinished: () => void, variables: Record<VNID, string | number | boolean>, project: VNProject }> = ({ dialogue, settings, projectUI, onFinished, variables, project }) => {
    if (!dialogue) return null;
    const interpolatedText = interpolateVariables(dialogue.text, variables, project);
    const { displayText, skip, hasFinished } = useTypewriter(interpolatedText, settings.textSpeed);
    
    const handleClick = () => {
        if (hasFinished) {
            onFinished();
        } else if (settings.enableSkip) {
            skip();
        }
    }

    // Resolve dialogue box image/video URL
    const dialogueBoxUrl = projectUI.dialogueBoxImage 
        ? (projectUI.dialogueBoxImage.type === 'video' 
            ? project.videos[projectUI.dialogueBoxImage.id]?.videoUrl 
            : (project.images[projectUI.dialogueBoxImage.id]?.imageUrl || project.backgrounds[projectUI.dialogueBoxImage.id]?.imageUrl)
          )
        : null;
    const isDialogueBoxVideo = projectUI.dialogueBoxImage?.type === 'video';

    // Resolve dialogue box border image URL
    const dialogueBorderUrl = projectUI.dialogueBoxBorderImage
        ? (project.images[projectUI.dialogueBoxBorderImage.id]?.imageUrl || project.backgrounds[projectUI.dialogueBoxBorderImage.id]?.imageUrl)
        : null;
    const dialogueBorderPadding = projectUI.dialogueBorderPadding ?? 12;

    // Dialogue box layout settings
    const dialogueBoxWidth = projectUI.dialogueBoxWidth ?? 100;
    const dialogueBoxHeight = projectUI.dialogueBoxHeight || 0;
    const dialogueBoxBottomMargin = projectUI.dialogueBoxBottomMargin ?? 20;
    const dialogueBoxPadding = projectUI.dialogueBoxPadding ?? 20;

    // New appearance settings
    const dialogueSizeMode = projectUI.dialogueBoxSizeMode ?? 'stretch';
    const dialogueSlice = projectUI.dialogueBoxSlice ?? 30;
    const dialogueColor = projectUI.dialogueBoxColor ?? '#0f172a';
    const dialogueOpacity = projectUI.dialogueBoxOpacity ?? 90;
    const dialogueBorderRadius = projectUI.dialogueBoxBorderRadius ?? 8;

    // Namebox settings
    const nameboxImageUrl = projectUI.nameboxImage
        ? (project.images[projectUI.nameboxImage.id]?.imageUrl || project.backgrounds[projectUI.nameboxImage.id]?.imageUrl)
        : null;
    const nameboxColor = projectUI.nameboxColor ?? '#0f172a';
    const nameboxOpacity = projectUI.nameboxOpacity ?? 92;
    const nameboxPadding = projectUI.nameboxPadding ?? 8;
    const nameboxHPadding = projectUI.nameboxHorizontalPadding ?? 14;
    const nameboxBorderRadius = projectUI.nameboxBorderRadius ?? 6;
    const nameboxOffsetX = projectUI.nameboxOffsetX ?? 20;
    const nameboxOffsetY = projectUI.nameboxOffsetY ?? 0;
    const nameboxSizeMode = projectUI.nameboxSizeMode ?? 'stretch';

    // Get character-specific font if available
    const character = dialogue.characterId ? project.characters[dialogue.characterId] : null;
    const characterFont = character?.fontFamily;
    const characterFontSize = character?.fontSize;
    const characterFontWeight = character?.fontWeight;
    const characterFontItalic = character?.fontItalic;
    
    const dialogueTextStyle = {
        ...fontSettingsToStyle(projectUI.dialogueTextFont),
        ...(characterFont ? { fontFamily: characterFont } : {}),
        ...(characterFontSize ? { fontSize: `calc(var(--font-scale, 1) * ${characterFontSize}px)` } : {}),
        ...(characterFontWeight ? { fontWeight: characterFontWeight } : {}),
        ...(characterFontItalic ? { fontStyle: 'italic' } : {})
    };

    const hasCustomImage = dialogueBoxUrl || dialogueBorderUrl;
    const showNamebox = dialogue.characterName !== 'Narrator';

    // Namebox style: uses name font with character colour override
    const nameStyle: React.CSSProperties = {
        ...fontSettingsToStyle(projectUI.dialogueNameFont),
        ...(dialogue.characterColor && dialogue.characterColor !== '#FFFFFF' ? { color: dialogue.characterColor } : {})
    };

    // Build namebox background style
    const nameboxBgStyle: React.CSSProperties = nameboxImageUrl
        ? { ...buildImageBackgroundStyle(nameboxImageUrl, nameboxSizeMode), borderRadius: scalePx(nameboxBorderRadius) }
        : { backgroundColor: hexToRgba(nameboxColor, nameboxOpacity), borderRadius: scalePx(nameboxBorderRadius) };

    // Build dialogue box background color (used when no image, or behind transparent images)
    const dialogueBgColor = hexToRgba(dialogueColor, dialogueOpacity);

    // Build image style for the dialogue box
    const dialogueImageStyle: React.CSSProperties = (dialogueBoxUrl && !isDialogueBoxVideo)
        ? buildImageBackgroundStyle(dialogueBoxUrl, dialogueSizeMode, dialogueSlice)
        : {};

    /* ── Percentage-based layout rects (matching InGameUIEditor) ── */
    const gameW = project.gameResolution?.width || 1920;
    const gameH = project.gameResolution?.height || 1080;

    const dialogueHPct = dialogueBoxHeight ? (dialogueBoxHeight * 100 / gameH) : 20;
    const dialogueXPct = projectUI.dialogueBoxX ?? ((100 - dialogueBoxWidth) / 2);
    const bmPct = dialogueBoxBottomMargin * 100 / gameH;
    // If a bottom Quick Menu preset is active and the user hasn't overridden
    // the dialogue Y or Quick Menu Y, reserve room at the bottom so the
    // dialogue box sits just above the menu rather than on top of it.
    // Skip reservation if quickMenuFloatOverDialogue is enabled.
    const _qmPosForReserve = projectUI.quickMenuPosition ?? 'above-dialogue';
    const _isBottomQmPreset = _qmPosForReserve === 'bottom-right' || _qmPosForReserve === 'bottom-left';
    const _shouldFloatQm = projectUI.quickMenuFloatOverDialogue ?? false;
    const _qmBottomReservePct = (!_shouldFloatQm && _isBottomQmPreset && projectUI.quickMenuY === undefined)
        ? ((projectUI.quickMenuHeight ?? 4) + 2)
        : 0;
    const dialogueYPct = projectUI.dialogueBoxY ?? (100 - dialogueHPct - bmPct - _qmBottomReservePct);

    const nameWPct = projectUI.nameboxWidth ?? 15;
    const nameHPct = projectUI.nameboxHeight ?? 5;
    const nameXPct = projectUI.nameboxX ?? (dialogueXPct + nameboxOffsetX * 100 / gameW);
    const nameYPct = projectUI.nameboxY ?? (dialogueYPct - nameHPct - nameboxOffsetY * 100 / gameH);

    const textPadTop = projectUI.dialogueTextPaddingTop ?? 0;
    const textPadBot = projectUI.dialogueTextPaddingBottom ?? 0;
    const textPadLeft = projectUI.dialogueTextPaddingLeft ?? 0;
    const textPadRight = projectUI.dialogueTextPaddingRight ?? 0;

    return (
        <>
            {/* Namebox – positioned independently (matching InGameUIEditor) */}
            {showNamebox && (
                <div
                    className="absolute z-[21] cursor-pointer"
                    style={{
                        left: `${nameXPct}%`,
                        top: `${nameYPct}%`,
                        width: `${nameWPct}%`,
                        height: `${nameHPct}%`,
                        animation: 'vnDialogueIn 0.25s ease-out',
                    }}
                    onClick={handleClick}
                >
                    <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: projectUI.dialogueNameFont?.align === 'center' ? 'center' : projectUI.dialogueNameFont?.align === 'right' ? 'flex-end' : 'flex-start',
                        ...nameboxBgStyle,
                        padding: `${scalePx(nameboxPadding)} ${scalePx(nameboxHPadding)}`,
                        ...(hasCustomImage || nameboxImageUrl ? {} : {
                            border: '1px solid rgba(148,163,184,0.35)',
                            backdropFilter: 'blur(6px)',
                            WebkitBackdropFilter: 'blur(6px)',
                        }),
                    }}>
                        <span style={{...nameStyle, lineHeight: 1.3}}>
                            <span style={extractTextGradientStyle(projectUI.dialogueNameFont) || undefined}>{dialogue.characterName}</span>
                        </span>
                    </div>
                </div>
            )}
            {/* Dialogue box – percentage positioned (matching InGameUIEditor) */}
            <div 
                className="absolute z-20 cursor-pointer"
                style={{
                    left: `${dialogueXPct}%`,
                    top: `${dialogueYPct}%`,
                    width: `${dialogueBoxWidth}%`,
                    height: `${dialogueHPct}%`,
                    animation: 'vnDialogueIn 0.25s ease-out',
                    ...(dialogueBorderUrl 
                        ? { ...buildImageBackgroundStyle(dialogueBorderUrl, dialogueSizeMode, dialogueSlice), padding: scalePx(dialogueBorderPadding), borderRadius: scalePx(dialogueBorderRadius) }
                        : {})
                }}
                onClick={handleClick}
            >
                <div 
                    className="relative"
                    style={{
                        borderRadius: scalePx(dialogueBorderRadius),
                        overflow: 'hidden',
                        width: '100%',
                        height: '100%',
                        ...(hasCustomImage ? {} : {
                            backgroundColor: dialogueBgColor,
                            border: '1px solid rgba(148,163,184,0.25)',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                        }),
                        ...(dialogueBoxUrl && !isDialogueBoxVideo 
                            ? { 
                                ...dialogueImageStyle,
                                backgroundColor: dialogueBgColor,
                                ...(dialogueSizeMode !== 'nine-slice' ? { padding: scalePx(dialogueBoxPadding) } : {})
                              } 
                            : { padding: scalePx(dialogueBoxPadding) })
                    }}
                >
                    {isDialogueBoxVideo && dialogueBoxUrl && (
                        <video 
                            autoPlay 
                            loop 
                            muted 
                            className="absolute inset-0 w-full h-full -z-10"
                            style={{ pointerEvents: 'none', objectFit: 'fill', borderRadius: scalePx(dialogueBorderRadius) }}
                        >
                            <source src={dialogueBoxUrl} />
                        </video>
                    )}
                    <div style={{
                        position: 'relative',
                        zIndex: 1,
                        padding: dialogueSizeMode === 'nine-slice' && dialogueBoxUrl ? scalePx(dialogueBoxPadding) : undefined,
                        paddingTop: textPadTop ? scalePx(textPadTop) : undefined,
                        paddingBottom: textPadBot ? scalePx(textPadBot) : undefined,
                        paddingLeft: textPadLeft ? scalePx(textPadLeft) : undefined,
                        paddingRight: textPadRight ? scalePx(textPadRight) : undefined,
                    }}>
                        <p className="leading-relaxed" style={{...dialogueTextStyle, wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const}}>
                            <AnimatedDialogueText 
                                displayText={displayText}
                                textEffect={dialogue.textEffect}
                                gradientStyle={extractTextGradientStyle(projectUI.dialogueTextFont) || undefined}
                            />
                            {!hasFinished && (
                                <span style={{ 
                                    display: 'inline-block', 
                                    width: '0.5em', 
                                    height: '1em', 
                                    marginLeft: '2px', 
                                    verticalAlign: 'text-bottom',
                                    backgroundColor: dialogueTextStyle.color || projectUI.dialogueTextFont?.color || '#FFFFFF',
                                    animation: 'vnCursorBlink 0.8s step-end infinite',
                                    opacity: 0.85
                                }} />
                            )}
                        </p>
                        {/* Click-to-advance indicator */}
                        {hasFinished && (
                            <div style={{
                                position: 'absolute',
                                bottom: '8px',
                                right: '12px',
                                animation: 'vnAdvanceBounce 1.2s ease-in-out infinite',
                                opacity: 0.6,
                                fontSize: 'calc(var(--font-scale, 1) * 12px)',
                                color: '#94a3b8',
                            }}>
                                ▼
                            </div>
                        )}
                    </div>
                </div>
                {/* Inject keyframe animations */}
                <style>{`
                    @keyframes vnDialogueIn {
                        from { opacity: 0; transform: translateY(12px); }
                        to   { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes vnCursorBlink {
                        0%, 100% { opacity: 0.85; }
                        50% { opacity: 0; }
                    }
                    @keyframes vnAdvanceBounce {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(4px); }
                    }
                `}</style>
            </div>
        </>
    );
};

const ChoiceMenu: React.FC<{ choices: ChoiceOption[], projectUI: any, onSelect: (choice: ChoiceOption) => void, variables: Record<VNID, string | number | boolean>, project: VNProject }> = ({ choices, projectUI, onSelect, variables, project }) => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    
    // Resolve choice button image/video URL
    const choiceButtonUrl = projectUI.choiceButtonImage 
        ? (projectUI.choiceButtonImage.type === 'video' 
            ? project.videos[projectUI.choiceButtonImage.id]?.videoUrl 
            : (project.images[projectUI.choiceButtonImage.id]?.imageUrl || project.backgrounds[projectUI.choiceButtonImage.id]?.imageUrl)
          )
        : null;
    const isChoiceButtonVideo = projectUI.choiceButtonImage?.type === 'video';

    // Resolve choice button border image URL
    const choiceBorderUrl = projectUI.choiceButtonBorderImage
        ? (project.images[projectUI.choiceButtonBorderImage.id]?.imageUrl || project.backgrounds[projectUI.choiceButtonBorderImage.id]?.imageUrl)
        : null;
    const choiceBorderPadding = projectUI.choiceBorderPadding ?? 8;

    // Choice button layout settings
    const choiceWidth = projectUI.choiceButtonWidth || 0;
    const choiceHeight = projectUI.choiceButtonHeight || 0;
    const choicePadding = projectUI.choiceButtonPadding ?? 16;

    // New appearance settings
    const choiceSizeMode = projectUI.choiceButtonSizeMode ?? 'stretch';
    const choiceSlice = projectUI.choiceButtonSlice ?? 15;
    const choiceColor = projectUI.choiceButtonColor ?? '#1e293b';
    const choiceOpacity = projectUI.choiceButtonOpacity ?? 90;
    const choiceBorderRadius = projectUI.choiceButtonBorderRadius ?? 8;
    const choiceHoverColor = projectUI.choiceHoverColor ?? '#334155';

    // Resolve hover image
    const choiceHoverUrl = projectUI.choiceHoverImage
        ? (project.images[projectUI.choiceHoverImage.id]?.imageUrl || project.backgrounds[projectUI.choiceHoverImage.id]?.imageUrl)
        : null;

    const hasCustomChoiceImage = choiceButtonUrl || choiceBorderUrl;
    const choiceBgColor = hexToRgba(choiceColor, choiceOpacity);
    const choiceHoverBgColor = hexToRgba(choiceHoverColor, choiceOpacity);

    /* ── Percentage-based layout rect (matching InGameUIEditor) ── */
    const gameW = project.gameResolution?.width || 1920;
    const gameH = project.gameResolution?.height || 1080;
    const choiceWPct = choiceWidth ? (choiceWidth * 100 / gameW) : 30;
    const choiceHPct = choiceHeight ? (choiceHeight * 100 / gameH) : 25;
    const choiceXPct = projectUI.choiceButtonX ?? (50 - choiceWPct / 2);
    const choiceYPct = projectUI.choiceButtonY ?? 35;

    return (
        <div className="absolute z-30 flex flex-col items-center justify-center"
             style={{
                 left: `${choiceXPct}%`,
                 top: `${choiceYPct}%`,
                 width: `${choiceWPct}%`,
                 height: `${choiceHPct}%`,
                 animation: 'vnChoiceOverlayIn 0.3s ease-out',
             }}>
            {choices.map((choice, index) => {
                const interpolatedText = interpolateVariables(choice.text, variables, project);
                const isHovered = hoveredIndex === index;
                // Determine which image url to use (hover image takes priority when hovered)
                const activeButtonUrl = (isHovered && choiceHoverUrl) ? choiceHoverUrl : choiceButtonUrl;
                
                return (
                    <div
                        key={index}
                        className="mb-3"
                        style={{
                            animation: `vnChoiceSlideIn 0.35s ease-out ${index * 0.08}s both`,
                            width: '100%',
                            ...(choiceBorderUrl 
                                ? { ...buildImageBackgroundStyle(choiceBorderUrl, choiceSizeMode, choiceSlice), padding: scalePx(choiceBorderPadding), borderRadius: scalePx(choiceBorderRadius) }
                                : {})
                        }}
                    >
                        <button 
                            onClick={() => onSelect(choice)}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            className="relative overflow-hidden w-full transition-all duration-200 hover:scale-[1.03]"
                            style={{
                                borderRadius: scalePx(choiceBorderRadius),
                                ...(activeButtonUrl && !isChoiceButtonVideo 
                                    ? { 
                                        ...buildImageBackgroundStyle(activeButtonUrl, choiceSizeMode, choiceSlice),
                                        backgroundColor: isHovered ? choiceHoverBgColor : choiceBgColor,
                                      } 
                                    : !hasCustomChoiceImage 
                                        ? { 
                                            backgroundColor: isHovered ? choiceHoverBgColor : choiceBgColor,
                                            border: '1px solid rgba(148,163,184,0.3)',
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
                                            backdropFilter: 'blur(6px)',
                                            WebkitBackdropFilter: 'blur(6px)',
                                          } 
                                        : { backgroundColor: isHovered ? choiceHoverBgColor : 'transparent' }),
                                padding: `${scalePx(choicePadding)} ${scalePx(choicePadding * 2)}`, 
                                ...(choiceHeight ? { height: scalePx(choiceHeight) } : {}), 
                                ...fontSettingsToStyle(projectUI.choiceTextFont), 
                                textAlign: (projectUI.choiceTextFont?.align || 'center') as any, 
                                wordBreak: 'break-word' as const, 
                                overflowWrap: 'break-word' as const,
                                cursor: 'pointer',
                            }}
                        >
                            {isChoiceButtonVideo && choiceButtonUrl && (
                                <video 
                                    autoPlay 
                                    loop 
                                    muted 
                                    className="absolute inset-0 w-full h-full -z-10"
                                    style={{ pointerEvents: 'none', objectFit: 'fill', borderRadius: scalePx(choiceBorderRadius) }}
                                >
                                    <source src={choiceButtonUrl} />
                                </video>
                            )}
                            <span className="relative z-10" style={extractTextGradientStyle(projectUI.choiceTextFont) || undefined}>{interpolatedText}</span>
                        </button>
                    </div>
                );
            })}
            {/* Inject choice keyframe animations */}
            <style>{`
                @keyframes vnChoiceOverlayIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes vnChoiceSlideIn {
                    from { opacity: 0; transform: translateY(16px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

const TextInputForm: React.FC<{ textInput: PlayerState['uiState']['textInput'], onSubmit: (value: string) => void, variables: Record<VNID, string | number | boolean>, project: VNProject, projectUI?: any }> = ({ textInput, onSubmit, variables, project, projectUI }) => {
    const [inputValue, setInputValue] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(inputValue);
    };

    const interpolatedPrompt = interpolateVariables(textInput.prompt, variables, project);

    // Resolve input box image/video URL
    const inputBoxUrl = projectUI?.inputBoxImage
        ? (projectUI.inputBoxImage.type === 'video'
            ? project.videos[projectUI.inputBoxImage.id]?.videoUrl
            : (project.images[projectUI.inputBoxImage.id]?.imageUrl || project.backgrounds[projectUI.inputBoxImage.id]?.imageUrl)
          )
        : null;
    const isInputBoxVideo = projectUI?.inputBoxImage?.type === 'video';

    // Resolve input box border image URL
    const inputBorderUrl = projectUI?.inputBoxBorderImage
        ? (project.images[projectUI.inputBoxBorderImage.id]?.imageUrl || project.backgrounds[projectUI.inputBoxBorderImage.id]?.imageUrl)
        : null;
    const inputBorderPadding = projectUI?.inputBorderPadding ?? 8;
    const inputBoxWidth = projectUI?.inputBoxWidth || 0;
    const inputBoxPadding = projectUI?.inputBoxPadding ?? 24;

    // New appearance settings
    const inputSizeMode = projectUI?.inputBoxSizeMode ?? 'stretch';
    const inputSlice = projectUI?.inputBoxSlice ?? 20;
    const inputColor = projectUI?.inputBoxColor ?? '#0f172a';
    const inputOpacity = projectUI?.inputBoxOpacity ?? 92;
    const inputBorderRadius = projectUI?.inputBoxBorderRadius ?? 8;
    const inputBgColor = hexToRgba(inputColor, inputOpacity);

    const hasCustomImage = inputBoxUrl || inputBorderUrl;

    // Font styles
    const promptStyle: React.CSSProperties = projectUI?.inputPromptFont
        ? { ...fontSettingsToStyle(projectUI.inputPromptFont), textAlign: projectUI.inputPromptFont.align || 'center' }
        : { color: '#FFFFFF', textAlign: 'center' };
    const fieldStyle: React.CSSProperties = projectUI?.inputFieldFont
        ? fontSettingsToStyle(projectUI.inputFieldFont)
        : { color: '#FFFFFF' };
    const submitStyle: React.CSSProperties = projectUI?.inputSubmitFont
        ? fontSettingsToStyle(projectUI.inputSubmitFont)
        : { color: '#FFFFFF' };

    /* ── Percentage-based layout rect (matching InGameUIEditor) ── */
    const gameW = project.gameResolution?.width || 1920;
    const gameH = project.gameResolution?.height || 1080;
    const inputWPct = inputBoxWidth ? (inputBoxWidth * 100 / gameW) : 30;
    const inputHPct = projectUI?.inputBoxHeight ? (projectUI.inputBoxHeight * 100 / gameH) : 20;
    const inputXPct = projectUI?.inputBoxX ?? (50 - inputWPct / 2);
    const inputYPct = projectUI?.inputBoxY ?? 40;

    return (
        <div className="absolute z-30 flex flex-col items-center justify-center"
             style={{
                 left: `${inputXPct}%`,
                 top: `${inputYPct}%`,
                 width: `${inputWPct}%`,
                 height: `${inputHPct}%`,
             }}>
            <div
                className="relative"
                style={{
                    borderRadius: scalePx(inputBorderRadius),
                    width: '100%',
                    ...(inputBorderUrl
                        ? { ...buildImageBackgroundStyle(inputBorderUrl, inputSizeMode, inputSlice), padding: scalePx(inputBorderPadding) }
                        : {}),
                    animation: 'vnDialogueIn 0.25s ease-out',
                }}
            >
                <div
                    className="relative"
                    style={{
                        borderRadius: scalePx(inputBorderRadius),
                        overflow: 'hidden',
                        ...(hasCustomImage ? {} : {
                            backgroundColor: inputBgColor,
                            border: '1px solid rgba(148,163,184,0.3)',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                        }),
                        ...(inputBoxUrl && !isInputBoxVideo
                            ? { ...buildImageBackgroundStyle(inputBoxUrl, inputSizeMode, inputSlice), backgroundColor: inputBgColor, ...(inputSizeMode !== 'nine-slice' ? { padding: scalePx(inputBoxPadding) } : {}) }
                            : { padding: scalePx(inputBoxPadding) })
                    }}
                >
                    {isInputBoxVideo && inputBoxUrl && (
                        <video
                            autoPlay
                            loop
                            muted
                            className="absolute inset-0 w-full h-full -z-10"
                            style={{ pointerEvents: 'none', objectFit: 'fill', borderRadius: scalePx(inputBorderRadius) }}
                        >
                            <source src={inputBoxUrl} />
                        </video>
                    )}
                    <div style={{ position: 'relative', zIndex: 1, padding: inputSizeMode === 'nine-slice' && inputBoxUrl ? scalePx(inputBoxPadding) : undefined }}>
                        <p className="mb-4" style={promptStyle}>
                            <span style={extractTextGradientStyle(projectUI?.inputPromptFont) || undefined}>{interpolatedPrompt}</span>
                        </p>
                        <form onSubmit={handleSubmit}>
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder={textInput.placeholder}
                                maxLength={textInput.maxLength}
                                className="w-full px-3 py-2 focus:outline-none transition-colors"
                                style={{
                                    ...fieldStyle,
                                    backgroundColor: 'rgba(15,23,42,0.6)',
                                    border: '1px solid rgba(148,163,184,0.3)',
                                    borderRadius: scalePx(Math.max(4, inputBorderRadius - 4)),
                                }}
                                autoFocus
                            />
                            <button
                                type="submit"
                                className="w-full mt-4 px-4 py-2 transition-colors hover:brightness-110"
                                style={{
                                    ...submitStyle,
                                    backgroundColor: hasCustomImage ? 'rgba(255,255,255,0.1)' : 'rgba(51,65,85,0.8)',
                                    border: '1px solid rgba(148,163,184,0.2)',
                                    borderRadius: scalePx(Math.max(4, inputBorderRadius - 4)),
                                }}
                            >
                                <span style={extractTextGradientStyle(projectUI?.inputSubmitFont) || undefined}>Submit</span>
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Save/Load Slot Grid with Pagination ──────────────────────────────────
const SLOTS_PER_PAGE = 4;

const SaveSlotGridComponent: React.FC<{
    element: UISaveSlotGridElement;
    style: React.CSSProperties;
    isSaveMode: boolean;
    gameSaves: Record<number, GameStateSave>;
    onAction: (action: VNUIAction) => void;
}> = ({ element, style, isSaveMode, gameSaves, onAction }) => {
    const [currentPage, setCurrentPage] = useState(0);
    const el = element;
    const totalSlots = el.slotCount;
    const totalPages = Math.max(1, Math.ceil(totalSlots / SLOTS_PER_PAGE));
    const startIndex = currentPage * SLOTS_PER_PAGE;
    const pageSlots = Array.from({ length: SLOTS_PER_PAGE }, (_, k) => startIndex + k).filter(i => i < totalSlots);

    const baseFont = fontSettingsToStyle(el.font);
    const slotBgColor = el.slotBackgroundColor || '#1e293b';
    const slotBorderColor = el.slotBorderColor || '#475569';
    const slotHoverBorderColor = el.slotHoverBorderColor || '#38bdf8';
    const slotHeaderColor = el.slotHeaderColor || '#7dd3fc';
    const slotTextColor = el.slotTextColor || '#e2e8f0';

    // Empty slot text: use emptySlotFont if configured, otherwise fall back to emptySlotTextColor
    const emptySlotStyle: React.CSSProperties = el.emptySlotFont
        ? { ...fontSettingsToStyle(el.emptySlotFont), textAlign: undefined }
        : { color: el.emptySlotTextColor || '#a0aec0', fontSize: baseFont.fontSize, fontFamily: baseFont.fontFamily };

    // Nav buttons: use navButtonFont if configured - exclude textAlign
    const navBtnStyle: React.CSSProperties = el.navButtonFont
        ? { ...fontSettingsToStyle(el.navButtonFont), textAlign: undefined, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 10px' }
        : { color: slotHeaderColor, fontFamily: baseFont.fontFamily, fontSize: baseFont.fontSize, fontWeight: 'bold' as const, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 10px' };

    const pageIndicatorStyle: React.CSSProperties = el.pageIndicatorFont
        ? { ...fontSettingsToStyle(el.pageIndicatorFont), textAlign: undefined }
        : { color: slotHeaderColor, fontFamily: baseFont.fontFamily, fontSize: baseFont.fontSize };

    const prevLabel = el.prevButtonText ?? '◀ Prev';
    const nextLabel = el.nextButtonText ?? 'Next ▶';

    return (
        <div style={style} className="flex flex-col h-full">
            {/* 2×2 grid – each slot is a card with screenshot on top, info below */}
            <div className="grid grid-cols-2 gap-[3%] flex-1 min-h-0 p-[2%]">
                {pageSlots.map(i => {
                    const slotData = gameSaves[i + 1];
                    const action: VNUIAction = isSaveMode
                        ? { type: UIActionType.SaveGame, slotNumber: i + 1 }
                        : { type: UIActionType.LoadGame, slotNumber: i + 1 };

                    return (
                        <button
                            key={i}
                            onClick={() => {
                                if (!isSaveMode && !slotData) return;
                                onAction(action);
                            }}
                            disabled={!isSaveMode && !slotData}
                            className="rounded-lg border-2 overflow-hidden flex flex-col"
                            style={{
                                backgroundColor: slotBgColor,
                                borderColor: slotBorderColor,
                                transition: 'border-color 0.15s',
                                cursor: (!isSaveMode && !slotData) ? 'default' : 'pointer',
                            } as React.CSSProperties}
                            onMouseEnter={(e) => {
                                if (!e.currentTarget.disabled) {
                                    e.currentTarget.style.borderColor = slotHoverBorderColor;
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = slotBorderColor;
                            }}
                        >
                            {/* Screenshot area — flex:1 so it fills remaining height, info area always visible */}
                            <div className="relative w-full overflow-hidden" style={{ flex: '1 1 0', minHeight: 0 }}>
                                {slotData?.screenshot ? (
                                    <img
                                        src={slotData.screenshot}
                                        alt={`Save slot ${i + 1}`}
                                        className="absolute inset-0 w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '0 8%' }}>
                                        <span style={{ ...emptySlotStyle, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                            {el.emptySlotText}
                                        </span>
                                    </div>
                                )}

                                {/* Slot label overlay — positioned on top of screenshot */}
                                {!el.hideSlotLabel && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '4px',
                                        left: '4px',
                                        color: slotHeaderColor,
                                        fontWeight: 'bold',
                                        fontSize: baseFont.fontSize,
                                        fontFamily: baseFont.fontFamily,
                                        textShadow: '0 2px 4px rgba(0,0,0,0.7)',
                                        zIndex: 10
                                    }}>
                                        Slot {i + 1}
                                    </div>
                                )}
                            </div>

                            {/* Info area — compact metadata display */}
                            {!el.hideInfoBar && slotData && (
                                <div style={{ flex: '0 0 auto', padding: '2px 4px', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                                    <div style={{ color: slotTextColor, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: `calc(0.8 * ${baseFont.fontSize})` }}>{slotData.sceneName}</div>
                                    <div style={{ color: slotTextColor, opacity: 0.6, margin: 0, fontSize: `calc(0.65 * ${baseFont.fontSize})` }}>{new Date(slotData.timestamp).toLocaleString()}</div>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 py-2 flex-shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.max(0, p - 1)); }}
                        disabled={currentPage === 0}
                        className="disabled:opacity-30"
                        style={navBtnStyle}
                    >
                        {prevLabel}
                    </button>
                    <span style={pageIndicatorStyle}>
                        Page {currentPage + 1} / {totalPages}
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.min(totalPages - 1, p + 1)); }}
                        disabled={currentPage >= totalPages - 1}
                        className="disabled:opacity-30"
                        style={navBtnStyle}
                    >
                        {nextLabel}
                    </button>
                </div>
            )}
        </div>
    );
};

const ButtonElement: React.FC<{
    element: UIButtonElement,
    style: React.CSSProperties,
    playSound: (soundId: VNID | null) => void,
    onAction: (action: VNUIAction) => void,
    getElementAssetUrl: (image: { type: 'image' | 'video', id: VNID } | null) => string | null,
    variables?: Record<VNID, string | number | boolean>,
    project?: VNProject,
    onCommitVariables?: () => void
}> = ({ element, style, playSound, onAction, getElementAssetUrl, variables = {}, project, onCommitVariables }) => {
    const [isHovered, setIsHovered] = useState(false);
    const bgUrl = getElementAssetUrl(element.image);
    const hoverUrl = getElementAssetUrl(element.hoverImage);
    const displayUrl = isHovered && hoverUrl ? hoverUrl : bgUrl;
    const textStyle = fontSettingsToStyle(element.font);
    const interpolatedText = project ? interpolateVariables(element.text, variables, project) : element.text;
    
    const handleClick = () => {
        try { playSound(element.clickSoundId); } catch(e) {}
        
        // Collect all actions (primary + additional)
        const allActions: VNUIAction[] = [];
        if (element.action) {
            allActions.push(element.action);
        }
        if (element.actions && element.actions.length > 0) {
            allActions.push(...element.actions);
        }
        
        // Process SetVariable actions FIRST to ensure variables are updated before navigation/screen changes
        const setVarActions = allActions.filter(a => a.type === UIActionType.SetVariable);
        const otherActions = allActions.filter(a => a.type !== UIActionType.SetVariable);
        
        // Execute SetVariable actions first
        setVarActions.forEach(action => onAction(action));
        
        // CRITICAL: Commit UI variables to playerState before any navigation
        if (setVarActions.length > 0 && onCommitVariables) {
            runtimeDebugLog('[UI Button] Committing', setVarActions.length, 'variable changes before navigation');
            onCommitVariables();
        }
        
        // Then execute other actions (navigation, screen changes, etc.)
        otherActions.forEach(action => onAction(action));
    };
    
    // Use stored backgroundColor or default purple theme color
    const buttonBg = element.backgroundColor || '#4D3273';
    const hoverBg = element.hoverBackgroundColor || (element.backgroundColor ? undefined : '#6B4C9A');
    
    return (
        <button
            key={element.id}
            style={{...style, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit'}}
            className={`transition-transform transform hover:scale-105 relative flex items-center ${{ left: 'justify-start', center: 'justify-center', right: 'justify-end' }[element.font?.align || 'center']}`}
            onMouseEnter={() => { try { playSound(element.hoverSoundId); } catch(e) {} setIsHovered(true); }}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleClick}
        >
            {displayUrl ? (
                <img src={displayUrl} alt={element.text} className="absolute inset-0 w-full h-full object-fill" />
            ) : (
                <div 
                    className="absolute inset-0 w-full h-full rounded"
                    style={{ backgroundColor: isHovered && hoverBg ? hoverBg : buttonBg }}
                />
            )}
            <span className="relative z-10" style={{...textStyle, ...(extractTextGradientStyle(element.font) || {}), display: 'inline-block', pointerEvents: 'none'}}>
                {interpolatedText}
            </span>
        </button>
    );
};

// --- AssetCycler Component ---
const AssetCyclerElement: React.FC<{
    element: UIAssetCyclerElement,
    style: React.CSSProperties,
    variables: Record<VNID, string | number | boolean>,
    onVariableChange?: (variableId: VNID, value: string | number | boolean) => void,
    project: VNProject
}> = ({ element, style, variables, onVariableChange, project }) => {
    const el = element;
    const character = project.characters[el.characterId];
    const layer = character?.layers[el.layerId];
    let currentAssetId = String(variables[el.variableId] || '');
    
    runtimeDebugLog(`[AssetCycler] Rendering cycler for variable ${el.variableId}, current value:`, currentAssetId);
    
    // Apply filtering - NEW: Support assetConditions system first, fall back to filterPattern
    let filteredAssetIds = el.assetIds;
    
    // NEW: Asset conditions-based filtering (simpler, more explicit)
    if (el.assetConditions && el.assetConditions.length > 0) {
        runtimeDebugLog(`[AssetCycler] Using assetConditions filtering for ${el.variableId}`);
        
        // Filter assets based on which conditions match the current variable state
        filteredAssetIds = el.assetConditions
            .filter(condition => {
                // Check if ALL conditions for this asset are met
                const allConditionsMet = condition.conditions.every(cond => {
                    const currentVarValue = String(variables[cond.variableId] || '');
                    const conditionMet = currentVarValue === cond.value;
                    runtimeDebugLog(`[AssetCycler] Condition check: var ${cond.variableId} = "${currentVarValue}" === "${cond.value}" ? ${conditionMet}`);
                    return conditionMet;
                });
                
                if (allConditionsMet) {
                    runtimeDebugLog(`[AssetCycler] ✓ All conditions met for asset ${condition.assetId}`);
                }
                return allConditionsMet;
            })
            .map(condition => condition.assetId);
        
        // If no conditions match yet (no selections made), show all assets as fallback
        if (filteredAssetIds.length === 0) {
            // Check if any condition variables have values
            const conditionVars = new Set<VNID>(el.assetConditions.flatMap(c => c.conditions.map(cond => cond.variableId)));
            const anyVarsSet = Array.from(conditionVars).some(varId => variables[varId]);
            
            if (!anyVarsSet) {
                // No condition variables set yet, show all assets
                filteredAssetIds = el.assetIds;
                runtimeDebugLog(`[AssetCycler] No condition variables set yet, showing all ${filteredAssetIds.length} assets`);
            } else {
                runtimeDebugLog(`[AssetCycler] Conditions set but no matches, filtered to 0 assets`);
            }
        }
        
        runtimeDebugLog(`[AssetCycler] Condition-filtered assets (${filteredAssetIds.length}):`, filteredAssetIds);
    }
    // OLD: Pattern-based filtering (for backwards compatibility)
    else if (el.filterPattern) {
        // Support both old single variable and new multi-variable filtering
        const filterVarIds = el.filterVariableIds || (el.filterVariableId ? [el.filterVariableId] : []);
        
        if (filterVarIds.length > 0) {
            runtimeDebugLog(`[AssetCycler] Filter variables for ${el.variableId}:`, filterVarIds);
            
            // Get all filter variable values (as asset names, not IDs)
            const filterValues: Record<string, string> = {};
            let allFiltersHaveValues = true;
            
            for (const varId of filterVarIds) {
                const assetId = String(variables[varId] || '');
                if (!assetId) {
                    allFiltersHaveValues = false;
                    break;
                }
                // Get the asset name from the ID
                const asset = layer?.assets[assetId];
                const assetName = asset?.name || assetId;
                runtimeDebugLog(`[AssetCycler] Filter var ${varId}: assetId=${assetId}, assetName=${assetName}`);
                filterValues[varId] = assetName;
            }
            
            if (allFiltersHaveValues) {
                // Replace placeholders in the pattern with asset names or parts of asset names
                let pattern = el.filterPattern;
                
                // Helper function to extract part of asset name by index
                const extractPart = (assetName: string, index: number): string => {
                    const parts = assetName.split('_');
                    if (index >= 0 && index < parts.length) {
                        return parts[index];
                    }
                    return assetName;
                };
                
                // First, try to replace specific {varId} or {varId[index]} placeholders
                for (const varId of filterVarIds) {
                    const assetName = filterValues[varId];
                    
                    // Replace {varId[index]} with specific part of asset name
                    const indexedRegex = new RegExp(`\\{${varId}\\[(\\d+)\\]\\}`, 'g');
                    pattern = pattern.replace(indexedRegex, (match, indexStr) => {
                        const index = parseInt(indexStr, 10);
                        const part = extractPart(assetName, index);
                        runtimeDebugLog(`[AssetCycler] Extracting part ${index} from ${assetName}: ${part}`);
                        return part;
                    });
                    
                    // Replace {varId} with full asset name
                    const specificRegex = new RegExp(`\\{${varId}\\}`, 'g');
                    pattern = pattern.replace(specificRegex, assetName);
                }
                
                // Then, replace any remaining generic placeholders by position
                const remainingPlaceholders = pattern.match(/\{[^}]*\}/g);
                if (remainingPlaceholders) {
                    for (let i = 0; i < Math.min(remainingPlaceholders.length, filterVarIds.length); i++) {
                        const varId = filterVarIds[i];
                        const assetName = filterValues[varId];
                        
                        // Check if placeholder has [index] syntax
                        const indexMatch = remainingPlaceholders[i].match(/\[(\d+)\]/);
                        if (indexMatch) {
                            const index = parseInt(indexMatch[1], 10);
                            const part = extractPart(assetName, index);
                            runtimeDebugLog(`[AssetCycler] Generic placeholder [${index}] extracting from ${assetName}: ${part}`);
                            pattern = pattern.replace(/\{[^}]*\}/, part);
                        } else {
                            pattern = pattern.replace(/\{[^}]*\}/, assetName);
                        }
                    }
                }
                
                runtimeDebugLog(`[AssetCycler] Filtering with resolved pattern: ${pattern}`);
                
                filteredAssetIds = el.assetIds.filter(assetId => {
                    const asset = layer?.assets[assetId];
                    if (!asset) return false;
                    
                    const matches = asset.name.toLowerCase().includes(pattern.toLowerCase());
                    if (matches) {
                        runtimeDebugLog(`[AssetCycler] ✓ Match: ${asset.name} contains ${pattern}`);
                    }
                    return matches;
                });
                runtimeDebugLog(`[AssetCycler] Filtered assets (${filteredAssetIds.length}):`, filteredAssetIds);
            } else {
                runtimeDebugLog(`[AssetCycler] Not all filter variables have values yet, showing all ${filteredAssetIds.length} assets`);
            }
        }
    }
    
    // Initialize variable to first asset if not set (using useEffect to avoid setState during render)
    React.useEffect(() => {
        if (!currentAssetId && filteredAssetIds.length > 0 && onVariableChange) {
            const firstAsset = filteredAssetIds[0];
            runtimeDebugLog(`[AssetCycler] Initializing variable ${el.variableId} to:`, firstAsset);
            onVariableChange(el.variableId, firstAsset);
        }
    }, [currentAssetId, filteredAssetIds.length > 0 ? filteredAssetIds[0] : null, el.variableId, onVariableChange]);
    
    // Update variable when filtered results change (for filter-driven cyclers OR condition-driven cyclers)
    React.useEffect(() => {
        const hasConditionFiltering = el.assetConditions && el.assetConditions.length > 0;
        const hasPatternFiltering = el.filterVariableIds && el.filterVariableIds.length > 0;
        
        if ((hasConditionFiltering || hasPatternFiltering) && filteredAssetIds.length > 0 && onVariableChange) {
            if (!filteredAssetIds.includes(currentAssetId)) {
                const firstFiltered = filteredAssetIds[0];
                runtimeDebugLog(`[AssetCycler] Filter changed - updating variable ${el.variableId} to first match:`, firstFiltered);
                onVariableChange(el.variableId, firstFiltered);
            }
        }
    }, [filteredAssetIds.join(','), el.assetConditions, el.filterVariableIds, el.variableId, currentAssetId, onVariableChange]);
    
    const currentIndex = filteredAssetIds.indexOf(currentAssetId);
    const currentAsset = currentAssetId && layer ? layer.assets[currentAssetId] : null;
    
    const handlePrevious = () => {
        if (filteredAssetIds.length === 0) return;
        const newIndex = currentIndex <= 0 ? filteredAssetIds.length - 1 : currentIndex - 1;
        runtimeDebugLog(`[AssetCycler] Previous: setting variable ${el.variableId} to:`, filteredAssetIds[newIndex]);
        onVariableChange?.(el.variableId, filteredAssetIds[newIndex]);
    };
    
    const handleNext = () => {
        if (filteredAssetIds.length === 0) return;
        const newIndex = currentIndex >= filteredAssetIds.length - 1 ? 0 : currentIndex + 1;
        runtimeDebugLog(`[AssetCycler] Next: setting variable ${el.variableId} to:`, filteredAssetIds[newIndex]);
        onVariableChange?.(el.variableId, filteredAssetIds[newIndex]);
    };
    
    return (
        <div
            key={el.id}
            style={{
                ...style,
                backgroundColor: el.backgroundColor || 'rgba(30, 41, 59, 0.8)',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: el.visible === false ? 0 : 1,
                pointerEvents: el.visible === false ? 'none' : 'auto'
            }}
        >
            {el.label && (
                <div
                    style={{
                        fontSize: `calc(var(--font-scale, 1) * ${(el.font?.size || 16) * 0.8}px)`,
                        fontFamily: el.font?.family || 'Inter, system-ui, sans-serif',
                        fontWeight: el.font?.weight || 'normal',
                        fontStyle: el.font?.italic ? 'italic' : 'normal',
                        color: el.font?.color || '#f1f5f9',
                        opacity: 0.8,
                        textAlign: 'center'
                    }}
                >
                    {el.label}
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                <button
                    onClick={handlePrevious}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: el.arrowColor || '#a855f7',
                        fontSize: `calc(var(--font-scale, 1) * ${el.arrowSize || 24}px)`,
                        cursor: 'pointer',
                        padding: '4px',
                        lineHeight: 1,
                        opacity: filteredAssetIds.length > 0 ? 1 : 0.3,
                        transition: 'opacity 0.2s'
                    }}
                    disabled={filteredAssetIds.length === 0}
                >
                    ◀
                </button>
                <div
                    style={{
                        flex: 1,
                        fontSize: `calc(var(--font-scale, 1) * ${el.font?.size || 16}px)`,
                        fontFamily: el.font?.family || 'Inter, system-ui, sans-serif',
                        fontWeight: el.font?.weight || 'normal',
                        fontStyle: el.font?.italic ? 'italic' : 'normal',
                        color: el.font?.color || '#f1f5f9',
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {el.showAssetName && currentAsset ? currentAsset.name : (currentIndex >= 0 ? `${currentIndex + 1} / ${filteredAssetIds.length}` : '–')}
                </div>
                <button
                    onClick={handleNext}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: el.arrowColor || '#a855f7',
                        fontSize: `calc(var(--font-scale, 1) * ${el.arrowSize || 24}px)`,
                        cursor: 'pointer',
                        padding: '4px',
                        lineHeight: 1,
                        opacity: filteredAssetIds.length > 0 ? 1 : 0.3,
                        transition: 'opacity 0.2s'
                    }}
                    disabled={filteredAssetIds.length === 0}
                >
                    ▶
                </button>
            </div>
        </div>
    );
};

// --- CG Gallery Grid Component ---
const CGGalleryGridElement: React.FC<{
    element: UICGGalleryElement;
    entries: CGGalleryEntry[];
    variables: Record<VNID, string | number | boolean>;
    project: VNProject;
    assetResolver: (assetId: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
}> = ({ element, entries, variables, project, assetResolver }) => {
    const [viewingEntry, setViewingEntry] = useState<CGGalleryEntry | null>(null);
    const [viewerIndex, setViewerIndex] = useState(0);

    const isEntryUnlocked = (entry: CGGalleryEntry): boolean => {
        if (!entry.unlockable) return true;
        if (!entry.unlockVariableId) return true;
        const val = variables[entry.unlockVariableId];
        return val === true || val === 'true' || val === 1;
    };

    const unlockedEntries = entries.filter(e => isEntryUnlocked(e));

    const handleThumbnailClick = (entry: CGGalleryEntry, index: number) => {
        if (!isEntryUnlocked(entry)) return;
        setViewingEntry(entry);
        setViewerIndex(unlockedEntries.indexOf(entry));
    };

    const navigateViewer = (dir: -1 | 1) => {
        const newIndex = (viewerIndex + dir + unlockedEntries.length) % unlockedEntries.length;
        setViewerIndex(newIndex);
        setViewingEntry(unlockedEntries[newIndex]);
    };

    // Fullscreen viewer overlay
    if (viewingEntry) {
        const viewUrl = assetResolver(viewingEntry.assetId, 'image');
        return (
            <div
                className="absolute inset-0 z-50 flex items-center justify-center"
                style={{ backgroundColor: element.backgroundColor || 'rgba(0,0,0,0.95)' }}
                onClick={() => setViewingEntry(null)}
            >
                {viewUrl && (
                    <img
                        src={viewUrl}
                        alt={viewingEntry.name}
                        className="max-w-[90%] max-h-[85%] object-contain"
                        onClick={e => e.stopPropagation()}
                    />
                )}
                {/* Navigation arrows */}
                {unlockedEntries.length > 1 && (
                    <>
                        <button
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-4xl p-2"
                            onClick={e => { e.stopPropagation(); navigateViewer(-1); }}
                        >
                            ◀
                        </button>
                        <button
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-4xl p-2"
                            onClick={e => { e.stopPropagation(); navigateViewer(1); }}
                        >
                            ▶
                        </button>
                    </>
                )}
                {/* Entry name and close hint */}
                <div className="absolute bottom-4 left-0 right-0 text-center">
                    {element.showNames !== false && (
                        <div className="text-white text-sm mb-1">{viewingEntry.name}</div>
                    )}
                    <div className="text-white/40 text-xs">Click anywhere to close</div>
                </div>
                {/* Counter */}
                <div className="absolute top-4 right-4 text-white/50 text-sm">
                    {viewerIndex + 1} / {unlockedEntries.length}
                </div>
            </div>
        );
    }

    // Thumbnail grid
    const lockedPlaceholderUrl = project.cgGallery?.lockedPlaceholderAssetId
        ? assetResolver(project.cgGallery.lockedPlaceholderAssetId, 'image')
        : null;

    return (
        <div
            className="w-full h-full overflow-y-auto p-2 rounded"
            style={{ backgroundColor: element.backgroundColor || 'rgba(15, 23, 42, 0.9)' }}
        >
            <div
                className="grid"
                style={{
                    gridTemplateColumns: `repeat(${element.columns || 4}, 1fr)`,
                    gap: `${element.gap || 8}px`,
                }}
            >
                {entries.map((entry, idx) => {
                    const unlocked = isEntryUnlocked(entry);
                    const thumbAssetId = entry.thumbnailAssetId || entry.assetId;
                    const thumbUrl = unlocked ? assetResolver(thumbAssetId, 'image') : lockedPlaceholderUrl;

                    return (
                        <div
                            key={entry.id}
                            className="relative overflow-hidden flex items-center justify-center"
                            style={{
                                aspectRatio: '16/9',
                                borderRadius: `${element.thumbnailBorderRadius || 8}px`,
                                border: `2px solid ${element.thumbnailBorderColor || '#4D3273'}`,
                                backgroundColor: unlocked ? '#334155' : (element.lockedColor || '#1e293b'),
                                cursor: unlocked ? 'pointer' : 'default',
                                transition: 'transform 0.15s ease, border-color 0.15s ease',
                            }}
                            onClick={() => handleThumbnailClick(entry, idx)}
                            onMouseEnter={e => {
                                if (unlocked) {
                                    (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
                                    (e.currentTarget as HTMLElement).style.borderColor = '#8b5cf6';
                                }
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                                (e.currentTarget as HTMLElement).style.borderColor = element.thumbnailBorderColor || '#4D3273';
                            }}
                        >
                            {unlocked && thumbUrl ? (
                                <img src={thumbUrl} alt={entry.name} className="w-full h-full object-cover" />
                            ) : !unlocked ? (
                                <span className="text-2xl">{element.lockedText || '🔒'}</span>
                            ) : (
                                <span className="text-xs text-slate-500">{entry.name}</span>
                            )}
                            {/* Name label */}
                            {element.showNames !== false && unlocked && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 truncate px-1">
                                    {entry.name}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- Helper for Element Transitions ---
const getTransitionStyle = (
    transitionIn?: 'none' | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'scale',
    duration?: number,
    delay?: number
): React.CSSProperties => {
    const durationMs = duration || 300;
    const delayMs = delay || 0;
    
    if (!transitionIn || transitionIn === 'none') return {};
    
    const transitionProp = `all ${durationMs}ms ease-out ${delayMs}ms`;
    
    return {
        transition: transitionProp,
        animation: `elementTransition${transitionIn} ${durationMs}ms ease-out ${delayMs}ms`,
    };
};

// --- Hot Zone Text Input (commits on Enter / confirm button) ---
const HotZoneTextInput: React.FC<{
    element: VNHotZoneElement;
    variables: Record<VNID, string | number | boolean>;
    onVariableChange?: (variableId: VNID, value: string | number | boolean) => void;
    playSound: (soundId: VNID | null) => void;
    font?: any;
}> = ({ element, variables, onVariableChange, playSound, font }) => {
    const vid = (element as any).variableId;
    const currentVal = (vid && variables[vid] != null) ? String(variables[vid]) : '';
    const [localValue, setLocalValue] = useState(currentVal);
    // Sync when external variable changes (e.g. reset)
    useEffect(() => { setLocalValue(currentVal); }, [currentVal]);
    const commit = () => {
        if (vid && onVariableChange) onVariableChange(vid, localValue);
    };
    return (
        <div className="w-full h-full flex items-center gap-0">
            <input
                type="text"
                className="flex-1 h-full rounded-l px-2 outline-none min-w-0"
                style={{
                    backgroundColor: (element as any).backgroundColor || '#1e293b',
                    border: `1px solid ${(element as any).borderColor || '#475569'}`,
                    borderRight: 'none',
                    color: font?.color || '#fff',
                    fontFamily: font?.fontFamily,
                    fontSize: font?.fontSize,
                }}
                placeholder={(element as any).placeholder || ''}
                maxLength={(element as any).maxLength || undefined}
                value={localValue}
                onChange={e => setLocalValue(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') { commit(); try { playSound((element as any).clickSoundId || null); } catch(_) {} }
                }}
                onClick={e => e.stopPropagation()}
            />
            <button
                type="button"
                className="h-full px-2 rounded-r text-xs font-semibold flex items-center justify-center shrink-0"
                style={{
                    backgroundColor: (element as any).borderColor || '#475569',
                    color: '#fff',
                    border: `1px solid ${(element as any).borderColor || '#475569'}`,
                }}
                onClick={e => {
                    e.stopPropagation();
                    commit();
                    try { playSound((element as any).clickSoundId || null); } catch(_) {}
                }}
                title="Confirm"
            >
                ✓
            </button>
        </div>
    );
};

/** Renders an imageMap element in HotZone runtime with Ren'Py-style hover support */
const HotZoneImageMapRenderer: React.FC<{
    el: VNHotZoneElement;
    imageUrl: string | null;
    assetResolver: (assetId: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
    evaluateConditions: (conditions: VNCondition[] | undefined, vars: Record<VNID, string | number | boolean>) => boolean;
    variables: Record<VNID, string | number | boolean>;
    playSound: (soundId: VNID | null) => void;
    handleLocalAction: (action: VNUIAction) => void;
}> = ({ el, imageUrl, assetResolver, evaluateConditions, variables, playSound, handleLocalAction }) => {
    const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
    const hoverImageUrl = (el as any).hoverImageId ? assetResolver((el as any).hoverImageId, 'image') : null;
    const regions: any[] = (el as any).imageMapRegions || [];

    // Compute clip-path for the hovered region
    const hoveredRegion = hoveredRegionId ? regions.find((r: any) => r.id === hoveredRegionId) : null;
    let hoverClipPath: string | undefined;
    if (hoveredRegion) {
        if (hoveredRegion.shape === 'rect' && hoveredRegion.coords.length >= 4) {
            const [x, y, w, h] = hoveredRegion.coords;
            hoverClipPath = `inset(${y}% ${100 - x - w}% ${100 - y - h}% ${x}%)`;
        } else if (hoveredRegion.shape === 'circle' && hoveredRegion.coords.length >= 3) {
            const [cx, cy, r] = hoveredRegion.coords;
            hoverClipPath = `circle(${r}% at ${cx}% ${cy}%)`;
        } else if (hoveredRegion.shape === 'poly' && hoveredRegion.coords.length >= 6) {
            const points: string[] = [];
            for (let i = 0; i < hoveredRegion.coords.length; i += 2) {
                points.push(`${hoveredRegion.coords[i]}% ${hoveredRegion.coords[i + 1]}%`);
            }
            hoverClipPath = `polygon(${points.join(', ')})`;
        }
    }

    return (
        <div className="w-full h-full relative pointer-events-none">
            {imageUrl && <img src={imageUrl} alt={el.name} className="w-full h-full object-contain" draggable={false} />}
            {/* Ren'Py-style hover image clipped to hovered region */}
            {hoverImageUrl && hoverClipPath && (
                <img
                    src={hoverImageUrl}
                    alt=""
                    style={{
                        position: 'absolute',
                        left: 0, top: 0,
                        width: '100%', height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        clipPath: hoverClipPath,
                        zIndex: 1,
                    }}
                    draggable={false}
                />
            )}
            {regions.map((region: any) => {
                if (region.conditions && region.conditions.length > 0 && !evaluateConditions(region.conditions, variables)) return null;
                const regionStyle: React.CSSProperties = {
                    position: 'absolute',
                    cursor: region.cursor || 'pointer',
                    pointerEvents: 'auto',
                    zIndex: 2,
                };
                if (region.shape === 'rect') {
                    regionStyle.left = `${region.coords[0]}%`;
                    regionStyle.top = `${region.coords[1]}%`;
                    regionStyle.width = `${region.coords[2]}%`;
                    regionStyle.height = `${region.coords[3]}%`;
                } else if (region.shape === 'circle') {
                    const r = region.coords[2];
                    regionStyle.left = `${region.coords[0] - r}%`;
                    regionStyle.top = `${region.coords[1] - r}%`;
                    regionStyle.width = `${r * 2}%`;
                    regionStyle.height = `${r * 2}%`;
                    regionStyle.borderRadius = '50%';
                }
                return (
                    <div
                        key={region.id}
                        style={regionStyle}
                        title={region.tooltip || region.name}
                        className={!hoverImageUrl ? 'hover:bg-white/10 transition-colors' : 'transition-colors'}
                        onClick={e => {
                            e.stopPropagation();
                            try { playSound((el as any).clickSoundId || null); } catch {}
                            (region.actions || []).forEach((action: VNUIAction) => handleLocalAction(action));
                        }}
                        onMouseEnter={() => setHoveredRegionId(region.id)}
                        onMouseLeave={() => setHoveredRegionId(null)}
                    />
                );
            })}
        </div>
    );
};

// --- Hot Zone Runtime Renderer ---
const HotZoneRuntime: React.FC<{
    screen: VNUIScreen;
    onAction: (action: VNUIAction) => void;
    variables: Record<VNID, string | number | boolean>;
    onVariableChange?: (variableId: VNID, value: string | number | boolean) => void;
    evaluateConditions: (conditions: VNCondition[] | undefined, vars: Record<VNID, string | number | boolean>) => boolean;
    assetResolver: (assetId: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
    playSound: (soundId: VNID | null) => void;
}> = ({ screen, onAction, variables, onVariableChange, evaluateConditions, assetResolver, playSound }) => {
    const { project } = useProject();
    // Derive the legacy hot zone shapes from the unified `screen.elements` map.
    // Post-Phase-3, screens no longer carry separate `hotSpots` / `hotZoneElements`
    // maps; hot spots, image maps, and any draggable element are first-class
    // `VNUIElement` entries that we convert back to the shapes this runtime
    // expects via a derivation shim.
    const hotSpots = useMemo(() => deriveHotSpotsFromScreen(screen), [screen]);
    const hotZoneElements = useMemo(() => deriveHotZoneElementsFromScreen(screen), [screen]);

    // Track element positions during drag (runtime-only state)
    const [elementPositions, setElementPositions] = useState<Record<VNID, { x: number; y: number }>>({});
    const [dragState, setDragState] = useState<{
        elementId: VNID;
        startMouseX: number;
        startMouseY: number;
        startX: number;
        startY: number;
    } | null>(null);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
    // Track which elements have been placed on hot spots
    const [placedElements, setPlacedElements] = useState<Record<VNID, VNID>>({}); // elementId -> hotSpotId
    // Track image overrides from ChangeImage actions
    const [imageOverrides, setImageOverrides] = useState<Record<VNID, VNID>>({});
    // Track active animations
    const [activeAnimations, setActiveAnimations] = useState<Record<VNID, { animation: string; duration: number }>>({});
    // Track sticky end-states for animations whose final frame should persist (e.g. fadeOut → opacity 0)
    const [persistentEffects, setPersistentEffects] = useState<Record<VNID, 'fadedOut'>>({});

    // Handle ChangeImage / PlayAnimation locally, delegate everything else
    const handleLocalAction = useCallback((action: VNUIAction) => {
        if (action.type === UIActionType.ChangeImage) {
            const a = action as any;
            if (a.targetElementId && a.newImageId) {
                setImageOverrides(prev => ({ ...prev, [a.targetElementId]: a.newImageId }));
            }
            return;
        }
        if (action.type === UIActionType.PlayAnimation) {
            const a = action as any;
            if (a.targetElementId) {
                const anim = a.animation || 'shake';
                const dur = a.duration || 500;
                // fadeIn clears any sticky fadedOut state so the animation can play over a visible element
                if (anim === 'fadeIn') {
                    setPersistentEffects(prev => {
                        if (!prev[a.targetElementId]) return prev;
                        const next = { ...prev };
                        delete next[a.targetElementId];
                        return next;
                    });
                }
                setActiveAnimations(prev => ({ ...prev, [a.targetElementId]: { animation: anim, duration: dur } }));
                setTimeout(() => {
                    setActiveAnimations(prev => {
                        const next = { ...prev };
                        delete next[a.targetElementId];
                        return next;
                    });
                    // Persist the final hidden state so the element stays faded out
                    if (anim === 'fadeOut') {
                        setPersistentEffects(prev => ({ ...prev, [a.targetElementId]: 'fadedOut' }));
                    }
                }, dur);
            }
            return;
        }
        onAction(action);
    }, [onAction]);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Check win condition
    useEffect(() => {
        if (!screen.winCondition) return;
        const wc = screen.winCondition;
        if (wc.type === 'allPlaced') {
            const draggableElements = (Object.values(hotZoneElements) as VNHotZoneElement[]).filter(el => el.draggable);
            const allPlaced = draggableElements.length > 0 && draggableElements.every(el => placedElements[el.id]);
            if (allPlaced) {
                wc.actions.forEach(action => handleLocalAction(action));
            }
        } else if (wc.type === 'variable' && wc.variableId && wc.operator && wc.value !== undefined) {
            const met = evaluateConditions([{ variableId: wc.variableId, operator: wc.operator, value: wc.value }], variables);
            if (met) {
                wc.actions.forEach(action => handleLocalAction(action));
            }
        }
    }, [placedElements, variables, screen.winCondition, hotZoneElements, handleLocalAction, evaluateConditions]);

    // Drag handlers
    const handleElementMouseDown = useCallback((e: React.MouseEvent, el: VNHotZoneElement) => {
        if (!el.draggable) {
            // Click sound + Click actions
            try { playSound((el as any).clickSoundId || null); } catch(e) {}
            if (el.actions) el.actions.forEach(a => handleLocalAction(a));
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        try { playSound((el as any).clickSoundId || null); } catch(e) {}
        const pos = elementPositions[el.id] || { x: el.x, y: el.y };
        setDragState({
            elementId: el.id,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startX: pos.x,
            startY: pos.y,
        });
        setDragOffset(null);
        // Remove from placed if re-dragging
        setPlacedElements(prev => {
            const next = { ...prev };
            delete next[el.id];
            return next;
        });
    }, [elementPositions, handleLocalAction, playSound]);

    useEffect(() => {
        if (!dragState) return;
        const sw = containerSize.width || 1;
        const sh = containerSize.height || 1;
        const onMove = (e: MouseEvent) => {
            const dx = ((e.clientX - dragState.startMouseX) / sw) * 100;
            const dy = ((e.clientY - dragState.startMouseY) / sh) * 100;
            let nx = Math.round((dragState.startX + dx) * 10) / 10;
            let ny = Math.round((dragState.startY + dy) * 10) / 10;
            setDragOffset({ x: nx, y: ny });
        };
        const onUp = () => {
            if (!dragOffset) { setDragState(null); return; }
            const el = hotZoneElements[dragState.elementId] as VNHotZoneElement | undefined;
            if (!el) { setDragState(null); setDragOffset(null); return; }

            // Check if dropped on a valid hot spot
            let droppedOnSpot: VNHotSpot | null = null;
            for (const spot of Object.values(hotSpots) as VNHotSpot[]) {
                if (spot.trigger !== 'drag-drop') continue;
                if (spot.acceptedElementIds && !spot.acceptedElementIds.includes(el.id)) continue;
                // Check overlap: element center inside spot
                const cx = dragOffset.x + el.width / 2;
                const cy = dragOffset.y + el.height / 2;
                if (cx >= spot.x && cx <= spot.x + spot.width && cy >= spot.y && cy <= spot.y + spot.height) {
                    droppedOnSpot = spot;
                    break;
                }
            }

            if (droppedOnSpot) {
                // Snap to hot spot center if configured
                const finalPos = el.snapToHotSpot
                    ? { x: droppedOnSpot.x + (droppedOnSpot.width - el.width) / 2, y: droppedOnSpot.y + (droppedOnSpot.height - el.height) / 2 }
                    : { x: dragOffset.x, y: dragOffset.y };
                setElementPositions(prev => ({ ...prev, [el.id]: finalPos }));
                setPlacedElements(prev => ({ ...prev, [el.id]: droppedOnSpot!.id }));
                // Fire hot spot actions
                droppedOnSpot.actions.forEach(a => handleLocalAction(a));
            } else if (el.snapBack) {
                // Snap back to original position
                setElementPositions(prev => ({ ...prev, [el.id]: { x: el.x, y: el.y } }));
            } else {
                setElementPositions(prev => ({ ...prev, [el.id]: { x: dragOffset.x, y: dragOffset.y } }));
            }

            setDragState(null);
            setDragOffset(null);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [dragState, dragOffset, containerSize, hotZoneElements, hotSpots, handleLocalAction]);

    // Handle hot spot click/hover triggers
    const handleSpotClick = useCallback((spot: VNHotSpot) => {
        if (spot.trigger === 'click') {
            spot.actions.forEach(a => handleLocalAction(a));
        }
    }, [handleLocalAction]);

    const handleSpotHover = useCallback((spot: VNHotSpot) => {
        if (spot.trigger === 'hover') {
            spot.actions.forEach(a => handleLocalAction(a));
        }
    }, [handleLocalAction]);

    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full">
            {/* Hot Spots */}
            {(Object.values(hotSpots) as VNHotSpot[]).map(spot => {
                if (spot.conditions && !evaluateConditions(spot.conditions, variables)) return null;
                return (
                    <div
                        key={spot.id}
                        className="absolute"
                        style={{
                            left: `${spot.x}%`, top: `${spot.y}%`,
                            width: `${spot.width}%`, height: `${spot.height}%`,
                            borderRadius: spot.shape === 'circle' ? '50%' : undefined,
                            backgroundColor: spot.visible ? (spot.highlightColor || 'rgba(59, 130, 246, 0.2)') : 'transparent',
                            border: spot.visible ? `2px dashed ${spot.highlightColor || 'rgba(59, 130, 246, 0.5)'}` : 'none',
                            pointerEvents: spot.trigger === 'drag-drop' ? 'none' : 'auto',
                            cursor: spot.trigger === 'click' ? 'pointer' : undefined,
                        }}
                        onClick={() => handleSpotClick(spot)}
                        onMouseEnter={() => handleSpotHover(spot)}
                    />
                );
            })}
            {/* Hot Zone Elements */}
            {(Object.values(hotZoneElements) as VNHotZoneElement[]).map(el => {
                if (el.conditions && !evaluateConditions(el.conditions, variables)) return null;
                // Hide-on-drop: when snap-to-center + hide-on-drop are on and element has been placed on a hot spot, omit rendering
                if (el.snapToHotSpot && el.hideOnDrop && placedElements[el.id]) return null;
                const isDragging = dragState?.elementId === el.id;
                const pos = isDragging && dragOffset
                    ? dragOffset
                    : (elementPositions[el.id] || { x: el.x, y: el.y });
                // Use image override if ChangeImage was triggered
                const effectiveImageId = imageOverrides[el.id] || el.imageId;
                const imageUrl = assetResolver(effectiveImageId, 'image');
                const anim = activeAnimations[el.id];
                const animationKeyframes: Record<string, string> = {
                    shake: 'hz-shake', bounce: 'hz-bounce', pulse: 'hz-pulse', spin: 'hz-spin',
                    fadeIn: 'hz-fadeIn', fadeOut: 'hz-fadeOut', slideIn: 'hz-slideIn', glow: 'hz-glow',
                };
                const elType = (el as any).elementType || 'image';
                const elText = (el as any).text || '';
                const elFont = (el as any).font;
                const videoUrl = (el as any).videoId ? assetResolver((el as any).videoId, 'video') : null;
                // Sticky end-state from a previously-played fadeOut animation. Skipped while an animation
                // is currently running so the keyframes still drive the visual transition.
                const isFadedOut = !anim && persistentEffects[el.id] === 'fadedOut';
                return (
                    <div
                        key={el.id}
                        className="absolute"
                        style={{
                            left: `${pos.x}%`, top: `${pos.y}%`,
                            width: `${el.width}%`, height: `${el.height}%`,
                            cursor: el.draggable ? (isDragging ? 'grabbing' : 'grab') : (elType === 'textInput' ? 'text' : 'pointer'),
                            zIndex: isDragging ? 50 : 10,
                            pointerEvents: isFadedOut ? 'none' : 'auto',
                            opacity: isFadedOut ? 0 : undefined,
                            transition: isDragging ? 'none' : 'left 0.2s, top 0.2s',
                            animation: anim ? `${animationKeyframes[anim.animation] || 'hz-shake'} ${anim.duration}ms ease` : undefined,
                        }}
                        onMouseDown={e => elType !== 'textInput' && handleElementMouseDown(e, el)}
                        onMouseEnter={() => { try { playSound((el as any).hoverSoundId || null); } catch(e) {} }}
                    >
                        {elType === 'text' ? (
                            <div className="w-full h-full flex items-center justify-center text-white pointer-events-none"
                                style={elFont ? { fontFamily: elFont.fontFamily, fontSize: elFont.fontSize, fontWeight: elFont.bold ? 'bold' : 'normal', fontStyle: elFont.italic ? 'italic' : 'normal', color: elFont.color || '#fff' } : {}}>
                                {project ? interpolateVariables(elText, variables, project) : elText}
                            </div>
                        ) : elType === 'button' ? (
                            <div className="w-full h-full relative flex items-center justify-center pointer-events-none">
                                {imageUrl && <img src={imageUrl} alt={el.name} className="absolute inset-0 w-full h-full object-fill" draggable={false} />}
                                <span className="relative z-10 text-white text-sm font-semibold"
                                    style={elFont ? { fontFamily: elFont.fontFamily, fontSize: elFont.fontSize, color: elFont.color || '#fff' } : {}}>
                                    {project ? interpolateVariables(elText, variables, project) : elText}
                                </span>
                            </div>
                        ) : elType === 'video' ? (
                            videoUrl ? (
                                <video
                                    src={videoUrl}
                                    className="w-full h-full object-contain pointer-events-none"
                                    autoPlay
                                    loop={(el as any).videoLoop ?? true}
                                    muted={(el as any).videoMuted ?? true}
                                    playsInline
                                />
                            ) : (
                                <div className="w-full h-full bg-indigo-500/30 border border-indigo-400 rounded flex items-center justify-center text-xs text-white pointer-events-none">
                                    {el.name} (no video)
                                </div>
                            )
                        ) : elType === 'textInput' ? (
                            <HotZoneTextInput
                                element={el}
                                variables={variables}
                                onVariableChange={onVariableChange}
                                playSound={playSound}
                                font={elFont}
                            />
                        ) : elType === 'imageMap' ? (
                            <HotZoneImageMapRenderer
                                el={el}
                                imageUrl={imageUrl}
                                assetResolver={assetResolver}
                                evaluateConditions={evaluateConditions}
                                variables={variables}
                                playSound={playSound}
                                handleLocalAction={handleLocalAction}
                            />
                        ) : imageUrl ? (
                            <img src={imageUrl} alt={el.name} className="w-full h-full object-contain pointer-events-none" draggable={false} />
                        ) : (
                            <div className="w-full h-full bg-purple-500/30 border border-purple-400 rounded flex items-center justify-center text-xs text-white pointer-events-none">
                                {el.name}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// --- UI Screen Renderer (for menus) ---
const UIScreenRenderer: React.FC<{
    screenId: VNID;
    onAction: (action: VNUIAction) => void;
    settings: GameSettings;
    onSettingsChange: (key: keyof GameSettings, value: any) => void;
    assetResolver: (assetId: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
    gameSaves: Record<number, GameStateSave>;
    playSound: (soundId: VNID | null) => void;
    variables?: Record<VNID, string | number | boolean>;
    onVariableChange?: (variableId: VNID, value: string | number | boolean) => void;
    isClosing?: boolean;
    evaluateConditions: (conditions: VNCondition[] | undefined, variables: Record<VNID, string | number | boolean>) => boolean;
    onCommitVariables?: () => void;
}> = React.memo(({ screenId, onAction, settings, onSettingsChange, assetResolver, gameSaves, playSound, variables = {}, onVariableChange, isClosing = false, evaluateConditions, onCommitVariables }) => {
    const { project } = useProject();
    const screen = project.uiScreens[screenId];
    const backgroundVideoRef = React.useRef<HTMLVideoElement>(null);
    
    // Cleanup video on unmount
    React.useEffect(() => {
        return () => {
            if (backgroundVideoRef.current) {
                backgroundVideoRef.current.pause();
                backgroundVideoRef.current.src = '';
                backgroundVideoRef.current.load();
            }
        };
    }, []);
    
    if (!screen) return <div className="text-red-500">Error: Screen {screenId} not found.</div>;

    const getBackgroundElement = () => {
        if (screen.background.type === 'color') {
            return <div className="absolute inset-0" style={{ backgroundColor: screen.background.value }} />;
        }
        if (screen.background.assetId) {
            const url = assetResolver(screen.background.assetId, screen.background.type);
            if (url) {
                if (screen.background.type === 'image') {
                    return <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />;
                }
                if (screen.background.type === 'video') {
                    return <video ref={backgroundVideoRef} src={url} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />;
                }
            }
        }
        return null;
    };
    
    const renderElement = (element: VNUIElement, variables: Record<VNID, string | number | boolean>, project: VNProject, onCommitVariables?: () => void) => {
        runtimeDebugLog('🎯 renderElement called:', element.type, element.name, element.id);
        
        // Check visibility conditions - if conditions exist and are not met, don't render
        if (element.conditions && element.conditions.length > 0) {
            const conditionsMet = evaluateConditions(element.conditions, variables);
            if (!conditionsMet) {
                runtimeDebugLog('🚫 Element conditions not met, skipping render:', element.name);
                return null;
            }
        }
        
        const transitionStyle = getTransitionStyle(element.transitionIn, element.transitionDuration, element.transitionDelay);
        
        const style: React.CSSProperties = {
            position: 'absolute',
            left: `${element.x}%`, top: `${element.y}%`,
            width: `${element.width}%`, height: `${element.height}%`,
            transform: `translate(-${element.anchorX * 100}%, -${element.anchorY * 100}%)`,
            overflow: 'hidden', // Prevent content overflow when using cover
            opacity: element.opacity ?? 1,
            ...transitionStyle,
        };

        const getElementAssetUrl = (image: { type: 'image' | 'video', id: VNID } | null) => {
            if (!image) return null;
            return assetResolver(image.id, image.type);
        };

        switch (element.type) {
            case UIElementType.Button: {
                const el = element as UIButtonElement;
                return <ButtonElement key={el.id} element={el} style={style} playSound={playSound} onAction={onAction} getElementAssetUrl={getElementAssetUrl} variables={variables} project={project} onCommitVariables={onCommitVariables} />;
            }
            case UIElementType.Text: {
                const el = element as UITextElement;
                const effectiveAlign = el.textAlign || el.font?.align || 'center';
                const hAlignClass = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[effectiveAlign];
                const vAlignClass = { top: 'items-start', middle: 'items-center', bottom: 'items-end' }[el.verticalAlign || 'middle'];
                const interpolatedText = interpolateVariables(el.text, variables, project);

                const textStyle: React.CSSProperties = {
                    ...fontSettingsToStyle(el.font),
                };

                return <div key={el.id}
                    style={style}
                    className={`flex ${hAlignClass} ${vAlignClass} p-1`}
                >
                    <div style={textStyle}><span style={extractTextGradientStyle(el.font) || undefined}>{interpolatedText}</span></div>
                </div>;
            }
            case UIElementType.Image: {
                const el = element as UIImageElement;
                
                // Support new background property with fallback to old image property
                const bgType = el.background?.type || 'image';
                const bgValue = el.background?.type === 'color' ? el.background.value :
                               el.background?.type ? el.background.assetId :
                               el.image?.id || null;
                
                const containerStyle: React.CSSProperties = {
                    ...style,
                    overflow: 'hidden',
                };
                
                // If it's a color background
                if (bgType === 'color' && typeof bgValue === 'string') {
                    return <div key={el.id} style={{ ...containerStyle, backgroundColor: bgValue }} />;
                }
                
                // Otherwise it's an image or video asset
                const url = bgValue ? (bgType === 'video' ? project.videos[bgValue]?.videoUrl : assetResolver(bgValue as VNID, 'image')) : null;
                
                if (!url || url === '' || url === 'http://localhost:3000/') {
                    return <div key={el.id} style={containerStyle} className="bg-slate-800/50" />;
                }
                
                const isVideo = bgType === 'video';
                
                // Media fills container using object-fit
                const mediaStyle: React.CSSProperties = {
                    width: '100%',
                    height: '100%',
                    objectFit: el.objectFit || 'contain',
                    display: 'block',
                };
                
                if (isVideo) {
                    return (
                        <div key={el.id} style={containerStyle}>
                            <video 
                                ref={(videoEl) => {
                                    if (videoEl && url) {
                                        // Fix for React Strict Mode calling ref twice with empty src
                                        // Ensure src is set properly even if it gets reset
                                        if (!videoEl.src || videoEl.src === 'http://localhost:3000/' || videoEl.src === window.location.href) {
                                            videoEl.src = url;
                                        }
                                        
                                        // Force play after a brief delay to ensure src is loaded
                                        setTimeout(() => {
                                            if (videoEl.readyState >= 2) {  // HAVE_CURRENT_DATA or better
                                                videoEl.play().catch(error => {
                                                    console.error('[Video Play Error]', el.name, error);
                                                });
                                            } else {
                                                // Retry if not ready
                                                setTimeout(() => videoEl.play().catch(() => {}), 500);
                                            }
                                        }, 100);
                                    }
                                }}
                                src={url} 
                                style={mediaStyle}
                                autoPlay 
                                loop 
                                muted 
                                playsInline
                            >
                                <source src={url} type="video/webm" />
                                <source src={url} type="video/mp4" />
                                Your browser doesn't support this video format.
                            </video>
                        </div>
                    );
                } else {
                    return (
                        <div key={el.id} style={containerStyle}>
                            <img 
                                src={url} 
                                alt={el.name} 
                                style={mediaStyle}
                            />
                        </div>
                    );
                }
            }
            case UIElementType.SettingsSlider: {
                const el = element as UISettingsSliderElement;
                
                // Determine the value and range
                let value: number;
                let min: number;
                let max: number;
                let step: number;
                
                if (el.variableId) {
                    // Variable mode
                    value = Number(variables[el.variableId]) || (el.minValue ?? 0);
                    min = el.minValue ?? 0;
                    max = el.maxValue ?? 100;
                    step = 1;
                } else {
                    // Settings mode (legacy)
                    const settingKey = el.setting === 'textSpeed' ? 'textSpeed' : el.setting;
                    value = settings[settingKey];
                    min = el.setting === 'textSpeed' ? 10 : 0;
                    max = el.setting === 'textSpeed' ? 100 : 1;
                    step = el.setting === 'textSpeed' ? 1 : 0.01;
                }
                
                const thumbUrl = el.thumbImage ? getElementAssetUrl(el.thumbImage) : null;
                const trackUrl = el.trackImage ? getElementAssetUrl(el.trackImage) : null;
                
                // Use stored colors or defaults
                const thumbColor = el.thumbColor || '#8a2be2';
                const trackColor = el.trackColor || '#4D3273';
                
                const customSliderStyle: React.CSSProperties = {
                    // Custom thumb via CSS variable (if no image)
                    ...(!thumbUrl ? {
                        ['--slider-thumb-color' as any]: thumbColor,
                    } : {}),
                    // Custom track via CSS variable (if no image)
                    ...(!trackUrl ? {
                        ['--slider-track-color' as any]: trackColor,
                    } : {}),
                    // Thumb image as background
                    ...(thumbUrl ? {
                        ['--slider-thumb-bg' as any]: `url(${thumbUrl})`,
                    } : {}),
                    // Track image as background
                    ...(trackUrl ? {
                        ['--slider-track-bg' as any]: `url(${trackUrl})`,
                    } : {}),
                };
                
                return <div key={el.id} style={style} className="flex items-center">
                    <input 
                        type="range" 
                        min={min} 
                        max={max} 
                        step={step} 
                        value={value} 
                        onChange={e => {
                            const newValue = parseFloat(e.target.value);
                            if (el.variableId) {
                                // Update variable
                                onVariableChange?.(el.variableId, newValue);
                            } else {
                                // Update setting (legacy)
                                onSettingsChange(el.setting, newValue);
                            }
                            // Execute additional actions
                            if (el.actions && el.actions.length > 0) {
                                el.actions.forEach(action => onAction(action));
                            }
                        }} 
                        style={customSliderStyle}
                        className={thumbUrl || trackUrl ? 'custom-slider' : ''}
                    />
                </div>;
            }
            case UIElementType.SettingsToggle: {
                const el = element as UISettingsToggleElement;
                
                // Determine checked state
                let isChecked: boolean;
                if (el.variableId) {
                    // Variable mode
                    const currentValue = variables[el.variableId];
                    if (el.checkedValue !== undefined && el.uncheckedValue !== undefined) {
                        isChecked = currentValue === el.checkedValue;
                    } else {
                        // Default to boolean interpretation
                        isChecked = Boolean(currentValue);
                    }
                } else {
                    // Settings mode (legacy)
                    isChecked = settings[el.setting];
                }
                
                const checkboxImage = isChecked ? el.checkedImage : el.uncheckedImage;
                const imageUrl = checkboxImage ? getElementAssetUrl(checkboxImage) : null;
                
                const handleToggle = () => {
                    if (el.variableId) {
                        // Update variable
                        if (el.checkedValue !== undefined && el.uncheckedValue !== undefined) {
                            const newValue = isChecked ? el.uncheckedValue : el.checkedValue;
                            onVariableChange?.(el.variableId, newValue);
                        } else {
                            // Default boolean toggle
                            onVariableChange?.(el.variableId, !isChecked);
                        }
                    } else {
                        // Update setting (legacy)
                        onSettingsChange(el.setting, !isChecked);
                    }
                    // Execute additional actions
                    if (el.actions && el.actions.length > 0) {
                        el.actions.forEach(action => onAction(action));
                    }
                };
                
                return <div key={el.id} style={style} className="flex items-center gap-2">
                    {imageUrl ? (
                        <img 
                            src={imageUrl} 
                            alt={isChecked ? 'checked' : 'unchecked'}
                            onClick={handleToggle}
                            className="h-5 w-5 cursor-pointer object-contain"
                        />
                    ) : (
                        <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={handleToggle} 
                            className="h-5 w-5"
                            style={el.checkboxColor ? { accentColor: el.checkboxColor } : {}}
                        />
                    )}
                    <label style={fontSettingsToStyle(el.font)}><span style={extractTextGradientStyle(el.font) || undefined}>{el.text}</span></label>
                </div>
            }
            case UIElementType.SaveSlotGrid: {
                const el = element as UISaveSlotGridElement;
                const isSaveMode = screenId === project.ui.saveScreenId && screenId !== project.ui.loadScreenId;
                
                return (
                    <SaveSlotGridComponent
                        key={el.id}
                        element={el}
                        style={style}
                        isSaveMode={isSaveMode}
                        gameSaves={gameSaves}
                        onAction={onAction}
                    />
                );
            }
            case UIElementType.CharacterPreview: {
                const el = element as UICharacterPreviewElement;
                const character = project.characters[el.characterId];
                if (!character) return null;
                
                runtimeDebugLog(`[CharacterPreview] layerVariableMap:`, el.layerVariableMap);
                runtimeDebugLog(`[CharacterPreview] Available variables:`, Object.keys(variables));
                
                const imageUrls: string[] = [];
                const videoUrls: string[] = [];
                let hasVideo = false;
                let videoLoop = false;
                
                // Add base image/video
                if (character.baseVideoUrl) {
                    videoUrls.push(character.baseVideoUrl);
                    hasVideo = true;
                    videoLoop = !!character.baseVideoLoop;
                } else if (character.baseImageUrl) {
                    imageUrls.push(character.baseImageUrl);
                }
                
                // Get the default expression if specified
                const defaultExpression = el.expressionId ? character.expressions[el.expressionId] : null;
                
                // Add layer assets - process in layer order
                Object.entries(character.layers).forEach(([layerId, layer]: [string, VNCharacterLayer]) => {
                    const variableId = el.layerVariableMap[layerId];
                    let asset = null;
                    
                    runtimeDebugLog(`[CharacterPreview] Processing layer ${layer.name} (${layerId}), mapped variableId:`, variableId);
                    
                    if (variableId && variables) {
                        // Get asset from variable (variable contains asset ID as string)
                        const assetId = String(variables[variableId] || '');
                        runtimeDebugLog(`[CharacterPreview] Layer ${layer.name} (${layerId}): variableId=${variableId}, assetId from variable="${assetId}"`);
                        runtimeDebugLog(`[CharacterPreview] Available assets in layer:`, Object.keys(layer.assets));
                        
                        if (assetId) {
                            asset = layer.assets[assetId];
                            if (asset) {
                                runtimeDebugLog(`[CharacterPreview] ✓ Found asset: ${asset.name}`);
                            } else {
                                runtimeDebugWarn(`[CharacterPreview] ✗ Asset ID "${assetId}" not found in layer ${layer.name}!`);
                            }
                        } else {
                            runtimeDebugLog(`[CharacterPreview] Variable ${variableId} is empty, skipping layer`);
                        }
                    } else if (defaultExpression && defaultExpression.layerConfiguration[layerId]) {
                        // Get asset from default expression
                        const assetId = defaultExpression.layerConfiguration[layerId];
                        runtimeDebugLog(`[CharacterPreview] Layer ${layer.name} using default expression asset: ${assetId}`);
                        asset = assetId ? layer.assets[assetId] : null;
                    } else {
                        runtimeDebugLog(`[CharacterPreview] Layer ${layer.name} has no mapping and no default expression`);
                    }
                    
                    if (asset) {
                        if (asset.videoUrl) {
                            videoUrls.push(asset.videoUrl);
                            hasVideo = true;
                            videoLoop = videoLoop || !!asset.loop;
                        } else if (asset.imageUrl) {
                            imageUrls.push(asset.imageUrl);
                        }
                    }
                });
                
                // Render character preview
                const containerStyle: React.CSSProperties = {
                    ...style,
                    overflow: 'hidden',
                };
                
                return (
                    <div key={el.id} style={containerStyle}>
                        <div className="relative w-full h-full">
                            {hasVideo && videoUrls.length > 0 ? (
                                videoUrls.map((url, index) => (
                                    <video 
                                        key={index}
                                        src={url} 
                                        autoPlay 
                                        muted 
                                        loop={videoLoop} 
                                        playsInline
                                        className="absolute top-0 left-0 w-full h-full object-contain" 
                                        style={{ zIndex: index }}
                                    />
                                ))
                            ) : (
                                imageUrls.map((url, index) => (
                                    <img 
                                        key={index}
                                        src={url} 
                                        alt="" 
                                        className="absolute top-0 left-0 w-full h-full object-contain" 
                                        style={{ zIndex: index }}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                );
            }
            case UIElementType.TextInput: {
                const el = element as UITextInputElement;
                const currentValue = String(variables[el.variableId] || '');

                return (
                    <div
                        key={el.id}
                        style={style}
                    >
                        <input
                            type="text"
                            value={currentValue}
                            onChange={(e) => {
                                onVariableChange?.(el.variableId, e.target.value);
                            }}
                            placeholder={el.placeholder}
                            maxLength={el.maxLength}
                            className="w-full h-full outline-none"
                            style={{
                                backgroundColor: el.backgroundColor || '#1e293b',
                                color: el.font?.color || '#f1f5f9',
                                fontSize: `calc(var(--font-scale, 1) * ${el.font?.size || 16}px)`,
                                fontFamily: el.font?.family || 'Inter, system-ui, sans-serif',
                                fontWeight: el.font?.weight || 'normal',
                                fontStyle: el.font?.italic ? 'italic' : 'normal',
                                border: `2px solid ${el.borderColor || '#475569'}`,
                                borderRadius: '4px',
                                padding: '8px 12px',
                            }}
                        />
                    </div>
                );
            }
            case UIElementType.Dropdown: {
                const el = element as UIDropdownElement;
                const currentValue = variables[el.variableId];
                
                return (
                    <div
                        key={el.id}
                        style={style}
                    >
                        <select
                            value={String(currentValue ?? el.options[0]?.value ?? '')}
                            onChange={(e) => {
                                // Find the selected option to get the proper typed value
                                const selectedOption = el.options.find(opt => String(opt.value) === e.target.value);
                                if (selectedOption) {
                                    onVariableChange?.(el.variableId, selectedOption.value);
                                    
                                    // Execute additional actions
                                    if (el.actions && el.actions.length > 0) {
                                        el.actions.forEach(action => onAction(action));
                                    }
                                }
                            }}
                            className="w-full h-full outline-none cursor-pointer"
                            style={{
                                backgroundColor: el.backgroundColor || '#1e293b',
                                color: el.font?.color || '#f1f5f9',
                                fontSize: `calc(var(--font-scale, 1) * ${el.font?.size || 16}px)`,
                                fontFamily: el.font?.family || 'Inter, system-ui, sans-serif',
                                fontWeight: el.font?.weight || 'normal',
                                fontStyle: el.font?.italic ? 'italic' : 'normal',
                                border: `2px solid ${el.borderColor || '#475569'}`,
                                borderRadius: '4px',
                                padding: '8px 12px',
                            }}
                            onMouseEnter={(e) => {
                                if (el.hoverColor) {
                                    e.currentTarget.style.backgroundColor = el.hoverColor;
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = el.backgroundColor || '#1e293b';
                            }}
                        >
                            {el.options.map(opt => (
                                <option key={opt.id} value={String(opt.value)}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                );
            }
            case UIElementType.Checkbox: {
                const el = element as UICheckboxElement;
                const currentValue = variables[el.variableId];
                
                // Determine if checkbox is checked based on current variable value
                const isChecked = currentValue === el.checkedValue;
                
                return (
                    <div
                        key={el.id}
                        style={style}
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => {
                            // Toggle between checked and unchecked values
                            const newValue = isChecked ? el.uncheckedValue : el.checkedValue;
                            onVariableChange?.(el.variableId, newValue);
                            
                            // Execute additional actions
                            if (el.actions && el.actions.length > 0) {
                                el.actions.forEach(action => onAction(action));
                            }
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // Handled by parent div onClick
                            className="w-5 h-5 cursor-pointer"
                            style={{
                                accentColor: el.checkboxColor || '#3b82f6'
                            }}
                        />
                        <span
                            style={{
                                color: el.labelColor || '#f1f5f9',
                                fontSize: `calc(var(--font-scale, 1) * ${el.font?.size || 16}px)`,
                                fontFamily: el.font?.family || 'Inter, system-ui, sans-serif',
                                fontWeight: el.font?.weight || 'normal',
                                fontStyle: el.font?.italic ? 'italic' : 'normal',
                                cursor: 'pointer',
                                userSelect: 'none'
                            }}
                        >
                            {el.label}
                        </span>
                    </div>
                );
            }
            case UIElementType.AssetCycler: {
                const el = element as UIAssetCyclerElement;
                return <AssetCyclerElement 
                    key={el.id} 
                    element={el} 
                    style={style} 
                    variables={variables} 
                    onVariableChange={onVariableChange} 
                    project={project} 
                />;
            }
            case UIElementType.CGGallery: {
                const el = element as UICGGalleryElement;
                const galleryEntries = Object.values(project.cgGallery?.entries || {}) as CGGalleryEntry[];
                const filteredEntries = el.categoryFilter
                    ? galleryEntries.filter(e => e.category === el.categoryFilter)
                    : galleryEntries;
                // Sort by order then by name
                filteredEntries.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));

                return (
                    <div key={el.id} style={style}>
                        <CGGalleryGridElement
                            element={el}
                            entries={filteredEntries}
                            variables={variables}
                            project={project}
                            assetResolver={assetResolver}
                        />
                    </div>
                );
            }
            default: return null;
        }
    }

    // Get screen transition style
    const transitionType = isClosing ? (screen.transitionOut || 'fade') : (screen.transitionIn || 'fade');
    const duration = isClosing
        ? (screen.transitionOutDuration ?? screen.transitionDuration ?? 300)
        : (screen.transitionInDuration ?? screen.transitionDuration ?? 300);
    const screenTransitionStyle: React.CSSProperties = {
        animation: transitionType !== 'none' ? `screenTransition${transitionType}${isClosing ? 'Out' : ''} ${duration}ms ${transitionType === 'crossfade' ? 'linear' : 'ease-out'} forwards` : undefined,
    };

    // Check if dialogue should be shown
    const shouldShowDialogue = screen.showDialogue && variables;

    return (
        <div
            // Key is just the screenId — switching isClosing on the SAME screen must
            // not unmount/remount this div, or the crossfade will visibly flicker.
            key={screenId}
            className="absolute inset-0 w-full h-full"
            style={screenTransitionStyle}
        >
            {getBackgroundElement()}
            {/* Standard renderer skips interactive types — HotZoneRuntime owns them. */}
            {Object.values(screen.elements).map(element => {
                const el = element as any;
                if (el.type === 'HotSpot' || el.type === 'ImageMap' || el.draggable === true) return null;
                return renderElement(element as VNUIElement, variables, project, onCommitVariables);
            })}
            {/* Hot zone runtime activates whenever the screen has any interactive content
                (hot spots, image maps, draggable elements) or a win condition. */}
            {(
                Object.values(screen.elements || {}).some((el: any) =>
                    el.type === 'HotSpot' || el.type === 'ImageMap' || el.draggable === true
                ) ||
                !!screen.winCondition
            ) && (
                <HotZoneRuntime
                    screen={screen}
                    onAction={onAction}
                    variables={variables}
                    onVariableChange={onVariableChange}
                    evaluateConditions={evaluateConditions}
                    assetResolver={assetResolver}
                    playSound={playSound}
                />
            )}
        </div>
    );
});


// --- In-Game Confirmation Dialog ---
const InGameConfirmDialog: React.FC<{
    type: 'quit' | 'newGame';
    settings?: VNConfirmDialogSettings;
    assetResolver: (id: VNID, type: string) => string;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ type, settings: s, assetResolver, onConfirm, onCancel }) => {
    const isQuit = type === 'quit';
    const title = isQuit
        ? (s?.quitTitle || 'Quit Game')
        : (s?.newGameTitle || 'Start New Game');
    const message = isQuit
        ? (s?.quitMessage || 'Are you sure you want to quit?')
        : (s?.newGameMessage || 'Any unsaved progress will be lost. Are you sure?');
    const confirmLabel = isQuit
        ? (s?.quitConfirmLabel || 'Quit')
        : (s?.newGameConfirmLabel || 'New Game');
    const cancelLabel = isQuit
        ? (s?.quitCancelLabel || 'Cancel')
        : (s?.newGameCancelLabel || 'Cancel');

    const bgColor = s?.backgroundColor || '#0f172a';
    const bgOpacity = (s?.backgroundOpacity ?? 92) / 100;
    const borderRadius = s?.borderRadius ?? 12;
    const overlayColor = s?.overlayColor || 'rgba(0,0,0,0.75)';
    const confirmBtnColor = s?.confirmButtonColor || '';
    const cancelBtnColor = s?.cancelButtonColor || '#1e293b';
    const confirmHoverColor = s?.confirmHoverColor || '';
    const cancelHoverColor = s?.cancelHoverColor || '#334155';
    const btnBorderRadius = s?.buttonBorderRadius ?? Math.max(borderRadius - 4, 4);
    const btnPad = s?.buttonPadding ?? 8;
    const dialogPad = s?.dialogPadding ?? 32;

    const titleStyle: React.CSSProperties = s?.titleFont ? fontSettingsToStyle(s.titleFont) : { fontSize: '1.25rem', fontWeight: 600, color: '#fff' };
    const messageStyle: React.CSSProperties = s?.messageFont ? fontSettingsToStyle(s.messageFont) : { fontSize: '0.95rem', color: '#cbd5e1' };
    const buttonStyle: React.CSSProperties = s?.buttonFont ? fontSettingsToStyle(s.buttonFont) : { fontSize: '0.95rem', fontWeight: 500, color: '#fff' };

    // Resolve asset URLs
    const resolveAsset = (asset?: { id: VNID } | null) => asset?.id ? assetResolver(asset.id, 'image') : null;
    const bgImageUrl = resolveAsset(s?.backgroundImage);
    const borderImageUrl = resolveAsset(s?.borderImage);
    const confirmBtnImgUrl = resolveAsset(s?.confirmButtonImage);
    const cancelBtnImgUrl = resolveAsset(s?.cancelButtonImage);
    const confirmHoverImgUrl = resolveAsset(s?.confirmHoverImage);
    const cancelHoverImgUrl = resolveAsset(s?.cancelHoverImage);

    const sizeMode = s?.backgroundSizeMode || 'stretch';
    const bgImageStyle: React.CSSProperties = bgImageUrl ? {
        backgroundImage: `url(${bgImageUrl})`,
        backgroundSize: sizeMode === 'nine-slice' ? undefined : (sizeMode === 'stretch' ? '100% 100%' : sizeMode),
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        ...(sizeMode === 'nine-slice' ? {
            borderImage: `url(${bgImageUrl}) ${s?.backgroundSlice ?? 20} fill`,
            borderImageWidth: `${s?.backgroundSlice ?? 20}px`,
        } : {}),
    } : {};

    const makeBtnImageStyle = (imgUrl: string | null): React.CSSProperties => {
        if (!imgUrl) return {};
        const bsm = s?.buttonSizeMode || 'stretch';
        return {
            backgroundImage: `url(${imgUrl})`,
            backgroundSize: bsm === 'nine-slice' ? undefined : (bsm === 'stretch' ? '100% 100%' : bsm),
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: 'transparent',
            ...(bsm === 'nine-slice' ? { borderImage: `url(${imgUrl}) ${s?.buttonSlice ?? 10} fill`, borderImageWidth: `${s?.buttonSlice ?? 10}px` } : {}),
        };
    };

    const borderPad = s?.borderPadding ?? 12;

    return (
        <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: overlayColor, zIndex: 9998, animation: 'fade-in 0.2s ease-out' }}
            onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
        >
            {/* Border image wrapper */}
            <div style={borderImageUrl ? {
                backgroundImage: `url(${borderImageUrl})`,
                backgroundSize: '100% 100%',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                padding: borderPad,
                borderRadius,
            } : {}}>
                <div
                    style={{
                        backgroundColor: bgImageUrl ? 'transparent' : bgColor,
                        opacity: bgImageUrl ? 1 : undefined,
                        borderRadius,
                        padding: dialogPad,
                        ...(s?.dialogWidth ? { width: s.dialogWidth } : { minWidth: 320, maxWidth: 440 }),
                        textAlign: 'center',
                        boxShadow: borderImageUrl ? 'none' : '0 12px 40px rgba(0,0,0,0.5)',
                        ...bgImageStyle,
                        ...(bgImageUrl ? {} : { background: `${bgColor}${Math.round(bgOpacity * 255).toString(16).padStart(2, '0')}` }),
                    }}
                >
                    <div style={{ ...titleStyle, marginBottom: '0.75rem' }}>{title}</div>
                    <div style={{ ...messageStyle, marginBottom: '1.5rem' }}>{message}</div>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                        <button
                            onClick={onCancel}
                            style={{
                                ...buttonStyle,
                                padding: `${btnPad}px ${btnPad * 3}px`,
                                borderRadius: btnBorderRadius,
                                backgroundColor: cancelBtnImgUrl ? 'transparent' : cancelBtnColor,
                                border: cancelBtnImgUrl ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s',
                                ...makeBtnImageStyle(cancelBtnImgUrl),
                            }}
                            onMouseEnter={e => {
                                if (cancelHoverImgUrl) {
                                    e.currentTarget.style.backgroundImage = `url(${cancelHoverImgUrl})`;
                                } else {
                                    e.currentTarget.style.backgroundColor = cancelHoverColor;
                                }
                            }}
                            onMouseLeave={e => {
                                if (cancelBtnImgUrl) {
                                    e.currentTarget.style.backgroundImage = `url(${cancelBtnImgUrl})`;
                                } else if (cancelHoverImgUrl) {
                                    e.currentTarget.style.backgroundImage = 'none';
                                    e.currentTarget.style.backgroundColor = cancelBtnColor;
                                } else {
                                    e.currentTarget.style.backgroundColor = cancelBtnColor;
                                }
                            }}
                        >
                            {cancelLabel}
                        </button>
                        <button
                            onClick={onConfirm}
                            style={{
                                ...buttonStyle,
                                padding: `${btnPad}px ${btnPad * 3}px`,
                                borderRadius: btnBorderRadius,
                                background: confirmBtnImgUrl ? 'transparent' : (confirmBtnColor || 'linear-gradient(to right, #ec4899, #a855f7)'),
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s, box-shadow 0.15s',
                                ...makeBtnImageStyle(confirmBtnImgUrl),
                            }}
                            onMouseEnter={e => {
                                if (confirmHoverImgUrl) {
                                    e.currentTarget.style.backgroundImage = `url(${confirmHoverImgUrl})`;
                                } else if (confirmHoverColor) {
                                    e.currentTarget.style.background = confirmHoverColor;
                                } else {
                                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(236,72,153,0.3)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (confirmBtnImgUrl) {
                                    e.currentTarget.style.backgroundImage = `url(${confirmBtnImgUrl})`;
                                } else if (confirmHoverImgUrl) {
                                    e.currentTarget.style.backgroundImage = 'none';
                                    e.currentTarget.style.background = confirmBtnColor || 'linear-gradient(to right, #ec4899, #a855f7)';
                                } else if (confirmHoverColor) {
                                    e.currentTarget.style.background = confirmBtnColor || 'linear-gradient(to right, #ec4899, #a855f7)';
                                } else {
                                    e.currentTarget.style.boxShadow = 'none';
                                }
                            }}
                        >
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Player Component ---
const LivePreview: React.FC<{ onClose: () => void; hideCloseButton?: boolean; autoStartMusic?: boolean }> = ({ onClose, hideCloseButton = false, autoStartMusic = false }) => {
    const { project } = useProject();
    
    const getValidTitleScreenId = useCallback(() => {
        // 1. Check if the assigned title screen ID is valid
        if (project.ui.titleScreenId && project.uiScreens[project.ui.titleScreenId]) {
            return project.ui.titleScreenId;
        }
        // 2. Fallback: Look for a screen named "Title Screen"
        const fallbackByName = Object.values(project.uiScreens).find(s => (s as VNUIScreen).name.toLowerCase() === 'title screen');
        if (fallbackByName) {
            return (fallbackByName as VNUIScreen).id;
        }
        // 3. Last resort: Fallback to the very first screen available
        return Object.keys(project.uiScreens)[0] || null;
    }, [project.ui.titleScreenId, project.uiScreens]);

    const titleScreenId = getValidTitleScreenId();
    const [screenStack, setScreenStack] = useState<VNID[]>(titleScreenId ? [titleScreenId] : []);
    // hudStack holds screens shown as in-game overlays while in 'playing' mode
    const [hudStack, setHudStack] = useState<VNID[]>([]);
    // Track screens that are currently closing with transitions
    const [closingScreens, setClosingScreens] = useState<Set<VNID>>(new Set());
    // In-game confirmation dialog state
    const [confirmDialog, setConfirmDialog] = useState<{ type: 'quit' | 'newGame'; pendingAction: VNUIAction } | null>(null);
    // Track scene exit transition (type, duration, and active state)
    const [sceneTransitionFading, setSceneTransitionFading] = useState(false);
    const [sceneTransitionType, setSceneTransitionType] = useState<'fade' | 'dissolve' | 'iris-out' | 'wipe-right' | 'slide-left' | 'instant'>('fade');
    const [sceneTransitionDuration, setSceneTransitionDuration] = useState(0.5);
    const [settings, setSettings] = useState<GameSettings>(() => {
        const projectDefaults = project.ui?.defaultGameSettings;
        if (projectDefaults) {
            // Merge with defaults to fill any missing fields (e.g. ambientVolume for older projects)
            return { ...defaultSettings, ...projectDefaults };
        }
        return { ...defaultSettings };
    });
    const [playerState, setPlayerState] = useState<PlayerState | null>(null);
    const playerStateRef = useRef<PlayerState | null>(null);
    // Tween tick counter — forces re-render each frame during active tweens
    const [, setTweenTick] = useState(0);
    useEffect(() => {
        const unsub = TweenManager.subscribe(() => {
            setTweenTick(t => t + 1);
        });
        return unsub;
    }, []);
    const updatePlayerState = useCallback((updater: React.SetStateAction<PlayerState | null>) => {
        setPlayerState(prev => {
            const next = typeof updater === 'function'
                ? (updater as (prevState: PlayerState | null) => PlayerState | null)(prev)
                : updater;
            playerStateRef.current = next;
            return next;
        });
    }, []);

    useEffect(() => {
        playerStateRef.current = playerState;
        if (playerState?.mode === 'playing') {
            const stage = playerState.stageState;
            if (
                stage.backgroundUrl ||
                Object.keys(stage.characters).length > 0 ||
                stage.textOverlays.length > 0 ||
                stage.imageOverlays.length > 0 ||
                stage.buttonOverlays.length > 0
            ) {
                hasRenderedSceneRef.current = true;
            }
        } else {
            hasRenderedSceneRef.current = false;
        }
    }, [playerState]);
    const [gameSaves, setGameSaves] = useState<Record<number, GameStateSave>>({});
    const [isJustLoaded, setIsJustLoaded] = useState(false);
    
    // Menu variables: used for UI screens before game starts (e.g., character customization)
    // Includes persistent variable overrides so CG unlock status is visible on title/menu screens
    const [menuVariables, setMenuVariables] = useState<Record<VNID, string | number | boolean>>(() => {
        return getInitialVariablesWithPersistent(project.variables, project.id);
    });
    
    // UI variables: used for UI screens during gameplay (separate from game variables until merged back)
    const [uiVariables, setUiVariables] = useState<Record<VNID, string | number | boolean>>(() => {
        return getInitialVariablesWithPersistent(project.variables, project.id);
    });
    const uiVariablesRef = useRef<Record<VNID, string | number | boolean>>(uiVariables);

    useEffect(() => {
        uiVariablesRef.current = uiVariables;
    }, [uiVariables]);
    
    // Sync menuVariables when project variables change
    useEffect(() => {
        const updatedVars: Record<VNID, string | number | boolean> = {};
        Object.values(project.variables).forEach((v: any) => {
            // Keep existing value if it exists, otherwise use default
            updatedVars[v.id] = menuVariables[v.id] !== undefined ? menuVariables[v.id] : v.defaultValue;
        });
        setMenuVariables(updatedVars);
    }, [project.variables]);
    
    // Load custom fonts (project library + character overrides)
    useEffect(() => {
        const loadCustomFonts = async () => {
            // Project-level font library
            const projectFonts = (project as any).fonts || {};
            for (const fontId in projectFonts) {
                const font = projectFonts[fontId];
                if (font?.fontUrl && font?.fontFamily) {
                    try {
                        const fontFace = new FontFace(font.fontFamily, `url(${font.fontUrl})`);
                        await fontFace.load();
                        (document as any).fonts.add(fontFace);
                        runtimeDebugLog(`✓ Loaded project font: ${font.fontFamily}`);
                    } catch (error) {
                        console.error(`Failed to load project font ${font?.name || fontId}:`, error);
                    }
                }
            }

            for (const charId in project.characters) {
                const char = project.characters[charId];
                if (char.fontUrl && char.fontFamily) {
                    try {
                        // Create @font-face rule for custom font
                        const fontFace = new FontFace(char.fontFamily, `url(${char.fontUrl})`);
                        await fontFace.load();
                        (document as any).fonts.add(fontFace);
                        runtimeDebugLog(`✓ Loaded custom font: ${char.fontFamily}`);
                    } catch (error) {
                        console.error(`Failed to load custom font for ${char.name}:`, error);
                    }
                }
            }
        };
        loadCustomFonts();
    }, [project.characters, (project as any).fonts]);
    
    const musicAudioRef = useRef<HTMLAudioElement>(new Audio());
    const ambientNoiseAudioRef = useRef<HTMLAudioElement>(new Audio());
    const menuMusicUrlRef = useRef<string | null>(null);
    const menuAmbientUrlRef = useRef<string | null>(null);
    const audioFadeInterval = useRef<number | null>(null);
    const ambientFadeInterval = useRef<number | null>(null);
    // Stage ref used for measuring pixel size for accurate slide animations
    const stageRef = useRef<HTMLDivElement | null>(null);
    const stageSize = useStageSize(stageRef);
    // Play-container ref – measures the aspect-ratio box so we can set --font-scale
    const playContainerRef = useRef<HTMLDivElement | null>(null);
    const playContainerSize = useStageSize(playContainerRef);
    // WebAudio resources for SFX
    const audioCtxRef = useRef<AudioContext | null>(null);
    const sfxBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
    const sfxSourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
    const sfxMasterGainRef = useRef<GainNode | null>(null);
    const sfxCompressorRef = useRef<DynamicsCompressorNode | null>(null);
    const sfxProcessingCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
    const MAX_SIMULTANEOUS_SFX = 8;

    // In-memory saves fallback when localStorage is unavailable or full
    const savesPersistentRef = useRef<boolean>(true); // assume persistent until proven otherwise
    const inMemorySavesRef = useRef<Record<number, GameStateSave>>({});

    // Queue music when autoplay is blocked; retry when user interacts
    const queuedMusicRef = useRef<{ url: string; loop: boolean; fadeDuration: number } | null>(null);
    const userGestureDetectedRef = useRef<boolean>(false);

    // Track active one-shot SFX so we can stop them when a scene ends
    const sfxPoolRef = useRef<HTMLAudioElement[]>([]);
    const commandSchedulerRef = useRef(new CommandScheduler());
    const hasRenderedSceneRef = useRef(false);
    const runtimeDiagnosticsRef = useRef(new RuntimeDiagnostics());
    const variableStoreRef = useRef<RuntimeVariableStore | null>(null);
    const uiDirtyVariableIdsRef = useRef<Set<VNID>>(new Set());
    const activeEffectTimeoutsRef = useRef<number[]>([]);
    
    // Use refs for visual effects to avoid triggering command loop re-execution
    const activeFlashRef = useRef<{ color: string; duration: number; key: number } | null>(null);
    const activeShakeRef = useRef<{ intensity: number; duration: number } | null>(null);
    const [flashTrigger, setFlashTrigger] = useState(0);
    const [shakeTrigger, setShakeTrigger] = useState(0);
    const [activeCreditRoll, setActiveCreditRoll] = useState<CreditRollCommand | null>(null);

    const assetResolver = useCallback((assetId: VNID | null, type: 'audio' | 'video' | 'image'): string | null => {
        if (!assetId) return null;
        
        switch(type) {
            case 'audio': 
                return project.audio[assetId]?.audioUrl || null;
            case 'video': 
                return project.videos[assetId]?.videoUrl || null;
            case 'image': {
                // Check backgrounds first (primary source for UI images)
                if (project.backgrounds[assetId]) {
                    const bg = project.backgrounds[assetId];
                    return bg.videoUrl || bg.imageUrl || null;
                }
                // Check images collection
                if (project.images && project.images[assetId]) {
                    const img = project.images[assetId];
                    return img.videoUrl || img.imageUrl || null;
                }
                // Check videos collection as fallback (in case type='image' was passed for a video asset)
                if (project.videos[assetId]) {
                    return project.videos[assetId]?.videoUrl || null;
                }
                // Check character assets as final fallback
                for (const charId in project.characters) {
                    const char = project.characters[charId];
                    // Character's base image ID is the character's ID itself
                    if (char.id === assetId) {
                        return char.baseVideoUrl || char.baseImageUrl || null;
                    }
                    for (const layerId in char.layers) {
                        const layer = char.layers[layerId];
                        if (layer.assets[assetId]) {
                            const asset = layer.assets[assetId];
                            return asset.videoUrl || asset.imageUrl || null;
                        }
                    }
                }
                return null;
            }
        }
    }, [project]);
    
    // Helper to get asset metadata (is it a video, should it loop, etc.)
    const getAssetMetadata = useCallback((assetId: VNID | null, type: 'image'): { isVideo: boolean; loop: boolean } => {
        if (!assetId) return { isVideo: false, loop: false };
        
        if (project.backgrounds[assetId]) {
            const bg = project.backgrounds[assetId];
            return { isVideo: !!bg.isVideo, loop: !!bg.loop };
        }
        
        if (project.images && project.images[assetId]) {
            const img = project.images[assetId];
            return { isVideo: !!img.isVideo, loop: !!img.loop };
        }

        // Check videos collection
        if (project.videos && project.videos[assetId]) {
            return { isVideo: true, loop: true };
        }
        
        // Check characters
        for (const charId in project.characters) {
            const char = project.characters[charId];
            if (char.id === assetId) {
                return { isVideo: !!char.isBaseVideo, loop: !!char.baseVideoLoop };
            }
            for (const layerId in char.layers) {
                const layer = char.layers[layerId];
                if (layer.assets[assetId]) {
                    const asset = layer.assets[assetId];
                    return { isVideo: !!asset.isVideo, loop: !!asset.loop };
                }
            }
        }
        
        return { isVideo: false, loop: false };
    }, [project]);
    
    const fadeAudio = useCallback((audioElement: HTMLAudioElement, targetVolume: number, duration: number, onComplete?: () => void) => {
        // Ensure target volume is a valid finite number
        const safeTarget = Number.isFinite(targetVolume) ? Math.max(0, Math.min(1, targetVolume)) : 0.8;
        // Use different interval refs for different audio elements
        const intervalRef = audioElement === musicAudioRef.current ? audioFadeInterval : ambientFadeInterval;
        
        if (intervalRef.current) clearInterval(intervalRef.current);
        
        const startVolume = audioElement.volume;
        const volumeChange = safeTarget - startVolume;
        if (duration === 0) {
            audioElement.volume = safeTarget;
            onComplete?.();
            return;
        }
        
        const startTime = Date.now();

        intervalRef.current = window.setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            const progress = Math.min(elapsedTime / (duration * 1000), 1);
            const newVol = startVolume + volumeChange * progress;
            audioElement.volume = Math.max(0, Math.min(1, newVol));

            if (progress >= 1) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                intervalRef.current = null;
                onComplete?.();
            }
        }, 30);
    }, []);

    const stopAndResetMusic = useCallback(() => {
        const audio = musicAudioRef.current;
        if (audio && !audio.paused) {
            fadeAudio(audio, 0, 0.5, () => {
                audio.pause();
                audio.src = '';
            });
        } else if (audio) {
            // If paused but has a source, just clear it
            audio.src = '';
        }

        menuMusicUrlRef.current = null;

        // Also stop ambient noise
        const ambientAudio = ambientNoiseAudioRef.current;
        if (ambientAudio && !ambientAudio.paused) {
            fadeAudio(ambientAudio, 0, 0.5, () => {
                ambientAudio.pause();
                ambientAudio.src = '';
            });
        } else if (ambientAudio) {
            ambientAudio.src = '';
        }
        menuAmbientUrlRef.current = null;
    }, [fadeAudio]);

    // --- Save/Load System ---
    const savesKey = useMemo(() => `vn-saves-${project.id}`, [project.id]);

    const hasElectronStorage = useCallback((): boolean => {
        return typeof window !== 'undefined' &&
            typeof (window as any).electronAPI !== 'undefined' &&
            typeof (window as any).electronAPI?.storage !== 'undefined';
    }, []);

    const getGameSaves = useCallback(async (): Promise<Record<number, GameStateSave>> => {
        try {
            if (hasElectronStorage()) {
                const raw = await (window as any).electronAPI.storage.getItem(savesKey);
                if (raw == null) return {};
                // We store the object directly in Electron storage
                return raw as Record<number, GameStateSave>;
            }

            const savesJson = localStorage.getItem(savesKey);
            return savesJson ? JSON.parse(savesJson) : {};
        } catch (e) {
            runtimeDebugWarn('Failed to load saves from storage:', e);
            return {};
        }
    }, [hasElectronStorage, savesKey]);

    const saveGameSaves = useCallback(async (saves: Record<number, GameStateSave>) => {
        try {
            if (hasElectronStorage()) {
                await (window as any).electronAPI.storage.setItem(savesKey, saves);
            } else {
                localStorage.setItem(savesKey, JSON.stringify(saves));
            }
            savesPersistentRef.current = true;
        } catch (e) {
            console.error('Failed to save to storage:', e);
            // switch to in-memory saves and mark persistence as false to avoid repeated attempts
            savesPersistentRef.current = false;
            inMemorySavesRef.current = saves;
            // Could show a user notification here
        }
    }, [hasElectronStorage, savesKey]);

    // Export saves to a file (user can download to keep them outside localStorage)
    const exportSavesToFile = useCallback(() => {
        const saves = savesPersistentRef.current ? getGameSaves() : inMemorySavesRef.current;
        const blob = new Blob([JSON.stringify(saves, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vn-saves-${project.id}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }, [getGameSaves, project.id]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const saves = await getGameSaves();
            if (!cancelled) setGameSaves(saves);
        })();
        return () => {
            cancelled = true;
        };
    }, [getGameSaves, screenStack]);

    const saveGame = (slotNumber: number) => {
        if (!playerState) return;
        const musicCurrentTime = musicAudioRef.current ? musicAudioRef.current.currentTime : 0;
        const finalMusicState: MusicState = {
            ...playerState.musicState,
            currentTime: musicCurrentTime,
            isPlaying: !musicAudioRef.current.paused,
        };

        // Capture a screenshot thumbnail from the stage
        const captureScreenshot = (): Promise<string | undefined> => {
            return new Promise((resolve) => {
                try {
                    const stage = playerState.stageState;
                    const THUMB_W = 640;
                    const THUMB_H = 360;
                    const canvas = document.createElement('canvas');
                    canvas.width = THUMB_W;
                    canvas.height = THUMB_H;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { resolve(undefined); return; }

                    // Collect image sources to draw in order: background, then characters
                    const imageSources: { url: string; x: number; y: number; w: number; h: number }[] = [];

                    // Background
                    if (stage.backgroundUrl && !stage.backgroundIsVideo) {
                        imageSources.push({ url: stage.backgroundUrl, x: 0, y: 0, w: THUMB_W, h: THUMB_H });
                    }

                    // Characters (layer images stacked at their positions)
                    for (const char of Object.values(stage.characters) as StageCharacterState[]) {
                        if (char.isVideo) continue;
                        const pos = char.position;
                        let xPct = 50, yPct = 10;
                        if (typeof pos === 'string') {
                            const presets: Record<string, { x: number; y: number }> = {
                                'left': { x: 25, y: 10 }, 'center': { x: 50, y: 10 }, 'right': { x: 75, y: 10 },
                                'off-left': { x: -25, y: 10 }, 'off-right': { x: 125, y: 10 },
                            };
                            const p = presets[pos]; if (p) { xPct = p.x; yPct = p.y; }
                        } else if (typeof pos === 'object') {
                            xPct = pos.x; yPct = pos.y;
                        }
                        // Characters are ~75% of stage width in aspect 3:4, vertically 90% height
                        const charH = THUMB_H * 0.9;
                        const charW = charH * 0.75;
                        const cx = (xPct / 100) * THUMB_W - charW / 2;
                        const cy = (yPct / 100) * THUMB_H;
                        for (const url of char.imageUrls) {
                            imageSources.push({ url, x: cx, y: cy, w: charW, h: charH });
                        }
                    }

                    if (imageSources.length === 0) {
                        // No visual content, just fill black
                        ctx.fillStyle = '#000';
                        ctx.fillRect(0, 0, THUMB_W, THUMB_H);
                        resolve(canvas.toDataURL('image/jpeg', 0.85));
                        return;
                    }

                    let loaded = 0;
                    const images: (HTMLImageElement | null)[] = new Array(imageSources.length).fill(null);
                    const onAllLoaded = () => {
                        ctx.fillStyle = '#000';
                        ctx.fillRect(0, 0, THUMB_W, THUMB_H);
                        for (let idx = 0; idx < images.length; idx++) {
                            const img = images[idx];
                            const src = imageSources[idx];
                            if (img && img.complete && img.naturalWidth > 0) {
                                ctx.drawImage(img, src.x, src.y, src.w, src.h);
                            }
                        }
                        resolve(canvas.toDataURL('image/jpeg', 0.85));
                    };

                    for (let idx = 0; idx < imageSources.length; idx++) {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => { images[idx] = img; loaded++; if (loaded >= imageSources.length) onAllLoaded(); };
                        img.onerror = () => { loaded++; if (loaded >= imageSources.length) onAllLoaded(); };
                        img.src = imageSources[idx].url;
                    }

                    // Timeout fallback
                    setTimeout(() => { if (loaded < imageSources.length) onAllLoaded(); }, 2000);
                } catch {
                    resolve(undefined);
                }
            });
        };

        const createSaveRecord = async () => {
            const screenshot = await captureScreenshot();
            const saves = await getGameSaves();
            saves[slotNumber] = {
            timestamp: Date.now(),
            sceneName: project.scenes[playerState.currentSceneId]?.name || 'Unknown Scene',
            screenshot,
            playerStateData: {
                currentSceneId: playerState.currentSceneId,
                currentCommands: playerState.currentCommands,
                currentIndex: playerState.currentIndex,
                commandStack: playerState.commandStack,
                variables: playerState.variables,
                stageState: playerState.stageState,
                musicState: finalMusicState,
            }
            };

            // If persistence failed previously, store in memory and avoid hitting storage repeatedly
            if (!savesPersistentRef.current) {
                inMemorySavesRef.current = saves;
            } else {
                await saveGameSaves(saves);
            }
            setGameSaves(saves);
        };

        void createSaveRecord();
    };

    const loadGame = (slotNumber: number) => {
        // Immediately stop music without fade to avoid race condition where
        // old fade callback clears audio.src after the new track is loaded
        const audio = musicAudioRef.current;
        if (audioFadeInterval.current) { clearInterval(audioFadeInterval.current); audioFadeInterval.current = null; }
        if (audio) { audio.pause(); audio.volume = 0; audio.src = ''; }
        const ambientAudio = ambientNoiseAudioRef.current;
        if (ambientFadeInterval.current) { clearInterval(ambientFadeInterval.current); ambientFadeInterval.current = null; }
        if (ambientAudio) { ambientAudio.pause(); ambientAudio.src = ''; }
        menuMusicUrlRef.current = null;
        const doLoad = async () => {
            const saves = savesPersistentRef.current ? await getGameSaves() : inMemorySavesRef.current;
            const saveData = saves[slotNumber];
            if (!saveData) return;

            updatePlayerState({
                mode: 'playing',
                currentSceneId: saveData.playerStateData.currentSceneId,
                currentCommands: saveData.playerStateData.currentCommands || project.scenes[saveData.playerStateData.currentSceneId]?.commands || [],
                currentIndex: saveData.playerStateData.currentIndex ?? 0,
                commandStack: saveData.playerStateData.commandStack || [],
                variables: saveData.playerStateData.variables,
                stageState: saveData.playerStateData.stageState,
                history: [],
                savedInputs: {},
                uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, movieLoop: false, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null, showHistory: false, screenSceneId: null, isSkipping: false },
                musicState: saveData.playerStateData.musicState,
            });
            setScreenStack([]);
            setHudStack([]);
            setIsJustLoaded(true);
        };

        void doLoad();
    };


    // --- State Initialization ---
    const startNewGame = useCallback(() => {
        stopAndResetMusic();
        
        // Use menuVariables (which may have been modified by character customization) instead of defaults
        const initialVariables: Record<VNID, string | number | boolean> = { ...menuVariables };

        // Merge persistent variables from storage — they survive across sessions
        const persistentVars = loadPersistentVariables(project.id);
        Object.values(project.variables).forEach((v: any) => {
            if ((v.scope || 'global') === 'persistent' && persistentVars[v.id] !== undefined) {
                initialVariables[v.id] = persistentVars[v.id];
            }
        });

        // Note: We can't use navigateToScene here because it's defined after startNewGame
        // We'll check start scene conditions inline
        let startSceneId = project.startSceneId;
        const startScene = project.scenes[startSceneId];
        
        // Check if start scene has conditions that fail
        if (startScene && startScene.conditions && startScene.conditions.length > 0) {
            const conditionsMet = startScene.conditions.every(condition => {
                const varValue = initialVariables[condition.variableId];
                if (varValue === undefined) return false;
                
                switch (condition.operator) {
                    case 'is true': return !!varValue;
                    case 'is false': return !varValue;
                    case '==': return String(varValue).toLowerCase() == String(condition.value).toLowerCase();
                    case '!=': return String(varValue).toLowerCase() != String(condition.value).toLowerCase();
                    case '>': return Number(varValue) > Number(condition.value);
                    case '<': return Number(varValue) < Number(condition.value);
                    case '>=': return Number(varValue) >= Number(condition.value);
                    case '<=': return Number(varValue) <= Number(condition.value);
                    case 'contains': return String(varValue).toLowerCase().includes(String(condition.value).toLowerCase());
                    case 'startsWith': return String(varValue).toLowerCase().startsWith(String(condition.value).toLowerCase());
                    default: return false;
                }
            });
            
            if (!conditionsMet && startScene.fallbackSceneId) {
                runtimeDebugLog(`Start scene "${startScene.name}" conditions not met, using fallback`);
                startSceneId = startScene.fallbackSceneId;
            }
        }

        // Initialize uiVariables with the same initial values as game variables
    setUiVariables(initialVariables);
    uiVariablesRef.current = initialVariables;
    runtimeDebugLog('[CLEAR] Dirty set cleared after startNewGame');
    uiDirtyVariableIdsRef.current.clear();
        
    updatePlayerState({
            mode: 'playing',
            currentSceneId: startSceneId,
            currentCommands: project.scenes[startSceneId]?.commands || [],
            currentIndex: 0,
            commandStack: [],
            variables: initialVariables,
            stageState: { backgroundUrl: null, characters: {}, textOverlays: [], imageOverlays: [], buttonOverlays: [], imageMapOverlays: [], movieOverlays: [], screen: { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0, transitionDuration: 0.5, overlayEffects: [] }, particleEffects: {} },
            history: [],
            savedInputs: {},
            uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, movieLoop: false, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null, showHistory: false, screenSceneId: null, isSkipping: false },
            musicState: { audioId: null, loop: false, currentTime: 0, isPlaying: false },
        });
        setScreenStack([]);
        setHudStack([]);
    }, [project, stopAndResetMusic, menuVariables]);

    // Helper function to get asset name from ID
    const getAssetNameFromId = useCallback((assetId: string): string | null => {
        // Search through all asset types to find the asset name
        
        // Check backgrounds
        const background = project.backgrounds[assetId];
        if (background) return background.name;
        
        // Check images  
        const image = project.images[assetId];
        if (image) return image.name;
        
        // Check videos
        const video = project.videos[assetId];
        if (video) return video.name;
        
        // Check audio
        const audio = project.audio[assetId];
        if (audio) return audio.name;
        
        // Check character layers
        for (const character of Object.values(project.characters) as VNCharacter[]) {
            if (character && character.layers) {
                for (const layer of Object.values(character.layers) as VNCharacterLayer[]) {
                    if (layer && layer.assets) {
                        const asset = layer.assets[assetId];
                        if (asset) return asset.name;
                    }
                }
            }
        }
        
        return null;
    }, [project]);

    const normalizeToBoolean = useCallback((value: unknown): boolean | null => {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            if (value === 1) return true;
            if (value === 0) return false;
            return null;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized.length === 0) {
                return null;
            }
            if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
            if (['false', '0', 'no', 'off'].includes(normalized)) return false;
            return null;
        }
        return null;
    }, []);

    const evaluateConditions = useCallback((conditions: VNCondition[] | undefined, variables: PlayerState['variables']): boolean => {
        if (!conditions || conditions.length === 0) {
            return true;
        }
    
        return conditions.every(condition => {
            const varValue = variables[condition.variableId];
            const projectVar = project.variables[condition.variableId];
            // Use default value if runtime value is not set
            const effectiveVarValue = varValue !== undefined ? varValue : (projectVar ? projectVar.defaultValue : undefined);
    
            runtimeDebugLog('[DEBUG evaluateConditions]', {
                variableId: condition.variableId,
                operator: condition.operator,
                conditionValue: condition.value,
                effectiveVarValue,
                varValue,
                defaultValue: projectVar?.defaultValue
            });
    
            if (effectiveVarValue === undefined) {
                runtimeDebugLog('[DEBUG evaluateConditions] Variable undefined, returning false');
                return false; // condition on non-existent variable is false
            }
            
            let result = false;
            
            // For string comparisons, also check if we're comparing against an asset name when variable contains an asset ID
            const stringVarValue = String(effectiveVarValue);
            const stringCondValue = String(condition.value);
            const normVarString = stringVarValue.toLowerCase();
            const normCondString = stringCondValue.toLowerCase();
            const normalizedVarBool = normalizeToBoolean(effectiveVarValue);
            const normalizedCondBool = normalizeToBoolean(condition.value);
            const boolNumericForComparison = normalizedVarBool === null ? null : (normalizedVarBool ? 100 : 0);
            const condBoolNumericForComparison = normalizedCondBool === null ? null : (normalizedCondBool ? 100 : 0);
            let assetName: string | null = null;
            const varIsNumeric = typeof effectiveVarValue === 'number' || (typeof effectiveVarValue === 'string' && effectiveVarValue.trim().length > 0 && !Number.isNaN(Number(effectiveVarValue)));
            const condIsNumeric = typeof condition.value === 'number' || (typeof condition.value === 'string' && condition.value.trim().length > 0 && !Number.isNaN(Number(condition.value)));
            
            // If variable contains an asset ID, try to get the asset name for comparison
            if (stringVarValue.startsWith('asset-')) {
                assetName = getAssetNameFromId(stringVarValue);
                runtimeDebugLog('[DEBUG evaluateConditions] Variable contains asset ID, resolved name:', assetName);
            }
            
            switch (condition.operator) {
                case 'is true': {
                    if (normalizedVarBool !== null) {
                        result = normalizedVarBool === true;
                    } else {
                        result = String(effectiveVarValue).trim().toLowerCase() === 'true';
                    }
                    break;
                }
                case 'is false': {
                    if (normalizedVarBool !== null) {
                        result = normalizedVarBool === false;
                    } else {
                        const normalizedString = String(effectiveVarValue).trim().toLowerCase();
                        result = normalizedString === 'false' || normalizedString.length === 0;
                    }
                    break;
                }
                case '==': {
                    if (normalizedVarBool !== null && normalizedCondBool !== null) {
                        result = normalizedVarBool === normalizedCondBool;
                    } else if (projectVar?.type === 'boolean' && normCondString.length === 0) {
                        // Treat blank condition as an implicit check for true
                        result = normalizedVarBool === true;
                    } else if (varIsNumeric && condIsNumeric) {
                        result = Number(effectiveVarValue) === Number(condition.value);
                    } else {
                        const matchesString = normVarString === normCondString;
                        const matchesAsset = assetName ? assetName.toLowerCase() === normCondString : false;
                        result = matchesString || matchesAsset;
                    }
                    break;
                }
                case '!=': {
                    if (normalizedVarBool !== null && normalizedCondBool !== null) {
                        result = normalizedVarBool !== normalizedCondBool;
                    } else if (projectVar?.type === 'boolean' && normCondString.length === 0) {
                        // Treat blank condition as an implicit check for true
                        result = normalizedVarBool !== true;
                    } else if (varIsNumeric && condIsNumeric) {
                        result = Number(effectiveVarValue) !== Number(condition.value);
                    } else {
                        const matchesString = normVarString === normCondString;
                        const matchesAsset = assetName ? assetName.toLowerCase() === normCondString : false;
                        result = !matchesString && !matchesAsset;
                    }
                    break;
                }
                case '>': {
                    if (projectVar?.type === 'boolean' && boolNumericForComparison !== null) {
                        const condTarget = condIsNumeric ? Number(condition.value) : condBoolNumericForComparison;
                        if (condTarget !== null && Number.isFinite(condTarget)) {
                            result = boolNumericForComparison > condTarget;
                            runtimeDebugLog('[DEBUG evaluateConditions] Boolean comparison >', {
                                effectiveVarValue,
                                conditionValue: condition.value,
                                boolNumericValue: boolNumericForComparison,
                                numericCond: condTarget,
                                result
                            });
                            break;
                        }
                    }

                    const numericVar = Number(effectiveVarValue);
                    const numericCond = Number(condition.value);
                    result = numericVar > numericCond;
                    runtimeDebugLog('[DEBUG evaluateConditions] Numeric comparison >', {
                        effectiveVarValue,
                        conditionValue: condition.value,
                        numericVar,
                        numericCond,
                        result
                    });
                    break;
                }
                case '<': {
                    if (projectVar?.type === 'boolean' && boolNumericForComparison !== null) {
                        const condTarget = condIsNumeric ? Number(condition.value) : condBoolNumericForComparison;
                        if (condTarget !== null && Number.isFinite(condTarget)) {
                            result = boolNumericForComparison < condTarget;
                            runtimeDebugLog('[DEBUG evaluateConditions] Boolean comparison <', {
                                effectiveVarValue,
                                conditionValue: condition.value,
                                boolNumericValue: boolNumericForComparison,
                                numericCond: condTarget,
                                result
                            });
                            break;
                        }
                    }

                    const numericVar = Number(effectiveVarValue);
                    const numericCond = Number(condition.value);
                    result = numericVar < numericCond;
                    runtimeDebugLog('[DEBUG evaluateConditions] Numeric comparison <', {
                        effectiveVarValue,
                        conditionValue: condition.value,
                        numericVar,
                        numericCond,
                        result
                    });
                    break;
                }
                case '>=': {
                    if (projectVar?.type === 'boolean' && boolNumericForComparison !== null) {
                        const condTarget = condIsNumeric ? Number(condition.value) : condBoolNumericForComparison;
                        if (condTarget !== null && Number.isFinite(condTarget)) {
                            result = boolNumericForComparison >= condTarget;
                            runtimeDebugLog('[DEBUG evaluateConditions] Boolean comparison >=', {
                                effectiveVarValue,
                                conditionValue: condition.value,
                                boolNumericValue: boolNumericForComparison,
                                numericCond: condTarget,
                                result
                            });
                            break;
                        }
                    }

                    const numericVar = Number(effectiveVarValue);
                    const numericCond = Number(condition.value);
                    result = numericVar >= numericCond;
                    runtimeDebugLog('[DEBUG evaluateConditions] Numeric comparison >=', {
                        effectiveVarValue,
                        conditionValue: condition.value,
                        numericVar,
                        numericCond,
                        result
                    });
                    break;
                }
                case '<=': {
                    if (projectVar?.type === 'boolean' && boolNumericForComparison !== null) {
                        const condTarget = condIsNumeric ? Number(condition.value) : condBoolNumericForComparison;
                        if (condTarget !== null && Number.isFinite(condTarget)) {
                            result = boolNumericForComparison <= condTarget;
                            runtimeDebugLog('[DEBUG evaluateConditions] Boolean comparison <=', {
                                effectiveVarValue,
                                conditionValue: condition.value,
                                boolNumericValue: boolNumericForComparison,
                                numericCond: condTarget,
                                result
                            });
                            break;
                        }
                    }

                    const numericVar = Number(effectiveVarValue);
                    const numericCond = Number(condition.value);
                    result = numericVar <= numericCond;
                    runtimeDebugLog('[DEBUG evaluateConditions] Numeric comparison <=', {
                        effectiveVarValue,
                        conditionValue: condition.value,
                        numericVar,
                        numericCond,
                        result
                    });
                    break;
                }
                case 'contains': {
                    const varContains = normVarString.includes(normCondString);
                    const assetContains = assetName ? assetName.toLowerCase().includes(normCondString) : false;
                    result = varContains || assetContains;
                    break;
                }
                case 'startsWith': {
                    const varStartsWith = normVarString.startsWith(normCondString);
                    const assetStartsWith = assetName ? assetName.toLowerCase().startsWith(normCondString) : false;
                    result = varStartsWith || assetStartsWith;
                    break;
                }
                default: 
                    result = false;
            }
            
            runtimeDebugLog('[DEBUG evaluateConditions] Result:', result);
            return result;
        });
    }, [project.variables, getAssetNameFromId, normalizeToBoolean]);

    // Helper function to navigate to a scene with condition checking
    const navigateToScene = useCallback((targetSceneId: VNID, variables: PlayerState['variables']): VNID => {
        let sceneToPlay = targetSceneId;
        let attempts = 0;
        const maxAttempts = 50; // Prevent infinite loops

        while (attempts < maxAttempts) {
            const scene = project.scenes[sceneToPlay];
            if (!scene) {
                console.error(`Scene not found: ${sceneToPlay}`);
                return targetSceneId; // Return original target if not found
            }

            // Check if scene conditions are met
            if (evaluateConditions(scene.conditions, variables)) {
                return sceneToPlay; // Conditions met, play this scene
            }

            // Conditions failed, check for fallback
            if (scene.fallbackSceneId && project.scenes[scene.fallbackSceneId]) {
                runtimeDebugLog(`Scene "${scene.name}" conditions failed, jumping to fallback: ${scene.fallbackSceneId}`);
                sceneToPlay = scene.fallbackSceneId;
            } else {
                // No fallback, find next scene in scene list
                const sceneIds = Object.keys(project.scenes);
                const currentIndex = sceneIds.indexOf(sceneToPlay);
                if (currentIndex !== -1 && currentIndex < sceneIds.length - 1) {
                    sceneToPlay = sceneIds[currentIndex + 1];
                    runtimeDebugLog(`Scene "${scene.name}" conditions failed, trying next scene: ${sceneToPlay}`);
                } else {
                    runtimeDebugLog(`Scene "${scene.name}" conditions failed and no fallback/next scene available`);
                    return sceneToPlay; // Can't go anywhere, return current
                }
            }

            attempts++;
        }

        console.error('Scene navigation exceeded max attempts - possible circular fallback');
        return targetSceneId;
    }, [project.scenes, evaluateConditions]);

    // --- Scene Exit Transition Helper ---
    const startSceneExitTransition = useCallback((currentSceneId: string, executeChange: () => void) => {
        const currentScene = project.scenes[currentSceneId];
        const transType = currentScene?.outTransition || 'fade';
        const duration = currentScene?.outTransitionDuration ?? 0.5;
        const shouldFade = hasRenderedSceneRef.current;

        if (transType === 'instant' || !shouldFade) {
            executeChange();
            return;
        }

        // Fade audio during transition
        const audio = musicAudioRef.current;
        if (audio && !audio.paused) {
            fadeAudio(audio, 0, duration, () => {
                audio.pause();
                audio.currentTime = 0;
            });
        }

        setSceneTransitionType(transType);
        setSceneTransitionDuration(duration);
        setSceneTransitionFading(true);

        setTimeout(() => {
            executeChange();
            setSceneTransitionFading(false);
        }, duration * 1000);
    }, [project.scenes]);

    // --- Audio Management ---
    useEffect(() => {
        if (playerState?.mode === 'playing') {
            return;
        }

        const audio = musicAudioRef.current;
        const activeScreen = screenStack.length > 0 ? project.uiScreens[screenStack[screenStack.length - 1]] : null;
        if (!activeScreen) {
            if (!audio.paused) {
                fadeAudio(audio, 0, 0.5, () => audio.pause());
            }
            menuMusicUrlRef.current = null;
            return;
        }

        const musicInfo = activeScreen.music;
        if (playerState?.mode === 'paused' && musicInfo.policy === 'continue') {
            return;
        }

        const newAudioUrl = musicInfo?.audioId ? assetResolver(musicInfo.audioId, 'audio') : null;
        const normalize = (value: string | null): string | null => {
            if (!value) return null;
            try {
                return new URL(value, window.location.href).href;
            } catch (e) {
                return value;
            }
        };

        const currentSrcNormalized = audio.src ? normalize(audio.src) : null;
        const newSrcNormalized = normalize(newAudioUrl);

        if (!newAudioUrl) {
            if (!audio.paused) {
                fadeAudio(audio, 0, 0.5, () => audio.pause());
            }
            menuMusicUrlRef.current = null;
            return;
        }

        const startPlayback = () => {
            audio.loop = true;
            audio.play().then(() => {
                menuMusicUrlRef.current = newAudioUrl;
                const screenVol = musicInfo.volume ?? 1;
                fadeAudio(audio, screenVol * settings.musicVolume, 0.5);
            }).catch(e => {
                console.error('Menu music play failed:', e);
                if (!userGestureDetectedRef.current) {
                    queuedMusicRef.current = { url: newAudioUrl, loop: true, fadeDuration: 0.5 };
                }
            });
        };

        if (currentSrcNormalized !== newSrcNormalized) {
            audio.src = newAudioUrl;
            audio.load();
            startPlayback();
        } else if (audio.paused) {
            startPlayback();
        } else {
            menuMusicUrlRef.current = newAudioUrl;
        }

    }, [screenStack, playerState?.mode, project.uiScreens, assetResolver, settings.musicVolume, fadeAudio]);
    
    useEffect(() => {
        if (!musicAudioRef.current) return;
        const safeVol = Number.isFinite(settings.musicVolume) ? settings.musicVolume : 0.8;
        const activeScreen = screenStack.length > 0 ? project.uiScreens[screenStack[screenStack.length - 1]] : null;
        const screenVol = activeScreen?.music?.volume ?? 1;
        musicAudioRef.current.volume = Math.max(0, Math.min(1, screenVol * safeVol));
    }, [settings.musicVolume, screenStack, project.uiScreens]);

    // Ambient Noise Management
    useEffect(() => {
        // Only manage ambient audio when NOT actively playing the game
        const isInActiveGameplay = playerState?.mode === 'playing' && screenStack.length === 0;
        if (isInActiveGameplay) {
            return;
        }

        const audio = ambientNoiseAudioRef.current;
        const activeScreen = screenStack.length > 0 ? project.uiScreens[screenStack[screenStack.length - 1]] : null;
        
        if (!activeScreen) {
            if (audio && !audio.paused) {
                fadeAudio(audio, 0, 0.5, () => audio.pause());
            }
            menuAmbientUrlRef.current = null;
            return;
        }

        const ambientInfo = activeScreen.ambientNoise;
        if (playerState?.mode === 'paused' && ambientInfo.policy === 'stop') {
            // If paused and policy is 'stop', fade out ambient
            if (audio && !audio.paused) {
                fadeAudio(audio, 0, 0.5, () => audio.pause());
            }
            return;
        }

        const newAudioUrl = ambientInfo?.audioId ? assetResolver(ambientInfo.audioId, 'audio') : null;
        const normalize = (value: string | null): string | null => {
            if (!value) return null;
            try {
                return new URL(value, window.location.href).href;
            } catch (e) {
                return value;
            }
        };

        const currentSrcNormalized = audio?.src ? normalize(audio.src) : null;
        const newSrcNormalized = normalize(newAudioUrl);

        if (!newAudioUrl) {
            if (audio && !audio.paused) {
                fadeAudio(audio, 0, 0.5, () => audio.pause());
            }
            menuAmbientUrlRef.current = null;
            return;
        }

        const startAmbientPlayback = () => {
            if (!audio) return;
            audio.loop = true;
            audio.volume = 0;
            audio.play().then(() => {
                menuAmbientUrlRef.current = newAudioUrl;
                const screenVol = ambientInfo.volume ?? 1;
                fadeAudio(audio, screenVol * settings.ambientVolume, 0.5);
            }).catch(e => {
                console.error('[Ambient] Play failed:', e);
            });
        };

        if (currentSrcNormalized !== newSrcNormalized) {
            if (!audio) return;
            audio.src = newAudioUrl;
            audio.load();
            startAmbientPlayback();
        } else if (audio && audio.paused) {
            startAmbientPlayback();
        } else {
            menuAmbientUrlRef.current = newAudioUrl;
        }

    }, [screenStack, playerState?.mode, project.uiScreens, assetResolver, settings.ambientVolume, fadeAudio]);
    
    useEffect(() => {
        if (!ambientNoiseAudioRef.current) return;
        const safeVol = Number.isFinite(settings.ambientVolume) ? settings.ambientVolume : 0.8;
        const activeScreen = screenStack.length > 0 ? project.uiScreens[screenStack[screenStack.length - 1]] : null;
        const screenVol = activeScreen?.ambientNoise?.volume ?? 1;
        ambientNoiseAudioRef.current.volume = Math.max(0, Math.min(1, screenVol * safeVol));
    }, [settings.ambientVolume, screenStack, project.uiScreens]);

    useEffect(() => {
        if (playerState?.mode !== 'playing' || screenStack.length > 0) {
            return;
        }

        const normalize = (value: string | null): string | null => {
            if (!value) return null;
            try {
                return new URL(value, window.location.href).href;
            } catch (e) {
                return value;
            }
        };

        const musicAudio = musicAudioRef.current;
        if (menuMusicUrlRef.current) {
            const currentSrc = musicAudio?.src ? normalize(musicAudio.src) : null;
            const menuSrc = normalize(menuMusicUrlRef.current);
            if (currentSrc && menuSrc && currentSrc === menuSrc && musicAudio && !musicAudio.paused) {
                fadeAudio(musicAudio, 0, 0.5, () => musicAudio.pause());
            }
            menuMusicUrlRef.current = null;
        }

        const ambientAudio = ambientNoiseAudioRef.current;
        if (menuAmbientUrlRef.current && ambientAudio && !ambientAudio.paused) {
            fadeAudio(ambientAudio, 0, 0.5, () => ambientAudio.pause());
            menuAmbientUrlRef.current = null;
        }
    }, [playerState?.mode, screenStack, fadeAudio]);

    // On first user gesture, mark gesture detection and play queued music if any
    useEffect(() => {
        const handler = () => {
            userGestureDetectedRef.current = true;
            const queued = queuedMusicRef.current;
            if (queued) {
                const audio = musicAudioRef.current;
                audio.src = queued.url;
                audio.loop = queued.loop;
                audio.load();
                audio.play().then(() => {
                    fadeAudio(audio, settings.musicVolume, queued.fadeDuration);
                    queuedMusicRef.current = null;
                }).catch(e => console.error('Queued music play failed:', e));
            }
        };
        window.addEventListener('click', handler, { once: true });
        return () => window.removeEventListener('click', handler);
    }, [fadeAudio, settings.musicVolume]);

    // If autoStartMusic is enabled (standalone mode), mark user gesture as detected immediately
    useEffect(() => {
        if (autoStartMusic) {
            userGestureDetectedRef.current = true;
        }
    }, [autoStartMusic]);

    useEffect(() => {
        if (isJustLoaded && playerState?.mode === 'playing') {
            const { musicState } = playerState;
            // Always play music if there's an audioId (user expects music when loading)
            if (musicState.audioId) {
                const audio = musicAudioRef.current;
                const url = assetResolver(musicState.audioId, 'audio');
                if (url) {
                    audio.src = url;
                    audio.loop = musicState.loop;
                    audio.currentTime = musicState.currentTime;
                    audio.play().then(() => {
                        fadeAudio(audio, settings.musicVolume, 0.5);
                    }).catch(e => console.error("Failed to resume music on load:", e));
                }
            }
            setIsJustLoaded(false);
        }
    }, [isJustLoaded, playerState, assetResolver, fadeAudio, settings.musicVolume]);

    // Reactive music sync: when musicState changes (e.g. from backward skip restoring a
    // snapshot), drive the actual <audio> element to match. Uses a ref to track the last
    // audioId we applied so we don't re-trigger on every render.
    const lastSyncedMusicIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (!playerState || playerState.mode !== 'playing' || isJustLoaded) return;
        const { musicState } = playerState;
        const audio = musicAudioRef.current;
        if (!audio) return;

        const currentAudioId = musicState.audioId || null;
        const previousAudioId = lastSyncedMusicIdRef.current;

        // Only act when the audioId actually changed
        if (currentAudioId === previousAudioId) return;
        lastSyncedMusicIdRef.current = currentAudioId;

        if (!currentAudioId) {
            // Music was cleared — stop playback
            audio.pause();
            audio.currentTime = 0;
            audio.src = '';
            return;
        }

        // Music changed — load and play the new track
        const url = assetResolver(currentAudioId, 'audio');
        if (!url) return;
        audio.src = url;
        audio.loop = musicState.loop;
        audio.currentTime = musicState.currentTime || 0;
        if (musicState.isPlaying) {
            audio.play().then(() => {
                fadeAudio(audio, settings.musicVolume, 0.3);
            }).catch(e => console.error('[Music Sync] Failed to play restored music:', e));
        }
    }, [playerState?.musicState?.audioId, playerState?.mode, isJustLoaded, assetResolver, fadeAudio, settings.musicVolume]);

    const stopAllSfx = useCallback(() => {
        // Stop any WebAudio buffer sources
        try {
            sfxSourceNodesRef.current.forEach(src => {
                try { src.stop(); } catch(e) {}
            });
        } catch (e) {}
        sfxSourceNodesRef.current = [];
        // Clear HTMLAudio fallbacks if any
        sfxPoolRef.current.forEach(a => { try { a.pause(); a.currentTime = 0; a.src = ''; } catch (e) {} });
        sfxPoolRef.current = [];
        // Optionally clear buffer cache to free memory
        sfxBufferCacheRef.current.clear();
    }, []);

    const playSound = useCallback((soundId: VNID | null, volume?: number) => {
        runtimeDebugLog('[SFX] playSound called with soundId:', soundId, 'volume:', volume);
        if (!soundId) return;
        
        try {
            const url = assetResolver(soundId, 'audio');
            runtimeDebugLog('[SFX] assetResolver returned URL:', url, 'for soundId:', soundId);
            if (!url) {
                runtimeDebugWarn(`[SFX] No audio URL found for soundId: ${soundId}`);
                return;
            }

            // Use HTMLAudio for SFX - more reliable in packaged environments
            runtimeDebugLog('[SFX] Creating HTMLAudio element for playback');
            const audio = new Audio(url);
            audio.volume = (typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 1.0) * (Number.isFinite(settings.sfxVolume) ? settings.sfxVolume : 0.8);
            
            // Limit simultaneous SFX
            if (sfxPoolRef.current.length >= MAX_SIMULTANEOUS_SFX) {
                const oldest = sfxPoolRef.current.shift();
                try { 
                    oldest?.pause(); 
                    oldest!.currentTime = 0; 
                } catch (e) {}
            }
            
            sfxPoolRef.current.push(audio);
            runtimeDebugLog('[SFX] Playing audio, volume:', audio.volume);
            
            audio.play()
                .then(() => {
                    runtimeDebugLog('[SFX] Audio playback started successfully');
                })
                .catch(e => {
                    console.error('[SFX] Audio playback failed:', e);
                });
            
            // Remove from pool when ended
            audio.addEventListener('ended', () => {
                runtimeDebugLog('[SFX] Audio playback ended');
                sfxPoolRef.current = sfxPoolRef.current.filter(a => a !== audio);
            }, { once: true });
                
        } catch (outerError) {
            console.error('[SFX] Critical error in playSound:', outerError);
            console.error('[SFX] Error stack:', outerError instanceof Error ? outerError.stack : 'N/A');
        }
    }, [assetResolver, settings.sfxVolume]);

    // Keep master gain in sync with settings
    useEffect(() => {
        if (sfxMasterGainRef.current) {
            try { sfxMasterGainRef.current.gain.setTargetAtTime(settings.sfxVolume, (audioCtxRef.current?.currentTime) || 0, 0.01); } catch(e) {}
        }
    }, [settings.sfxVolume]);

    // --- Game Loop ---
    useEffect(() => {
        const scheduler = commandSchedulerRef.current;
        const diagnostics = runtimeDiagnosticsRef.current;

        if (!playerState || playerState.mode !== 'playing') {
            scheduler.reset();
            variableStoreRef.current = null;
            return;
        }

        if (playerState.uiState.isWaitingForInput || playerState.uiState.isTransitioning || playerState.uiState.choices) {
            return;
        }

        // Pause command execution while any HUD screen is shown
        if (hudStack.length > 0) {
            return;
        }

    // Merge any dirty UI variables into the base variables BEFORE creating the runtime snapshot
    // This ensures conditions are evaluated with the most up-to-date variable values
    const baseVariables = mergeDirtyUiVariables(playerState.variables);
    const variableStore = new RuntimeVariableStore({ globals: { ...baseVariables } });
    variableStoreRef.current = variableStore;
    const getRuntimeVariables = () => variableStore.snapshot().globals as Record<VNID, string | number | boolean>;

        const command = playerState.currentCommands[playerState.currentIndex];
        if (!command) { 
            if (playerState.commandStack.length > 0) {
                const popped = playerState.commandStack[playerState.commandStack.length - 1];
                updatePlayerState(p => {
                    if (!p) return null;
                    const newStack = p.commandStack.slice(0, -1);
                    return { ...p, currentSceneId: popped.sceneId, currentCommands: popped.commands, currentIndex: popped.index, commandStack: newStack };
                });
            } else {
                runtimeDebugLog('End of scene - trying to advance to next scene');
                // Try to find the next scene in the list
                const sceneIds = Object.keys(project.scenes);
                const currentSceneIndex = sceneIds.indexOf(playerState.currentSceneId);
                
                if (currentSceneIndex !== -1 && currentSceneIndex < sceneIds.length - 1) {
                    // There are more scenes after this one
                    const nextSceneId = navigateToScene(sceneIds[currentSceneIndex + 1], playerState.variables);
                    const nextScene = project.scenes[nextSceneId];
                    
                    if (nextScene) {
                        runtimeDebugLog(`Advancing to next scene: ${nextSceneId}`);
                        
                        startSceneExitTransition(playerState.currentSceneId, () => {
                            updatePlayerState(p => p ? {
                                ...p,
                                currentSceneId: nextSceneId,
                                currentCommands: nextScene.commands,
                                currentIndex: 0,
                                stageState: {
                                    backgroundUrl: null,
                                    characters: {},
                                    textOverlays: [],
                                    imageOverlays: [],
                                    buttonOverlays: [],
                                    imageMapOverlays: [],
                                    movieOverlays: [],
                                    screen: {
                                        shake: { active: false, intensity: 0 },
                                        tint: 'transparent',
                                        zoom: 1,
                                        panX: 0,
                                        panY: 0,
                                        transitionDuration: 0.5,
                                        overlayEffects: []
                                    },
                                    particleEffects: {}
                                },
                                uiState: {
                                    dialogue: null,
                                    choices: null,
                                    textInput: null,
                                    movieUrl: null,
                                    movieLoop: false,
                                    isWaitingForInput: false,
                                    isTransitioning: false,
                                    transitionElement: null,
                                    flash: null,
                                    showHistory: false,
                                    screenSceneId: null
                                }
                            } : null);
                        });
                    } else {
                        // No valid next scene found, return to title
                        runtimeDebugLog('No valid next scene - returning to title');
                        
                        // Stop game music and SFX immediately
                        const audio = musicAudioRef.current;
                        if (audio) {
                            audio.pause();
                            audio.currentTime = 0;
                            audio.src = '';
                        }
                        stopAllSfx();
                        
                        // Clear player state and return to title screen
                        updatePlayerState(null);
                        if (project.ui.titleScreenId) {
                            setScreenStack([project.ui.titleScreenId]);
                        }
                    }
                } else {
                    // This is the last scene or scene not found in list
                    runtimeDebugLog('Last scene completed - returning to title');
                    
                    // Stop game music and SFX immediately
                    const audio = musicAudioRef.current;
                    if (audio) {
                        audio.pause();
                        audio.currentTime = 0;
                        audio.src = '';
                    }
                    stopAllSfx();
                    
                    // Clear player state and return to title screen
                    updatePlayerState(null);
                    if (project.ui.titleScreenId) {
                        setScreenStack([project.ui.titleScreenId]);
                    }
                }
            }
            scheduler.reset();
            return; 
        }

        const commandSignature = {
            sceneId: playerState.currentSceneId,
            index: playerState.currentIndex,
            commandId: command.id,
        };
        if (!scheduler.shouldProcess(commandSignature)) {
            return;
        }
        scheduler.markProcessed(commandSignature);
        diagnostics.emit('command-start', {
            sceneId: commandSignature.sceneId,
            commandId: commandSignature.commandId,
            index: commandSignature.index,
        });

        // Special handling for BranchStart - check conditions and skip branch if not met
        if (command.type === CommandType.BranchStart) {
            const branchCmd = command as BranchStartCommand;
            const conditionsMet = evaluateConditions(branchCmd.conditions, getRuntimeVariables());
            
            if (!conditionsMet) {
                // Skip to matching BranchEnd
                const branchEndIndex = playerState.currentCommands.findIndex((cmd, idx) =>
                    idx > playerState.currentIndex &&
                    cmd.type === CommandType.BranchEnd &&
                    (cmd as BranchEndCommand).branchId === branchCmd.branchId
                );
                
                if (branchEndIndex !== -1) {
                    // Jump to just after the BranchEnd
                    updatePlayerState(p => p ? { ...p, currentIndex: branchEndIndex + 1 } : null);
                } else {
                    // No matching BranchEnd found, just advance
                    updatePlayerState(p => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
                }
                return;
            }
            // If conditions met, continue to execute BranchStart normally (which does nothing)
            updatePlayerState(p => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
            return;
        }

        // Check conditions for all other commands
    const conditionsMet = evaluateConditions(command.conditions, getRuntimeVariables());
    runtimeDebugLog('[DEBUG] Command:', command.type, 'Index:', playerState.currentIndex, 'Conditions met:', conditionsMet, 'Variables:', getRuntimeVariables());
        if (!conditionsMet) {
            runtimeDebugLog('[DEBUG] Skipping command due to failed conditions');
            updatePlayerState(p => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
            return;
        }

        const advance = () => {
            runtimeDebugLog('[DEBUG advance()] Called from command:', command.type, 'Current index:', playerState.currentIndex);
            // Guard: Don't advance if we've already moved past this command
            if (scheduler.alreadyAdvancedPast(playerState.currentIndex)) {
                const last = scheduler.getLastProcessed();
                if (last) {
                    runtimeDebugLog('[DEBUG advance()] Skipping - already advanced to', last.index);
                }
                return;
            }
            const nextIndex = playerState.currentIndex + 1;
            if (nextIndex >= playerState.currentCommands.length) {
                if (playerState.commandStack.length > 0) {
                    const popped = playerState.commandStack[playerState.commandStack.length - 1];
                    updatePlayerState(p => {
                        if (!p) return null;
                        const newStack = p.commandStack.slice(0, -1);
                        return { ...p, currentSceneId: popped.sceneId, currentCommands: popped.commands, currentIndex: popped.index, commandStack: newStack };
                    });
                } else {
                    // Scene ended, try to advance to next scene
                    const sceneIds = Object.keys(project.scenes);
                    const currentSceneIndex = sceneIds.indexOf(playerState.currentSceneId);
                    
                    if (currentSceneIndex !== -1 && currentSceneIndex < sceneIds.length - 1) {
                        const nextSceneId = navigateToScene(sceneIds[currentSceneIndex + 1], getRuntimeVariables());
                        const nextScene = project.scenes[nextSceneId];
                        
                        if (nextScene) {
                            startSceneExitTransition(playerState.currentSceneId, () => {
                                updatePlayerState(p => p ? {
                                    ...p,
                                    currentSceneId: nextSceneId,
                                    currentCommands: nextScene.commands,
                                    currentIndex: 0,
                                    stageState: {
                                        backgroundUrl: null,
                                        characters: {},
                                        textOverlays: [],
                                        imageOverlays: [],
                                        buttonOverlays: [],
                                        imageMapOverlays: [],
                                        movieOverlays: [],
                                        screen: {
                                            shake: { active: false, intensity: 0 },
                                            tint: 'transparent',
                                            zoom: 1,
                                            panX: 0,
                                            panY: 0,
                                            transitionDuration: 0.5,
                                            overlayEffects: []
                                        },
                                        particleEffects: {}
                                    },
                                    uiState: {
                                        dialogue: null,
                                        choices: null,
                                        textInput: null,
                                        movieUrl: null,
                                        movieLoop: false,
                                        isWaitingForInput: false,
                                        isTransitioning: false,
                                        transitionElement: null,
                                        flash: null,
                                        showHistory: false,
                                        screenSceneId: null
                                    }
                                } : null);
                            });
                            return;
                        }
                    }
                    
                    // No more scenes, return to title
                    // Stop game music and SFX immediately
                    const audio = musicAudioRef.current;
                    if (audio) {
                        audio.pause();
                        audio.currentTime = 0;
                        audio.src = '';
                    }
                    stopAllSfx();
                    
                    // Clear player state and return to title screen
                    updatePlayerState(null);
                    if (project.ui.titleScreenId) {
                        setScreenStack([project.ui.titleScreenId]);
                    }
                    scheduler.reset();
                }
            } else {
                updatePlayerState(p => p ? { ...p, currentIndex: nextIndex } : null);
            }
        };

        // Check if this command should run asynchronously (in parallel with subsequent commands)
        const shouldRunAsync = command.modifiers?.runAsync === true;
        
        // Build CommandContext for handlers
        const commandContext: CommandContext = {
            project,
            playerState,
            assetResolver,
            getAssetMetadata,
            musicAudioRef,
            fadeAudio,
            playSound,
            stopAllSfx,
            settings,
            advance,
            setPlayerState: updatePlayerState,
            activeEffectTimeoutsRef,
            evaluateConditions,
        };
        
        let instantAdvance = true;
        (async () => {
            try {
            // Helper function to apply command result
            const applyResult = (result: CommandResult) => {
                const variableStore = variableStoreRef.current;
                const previousSceneId = playerState?.currentSceneId;
                if (result.updates?.variables && variableStore) {
                    const writes = Object.entries(result.updates.variables).map(([variableId, value]) => ({
                        variableId,
                        value,
                        scope: 'global' as const,
                        sourceCommandId: command.id,
                    }));
                    variableStore.applyWrites(writes);
                }
                if (result.updates) {
                    const isSceneChange = result.updates?.currentSceneId !== undefined && result.updates.currentSceneId !== previousSceneId;
                    updatePlayerState(p => {
                        if (!p) return null;
                        let mergedVariables = result.updates?.variables && variableStore ? variableStore.snapshot().globals : { ...p.variables, ...(result.updates?.variables ?? {}) };
                        // Reset local-scope variables to defaults on scene change
                        if (isSceneChange) {
                            const localDefaults = getLocalVariableDefaults(project.variables);
                            mergedVariables = { ...mergedVariables, ...localDefaults };
                            runtimeDebugLog('[Variable Scope] Reset local variables on scene change:', Object.keys(localDefaults));
                        }
                        return {
                            ...p,
                            ...(result.updates?.currentSceneId !== undefined ? { currentSceneId: result.updates.currentSceneId } : {}),
                            ...(result.updates?.currentCommands !== undefined ? { currentCommands: result.updates.currentCommands } : {}),
                            ...(result.updates?.currentIndex !== undefined ? { currentIndex: result.updates.currentIndex } : {}),
                            ...(result.updates?.commandStack !== undefined ? { commandStack: result.updates.commandStack } : {}),
                            ...(result.updates?.variables !== undefined || isSceneChange ? { variables: mergedVariables } : {}),
                            ...(result.updates?.stageState !== undefined ? { stageState: { ...p.stageState, ...result.updates.stageState } } : {}),
                            ...(result.updates?.musicState !== undefined ? { musicState: { ...p.musicState, ...result.updates.musicState } } : {}),
                            ...(result.updates?.uiState !== undefined ? { uiState: { ...p.uiState, ...result.updates.uiState } } : {}),
                        };
                    });
                    
                    // If scene changed, clear UI screens (scene cleanup)
                    if (result.updates?.currentSceneId !== undefined && result.updates.currentSceneId !== previousSceneId) {
                        runtimeDebugLog('[Scene Cleanup] Scene changed from', previousSceneId, 'to', result.updates.currentSceneId, '- clearing UI stacks');
                        setScreenStack([]);
                        setHudStack([]);
                        
                        // Clear all active effect timeouts
                        activeEffectTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
                        activeEffectTimeoutsRef.current = [];
                        
                        // Clear active visual effects
                        activeFlashRef.current = null;
                        setFlashTrigger(0);
                        activeShakeRef.current = null;
                        scheduler.reset();
                        variableStoreRef.current = null;
                    }
                }
                instantAdvance = result.advance;
                
                // Handle delay and callback
                if (result.delay && result.callback) {
                    const timeoutId = window.setTimeout(result.callback, result.delay);
                    activeEffectTimeoutsRef.current.push(timeoutId);
                } else if (result.callback) {
                    result.callback();
                }
                diagnostics.emit('command-finish', {
                    commandId: command.id,
                    sceneId: playerState.currentSceneId,
                    index: playerState.currentIndex,
                    advance: result.advance,
                });
            };
            
            // --- Auto-replay saved inputs from backward skip ---
            // When the player goes backward and then advances forward again, previously-
            // entered choices and text inputs are replayed automatically instead of
            // re-prompting the player.
            const savedInputKey = `${playerState.currentSceneId}:${playerState.currentIndex}`;
            const savedInput = playerState.savedInputs[savedInputKey];

            if (savedInput && command.type === CommandType.Choice && savedInput.type === 'choice') {
                runtimeDebugLog('[BACKWARD REPLAY] Auto-replaying saved choice:', savedInput.choice.text);
                handleChoiceSelect(savedInput.choice);
                return;
            }

            if (savedInput && command.type === CommandType.TextInput && savedInput.type === 'textInput') {
                runtimeDebugLog('[BACKWARD REPLAY] Auto-replaying saved text input:', savedInput.value);
                const cmd = command as TextInputCommand;
                updatePlayerState(p => {
                    if (!p) return p;
                    const historyEntry: HistoryEntry = {
                        timestamp: Date.now(),
                        type: 'textInput',
                        text: `Input: ${savedInput.value}`,
                        inputValue: savedInput.value,
                        variableId: cmd.variableId,
                        sceneId: p.currentSceneId,
                        commandIndex: p.currentIndex,
                        stageSnapshot: JSON.parse(JSON.stringify(p.stageState)),
                        variablesSnapshot: { ...p.variables },
                        musicSnapshot: { ...p.musicState },
                    };
                    const newHistory = [...p.history, historyEntry];
                    if (newHistory.length > 200) newHistory.splice(0, newHistory.length - 200);
                    return {
                        ...p,
                        currentIndex: p.currentIndex + 1,
                        variables: { ...p.variables, [cmd.variableId]: savedInput.value },
                        history: newHistory,
                        uiState: { ...p.uiState, isWaitingForInput: false, textInput: null }
                    };
                });
                return;
            }

            switch (command.type) {
                case CommandType.Group: {
                    const result = handleGroup();
                    applyResult(result);
                    break;
                }
                case CommandType.BranchStart: {
                    const result = handleBranchStart();
                    applyResult(result);
                    break;
                }
                case CommandType.BranchEnd: {
                    const result = handleBranchEnd();
                    applyResult(result);
                    break;
                }
                case CommandType.Dialogue: {
                    const result = handleDialogue(command as DialogueCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.SetBackground: {
                    const result = await handleSetBackground(command as SetBackgroundCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.ShowCharacter: {
                    const result = handleShowCharacter(command as ShowCharacterCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.HideCharacter: {
                    const result = handleHideCharacter(command as HideCharacterCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.Choice: {
                    const result = handleChoice(command as ChoiceCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.SetVariable: {
                    const result = handleSetVariable(command as SetVariableCommand, commandContext);
                    applyResult(result);
                    // Auto-save persistent-scope variables to storage
                    const setVarCmd = command as SetVariableCommand;
                    const varDef = project.variables[setVarCmd.variableId];
                    if (varDef && (varDef as any).scope === 'persistent' && result.updates?.variables) {
                        const persistentSnapshot: Record<string, string | number | boolean> = {};
                        Object.values(project.variables).forEach((v: any) => {
                            if ((v.scope || 'global') === 'persistent' && result.updates!.variables![v.id] !== undefined) {
                                persistentSnapshot[v.id] = result.updates!.variables![v.id];
                            }
                        });
                        savePersistentVariables(project.id, { ...loadPersistentVariables(project.id), ...persistentSnapshot });
                        runtimeDebugLog('[Variable Scope] Saved persistent variable:', varDef.name);
                    }
                    break;
                }
                case CommandType.TextInput: {
                    const result = handleTextInput(command as TextInputCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.Jump: {
                    // Stop skip-forward on scene change
                    if (playerState.uiState.isSkipping) {
                        updatePlayerState(p => p ? { ...p, uiState: { ...p.uiState, isSkipping: false } } : null);
                    }
                    startSceneExitTransition(playerState.currentSceneId, () => {
                        const result = handleJump(command as JumpCommand, commandContext);
                        applyResult(result);
                    });
                    break;
                }
                case CommandType.PlayMusic: {
                    const result = handlePlayMusic(command as PlayMusicCommand, commandContext);
                    applyResult(result);
                    break;
                }
                 case CommandType.StopMusic: {
                    const result = handleStopMusic(command as StopMusicCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.PlaySoundEffect: {
                    const result = handlePlaySoundEffect(command as PlaySoundEffectCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.StopSoundEffect: {
                    const result = handleStopSoundEffect(commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.PlayMovie: {
                    const movieCmd = command as PlayMovieCommand;
                    const movieUrl = assetResolver(movieCmd.videoId, 'video');
                    const isOverlay = movieCmd.displayMode === 'overlay';
                    const shouldLoop = movieCmd.loop ?? false;

                    if (isOverlay) {
                        // Overlay mode: add to stageState.movieOverlays (behind characters, above background)
                        updatePlayerState(p => {
                            if (!p) return null;
                            const existing = p.stageState.movieOverlays || [];
                            return {
                                ...p,
                                stageState: {
                                    ...p.stageState,
                                    movieOverlays: [...existing, {
                                        url: movieUrl || '',
                                        loop: shouldLoop,
                                        x: movieCmd.x,
                                        y: movieCmd.y,
                                        width: movieCmd.width,
                                        height: movieCmd.height,
                                        opacity: movieCmd.opacity,
                                        objectFit: movieCmd.objectFit,
                                    }],
                                },
                            };
                        });
                        // Overlay movies never block — always advance immediately
                    } else {
                        // Fullscreen mode: show over black background
                        if (movieCmd.waitsForCompletion) {
                            instantAdvance = false;
                            updatePlayerState(p => p ? {
                                ...p,
                                uiState: { ...p.uiState, isWaitingForInput: true, movieUrl, movieLoop: shouldLoop },
                            } : null);
                        } else {
                            updatePlayerState(p => p ? {
                                ...p,
                                uiState: { ...p.uiState, movieUrl, movieLoop: shouldLoop },
                            } : null);
                        }
                    }
                    break;
                }
                case CommandType.StopMovie: {
                    // Clear all overlay movies
                    updatePlayerState(p => {
                        if (!p) return null;
                        return {
                            ...p,
                            stageState: {
                                ...p.stageState,
                                movieOverlays: [],
                            },
                            uiState: {
                                ...p.uiState,
                                movieUrl: null,
                                movieLoop: false,
                            },
                        };
                    });
                    break;
                }
                case CommandType.Wait: {
                    instantAdvance = false;
                    const cmd = command as any;
                    const durationMs = ((cmd.duration ?? 1) * 1000);

                    // If waitIndefinitelyForInput is enabled, wait only for user input (ignore duration)
                    if (cmd.waitIndefinitelyForInput) {
                        let hasAdvanced = false;

                        const onUserAdvance = () => {
                            if (hasAdvanced) return;
                            hasAdvanced = true;
                            advance();
                            removeListeners();
                        };

                        const keyHandler = (e: KeyboardEvent) => {
                            if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                onUserAdvance();
                            }
                        };
                        const clickHandler = (e: MouseEvent) => {
                            // Only respond to clicks within the game stage area
                            if (stageRef.current && stageRef.current.contains(e.target as Node)) {
                                onUserAdvance();
                            }
                        };

                        const removeListeners = () => {
                            window.removeEventListener('keydown', keyHandler, true);
                            window.removeEventListener('click', clickHandler, true);
                        };

                        // Use capture phase to get events before other handlers
                        window.addEventListener('keydown', keyHandler, true);
                        window.addEventListener('click', clickHandler, true);
                    } else if (cmd.waitForInput) {
                        // If waitForInput is enabled, allow user input (click or key) to advance early, but still respect duration
                        let hasAdvanced = false;
                        let timeoutId: number | null = window.setTimeout(() => {
                            // timeout elapsed, advance
                            if (!hasAdvanced) {
                                hasAdvanced = true;
                                advance();
                            }
                            removeListeners();
                        }, durationMs);

                        const onUserAdvance = () => {
                            if (hasAdvanced) return; // Prevent double-advance
                            hasAdvanced = true;

                            if (timeoutId) {
                                clearTimeout(timeoutId);
                                timeoutId = null;
                            }
                            advance();
                            removeListeners();
                        };

                        const keyHandler = (e: KeyboardEvent) => {
                            if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                onUserAdvance();
                            }
                        };
                        const clickHandler = (e: MouseEvent) => {
                            // Only respond to clicks within the game stage area
                            if (stageRef.current && stageRef.current.contains(e.target as Node)) {
                                onUserAdvance();
                            }
                        };

                        const removeListeners = () => {
                            window.removeEventListener('keydown', keyHandler, true);
                            window.removeEventListener('click', clickHandler, true);
                        };

                        // Use capture phase to get events before other handlers
                        window.addEventListener('keydown', keyHandler, true);
                        window.addEventListener('click', clickHandler, true);
                    } else {
                        // No user input allowed, just wait for duration
                        setTimeout(() => advance(), durationMs);
                    }
                    break;
                }
                case CommandType.ShakeScreen: {
                    const cmd = command as ShakeScreenCommand;
                    
                    // Set shake in ref and force a render so the CSS class is applied
                    activeShakeRef.current = { intensity: cmd.intensity, duration: cmd.duration };
                    setShakeTrigger(prev => prev + 1);
                    
                    // Duration 0 = persistent (shake runs until manually cleared / scene change)
                    if (cmd.duration > 0) {
                        const timeoutId = window.setTimeout(() => {
                            activeShakeRef.current = null;
                            setShakeTrigger(prev => prev + 1); // Force re-render to remove CSS class
                            activeEffectTimeoutsRef.current = activeEffectTimeoutsRef.current.filter(id => id !== timeoutId);
                        }, cmd.duration * 1000);
                        activeEffectTimeoutsRef.current.push(timeoutId);
                    }
                    
                    // Let the normal advance() function handle index progression
                    break;
                }
                case CommandType.TintScreen: {
                    const cmd = command as TintScreenCommand;
                    updatePlayerState(p => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, tint: cmd.color, transitionDuration: cmd.duration }}} : null);
                    break;
                }
                case CommandType.PanZoomScreen: {
                     const cmd = command as PanZoomScreenCommand;
                    updatePlayerState(p => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, zoom: cmd.zoom, panX: cmd.panX, panY: cmd.panY, transitionDuration: cmd.duration }}} : null);
                    break;
                }
                case CommandType.ResetScreenEffects: {
                    const cmd = command as ResetScreenEffectsCommand;
                    updatePlayerState(p => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, tint: 'transparent', zoom: 1, panX: 0, panY: 0, transitionDuration: cmd.duration, overlayEffects: [] }}} : null);
                    break;
                }
                case CommandType.FlashScreen: {
                    const cmd = command as FlashScreenCommand;
                    
                    // Set flash in ref with unique key and trigger re-render
                    activeFlashRef.current = { color: cmd.color, duration: cmd.duration, key: Date.now() };
                    setFlashTrigger(prev => prev + 1);
                    
                    // Let the normal advance() function handle index progression
                    break;
                }
                case CommandType.SetScreenOverlayEffect: {
                    const cmd = command as SetScreenOverlayEffectCommand;
                    updatePlayerState(p => p ? {
                        ...p,
                        stageState: {
                            ...p.stageState,
                            screen: {
                                ...p.stageState.screen,
                                overlayEffects: upsertOverlayEffect(p.stageState.screen.overlayEffects, {
                                    type: cmd.effectType,
                                    intensity: cmd.intensity,
                                    variant: cmd.variant,
                                    color: (cmd as any).color,
                                }),
                            }
                        }
                    } : null);
                    
                    // Auto-remove overlay effect after duration (duration 0 = persistent)
                    const effectDuration = cmd.duration ?? 0;
                    if (effectDuration > 0) {
                        const effectType = cmd.effectType;
                        const overlayTimeoutId = window.setTimeout(() => {
                            updatePlayerState(p => p ? {
                                ...p,
                                stageState: {
                                    ...p.stageState,
                                    screen: {
                                        ...p.stageState.screen,
                                        overlayEffects: upsertOverlayEffect(p.stageState.screen.overlayEffects, {
                                            type: effectType,
                                            intensity: 0,
                                        }),
                                    }
                                }
                            } : null);
                            activeEffectTimeoutsRef.current = activeEffectTimeoutsRef.current.filter(id => id !== overlayTimeoutId);
                        }, effectDuration * 1000);
                        activeEffectTimeoutsRef.current.push(overlayTimeoutId);
                    }
                    break;
                }
                case CommandType.ShowScreen: {
                    instantAdvance = false; // Pause execution when showing a screen/menu
                    const cmd = command as any;
                    // Store the current scene ID so UI actions can reference it later
                    updatePlayerState(p => p ? {
                        ...p,
                        uiState: {
                            ...p.uiState,
                            screenSceneId: p.currentSceneId
                        }
                    } : null);
                    // If we're in-playing, treat this as a HUD/in-game overlay
                    if (playerState && playerState.mode === 'playing') {
                        setHudStack(s => [...s, cmd.screenId]);
                    } else {
                        // Otherwise push onto the normal screen stack (menus/title/pause)
                        setScreenStack(s => [...s, cmd.screenId]);
                    }
                    break;
                }
                case CommandType.ShowText: {
                    const result = handleShowText(command as ShowTextCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.ShowImage: {
                    const result = handleShowImage(command as ShowImageCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.Label: {
                    const result = handleLabel(command as LabelCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.JumpToLabel: {
                    const result = handleJumpToLabel(command as JumpToLabelCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.HideText: {
                    const result = handleHideText(command as HideTextCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.HideImage: {
                    const result = handleHideImage(command as HideImageCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.ShowButton: {
                    const result = handleShowButton(command as ShowButtonCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.HideButton: {
                    const result = handleHideButton(command as HideButtonCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.ShowImageMap: {
                    const result = handleShowImageMap(command as ShowImageMapCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.HideImageMap: {
                    const result = handleHideImageMap(command as HideImageMapCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.CreditRoll: {
                    const cmd = command as CreditRollCommand;
                    setActiveCreditRoll(cmd);
                    const result = handleCreditRoll(cmd, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.RunScript: {
                    const result = handleRunScript(command as RunScriptCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.SpawnParticles: {
                    const result = handleSpawnParticles(command as SpawnParticlesCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.StopParticles: {
                    const result = handleStopParticles(command as StopParticlesCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.CallCommonEvent: {
                    const result = handleCallCommonEvent(command as CallCommonEventCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.TweenElement: {
                    const result = handleTweenElement(command as TweenElementCommand, commandContext);
                    applyResult(result);
                    break;
                }
            }
            
            // Handle command advancement based on async modifier
            runtimeDebugLog('[DEBUG] Command execution complete:', command.type, '| shouldRunAsync:', shouldRunAsync, '| instantAdvance:', instantAdvance);
            if (shouldRunAsync) {
                // Run async: advance immediately, let command complete in background
                runtimeDebugLog('[DEBUG] Running async - advancing immediately');
                advance();
            } else if (instantAdvance) {
                // Normal: advance only if command was instant
                runtimeDebugLog('[DEBUG] Instant advance - advancing now');
                advance();
            } else {
                runtimeDebugLog('[DEBUG] Waiting for command to handle advancement (callback/user input)');
            }
            // If !shouldRunAsync && !instantAdvance, command will handle advancement itself (e.g., setTimeout)
            } catch (error) {
                console.error('[CRITICAL ERROR] Command execution failed:', {
                    commandType: command.type,
                    commandId: command.id,
                    index: playerState.currentIndex,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                });
                // Try to advance past the broken command
                advance();
            }
        })();
    }, [playerState, project, assetResolver, playSound, evaluateConditions, fadeAudio, settings.musicVolume, startNewGame, stopAndResetMusic, stopAllSfx, hudStack]);

    // --- Input & Action Handlers ---
    const handleDialogueAdvance = () => {
        updatePlayerState(p => {
            if (!p || !p.uiState.dialogue) return p;
            
            // Check if the current dialogue has keepOpenDuringChoices flag
            // and the next command is a Choice command
            const scene = project.scenes[p.currentSceneId];
            const currentCmd = scene?.commands[p.currentIndex];
            const nextCmd = scene?.commands[p.currentIndex + 1];
            const shouldKeepDialogueDuringChoices = (currentCmd as DialogueCommand)?.keepOpenDuringChoices 
                && (nextCmd?.type === CommandType.Choice);
            
            // If flag is set and next is a choice, don't clear dialogue yet
            if (shouldKeepDialogueDuringChoices) {
                return {
                    ...p,
                    currentIndex: p.currentIndex + 1,
                    uiState: { ...p.uiState, isWaitingForInput: false, isSkipping: false }
                    // Keep dialogue open!
                };
            }
            
            // Add dialogue to history with full state snapshot for skip-backward
            const historyEntry: HistoryEntry = {
                timestamp: Date.now(),
                type: 'dialogue',
                characterName: p.uiState.dialogue.characterName,
                characterColor: p.uiState.dialogue.characterColor,
                text: p.uiState.dialogue.text,
                sceneId: p.currentSceneId,
                commandIndex: p.currentIndex,
                // Full state snapshots for backward navigation
                stageSnapshot: JSON.parse(JSON.stringify(p.stageState)),
                variablesSnapshot: { ...p.variables },
                musicSnapshot: { ...p.musicState },
            };
            
            // Cap history at 200 entries to prevent unbounded memory growth
            const newHistory = [...p.history, historyEntry];
            if (newHistory.length > 200) newHistory.splice(0, newHistory.length - 200);
            
            return {
                ...p,
                currentIndex: p.currentIndex + 1,
                history: newHistory,
                uiState: { ...p.uiState, isWaitingForInput: false, dialogue: null, isSkipping: false }
            };
        });
    };
    const handleChoiceSelect = (choice: ChoiceOption) => {
        runtimeDebugLog('[CHOICE] Selected:', choice.text, 'Actions:', choice.actions?.length || 0);
        updatePlayerState(p => {
            if (!p) return null;
            let newState = { ...p };
            
            // Add choice to history with full state snapshot (BEFORE actions modify state)
            const historyEntry: HistoryEntry = {
                timestamp: Date.now(),
                type: 'choice',
                text: `Choice: ${choice.text}`,
                choiceText: choice.text,
                choiceOption: choice,
                sceneId: p.currentSceneId,
                commandIndex: p.currentIndex,
                // Full state snapshots for backward navigation
                stageSnapshot: JSON.parse(JSON.stringify(p.stageState)),
                variablesSnapshot: { ...p.variables },
                musicSnapshot: { ...p.musicState },
            };
            newState.history = [...newState.history, historyEntry];
            if (newState.history.length > 200) newState.history.splice(0, newState.history.length - 200);
            
            // Save this choice for skip-backward replay
            const inputKey = `${p.currentSceneId}:${p.currentIndex}`;
            newState.savedInputs = { ...newState.savedInputs, [inputKey]: { type: 'choice', choice } };
            
            // Clear dialogue and choices after selection
            newState.uiState = { ...newState.uiState, dialogue: null, choices: null };
            
            const actions = choice.actions || [];
            if (!choice.actions && choice.targetSceneId) {
                // FIX: 'targetSceneId' should be 'targetScreenId', but the type is wrong. The correct fix is in types/shared.ts
                actions.push({ type: UIActionType.JumpToScene, targetSceneId: (choice as any).targetSceneId });
            }

            for (const action of actions) {
                runtimeDebugLog('[CHOICE] Processing action:', action.type, action);
                if (action.type === UIActionType.SetVariable) {
                    const setVarAction = action as SetVariableAction;
                    const variable = project.variables[setVarAction.variableId];
                    if (!variable) {
                        runtimeDebugWarn(`SetVariable action failed: Variable with ID ${setVarAction.variableId} not found.`);
                        continue; // Skip this action
                    }

                    const originalOperator = setVarAction.operator;
                    const effectiveOperator = normalizeOperator(variable.type, variable.name, originalOperator);
                    const wasCoercedOperator = originalOperator !== effectiveOperator;
                    const currentVal = newState.variables[setVarAction.variableId];
                    
                    // Use consolidated calculateVariableValue for all value computations
                    const newVal = calculateVariableValue(
                        effectiveOperator,
                        variable.type,
                        currentVal,
                        setVarAction.value,
                        setVarAction.randomMin,
                        setVarAction.randomMax,
                        wasCoercedOperator ? originalOperator : undefined
                    );

                    newState.variables = { ...newState.variables, [setVarAction.variableId]: newVal };
                    runtimeDebugLog(
                        '[CHOICE] Set variable result:',
                        setVarAction.variableId,
                        '=>',
                        newVal,
                        '(type:',
                        typeof newVal,
                        '| operator:',
                        `${setVarAction.operator} => ${effectiveOperator}`,
                        ')'
                    );
                    // Auto-save persistent-scope variables
                    if ((variable as any).scope === 'persistent') {
                        const prevPersistent = loadPersistentVariables(project.id);
                        savePersistentVariables(project.id, { ...prevPersistent, [setVarAction.variableId]: newVal });
                        runtimeDebugLog('[Variable Scope] Saved persistent variable from choice:', variable.name);
                    }
                }
            }
            runtimeDebugLog('[CHOICE] Variables after actions:', JSON.stringify(newState.variables, null, 2));
            
            newState.uiState = { ...newState.uiState, choices: null };
    
            // Handle jump actions (JumpToScene or JumpToLabel) last
            const jumpAction = actions.find(a => a.type === UIActionType.JumpToScene) as JumpToSceneAction | undefined;
            const labelAction = actions.find(a => a.type === UIActionType.JumpToLabel) as JumpToLabelAction | undefined;

            // Handle OpenURL actions (fire-and-forget, runs alongside other actions)
            const openUrlActions = actions.filter(a => a.type === UIActionType.OpenURL) as OpenURLAction[];
            openUrlActions.forEach(urlAction => {
                if (urlAction.url) {
                    if (urlAction.newTab !== false) {
                        window.open(urlAction.url, '_blank', 'noopener,noreferrer');
                    } else {
                        window.location.href = urlAction.url;
                    }
                }
            });

            if (labelAction) {
                // JumpToLabel - go to a specific label within the current scene
                const targetLabel = labelAction.targetLabel;
                const targetSceneId = newState.currentSceneId;
                const targetScene = project.scenes[targetSceneId];
                
                if (targetScene) {
                    const labelIndex = targetScene.commands.findIndex((cmd) => 
                        cmd.type === CommandType.Label && (cmd as LabelCommand).labelId === targetLabel
                    );
                    
                    if (labelIndex !== -1) {
                        runtimeDebugLog(`[CHOICE] JumpToLabel: Jumping to label "${targetLabel}" at index ${labelIndex}`);
                        newState.currentSceneId = targetSceneId;
                        newState.currentCommands = targetScene.commands;
                        newState.currentIndex = labelIndex;
                        // Clear overlays when jumping to label
                        newState.stageState = {
                            ...newState.stageState,
                            buttonOverlays: [],
                            imageMapOverlays: [],
                            imageOverlays: [],
                            textOverlays: []
                        };
                    } else {
                        runtimeDebugWarn(`[CHOICE] JumpToLabel failed: Label "${targetLabel}" not found in scene "${targetScene.name}"`);
                        newState.currentIndex = newState.currentIndex + 1;
                    }
                } else {
                    console.error(`[CHOICE] Scene not found for JumpToLabel: ${targetSceneId}`);
                    newState.currentIndex = newState.currentIndex + 1;
                }
            } else if (jumpAction) {
                const actualSceneId = navigateToScene(jumpAction.targetSceneId, newState.variables);
                const newScene = project.scenes[actualSceneId];
                if (newScene) {
                    // Reset local-scope variables on scene jump from choice
                    const localDefaults = getLocalVariableDefaults(project.variables);
                    newState.variables = { ...newState.variables, ...localDefaults };
                    runtimeDebugLog('[Variable Scope] Reset local variables on choice/button scene jump:', Object.keys(localDefaults));
                    newState.currentSceneId = actualSceneId;
                    newState.currentCommands = newScene.commands;
                    newState.currentIndex = 0;
                } else {
                     console.error(`Scene not found for choice jump: ${actualSceneId}`);
                     newState.currentIndex = newState.currentIndex + 1;
                }
            } else {
                // If no jump, just advance to next command in current scene
                newState.currentIndex = newState.currentIndex + 1;
            }
    
            return newState;
        });
    };

    const handleTextInputSubmit = (value: string) => {
        updatePlayerState(p => {
            if (!p || !p.uiState.textInput) return p;
            
            // Add text input to history with full state snapshot (BEFORE input modifies state)
            const historyEntry: HistoryEntry = {
                timestamp: Date.now(),
                type: 'textInput',
                text: `Input: ${value}`,
                inputValue: value,
                variableId: p.uiState.textInput.variableId,
                sceneId: p.currentSceneId,
                commandIndex: p.currentIndex,
                // Full state snapshots for backward navigation
                stageSnapshot: JSON.parse(JSON.stringify(p.stageState)),
                variablesSnapshot: { ...p.variables },
                musicSnapshot: { ...p.musicState },
            };

            // Save this input for skip-backward replay
            const inputKey = `${p.currentSceneId}:${p.currentIndex}`;
            
            return {
                ...p,
                currentIndex: p.currentIndex + 1,
                variables: { ...p.variables, [p.uiState.textInput.variableId]: value },
                history: (() => { const h = [...p.history, historyEntry]; if (h.length > 200) h.splice(0, h.length - 200); return h; })(),
                savedInputs: { ...p.savedInputs, [inputKey]: { type: 'textInput', value } },
                uiState: { ...p.uiState, isWaitingForInput: false, textInput: null }
            };
        });
    };

    /** Skip backward: navigate to the previous dialogue entry in history.
     *  - Fully restores visual state (background, characters, overlays) from snapshots.
     *  - Saved choices/inputs are replayed automatically when advancing forward again.
     *  - Properly handles cross-scene navigation, restoring the target scene's state.
     */
    const handleSkipBackward = useCallback(() => {
        updatePlayerState(p => {
            if (!p || p.history.length === 0) return p;

            // The CURRENT dialogue lives in `uiState.dialogue`, NOT in history — entries
            // are pushed to history only when the user advances past them. So the most
            // recent history entry is already the "previous" dialogue we want to step
            // back to. Walk backward from the end looking for the most recent
            // dialogue-type entry (we skip choice / textInput entries).
            let targetIdx = p.history.length - 1;
            while (targetIdx >= 0 && p.history[targetIdx].type !== 'dialogue') {
                targetIdx--;
            }

            if (targetIdx < 0) return p; // No previous dialogue to go back to
            
            const target = p.history[targetIdx];
            
            // Restore scene navigation
            let newSceneId = target.sceneId || p.currentSceneId;
            let newCommands = p.currentCommands;
            let newCommandIndex = target.commandIndex ?? p.currentIndex;
            
            // Always load commands from the target scene (even same scene - ensures consistency)
            const targetScene = project.scenes[newSceneId];
            if (targetScene) {
                newCommands = targetScene.commands;
            } else if (target.sceneId && target.sceneId !== p.currentSceneId) {
                return p; // Target scene not found, can't navigate
            }
            
            // Trim history to the target entry (remove everything after it)
            const trimmedHistory = p.history.slice(0, targetIdx);
            
            // Restore full visual state from snapshot if available
            const restoredStage = target.stageSnapshot
                ? JSON.parse(JSON.stringify(target.stageSnapshot))
                : p.stageState;
            const restoredVariables = target.variablesSnapshot
                ? { ...target.variablesSnapshot }
                : p.variables;
            const restoredMusic = target.musicSnapshot
                ? { ...target.musicSnapshot }
                : p.musicState;
            
            return {
                ...p,
                currentSceneId: newSceneId,
                currentCommands: newCommands,
                currentIndex: newCommandIndex,
                history: trimmedHistory,
                // Restore full visual/audio state from snapshot
                stageState: restoredStage,
                variables: restoredVariables,
                musicState: restoredMusic,
                uiState: {
                    ...p.uiState,
                    dialogue: {
                        characterName: target.characterName || 'Narrator',
                        characterColor: target.characterColor || '#FFFFFF',
                        characterId: null,
                        text: target.text,
                    },
                    choices: null,
                    textInput: null,
                    isWaitingForInput: true,
                    isSkipping: false,
                    showHistory: false,
                    movieUrl: null,
                    movieLoop: false,
                }
            };
        });
        // Rewinding to an earlier command index leaves the scheduler's `lastProcessed`
        // ahead of where we are now — its `alreadyAdvancedPast` guard can then block
        // commands from running when the user advances forward again. Reset both the
        // scheduler and the variable cache, mirroring what JumpToScene does.
        commandSchedulerRef.current.reset();
        variableStoreRef.current = null;
    }, [project.scenes]);

    const handleUIAction = (action: VNUIAction) => {
        runtimeDebugLog('handleUIAction called with:', action.type, action);
        
        // Intercept actions that need confirmation dialogs
        if (action.type === UIActionType.QuitToTitle && playerState) {
            // Show quit confirmation when a game is in progress
            setConfirmDialog({ type: 'quit', pendingAction: action });
            return;
        }
        if (action.type === UIActionType.StartNewGame && (playerState || gameSaves[0])) {
            // Show new game confirmation when a game is in progress OR an auto-save exists
            setConfirmDialog({ type: 'newGame', pendingAction: action });
            return;
        }

        executeUIAction(action);
    };

    const executeUIAction = (action: VNUIAction) => {
        if (!playerState && action.type === UIActionType.StartNewGame) {
            startNewGame();
        } else if (!playerState && action.type === UIActionType.ContinueGame) {
            // Continue from title screen: load auto-save (slot 0), fallback to new game
            const doLoad = async () => {
                const saves = savesPersistentRef.current ? await getGameSaves() : inMemorySavesRef.current;
                if (saves[0]) {
                    loadGame(0);
                } else {
                    runtimeDebugLog('[ContinueGame] No auto-save found, starting new game instead');
                    startNewGame();
                }
            };
            void doLoad();
        } else if (playerState?.mode === 'paused' && action.type === UIActionType.ReturnToGame) {
             updatePlayerState(p => p ? { ...p, mode: 'playing' } : null);
             setScreenStack([]);
             // Resume music if it was paused
             if (musicAudioRef.current && musicAudioRef.current.paused && playerState.musicState.isPlaying) {
                 musicAudioRef.current.play().catch(e => console.error('Failed to resume music:', e));
             }
        } else if (action.type === UIActionType.GoToScreen) {
            const targetId = (action as GoToScreenAction).targetScreenId;
            const targetScreen = project.uiScreens[targetId];
            
            if (!targetScreen) {
                runtimeDebugWarn(`GoToScreen failed: Screen with ID ${targetId} not found`);
                return;
            }
            
            // Handle music transition when going to screen
            if (playerState && playerState.mode === 'playing') {
                const screenMusicInfo = targetScreen.music;
                const hasMusicChange = screenMusicInfo && screenMusicInfo.audioId;
                
                if (hasMusicChange) {
                    const audio = musicAudioRef.current;
                    const newMusicUrl = screenMusicInfo.audioId ? assetResolver(screenMusicInfo.audioId, 'audio') : null;
                    const currentMusic = audio.src;
                    const normalize = (value: string | null): string | null => {
                        if (!value) return null;
                        try {
                            return new URL(value, window.location.href).href;
                        } catch (e) {
                            return value;
                        }
                    };
                    const currentNormalized = currentMusic ? normalize(currentMusic) : null;
                    const newNormalized = normalize(newMusicUrl);
                    
                    // Only transition if music is different
                    if (currentNormalized !== newNormalized && newMusicUrl) {
                        // Fade out current music
                        fadeAudio(audio, 0, 0.5, () => {
                            // Load and play new music
                            audio.src = newMusicUrl;
                            audio.load();
                            audio.loop = true;
                            audio.play().then(() => {
                                fadeAudio(audio, settings.musicVolume, 0.5);
                            }).catch(e => {
                                console.error('Screen music play failed:', e);
                            });
                        });
                    }
                }
                
                setHudStack(s => {
                    // Mark the departing screen as closing so its transitionOut plays under the new screen.
                    // Skip only when transitionOut is explicitly 'none'. The departing screen STAYS in
                    // the stack so ReturnToPreviousScreen can pop back to it — only `closingScreens` is
                    // cleared once the visual transition has finished.
                    const departingId = s.length > 0 ? s[s.length - 1] : null;
                    if (departingId) {
                        const departingScreen = project.uiScreens[departingId];
                        const depTransOut = departingScreen?.transitionOut || 'fade';
                        if (depTransOut !== 'none') {
                            const duration = departingScreen?.transitionOutDuration ?? departingScreen?.transitionDuration ?? 300;
                            setClosingScreens(prev => new Set(prev).add(departingId));
                            setTimeout(() => {
                                setClosingScreens(prev => {
                                    const next = new Set(prev);
                                    next.delete(departingId);
                                    return next;
                                });
                            }, duration + 100);
                        }
                    }
                    return [...s, targetId];
                });
            } else {
                setScreenStack(stack => {
                    // Same rule as the hudStack branch: keep the departing screen in the stack so
                    // ReturnToPreviousScreen can pop back to it. Only `closingScreens` is cleared
                    // once the visual transition has finished.
                    const departingId = stack.length > 0 ? stack[stack.length - 1] : null;
                    if (departingId) {
                        const departingScreen = project.uiScreens[departingId];
                        const depTransOut = departingScreen?.transitionOut || 'fade';
                        if (depTransOut !== 'none') {
                            const duration = departingScreen?.transitionOutDuration ?? departingScreen?.transitionDuration ?? 300;
                            setClosingScreens(prev => new Set(prev).add(departingId));
                            setTimeout(() => {
                                setClosingScreens(prev => {
                                    const next = new Set(prev);
                                    next.delete(departingId);
                                    return next;
                                });
                            }, duration + 100);
                        }
                    }
                    return [...stack, targetId];
                });
            }
        } else if (action.type === UIActionType.ReturnToPreviousScreen) {
            if (playerState && playerState.mode === 'playing') {
                if (hudStack.length > 0) {
                    const closingScreenId = hudStack[hudStack.length - 1];
                    const closingScreen = project.uiScreens[closingScreenId];
                    const transitionDuration = closingScreen?.transitionOutDuration ?? closingScreen?.transitionDuration ?? 300;
                    const effectiveTransitionOut = closingScreen?.transitionOut || 'fade';
                    const hasTransition = effectiveTransitionOut !== 'none';
                    
                    if (hasTransition) {
                        // Mark screen as closing
                        setClosingScreens(prev => new Set(prev).add(closingScreenId));
                        
                        // Wait for transition to complete before removing from stack
                        setTimeout(() => {
                            setHudStack(s => s.slice(0, -1));
                            setClosingScreens(prev => {
                                const next = new Set(prev);
                                next.delete(closingScreenId);
                                return next;
                            });
                            
                            // If we're closing the last HUD screen, advance to next command
                            if (hudStack.length === 1) {
                                flushSync(() => {
                                    updatePlayerState(p => {
                                        if (!p) return null;
                                        runtimeDebugLog('ReturnToPreviousScreen (transition): BEFORE merge - playerState.variables:', JSON.stringify(p.variables, null, 2));
                                        runtimeDebugLog('ReturnToPreviousScreen (transition): uiVariables to merge:', JSON.stringify(uiVariablesRef.current, null, 2));
                                        runtimeDebugLog('ReturnToPreviousScreen (transition): dirty variable IDs:', Array.from(uiDirtyVariableIdsRef.current));
                                        const mergedVariables = mergeDirtyUiVariables(p.variables);
                                        runtimeDebugLog('ReturnToPreviousScreen (transition): AFTER merge - merged variables:', JSON.stringify(mergedVariables, null, 2));
                                        return {
                                            ...p,
                                            variables: mergedVariables, // Merge UI variables into game variables
                                            currentIndex: p.currentIndex + 1,
                                            stageState: {
                                                ...p.stageState,
                                                buttonOverlays: [],
                                                imageMapOverlays: [],
                                                imageOverlays: []
                                            }
                                        };
                                    });
                                });
                                runtimeDebugLog('[CLEAR] Dirty set cleared after ReturnToPreviousScreen (with transition)');
                                uiDirtyVariableIdsRef.current.clear();
                            }
                        }, transitionDuration);
                    } else {
                        // No transition, close immediately
                        setHudStack(s => s.slice(0, -1));
                        if (hudStack.length === 1) {
                            // Delay advancement to ensure any SetVariable actions from button clicks are processed first
                            setTimeout(() => {
                                flushSync(() => {
                                    updatePlayerState(p => {
                                        if (!p) return null;
                                        runtimeDebugLog('ReturnToPreviousScreen (no transition): BEFORE merge - playerState.variables:', JSON.stringify(p.variables, null, 2));
                                        runtimeDebugLog('ReturnToPreviousScreen (no transition): uiVariables to merge:', JSON.stringify(uiVariablesRef.current, null, 2));
                                        runtimeDebugLog('ReturnToPreviousScreen (no transition): dirty variable IDs:', Array.from(uiDirtyVariableIdsRef.current));
                                        const mergedVariables = mergeDirtyUiVariables(p.variables);
                                        runtimeDebugLog('ReturnToPreviousScreen (no transition): AFTER merge - merged variables:', JSON.stringify(mergedVariables, null, 2));
                                        return {
                                            ...p,
                                            variables: mergedVariables, // Merge UI variables into game variables
                                            currentIndex: p.currentIndex + 1,
                                            stageState: {
                                                ...p.stageState,
                                                buttonOverlays: [],
                                                imageMapOverlays: [],
                                                imageOverlays: []
                                            }
                                        };
                                    });
                                });
                                runtimeDebugLog('[CLEAR] Dirty set cleared after ReturnToPreviousScreen (no transition)');
                                uiDirtyVariableIdsRef.current.clear();
                            }, 0);
                        }
                    }
                }
            } else {
                if (screenStack.length > 1) {
                    const closingScreenId = screenStack[screenStack.length - 1];
                    const closingScreen = project.uiScreens[closingScreenId];
                    const transitionDuration = closingScreen?.transitionOutDuration ?? closingScreen?.transitionDuration ?? 300;
                    const effectiveTransitionOut = closingScreen?.transitionOut || 'fade';
                    const hasTransition = effectiveTransitionOut !== 'none';
                    
                    if (hasTransition) {
                        // Mark screen as closing
                        setClosingScreens(prev => new Set(prev).add(closingScreenId));
                        
                        // Wait for transition to complete before removing from stack
                        setTimeout(() => {
                            setScreenStack(stack => stack.slice(0, -1));
                            setClosingScreens(prev => {
                                const next = new Set(prev);
                                next.delete(closingScreenId);
                                return next;
                            });
                        }, transitionDuration);
                    } else {
                        // No transition, close immediately
                        setScreenStack(stack => stack.slice(0, -1));
                    }
                }
            }
        } else if (action.type === UIActionType.QuitToTitle) {
            // Auto-save to slot 0 before quitting so Continue can restore the session
            if (playerState) {
                saveGame(0);
            }
            // Stop game music and SFX immediately
            const audio = musicAudioRef.current;
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
                audio.src = '';
            }
            stopAllSfx();

            const performQuit = () => {
                // Clear player state, uiVariables, and return to title screen
                updatePlayerState(null);
                setHudStack([]);
                // Reset variables to defaults + persistent overrides when quitting to title
                // This ensures CG unlock status (persistent vars) is still visible on menu screens
                const resetVars = getInitialVariablesWithPersistent(project.variables, project.id);
                setUiVariables(resetVars);
                uiVariablesRef.current = resetVars;
                setMenuVariables(resetVars);
                runtimeDebugLog('[CLEAR] Dirty set cleared after QuitToTitle');
                uiDirtyVariableIdsRef.current.clear();
                if (project.ui.titleScreenId) setScreenStack([project.ui.titleScreenId]);
            };

            // Mark topmost screen(s) as closing so the transitionOut plays before the quit
            const quitClosingIds: VNID[] = [];
            const topScreenForQuit = screenStack.length > 0 ? screenStack[screenStack.length - 1] : null;
            const topHudForQuit = hudStack.length > 0 ? hudStack[hudStack.length - 1] : null;
            if (topScreenForQuit) quitClosingIds.push(topScreenForQuit);
            if (topHudForQuit) quitClosingIds.push(topHudForQuit);
            let quitScreenOutDuration = 0;
            if (quitClosingIds.length > 0) {
                setClosingScreens(prev => {
                    const next = new Set(prev);
                    quitClosingIds.forEach(id => next.add(id));
                    return next;
                });
                for (const id of quitClosingIds) {
                    const s = project.uiScreens[id];
                    if (s && s.transitionOut !== 'none') {
                        const dur = s.transitionOutDuration ?? s.transitionDuration ?? 300;
                        quitScreenOutDuration = Math.max(quitScreenOutDuration, dur);
                    }
                }
            }
            if (quitScreenOutDuration > 0) {
                setTimeout(performQuit, quitScreenOutDuration);
            } else {
                performQuit();
            }
        } else if (action.type === UIActionType.ContinueGame) {
            // Continue = load the auto-save from slot 0
            const doLoad = async () => {
                const saves = savesPersistentRef.current ? await getGameSaves() : inMemorySavesRef.current;
                if (saves[0]) {
                    loadGame(0);
                } else {
                    runtimeDebugLog('[ContinueGame] No auto-save found, starting new game instead');
                    startNewGame();
                }
            };
            void doLoad();
        } else if (action.type === UIActionType.SaveGame) {
            saveGame((action as SaveGameAction).slotNumber);
        } else if (action.type === UIActionType.LoadGame) {
            loadGame((action as LoadGameAction).slotNumber);
        } else if (action.type === UIActionType.JumpToScene) {
            runtimeDebugLog('[JumpToScene] Action triggered');
            const jumpAction = action as JumpToSceneAction;
            const targetScene = project.scenes[jumpAction.targetSceneId];
            runtimeDebugLog('JumpToScene handler triggered:', {
                targetSceneId: jumpAction.targetSceneId,
                sceneExists: !!targetScene,
                sceneName: targetScene?.name,
                currentSceneId: playerState?.currentSceneId,
                hasPlayerState: !!playerState
            });
            if (!targetScene) {
                runtimeDebugWarn(`JumpToScene action failed: Scene with ID ${jumpAction.targetSceneId} not found.`);
                return;
            }

            const executeJump = () => {
                runtimeDebugLog('[JumpToScene] Clearing screen and HUD stacks');
                // Clear screen and HUD stacks when jumping to a scene
                setScreenStack([]);
                setHudStack([]);
                
                // Clear all active effect timeouts (FlashScreen, ShakeScreen, etc.)
                activeEffectTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
                activeEffectTimeoutsRef.current = [];
                
                // Clear active visual effects
                activeFlashRef.current = null;
                setFlashTrigger(0);
                activeShakeRef.current = null;
                
                // Reset scheduler and variable cache before executing the new scene
                commandSchedulerRef.current.reset();
                variableStoreRef.current = null;
                
                // If playerState is null (jumping from title screen), initialize it
                if (!playerState) {
                    runtimeDebugLog('Initializing playerState for scene jump from title');
                    const initialVariables: Record<VNID, string | number | boolean> = {};
                    for (const varId in project.variables) {
                        const v = project.variables[varId];
                        const customizedValue = menuVariables[v.id];
                        initialVariables[v.id] = customizedValue !== undefined ? customizedValue : v.defaultValue;
                    }
                    
                    updatePlayerState({
                        mode: 'playing',
                        currentSceneId: jumpAction.targetSceneId,
                        currentCommands: targetScene.commands,
                        currentIndex: 0,
                        commandStack: [],
                        variables: initialVariables,
                        history: [],
                        stageState: { 
                            backgroundUrl: null, 
                            characters: {}, 
                            textOverlays: [], 
                            imageOverlays: [], 
                            buttonOverlays: [], 
                            imageMapOverlays: [],
                            movieOverlays: [],
                            screen: { 
                                shake: { active: false, intensity: 0 }, 
                                tint: 'transparent', 
                                zoom: 1, 
                                panX: 0, 
                                panY: 0, 
                                transitionDuration: 0.5,
                                overlayEffects: []
                            },
                            particleEffects: {}
                        },
                        uiState: {
                            dialogue: null,
                            choices: null,
                            textInput: null,
                            movieUrl: null,
                            movieLoop: false,
                            isWaitingForInput: false,
                            isTransitioning: false,
                            transitionElement: null,
                            flash: null,
                        },
                        musicState: {
                            audioId: null,
                            isPlaying: false,
                            loop: false,
                            currentTime: 0,
                        }
                    });
                    runtimeDebugLog('[CLEAR] Dirty set cleared after title screen jump');
                    uiDirtyVariableIdsRef.current.clear();
                } else {
                    // Jump to the target scene and reset stage state
                    runtimeDebugLog('Jumping to new scene from existing game state');
                    runtimeDebugLog('[DEBUG Jump] Current variables before jump:', playerState.variables);
                    
                    // Check if we're jumping to the same scene (should preserve currentIndex)
                    const isSameScene = playerState.currentSceneId === jumpAction.targetSceneId;
                    runtimeDebugLog('[DEBUG Jump] Same scene?', isSameScene, 'Current:', playerState.currentSceneId, 'Target:', jumpAction.targetSceneId);
                    
                    flushSync(() => {
                        updatePlayerState(p => {
                            if (!p) return null;
                            runtimeDebugLog('Setting new scene:', {
                                targetSceneId: jumpAction.targetSceneId,
                                commandCount: targetScene.commands.length,
                                commands: targetScene.commands.map(c => ({ type: c.type, id: c.id }))
                            });
                            runtimeDebugLog('[DEBUG Jump] Variables being carried over:', p.variables);
                            runtimeDebugLog('[DEBUG Jump] uiVariables snapshot:', JSON.stringify(uiVariablesRef.current, null, 2));
                            runtimeDebugLog('[DEBUG Jump] dirty variable IDs:', Array.from(uiDirtyVariableIdsRef.current));
                            const mergedVariables = mergeDirtyUiVariables(p.variables);
                            runtimeDebugLog('[DEBUG Jump] Variables after merge with uiVariables:', mergedVariables);
                            
                            // If jumping to the same scene, preserve currentIndex and advance by 1
                            // If jumping to a different scene, reset to 0
                            const newIndex = isSameScene ? p.currentIndex + 1 : 0;
                            runtimeDebugLog('[DEBUG Jump] Setting currentIndex to:', newIndex, '(was:', p.currentIndex, ')');
                            
                            return {
                                ...p,
                                currentSceneId: jumpAction.targetSceneId,
                                currentCommands: targetScene.commands,
                                currentIndex: newIndex,
                                // Reset stage state to clean slate
                                stageState: { 
                                    backgroundUrl: null, 
                                    characters: {}, 
                                    textOverlays: [], 
                                    imageOverlays: [], 
                                    buttonOverlays: [], 
                                    imageMapOverlays: [],
                                    movieOverlays: [],
                                    screen: { 
                                        shake: { active: false, intensity: 0 }, 
                                        tint: 'transparent', 
                                        zoom: 1, 
                                        panX: 0, 
                                        panY: 0, 
                                        transitionDuration: 0.5,
                                        overlayEffects: []
                                    },
                                    particleEffects: {}
                                },
                                // Clear any active UI state (dialogue, choices, etc.)
                                uiState: {
                                    dialogue: null,
                                    choices: null,
                                    textInput: null,
                                    movieUrl: null,
                                    movieLoop: false,
                                    isWaitingForInput: false,
                                    isTransitioning: false,
                                    transitionElement: null,
                                    flash: null,
                                },
                                variables: mergedVariables
                            };
                        });
                    });
                    // Clear dirty set after state update completes
                    runtimeDebugLog('[CLEAR] Dirty set cleared after JumpToScene');
                    uiDirtyVariableIdsRef.current.clear();
                }
            };

            // Mark topmost screens as closing so their transitionOut plays while the scene transition runs
            const jumpClosingIds: VNID[] = [];
            const topScreenForJump = screenStack.length > 0 ? screenStack[screenStack.length - 1] : null;
            const topHudForJump = hudStack.length > 0 ? hudStack[hudStack.length - 1] : null;
            if (topScreenForJump) jumpClosingIds.push(topScreenForJump);
            if (topHudForJump) jumpClosingIds.push(topHudForJump);
            let jumpScreenOutDuration = 0;
            if (jumpClosingIds.length > 0) {
                setClosingScreens(prev => {
                    const next = new Set(prev);
                    jumpClosingIds.forEach(id => next.add(id));
                    return next;
                });
                for (const id of jumpClosingIds) {
                    const s = project.uiScreens[id];
                    if (s && s.transitionOut !== 'none') {
                        const dur = s.transitionOutDuration ?? s.transitionDuration ?? 300;
                        jumpScreenOutDuration = Math.max(jumpScreenOutDuration, dur);
                    }
                }
            }

            // Use scene exit transition if we're in an active scene, otherwise honour the screen's own transitionOut
            if (playerState?.currentSceneId) {
                startSceneExitTransition(playerState.currentSceneId, executeJump);
            } else if (jumpScreenOutDuration > 0) {
                setTimeout(executeJump, jumpScreenOutDuration);
            } else {
                executeJump();
            }
        } else if (action.type === UIActionType.SetVariable) {
            const setVarAction = action as SetVariableAction;
            const variable = project.variables[setVarAction.variableId];
            if (!variable) {
                runtimeDebugWarn(`SetVariable action failed: Variable with ID ${setVarAction.variableId} not found.`);
                return;
            }

            runtimeDebugLog('[SetVariable] RAW ACTION:', {
                variableId: setVarAction.variableId,
                variableName: variable.name,
                variableType: variable.type,
                actionValue: setVarAction.value,
                actionValueType: typeof setVarAction.value,
                operator: setVarAction.operator
            });

            const originalOperator = setVarAction.operator;
            const effectiveOperator = normalizeOperator(variable.type, variable.name, originalOperator);
            const wasCoercedOperator = originalOperator !== effectiveOperator;

            const computeNewValue = (currentVal: string | number | boolean | undefined): string | number | boolean => {
                // Use consolidated calculateVariableValue for all value computations
                return calculateVariableValue(
                    effectiveOperator,
                    variable.type,
                    currentVal,
                    setVarAction.value,
                    setVarAction.randomMin,
                    setVarAction.randomMax,
                    wasCoercedOperator ? originalOperator : undefined
                );
            };

            // Use flushSync to ensure variable updates are applied immediately and synchronously
            // This prevents race conditions where navigation happens before variables are updated
            flushSync(() => {
                if (playerState) {
                    // UI screens during gameplay: update uiVariables (separate from game variables)
                    uiDirtyVariableIdsRef.current.add(setVarAction.variableId);
                    setUiVariables(prev => {
                        const currentVal = prev[setVarAction.variableId];
                        const newVal = computeNewValue(currentVal);
                        runtimeDebugLog('[SetVariable] Details (uiVariables):', {
                            variable: variable.name,
                            variableId: setVarAction.variableId,
                            rawValue: setVarAction.value,
                            operator: `${setVarAction.operator} => ${effectiveOperator}`,
                            previousValue: currentVal,
                            nextValue: newVal,
                            type: variable.type
                        });
                        const next = { ...prev, [setVarAction.variableId]: newVal };
                        uiVariablesRef.current = next;
                        return next;
                    });
                } else {
                    setMenuVariables(prev => {
                        const currentVal = prev[setVarAction.variableId] ?? variable.defaultValue;
                        const newVal = computeNewValue(currentVal);
                        runtimeDebugLog('[SetVariable] Details (menu):', {
                            variable: variable.name,
                            variableId: setVarAction.variableId,
                            rawValue: setVarAction.value,
                            operator: `${setVarAction.operator} => ${effectiveOperator}`,
                            previousValue: currentVal,
                            nextValue: newVal,
                            type: variable.type
                        });
                        return { ...prev, [setVarAction.variableId]: newVal };
                    });
                }
            });
            // Auto-save persistent-scope variables from UI action
            if ((variable as any).scope === 'persistent') {
                const currentVars = playerState ? uiVariablesRef.current : menuVariables;
                const prevPersistent = loadPersistentVariables(project.id);
                savePersistentVariables(project.id, { ...prevPersistent, [setVarAction.variableId]: currentVars[setVarAction.variableId] });
                runtimeDebugLog('[Variable Scope] Saved persistent variable from UI action:', variable.name);
            }
        } else if (action.type === UIActionType.CycleLayerAsset) {
            runtimeDebugLog('CycleLayerAsset handler triggered, playerState exists:', !!playerState);
            
            const cycleAction = action as CycleLayerAssetAction;
            runtimeDebugLog('CycleLayerAsset action details:', {
                characterId: cycleAction.characterId,
                layerId: cycleAction.layerId,
                variableId: cycleAction.variableId,
                direction: cycleAction.direction
            });
            
            const character = project.characters[cycleAction.characterId];
            if (!character) {
                runtimeDebugWarn(`CycleLayerAsset action failed: Character with ID ${cycleAction.characterId} not found.`);
                return;
            }
            runtimeDebugLog('Character found:', character.name);
            
            const layer = character.layers[cycleAction.layerId];
            if (!layer) {
                runtimeDebugWarn(`CycleLayerAsset action failed: Layer with ID ${cycleAction.layerId} not found.`);
                return;
            }
            runtimeDebugLog('Layer found:', layer.name);
            
            const assetsCount = Object.keys(layer.assets || {}).length;
            runtimeDebugLog('Assets count:', assetsCount);
            if (assetsCount === 0) {
                runtimeDebugWarn(`CycleLayerAsset action failed: Layer "${layer.name}" has no assets.`);
                return;
            }
            
            // Use playerState variables if in-game, otherwise use menuVariables
            if (playerState) {
                // In-game: update playerState variables
                updatePlayerState(p => {
                    if (!p) return null;
                    
                    const currentIndex = Number(p.variables[cycleAction.variableId]) || 0;
                    let newIndex: number;
                    if (cycleAction.direction === 'next') {
                        newIndex = (currentIndex + 1) % assetsCount;
                    } else {
                        newIndex = (currentIndex - 1 + assetsCount) % assetsCount;
                    }
                    
                    runtimeDebugLog(`CycleLayerAsset (in-game): ${character.name} layer "${layer.name}" from index ${currentIndex} to ${newIndex} (${cycleAction.direction}), total assets: ${assetsCount}`);
                    
                    return { 
                        ...p, 
                        variables: { ...p.variables, [cycleAction.variableId]: newIndex }
                    };
                });
            } else {
                // Pre-game menu: update menuVariables
                const currentIndex = Number(menuVariables[cycleAction.variableId]) || 0;
                let newIndex: number;
                if (cycleAction.direction === 'next') {
                    newIndex = (currentIndex + 1) % assetsCount;
                } else {
                    newIndex = (currentIndex - 1 + assetsCount) % assetsCount;
                }
                
                runtimeDebugLog(`CycleLayerAsset (menu): ${character.name} layer "${layer.name}" from index ${currentIndex} to ${newIndex} (${cycleAction.direction}), total assets: ${assetsCount}`);
                
                setMenuVariables(vars => ({
                    ...vars,
                    [cycleAction.variableId]: newIndex
                }));
            }
        } else if (action.type === UIActionType.JumpToLabel && playerState) {
            const jumpToLabelAction = action as JumpToLabelAction;
            const targetLabel = jumpToLabelAction.targetLabel;
            
            // Use the screen's original scene ID if available, otherwise use current scene
            const targetSceneId = playerState.uiState.screenSceneId || playerState.currentSceneId;
            
            runtimeDebugLog('JumpToLabel handler triggered:', { 
                targetLabel, 
                currentSceneId: playerState.currentSceneId,
                currentSceneName: project.scenes[playerState.currentSceneId]?.name,
                screenSceneId: playerState.uiState.screenSceneId,
                targetSceneId: targetSceneId,
                targetSceneName: project.scenes[targetSceneId]?.name
            });
            
            // Find the label in the target scene's commands
            const targetScene = project.scenes[targetSceneId];
            if (!targetScene) {
                runtimeDebugWarn('JumpToLabel failed: Target scene not found');
                return;
            }
            
            // Log all labels in the target scene
            const allLabels = targetScene.commands
                .filter(cmd => cmd.type === CommandType.Label)
                .map(cmd => (cmd as LabelCommand).labelId);
            runtimeDebugLog('JumpToLabel: Available labels in target scene:', allLabels);
            
            const labelIndex = targetScene.commands.findIndex((cmd) => 
                cmd.type === CommandType.Label && (cmd as LabelCommand).labelId === targetLabel
            );
            
            if (labelIndex === -1) {
                runtimeDebugWarn(`JumpToLabel failed: Label "${targetLabel}" not found in scene "${targetScene.name}"`);
                runtimeDebugWarn('Looking for label:', targetLabel);
                runtimeDebugWarn('Available labels:', allLabels);
                return;
            }
            
            runtimeDebugLog(`JumpToLabel: Jumping to label "${targetLabel}" at index ${labelIndex} in scene "${targetScene.name}"`);
            runtimeDebugLog('JumpToLabel: Label command at that index:', targetScene.commands[labelIndex]);

            const performJumpToLabel = () => {
                // Close any open HUD screens
                setHudStack([]);

                // Jump to the label by updating the current index and clearing overlays
                // Also switch back to the target scene if we've moved to a different scene
                flushSync(() => {
                    updatePlayerState(p => {
                        if (!p) return null;
                        runtimeDebugLog('JumpToLabel: Setting new state - currentIndex from', p.currentIndex, 'to', labelIndex);
                        runtimeDebugLog('JumpToLabel: BEFORE merge - playerState.variables:', JSON.stringify(p.variables, null, 2));
                        runtimeDebugLog('JumpToLabel: uiVariables to merge:', JSON.stringify(uiVariablesRef.current, null, 2));
                        runtimeDebugLog('JumpToLabel: dirty variable IDs:', Array.from(uiDirtyVariableIdsRef.current));
                        const mergedVariables = mergeDirtyUiVariables(p.variables);
                        runtimeDebugLog('JumpToLabel: AFTER merge - merged variables:', JSON.stringify(mergedVariables, null, 2));
                        return {
                            ...p,
                            currentSceneId: targetSceneId,
                            currentCommands: targetScene.commands,
                            currentIndex: labelIndex,
                            variables: mergedVariables, // Merge UI variables into game variables
                            stageState: {
                                ...p.stageState,
                                buttonOverlays: [],
                                imageMapOverlays: [],
                                imageOverlays: [],
                                textOverlays: []
                            },
                            uiState: {
                                ...p.uiState,
                                dialogue: null,
                                choices: null,
                                isWaitingForInput: false,
                                screenSceneId: null, // Clear the stored scene ID after jumping
                            }
                        };
                    });
                });
                runtimeDebugLog('[CLEAR] Dirty set cleared after JumpToLabel');
                uiDirtyVariableIdsRef.current.clear();
            };

            // Mark topmost HUD screen as closing so its transitionOut plays before the jump completes
            const topHudForJTL = hudStack.length > 0 ? hudStack[hudStack.length - 1] : null;
            let jtlScreenOutDuration = 0;
            if (topHudForJTL) {
                const s = project.uiScreens[topHudForJTL];
                if (s && s.transitionOut !== 'none') {
                    jtlScreenOutDuration = s.transitionOutDuration ?? s.transitionDuration ?? 300;
                    setClosingScreens(prev => new Set(prev).add(topHudForJTL));
                }
            }
            if (jtlScreenOutDuration > 0) {
                setTimeout(performJumpToLabel, jtlScreenOutDuration);
            } else {
                performJumpToLabel();
            }
        } else if (action.type === UIActionType.OpenURL) {
            const openUrlAction = action as OpenURLAction;
            if (openUrlAction.url) {
                runtimeDebugLog('OpenURL action triggered:', openUrlAction.url, 'newTab:', openUrlAction.newTab);
                if (openUrlAction.newTab !== false) {
                    window.open(openUrlAction.url, '_blank', 'noopener,noreferrer');
                } else {
                    window.location.href = openUrlAction.url;
                }
            }
        } else if (action.type === UIActionType.ShowLog) {
            // Open the text history overlay (same as the built-in quick menu's "Log" button).
            updatePlayerState(p => p ? { ...p, uiState: { ...p.uiState, showHistory: true } } : null);
        } else if (action.type === UIActionType.ToggleAutoAdvance) {
            // Toggle auto-advance on/off (same as the built-in quick menu's "Auto" button).
            setSettings(s => ({ ...s, autoAdvance: !s.autoAdvance }));
        } else if (action.type === UIActionType.ToggleSkip) {
            // Toggle fast-forward / skip mode (same as the built-in quick menu's "Skip" button).
            updatePlayerState(p => p ? { ...p, uiState: { ...p.uiState, isSkipping: !p.uiState.isSkipping } } : null);
        } else if (action.type === UIActionType.SkipBackward) {
            // Rewind to the previous entry (same as the built-in quick menu's "Back" button).
            handleSkipBackward();
        }
    };

    const handleVariableChange = (variableId: VNID, value: string | number | boolean) => {
        runtimeDebugLog('[handleVariableChange] Called with:', { variableId, value, hasPlayerState: !!playerState });
        if (playerState) {
            // In-game UI screens: update uiVariables (separate from game variables)
            runtimeDebugLog('[handleVariableChange] Updating uiVariables');
            uiDirtyVariableIdsRef.current.add(variableId);
            runtimeDebugLog('[handleVariableChange] ✓ Added to dirty set. Size now:', uiDirtyVariableIdsRef.current.size, 'IDs:', Array.from(uiDirtyVariableIdsRef.current));
            setUiVariables(prev => {
                const newVars = {
                    ...prev,
                    [variableId]: value
                };
                runtimeDebugLog('[handleVariableChange] uiVariables BEFORE:', JSON.stringify(prev, null, 2));
                runtimeDebugLog('[handleVariableChange] uiVariables AFTER:', JSON.stringify(newVars, null, 2));
                uiVariablesRef.current = newVars;
                return newVars;
            });
        } else {
            // Pre-game menu: update menuVariables
            runtimeDebugLog('[handleVariableChange] Updating menuVariables');
            setMenuVariables(prev => {
                const newVars = {
                    ...prev,
                    [variableId]: value
                };
                runtimeDebugLog('[handleVariableChange] New menuVariables:', JSON.stringify(newVars, null, 2));
                return newVars;
            });
        }
    };

    const mergeDirtyUiVariables = useCallback((base: PlayerState['variables']) => {
        const dirtyIds = uiDirtyVariableIdsRef.current;
        if (dirtyIds.size === 0) {
            return base;
        }
        const sourceVariables = uiVariablesRef.current;
        const merged = { ...base };
        dirtyIds.forEach(id => {
            if (Object.prototype.hasOwnProperty.call(sourceVariables, id)) {
                merged[id] = sourceVariables[id];
            }
        });
        return merged;
    }, []);

    const commitUiVariablesToPlayerState = useCallback(() => {
        if (uiDirtyVariableIdsRef.current.size === 0) {
            runtimeDebugLog('[commitUiVariables] No dirty variables to commit');
            return;
        }
        
        runtimeDebugLog('[commitUiVariables] Committing dirty variables:', Array.from(uiDirtyVariableIdsRef.current));
        runtimeDebugLog('[commitUiVariables] uiVariables snapshot:', JSON.stringify(uiVariablesRef.current, null, 2));
        
        flushSync(() => {
            updatePlayerState(p => {
                if (!p) {
                    runtimeDebugLog('[commitUiVariables] No playerState, skipping commit');
                    return null;
                }
                runtimeDebugLog('[commitUiVariables] BEFORE merge - playerState.variables:', JSON.stringify(p.variables, null, 2));
                const mergedVariables = mergeDirtyUiVariables(p.variables);
                runtimeDebugLog('[commitUiVariables] AFTER merge - merged variables:', JSON.stringify(mergedVariables, null, 2));
                return {
                    ...p,
                    variables: mergedVariables,
                };
            });
        });
        runtimeDebugLog('[commitUiVariables] Clearing dirty set after successful commit');
        uiDirtyVariableIdsRef.current.clear();
    }, [mergeDirtyUiVariables]);

    // Compute the variables that UI screens should see: canonical playerState.variables
    // with any dirty (uncommitted) UI-only changes layered on top. This ensures that
    // in-game SetVariable commands (e.g. CG unlock flags) are visible to screens
    // immediately, while keeping UI-screen-originated edits intact until committed.
    const screenVariables = useMemo(() => {
        if (!playerState) return menuVariables;
        const base = { ...playerState.variables };
        // Overlay any dirty UI edits that haven't been committed yet
        uiDirtyVariableIdsRef.current.forEach(id => {
            if (Object.prototype.hasOwnProperty.call(uiVariablesRef.current, id)) {
                base[id] = uiVariablesRef.current[id];
            }
        });
        return base;
    }, [playerState, playerState?.variables, menuVariables, uiVariables]);
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!playerState) return;
            
            // Spacebar to advance dialogue
            if (e.key === ' ' && playerState.mode === 'playing' && playerState.uiState.dialogue && !playerState.uiState.choices && !playerState.uiState.textInput) {
                e.preventDefault();
                handleDialogueAdvance();
                return;
            }
            
            // H key to toggle history
            if ((e.key === 'h' || e.key === 'H') && playerState.mode === 'playing' && !playerState.uiState.textInput) {
                e.preventDefault();
                updatePlayerState(p => p ? { ...p, uiState: { ...p.uiState, showHistory: !p.uiState.showHistory } } : null);
                return;
            }
            
            // Ctrl key to toggle skip forward
            if (e.key === 'Control' && playerState.mode === 'playing' && !playerState.uiState.showHistory && settings.enableSkip) {
                e.preventDefault();
                updatePlayerState(p => p ? { ...p, uiState: { ...p.uiState, isSkipping: !p.uiState.isSkipping } } : null);
                return;
            }
            
            // Arrow Up / Page Up to skip backward
            if ((e.key === 'ArrowUp' || e.key === 'PageUp') && playerState.mode === 'playing' && !playerState.uiState.showHistory && !playerState.uiState.choices && !playerState.uiState.textInput) {
                e.preventDefault();
                handleSkipBackward();
                return;
            }
            
            // Mouse scroll up to skip backward (handled via wheel event separately)
            
            if (e.key === 'Escape') {
                // Close history if open
                if (playerState.uiState.showHistory) {
                    updatePlayerState(p => p ? { ...p, uiState: { ...p.uiState, showHistory: false } } : null);
                    return;
                }
                
                if (playerState.mode === 'playing') {
                    // PAUSE THE GAME
                    updatePlayerState(p => p ? { ...p, mode: 'paused' } : null);
                    // Always pause the game music when entering pause mode
                    if (musicAudioRef.current && !musicAudioRef.current.paused) {
                        musicAudioRef.current.pause();
                    }
                    if (project.ui.pauseScreenId) {
                        setScreenStack([project.ui.pauseScreenId]);
                    }
                } else if (playerState.mode === 'paused') {
                    // HANDLE UNPAUSE OR BACK IN MENU
                    if (screenStack.length > 1) {
                        setScreenStack(s => s.slice(0, -1));
                    } else {
                        updatePlayerState(p => p ? { ...p, mode: 'playing' } : null);
                        // Resume music when unpausing
                        if (musicAudioRef.current && musicAudioRef.current.src && playerState.musicState.isPlaying) {
                            musicAudioRef.current.play().catch(e => console.error('Failed to resume music:', e));
                        }
                        setScreenStack([]);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [playerState, project.ui.pauseScreenId, screenStack, handleDialogueAdvance, handleSkipBackward, settings.enableSkip]);

    // Auto-advance effect
    useEffect(() => {
        if (!settings.autoAdvance || !playerState || playerState.mode !== 'playing') return;
        if (!playerState.uiState.dialogue || playerState.uiState.choices || playerState.uiState.textInput) return;
        
        const timer = setTimeout(() => {
            handleDialogueAdvance();
        }, settings.autoAdvanceDelay * 1000);
        
        return () => clearTimeout(timer);
    }, [settings.autoAdvance, settings.autoAdvanceDelay, playerState?.uiState.dialogue, playerState?.uiState.choices, playerState?.uiState.textInput, playerState?.mode, handleDialogueAdvance]);

    // Skip-forward effect: rapidly advance through dialogue when skipping is active
    // Stops at choices, text inputs, and scene changes (handled by command execution)
    useEffect(() => {
        if (!playerState || playerState.mode !== 'playing' || !playerState.uiState.isSkipping) return;
        if (!settings.enableSkip) {
            // If skip is disabled in settings, cancel skip mode
            updatePlayerState(p => p ? { ...p, uiState: { ...p.uiState, isSkipping: false } } : null);
            return;
        }
        
        // Stop skipping at choices, text inputs
        if (playerState.uiState.choices || playerState.uiState.textInput) {
            updatePlayerState(p => p ? { ...p, uiState: { ...p.uiState, isSkipping: false } } : null);
            return;
        }
        
        // If dialogue is showing, auto-advance it quickly
        if (playerState.uiState.dialogue) {
            const timer = setTimeout(() => {
                handleDialogueAdvance();
            }, 50); // Very fast skip speed
            return () => clearTimeout(timer);
        }
    }, [playerState?.uiState.isSkipping, playerState?.uiState.dialogue, playerState?.uiState.choices, playerState?.uiState.textInput, playerState?.mode, settings.enableSkip, handleDialogueAdvance]);

    // --- Stage Rendering ---
    const renderStage = () => {
        if (!playerState) return null;
        const state = playerState.stageState;
        const getPositionStyle = (position: VNPosition): React.CSSProperties => {
            if (typeof position === 'object') {
                // Custom coordinates
                return {
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                };
            } else {
                // Preset positions - all use centering transform
                const presetStyles: Record<VNPositionPreset, React.CSSProperties> = {
                    'left': { top: '10%', left: '25%' },
                    'center': { top: '10%', left: '50%' },
                    'right': { top: '10%', left: '75%' },
                    'off-left': { top: '10%', left: '-25%' },
                    'off-right': { top: '10%', left: '125%' },
                };
                return presetStyles[position];
            }
        };
        const shakeClass = activeShakeRef.current ? 'shake' : '';
        const intensityPx = activeShakeRef.current ? activeShakeRef.current.intensity * 1.5 : 0;
        const screenTween = TweenManager.getCurrentValues('__screen__', 'screen');
        const tweenedZoom = screenTween?.scaleX ?? state.screen.zoom;
        const tweenedPanX = screenTween?.x ?? state.screen.panX;
        const tweenedPanY = screenTween?.y ?? state.screen.panY;
        const panZoomStyle: React.CSSProperties = { transform: `scale(${tweenedZoom}) translate(${tweenedPanX}%, ${tweenedPanY}%)`, transition: screenTween ? 'none' : `transform ${state.screen.transitionDuration}s ease-in-out`, width: '100%', height: '100%' };
        const shakeIntensityStyle = (activeShakeRef.current ? { '--shake-intensity-x': `${intensityPx}px`, '--shake-intensity-y': `${intensityPx * 0.7}px`, } : {}) as React.CSSProperties;
        const tintStyle: React.CSSProperties = { backgroundColor: state.screen.tint, transition: `background-color ${state.screen.transitionDuration}s ease-in-out`, };

        const handleStageClick = () => {
            // Only advance if dialogue is showing and not waiting for choice or text input
            if (playerState.uiState.dialogue && !playerState.uiState.choices && !playerState.uiState.textInput && !playerState.uiState.showHistory) {
                handleDialogueAdvance();
            }
        };

        const handleWheel = (e: React.WheelEvent) => {
            // Scroll up to skip backward when dialogue is showing
            if (e.deltaY < 0 && playerState.uiState.dialogue && !playerState.uiState.choices && !playerState.uiState.textInput && !playerState.uiState.showHistory) {
                e.preventDefault();
                handleSkipBackward();
            }
        };

        return (
            <div 
                ref={stageRef} 
                className="w-full h-full relative overflow-hidden bg-black"
                onClick={handleStageClick}
                onWheel={handleWheel}
                style={{ cursor: playerState.uiState.dialogue && !playerState.uiState.choices && !playerState.uiState.textInput ? 'pointer' : 'default' }}
            >
                <div style={panZoomStyle}>
                    <div className={`w-full h-full ${shakeClass} z-10`} style={{ ...shakeIntensityStyle, backgroundColor: state.backgroundColor }}>
                        {state.backgroundUrl && (
                            state.backgroundIsVideo ? (
                                <video 
                                    src={state.backgroundUrl} 
                                    autoPlay 
                                    muted 
                                    loop={state.backgroundLoop} 
                                    playsInline
                                    className="absolute w-full h-full object-cover"
                                />
                            ) : (
                                <img src={state.backgroundUrl} alt="background" className="absolute w-full h-full object-cover"/>
                            )
                        )}
                        {/* render background transition visuals here so characters render above them */}
                        {playerState?.uiState.transitionElement}
                        {/* Movie overlays (behind characters, above background) */}
                        {state.movieOverlays && state.movieOverlays.length > 0 && state.movieOverlays.map((movie, idx) => {
                            if (!movie.url) return null;
                            const isCustom = movie.objectFit === 'custom';
                            const videoStyle: React.CSSProperties = isCustom ? {
                                left: `${movie.x ?? 0}%`,
                                top: `${movie.y ?? 0}%`,
                                width: `${movie.width ?? 100}%`,
                                height: `${movie.height ?? 100}%`,
                                objectFit: 'fill' as const,
                                opacity: movie.opacity ?? 1,
                                zIndex: 2,
                            } : {
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: (movie.objectFit || 'cover') as React.CSSProperties['objectFit'],
                                opacity: movie.opacity ?? 1,
                                zIndex: 2,
                            };
                            return (
                                <video
                                    key={`movie-overlay-${idx}-${movie.url}`}
                                    src={movie.url}
                                    autoPlay
                                    muted
                                    loop={movie.loop}
                                    playsInline
                                    className="absolute pointer-events-none"
                                    style={videoStyle}
                                    onEnded={() => {
                                        if (movie.loop) return;
                                        updatePlayerState(p => {
                                            if (!p) return null;
                                            const overlays = [...(p.stageState.movieOverlays || [])];
                                            overlays.splice(idx, 1);
                                            return { ...p, stageState: { ...p.stageState, movieOverlays: overlays } };
                                        });
                                    }}
                                />
                            );
                        })}
                        {(() => {
                            // Pre-compute arranged positions when auto-arrange is on
                            const allChars = Object.values(state.characters) as StageCharacterState[];
                            const arranged = project.autoArrangeCharacters
                                ? computeArrangedPositions(allChars.filter(c => !c.charId.startsWith('__ghost')).map(c => ({ id: c.charId, position: c.position })))
                                : null;
                            return allChars.map((char: StageCharacterState) => {
                            let transitionClass = '';
                            let animationDuration = '1s';
                            let slideStyle: React.CSSProperties = {};
                            // Apply auto-arrange offset if applicable
                            const arrangedX = arranged?.get(char.charId);
                            let positionStyle = arrangedX !== undefined
                                ? { top: '10%', left: `${arrangedX}%` }
                                : getPositionStyle(char.position);

                            // Apply tween interpolated position if active
                            const charTween = TweenManager.getCurrentValues(char.charId, 'character');
                            const hasTweenPosition = charTween && (charTween.x !== undefined || charTween.y !== undefined);
                            if (hasTweenPosition) {
                                const basePos = typeof char.position === 'object'
                                    ? char.position
                                    : { x: arrangedX ?? (char.position === 'left' ? 25 : char.position === 'right' ? 75 : char.position === 'center' ? 50 : char.position === 'off-left' ? -25 : 125), y: 10 };
                                positionStyle = {
                                    left: `${charTween.x ?? basePos.x}%`,
                                    top: `${charTween.y ?? basePos.y}%`,
                                    transform: 'translate(-50%, 0)',
                                };
                            }
                            
                            // Add centering transform for non-slide transitions
                            // Only apply centering for preset positions, not custom coordinates
                            // Tween positions already include centering above
                            const isCustomPosition = typeof char.position === 'object' || hasTweenPosition;
                            if (!char.transition || char.transition.type !== 'slide') {
                                if (!isCustomPosition) {
                                    // For preset positions, center horizontally
                                    positionStyle = { ...positionStyle, transform: 'translate3d(-50%, 0, 0)' };
                                }
                            }
                            
                            if (char.transition) {
                                const isHideTransition = char.transition.action === 'hide';

                                switch(char.transition.type) {
                                    case 'fade': transitionClass = isHideTransition ? 'transition-fade-out' : 'transition-dissolve'; break;
                                    case 'dissolve': transitionClass = isHideTransition ? 'transition-dissolve-out' : 'transition-dissolve'; break;
                                    case 'slide': 
                                        transitionClass = 'transition-slide';

                                        // Calculate start and end positions for slide (percent fallbacks)
                                        const startPos = char.transition.startPosition || char.position;
                                        const endPos = char.transition.endPosition || char.position;

                                        let startOffsetX = 0;
                                        let startOffsetY = 0;

                                        if (typeof startPos === 'object' && typeof endPos === 'object') {
                                            startOffsetX = startPos.x - endPos.x;
                                            startOffsetY = startPos.y - endPos.y;
                                        } else {
                                            // Use preset logic - calculate relative offsets from end position
                                            const startPreset = (typeof startPos === 'string' ? startPos : 'center') as VNPositionPreset;
                                            const endPreset = (typeof endPos === 'string' ? endPos : 'center') as VNPositionPreset;
                                            const presetCoords: Record<VNPositionPreset, {x: number, y: number}> = {
                                                'left': {x: 25, y: 10},
                                                'center': {x: 50, y: 10},
                                                'right': {x: 75, y: 10},
                                                'off-left': {x: -25, y: 10},
                                                'off-right': {x: 125, y: 10}
                                            };
                                            const startCoords = presetCoords[startPreset];
                                            const endCoords = presetCoords[endPreset];
                                            startOffsetX = startCoords.x - endCoords.x;
                                            startOffsetY = startCoords.y - endCoords.y;
                                        }

                                        // If the computed start equals end, for SHOW transitions pick an off-screen start so the slide visibly animates
                                        if (startOffsetX === 0 && char.transition?.action === 'show') {
                                            // choose off-left if end is left-of-center, else off-right
                                            let endX = 50;
                                            if (typeof endPos === 'object') endX = endPos.x;
                                            else if (typeof endPos === 'string') {
                                                // map presets to rough x positions
                                                const presetMap: Record<VNPositionPreset, number> = { left: 25, center: 50, right: 75, 'off-left': -25, 'off-right': 125 };
                                                endX = presetMap[endPos as VNPositionPreset] ?? 50;
                                            }
                                            startOffsetX = endX <= 50 ? -60 : 60;
                                        }

                                        // Percent fallbacks
                                        slideStyle = {
                                            '--slide-start-x': `${startOffsetX}%`,
                                            '--slide-start-y': `${startOffsetY}%`,
                                            '--slide-end-x': `0%`,
                                            '--slide-end-y': `0%`
                                        } as React.CSSProperties;

                                        // If we have stage size, compute pixel offsets for crisper motion
                                        if (stageSize && stageSize.width > 0) {
                                            const pxStartX = (startOffsetX / 100) * stageSize.width;
                                            const pxStartY = (startOffsetY / 100) * stageSize.height;
                                            slideStyle['--slide-start-px' as any] = `${pxStartX}px`;
                                            slideStyle['--slide-end-px' as any] = `0px`;
                                            slideStyle['--slide-start-py' as any] = `${pxStartY}px`;
                                            slideStyle['--slide-end-py' as any] = `0px`;
                                        }
                                        break;
                                    case 'iris-in': transitionClass = isHideTransition ? 'transition-iris-out' : 'transition-iris-in'; break;
                                    case 'wipe-right': transitionClass = isHideTransition ? 'transition-wipe-out-right' : 'transition-wipe-right'; break;
                                }
                                animationDuration = `${char.transition.duration}s`;
                            }
                            
                            // Compute per-character visual effect styles — supports multiple stacked effects
                            // Each transform-based effect gets its own nested wrapper div to avoid transform conflicts
                            // with the position centering transform on the outer div
                            const effectsList = char.visualEffects || (char as any).visualEffect ? 
                                (char.visualEffects && char.visualEffects.length > 0 
                                    ? char.visualEffects 
                                    : (char as any).visualEffect && (char as any).visualEffect.type !== 'none' 
                                        ? [(char as any).visualEffect] 
                                        : []) 
                                : [];
                            
                            // Separate effects into categories:
                            // - Transform-based: shake, bounce, float, pulse, breathing (each needs own wrapper)
                            // - Filter-based: glow, tint, silhouette (combine into one filter string)
                            // - Opacity-based: flicker (separate animation)
                            const transformEffects: Array<{style: React.CSSProperties}> = [];
                            let combinedFilter = '';
                            let combinedFilterAnimation = '';
                            let flickerAnimation = '';
                            let filterVars: Record<string, string> = {};
                            
                            for (const eff of effectsList) {
                                if (!eff || eff.type === 'none') continue;
                                const speed = eff.speed ?? 1;
                                const intensity = eff.intensity ?? 1;
                                switch (eff.type) {
                                    case 'shake': {
                                        const s: React.CSSProperties & Record<string, any> = {};
                                        s.animation = `vnCharShake ${0.15 / speed}s ease-in-out infinite`;
                                        s['--char-shake-px'] = `${2 * intensity}px`;
                                        transformEffects.push({ style: s });
                                        break;
                                    }
                                    case 'bounce': {
                                        const s: React.CSSProperties & Record<string, any> = {};
                                        s.animation = `vnCharBounce ${0.6 / speed}s ease-in-out infinite`;
                                        s['--char-bounce-h'] = `${-8 * intensity}px`;
                                        transformEffects.push({ style: s });
                                        break;
                                    }
                                    case 'float': {
                                        const s: React.CSSProperties & Record<string, any> = {};
                                        s.animation = `vnCharFloat ${2 / speed}s ease-in-out infinite`;
                                        s['--char-float-h'] = `${-10 * intensity}px`;
                                        transformEffects.push({ style: s });
                                        break;
                                    }
                                    case 'pulse': {
                                        const s: React.CSSProperties & Record<string, any> = {};
                                        s.animation = `vnCharPulse ${1 / speed}s ease-in-out infinite`;
                                        s['--char-pulse-scale'] = `${1 + 0.05 * intensity}`;
                                        transformEffects.push({ style: s });
                                        break;
                                    }
                                    case 'breathing': {
                                        const s: React.CSSProperties & Record<string, any> = {};
                                        s.animation = `vnCharBreathing ${2 / speed}s ease-in-out infinite`;
                                        s['--char-breathe-scale'] = `${1 + 0.02 * intensity}`;
                                        transformEffects.push({ style: s });
                                        break;
                                    }
                                    case 'glow':
                                        combinedFilter += ` drop-shadow(0 0 ${8 * intensity}px ${eff.color || '#FFFFFF'})`;
                                        combinedFilterAnimation = `vnCharGlow ${1.5 / speed}s ease-in-out infinite`;
                                        filterVars['--char-glow-color'] = eff.color || '#FFFFFF';
                                        filterVars['--char-glow-size'] = `${8 * intensity}px`;
                                        filterVars['--char-glow-size-max'] = `${14 * intensity}px`;
                                        break;
                                    case 'tint':
                                        if (eff.color) {
                                            const tintOpacity = 0.3 * intensity;
                                            combinedFilter += ` brightness(${1 - tintOpacity * 0.3}) sepia(${tintOpacity}) hue-rotate(${getHueFromHex(eff.color)}deg) saturate(${1 + intensity})`;
                                        }
                                        break;
                                    case 'silhouette':
                                        combinedFilter += ` brightness(0)${eff.color ? ` drop-shadow(0 0 2px ${eff.color})` : ''}`;
                                        break;
                                    case 'flicker':
                                        flickerAnimation = `vnCharFlicker ${0.1 / speed}s step-end infinite`;
                                        break;
                                }
                            }

                            // Build the filter/flicker style for the innermost content wrapper
                            const contentEffectStyle: React.CSSProperties & Record<string, any> = {};
                            if (combinedFilter) contentEffectStyle.filter = combinedFilter.trim();
                            if (combinedFilterAnimation) contentEffectStyle.animation = combinedFilterAnimation;
                            if (flickerAnimation) {
                                contentEffectStyle.animation = contentEffectStyle.animation 
                                    ? `${contentEffectStyle.animation}, ${flickerAnimation}` 
                                    : flickerAnimation;
                            }
                            Object.assign(contentEffectStyle, filterVars);
                            const hasContentEffect = combinedFilter || combinedFilterAnimation || flickerAnimation;
                            
                            // Build nested wrappers: position div > transform effect divs > filter/content div > sprites
                            const spriteContent = (
                                <>
                                    {char.isVideo && char.videoUrls ? (
                                        char.videoUrls.map((url, index) => (
                                            <video 
                                                key={index} 
                                                src={url} 
                                                autoPlay 
                                                muted 
                                                loop={char.videoLoop} 
                                                playsInline
                                                className="absolute top-0 left-0 w-full h-full object-contain" 
                                                style={{ zIndex: index }}
                                            />
                                        ))
                                    ) : (
                                        char.imageUrls.map((url, index) => (
                                            <img 
                                                key={index} 
                                                src={url} 
                                                alt="" 
                                                className="absolute top-0 left-0 w-full h-full object-contain" 
                                                style={{ zIndex: index }}
                                            />
                                        ))
                                    )}
                                </>
                            );

                            // Wrap with filter/flicker effects
                            let wrappedContent = hasContentEffect
                                ? <div className="w-full h-full relative" style={contentEffectStyle}>{spriteContent}</div>
                                : spriteContent;

                            // Wrap with transform-based effects (each in its own div to avoid conflicts)
                            // Reverse so the first listed effect is outermost
                            for (let tIdx = transformEffects.length - 1; tIdx >= 0; tIdx--) {
                                wrappedContent = (
                                    <div className="w-full h-full relative" style={transformEffects[tIdx].style}>
                                        {wrappedContent}
                                    </div>
                                );
                            }
                            
                            // Apply tween scale and opacity to character container
                            const charScale = charTween?.scale ?? (char as any).scale ?? 1;
                            const charOpacity = charTween?.opacity;
                            const charInverted = (char as any).inverted ?? false;

                            // Build transform: combine position, scale, and inversion
                            let transformStr = positionStyle.transform || '';
                            if (charScale !== 1 || charInverted) {
                                const scaleX = charInverted ? -1 : 1;
                                transformStr = `${transformStr} scale(${scaleX * charScale}, ${charScale})`.trim();
                            }

                            return (
                                <div
                                    key={`${char.charId}-${char.expressionId}-${char.imageUrls.join(',')}-${char.transition?.action ?? 'none'}`}
                                    className={`absolute h-[90%] w-auto aspect-[3/4] ${transitionClass} transition-base`}
                                    style={{
                                        ...positionStyle, animationDuration, ...slideStyle, zIndex: 5,
                                        ...(transformStr ? { transform: transformStr, transformOrigin: 'center bottom' } : {}),
                                        // A running/forwards-filled entrance animation animates opacity and would
                                        // override inline opacity, so disable it when a tween controls opacity.
                                        ...(charOpacity !== undefined ? { opacity: charOpacity, animationName: 'none' } : {}),
                                    }}
                                >
                                    {wrappedContent}
                                </div>
                            );
                        });
                        })()}
                        {/* Particle System - above characters (z-5), below overlays */}
                        {(() => {
                            const pEffects = state.particleEffects;
                            const hasParticles = pEffects && Object.keys(pEffects).length > 0;
                            if (hasParticles) {
                                console.log('[LivePreview] Rendering ParticleSystem:', Object.keys(pEffects), 'stageSize:', stageSize.width, 'x', stageSize.height);
                                return (
                                    <ParticleSystem
                                        effects={pEffects}
                                        width={stageSize.width}
                                        height={stageSize.height}
                                    />
                                );
                            }
                            return null;
                        })()}
                        {state.textOverlays.map((overlay: TextOverlay) => (
                            <TextOverlayElement
                                key={overlay.id}
                                overlay={overlay}
                                stageSize={stageSize}
                            />
                        ))}
                        {state.imageOverlays.map((overlay: ImageOverlay) => (
                            <ImageOverlayElement
                                key={overlay.id}
                                overlay={overlay}
                                stageSize={stageSize}
                            />
                        ))}
                        {state.buttonOverlays.map((overlay: ButtonOverlay) => (
                            <ButtonOverlayElement 
                                key={overlay.id}
                                overlay={overlay} 
                                onAction={handleUIAction} 
                                playSound={playSound} 
                                onCommitVariables={commitUiVariablesToPlayerState}
                                onAdvance={overlay.waitForClick ? () => {
                                    updatePlayerState(p => {
                                        if (!p) return null;
                                        return {
                                            ...p,
                                            currentIndex: p.currentIndex + 1,
                                            uiState: { ...p.uiState, isWaitingForInput: false }
                                        };
                                    });
                                } : undefined}
                            />
                        ))}
                        {(state.imageMapOverlays || []).map((overlay: ImageMapOverlay) => (
                            <ImageMapOverlayElement
                                key={overlay.id}
                                overlay={overlay}
                                onAction={handleUIAction}
                                onCommitVariables={commitUiVariablesToPlayerState}
                                evaluateConditions={evaluateConditions}
                                variables={playerState?.variables || {}}
                                onAdvance={overlay.waitForClick ? () => {
                                    updatePlayerState(p => {
                                        if (!p) return null;
                                        return {
                                            ...p,
                                            currentIndex: p.currentIndex + 1,
                                            uiState: { ...p.uiState, isWaitingForInput: false }
                                        };
                                    });
                                } : undefined}
                            />
                        ))}
                    </div>
                </div>
                <div className="absolute inset-0 pointer-events-none" style={tintStyle}></div>
            </div>
        );
    };

    // Credit scroll content — measures its own height to compute proper scroll distance
    const CreditScrollContent: React.FC<{
        command: CreditRollCommand;
        hasBgs: boolean;
        hasMedia: boolean;
        onFinish: () => void;
    }> = ({ command, hasBgs, hasMedia, onFinish }) => {
        const contentRef = useRef<HTMLDivElement>(null);
        const containerRef = useRef<HTMLDivElement>(null);
        const [animStyle, setAnimStyle] = useState<React.CSSProperties>({});
        const finishedRef = useRef(false);

        useEffect(() => {
            finishedRef.current = false;
            // Wait a frame for layout so we can measure content height
            const raf = requestAnimationFrame(() => {
                const content = contentRef.current;
                const container = containerRef.current;
                if (!content || !container) return;

                const contentHeight = content.scrollHeight;
                const containerHeight = container.clientHeight;
                // Total distance: start below viewport (containerHeight) + scroll through all content past top
                const totalDistance = containerHeight + contentHeight;
                const speed = (command as any).scrollSpeed || 60; // px/sec
                // Calculate duration from speed, but cap at the max duration
                const calcDuration = totalDistance / speed;
                const maxDuration = command.duration || 300;
                const finalDuration = Math.min(calcDuration, maxDuration);

                setAnimStyle({
                    animation: `credit-scroll-dynamic ${finalDuration}s linear forwards`,
                    // Use CSS custom properties for start and end translate values (in pixels)
                    ['--credit-scroll-start' as any]: `${containerHeight}px`,
                    ['--credit-scroll-end' as any]: `-${contentHeight}px`,
                });
            });
            return () => cancelAnimationFrame(raf);
        }, [command]);

        const handleAnimEnd = useCallback((e: React.AnimationEvent) => {
            if (e.target === e.currentTarget && !finishedRef.current) {
                finishedRef.current = true;
                onFinish();
            }
        }, [onFinish]);

        // Fallback timer in case animationend doesn't fire
        useEffect(() => {
            const speed = (command as any).scrollSpeed || 60;
            const maxDuration = command.duration || 300;
            // Give a generous timeout (maxDuration + 5s buffer)
            const timeout = window.setTimeout(() => {
                if (!finishedRef.current) {
                    finishedRef.current = true;
                    onFinish();
                }
            }, (maxDuration + 5) * 1000);
            return () => clearTimeout(timeout);
        }, [command, onFinish]);

        return (
            <div ref={containerRef} className="absolute inset-0 overflow-hidden z-[2]">
                <style>{`
                    @keyframes credit-scroll-dynamic {
                        from { transform: translateY(var(--credit-scroll-start, 100%)); }
                        to { transform: translateY(var(--credit-scroll-end, -100%)); }
                    }
                `}</style>
                <div
                    ref={contentRef}
                    className="text-center px-8 w-full"
                    style={{
                        color: command.textColor || '#FFFFFF',
                        textShadow: (hasBgs || hasMedia) ? '0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)' : 'none',
                        willChange: 'transform',
                        ...animStyle,
                    }}
                    onAnimationEnd={handleAnimEnd}
                >
                    {command.entries.map((entry, i) =>
                        entry.kind === 'heading' ? (
                            <h2 key={i} className="text-2xl font-bold mt-8 mb-4" style={{ color: '#FFD700' }}>{entry.label}</h2>
                        ) : (
                            <div key={i} className="mb-2">
                                <span className="text-sm opacity-70">{entry.label}</span>
                                {entry.value && <><br /><span className="text-lg">{entry.value}</span></>}
                            </div>
                        )
                    )}
                </div>
            </div>
        );
    };

    // Credit Roll overlay component with optional CG background gallery
    const CreditRollOverlay: React.FC<{
        command: CreditRollCommand;
        project: VNProject;
        assetResolver: (assetId: VNID | null, type: 'audio' | 'video' | 'image') => string | null;
        getAssetMetadata: (assetId: VNID | null, type: 'image') => { isVideo: boolean; loop: boolean };
        onFinish: () => void;
    }> = ({ command, project, assetResolver, getAssetMetadata, onFinish }) => {
        const bgs = command.backgrounds || [];
        const mediaItems = command.media || [];
        const hasBgs = bgs.length > 0;
        const hasMedia = mediaItems.length > 0;
        const [bgIndex, setBgIndex] = useState(0);
        const [prevBgIndex, setPrevBgIndex] = useState<number | null>(null);
        const [transitioning, setTransitioning] = useState(false);
        const bgTimerRef = useRef<number | null>(null);
        const bgTransTimerRef = useRef<number | null>(null);
        const [elapsed, setElapsed] = useState(0);
        const startTimeRef = useRef(Date.now());

        // Track elapsed time for timed media items
        useEffect(() => {
            if (!hasMedia) return;
            startTimeRef.current = Date.now();
            const interval = window.setInterval(() => {
                setElapsed((Date.now() - startTimeRef.current) / 1000);
            }, 200);
            return () => clearInterval(interval);
        }, [hasMedia]);

        // Cycle backgrounds
        useEffect(() => {
            if (!hasBgs || bgs.length <= 1) return;
            const scheduleNext = (idx: number) => {
                const slide = bgs[idx];
                const displayMs = (slide?.displayDuration || 5) * 1000;
                bgTimerRef.current = window.setTimeout(() => {
                    const nextIdx = (idx + 1) % bgs.length;
                    const nextSlide = bgs[nextIdx];
                    const transDur = (nextSlide?.transitionDuration || 0.5) * 1000;
                    const transType = nextSlide?.transition || 'fade';

                    if (transType === 'instant' || transDur === 0) {
                        setBgIndex(nextIdx);
                        scheduleNext(nextIdx);
                    } else {
                        setPrevBgIndex(idx);
                        setBgIndex(nextIdx);
                        setTransitioning(true);
                        bgTransTimerRef.current = window.setTimeout(() => {
                            setTransitioning(false);
                            setPrevBgIndex(null);
                            scheduleNext(nextIdx);
                        }, transDur);
                    }
                }, displayMs);
            };
            scheduleNext(bgIndex);
            return () => {
                if (bgTimerRef.current) clearTimeout(bgTimerRef.current);
                if (bgTransTimerRef.current) clearTimeout(bgTransTimerRef.current);
            };
        }, [hasBgs, bgs.length]); // Only re-run if backgrounds change

        const renderBgSlide = (slide: CreditBackground, opacity: number, transitionDuration: number) => {
            const url = assetResolver(slide.assetId, 'image');
            if (!url) return null;
            const meta = getAssetMetadata(slide.assetId, 'image');
            const isCustom = slide.objectFit === 'custom';
            const style: React.CSSProperties = isCustom ? {
                position: 'absolute',
                left: `${slide.x ?? 0}%`,
                top: `${slide.y ?? 0}%`,
                width: `${slide.width ?? 100}%`,
                height: `${slide.height ?? 100}%`,
                objectFit: 'fill' as const,
                opacity: (slide.opacity ?? 1) * opacity,
                transition: transitionDuration > 0 ? `opacity ${transitionDuration}s ease-in-out` : 'none',
            } : {
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: (slide.objectFit || 'cover') as React.CSSProperties['objectFit'],
                opacity: (slide.opacity ?? 1) * opacity,
                transition: transitionDuration > 0 ? `opacity ${transitionDuration}s ease-in-out` : 'none',
            };
            if (meta.isVideo) {
                return <video src={url} autoPlay muted loop={meta.loop} playsInline style={style} />;
            }
            return <img src={url} alt="" style={style} />;
        };

        const currentSlide = hasBgs ? bgs[bgIndex] : null;
        const prevSlide = prevBgIndex !== null && hasBgs ? bgs[prevBgIndex] : null;
        const transDur = currentSlide?.transitionDuration || 0.5;

        return (
            <div
                className="absolute inset-0 z-40 flex items-end justify-center overflow-hidden"
                style={{ backgroundColor: command.backgroundColor || '#000000FF', cursor: command.allowSkip ? 'pointer' : 'default' }}
                onClick={() => {
                    if (!command.allowSkip) return;
                    onFinish();
                }}
            >
                {/* Background slides */}
                {hasBgs && (
                    <div className="absolute inset-0 z-0">
                        {prevSlide && transitioning && renderBgSlide(prevSlide, 1, 0)}
                        {currentSlide && renderBgSlide(currentSlide, transitioning ? (currentSlide.transition === 'instant' ? 1 : 1) : 1, transitioning ? transDur : 0)}
                        {/* Use a crossfade overlay approach: the new slide fades in on top */}
                        {transitioning && currentSlide && currentSlide.transition !== 'instant' && (
                            <div
                                className="absolute inset-0"
                                style={{
                                    backgroundColor: currentSlide.transition === 'dissolve' ? 'transparent' : command.backgroundColor || '#000000FF',
                                    animation: `credit-bg-fade-in ${transDur}s ease-in-out both`,
                                }}
                            />
                        )}
                    </div>
                )}

                {/* Semi-transparent overlay for text readability when backgrounds are present */}
                {hasBgs && (
                    <div className="absolute inset-0 z-[1]" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} />
                )}

                {/* Foreground media items (images/videos with positioning and timed visibility) */}
                {hasMedia && mediaItems.map((item, idx) => {
                    const url = assetResolver(item.assetId, 'image');
                    if (!url) return null;
                    const meta = getAssetMetadata(item.assetId, 'image');
                    const showAt = item.showAt || 0;
                    const hideAt = item.hideAt || 0;
                    const isVisible = elapsed >= showAt && (hideAt <= 0 || elapsed < hideAt);
                    const isFading = item.transition === 'fade';
                    const itemOpacity = isVisible ? (item.opacity ?? 1) : 0;
                    const isCustomItem = item.objectFit === 'custom';
                    const mediaStyle: React.CSSProperties = isCustomItem ? {
                        position: 'absolute',
                        left: `${item.x}%`,
                        top: `${item.y}%`,
                        width: `${item.width}%`,
                        height: `${item.height}%`,
                        objectFit: 'fill' as const,
                        opacity: itemOpacity,
                        transition: isFading ? `opacity ${item.transitionDuration || 0.5}s ease-in-out` : 'none',
                        zIndex: 1,
                        pointerEvents: 'none',
                    } : {
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: (item.objectFit || 'cover') as React.CSSProperties['objectFit'],
                        opacity: itemOpacity,
                        transition: isFading ? `opacity ${item.transitionDuration || 0.5}s ease-in-out` : 'none',
                        zIndex: 1,
                        pointerEvents: 'none',
                    };
                    if (meta.isVideo) {
                        return <video key={`credit-media-${idx}`} src={url} autoPlay muted loop playsInline style={mediaStyle} />;
                    }
                    return <img key={`credit-media-${idx}`} src={url} alt="" style={mediaStyle} />;
                })}

                {/* Credits scroll - uses dynamic measurement for proper full scroll */}
                <CreditScrollContent command={command} hasBgs={hasBgs} hasMedia={hasMedia} onFinish={onFinish} />

                {/* Skip hint */}
                {command.allowSkip && (
                    <div className="absolute bottom-4 right-4 text-xs opacity-50 z-[3]" style={{ color: command.textColor || '#FFFFFF' }}>
                        Click to skip
                    </div>
                )}
            </div>
        );
    };

    // History / Backlog component
    const HistoryPanel: React.FC<{ history: HistoryEntry[], onClose: () => void, onJumpTo?: (index: number) => void }> = ({ history, onClose, onJumpTo }) => {
        const scrollRef = React.useRef<HTMLDivElement>(null);
        
        // Auto-scroll to bottom on open
        React.useEffect(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }, []);
        
        return (
            <div className="absolute inset-0 bg-black z-50 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60"
                    style={{ background: 'linear-gradient(180deg, rgb(15,23,42) 0%, rgb(15,23,42) 100%)' }}>
                    <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h2 className="text-white text-xl font-bold tracking-wide">Text History</h2>
                        <span className="text-slate-500 text-sm">({history.length} entries)</span>
                    </div>
                    <button 
                        onClick={onClose}
                        className="text-slate-300 hover:text-white text-sm px-4 py-2 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-600/40 rounded-lg transition-colors"
                    >
                        Close (H / ESC)
                    </button>
                </div>
                
                {/* History content */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            <p className="text-sm">No history yet. Play through some dialogue first.</p>
                        </div>
                    ) : (
                        history.map((entry, index) => (
                            <div 
                                key={index}
                                className={`group p-3 rounded-lg transition-colors ${
                                    entry.type === 'choice' 
                                        ? 'bg-blue-900/40 border-l-3 border-blue-500/60 hover:bg-blue-900/50' 
                                        : entry.type === 'textInput'
                                        ? 'bg-emerald-900/40 border-l-3 border-emerald-500/60 hover:bg-emerald-900/50'
                                        : 'bg-slate-800/50 hover:bg-slate-800/60'
                                }`}
                                style={{ cursor: onJumpTo ? 'pointer' : 'default' }}
                                onClick={() => onJumpTo?.(index)}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Type indicator */}
                                    <div className="mt-0.5 flex-shrink-0">
                                        {entry.type === 'dialogue' && (
                                            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                            </svg>
                                        )}
                                        {entry.type === 'choice' && (
                                            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        )}
                                        {entry.type === 'textInput' && (
                                            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        )}
                                    </div>
                                    
                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        {entry.type === 'dialogue' && entry.characterName && entry.characterName !== 'Narrator' && (
                                            <div className="font-semibold text-sm mb-0.5" style={{ color: entry.characterColor || '#94a3b8' }}>
                                                {entry.characterName}
                                            </div>
                                        )}
                                        <div className="text-white/90 text-sm leading-relaxed">
                                            {entry.type === 'choice' ? entry.choiceText || entry.text : 
                                             entry.type === 'textInput' ? `"${entry.inputValue}"` : entry.text}
                                        </div>
                                        {entry.type === 'choice' && (
                                            <div className="text-blue-400/70 text-xs mt-1 font-medium">Selected choice</div>
                                        )}
                                        {entry.type === 'textInput' && (
                                            <div className="text-emerald-400/70 text-xs mt-1 font-medium">Text input</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const renderPlayerUI = () => {
        if (!playerState || playerState.mode !== 'playing') return null;
        const { uiState } = playerState;
        
        // Check if current HUD screen has showDialogue enabled
        const currentHudScreenId = hudStack.length > 0 ? hudStack[hudStack.length - 1] : project.ui.gameHudScreenId;
        const currentHudScreen = currentHudScreenId ? project.uiScreens[currentHudScreenId] : null;
        const shouldShowDialogueOnHud = currentHudScreen?.showDialogue;
        
        return <>
            {uiState.showHistory && (
                <HistoryPanel 
                    history={playerState.history} 
                    onClose={() => updatePlayerState(p => p ? { ...p, uiState: { ...p.uiState, showHistory: false } } : null)} 
                />
            )}
            {uiState.movieUrl && (
                <div
                    className="absolute inset-0 bg-black z-40 flex flex-col items-center justify-center text-white"
                    onClick={() => {
                        if (!uiState.isWaitingForInput) return;
                        updatePlayerState(p => p ? {...p, currentIndex: p.currentIndex + 1, uiState: {...p.uiState, isWaitingForInput: false, movieUrl: null, movieLoop: false}} : null);
                    }}
                >
                    <video
                        src={uiState.movieUrl}
                        autoPlay
                        loop={uiState.movieLoop ?? false}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onEnded={() => {
                            // If looping, onEnded won't fire (browser handles loop). Just in case:
                            if (uiState.movieLoop) return;
                            if (uiState.isWaitingForInput) {
                                updatePlayerState(p => p ? {...p, currentIndex: p.currentIndex + 1, uiState: {...p.uiState, isWaitingForInput: false, movieUrl: null, movieLoop: false}} : null);
                            } else {
                                updatePlayerState(p => p ? {...p, uiState: {...p.uiState, movieUrl: null, movieLoop: false}} : null);
                            }
                        }}
                    />
                    {uiState.isWaitingForInput && (
                        <div className="absolute bottom-4 right-4 text-xs opacity-50 pointer-events-none">Click to skip</div>
                    )}
                </div>
            )}
            {activeCreditRoll && (
                <CreditRollOverlay
                    command={activeCreditRoll}
                    project={project}
                    assetResolver={assetResolver}
                    getAssetMetadata={getAssetMetadata}
                    onFinish={() => {
                        const onComplete = activeCreditRoll.onComplete;
                        setActiveCreditRoll(null);
                        if (onComplete === 'title') {
                            // Full quit-to-title: stop audio, null playerState, restore title screen
                            const audio = musicAudioRef.current;
                            if (audio) { audio.pause(); audio.currentTime = 0; audio.src = ''; }
                            stopAllSfx();
                            updatePlayerState(null);
                            setHudStack([]);
                            if (project.ui.titleScreenId) setScreenStack([project.ui.titleScreenId]);
                        } else {
                            updatePlayerState(p => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
                        }
                    }}
                />
            )}
            {/* Show dialogue if: 1) dialogue exists, AND 2) either no HUD screen or HUD screen has showDialogue enabled */}
            {uiState.dialogue && (!currentHudScreen || shouldShowDialogueOnHud) && (
                <>
                    {/* Quick menu buttons — Skip/Back/Auto/Log */}
                    {(() => {
                        const qmPosition = project.ui.quickMenuPosition ?? 'above-dialogue';
                        if (qmPosition === 'hidden') return null;
                        const qmColor = project.ui.quickMenuColor ?? '#0f172a';
                        const qmOpacity = project.ui.quickMenuOpacity ?? 75;
                        const qmRadius = project.ui.quickMenuBorderRadius ?? 4;
                        const qmBg = hexToRgba(qmColor, qmOpacity);
                        const qmBgDisabled = hexToRgba(qmColor, Math.max(10, qmOpacity - 35));

                        /* ── Percentage-based layout (matching InGameUIEditor) ── */
                        const lpGameW = project.gameResolution?.width || 1920;
                        const lpGameH = project.gameResolution?.height || 1080;
                        const dlgW = project.ui.dialogueBoxWidth ?? 100;
                        const dlgH = project.ui.dialogueBoxHeight ? (project.ui.dialogueBoxHeight * 100 / lpGameH) : 20;
                        const dlgX = project.ui.dialogueBoxX ?? ((100 - dlgW) / 2);
                        const dlgBm = (project.ui.dialogueBoxBottomMargin ?? 20) * 100 / lpGameH;
                        const qmWPct = project.ui.quickMenuWidth ?? 40;
                        const qmHPct = project.ui.quickMenuHeight ?? 4;
                        // Mirror the reservation logic from the dialogue-box renderer:
                        // a bottom Quick Menu preset pushes the dialogue up so the menu
                        // can sit at the screen edge without being covered.
                        // Skip reservation if quickMenuFloatOverDialogue is enabled.
                        const isBottomQmPreset = qmPosition === 'bottom-right' || qmPosition === 'bottom-left';
                        const shouldFloatQm = project.ui.quickMenuFloatOverDialogue ?? false;
                        const qmBottomReservePct = (!shouldFloatQm && isBottomQmPreset && project.ui.quickMenuY === undefined)
                            ? (qmHPct + 2)
                            : 0;
                        const dlgY = project.ui.dialogueBoxY ?? (100 - dlgH - dlgBm - qmBottomReservePct);

                        const getDefaultPos = () => {
                            if (qmPosition === 'top-right') return { x: 100 - qmWPct - 1, y: 1 };
                            if (qmPosition === 'top-left') return { x: 1, y: 1 };
                            if (qmPosition === 'bottom-right') return { x: 100 - qmWPct - 1, y: 100 - qmHPct - 1 };
                            if (qmPosition === 'bottom-left') return { x: 1, y: 100 - qmHPct - 1 };
                            return { x: dlgX, y: dlgY - qmHPct - 1 };
                        };
                        const defPos = getDefaultPos();
                        const qmX = project.ui.quickMenuX ?? defPos.x;
                        const qmY = project.ui.quickMenuY ?? defPos.y;
                        
                        // Increase z-index when float is enabled or for bottom presets to ensure visibility above dialogue
                        const qmZIndex = shouldFloatQm || isBottomQmPreset ? 50 : 25;

                        return (
                            <div className="flex items-center justify-center gap-2" 
                                style={{
                                    position: 'absolute' as const,
                                    left: `${qmX}%`,
                                    top: `${qmY}%`,
                                    width: `${qmWPct}%`,
                                    height: `${qmHPct}%`,
                                    pointerEvents: 'none',
                                    zIndex: qmZIndex,
                                }}
                            >
                                <div className="flex items-center gap-1.5" style={{ pointerEvents: 'auto' }}>
                                    {/* Skip Backward button */}
                                    {(project.ui.quickMenuShowSkipBackward !== false) && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleSkipBackward(); }}
                                        disabled={playerState.history.length === 0}
                                        className="flex items-center gap-1 font-medium transition-all"
                                        style={{
                                            borderRadius: scalePx(qmRadius),
                                            padding: `${scalePx(4)} ${scalePx(10)}`,
                                            fontSize: scalePx(12),
                                            background: playerState.history.length > 0 ? qmBg : qmBgDisabled,
                                            border: '1px solid rgba(148,163,184,0.2)',
                                            color: playerState.history.length > 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)',
                                            backdropFilter: 'blur(4px)',
                                            cursor: playerState.history.length > 0 ? 'pointer' : 'default',
                                        }}
                                        title="Skip Backward (Arrow Up)"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                        </svg>
                                        Back
                                    </button>
                                    )}

                                    {/* History button */}
                                    {(project.ui.quickMenuShowLog !== false) && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); updatePlayerState(pp => pp ? { ...pp, uiState: { ...pp.uiState, showHistory: true } } : null); }}
                                        className="flex items-center gap-1 font-medium transition-all hover:brightness-125"
                                        style={{
                                            borderRadius: scalePx(qmRadius),
                                            padding: `${scalePx(4)} ${scalePx(10)}`,
                                            fontSize: scalePx(12),
                                            background: qmBg,
                                            border: '1px solid rgba(148,163,184,0.2)',
                                            color: 'rgba(255,255,255,0.8)',
                                            backdropFilter: 'blur(4px)',
                                        }}
                                        title="Text History (H)"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Log
                                    </button>
                                    )}

                                    {/* Auto-advance toggle */}
                                    {(project.ui.quickMenuShowAutoAdvance !== false) && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setSettings(s => ({ ...s, autoAdvance: !s.autoAdvance })); }}
                                        className="flex items-center gap-1 font-medium transition-all"
                                        style={{
                                            borderRadius: scalePx(qmRadius),
                                            padding: `${scalePx(4)} ${scalePx(10)}`,
                                            fontSize: scalePx(12),
                                            background: settings.autoAdvance ? 'rgba(14,165,233,0.3)' : qmBg,
                                            border: `1px solid ${settings.autoAdvance ? 'rgba(14,165,233,0.5)' : 'rgba(148,163,184,0.2)'}`,
                                            color: settings.autoAdvance ? 'rgba(125,211,252,0.95)' : 'rgba(255,255,255,0.8)',
                                            backdropFilter: 'blur(4px)',
                                        }}
                                        title="Auto-Advance"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Auto
                                    </button>
                                    )}

                                    {/* Skip Forward button */}
                                    {settings.enableSkip && (project.ui.quickMenuShowSkipForward !== false) && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); updatePlayerState(pp => pp ? { ...pp, uiState: { ...pp.uiState, isSkipping: !pp.uiState.isSkipping } } : null); }}
                                            className="flex items-center gap-1 font-medium transition-all"
                                            style={{
                                                borderRadius: scalePx(qmRadius),
                                                padding: `${scalePx(4)} ${scalePx(10)}`,
                                                fontSize: scalePx(12),
                                                background: uiState.isSkipping ? 'rgba(239,68,68,0.3)' : qmBg,
                                                border: `1px solid ${uiState.isSkipping ? 'rgba(239,68,68,0.5)' : 'rgba(148,163,184,0.2)'}`,
                                                color: uiState.isSkipping ? 'rgba(252,165,165,0.95)' : 'rgba(255,255,255,0.8)',
                                                backdropFilter: 'blur(4px)',
                                            }}
                                            title="Skip Forward (Ctrl)"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                            </svg>
                                            Skip
                                        </button>
                                    )}

                                    {/* Save button */}
                                    {(project.ui.quickMenuShowSave !== false) && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleUIAction({ type: UIActionType.SaveGame, slotNumber: 1 }); }}
                                        className="flex items-center gap-1 font-medium transition-all hover:brightness-125"
                                        style={{
                                            borderRadius: scalePx(qmRadius),
                                            padding: `${scalePx(4)} ${scalePx(10)}`,
                                            fontSize: scalePx(12),
                                            background: qmBg,
                                            border: '1px solid rgba(148,163,184,0.2)',
                                            color: 'rgba(255,255,255,0.8)',
                                            backdropFilter: 'blur(4px)',
                                        }}
                                        title="Save Game"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V3" />
                                        </svg>
                                        Save
                                    </button>
                                    )}

                                    {/* Load button */}
                                    {(project.ui.quickMenuShowLoad !== false) && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleUIAction({ type: UIActionType.LoadGame, slotNumber: 1 }); }}
                                        className="flex items-center gap-1 font-medium transition-all hover:brightness-125"
                                        style={{
                                            borderRadius: scalePx(qmRadius),
                                            padding: `${scalePx(4)} ${scalePx(10)}`,
                                            fontSize: scalePx(12),
                                            background: qmBg,
                                            border: '1px solid rgba(148,163,184,0.2)',
                                            color: 'rgba(255,255,255,0.8)',
                                            backdropFilter: 'blur(4px)',
                                        }}
                                        title="Load Game"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M9 9l3 3m0 0l3-3m-3 3V1" />
                                        </svg>
                                        Load
                                    </button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                    <DialogueBox dialogue={uiState.dialogue} settings={settings} projectUI={project.ui} onFinished={handleDialogueAdvance} variables={playerState.variables} project={project} />
                </>
            )}
            {uiState.choices && <ChoiceMenu choices={uiState.choices} projectUI={project.ui} onSelect={handleChoiceSelect} variables={playerState.variables} project={project} />}
            {uiState.textInput && <TextInputForm textInput={uiState.textInput} onSubmit={handleTextInputSubmit} variables={playerState.variables} project={project} projectUI={project.ui} />}
            {activeFlashRef.current && <div 
                key={activeFlashRef.current.key}
                className="absolute inset-0 z-50 pointer-events-none" 
                style={{ backgroundColor: activeFlashRef.current.color, animation: `flash-anim ${activeFlashRef.current.duration}s ease-in-out` }}
                onAnimationEnd={(e) => {
                    // Only handle this animation event, not bubbled events from children
                    if (e.target === e.currentTarget) {
                        activeFlashRef.current = null;
                        setFlashTrigger(prev => prev + 1);
                    }
                }}
            ></div>}
        </>
    };

    const currentScreenId = (!playerState || playerState.mode === 'paused')
        ? (screenStack.length > 0 ? screenStack[screenStack.length - 1] : null)
        : null;

    const hudScreenId = playerState?.mode === 'playing'
        ? (hudStack.length > 0 ? hudStack[hudStack.length - 1] : project.ui.gameHudScreenId)
        : null;

    const activeMenuScreen = currentScreenId ? project.uiScreens[currentScreenId] : null;
    const activeHudScreen = hudScreenId ? project.uiScreens[hudScreenId] : null;

    const activeOverlayEffects: VNScreenOverlayEffect[] = normalizeOverlayEffects([
        ...(playerState?.stageState.screen.overlayEffects ?? []),
        ...(activeHudScreen?.effects ?? []),
        ...(activeMenuScreen?.effects ?? []),
    ]);

    // Use fallback dimensions if stageSize hasn't been measured yet (width/height are 0)
    const overlayWidth = (stageSize?.width && stageSize.width > 0) ? stageSize.width : 1280;
    const overlayHeight = (stageSize?.height && stageSize.height > 0) ? stageSize.height : 720;

    const handleClose = () => {
        // Immediately stop music without fade
        const audio = musicAudioRef.current;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.src = '';
        }
        // Immediately stop ambient noise
        const ambientAudio = ambientNoiseAudioRef.current;
        if (ambientAudio) {
            ambientAudio.pause();
            ambientAudio.currentTime = 0;
            ambientAudio.src = '';
        }
        // Clear any fade intervals
        if (audioFadeInterval.current) {
            clearInterval(audioFadeInterval.current);
            audioFadeInterval.current = null;
        }
        if (ambientFadeInterval.current) {
            clearInterval(ambientFadeInterval.current);
            ambientFadeInterval.current = null;
        }
        stopAllSfx();
        
        // Stop all videos
        const allVideos = document.querySelectorAll('video');
        allVideos.forEach(video => {
            video.pause();
            video.src = '';
            video.load();
        });
        
        onClose();
    };

    // Cleanup effect when component unmounts
    useEffect(() => {
        return () => {
            // Ensure all audio stops when component unmounts
            const audio = musicAudioRef.current;
            if (audio) {
                audio.pause();
                audio.src = '';
            }
            const ambientAudio = ambientNoiseAudioRef.current;
            if (ambientAudio) {
                ambientAudio.pause();
                ambientAudio.src = '';
            }
            if (audioFadeInterval.current) {
                clearInterval(audioFadeInterval.current);
            }
            if (ambientFadeInterval.current) {
                clearInterval(ambientFadeInterval.current);
            }
            // Stop all SFX
            sfxSourceNodesRef.current.forEach(src => {
                try { src.stop(); } catch (e) {}
            });
            sfxSourceNodesRef.current = [];
            
            // Clear all active effect timeouts (shake, tint, etc.)
            activeEffectTimeoutsRef.current.forEach(timeoutId => {
                try { clearTimeout(timeoutId); } catch (e) {}
            });
            activeEffectTimeoutsRef.current = [];
            
            // Cancel all active tweens
            TweenManager.cancelAll();
            
            // Stop all videos (including background videos on screens)
            const allVideos = document.querySelectorAll('video');
            allVideos.forEach(video => {
                video.pause();
                video.src = '';
                video.load();
            });
        };
    }, []);

    if (!titleScreenId) {
        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center text-white p-8 text-center">
                <h2 className="text-2xl text-red-500 font-bold mb-4">Playback Error</h2>
                <p className="max-w-md">Could not start the game because no valid Title Screen is set. Please ensure a Title Screen exists and is configured in the Project Settings.</p>
                <button onClick={handleClose} className="mt-8 bg-[var(--bg-tertiary)] hover:bg-[var(--accent-purple)] px-6 py-2 rounded-lg font-bold">
                    Return to Editor
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
            <style>{`
                @keyframes elementTransitionfade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes elementTransitionslideUp {
                    from { opacity: 0; transform: translate(-50%, 20%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                @keyframes elementTransitionslideDown {
                    from { opacity: 0; transform: translate(-50%, -70%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                @keyframes elementTransitionslideLeft {
                    from { opacity: 0; transform: translate(-20%, -50%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                @keyframes elementTransitionslideRight {
                    from { opacity: 0; transform: translate(-80%, -50%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                @keyframes elementTransitionscale {
                    from { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
                
                /* Screen IN transitions */
                @keyframes screenTransitionfade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes screenTransitionslideUp {
                    from { opacity: 0; transform: translateY(100%); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes screenTransitionslideDown {
                    from { opacity: 0; transform: translateY(-100%); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes screenTransitionslideLeft {
                    from { opacity: 0; transform: translateX(100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes screenTransitionslideRight {
                    from { opacity: 0; transform: translateX(-100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes screenTransitioncrossfade {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                
                /* Screen OUT transitions */
                @keyframes screenTransitionfadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes screenTransitioncrossfadeOut {
                    from { opacity: 1; }
                    to { opacity: 1; }
                }
                @keyframes screenTransitionslideUpOut {
                    from { opacity: 1; transform: translateY(0); }
                    to { opacity: 0; transform: translateY(-100%); }
                }
                @keyframes screenTransitionslideDownOut {
                    from { opacity: 1; transform: translateY(0); }
                    to { opacity: 0; transform: translateY(100%); }
                }
                @keyframes screenTransitionslideLeftOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(-100%); }
                }
                @keyframes screenTransitionslideRightOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(100%); }
                }

                /* Runtime effects (editor + standalone) */
                @keyframes shake {
                    0%, 100% { transform: translate(0, 0); }
                    25% { transform: translate(var(--shake-intensity-x, 5px), var(--shake-intensity-y, 5px)); }
                    50% { transform: translate(calc(-1 * var(--shake-intensity-x, 5px)), calc(-1 * var(--shake-intensity-y, 5px))); }
                    75% { transform: translate(var(--shake-intensity-x, 5px), calc(-1 * var(--shake-intensity-y, 5px))); }
                }
                .shake {
                    animation: shake 0.2s ease-in-out infinite;
                }

                @keyframes flash-anim {
                    0%, 100% { opacity: 0; }
                    50% { opacity: 0.9; }
                }

                .vnfx-canvas {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                }

                .vnfx-scanlines {
                    position: absolute;
                    inset: 0;
                    background: repeating-linear-gradient(
                        to bottom,
                        rgba(0, 0, 0, 0.35) 0px,
                        rgba(0, 0, 0, 0.35) 1px,
                        rgba(0, 0, 0, 0) 3px,
                        rgba(0, 0, 0, 0) 4px
                    );
                    mix-blend-mode: overlay;
                    animation: vnfx-scanlines-scroll 6s linear infinite;
                }
                @keyframes vnfx-scanlines-scroll {
                    from { background-position: 0 0; }
                    to { background-position: 0 60px; }
                }

                .vnfx-chromatic {
                    position: absolute;
                    inset: -2%;
                    background:
                        radial-gradient(circle at 20% 40%, rgba(255, 0, 80, 0.22), transparent 40%),
                        radial-gradient(circle at 80% 55%, rgba(0, 220, 255, 0.20), transparent 45%),
                        repeating-linear-gradient(
                            to bottom,
                            rgba(255, 255, 255, 0.06),
                            rgba(255, 255, 255, 0.06) 2px,
                            transparent 6px,
                            transparent 10px
                        );
                    mix-blend-mode: screen;
                    filter: blur(0.6px);
                    animation: vnfx-chromatic-jitter 0.9s steps(2, end) infinite;
                }
                @keyframes vnfx-chromatic-jitter {
                    0% { transform: translate3d(0, 0, 0); }
                    20% { transform: translate3d(1px, -1px, 0); }
                    40% { transform: translate3d(-1px, 1px, 0); }
                    60% { transform: translate3d(2px, 0, 0); }
                    80% { transform: translate3d(-2px, 1px, 0); }
                    100% { transform: translate3d(0, 0, 0); }
                }

                .vnfx-sunbeams {
                    position: absolute;
                    inset: -30%;
                    background: conic-gradient(
                        from 0deg,
                        rgba(255, 220, 120, 0.0),
                        rgba(255, 220, 120, 0.35),
                        rgba(255, 220, 120, 0.0) 18%,
                        rgba(255, 190, 90, 0.28) 25%,
                        rgba(255, 220, 120, 0.0) 40%,
                        rgba(255, 220, 120, 0.32) 52%,
                        rgba(255, 220, 120, 0.0) 68%,
                        rgba(255, 200, 100, 0.26) 78%,
                        rgba(255, 220, 120, 0.0)
                    );
                    mix-blend-mode: screen;
                    filter: blur(10px);
                    animation: vnfx-sunbeams-spin 18s linear infinite;
                    transform-origin: 50% 50%;
                }
                @keyframes vnfx-sunbeams-spin {
                    from { transform: rotate(0deg) scale(1); }
                    to { transform: rotate(360deg) scale(1); }
                }

                .vnfx-shimmer {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(
                        120deg,
                        transparent 0%,
                        rgba(255, 255, 255, 0.10) 14%,
                        transparent 28%,
                        transparent 100%
                    );
                    background-size: 240% 240%;
                    mix-blend-mode: overlay;
                    filter: blur(0.4px);
                    animation: vnfx-shimmer-move 2.8s ease-in-out infinite;
                }
                @keyframes vnfx-shimmer-move {
                    0% { background-position: 0% 0%; }
                    50% { background-position: 100% 100%; }
                    100% { background-position: 0% 0%; }
                }
            `}</style>
            <div ref={playContainerRef} className="relative overflow-hidden" style={{ aspectRatio: `${project.gameResolution?.width || 16} / ${project.gameResolution?.height || 9}`, maxWidth: '100%', maxHeight: '100%', width: '100%', '--font-scale': playContainerSize.width > 0 ? playContainerSize.width / (project.gameResolution?.width || 1920) : 1 } as React.CSSProperties}>
                {playerState?.mode === 'playing' ? renderStage() : null}
                
                {/* Render closing + current menu screens together so a screen transitioning
                    from current → closing stays mounted (only its isClosing prop flips and the
                    CSS animation switches). Splitting them into two separate JSX blocks used to
                    force React to unmount the old screen and remount it under the "closing"
                    block, causing a one-frame gap that looked like flicker during crossfades. */}
                {(() => {
                    const ordered: { id: VNID; isClosing: boolean }[] = [];
                    // Closing screens first (rendered below — earlier in DOM = lower stacking)
                    for (const id of screenStack) {
                        if (id !== currentScreenId && closingScreens.has(id)) {
                            ordered.push({ id, isClosing: true });
                        }
                    }
                    // Current screen last (rendered above)
                    if (currentScreenId) {
                        ordered.push({ id: currentScreenId, isClosing: closingScreens.has(currentScreenId) });
                    }
                    return ordered.map(({ id, isClosing }) => (
                        <UIScreenRenderer
                            key={id}
                            screenId={id}
                            onAction={handleUIAction}
                            settings={settings}
                            onSettingsChange={(key, value) => setSettings(s => ({...s, [key]: value}))}
                            assetResolver={assetResolver}
                            gameSaves={gameSaves}
                            playSound={playSound}
                            variables={screenVariables}
                            onVariableChange={handleVariableChange}
                            isClosing={isClosing}
                            evaluateConditions={evaluateConditions}
                            onCommitVariables={commitUiVariablesToPlayerState}
                        />
                    ));
                })()}
                {/* Render closing + current HUD screens together. Same unmount/remount fix as
                    the menu-screen block above. */}
                {playerState?.mode === 'playing' && (() => {
                    const topHud = hudStack.length > 0 ? hudStack[hudStack.length - 1] : null;
                    const activeHudId = topHud ?? project.ui.gameHudScreenId ?? null;
                    const ordered: { id: VNID; isClosing: boolean }[] = [];
                    for (const id of hudStack) {
                        if (id !== topHud && closingScreens.has(id)) {
                            ordered.push({ id, isClosing: true });
                        }
                    }
                    if (activeHudId) {
                        ordered.push({ id: activeHudId, isClosing: closingScreens.has(activeHudId) });
                    }
                    return ordered.map(({ id, isClosing }) => (
                        <UIScreenRenderer
                            key={id}
                            screenId={id}
                            onAction={handleUIAction}
                            settings={settings}
                            onSettingsChange={(key, value) => setSettings(s => ({...s, [key]: value}))}
                            assetResolver={assetResolver}
                            gameSaves={gameSaves}
                            playSound={playSound}
                            variables={screenVariables}
                            onVariableChange={handleVariableChange}
                            isClosing={isClosing}
                            evaluateConditions={evaluateConditions}
                            onCommitVariables={commitUiVariablesToPlayerState}
                        />
                    ));
                })()}

                {activeOverlayEffects.length > 0 && (
                    <ScreenOverlayEffects
                        effects={activeOverlayEffects}
                        width={overlayWidth}
                        height={overlayHeight}
                        className="absolute inset-0 pointer-events-none z-40"
                    />
                )}
                {renderPlayerUI()}
                
                {/* Scene exit transition overlay */}
                {sceneTransitionFading && (
                    <div 
                        className={`absolute inset-0 pointer-events-none z-50 ${
                            sceneTransitionType === 'fade' ? 'bg-black transition-base transition-dissolve' :
                            sceneTransitionType === 'dissolve' ? 'bg-black transition-base transition-dissolve' :
                            sceneTransitionType === 'iris-out' ? 'bg-black transition-base transition-iris-out' :
                            sceneTransitionType === 'wipe-right' ? 'bg-black transition-base transition-wipe-right' :
                            sceneTransitionType === 'slide-left' ? 'bg-black transition-base transition-slide-out-left' :
                            'bg-black'
                        }`}
                        style={{ animationDuration: `${sceneTransitionDuration}s` }}
                    />
                )}
            </div>
            {/* In-game confirmation dialog */}
            {confirmDialog && (
                <InGameConfirmDialog
                    type={confirmDialog.type}
                    settings={project.ui.confirmDialogs}
                    assetResolver={assetResolver}
                    onConfirm={() => {
                        const action = confirmDialog.pendingAction;
                        setConfirmDialog(null);
                        executeUIAction(action);
                    }}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
            {!hideCloseButton && (
                <button onClick={handleClose} className="absolute top-4 right-4 bg-slate-800/50 p-2 rounded-full hover:bg-slate-700/80 transition-colors z-50">
                    <XMarkIcon className="w-8 h-8"/>
                </button>
            )}
        </div>
    );
};

export default LivePreview;
