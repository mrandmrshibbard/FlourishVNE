import React, { useState, useEffect, useRef, useCallback, useReducer, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useProject } from '../contexts/ProjectContext';
import { interpolateVariables } from '../utils/variableInterpolation';
import { XMarkIcon, FilmIcon } from './icons';
import { fontSettingsToStyle, extractTextGradientStyle } from '../utils/styleUtils';
import { VNID, VNPosition, VNPositionPreset, VNTransition, normalizeOverlayEffects, upsertOverlayEffect, type VNScreenOverlayEffect } from '../types';
import { VNProject, CGGalleryEntry } from '../types/project';
import {
    VNUIAction, UIActionType, GoToScreenAction, JumpToSceneAction, JumpToLabelAction, SetVariableAction, SaveGameAction, LoadGameAction, CycleLayerAssetAction, OpenURLAction
} from '../types/shared';
import {
    VNUIScreen, VNUIElement, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement,
    UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, UITextInputElement, UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, UICGGalleryElement, GameSetting, GameToggleSetting, UIElementType
} from '../features/ui/types';
import {
    VNCommand, CommandType, ChoiceOption, SetBackgroundCommand, ShowCharacterCommand, HideCharacterCommand, DialogueCommand,
    ChoiceCommand, JumpCommand, SetVariableCommand, TextInputCommand, PlayMusicCommand, StopMusicCommand, PlaySoundEffectCommand,
    PlayMovieCommand, StopMovieCommand, WaitCommand, ShakeScreenCommand, TintScreenCommand, PanZoomScreenCommand, ResetScreenEffectsCommand,
    FlashScreenCommand, LabelCommand, JumpToLabelCommand, ShowTextCommand, ShowImageCommand, HideTextCommand, HideImageCommand,
    ShowButtonCommand, HideButtonCommand, BranchStartCommand, BranchEndCommand, SetScreenOverlayEffectCommand,
    CreditRollCommand, CreditBackground, CreditMedia
} from '../features/scene/types';
// FIX: VNCondition is not exported from scene/types, but from shared types.
import { VNCondition } from '../types/shared';
import { VNCharacter, VNCharacterLayer } from '../features/character/types';
import { VNVariable, VNSetVariableOperator, VNVariableScope } from '../features/variables/types';
import { ScreenOverlayEffects } from './live-preview/ScreenOverlayEffects';
import { 
    normalizeSetVariableOperator as normalizeOperator,
    calculateVariableValue 
} from '../utils/variableUtils';

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
} from './live-preview/command-handlers';
import { CommandScheduler } from './live-preview/runtime/commandScheduler';
import { RuntimeVariableStore } from './live-preview/runtime/runtimeVariableStore';
import { RuntimeDiagnostics } from './live-preview/runtime/runtimeDiagnostics';

