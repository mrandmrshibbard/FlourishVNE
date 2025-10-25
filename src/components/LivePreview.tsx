import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { interpolateVariables } from '../utils/variableInterpolation';
import { XMarkIcon, FilmIcon } from './icons';
import { fontSettingsToStyle } from '../utils/styleUtils';
import { VNID, VNPosition, VNPositionPreset, VNTransition } from '../types';
import { VNProject } from '../types/project';
import {
    VNUIAction, UIActionType, GoToScreenAction, JumpToSceneAction, SetVariableAction, SaveGameAction, LoadGameAction, CycleLayerAssetAction
} from '../types/shared';
import {
    VNUIScreen, VNUIElement, UIButtonElement, UITextElement, UIImageElement, UISaveSlotGridElement,
    UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, GameSetting, GameToggleSetting, UIElementType
} from '../features/ui/types';
import {
    VNCommand, CommandType, ChoiceOption, SetBackgroundCommand, ShowCharacterCommand, HideCharacterCommand, DialogueCommand,
    ChoiceCommand, JumpCommand, SetVariableCommand, TextInputCommand, PlayMusicCommand, StopMusicCommand, PlaySoundEffectCommand,
    PlayMovieCommand, WaitCommand, ShakeScreenCommand, TintScreenCommand, PanZoomScreenCommand, ResetScreenEffectsCommand,
    FlashScreenCommand, LabelCommand, JumpToLabelCommand, ShowTextCommand, ShowImageCommand, HideTextCommand, HideImageCommand,
    ShowButtonCommand, HideButtonCommand
} from '../features/scene/types';
// FIX: VNCondition is not exported from scene/types, but from shared types.
import { VNCondition } from '../types/shared';
import { VNCharacter, VNCharacterLayer } from '../features/character/types';
import { VNVariable } from '../features/variables/types';

type StageSize = { width: number; height: number };

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
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
}

interface ImageOverlay {
    id: VNID;
    imageUrl?: string;
    videoUrl?: string;
    isVideo?: boolean;
    videoLoop?: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    scaleX: number;
    scaleY: number;
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
}

interface ButtonOverlay {
    id: VNID;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
    backgroundColor: string;
    textColor: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    borderRadius: number;
    imageUrl: string | null;
    hoverImageUrl: string | null;
    onClick: VNUIAction;
    clickSound: VNID | null;
    waitForClick?: boolean;
    transition?: VNTransition;
    duration?: number;
    action?: 'show' | 'hide';
}

interface StageCharacterTransition {
    type: VNTransition;
    duration: number;
    startPosition?: VNPosition;
    endPosition?: VNPosition;
    action: 'show' | 'hide';
}

interface StageCharacterState {
    charId: VNID;
    position: VNPosition;
    imageUrls: string[];
    videoUrls?: string[];
    isVideo?: boolean;
    videoLoop?: boolean;
    transition: StageCharacterTransition | null;
    expressionId?: VNID; // Track which expression is being used
    layerVariableBindings?: Record<VNID, VNID>; // layerId -> variableId mappings for dynamic layer assets
}

interface StageState {
    backgroundUrl: string | null;
    backgroundIsVideo?: boolean;
    backgroundLoop?: boolean;
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
        transitionDuration: number;
    };
}

interface GameSettings {
    textSpeed: number;
    musicVolume: number;
    sfxVolume: number;
    enableSkip: boolean;
}

const defaultSettings: GameSettings = {
    textSpeed: 50,
    musicVolume: 0.8,
    sfxVolume: 0.8,
    enableSkip: true,
};