// Import extracted types
import {
    TextOverlay,
    ImageOverlay,
    ButtonOverlay,
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
// TODO: Remove duplicate local declarations before uncommenting buildSlideStyle
// import { buildSlideStyle } from './live-preview/systems/transitionUtils';

// Import renderer components from extracted modules  
// TODO: Remove duplicate local declarations before uncommenting
// import { TextOverlayElement } from './live-preview/renderers/TextOverlayRenderer';
// import { ImageOverlayElement } from './live-preview/renderers/ImageOverlayRenderer';
// import { ButtonOverlayElement } from './live-preview/renderers/ButtonOverlayRenderer';
// import { DialogueBox } from './live-preview/renderers/DialogueRenderer';
// import { ChoiceMenu } from './live-preview/renderers/ChoiceMenuRenderer';

const defaultSettings: GameSettings = {
    textSpeed: 50,
    musicVolume: 0.8,
    sfxVolume: 0.8,
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

    const baseStyle: React.CSSProperties = {
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        ...(isSlideTransition ? {} : { transform: 'translate(-50%, -50%)' }),
        fontSize: `calc(var(--font-scale, 1) * ${overlay.fontSize}px)`,
        fontFamily: overlay.fontFamily,
        color: overlay.color,
        fontWeight: overlay.fontWeight || 'normal',
        fontStyle: overlay.fontStyle || 'normal',
        letterSpacing: overlay.letterSpacing ? `calc(var(--font-scale, 1) * ${overlay.letterSpacing}px)` : undefined,
        width: overlay.width ? `calc(var(--font-scale, 1) * ${overlay.width}px)` : 'auto',
        height: overlay.height ? `calc(var(--font-scale, 1) * ${overlay.height}px)` : 'auto',
        textAlign: overlay.textAlign || 'left',
        display: 'flex',
        alignItems: overlay.verticalAlign === 'top' ? 'flex-start' : overlay.verticalAlign === 'bottom' ? 'flex-end' : 'center',
        justifyContent: overlay.textAlign === 'left' ? 'flex-start' : overlay.textAlign === 'right' ? 'flex-end' : 'center',
        whiteSpace: overlay.width ? 'pre-wrap' : 'nowrap',
        overflow: 'hidden',
    };

    // Apply text shadow
    if (overlay.textShadow?.enabled) {
        const s = overlay.textShadow;
        baseStyle.textShadow = `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${s.color}`;
    }

    // Apply text border (stroke)
    if (overlay.textBorder?.enabled) {
        (baseStyle as any).WebkitTextStroke = `${overlay.textBorder.width}px ${overlay.textBorder.color}`;
    }

    // Apply text gradient (uses background-clip trick)
    const useGradient = overlay.textGradient?.enabled && overlay.textGradient.colors.length >= 2;
    if (useGradient) {
        const g = overlay.textGradient!;
        const gradientCSS = g.type === 'radial'
            ? `radial-gradient(circle, ${g.colors.join(', ')})`
            : `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})`;
        baseStyle.background = gradientCSS;
        baseStyle.WebkitBackgroundClip = 'text';
        (baseStyle as any).WebkitTextFillColor = 'transparent';
        (baseStyle as any).backgroundClip = 'text';
    }

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
            {overlay.text}
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

    const handleClick = () => {
        runtimeDebugLog('Button clicked:', overlay.text, 'Primary Action:', overlay.onClick, 'Additional Actions:', overlay.actions?.length || 0);
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
        // BUT: Don't advance if primary action is JumpToScene (it handles its own navigation)
        if (overlay.waitForClick && onAdvance && overlay.onClick.type !== UIActionType.JumpToScene) {
            onAdvance();
        }
    };

    const applyTransition = playTransition && overlay.transition && overlay.transition !== 'instant';
    const transitionClass = applyTransition && overlay.transition ? getOverlayTransitionClass(overlay.transition, overlay.action === 'hide') : '';
    const animDuration = `${overlay.duration ?? 0.3}s`;

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.width}%`,
        height: `${overlay.height}%`,
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
        backgroundColor: overlay.backgroundColor,
        color: overlay.textColor,
        fontSize: `calc(var(--font-scale, 1) * ${overlay.fontSize}px)`,
        fontWeight: overlay.fontWeight,
        borderRadius: `${overlay.borderRadius}px`,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.1s, box-shadow 0.1s',
        boxShadow: isHovered ? '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.2)',
        transform: isHovered ? 'translateY(-2px)' : 'none',
        opacity: overlay.opacity ?? 1,
    };

    const displayImage = isHovered && overlay.hoverImageUrl ? overlay.hoverImageUrl : overlay.imageUrl;

    return (
        <div
            key={overlay.id}
            style={containerStyle}
            className={`${transitionClass}`}
            {...(hasTransition ? { style: { ...containerStyle, animationDuration: animDuration } } : {})}
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

    const containerStyle: React.CSSProperties = {
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.width}px`,
        height: `${overlay.height}px`,
        ...(isSlideTransition ? {} : { transform: 'translate(-50%, -50%)' }),
    };

    // Only pre-hide if we're showing WITH a transition that hasn't started yet
    if (overlay.action === 'show' && hasTransition && !playTransition) {
        containerStyle.opacity = 0;
    }

    const imageStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        transform: `rotate(${overlay.rotation}deg) scale(${overlay.scaleX}, ${overlay.scaleY})`,
        transformOrigin: 'center center',
        opacity: overlay.opacity,
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
                    className="absolute inset-0 w-full h-full object-contain" 
                    style={imageStyle} 
                />
            ) : (
                <img 
                    src={overlay.imageUrl} 
                    alt="" 
                    className="absolute inset-0 w-full h-full object-contain" 
                    style={imageStyle} 
                />
            )}
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
    useEffect(() => {
        if (!ref.current) return;
        const el = ref.current;
        let rafId: number | null = null;
        
        const obs = new ResizeObserver(() => {
            // Debounce with RAF to avoid rapid updates
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
            rafId = requestAnimationFrame(() => {
                const r = el.getBoundingClientRect();
                setSize(prev => {
                    // Only update if size actually changed
                    if (prev.width === r.width && prev.height === r.height) {
                        return prev;
                    }
                    return { width: r.width, height: r.height };
                });
            });
        });
        obs.observe(el);
        // initial measure
        const r = el.getBoundingClientRect();
        setSize({ width: r.width, height: r.height });
        return () => {
            obs.disconnect();
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, [ref]);
    return size;
}

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

    return (
        <div 
            className={`absolute z-20 cursor-pointer rounded-lg`}
            style={{
                bottom: `${dialogueBoxBottomMargin}px`,
                left: `${(100 - dialogueBoxWidth) / 2}%`,
                right: `${(100 - dialogueBoxWidth) / 2}%`,
                ...(dialogueBorderUrl 
                    ? { backgroundImage: `url(${dialogueBorderUrl})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', padding: `${dialogueBorderPadding}px` }
                    : {})
            }}
            onClick={handleClick}
        >
            <div 
                className={`relative rounded-lg ${!hasCustomImage ? 'bg-black/70 border-2 border-slate-500' : ''}`}
                style={dialogueBoxUrl && !isDialogueBoxVideo 
                    ? { backgroundImage: `url(${dialogueBoxUrl})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', ...(dialogueBoxHeight ? { height: `${dialogueBoxHeight}px` } : { minHeight: '150px' }), padding: `${dialogueBoxPadding}px ${dialogueBoxPadding}px` } 
                    : { padding: `${dialogueBoxPadding}px ${dialogueBoxPadding}px`, ...(dialogueBoxHeight ? { height: `${dialogueBoxHeight}px` } : { minHeight: '150px' }) }}
            >
                {isDialogueBoxVideo && dialogueBoxUrl && (
                    <video 
                        autoPlay 
                        loop 
                        muted 
                        className="absolute inset-0 w-full h-full rounded-lg -z-10"
                        style={{ pointerEvents: 'none', objectFit: 'fill' }}
                    >
                        <source src={dialogueBoxUrl} />
                    </video>
                )}
                {dialogue.characterName !== 'Narrator' && (
                    <h3 className="mb-2" style={{...fontSettingsToStyle(projectUI.dialogueNameFont), ...(dialogue.characterColor && dialogue.characterColor !== '#FFFFFF' ? { color: dialogue.characterColor } : {})}}>
                        <span style={extractTextGradientStyle(projectUI.dialogueNameFont) || undefined}>{dialogue.characterName}</span>
                    </h3>
                )}
                <p className="leading-relaxed" style={{...dialogueTextStyle, wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const}}>
                    <span style={extractTextGradientStyle(projectUI.dialogueTextFont) || undefined}>{displayText}</span>
                    {!hasFinished && <span className="animate-ping">_</span>}
                </p>
            </div>
        </div>
    );
};

const ChoiceMenu: React.FC<{ choices: ChoiceOption[], projectUI: any, onSelect: (choice: ChoiceOption) => void, variables: Record<VNID, string | number | boolean>, project: VNProject }> = ({ choices, projectUI, onSelect, variables, project }) => {
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

    const hasCustomChoiceImage = choiceButtonUrl || choiceBorderUrl;

    return (
        <div className="absolute inset-0 bg-black/30 z-30 flex flex-col items-center justify-center p-8 space-y-4">
            {choices.map((choice, index) => {
                const interpolatedText = interpolateVariables(choice.text, variables, project);
                return (
                    <div
                        key={index}
                        className={`${choiceBorderUrl ? 'hover:brightness-110 hover:scale-105 transition-all' : ''}`}
                        style={choiceBorderUrl 
                            ? { backgroundImage: `url(${choiceBorderUrl})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', padding: `${choiceBorderPadding}px`, ...(choiceWidth ? { width: `${choiceWidth}px` } : { maxWidth: '80%' }), borderRadius: '0.5rem' }
                            : { ...(choiceWidth ? { width: `${choiceWidth}px` } : { maxWidth: '80%' }) }}
                    >
                        <button 
                            onClick={() => onSelect(choice)}
                            className={`relative rounded-lg overflow-hidden w-full ${!hasCustomChoiceImage ? 'bg-slate-800/80 hover:bg-slate-700/90 border-2 border-slate-500' : ''} ${!choiceBorderUrl ? 'hover:brightness-110 hover:scale-105 transition-all' : ''}`}
                            style={choiceButtonUrl && !isChoiceButtonVideo 
                                ? { backgroundImage: `url(${choiceButtonUrl})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', padding: `${choicePadding}px ${choicePadding * 2}px`, minWidth: '200px', ...(choiceHeight ? { height: `${choiceHeight}px` } : {}), ...fontSettingsToStyle(projectUI.choiceTextFont), textAlign: 'center' as const, wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const } 
                                : { padding: `${choicePadding}px ${choicePadding * 2}px`, ...fontSettingsToStyle(projectUI.choiceTextFont), textAlign: 'center' as const, wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const, minWidth: '200px', ...(choiceHeight ? { height: `${choiceHeight}px` } : {}) }}
                        >
                            {isChoiceButtonVideo && choiceButtonUrl && (
                                <video 
                                    autoPlay 
                                    loop 
                                    muted 
                                    className="absolute inset-0 w-full h-full rounded-lg -z-10"
                                    style={{ pointerEvents: 'none', objectFit: 'fill' }}
                                >
                                    <source src={choiceButtonUrl} />
                                </video>
                            )}
                            <span className="relative z-10" style={extractTextGradientStyle(projectUI.choiceTextFont) || undefined}>{interpolatedText}</span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

const TextInputForm: React.FC<{ textInput: PlayerState['uiState']['textInput'], onSubmit: (value: string) => void, variables: Record<VNID, string | number | boolean>, project: VNProject }> = ({ textInput, onSubmit, variables, project }) => {
    const [inputValue, setInputValue] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(inputValue);
    };

    const interpolatedPrompt = interpolateVariables(textInput.prompt, variables, project);

    return (
        <div className="absolute inset-0 bg-black/30 z-30 flex flex-col items-center justify-center p-8">
            <div className="bg-black/70 rounded-lg border-2 border-slate-500 p-6 max-w-md w-full">
                <p className="text-white mb-4 text-center">{interpolatedPrompt}</p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={textInput.placeholder}
                        maxLength={textInput.maxLength}
                        className="w-full px-3 py-2 bg-slate-800 text-white border border-slate-600 rounded focus:outline-none focus:border-slate-400"
                        autoFocus
                    />
                    <button
                        type="submit"
                        className="w-full mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                    >
                        Submit
                    </button>
                </form>
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

    const slotBgColor = el.slotBackgroundColor || '#1e293b';
    const slotBorderColor = el.slotBorderColor || '#475569';
    const slotHoverBorderColor = el.slotHoverBorderColor || '#38bdf8';
    const slotHeaderColor = el.slotHeaderColor || '#7dd3fc';

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
                            className="rounded-lg border-2 disabled:opacity-50 text-left transition-colors overflow-hidden flex flex-col"
                            style={{
                                ...fontSettingsToStyle(el.font),
                                backgroundColor: slotBgColor,
                                borderColor: slotBorderColor,
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
                            {/* Screenshot area */}
                            <div className="relative w-full" style={{ aspectRatio: '16/9', flexShrink: 0 }}>
                                {slotData?.screenshot ? (
                                    <img
                                        src={slotData.screenshot}
                                        alt={`Save slot ${i + 1}`}
                                        className="absolute inset-0 w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.35, backgroundColor: 'rgba(0,0,0,0.3)' }}>
                                        {el.emptySlotText}
                                    </div>
                                )}
                            </div>

                            {/* Info area below the screenshot */}
                            <div className="px-2 py-1.5 flex-shrink-0" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>
                                <p className="font-bold text-sm" style={{ color: slotHeaderColor }}>Slot {i + 1}</p>
                                {slotData ? (
                                    <>
                                        <p className="text-xs truncate opacity-90">{slotData.sceneName}</p>
                                        <p className="text-[10px]" style={{ opacity: 0.6 }}>{new Date(slotData.timestamp).toLocaleString()}</p>
                                    </>
                                ) : (
                                    <p className="text-xs" style={{ opacity: 0.5 }}>Empty</p>
                                )}
                            </div>
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
                        className="px-3 py-1 rounded text-sm font-semibold transition-colors disabled:opacity-30"
                        style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: slotHeaderColor }}
                    >
                        ◀ Prev
                    </button>
                    <span className="text-xs" style={{ color: slotHeaderColor, opacity: 0.8 }}>
                        Page {currentPage + 1} / {totalPages}
                    </span>
                    <button
                        onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.min(totalPages - 1, p + 1)); }}
                        disabled={currentPage >= totalPages - 1}
                        className="px-3 py-1 rounded text-sm font-semibold transition-colors disabled:opacity-30"
                        style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: slotHeaderColor }}
                    >
                        Next ▶
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
            className="transition-transform transform hover:scale-105 relative flex items-center justify-center"
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
            const conditionVars = new Set(el.assetConditions.flatMap(c => c.conditions.map(cond => cond.variableId)));
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
                const hAlignClass = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[el.textAlign || 'center'];
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
            key={`${screenId}-${isClosing ? 'closing' : 'open'}`}
            className="absolute inset-0 w-full h-full"
            style={screenTransitionStyle}
        >
            {getBackgroundElement()}
            {Object.values(screen.elements).map(element => renderElement(element as VNUIElement, variables, project, onCommitVariables))}
        </div>
    );
});


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
    const [menuVariables, setMenuVariables] = useState<Record<VNID, string | number | boolean>>(() => {
        const initVars: Record<VNID, string | number | boolean> = {};
        Object.values(project.variables).forEach((v: any) => {
            initVars[v.id] = v.defaultValue;
        });
        return initVars;
    });
    
    // UI variables: used for UI screens during gameplay (separate from game variables until merged back)
    const [uiVariables, setUiVariables] = useState<Record<VNID, string | number | boolean>>(() => {
        const initVars: Record<VNID, string | number | boolean> = {};
        Object.values(project.variables).forEach((v: any) => {
            initVars[v.id] = v.defaultValue;
        });
        return initVars;
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
                    for (const char of Object.values(stage.characters)) {
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
        stopAndResetMusic();
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
                uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, movieLoop: false, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null, showHistory: false, screenSceneId: null },
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
            stageState: { backgroundUrl: null, characters: {}, textOverlays: [], imageOverlays: [], buttonOverlays: [], movieOverlays: [], screen: { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0, transitionDuration: 0.5, overlayEffects: [] } },
            history: [],
            uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, movieLoop: false, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null, showHistory: false, screenSceneId: null },
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
                                    movieOverlays: [],
                                    screen: {
                                        shake: { active: false, intensity: 0 },
                                        tint: 'transparent',
                                        zoom: 1,
                                        panX: 0,
                                        panY: 0,
                                        transitionDuration: 0.5,
                                        overlayEffects: []
                                    }
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
                                        movieOverlays: [],
                                        screen: {
                                            shake: { active: false, intensity: 0 },
                                            tint: 'transparent',
                                            zoom: 1,
                                            panX: 0,
                                            panY: 0,
                                            transitionDuration: 0.5,
                                            overlayEffects: []
                                        }
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

                    // If waitForInput is enabled, allow user input (click or key) to advance early
                    if (cmd.waitForInput) {
                        // Track whether we've already advanced to prevent double-advance
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
                case CommandType.CreditRoll: {
                    const cmd = command as CreditRollCommand;
                    setActiveCreditRoll(cmd);
                    const result = handleCreditRoll(cmd, commandContext);
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
            
            // Add dialogue to history
            const historyEntry: HistoryEntry = {
                timestamp: Date.now(),
                type: 'dialogue',
                characterName: p.uiState.dialogue.characterName,
                characterColor: p.uiState.dialogue.characterColor,
                text: p.uiState.dialogue.text,
            };
            
            return {
                ...p,
                currentIndex: p.currentIndex + 1,
                history: [...p.history, historyEntry],
                uiState: { ...p.uiState, isWaitingForInput: false, dialogue: null }
            };
        });
    };
    const handleChoiceSelect = (choice: ChoiceOption) => {
        runtimeDebugLog('[CHOICE] Selected:', choice.text, 'Actions:', choice.actions?.length || 0);
        updatePlayerState(p => {
            if (!p) return null;
            let newState = { ...p };
            
            // Add choice to history
            const historyEntry: HistoryEntry = {
                timestamp: Date.now(),
                type: 'choice',
                text: `Choice: ${choice.text}`,
                choiceText: choice.text,
            };
            newState.history = [...newState.history, historyEntry];
            
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
    updatePlayerState(p => p ? { 
            ...p, 
            currentIndex: p.currentIndex + 1, 
            variables: { ...p.variables, [p.uiState.textInput!.variableId]: value },
            uiState: { ...p.uiState, isWaitingForInput: false, textInput: null } 
        } : null);
    };

    const handleUIAction = (action: VNUIAction) => {
        runtimeDebugLog('handleUIAction called with:', action.type, action);
        
        if (!playerState && action.type === UIActionType.StartNewGame) {
            startNewGame();
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
                    // Handle crossfade: mark the departing screen as closing so it fades out
                    // while the new screen fades in on top
                    const departingId = s.length > 0 ? s[s.length - 1] : null;
                    if (departingId) {
                        const departingScreen = project.uiScreens[departingId];
                        const depTransOut = departingScreen?.transitionOut || 'fade';
                        const targetTransIn = targetScreen.transitionIn || 'fade';
                        if (targetTransIn === 'crossfade' || depTransOut === 'crossfade') {
                            const duration = departingScreen?.transitionOutDuration ?? departingScreen?.transitionDuration ?? 300;
                            setClosingScreens(prev => new Set(prev).add(departingId));
                            // After fade-in completes, clean up the departing screen from both sets
                            setTimeout(() => {
                                setClosingScreens(prev => {
                                    const next = new Set(prev);
                                    next.delete(departingId);
                                    return next;
                                });
                                // Remove departed screen from the stack to prevent accumulation
                                setHudStack(prev => prev.filter(id => id !== departingId));
                            }, duration + 100);
                        }
                    }
                    return [...s, targetId];
                });
            } else {
                setScreenStack(stack => {
                    const departingId = stack.length > 0 ? stack[stack.length - 1] : null;
                    if (departingId) {
                        const departingScreen = project.uiScreens[departingId];
                        const depTransOut = departingScreen?.transitionOut || 'fade';
                        const targetTransIn = targetScreen.transitionIn || 'fade';
                        if (targetTransIn === 'crossfade' || depTransOut === 'crossfade') {
                            const duration = departingScreen?.transitionOutDuration ?? departingScreen?.transitionDuration ?? 300;
                            setClosingScreens(prev => new Set(prev).add(departingId));
                            // After fade-in completes, clean up the departing screen from both sets
                            setTimeout(() => {
                                setClosingScreens(prev => {
                                    const next = new Set(prev);
                                    next.delete(departingId);
                                    return next;
                                });
                                // Remove departed screen from the stack to prevent accumulation
                                setScreenStack(prev => prev.filter(id => id !== departingId));
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
            // Stop game music and SFX immediately
            const audio = musicAudioRef.current;
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
                audio.src = '';
            }
            stopAllSfx();
            
            // Clear player state, uiVariables, and return to title screen
            updatePlayerState(null);
            setHudStack([]);
            // Reset uiVariables to defaults when quitting to title
            const resetVars: Record<VNID, string | number | boolean> = {};
            Object.values(project.variables).forEach((v: any) => {
                resetVars[v.id] = v.defaultValue;
            });
            setUiVariables(resetVars);
            uiVariablesRef.current = resetVars;
            runtimeDebugLog('[CLEAR] Dirty set cleared after QuitToTitle');
            uiDirtyVariableIdsRef.current.clear();
            if (project.ui.titleScreenId) setScreenStack([project.ui.titleScreenId]);
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
                            movieOverlays: [],
                            screen: { 
                                shake: { active: false, intensity: 0 }, 
                                tint: 'transparent', 
                                zoom: 1, 
                                panX: 0, 
                                panY: 0, 
                                transitionDuration: 0.5,
                                overlayEffects: []
                            } 
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
                                    movieOverlays: [],
                                    screen: { 
                                        shake: { active: false, intensity: 0 }, 
                                        tint: 'transparent', 
                                        zoom: 1, 
                                        panX: 0, 
                                        panY: 0, 
                                        transitionDuration: 0.5,
                                        overlayEffects: []
                                    } 
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

            // Use scene exit transition if we're in an active scene, otherwise execute immediately
            if (playerState?.currentSceneId) {
                startSceneExitTransition(playerState.currentSceneId, executeJump);
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
    }, [playerState, project.ui.pauseScreenId, screenStack, handleDialogueAdvance]);

    // Auto-advance effect
    useEffect(() => {
        if (!settings.autoAdvance || !playerState || playerState.mode !== 'playing') return;
        if (!playerState.uiState.dialogue || playerState.uiState.choices || playerState.uiState.textInput) return;
        
        const timer = setTimeout(() => {
            handleDialogueAdvance();
        }, settings.autoAdvanceDelay * 1000);
        
        return () => clearTimeout(timer);
    }, [settings.autoAdvance, settings.autoAdvanceDelay, playerState?.uiState.dialogue, playerState?.uiState.choices, playerState?.uiState.textInput, playerState?.mode, handleDialogueAdvance]);


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
        const panZoomStyle: React.CSSProperties = { transform: `scale(${state.screen.zoom}) translate(${state.screen.panX}%, ${state.screen.panY}%)`, transition: `transform ${state.screen.transitionDuration}s ease-in-out`, width: '100%', height: '100%' };
        const shakeIntensityStyle = (activeShakeRef.current ? { '--shake-intensity-x': `${intensityPx}px`, '--shake-intensity-y': `${intensityPx * 0.7}px`, } : {}) as React.CSSProperties;
        const tintStyle: React.CSSProperties = { backgroundColor: state.screen.tint, transition: `background-color ${state.screen.transitionDuration}s ease-in-out`, };

        const handleStageClick = () => {
            // Only advance if dialogue is showing and not waiting for choice or text input
            if (playerState.uiState.dialogue && !playerState.uiState.choices && !playerState.uiState.textInput && !playerState.uiState.showHistory) {
                handleDialogueAdvance();
            }
        };

        return (
            <div 
                ref={stageRef} 
                className="w-full h-full relative overflow-hidden bg-black"
                onClick={handleStageClick}
                style={{ cursor: playerState.uiState.dialogue && !playerState.uiState.choices && !playerState.uiState.textInput ? 'pointer' : 'default' }}
            >
                <div style={panZoomStyle}>
                    <div className={`w-full h-full ${shakeClass} z-10`} style={shakeIntensityStyle}>
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
                        {Object.values(state.characters).map((char: StageCharacterState) => {
                            let transitionClass = '';
                            let animationDuration = '1s';
                            let slideStyle: React.CSSProperties = {};
                            let positionStyle = getPositionStyle(char.position);
                            
                            // Add centering transform for non-slide transitions
                            // Only apply centering for preset positions, not custom coordinates
                            const isCustomPosition = typeof char.position === 'object';
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
                            return (
                                <div key={char.charId} className={`absolute h-[90%] w-auto aspect-[3/4] ${transitionClass} transition-base`} style={{...positionStyle, animationDuration, ...slideStyle}}>
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
                                </div>
                            );
                        })}
                        {state.textOverlays.map((overlay: TextOverlay) => (
                            <TextOverlayElement key={overlay.id} overlay={overlay} stageSize={stageSize} />
                        ))}
                        {state.imageOverlays.map((overlay: ImageOverlay) => (
                            <ImageOverlayElement key={overlay.id} overlay={overlay} stageSize={stageSize} />
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
                    </div>
                </div>
                <div className="absolute inset-0 pointer-events-none" style={tintStyle}></div>
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

                {/* Credits scroll */}
                <div
                    className="credits-scroll text-center px-8 relative z-[2]"
                    style={{
                        color: command.textColor || '#FFFFFF',
                        animationDuration: `${command.duration || 15}s`,
                        textShadow: (hasBgs || hasMedia) ? '0 2px 8px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)' : 'none',
                    }}
                    onAnimationEnd={(e) => {
                        if (e.target === e.currentTarget) {
                            onFinish();
                        }
                    }}
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

                {/* Skip hint */}
                {command.allowSkip && (
                    <div className="absolute bottom-4 right-4 text-xs opacity-50 z-[3]" style={{ color: command.textColor || '#FFFFFF' }}>
                        Click to skip
                    </div>
                )}
            </div>
        );
    };

    // History component
    const HistoryPanel: React.FC<{ history: HistoryEntry[], onClose: () => void }> = ({ history, onClose }) => {
        return (
            <div className="absolute inset-0 bg-black/90 z-50 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-600">
                    <h2 className="text-white text-2xl font-bold">Dialogue History</h2>
                    <button 
                        onClick={onClose}
                        className="text-white hover:text-slate-300 text-sm px-4 py-2 bg-slate-700 rounded"
                    >
                        Close (ESC / H)
                    </button>
                </div>
                
                {/* History content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {history.length === 0 ? (
                        <p className="text-slate-400 text-center mt-8">No dialogue history yet.</p>
                    ) : (
                        history.map((entry, index) => (
                            <div 
                                key={index}
                                className={`p-3 rounded ${entry.type === 'choice' ? 'bg-blue-900/30 border-l-4 border-blue-500' : 'bg-slate-800/50'}`}
                            >
                                {entry.type === 'dialogue' && entry.characterName && (
                                    <div 
                                        className="font-bold mb-1"
                                        style={{ color: entry.characterColor || '#fff' }}
                                    >
                                        {entry.characterName}
                                    </div>
                                )}
                                <div className="text-white">
                                    {entry.text}
                                </div>
                                {entry.type === 'choice' && (
                                    <div className="text-blue-300 text-sm mt-1 italic">
                                        Selected choice
                                    </div>
                                )}
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
                <DialogueBox dialogue={uiState.dialogue} settings={settings} projectUI={project.ui} onFinished={handleDialogueAdvance} variables={playerState.variables} project={project} />
            )}
            {uiState.choices && <ChoiceMenu choices={uiState.choices} projectUI={project.ui} onSelect={handleChoiceSelect} variables={playerState.variables} project={project} />}
            {uiState.textInput && <TextInputForm textInput={uiState.textInput} onSubmit={handleTextInputSubmit} variables={playerState.variables} project={project} />}
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
                
                {/* Render closing screens underneath current screen for crossfade transitions */}
                {screenStack.filter(id => id !== currentScreenId && closingScreens.has(id)).map(closingId => (
                    <UIScreenRenderer
                        key={`closing-${closingId}`}
                        screenId={closingId}
                        onAction={handleUIAction}
                        settings={settings}
                        onSettingsChange={(key, value) => setSettings(s => ({...s, [key]: value}))}
                        assetResolver={assetResolver}
                        gameSaves={gameSaves}
                        playSound={playSound}
                        variables={playerState ? {...uiVariables} : {...menuVariables}}
                        onVariableChange={handleVariableChange}
                        isClosing={true}
                        evaluateConditions={evaluateConditions}
                        onCommitVariables={commitUiVariablesToPlayerState}
                    />
                ))}
                {currentScreenId && (
                    <UIScreenRenderer
                        screenId={currentScreenId}
                        onAction={handleUIAction}
                        settings={settings}
                        onSettingsChange={(key, value) => setSettings(s => ({...s, [key]: value}))}
                        assetResolver={assetResolver}
                        gameSaves={gameSaves}
                        playSound={playSound}
                        variables={playerState ? (() => {
                            const vars = {...uiVariables};
                            runtimeDebugLog('[Screen Stack UI] Receiving uiVariables:', JSON.stringify(vars, null, 2));
                            return vars;
                        })() : (() => {
                            const vars = {...menuVariables};
                            runtimeDebugLog('[Screen Stack UI] Receiving menuVariables:', JSON.stringify(vars, null, 2));
                            return vars;
                        })()}
                        onVariableChange={handleVariableChange}
                        isClosing={closingScreens.has(currentScreenId)}
                        evaluateConditions={evaluateConditions}
                        onCommitVariables={commitUiVariablesToPlayerState}
                    />
                )}
                {
                    // Render closing HUD screens for crossfade transitions
                    playerState?.mode === 'playing' && hudStack.filter(id => {
                        const topHud = hudStack.length > 0 ? hudStack[hudStack.length - 1] : null;
                        return id !== topHud && closingScreens.has(id);
                    }).map(closingId => (
                        <UIScreenRenderer
                            key={`hud-closing-${closingId}`}
                            screenId={closingId}
                            onAction={handleUIAction}
                            settings={settings}
                            onSettingsChange={(key, value) => setSettings(s => ({...s, [key]: value}))}
                            assetResolver={assetResolver}
                            gameSaves={gameSaves}
                            playSound={playSound}
                            variables={{...uiVariables}}
                            onVariableChange={handleVariableChange}
                            isClosing={true}
                            evaluateConditions={evaluateConditions}
                            onCommitVariables={commitUiVariablesToPlayerState}
                        />
                    ))
                }
                {
                    // Render HUD screens while in playing mode. Priority: explicit hudStack top, then project.ui.gameHudScreenId
                    playerState?.mode === 'playing' && (
                        (() => {
                            const hudScreenId = hudStack.length > 0 ? hudStack[hudStack.length - 1] : project.ui.gameHudScreenId;
                            return hudScreenId ? (
                                <UIScreenRenderer
                                    screenId={hudScreenId}
                                    onAction={handleUIAction}
                                    settings={settings}
                                    onSettingsChange={(key, value) => setSettings(s => ({...s, [key]: value}))}
                                    assetResolver={assetResolver}
                                    gameSaves={gameSaves}
                                    playSound={playSound}
                                    variables={playerState ? (() => {
                                        const vars = {...uiVariables};
                                        runtimeDebugLog('[HUD UI] Receiving uiVariables:', JSON.stringify(vars, null, 2));
                                        return vars;
                                    })() : (() => {
                                        const vars = {...menuVariables};
                                        runtimeDebugLog('[HUD UI] Receiving menuVariables:', JSON.stringify(vars, null, 2));
                                        return vars;
                                    })()}
                                    onVariableChange={handleVariableChange}
                                    isClosing={closingScreens.has(hudScreenId)}
                                    evaluateConditions={evaluateConditions}
                                    onCommitVariables={commitUiVariablesToPlayerState}
                                />
                            ) : null;
                        })()
                    )
                }

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
            {!hideCloseButton && (
                <button onClick={handleClose} className="absolute top-4 right-4 bg-slate-800/50 p-2 rounded-full hover:bg-slate-700/80 transition-colors z-50">
                    <XMarkIcon className="w-8 h-8"/>
                </button>
            )}
        </div>
    );
};

export default LivePreview;