const getOverlayTransitionClass = (transition: VNTransition, isHide: boolean): string => {
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
        fontSize: `${overlay.fontSize}px`,
        fontFamily: overlay.fontFamily,
        color: overlay.color,
        width: overlay.width ? `${overlay.width}px` : 'auto',
        height: overlay.height ? `${overlay.height}px` : 'auto',
        textAlign: overlay.textAlign || 'left',
        display: 'flex',
        alignItems: overlay.verticalAlign === 'top' ? 'flex-start' : overlay.verticalAlign === 'bottom' ? 'flex-end' : 'center',
        justifyContent: overlay.textAlign === 'left' ? 'flex-start' : overlay.textAlign === 'right' ? 'flex-end' : 'center',
        whiteSpace: overlay.width ? 'pre-wrap' : 'nowrap',
        overflow: 'hidden',
    };

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
}> = ({ overlay, onAction, playSound, onAdvance }) => {
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
        console.log('Button clicked:', overlay.text, 'Action:', overlay.onClick);
        if (overlay.clickSound) {
            try {
                playSound(overlay.clickSound);
            } catch (e) {
                console.error('Error playing button click sound:', e);
            }
        }
        onAction(overlay.onClick);
        
        // If this button requires click to advance, call the advance function
        // BUT: Don't advance if action is JumpToScene (it handles its own navigation)
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
        fontSize: `${overlay.fontSize}px`,
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

interface MusicState {
    audioId: VNID | null;
    loop: boolean;
    currentTime: number;
    isPlaying: boolean;
}

interface PlayerState {
    mode: 'menu' | 'playing' | 'paused';
    currentSceneId: VNID;
    currentCommands: VNCommand[];
    currentIndex: number;
    commandStack: Array<{sceneId: VNID, commands: VNCommand[], index: number}>;
    variables: Record<VNID, string | number | boolean>;
    stageState: StageState;
    musicState: MusicState;
    uiState: {
        dialogue: {
            characterName: string;
            characterColor: string;
            text: string;
        } | null;
        choices: ChoiceOption[] | null;
        textInput: {
            variableId: VNID;
            prompt: string;
            placeholder: string;
            maxLength: number;
        } | null;
        movieUrl: string | null;
        isWaitingForInput: boolean;
        isTransitioning: boolean;
        transitionElement: React.ReactNode | null;
        flash: { color: string, duration: number } | null;
    };
}

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
        const obs = new ResizeObserver(() => {
            const r = el.getBoundingClientRect();
            setSize({ width: r.width, height: r.height });
        });
        obs.observe(el);
        // initial measure
        const r = el.getBoundingClientRect();
        setSize({ width: r.width, height: r.height });
        return () => obs.disconnect();
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
        } else {
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

    return (
        <div 
            className={`absolute bottom-5 left-5 right-5 p-5 z-20 cursor-pointer ${dialogueBoxUrl && !isDialogueBoxVideo ? 'dialogue-box-custom bg-black/70' : 'bg-black/70 rounded-lg border-2 border-slate-500'}`} 
            style={dialogueBoxUrl && !isDialogueBoxVideo ? { borderImageSource: `url(${dialogueBoxUrl})` } : {}}
            onClick={handleClick}
        >
            {isDialogueBoxVideo && dialogueBoxUrl && (
                <video 
                    autoPlay 
                    loop 
                    muted 
                    className="absolute inset-0 w-full h-full object-cover rounded-lg -z-10"
                    style={{ pointerEvents: 'none' }}
                >
                    <source src={dialogueBoxUrl} />
                </video>
            )}
            {dialogue.characterName !== 'Narrator' && (
                <h3 className="mb-2" style={{...fontSettingsToStyle(projectUI.dialogueNameFont), color: dialogue.characterColor}}>
                    {dialogue.characterName}
                </h3>
            )}
            <p className="leading-relaxed" style={fontSettingsToStyle(projectUI.dialogueTextFont)}>
                {displayText}
                {!hasFinished && <span className="animate-ping">_</span>}
            </p>
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

    return (
        <div className="absolute inset-0 bg-black/30 z-30 flex flex-col items-center justify-center p-8 space-y-4">
            {choices.map((choice, index) => {
                const interpolatedText = interpolateVariables(choice.text, variables, project);
                return (
                    <button 
                        key={index} 
                        onClick={() => onSelect(choice)}
                        className={`px-8 py-4 relative ${choiceButtonUrl && !isChoiceButtonVideo ? 'choice-button-custom bg-slate-800/80 hover:bg-slate-700/90' : 'bg-slate-800/80 hover:bg-slate-700/90 border-2 border-slate-500 rounded-lg'}`}
                        style={choiceButtonUrl && !isChoiceButtonVideo ? { borderImageSource: `url(${choiceButtonUrl})`, ...fontSettingsToStyle(projectUI.choiceTextFont) } : fontSettingsToStyle(projectUI.choiceTextFont)}
                    >
                        {isChoiceButtonVideo && choiceButtonUrl && (
                            <video 
                                autoPlay 
                                loop 
                                muted 
                                className="absolute inset-0 w-full h-full object-cover rounded-lg -z-10"
                                style={{ pointerEvents: 'none' }}
                            >
                                <source src={choiceButtonUrl} />
                            </video>
                        )}
                        <span className="relative z-10">{interpolatedText}</span>
                    </button>
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

const ButtonElement: React.FC<{
    element: UIButtonElement,
    style: React.CSSProperties,
    playSound: (soundId: VNID | null) => void,
    onAction: (action: VNUIAction) => void,
    getElementAssetUrl: (image: { type: 'image' | 'video', id: VNID } | null) => string | null,
    variables?: Record<VNID, string | number | boolean>,
    project?: VNProject
}> = ({ element, style, playSound, onAction, getElementAssetUrl, variables = {}, project }) => {
    const [isHovered, setIsHovered] = useState(false);
    const bgUrl = getElementAssetUrl(element.image);
    const hoverUrl = getElementAssetUrl(element.hoverImage);
    const displayUrl = isHovered && hoverUrl ? hoverUrl : bgUrl;
    const textStyle = fontSettingsToStyle(element.font);
    const interpolatedText = project ? interpolateVariables(element.text, variables, project) : element.text;
    
    return (
        <button
            key={element.id}
            style={{...style, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit'}}
            className="transition-transform transform hover:scale-105 relative flex items-center justify-center"
            onMouseEnter={() => { try { playSound(element.hoverSoundId); } catch(e) {} setIsHovered(true); }}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => { try { playSound(element.clickSoundId); } catch(e) {} onAction(element.action); }}
        >
            {displayUrl ? (
                <img src={displayUrl} alt={element.text} className="absolute inset-0 w-full h-full object-fill" />
            ) : (
                <div className="absolute inset-0 w-full h-full bg-slate-700/80"></div>
            )}
            <span className="relative z-10" style={{...textStyle, display: 'inline-block', pointerEvents: 'none'}}>
                {interpolatedText}
            </span>
        </button>
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
}> = React.memo(({ screenId, onAction, settings, onSettingsChange, assetResolver, gameSaves, playSound, variables = {} }) => {
    const { project } = useProject();
    const screen = project.uiScreens[screenId];
    
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
                    return <video src={url} autoPlay loop muted className="absolute inset-0 w-full h-full object-cover" />;
                }
            }
        }
        return null;
    };
    
    const renderElement = (element: VNUIElement, variables: Record<VNID, string | number | boolean>, project: VNProject) => {
        const style: React.CSSProperties = {
            position: 'absolute',
            left: `${element.x}%`, top: `${element.y}%`,
            width: `${element.width}%`, height: `${element.height}%`,
            transform: `translate(-${element.anchorX * 100}%, -${element.anchorY * 100}%)`,
            overflow: 'hidden', // Prevent content overflow when using cover
        };

        const getElementAssetUrl = (image: { type: 'image' | 'video', id: VNID } | null) => {
            if (!image) return null;
            return assetResolver(image.id, image.type);
        };

        switch (element.type) {
            case UIElementType.Button: {
                const el = element as UIButtonElement;
                return <ButtonElement key={el.id} element={el} style={style} playSound={playSound} onAction={onAction} getElementAssetUrl={getElementAssetUrl} variables={variables} project={project} />;
            }
            case UIElementType.Text: {
                const el = element as UITextElement;
                const hAlignClass = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[el.textAlign || 'center'];
                const vAlignClass = { top: 'items-start', middle: 'items-center', bottom: 'items-end' }[el.verticalAlign || 'middle'];
                const interpolatedText = interpolateVariables(el.text, variables, project);

                return <div key={el.id}
                    style={style}
                    className={`flex ${hAlignClass} ${vAlignClass} p-1`}
                >
                    <div style={fontSettingsToStyle(el.font)}>{interpolatedText}</div>
                </div>;
            }
            case UIElementType.Image: {
                const el = element as UIImageElement;
                const url = getElementAssetUrl(el.image);
                if (!url) return <div key={el.id} style={style} className="bg-slate-800/50" />;
                
                // Check if it's a video
                const isVideo = el.image?.type === 'video';
                
                // Container keeps absolute positioning but adds overflow hidden
                const containerStyle: React.CSSProperties = {
                    ...style,
                    overflow: 'hidden',
                };
                
                // Media fills container using object-fit
                const mediaStyle: React.CSSProperties = {
                    width: '100%',
                    height: '100%',
                    objectFit: el.objectFit || 'contain',
                    display: 'block',
                };
                
                if (isVideo) {
                    // Debug: Log video info with expanded details
                    console.log('[Video Element] Name:', el.name);
                    console.log('  Object Fit:', el.objectFit);
                    console.log('  Element Size:', `${element.width}% x ${element.height}%`);
                    console.log('  Container Style:', {
                        position: containerStyle.position,
                        left: containerStyle.left,
                        top: containerStyle.top,
                        width: containerStyle.width,
                        height: containerStyle.height,
                        overflow: containerStyle.overflow
                    });
                    console.log('  Media Style:', mediaStyle);
                    
                    return (
                        <div key={el.id} style={containerStyle}>
                            <video 
                                src={url} 
                                style={mediaStyle}
                                autoPlay 
                                loop 
                                muted 
                                playsInline
                                onLoadedData={() => console.log('[Video Loaded]', el.name)}
                                onError={(e) => {
                                    console.error('[Video Error]', el.name);
                                    const video = e.currentTarget;
                                    console.error('  Error Code:', video.error?.code);
                                    console.error('  Error Message:', video.error?.message);
                                    console.error('  Network State:', video.networkState, '(1=LOADING, 2=IDLE, 3=NO_SOURCE)');
                                    console.error('  Ready State:', video.readyState);
                                    console.error('  Video src:', video.src);
                                }}
                            >
                                <source src={url} type="video/webm" />
                                <source src={url} type="video/mp4" />
                                Your browser doesn't support this video format.
                            </video>
                        </div>
                    );
                } else {
                    // Debug: Log image info
                    console.log('[Image Element] Name:', el.name);
                    console.log('  Object Fit:', el.objectFit);
                    console.log('  Element Size:', `${element.width}% x ${element.height}%`);
                    console.log('  Container Style:', {
                        position: containerStyle.position,
                        left: containerStyle.left,
                        top: containerStyle.top,
                        width: containerStyle.width,
                        height: containerStyle.height,
                        overflow: containerStyle.overflow
                    });
                    console.log('  Media Style:', mediaStyle);
                    
                    return (
                        <div key={el.id} style={containerStyle}>
                            <img 
                                src={url} 
                                alt={el.name} 
                                style={mediaStyle}
                                onError={(e) => console.error('[Image Error]', el.name, ':', e)}
                            />
                        </div>
                    );
                }
            }
            case UIElementType.SettingsSlider: {
                const el = element as UISettingsSliderElement;
                const settingKey = el.setting === 'textSpeed' ? 'textSpeed' : el.setting;
                const value = settings[settingKey];
                const min = el.setting === 'textSpeed' ? 10 : 0;
                const max = el.setting === 'textSpeed' ? 100 : 1;
                const step = el.setting === 'textSpeed' ? 1 : 0.01;
                
                const thumbUrl = el.thumbImage ? getElementAssetUrl(el.thumbImage) : null;
                const trackUrl = el.trackImage ? getElementAssetUrl(el.trackImage) : null;
                
                const customSliderStyle: React.CSSProperties = {
                    // Custom thumb via CSS variable (if no image)
                    ...(el.thumbColor && !thumbUrl ? {
                        ['--slider-thumb-color' as any]: el.thumbColor,
                    } : {}),
                    // Custom track via CSS variable (if no image)
                    ...(el.trackColor && !trackUrl ? {
                        ['--slider-track-color' as any]: el.trackColor,
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
                        onChange={e => onSettingsChange(el.setting, parseFloat(e.target.value))} 
                        style={customSliderStyle}
                        className={thumbUrl || trackUrl ? 'custom-slider' : ''}
                    />
                </div>;
            }
            case UIElementType.SettingsToggle: {
                const el = element as UISettingsToggleElement;
                const isChecked = settings[el.setting];
                const checkboxImage = isChecked ? el.checkedImage : el.uncheckedImage;
                const imageUrl = checkboxImage ? getElementAssetUrl(checkboxImage) : null;
                
                return <div key={el.id} style={style} className="flex items-center gap-2">
                    {imageUrl ? (
                        <img 
                            src={imageUrl} 
                            alt={isChecked ? 'checked' : 'unchecked'}
                            onClick={() => onSettingsChange(el.setting, !isChecked)}
                            className="h-5 w-5 cursor-pointer object-contain"
                        />
                    ) : (
                        <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={e => onSettingsChange(el.setting, e.target.checked)} 
                            className="h-5 w-5"
                            style={el.checkboxColor ? { accentColor: el.checkboxColor } : {}}
                        />
                    )}
                    <label style={fontSettingsToStyle(el.font)}>{el.text}</label>
                </div>
            }
            case UIElementType.SaveSlotGrid: {
                const el = element as UISaveSlotGridElement;
                const isSaveMode = screenId === project.ui.saveScreenId;
                
                return (
                    <div key={el.id} style={style} className="grid grid-cols-2 gap-4 overflow-y-auto p-2">
                        {Array.from({ length: el.slotCount }).map((_, i) => {
                            const slotData = gameSaves[i + 1];
                            const action: VNUIAction = isSaveMode
                                ? { type: UIActionType.SaveGame, slotNumber: i + 1 }
                                : { type: UIActionType.LoadGame, slotNumber: i + 1 };
                            
                            return (
                                <button
                                    key={i}
                                    onClick={() => {
                                        if (!isSaveMode && !slotData) return; // Can't load an empty slot
                                        onAction(action);
                                    }}
                                    disabled={!isSaveMode && !slotData}
                                    className="aspect-video bg-slate-800/80 p-3 rounded-lg border-2 border-slate-600 hover:border-sky-400 disabled:opacity-50 disabled:hover:border-slate-600 flex flex-col justify-between text-left"
                                    style={fontSettingsToStyle(el.font)}
                                >
                                    <p className="font-bold text-sky-300">Slot {i + 1}</p>
                                    {slotData ? (
                                        <div className="text-sm">
                                            <p className="truncate">{slotData.sceneName}</p>
                                            <p className="text-slate-400">{new Date(slotData.timestamp).toLocaleString()}</p>
                                        </div>
                                    ) : (
                                        <div className="flex-grow flex items-center justify-center text-slate-500">{el.emptySlotText}</div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )
            }
            case UIElementType.CharacterPreview: {
                const el = element as UICharacterPreviewElement;
                const character = project.characters[el.characterId];
                if (!character) return null;
                
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
                
                // Add layer assets
                Object.values(character.layers).forEach((layer: VNCharacterLayer) => {
                    const variableId = el.layerVariableMap[layer.id];
                    let asset = null;
                    
                    if (variableId && variables) {
                        // Get asset from variable
                        const index = Number(variables[variableId]) || 0;
                        const assetArray = Object.values(layer.assets);
                        asset = assetArray[index];
                    } else if (defaultExpression && defaultExpression.layerConfiguration[layer.id]) {
                        // Get asset from default expression
                        const assetId = defaultExpression.layerConfiguration[layer.id];
                        asset = assetId ? layer.assets[assetId] : null;
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
            default: return null;
        }
    }

    return (
        <div className="absolute inset-0 w-full h-full">
            {getBackgroundElement()}
            {Object.values(screen.elements).map(element => renderElement(element as VNUIElement, variables, project))}
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
    const [settings, setSettings] = useState<GameSettings>(defaultSettings);
    const [playerState, setPlayerState] = useState<PlayerState | null>(null);
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
    
    const musicAudioRef = useRef<HTMLAudioElement>(new Audio());
    const ambientNoiseAudioRef = useRef<HTMLAudioElement>(new Audio());
    const audioFadeInterval = useRef<number | null>(null);
    const ambientFadeInterval = useRef<number | null>(null);
    // Stage ref used for measuring pixel size for accurate slide animations
    const stageRef = useRef<HTMLDivElement | null>(null);
    const stageSize = useStageSize(stageRef);
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
    const lastProcessedCommandRef = useRef<{ sceneId: VNID; index: number; commandId: VNID } | null>(null);

    const assetResolver = useCallback((assetId: VNID | null, type: 'audio' | 'video' | 'image'): string | null => {
        console.log('[AssetResolver] Called with assetId:', assetId, 'type:', type);
        if (!assetId) {
            console.log('[AssetResolver] No assetId provided, returning null');
            return null;
        }
        let resolvedUrl: string | null = null;
        switch(type) {
            case 'audio': 
                resolvedUrl = project.audio[assetId]?.audioUrl || null;
                console.log('[AssetResolver] Audio asset lookup:', assetId, '→', resolvedUrl);
                return resolvedUrl;
            case 'video': 
                resolvedUrl = project.videos[assetId]?.videoUrl || null;
                console.log('[AssetResolver] Video asset lookup:', assetId, '→', resolvedUrl);
                return resolvedUrl;
            case 'image': {
                // First, check backgrounds, as that's the primary source for UI images
                if (project.backgrounds[assetId]) {
                    const bg = project.backgrounds[assetId];
                    resolvedUrl = bg.videoUrl || bg.imageUrl || null;
                    console.log('[AssetResolver] Background asset lookup:', assetId, '→', resolvedUrl);
                    return resolvedUrl;
                }
                // Check images
                if (project.images && project.images[assetId]) {
                    const img = project.images[assetId];
                    resolvedUrl = img.videoUrl || img.imageUrl || null;
                    console.log('[AssetResolver] Image asset lookup:', assetId, '→', resolvedUrl);
                    return resolvedUrl;
                }
                // As a fallback, check all character assets. This is less efficient but more robust.
                for (const charId in project.characters) {
                    const char = project.characters[charId];
                    // A character's base image ID is the character's ID itself
                    if (char.id === assetId) {
                        resolvedUrl = char.baseVideoUrl || char.baseImageUrl || null;
                        console.log('[AssetResolver] Character base asset lookup:', assetId, '→', resolvedUrl);
                        return resolvedUrl;
                    }
                    for (const layerId in char.layers) {
                        const layer = char.layers[layerId];
                        if (layer.assets[assetId]) {
                            const asset = layer.assets[assetId];
                            resolvedUrl = asset.videoUrl || asset.imageUrl || null;
                            console.log('[AssetResolver] Character layer asset lookup:', assetId, '→', resolvedUrl);
                            return resolvedUrl;
                        }
                    }
                }
                console.log('[AssetResolver] Image asset not found for:', assetId);
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
        // Use different interval refs for different audio elements
        const intervalRef = audioElement === musicAudioRef.current ? audioFadeInterval : ambientFadeInterval;
        
        if (intervalRef.current) clearInterval(intervalRef.current);
        
        const startVolume = audioElement.volume;
        const volumeChange = targetVolume - startVolume;
        if (duration === 0) {
            audioElement.volume = targetVolume;
            onComplete?.();
            return;
        }
        
        const startTime = Date.now();

        intervalRef.current = window.setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            const progress = Math.min(elapsedTime / (duration * 1000), 1);
            audioElement.volume = startVolume + volumeChange * progress;

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
    }, [fadeAudio]);

    // --- Save/Load System ---
    const getGameSaves = useCallback((): Record<number, GameStateSave> => {
        try {
            const savesJson = localStorage.getItem(`vn-saves-${project.id}`);
            return savesJson ? JSON.parse(savesJson) : {};
        } catch (e) {
            console.warn("Failed to load saves from localStorage:", e);
            return {};
        }
    }, [project.id]);

    const saveGameSaves = useCallback((saves: Record<number, GameStateSave>) => {
        try {
            localStorage.setItem(`vn-saves-${project.id}`, JSON.stringify(saves));
            savesPersistentRef.current = true;
        } catch (e) {
            console.error("Failed to save to localStorage:", e);
            // switch to in-memory saves and mark persistence as false to avoid repeated attempts
            savesPersistentRef.current = false;
            inMemorySavesRef.current = saves;
            // Could show a user notification here
        }
    }, [project.id]);

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
        setGameSaves(getGameSaves());
    }, [getGameSaves, screenStack]);

    const saveGame = (slotNumber: number) => {
        if (!playerState) return;
        const musicCurrentTime = musicAudioRef.current ? musicAudioRef.current.currentTime : 0;
        const finalMusicState: MusicState = {
            ...playerState.musicState,
            currentTime: musicCurrentTime,
            isPlaying: !musicAudioRef.current.paused,
        };
        const saves = getGameSaves();
        saves[slotNumber] = {
            timestamp: Date.now(),
            sceneName: project.scenes[playerState.currentSceneId]?.name || 'Unknown Scene',
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
        // If persistence failed previously, store in memory and avoid hitting localStorage repeatedly
        if (!savesPersistentRef.current) {
            inMemorySavesRef.current = saves;
        } else {
            saveGameSaves(saves);
        }
        setGameSaves(saves);
    };

    const loadGame = (slotNumber: number) => {
        stopAndResetMusic();
        const saves = savesPersistentRef.current ? getGameSaves() : inMemorySavesRef.current;
        const saveData = saves[slotNumber];
        if (saveData) {
            setPlayerState({
                mode: 'playing',
                currentSceneId: saveData.playerStateData.currentSceneId,
                currentCommands: saveData.playerStateData.currentCommands || project.scenes[saveData.playerStateData.currentSceneId]?.commands || [],
                currentIndex: saveData.playerStateData.currentIndex ?? 0,
                commandStack: saveData.playerStateData.commandStack || [],
                variables: saveData.playerStateData.variables,
                stageState: saveData.playerStateData.stageState,
                uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null },
                musicState: saveData.playerStateData.musicState,
            });
            setScreenStack([]);
            setHudStack([]);
            setIsJustLoaded(true);
        }
    };


    // --- State Initialization ---
    const startNewGame = useCallback(() => {
        stopAndResetMusic();
        
        // Use menuVariables (which may have been modified by character customization) instead of defaults
        const initialVariables: Record<VNID, string | number | boolean> = { ...menuVariables };

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
                console.log(`Start scene "${startScene.name}" conditions not met, using fallback`);
                startSceneId = startScene.fallbackSceneId;
            }
        }

        setPlayerState({
            mode: 'playing',
            currentSceneId: startSceneId,
            currentCommands: project.scenes[startSceneId]?.commands || [],
            currentIndex: 0,
            commandStack: [],
            variables: initialVariables,
            stageState: { backgroundUrl: null, characters: {}, textOverlays: [], imageOverlays: [], buttonOverlays: [], screen: { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0, transitionDuration: 0.5 } },
            uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null },
            musicState: { audioId: null, loop: false, currentTime: 0, isPlaying: false },
        });
        setScreenStack([]);
        setHudStack([]);
    }, [project, stopAndResetMusic, menuVariables]);

    const evaluateConditions = useCallback((conditions: VNCondition[] | undefined, variables: PlayerState['variables']): boolean => {
        if (!conditions || conditions.length === 0) {
            return true;
        }
    
        return conditions.every(condition => {
            const varValue = variables[condition.variableId];
            const projectVar = project.variables[condition.variableId];
            // Use default value if runtime value is not set
            const effectiveVarValue = varValue !== undefined ? varValue : (projectVar ? projectVar.defaultValue : undefined);
    
            if (effectiveVarValue === undefined) {
                return false; // condition on non-existent variable is false
            }
            
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
    }, [project.variables]);

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
                console.log(`Scene "${scene.name}" conditions failed, jumping to fallback: ${scene.fallbackSceneId}`);
                sceneToPlay = scene.fallbackSceneId;
            } else {
                // No fallback, find next scene in scene list
                const sceneIds = Object.keys(project.scenes);
                const currentIndex = sceneIds.indexOf(sceneToPlay);
                if (currentIndex !== -1 && currentIndex < sceneIds.length - 1) {
                    sceneToPlay = sceneIds[currentIndex + 1];
                    console.log(`Scene "${scene.name}" conditions failed, trying next scene: ${sceneToPlay}`);
                } else {
                    console.log(`Scene "${scene.name}" conditions failed and no fallback/next scene available`);
                    return sceneToPlay; // Can't go anywhere, return current
                }
            }

            attempts++;
        }

        console.error('Scene navigation exceeded max attempts - possible circular fallback');
        return targetSceneId;
    }, [project.scenes, evaluateConditions]);

    // --- Audio Management ---
     useEffect(() => {
        const audio = musicAudioRef.current;
        const isInMenu = playerState?.mode !== 'playing';

        if (!isInMenu) {
            // When leaving menu, stop menu music and ambient noise
            if (!audio.paused) {
                fadeAudio(audio, 0, 0.5, () => audio.pause());
            }
            const ambientAudio = ambientNoiseAudioRef.current;
            if (ambientAudio && !ambientAudio.paused) {
                fadeAudio(ambientAudio, 0, 0.5, () => ambientAudio.pause());
            }
            return;
        }
        
        const activeScreen = screenStack.length > 0 ? project.uiScreens[screenStack[screenStack.length - 1]] : null;
        if (!activeScreen) {
            if (!audio.paused) fadeAudio(audio, 0, 0.5, () => audio.pause());
            return;
        }
        
        const musicInfo = activeScreen.music;

        if (playerState?.mode === 'paused' && musicInfo.policy === 'continue') {
            return;
        }

        const newAudioUrl = musicInfo?.audioId ? assetResolver(musicInfo.audioId, 'audio') : null;
        const currentSrcPath = audio.src ? new URL(audio.src, window.location.href).pathname : null;
        const newSrcPath = newAudioUrl ? new URL(newAudioUrl, window.location.href).pathname : null;
        
        if (currentSrcPath !== newSrcPath) {
            if (!audio.paused) {
                fadeAudio(audio, 0, 0.5, () => {
                    if (newAudioUrl) {
                        console.log(`Playing menu music: ${newAudioUrl}`);
                        audio.src = newAudioUrl;
                        audio.load();
                        audio.loop = true;
                        audio.play().then(() => {
                            console.log("Menu music started successfully");
                            fadeAudio(audio, settings.musicVolume, 0.5);
                        }).catch(e => {
                            console.error("Menu music play failed:", e);
                            // Queue music if autoplay blocked
                            if (!userGestureDetectedRef.current) {
                                console.log("Queueing menu music for user gesture");
                                queuedMusicRef.current = { url: newAudioUrl, loop: true, fadeDuration: 0.5 };
                            }
                            audio.volume = settings.musicVolume;
                        });
                    } else {
                        audio.pause();
                    }
                });
            } else if (newAudioUrl) {
                console.log(`Starting paused menu music: ${newAudioUrl}`);
                audio.src = newAudioUrl;
                audio.load();
                audio.loop = true;
                audio.play().then(() => {
                    console.log("Menu music started successfully");
                    fadeAudio(audio, settings.musicVolume, 0.5);
                }).catch(e => {
                    console.error("Menu music play failed:", e);
                    // Queue music if autoplay blocked
                    if (!userGestureDetectedRef.current) {
                        console.log("Queueing menu music for user gesture");
                        queuedMusicRef.current = { url: newAudioUrl, loop: true, fadeDuration: 0.5 };
                    }
                    audio.volume = settings.musicVolume;
                });
            }
        } else if (audio.paused && newAudioUrl) {
            console.log(`Resuming menu music`);
            audio.play().then(() => {
                console.log("Menu music resumed successfully");
                fadeAudio(audio, settings.musicVolume, 0.5);
            }).catch(e => {
                console.error("Menu music resume failed:", e);
                // Queue music if autoplay blocked
                if (!userGestureDetectedRef.current) {
                    console.log("Queueing menu music for user gesture");
                    queuedMusicRef.current = { url: newAudioUrl, loop: true, fadeDuration: 0.5 };
                }
            });
        }

    }, [screenStack, playerState, project.uiScreens, assetResolver, settings.musicVolume, fadeAudio]);
    
    useEffect(() => { if (musicAudioRef.current) musicAudioRef.current.volume = settings.musicVolume; }, [settings.musicVolume]);

    // Ambient Noise Management
    useEffect(() => {
        const audio = ambientNoiseAudioRef.current;
        const isInMenu = playerState?.mode !== 'playing';

        if (!isInMenu) {
            // When leaving menu, stop ambient noise
            if (audio && !audio.paused) {
                fadeAudio(audio, 0, 0.5, () => audio.pause());
            }
            return;
        }
        
        const activeScreen = screenStack.length > 0 ? project.uiScreens[screenStack[screenStack.length - 1]] : null;
        if (!activeScreen) {
            if (!audio.paused) fadeAudio(audio, 0, 0.5, () => audio.pause());
            return;
        }
        
        const ambientInfo = activeScreen.ambientNoise;

        if (playerState?.mode === 'paused' && ambientInfo.policy === 'continue') {
            return;
        }

        const newAudioUrl = ambientInfo?.audioId ? assetResolver(ambientInfo.audioId, 'audio') : null;
        const currentSrcPath = audio.src ? new URL(audio.src, window.location.href).pathname : null;
        const newSrcPath = newAudioUrl ? new URL(newAudioUrl, window.location.href).pathname : null;
        
        if (currentSrcPath !== newSrcPath) {
            if (!audio.paused) {
                fadeAudio(audio, 0, 0.5, () => {
                    if (newAudioUrl) {
                        console.log(`Playing ambient noise: ${newAudioUrl}`);
                        audio.src = newAudioUrl;
                        audio.load();
                        audio.loop = true;
                        audio.play().then(() => {
                            console.log("Ambient noise started successfully");
                            fadeAudio(audio, settings.sfxVolume, 0.5);
                        }).catch(e => {
                            console.error("Ambient noise play failed:", e);
                            audio.volume = settings.sfxVolume;
                        });
                    } else {
                        audio.pause();
                    }
                });
            } else if (newAudioUrl) {
                console.log(`Starting paused ambient noise: ${newAudioUrl}`);
                audio.src = newAudioUrl;
                audio.load();
                audio.loop = true;
                audio.play().then(() => {
                    console.log("Ambient noise started successfully");
                    fadeAudio(audio, settings.sfxVolume, 0.5);
                }).catch(e => {
                    console.error("Ambient noise play failed:", e);
                    audio.volume = settings.sfxVolume;
                });
            }
        } else if (audio.paused && newAudioUrl) {
            console.log(`Resuming ambient noise`);
            audio.play().then(() => {
                console.log("Ambient noise resumed successfully");
                fadeAudio(audio, settings.sfxVolume, 0.5);
            }).catch(e => {
                console.error("Ambient noise resume failed:", e);
            });
        }

    }, [screenStack, playerState, project.uiScreens, assetResolver, settings.sfxVolume, fadeAudio]);
    
    useEffect(() => { if (ambientNoiseAudioRef.current) ambientNoiseAudioRef.current.volume = settings.sfxVolume; }, [settings.sfxVolume]);

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
        console.log('[SFX] playSound called with soundId:', soundId, 'volume:', volume);
        if (!soundId) return;
        
        try {
            const url = assetResolver(soundId, 'audio');
            console.log('[SFX] assetResolver returned URL:', url, 'for soundId:', soundId);
            if (!url) {
                console.warn(`[SFX] No audio URL found for soundId: ${soundId}`);
                return;
            }

            // Use HTMLAudio for SFX - more reliable in packaged environments
            console.log('[SFX] Creating HTMLAudio element for playback');
            const audio = new Audio(url);
            audio.volume = (typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 1.0) * settings.sfxVolume;
            
            // Limit simultaneous SFX
            if (sfxPoolRef.current.length >= MAX_SIMULTANEOUS_SFX) {
                const oldest = sfxPoolRef.current.shift();
                try { 
                    oldest?.pause(); 
                    oldest!.currentTime = 0; 
                } catch (e) {}
            }
            
            sfxPoolRef.current.push(audio);
            console.log('[SFX] Playing audio, volume:', audio.volume);
            
            audio.play()
                .then(() => {
                    console.log('[SFX] Audio playback started successfully');
                })
                .catch(e => {
                    console.error('[SFX] Audio playback failed:', e);
                });
            
            // Remove from pool when ended
            audio.addEventListener('ended', () => {
                console.log('[SFX] Audio playback ended');
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
        if (!playerState || playerState.mode !== 'playing') {
            lastProcessedCommandRef.current = null;
            return;
        }

        if (playerState.uiState.isWaitingForInput || playerState.uiState.isTransitioning || playerState.uiState.choices) {
            return;
        }

        // Pause command execution while any HUD screen is shown
        if (hudStack.length > 0) {
            return;
        }

        const command = playerState.currentCommands[playerState.currentIndex];
        if (!command) { 
            console.log('End of commands - checking stack', {
                currentIndex: playerState.currentIndex,
                totalCommands: playerState.currentCommands.length,
                sceneId: playerState.currentSceneId,
                commandStackLength: playerState.commandStack.length
            });
            if (playerState.commandStack.length > 0) {
                const popped = playerState.commandStack[playerState.commandStack.length - 1];
                setPlayerState(p => {
                    if (!p) return null;
                    const newStack = p.commandStack.slice(0, -1);
                    return { ...p, currentSceneId: popped.sceneId, currentCommands: popped.commands, currentIndex: popped.index, commandStack: newStack };
                });
            } else {
                console.log('End of scene - trying to advance to next scene');
                // Try to find the next scene in the list
                const sceneIds = Object.keys(project.scenes);
                const currentSceneIndex = sceneIds.indexOf(playerState.currentSceneId);
                
                if (currentSceneIndex !== -1 && currentSceneIndex < sceneIds.length - 1) {
                    // There are more scenes after this one
                    const nextSceneId = navigateToScene(sceneIds[currentSceneIndex + 1], playerState.variables);
                    const nextScene = project.scenes[nextSceneId];
                    
                    if (nextScene) {
                        console.log(`Advancing to next scene: ${nextSceneId}`);
                        setPlayerState(p => p ? {
                            ...p,
                            currentSceneId: nextSceneId,
                            currentCommands: nextScene.commands,
                            currentIndex: 0
                        } : null);
                    } else {
                        // No valid next scene found, return to title
                        console.log('No valid next scene - returning to title');
                        stopAndResetMusic();
                        stopAllSfx();
                        setPlayerState(null);
                        if (project.ui.titleScreenId) {
                            setScreenStack([project.ui.titleScreenId]);
                        }
                    }
                } else {
                    // This is the last scene or scene not found in list
                    console.log('Last scene completed - returning to title');
                    stopAndResetMusic();
                    stopAllSfx();
                    setPlayerState(null);
                    if (project.ui.titleScreenId) {
                        setScreenStack([project.ui.titleScreenId]);
                    }
                }
            }
            lastProcessedCommandRef.current = null;
            return; 
        }

        const commandSignature = {
            sceneId: playerState.currentSceneId,
            index: playerState.currentIndex,
            commandId: command.id,
        };
        const lastSignature = lastProcessedCommandRef.current;
        // Prevent re-processing the same command when React replays the effect (e.g., StrictMode).
        if (
            lastSignature &&
            lastSignature.sceneId === commandSignature.sceneId &&
            lastSignature.index === commandSignature.index &&
            lastSignature.commandId === commandSignature.commandId
        ) {
            return;
        }
        lastProcessedCommandRef.current = commandSignature;

        if (!evaluateConditions(command.conditions, playerState.variables)) {
            setPlayerState(p => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
            return;
        }

        const advance = () => {
            const nextIndex = playerState.currentIndex + 1;
            if (nextIndex >= playerState.currentCommands.length) {
                if (playerState.commandStack.length > 0) {
                    const popped = playerState.commandStack[playerState.commandStack.length - 1];
                    setPlayerState(p => {
                        if (!p) return null;
                        const newStack = p.commandStack.slice(0, -1);
                        return { ...p, currentSceneId: popped.sceneId, currentCommands: popped.commands, currentIndex: popped.index, commandStack: newStack };
                    });
                } else {
                    // Scene ended, try to advance to next scene
                    const sceneIds = Object.keys(project.scenes);
                    const currentSceneIndex = sceneIds.indexOf(playerState.currentSceneId);
                    
                    if (currentSceneIndex !== -1 && currentSceneIndex < sceneIds.length - 1) {
                        const nextSceneId = navigateToScene(sceneIds[currentSceneIndex + 1], playerState.variables);
                        const nextScene = project.scenes[nextSceneId];
                        
                        if (nextScene) {
                            setPlayerState(p => p ? {
                                ...p,
                                currentSceneId: nextSceneId,
                                currentCommands: nextScene.commands,
                                currentIndex: 0
                            } : null);
                            return;
                        }
                    }
                    
                    // No more scenes, return to title
                    stopAndResetMusic();
                    stopAllSfx();
                    setPlayerState(null);
                    if (project.ui.titleScreenId) {
                        setScreenStack([project.ui.titleScreenId]);
                    }
                }
            } else {
                setPlayerState(p => p ? { ...p, currentIndex: nextIndex } : null);
            }
        };

        // Check if this command should run asynchronously (in parallel with subsequent commands)
        const shouldRunAsync = command.modifiers?.runAsync === true;
        
        let instantAdvance = true;
        (async () => {
            switch (command.type) {
                case CommandType.Dialogue: {
                    instantAdvance = false;
                    const cmd = command as DialogueCommand;
                    const char = cmd.characterId ? project.characters[cmd.characterId] : null;
                    setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true, dialogue: { text: cmd.text, characterName: char?.name || 'Narrator', characterColor: char?.color || '#FFFFFF' } } } : null);
                    break;
                }
                case CommandType.SetBackground: {
                    instantAdvance = false;
                    const cmd = command as SetBackgroundCommand;
                    const newUrl = assetResolver(cmd.backgroundId, 'image');
                    const { isVideo, loop } = getAssetMetadata(cmd.backgroundId, 'image');
                    const duration = cmd.duration ?? 1;

                    if (!newUrl) {
                        console.warn(`Background not found: ${cmd.backgroundId}`);
                        advance();
                        break;
                    }

                    // Preload the media to prevent it flashing before the animation starts
                    const preloadMedia = () => new Promise<void>((resolve, reject) => {
                        if (isVideo) {
                            const video = document.createElement('video');
                            video.src = newUrl;
                            video.preload = 'auto';
                            video.onerror = () => reject(new Error(`Failed to load background video: ${newUrl}`));
                            video.onloadeddata = () => resolve();
                        } else {
                            const img = new Image();
                            img.src = newUrl;
                            img.onerror = () => reject(new Error(`Failed to load background image: ${newUrl}`));
                            img.onload = () => resolve();
                        }
                    });

                    try {
                        await preloadMedia();
                    } catch (error) {
                        console.error(error);
                        advance();
                        break;
                    }

                    // Media is loaded, now we can start the transition
                    let transitionElement: React.ReactNode = null;
                    
                    if (cmd.transition === 'instant' || !cmd.transition) {
                        setPlayerState(p => p ? { 
                            ...p, 
                            stageState: { ...p.stageState, backgroundUrl: newUrl, backgroundIsVideo: isVideo, backgroundLoop: loop }, 
                            currentIndex: p.currentIndex + 1 
                        } : null);
                        break;
                    }

                    // Create appropriate transition element based on media type
                    const MediaElement = isVideo ? 'video' : 'img';
                    const mediaProps: any = isVideo 
                        ? { autoPlay: true, muted: true, loop, playsInline: true }
                        : { alt: '' };

                    if (cmd.transition === 'cross-fade') {
                        // Start with opacity 0
                        transitionElement = <MediaElement key={Date.now()} src={newUrl} {...mediaProps} className="absolute inset-0 w-full h-full object-cover z-0" style={{ opacity: 0, transition: `opacity ${duration}s ease-in-out` }} />;
                        // After a short delay, update to opacity 1 to trigger the CSS transition
                        setTimeout(() => {
                            setPlayerState(p => {
                                if (!p) return null;
                                const el = <MediaElement key={Date.now()} src={newUrl} {...mediaProps} className="absolute inset-0 w-full h-full object-cover z-0" style={{ opacity: 1, transition: `opacity ${duration}s ease-in-out` }} />;
                                return { ...p, uiState: { ...p.uiState, transitionElement: el }};
                            });
                        }, 50);
                    } else if (cmd.transition === 'fade') {
                        // Fade to black, then from black
                        transitionElement = <div key={Date.now()} className="absolute inset-0 z-0 bg-black" style={{ animation: `dissolve-in ${duration / 2}s forwards` }} />;
                        setTimeout(() => {
                            setPlayerState(p => {
                                if (!p) return null;
                                const el = <div key={Date.now()+1} className="absolute inset-0 z-0 bg-black" style={{ animation: `fade-out ${duration / 2}s forwards` }} />;
                                return { ...p, stageState: { ...p.stageState, backgroundUrl: newUrl, backgroundIsVideo: isVideo, backgroundLoop: loop }, uiState: { ...p.uiState, transitionElement: el } };
                            });
                        }, duration * 500);
                    } else {
                        // Other wipe/slide transitions
                        let transitionClass = '';
                        switch(cmd.transition) {
                            case 'dissolve': transitionClass = 'transition-dissolve'; break;
                            case 'slide': transitionClass = 'transition-slide-in-right'; break;
                            case 'iris-in': transitionClass = 'transition-iris-in'; break;
                            case 'wipe-right': transitionClass = 'transition-wipe-right'; break;
                        }
                        transitionElement = <MediaElement key={Date.now()} src={newUrl} {...mediaProps} className={`absolute inset-0 w-full h-full object-cover z-0 transition-base ${transitionClass}`} style={{animationDuration: `${duration}s`}} />;
                    }
                    
                    // Set the initial transition state
                    setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, isTransitioning: true, transitionElement } } : null);

                    // Set a timeout to clean up after the transition animation
                    setTimeout(() => {
                        setPlayerState(p => {
                            if (!p) return null;
                            return {
                                ...p,
                                stageState: { ...p.stageState, backgroundUrl: newUrl, backgroundIsVideo: isVideo, backgroundLoop: loop }, // Finalize the background change
                                uiState: { ...p.uiState, isTransitioning: false, transitionElement: null },
                                currentIndex: p.currentIndex + 1,
                            };
                        });
                    }, duration * 1000 + 100); // Add a small buffer
                    break;
                }
                case CommandType.ShowCharacter: {
                    const cmd = command as ShowCharacterCommand;
                    const charData = project.characters[cmd.characterId];
                    const exprData = charData?.expressions[cmd.expressionId];
                    if (charData && exprData) {
                        const imageUrls: string[] = [];
                        const videoUrls: string[] = [];
                        let hasVideo = false;
                        let videoLoop = false;
                        
                        // Check base image/video
                        if (charData.baseVideoUrl) {
                            videoUrls.push(charData.baseVideoUrl);
                            hasVideo = true;
                            videoLoop = !!charData.baseVideoLoop;
                        } else if (charData.baseImageUrl) {
                            imageUrls.push(charData.baseImageUrl);
                        }
                        
                        // Build layer variable bindings by checking all number variables
                        // If a variable name matches a layer name, use it
                        const layerBindings: Record<VNID, VNID> = {};
                        Object.values(charData.layers).forEach((layer: VNCharacterLayer) => {
                            // Check if there's a number variable with matching name
                            const matchingVar = Object.values(project.variables).find((v: any) => 
                                v.type === 'number' && (
                                    v.name.toLowerCase().includes(layer.name.toLowerCase()) ||
                                    layer.name.toLowerCase().includes(v.name.toLowerCase())
                                )
                            );
                            if (matchingVar) {
                                layerBindings[layer.id] = (matchingVar as any).id;
                            }
                        });
                        
                        // Merge with existing bindings
                        const existingChar = playerState?.stageState.characters[cmd.characterId];
                        const finalBindings = { ...layerBindings, ...(existingChar?.layerVariableBindings || {}) };
                        
                        // Check layer assets - respect variable bindings
                        Object.values(charData.layers).forEach((layer: VNCharacterLayer) => {
                            let asset = null;
                            
                            // Check if this layer has a variable binding
                            const variableId = finalBindings[layer.id];
                            if (variableId && playerState.variables[variableId] !== undefined) {
                                // Use variable value as index into layer assets
                                const index = Number(playerState.variables[variableId]) || 0;
                                const assetArray = Object.values(layer.assets);
                                asset = assetArray[index];
                                console.log(`ShowCharacter: Using variable ${variableId} (value: ${index}) for layer "${layer.name}"`);
                            } else {
                                // Use expression configuration
                                const assetId = exprData.layerConfiguration[layer.id];
                                if (assetId) {
                                    asset = layer.assets[assetId];
                                    console.log(`ShowCharacter: Using expression config for layer "${layer.name}"`);
                                }
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
                        
                        // For slide transitions, use endPosition if specified, otherwise use position
                        const finalPosition = cmd.endPosition || cmd.position;
                        const startPosition = cmd.startPosition;
                        
                        // Use the requested transition (slide is now supported)
                        const requestedTransition = cmd.transition;
                        
                        console.log(`ShowCharacter: ${charData.name}, expression: ${exprData.name}, bindings:`, finalBindings, 'variables:', playerState.variables);
                        
                        setPlayerState(p => p ? { ...p, stageState: { ...p.stageState, characters: { ...p.stageState.characters, [cmd.characterId]: { 
                            charId: cmd.characterId, 
                            position: finalPosition, 
                            imageUrls, 
                            videoUrls,
                            isVideo: hasVideo,
                            videoLoop,
                            expressionId: cmd.expressionId,
                            layerVariableBindings: finalBindings,
                            transition: requestedTransition && requestedTransition !== 'instant' ? { 
                                type: requestedTransition, 
                                duration: cmd.duration ?? 0.5,
                                startPosition: startPosition,
                                action: 'show'
                            } : null 
                        }}} } : null);

                        // If there's a transition, wait for it to complete before advancing
                        if (cmd.transition && cmd.transition !== 'instant') {
                            instantAdvance = false;
                            setTimeout(() => advance(), ((cmd.duration ?? 0.5) * 1000) + 100);
                        }
                    }
                    break;
                }
                case CommandType.HideCharacter: {
                    const cmd = command as HideCharacterCommand;
                    // Use the requested transition (slide is now supported)
                    const hideTransitionType = cmd.transition;
                    if (hideTransitionType && hideTransitionType !== 'instant') {
                        // Block advancing while hide animation runs
                        instantAdvance = false;
                        // Set transition for hide animation, then remove after animation
                        setPlayerState(p => {
                            if (!p) return null;
                            const existingChar = p.stageState.characters[cmd.characterId];
                            if (!existingChar) return p; // Character not on stage, nothing to do
                            
                            // For slide transitions we already remapped to dissolve above; keep position unchanged
                            const finalPosition = existingChar.position;
                            const startPosition = undefined;
                            
                            return { 
                                ...p, 
                                stageState: { 
                                    ...p.stageState, 
                                    characters: { 
                                        ...p.stageState.characters, 
                                        [cmd.characterId]: { 
                                            ...existingChar,
                                            position: finalPosition,
                                            transition: { 
                                                type: hideTransitionType, 
                                                duration: cmd.duration ?? 0.5,
                                                startPosition: startPosition,
                                                endPosition: cmd.endPosition,
                                                action: 'hide'
                                            } 
                                        }
                                    }
                                }
                            };
                        });
                        // Remove character after transition duration, then advance
                        setTimeout(() => {
                            setPlayerState(p => {
                                if (!p) return null;
                                const { [cmd.characterId]: _, ...remaining } = p.stageState.characters;
                                return { ...p, stageState: { ...p.stageState, characters: remaining }};
                            });
                            // After removal, advance to next command
                            advance();
                        }, ((cmd.duration ?? 0.5) * 1000) + 100);
                    } else {
                        // Instant hide - remove immediately
                        setPlayerState(p => {
                            if (!p) return null;
                            const { [cmd.characterId]: _, ...remaining } = p.stageState.characters;
                            return { ...p, stageState: { ...p.stageState, characters: remaining }};
                        });
                    }
                    break;
                }
                case CommandType.Choice: {
                    instantAdvance = false;
                    const cmd = command as ChoiceCommand;
                    const availableChoices = cmd.options.filter(opt => evaluateConditions(opt.conditions, playerState.variables));
                    setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, choices: availableChoices }} : null);
                    break;
                }
                case CommandType.SetVariable: {
                    const cmd = command as SetVariableCommand;
                    setPlayerState(p => {
                        if (!p) return null;
                        const variable = project.variables[cmd.variableId];
                        if (!variable) {
                            console.warn(`SetVariable command failed: Variable with ID ${cmd.variableId} not found.`);
                            return p; // Return state unchanged
                        }
                        
                        const currentVal = p.variables[cmd.variableId];
                        const changeValStr = String(cmd.value);
                        let newVal: string | number | boolean = cmd.value;
                        
                        if (cmd.operator === 'add') {
                            newVal = (Number(currentVal) || 0) + (Number(changeValStr) || 0);
                        } else if (cmd.operator === 'subtract') {
                            newVal = (Number(currentVal) || 0) - (Number(changeValStr) || 0);
                        } else if (cmd.operator === 'random') {
                            // Generate random number within range (inclusive)
                            const min = cmd.randomMin ?? 0;
                            const max = cmd.randomMax ?? 100;
                            newVal = Math.floor(Math.random() * (max - min + 1)) + min;
                        } else { // 'set' operator
                            // Coerce the value to the correct type based on variable definition
                            switch (variable.type) {
                                case 'number':
                                    newVal = Number(changeValStr) || 0;
                                    break;
                                case 'boolean':
                                    newVal = changeValStr.toLowerCase() === 'true';
                                    break;
                                case 'string':
                                default:
                                    newVal = changeValStr;
                                    break;
                            }
                        }
                        return { ...p, variables: { ...p.variables, [cmd.variableId]: newVal }};
                    });
                    break;
                }
                case CommandType.TextInput: {
                    instantAdvance = false;
                    const cmd = command as TextInputCommand;
                    setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true, textInput: { variableId: cmd.variableId, prompt: cmd.prompt, placeholder: cmd.placeholder || '', maxLength: cmd.maxLength || 50 }}} : null);
                    break;
                }
                case CommandType.Jump: {
                    const cmd = command as JumpCommand;
                    const actualSceneId = navigateToScene(cmd.targetSceneId, playerState.variables);
                    const newScene = project.scenes[actualSceneId];
                    if (newScene) {
                        setPlayerState(p => p ? { ...p, currentSceneId: actualSceneId, currentCommands: newScene.commands, currentIndex: 0, commandStack: [] } : null);
                    } else {
                        console.error(`Scene not found: ${actualSceneId}`);
                        advance();
                    }
                    instantAdvance = false; // don't auto-advance after a jump
                    break;
                }
                case CommandType.PlayMusic: {
                    instantAdvance = false;
                    const cmd = command as PlayMusicCommand;
                    setPlayerState(p => p ? { 
                        ...p, 
                        uiState: { ...p.uiState, isTransitioning: true },
                            musicState: { audioId: cmd.audioId, loop: cmd.loop, currentTime: 0, isPlaying: true }
                    } : null);

                    const url = assetResolver(cmd.audioId, 'audio');

                    const onFinish = () => {
                        setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, isTransitioning: false }, currentIndex: p.currentIndex + 1 } : null);
                    };

                    if (!url) {
                        console.warn(`No audio URL found for audioId: ${cmd.audioId}`);
                        onFinish();
                        break;
                    }

                    const audio = musicAudioRef.current;
                    audio.loop = cmd.loop;
                    // Apply per-command volume if provided (0-1), else use global music volume
                    if (typeof cmd.volume === 'number') audio.volume = Math.max(0, Math.min(1, cmd.volume));
                    const currentSrcPath = audio.src ? new URL(audio.src, window.location.href).pathname : null;
                    const newSrcPath = url ? new URL(url, window.location.href).pathname : null;
                    const isNewTrack = currentSrcPath !== newSrcPath;
                    
                    const playAndFadeIn = () => {
                        audio.play().then(() => {
                            const target = (typeof cmd.volume === 'number') ? cmd.volume : settings.musicVolume;
                            fadeAudio(audio, target, cmd.fadeDuration, onFinish);
                        }).catch(e => {
                            console.error("Music play failed, queuing.", e);
                            queuedMusicRef.current = { url, loop: cmd.loop, fadeDuration: cmd.fadeDuration };
                            onFinish();
                        });
                    };

                    if (isNewTrack) {
                        fadeAudio(audio, 0, cmd.fadeDuration > 0 ? cmd.fadeDuration / 2 : 0, () => {
                            audio.src = url;
                            audio.load();

                            // Use named functions for listeners to ensure they can be removed
                            const handleCanPlay = () => {
                                playAndFadeIn();
                                audio.removeEventListener('error', handleError);
                            };
                            const handleError = (e: Event) => {
                                console.error("Music load failed:", e);
                                onFinish();
                                audio.removeEventListener('canplaythrough', handleCanPlay);
                            };
                            
                            audio.addEventListener('canplaythrough', handleCanPlay, { once: true });
                            audio.addEventListener('error', handleError, { once: true });
                        });
                    } else {
                        playAndFadeIn();
                    }
                    break;
                }
                 case CommandType.StopMusic: {
                    const cmd = command as StopMusicCommand;
                    if(musicAudioRef.current) {
                        fadeAudio(musicAudioRef.current, 0, cmd.fadeDuration, () => {
                            musicAudioRef.current?.pause();
                        });
                    }
                    setPlayerState(p => p ? { ...p, musicState: { audioId: null, loop: false, currentTime: 0, isPlaying: false }} : null);
                    break;
                }
                case CommandType.PlaySoundEffect: {
                    const pse = command as PlaySoundEffectCommand;
                    try {
                        playSound(pse.audioId, pse.volume);
                    } catch (e) {
                        console.error('Failed to play sound effect:', e);
                    }
                    break;
                }
                case CommandType.PlayMovie: {
                    instantAdvance = false;
                    setPlayerState(p => p ? {...p, uiState: {...p.uiState, isWaitingForInput: true, movieUrl: assetResolver((command as PlayMovieCommand).videoId, 'video')}} : null);
                    break;
                }
                case CommandType.Wait: {
                    instantAdvance = false;
                    const cmd = command as any;
                    const durationMs = ((cmd.duration ?? 1) * 1000);

                    // If waitForInput is enabled, allow user input (click or key) to advance early
                    if (cmd.waitForInput) {
                        // Don't set isWaitingForInput - it blocks the game loop
                        // Instead, just set up listeners that will call advance() directly
                        let timeoutId: number | null = window.setTimeout(() => {
                            // timeout elapsed, advance
                            advance();
                            removeListeners();
                        }, durationMs);

                        const onUserAdvance = () => {
                            if (timeoutId) {
                                clearTimeout(timeoutId);
                                timeoutId = null;
                            }
                            advance();
                            removeListeners();
                        };

                        const keyHandler = (e: KeyboardEvent) => {
                            if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') onUserAdvance();
                        };
                        const clickHandler = () => onUserAdvance();

                        const removeListeners = () => {
                            window.removeEventListener('keydown', keyHandler);
                            window.removeEventListener('click', clickHandler);
                        };

                        window.addEventListener('keydown', keyHandler);
                        window.addEventListener('click', clickHandler);
                    } else {
                        // No user input allowed, just wait for duration
                        setTimeout(() => advance(), durationMs);
                    }
                    break;
                }
                case CommandType.ShakeScreen: {
                    const cmd = command as ShakeScreenCommand;
                    setPlayerState(p => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, shake: { active: true, intensity: cmd.intensity }}}} : null);
                    setTimeout(() => setPlayerState(p => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, shake: { active: false, intensity: 0 }}}} : null), cmd.duration * 1000);
                    break;
                }
                case CommandType.TintScreen: {
                    const cmd = command as TintScreenCommand;
                    setPlayerState(p => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, tint: cmd.color, transitionDuration: cmd.duration }}} : null);
                    break;
                }
                case CommandType.PanZoomScreen: {
                     const cmd = command as PanZoomScreenCommand;
                    setPlayerState(p => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, zoom: cmd.zoom, panX: cmd.panX, panY: cmd.panY, transitionDuration: cmd.duration }}} : null);
                    break;
                }
                case CommandType.ResetScreenEffects: {
                    const cmd = command as ResetScreenEffectsCommand;
                    setPlayerState(p => p ? { ...p, stageState: { ...p.stageState, screen: { ...p.stageState.screen, tint: 'transparent', zoom: 1, panX: 0, panY: 0, transitionDuration: cmd.duration }}} : null);
                    break;
                }
                case CommandType.FlashScreen: {
                    const cmd = command as FlashScreenCommand;
                    setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, flash: { color: cmd.color, duration: cmd.duration }}} : null);
                    setTimeout(() => setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, flash: null }} : null), cmd.duration * 1000);
                    break;
                }
                case CommandType.ShowScreen: {
                    instantAdvance = false; // Pause execution when showing a screen/menu
                    const cmd = command as any;
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
                    const cmd = command as ShowTextCommand;
                    const interpolatedText = interpolateVariables(cmd.text, playerState.variables, project);
                    const overlay: TextOverlay = {
                        id: cmd.id,
                        text: interpolatedText,
                        x: cmd.x,
                        y: cmd.y,
                        fontSize: cmd.fontSize,
                        fontFamily: cmd.fontFamily,
                        color: cmd.color,
                        width: cmd.width,
                        height: cmd.height,
                        textAlign: cmd.textAlign,
                        verticalAlign: cmd.verticalAlign,
                        transition: cmd.transition !== 'instant' ? cmd.transition : undefined,
                        duration: cmd.duration,
                        action: 'show'
                    };
                    setPlayerState(p => p ? { ...p, stageState: { ...p.stageState, textOverlays: [...p.stageState.textOverlays, overlay] } } : null);

                    // If command specified a non-instant transition, wait for it before advancing
                    if (cmd.transition && cmd.transition !== 'instant') {
                        instantAdvance = false;
                        setTimeout(() => advance(), ((cmd.duration ?? 0.5) * 1000) + 100);
                    }
                    break;
                }
                case CommandType.ShowImage: {
                    const cmd = command as ShowImageCommand;
                    const imageUrl = assetResolver(cmd.imageId, 'image');
                    const { isVideo, loop } = getAssetMetadata(cmd.imageId, 'image');
                    if (imageUrl) {
                        const overlay: ImageOverlay = {
                            id: cmd.id,
                            imageUrl: !isVideo ? imageUrl : undefined,
                            videoUrl: isVideo ? imageUrl : undefined,
                            isVideo,
                            videoLoop: loop,
                            x: cmd.x,
                            y: cmd.y,
                            width: cmd.width,
                            height: cmd.height,
                            rotation: cmd.rotation,
                            opacity: cmd.opacity,
                            scaleX: cmd.scaleX ?? 1,
                            scaleY: cmd.scaleY ?? 1,
                            transition: cmd.transition !== 'instant' ? cmd.transition : undefined,
                            duration: cmd.duration,
                            action: 'show'
                        };
                        setPlayerState(p => p ? { ...p, stageState: { ...p.stageState, imageOverlays: [...p.stageState.imageOverlays, overlay] } } : null);

                        if (cmd.transition && cmd.transition !== 'instant') {
                            instantAdvance = false;
                            setTimeout(() => advance(), ((cmd.duration ?? 0.5) * 1000) + 100);
                        }
                    } else {
                        console.warn(`Image not found: ${cmd.imageId}`);
                    }
                    break;
                }
                case CommandType.Label: {
                    // Do nothing, just a marker
                    break;
                }
                case CommandType.JumpToLabel: {
                    const cmd = command as JumpToLabelCommand;
                    const labelIndex = playerState.currentCommands.findIndex(c => c.type === CommandType.Label && (c as LabelCommand).labelId === cmd.labelId);
                    if (labelIndex !== -1) {
                        setPlayerState(p => p ? { ...p, currentIndex: labelIndex } : null);
                    } else {
                        console.warn(`Label not found: ${cmd.labelId}`);
                        advance();
                    }
                    instantAdvance = false; // Don't advance after jump
                    break;
                }
                case CommandType.HideText: {
                    const cmd = command as HideTextCommand;
                    // Find overlay and perform animated hide if transition requested
                    setPlayerState(p => {
                        if (!p) return null;
                        const overlays = p.stageState.textOverlays;
                        const target = overlays.find(o => o.id === cmd.targetCommandId);
                        if (!target) return p; // nothing to hide

                        if (cmd.transition && cmd.transition !== 'instant') {
                            // mark overlay as hiding so render picks up hide class
                            const updated = overlays.map(o => o.id === cmd.targetCommandId ? { ...o, transition: cmd.transition, duration: cmd.duration, action: 'hide' as const } : o);
                            // schedule removal after duration
                            setTimeout(() => {
                                setPlayerState(inner => inner ? { ...inner, stageState: { ...inner.stageState, textOverlays: inner.stageState.textOverlays.filter(o => o.id !== cmd.targetCommandId) } } : null);
                                // advance after removal
                                advance();
                            }, ((cmd.duration ?? 0.5) * 1000) + 100);
                            // do not advance now (we'll advance after removal)
                            instantAdvance = false;
                            return { ...p, stageState: { ...p.stageState, textOverlays: updated } };
                        } else {
                            // instant remove
                            return { ...p, stageState: { ...p.stageState, textOverlays: overlays.filter(o => o.id !== cmd.targetCommandId) } };
                        }
                    });
                    break;
                }
                case CommandType.HideImage: {
                    const cmd = command as HideImageCommand;
                    setPlayerState(p => {
                        if (!p) return null;
                        const overlays = p.stageState.imageOverlays;
                        const target = overlays.find(o => o.id === cmd.targetCommandId);
                        if (!target) return p;

                        if (cmd.transition && cmd.transition !== 'instant') {
                            const updated = overlays.map(o => o.id === cmd.targetCommandId ? { ...o, transition: cmd.transition, duration: cmd.duration, action: 'hide' as const } : o);
                            setTimeout(() => {
                                setPlayerState(inner => inner ? { ...inner, stageState: { ...inner.stageState, imageOverlays: inner.stageState.imageOverlays.filter(o => o.id !== cmd.targetCommandId) } } : null);
                                advance();
                            }, ((cmd.duration ?? 0.5) * 1000) + 100);
                            instantAdvance = false;
                            return { ...p, stageState: { ...p.stageState, imageOverlays: updated } };
                        } else {
                            return { ...p, stageState: { ...p.stageState, imageOverlays: overlays.filter(o => o.id !== cmd.targetCommandId) } };
                        }
                    });
                    break;
                }
                case CommandType.ShowButton: {
                    const cmd = command as ShowButtonCommand;
                    
                    // Check show conditions
                    if (cmd.showConditions && cmd.showConditions.length > 0) {
                        const conditionsMet = cmd.showConditions.every(cond => evaluateConditions([cond]));
                        if (!conditionsMet) {
                            break; // Skip showing button if conditions not met
                        }
                    }
                    
                    const buttonOverlay: ButtonOverlay = {
                        id: cmd.id,
                        text: cmd.text,
                        x: cmd.x,
                        y: cmd.y,
                        width: cmd.width || 20,
                        height: cmd.height || 8,
                        anchorX: cmd.anchorX || 0.5,
                        anchorY: cmd.anchorY || 0.5,
                        backgroundColor: cmd.backgroundColor || '#6366f1',
                        textColor: cmd.textColor || '#ffffff',
                        fontSize: cmd.fontSize || 18,
                        fontWeight: cmd.fontWeight || 'normal',
                        borderRadius: cmd.borderRadius || 8,
                        imageUrl: cmd.image ? assetResolver(cmd.image.id, cmd.image.type) : null,
                        hoverImageUrl: cmd.hoverImage ? assetResolver(cmd.hoverImage.id, cmd.hoverImage.type) : null,
                        onClick: cmd.onClick,
                        clickSound: cmd.clickSound,
                        waitForClick: cmd.waitForClick,
                        transition: cmd.transition !== 'instant' ? cmd.transition : undefined,
                        duration: cmd.duration || 0.3,
                        action: 'show'
                    };
                    
                    setPlayerState(p => p ? { ...p, stageState: { ...p.stageState, buttonOverlays: [...p.stageState.buttonOverlays, buttonOverlay] } } : null);

                    if (cmd.transition && cmd.transition !== 'instant') {
                        instantAdvance = false;
                        if (cmd.waitForClick) {
                            // Has transition AND needs to wait for click
                            // Set waiting for input IMMEDIATELY to prevent game loop from advancing
                            setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true } } : null);
                        } else {
                            // Just transition, advance after
                            setTimeout(() => advance(), ((cmd.duration ?? 0.3) * 1000) + 100);
                        }
                    } else if (cmd.waitForClick) {
                        // No transition, but waiting for click - pause immediately
                        instantAdvance = false;
                        setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, isWaitingForInput: true } } : null);
                    }
                    break;
                }
                case CommandType.HideButton: {
                    const cmd = command as HideButtonCommand;
                    setPlayerState(p => {
                        if (!p) return null;
                        const overlays = p.stageState.buttonOverlays;
                        const target = overlays.find(o => o.id === cmd.targetCommandId);
                        if (!target) return p;

                        if (cmd.transition && cmd.transition !== 'instant') {
                            const updated = overlays.map(o => o.id === cmd.targetCommandId ? { ...o, transition: cmd.transition, duration: cmd.duration || 0.3, action: 'hide' as const } : o);
                            setTimeout(() => {
                                setPlayerState(inner => inner ? { ...inner, stageState: { ...inner.stageState, buttonOverlays: inner.stageState.buttonOverlays.filter(o => o.id !== cmd.targetCommandId) } } : null);
                                advance();
                            }, ((cmd.duration ?? 0.3) * 1000) + 100);
                            instantAdvance = false;
                            return { ...p, stageState: { ...p.stageState, buttonOverlays: updated } };
                        } else {
                            return { ...p, stageState: { ...p.stageState, buttonOverlays: overlays.filter(o => o.id !== cmd.targetCommandId) } };
                        }
                    });
                    break;
                }
            }
            
            // Handle command advancement based on async modifier
            if (shouldRunAsync) {
                // Run async: advance immediately, let command complete in background
                advance();
            } else if (instantAdvance) {
                // Normal: advance only if command was instant
                advance();
            }
            // If !shouldRunAsync && !instantAdvance, command will handle advancement itself (e.g., setTimeout)
        })();
    }, [playerState, project, assetResolver, playSound, evaluateConditions, fadeAudio, settings.musicVolume, startNewGame, stopAndResetMusic, stopAllSfx, hudStack]);

    // --- Input & Action Handlers ---
    const handleDialogueAdvance = () => {
        setPlayerState(p => p ? { ...p, currentIndex: p.currentIndex + 1, uiState: { ...p.uiState, isWaitingForInput: false, dialogue: null } } : null);
    };
    const handleChoiceSelect = (choice: ChoiceOption) => {
        setPlayerState(p => {
            if (!p) return null;
            let newState = { ...p };
            
            const actions = choice.actions || [];
            if (!choice.actions && choice.targetSceneId) {
                // FIX: 'targetSceneId' should be 'targetScreenId', but the type is wrong. The correct fix is in types/shared.ts
                actions.push({ type: UIActionType.JumpToScene, targetSceneId: (choice as any).targetSceneId });
            }

            for (const action of actions) {
                if (action.type === UIActionType.SetVariable) {
                    const setVarAction = action as SetVariableAction;
                    const variable = project.variables[setVarAction.variableId];
                    if (!variable) {
                        console.warn(`SetVariable action failed: Variable with ID ${setVarAction.variableId} not found.`);
                        continue; // Skip this action
                    }
                    
                    const currentVal = newState.variables[setVarAction.variableId];
                    const changeValStr = String(setVarAction.value);
                    let newVal: string | number | boolean = setVarAction.value;
    
                    if (setVarAction.operator === 'add') {
                        newVal = (Number(currentVal) || 0) + (Number(changeValStr) || 0);
                    } else if (setVarAction.operator === 'subtract') {
                        newVal = (Number(currentVal) || 0) - (Number(changeValStr) || 0);
                    } else if (setVarAction.operator === 'random') {
                        // Generate random number within range (inclusive)
                        const min = setVarAction.randomMin ?? 0;
                        const max = setVarAction.randomMax ?? 100;
                        newVal = Math.floor(Math.random() * (max - min + 1)) + min;
                    } else { // 'set' operator
                        // Coerce the value to the correct type based on variable definition
                        switch(variable.type) {
                            case 'number':
                                newVal = Number(changeValStr) || 0;
                                break;
                            case 'boolean':
                                newVal = changeValStr.toLowerCase() === 'true';
                                break;
                            case 'string':
                            default:
                                newVal = changeValStr;
                                break;
                        }
                    }
                    newState.variables = { ...newState.variables, [setVarAction.variableId]: newVal };
                }
            }
            
            newState.uiState = { ...newState.uiState, choices: null };
    
            // Handle jump last
            const jumpAction = actions.find(a => a.type === UIActionType.JumpToScene) as JumpToSceneAction | undefined;
            if (jumpAction) {
                const actualSceneId = navigateToScene(jumpAction.targetSceneId, newState.variables);
                const newScene = project.scenes[actualSceneId];
                if (newScene) {
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
        setPlayerState(p => p ? { 
            ...p, 
            currentIndex: p.currentIndex + 1, 
            variables: { ...p.variables, [p.uiState.textInput!.variableId]: value },
            uiState: { ...p.uiState, isWaitingForInput: false, textInput: null } 
        } : null);
    };

    const handleUIAction = (action: VNUIAction) => {
        console.log('handleUIAction called with:', action.type, action);
        
        if (!playerState && action.type === UIActionType.StartNewGame) {
            startNewGame();
        } else if (playerState?.mode === 'paused' && action.type === UIActionType.ReturnToGame) {
             setPlayerState(p => p ? { ...p, mode: 'playing' } : null);
             setScreenStack([]);
             // Resume music if it was paused
             if (musicAudioRef.current && musicAudioRef.current.paused && playerState.musicState.isPlaying) {
                 musicAudioRef.current.play().catch(e => console.error('Failed to resume music:', e));
             }
        } else if (action.type === UIActionType.GoToScreen) {
            const targetId = (action as GoToScreenAction).targetScreenId;
            if (playerState && playerState.mode === 'playing') {
                setHudStack(s => [...s, targetId]);
            } else {
                setScreenStack(stack => [...stack, targetId]);
            }
        } else if (action.type === UIActionType.ReturnToPreviousScreen) {
            if (playerState && playerState.mode === 'playing') {
                if (hudStack.length > 0) {
                    setHudStack(s => s.slice(0, -1));
                    // If we're closing the last HUD screen, advance to next command
                    if (hudStack.length === 1) {
                        setPlayerState(p => {
                            if (!p) return null;
                            // Clear button and image overlays when returning from HUD screen
                            return {
                                ...p,
                                currentIndex: p.currentIndex + 1,
                                stageState: {
                                    ...p.stageState,
                                    buttonOverlays: [],
                                    imageOverlays: []
                                }
                            };
                        });
                    }
                }
            } else {
                if (screenStack.length > 1) setScreenStack(stack => stack.slice(0, -1));
            }
        } else if (action.type === UIActionType.QuitToTitle) {
            stopAndResetMusic();
            stopAllSfx();
            setPlayerState(null);
            setHudStack([]);
            if (project.ui.titleScreenId) setScreenStack([project.ui.titleScreenId]);
        } else if (action.type === UIActionType.SaveGame) {
            saveGame((action as SaveGameAction).slotNumber);
        } else if (action.type === UIActionType.LoadGame) {
            loadGame((action as LoadGameAction).slotNumber);
        } else if (action.type === UIActionType.JumpToScene) {
            const jumpAction = action as JumpToSceneAction;
            const targetScene = project.scenes[jumpAction.targetSceneId];
            console.log('JumpToScene handler triggered:', {
                targetSceneId: jumpAction.targetSceneId,
                sceneExists: !!targetScene,
                sceneName: targetScene?.name,
                currentSceneId: playerState?.currentSceneId,
                hasPlayerState: !!playerState
            });
            if (!targetScene) {
                console.warn(`JumpToScene action failed: Scene with ID ${jumpAction.targetSceneId} not found.`);
                return;
            }
            
            // Fade out music before transitioning scenes
            const audio = musicAudioRef.current;
            if (!audio.paused) {
                fadeAudio(audio, 0, 0.5, () => {
                    audio.pause();
                    audio.currentTime = 0;
                });
            }
            
            // Clear screen and HUD stacks when jumping to a scene
            setScreenStack([]);
            setHudStack([]);
            
            // Clear the last processed command ref to allow new scene commands to execute
            lastProcessedCommandRef.current = null;
            
            // If playerState is null (jumping from title screen), initialize it
            if (!playerState) {
                console.log('Initializing playerState for scene jump from title');
                const initialVariables: Record<VNID, string | number | boolean> = {};
                for (const varId in project.variables) {
                    const v = project.variables[varId];
                    initialVariables[v.id] = v.defaultValue;
                }
                
                setPlayerState({
                    mode: 'playing',
                    currentSceneId: jumpAction.targetSceneId,
                    currentCommands: targetScene.commands,
                    currentIndex: 0,
                    commandStack: [],
                    variables: initialVariables,
                    stageState: { 
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
                            transitionDuration: 0.5 
                        } 
                    },
                    uiState: {
                        dialogue: null,
                        choices: null,
                        textInput: null,
                        movieUrl: null,
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
            } else {
                // Jump to the target scene and reset stage state
                console.log('Jumping to new scene from existing game state');
                setPlayerState(p => {
                    if (!p) return null;
                    console.log('Setting new scene:', {
                        targetSceneId: jumpAction.targetSceneId,
                        commandCount: targetScene.commands.length,
                        commands: targetScene.commands.map(c => ({ type: c.type, id: c.id }))
                    });
                    return {
                        ...p,
                        currentSceneId: jumpAction.targetSceneId,
                        currentCommands: targetScene.commands,
                        currentIndex: 0,
                        // Reset stage state to clean slate
                        stageState: { 
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
                                transitionDuration: 0.5 
                            } 
                        },
                        // Clear any active UI state (dialogue, choices, etc.)
                        uiState: {
                            dialogue: null,
                            choices: null,
                            textInput: null,
                            movieUrl: null,
                            isWaitingForInput: false,
                            isTransitioning: false,
                            transitionElement: null,
                            flash: null,
                        }
                    };
                });
            }
        } else if (action.type === UIActionType.SetVariable && playerState) {
            const setVarAction = action as SetVariableAction;
            const variable = project.variables[setVarAction.variableId];
            if (!variable) {
                console.warn(`SetVariable action failed: Variable with ID ${setVarAction.variableId} not found.`);
                return;
            }

            setPlayerState(p => {
                if (!p) return null;
                const currentVal = p.variables[setVarAction.variableId];
                const changeValStr = String(setVarAction.value);
                let newVal: string | number | boolean = setVarAction.value;

                if (setVarAction.operator === 'add') {
                    newVal = (Number(currentVal) || 0) + (Number(changeValStr) || 0);
                } else if (setVarAction.operator === 'subtract') {
                    newVal = (Number(currentVal) || 0) - (Number(changeValStr) || 0);
                } else if (setVarAction.operator === 'random') {
                    // Generate random number within range (inclusive)
                    const min = setVarAction.randomMin ?? 0;
                    const max = setVarAction.randomMax ?? 100;
                    newVal = Math.floor(Math.random() * (max - min + 1)) + min;
                } else { // 'set' operator
                    // Coerce the value to the correct type based on variable definition
                    switch(variable.type) {
                        case 'number':
                            newVal = Number(changeValStr) || 0;
                            break;
                        case 'boolean':
                            newVal = changeValStr.toLowerCase() === 'true';
                            break;
                        case 'string':
                        default:
                            newVal = changeValStr;
                            break;
                    }
                }
                return { ...p, variables: { ...p.variables, [setVarAction.variableId]: newVal } };
            });
        } else if (action.type === UIActionType.CycleLayerAsset) {
            console.log('CycleLayerAsset handler triggered, playerState exists:', !!playerState);
            
            const cycleAction = action as CycleLayerAssetAction;
            console.log('CycleLayerAsset action details:', {
                characterId: cycleAction.characterId,
                layerId: cycleAction.layerId,
                variableId: cycleAction.variableId,
                direction: cycleAction.direction
            });
            
            const character = project.characters[cycleAction.characterId];
            if (!character) {
                console.warn(`CycleLayerAsset action failed: Character with ID ${cycleAction.characterId} not found.`);
                return;
            }
            console.log('Character found:', character.name);
            
            const layer = character.layers[cycleAction.layerId];
            if (!layer) {
                console.warn(`CycleLayerAsset action failed: Layer with ID ${cycleAction.layerId} not found.`);
                return;
            }
            console.log('Layer found:', layer.name);
            
            const assetsCount = Object.keys(layer.assets || {}).length;
            console.log('Assets count:', assetsCount);
            if (assetsCount === 0) {
                console.warn(`CycleLayerAsset action failed: Layer "${layer.name}" has no assets.`);
                return;
            }
            
            // Use playerState variables if in-game, otherwise use menuVariables
            if (playerState) {
                // In-game: update playerState variables
                setPlayerState(p => {
                    if (!p) return null;
                    
                    const currentIndex = Number(p.variables[cycleAction.variableId]) || 0;
                    let newIndex: number;
                    if (cycleAction.direction === 'next') {
                        newIndex = (currentIndex + 1) % assetsCount;
                    } else {
                        newIndex = (currentIndex - 1 + assetsCount) % assetsCount;
                    }
                    
                    console.log(`CycleLayerAsset (in-game): ${character.name} layer "${layer.name}" from index ${currentIndex} to ${newIndex} (${cycleAction.direction}), total assets: ${assetsCount}`);
                    
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
                
                console.log(`CycleLayerAsset (menu): ${character.name} layer "${layer.name}" from index ${currentIndex} to ${newIndex} (${cycleAction.direction}), total assets: ${assetsCount}`);
                
                setMenuVariables(vars => ({
                    ...vars,
                    [cycleAction.variableId]: newIndex
                }));
            }
        }
    };
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && playerState) {
                if (playerState.mode === 'playing') {
                    // PAUSE THE GAME
                    setPlayerState(p => p ? { ...p, mode: 'paused' } : null);
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
                        setPlayerState(p => p ? { ...p, mode: 'playing' } : null);
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
    }, [playerState, project.ui.pauseScreenId, screenStack]);


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
        const shakeClass = state.screen.shake.active ? 'shake' : '';
        const intensityPx = state.screen.shake.intensity * 1.5;
        const panZoomStyle: React.CSSProperties = { transform: `scale(${state.screen.zoom}) translate(${state.screen.panX}%, ${state.screen.panY}%)`, transition: `transform ${state.screen.transitionDuration}s ease-in-out`, width: '100%', height: '100%' };
        const shakeIntensityStyle = (state.screen.shake.active ? { '--shake-intensity-x': `${intensityPx}px`, '--shake-intensity-y': `${intensityPx * 0.7}px`, } : {}) as React.CSSProperties;
        const tintStyle: React.CSSProperties = { backgroundColor: state.screen.tint, transition: `background-color ${state.screen.transitionDuration}s ease-in-out`, };

        return (
            <div ref={stageRef} className="w-full h-full relative overflow-hidden bg-black">
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
                        {Object.values(state.characters).map((char: StageCharacterState) => {
                            let transitionClass = '';
                            let animationDuration = '1s';
                            let slideStyle: React.CSSProperties = {};
                            let positionStyle = getPositionStyle(char.position);
                            
                            // Add centering transform for non-slide transitions
                            if (!char.transition || char.transition.type !== 'slide') {
                                positionStyle = { ...positionStyle, transform: 'translate3d(-50%, 0, 0)' };
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
                                onAdvance={overlay.waitForClick ? () => {
                                    setPlayerState(p => {
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

    const renderPlayerUI = () => {
        if (!playerState || playerState.mode !== 'playing') return null;
        const { uiState } = playerState;
        return <>
            {uiState.movieUrl && (
                <div className="absolute inset-0 bg-black z-40 flex flex-col items-center justify-center text-white" onClick={() => setPlayerState(p => p ? {...p, currentIndex: p.currentIndex + 1, uiState: {...p.uiState, isWaitingForInput: false, movieUrl: null}} : null)}>
                    <video src={uiState.movieUrl} autoPlay className="w-full h-full" onEnded={() => setPlayerState(p => p ? {...p, currentIndex: p.currentIndex + 1, uiState: {...p.uiState, isWaitingForInput: false, movieUrl: null}} : null)} />
                </div>
            )}
            {uiState.dialogue && <DialogueBox dialogue={uiState.dialogue} settings={settings} projectUI={project.ui} onFinished={handleDialogueAdvance} variables={playerState.variables} project={project} />}
            {uiState.choices && <ChoiceMenu choices={uiState.choices} projectUI={project.ui} onSelect={handleChoiceSelect} variables={playerState.variables} project={project} />}
            {uiState.textInput && <TextInputForm textInput={uiState.textInput} onSubmit={handleTextInputSubmit} variables={playerState.variables} project={project} />}
            {uiState.flash && <div className="absolute inset-0 z-50" style={{ backgroundColor: uiState.flash.color, animation: `flash-anim ${uiState.flash.duration}s ease-in-out` }}></div>}
        </>
    };

    const currentScreenId = (!playerState || playerState.mode === 'paused')
        ? (screenStack.length > 0 ? screenStack[screenStack.length - 1] : null)
        : null;

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
            <div className="w-full h-full aspect-video relative">
                {playerState?.mode === 'playing' ? renderStage() : null}
                
                {currentScreenId && (
                    <UIScreenRenderer
                        screenId={currentScreenId}
                        onAction={handleUIAction}
                        settings={settings}
                        onSettingsChange={(key, value) => setSettings(s => ({...s, [key]: value}))}
                        assetResolver={assetResolver}
                        gameSaves={gameSaves}
                        playSound={playSound}
                        variables={playerState?.variables || menuVariables}
                    />
                )}
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
                                    variables={playerState?.variables || menuVariables}
                                />
                            ) : null;
                        })()
                    )
                }
                {renderPlayerUI()}
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
