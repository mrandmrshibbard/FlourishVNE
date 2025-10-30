import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react';
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
    UISettingsSliderElement, UISettingsToggleElement, UICharacterPreviewElement, UITextInputElement, UIDropdownElement, UICheckboxElement, UIAssetCyclerElement, GameSetting, GameToggleSetting, UIElementType
} from '../features/ui/types';
import {
    VNCommand, CommandType, ChoiceOption, SetBackgroundCommand, ShowCharacterCommand, HideCharacterCommand, DialogueCommand,
    ChoiceCommand, JumpCommand, SetVariableCommand, TextInputCommand, PlayMusicCommand, StopMusicCommand, PlaySoundEffectCommand,
    PlayMovieCommand, WaitCommand, ShakeScreenCommand, TintScreenCommand, PanZoomScreenCommand, ResetScreenEffectsCommand,
    FlashScreenCommand, LabelCommand, JumpToLabelCommand, ShowTextCommand, ShowImageCommand, HideTextCommand, HideImageCommand,
    ShowButtonCommand, HideButtonCommand, BranchStartCommand, BranchEndCommand
} from '../features/scene/types';
// FIX: VNCondition is not exported from scene/types, but from shared types.
import { VNCondition } from '../types/shared';
import { VNCharacter, VNCharacterLayer } from '../features/character/types';
import { VNVariable } from '../features/variables/types';

// Command Handlers
import {
    CommandContext,
    CommandResult,
    handleDialogue,
    handleSetVariable,
    handleChoice,
    handleShowCharacter,
    handleHideCharacter,
    handleSetBackground,
    handlePlayMusic,
    handleStopMusic,
    handlePlaySoundEffect,
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
} from './live-preview/command-handlers';

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

    // Get character-specific font if available
    const character = dialogue.characterId ? project.characters[dialogue.characterId] : null;
    const characterFont = character?.fontFamily;
    const characterFontSize = character?.fontSize;
    const characterFontWeight = character?.fontWeight;
    const characterFontItalic = character?.fontItalic;
    
    const dialogueTextStyle = {
        ...fontSettingsToStyle(projectUI.dialogueTextFont),
        ...(characterFont ? { fontFamily: characterFont } : {}),
        ...(characterFontSize ? { fontSize: `${characterFontSize}px` } : {}),
        ...(characterFontWeight ? { fontWeight: characterFontWeight } : {}),
        ...(characterFontItalic ? { fontStyle: 'italic' } : {})
    };

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
            <p className="leading-relaxed" style={dialogueTextStyle}>
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
    
    const handleClick = () => {
        try { playSound(element.clickSoundId); } catch(e) {}
        
        // Execute primary action (backward compatibility)
        if (element.action) {
            onAction(element.action);
        }
        
        // Execute additional actions
        if (element.actions && element.actions.length > 0) {
            element.actions.forEach(action => onAction(action));
        }
    };
    
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
                <div className="absolute inset-0 w-full h-full bg-slate-700/80"></div>
            )}
            <span className="relative z-10" style={{...textStyle, display: 'inline-block', pointerEvents: 'none'}}>
                {interpolatedText}
            </span>
        </button>
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
}> = React.memo(({ screenId, onAction, settings, onSettingsChange, assetResolver, gameSaves, playSound, variables = {}, onVariableChange, isClosing = false }) => {
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
    
    const renderElement = (element: VNUIElement, variables: Record<VNID, string | number | boolean>, project: VNProject) => {
        console.log('🎯 renderElement called:', element.type, element.name, element.id);
        
        const transitionStyle = getTransitionStyle(element.transitionIn, element.transitionDuration, element.transitionDelay);
        
        const style: React.CSSProperties = {
            position: 'absolute',
            left: `${element.x}%`, top: `${element.y}%`,
            width: `${element.width}%`, height: `${element.height}%`,
            transform: `translate(-${element.anchorX * 100}%, -${element.anchorY * 100}%)`,
            overflow: 'hidden', // Prevent content overflow when using cover
            ...transitionStyle,
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
                
                console.log(`[CharacterPreview] layerVariableMap:`, el.layerVariableMap);
                console.log(`[CharacterPreview] Available variables:`, Object.keys(variables));
                
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
                    
                    console.log(`[CharacterPreview] Processing layer ${layer.name} (${layerId}), mapped variableId:`, variableId);
                    
                    if (variableId && variables) {
                        // Get asset from variable (variable contains asset ID as string)
                        const assetId = String(variables[variableId] || '');
                        console.log(`[CharacterPreview] Layer ${layer.name} (${layerId}): variableId=${variableId}, assetId from variable="${assetId}"`);
                        console.log(`[CharacterPreview] Available assets in layer:`, Object.keys(layer.assets));
                        
                        if (assetId) {
                            asset = layer.assets[assetId];
                            if (asset) {
                                console.log(`[CharacterPreview] ✓ Found asset: ${asset.name}`);
                            } else {
                                console.warn(`[CharacterPreview] ✗ Asset ID "${assetId}" not found in layer ${layer.name}!`);
                            }
                        } else {
                            console.log(`[CharacterPreview] Variable ${variableId} is empty, skipping layer`);
                        }
                    } else if (defaultExpression && defaultExpression.layerConfiguration[layerId]) {
                        // Get asset from default expression
                        const assetId = defaultExpression.layerConfiguration[layerId];
                        console.log(`[CharacterPreview] Layer ${layer.name} using default expression asset: ${assetId}`);
                        asset = assetId ? layer.assets[assetId] : null;
                    } else {
                        console.log(`[CharacterPreview] Layer ${layer.name} has no mapping and no default expression`);
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
                                fontSize: `${el.font?.size || 16}px`,
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
                                fontSize: `${el.font?.size || 16}px`,
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
                                fontSize: `${el.font?.size || 16}px`,
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
                const character = project.characters[el.characterId];
                const layer = character?.layers[el.layerId];
                let currentAssetId = String(variables[el.variableId] || '');
                
                console.log(`[AssetCycler] Rendering cycler for variable ${el.variableId}, current value:`, currentAssetId);
                
                // Apply filtering if filterPattern is set
                let filteredAssetIds = el.assetIds;
                if (el.filterPattern) {
                    // Support both old single variable and new multi-variable filtering
                    const filterVarIds = el.filterVariableIds || (el.filterVariableId ? [el.filterVariableId] : []);
                    
                    if (filterVarIds.length > 0) {
                        console.log(`[AssetCycler] Filter variables for ${el.variableId}:`, filterVarIds);
                        
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
                            console.log(`[AssetCycler] Filter var ${varId}: assetId=${assetId}, assetName=${assetName}`);
                            filterValues[varId] = assetName;
                        }
                        
                        if (allFiltersHaveValues) {
                            // Replace placeholders in the pattern with asset names or parts of asset names
                            // Supports: {varId}, {varId[1]}, {name[2]}, {}, etc.
                            let pattern = el.filterPattern;
                            
                            // Helper function to extract part of asset name by index
                            const extractPart = (assetName: string, index: number): string => {
                                const parts = assetName.split('_');
                                if (index >= 0 && index < parts.length) {
                                    return parts[index];
                                }
                                return assetName; // Return full name if index out of bounds
                            };
                            
                            // First, try to replace specific {varId} or {varId[index]} placeholders
                            for (const varId of filterVarIds) {
                                const assetName = filterValues[varId];
                                
                                // Replace {varId[index]} with specific part of asset name
                                const indexedRegex = new RegExp(`\\{${varId}\\[(\\d+)\\]\\}`, 'g');
                                pattern = pattern.replace(indexedRegex, (match, indexStr) => {
                                    const index = parseInt(indexStr, 10);
                                    const part = extractPart(assetName, index);
                                    console.log(`[AssetCycler] Extracting part ${index} from ${assetName}: ${part}`);
                                    return part;
                                });
                                
                                // Replace {varId} with full asset name
                                const specificRegex = new RegExp(`\\{${varId}\\}`, 'g');
                                pattern = pattern.replace(specificRegex, assetName);
                            }
                            
                            // Then, replace any remaining generic placeholders by position
                            // Supports: {name[2]}, {[1]}, {} etc.
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
                                        console.log(`[AssetCycler] Generic placeholder [${index}] extracting from ${assetName}: ${part}`);
                                        pattern = pattern.replace(/\{[^}]*\}/, part);
                                    } else {
                                        // Replace with full asset name
                                        pattern = pattern.replace(/\{[^}]*\}/, assetName);
                                    }
                                }
                            }
                            
                            console.log(`[AssetCycler] Filtering with resolved pattern: ${pattern}`);
                            
                            filteredAssetIds = el.assetIds.filter(assetId => {
                                const asset = layer?.assets[assetId];
                                if (!asset) return false;
                                
                                // Check if asset name matches the pattern (case-insensitive)
                                const matches = asset.name.toLowerCase().includes(pattern.toLowerCase());
                                if (matches) {
                                    console.log(`[AssetCycler] ✓ Match: ${asset.name} contains ${pattern}`);
                                }
                                return matches;
                            });
                            console.log(`[AssetCycler] Filtered assets (${filteredAssetIds.length}):`, filteredAssetIds);
                        } else {
                            console.log(`[AssetCycler] Not all filter variables have values yet, showing all ${filteredAssetIds.length} assets`);
                            // Don't filter - show all assets until all filter variables are set
                            // This prevents the cycler from being empty on initial load
                        }
                    }
                }
                
                // Initialize variable to first asset if not set (using useEffect to avoid setState during render)
                // MUST be called unconditionally to satisfy React's Rules of Hooks
                const shouldInitialize = !currentAssetId && filteredAssetIds.length > 0;
                React.useEffect(() => {
                    if (shouldInitialize && onVariableChange) {
                        const firstAsset = filteredAssetIds[0];
                        console.log(`[AssetCycler] Initializing variable ${el.variableId} to:`, firstAsset);
                        onVariableChange(el.variableId, firstAsset);
                    }
                }, [shouldInitialize, filteredAssetIds, el.variableId, onVariableChange]);
                
                // Update variable when filtered results change (for filter-driven cyclers)
                // This allows a "hidden matcher" cycler to automatically update when filter variables change
                React.useEffect(() => {
                    if (el.filterVariableIds && el.filterVariableIds.length > 0 && filteredAssetIds.length > 0 && onVariableChange) {
                        // If this cycler has filters and the current value isn't in the filtered list, update it
                        if (!filteredAssetIds.includes(currentAssetId)) {
                            const firstFiltered = filteredAssetIds[0];
                            console.log(`[AssetCycler] Filter changed - updating variable ${el.variableId} to first match:`, firstFiltered);
                            onVariableChange(el.variableId, firstFiltered);
                        }
                    }
                }, [filteredAssetIds.join(','), el.filterVariableIds, el.variableId, currentAssetId, onVariableChange]);
                
                const currentIndex = filteredAssetIds.indexOf(currentAssetId);
                const currentAsset = currentAssetId && layer ? layer.assets[currentAssetId] : null;
                
                const handlePrevious = () => {
                    if (filteredAssetIds.length === 0) return;
                    const newIndex = currentIndex <= 0 ? filteredAssetIds.length - 1 : currentIndex - 1;
                    console.log(`[AssetCycler] Previous: setting variable ${el.variableId} to:`, filteredAssetIds[newIndex]);
                    onVariableChange?.(el.variableId, filteredAssetIds[newIndex]);
                };
                
                const handleNext = () => {
                    if (filteredAssetIds.length === 0) return;
                    const newIndex = currentIndex >= filteredAssetIds.length - 1 ? 0 : currentIndex + 1;
                    console.log(`[AssetCycler] Next: setting variable ${el.variableId} to:`, filteredAssetIds[newIndex]);
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
                                    fontSize: `${(el.font?.size || 16) * 0.8}px`,
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
                                    fontSize: `${el.arrowSize || 24}px`,
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
                                    fontSize: `${el.font?.size || 16}px`,
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
                                    fontSize: `${el.arrowSize || 24}px`,
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
            }
            default: return null;
        }
    }

    // Get screen transition style
    const transitionType = isClosing ? (screen.transitionOut || 'fade') : (screen.transitionIn || 'fade');
    const duration = screen.transitionDuration || 300;
    const screenTransitionStyle: React.CSSProperties = {
        animation: transitionType !== 'none' ? `screenTransition${transitionType}${isClosing ? 'Out' : ''} ${duration}ms ease-out forwards` : undefined,
    };

    // Check if dialogue should be shown
    const shouldShowDialogue = screen.showDialogue && variables;

    return (
        <div key={`${screenId}-${isClosing ? 'closing' : 'open'}`} className="absolute inset-0 w-full h-full" style={screenTransitionStyle}>
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
    // Track screens that are currently closing with transitions
    const [closingScreens, setClosingScreens] = useState<Set<VNID>>(new Set());
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
    
    // Sync menuVariables when project variables change
    useEffect(() => {
        const updatedVars: Record<VNID, string | number | boolean> = {};
        Object.values(project.variables).forEach((v: any) => {
            // Keep existing value if it exists, otherwise use default
            updatedVars[v.id] = menuVariables[v.id] !== undefined ? menuVariables[v.id] : v.defaultValue;
        });
        setMenuVariables(updatedVars);
    }, [project.variables]);
    
    // Load custom character fonts
    useEffect(() => {
        const loadCustomFonts = async () => {
            for (const charId in project.characters) {
                const char = project.characters[charId];
                if (char.fontUrl && char.fontFamily) {
                    try {
                        // Create @font-face rule for custom font
                        const fontFace = new FontFace(char.fontFamily, `url(${char.fontUrl})`);
                        await fontFace.load();
                        (document as any).fonts.add(fontFace);
                        console.log(`✓ Loaded custom font: ${char.fontFamily}`);
                    } catch (error) {
                        console.error(`Failed to load custom font for ${char.name}:`, error);
                    }
                }
            }
        };
        loadCustomFonts();
    }, [project.characters]);
    
    const musicAudioRef = useRef<HTMLAudioElement>(new Audio());
    const ambientNoiseAudioRef = useRef<HTMLAudioElement>(new Audio());
    const menuMusicUrlRef = useRef<string | null>(null);
    const menuAmbientUrlRef = useRef<string | null>(null);
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
    const activeEffectTimeoutsRef = useRef<number[]>([]);
    
    // Use refs for visual effects to avoid triggering command loop re-execution
    const activeFlashRef = useRef<{ color: string; duration: number; key: number } | null>(null);
    const activeShakeRef = useRef<{ intensity: number; duration: number } | null>(null);
    const [flashTrigger, setFlashTrigger] = useState(0);

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
                history: [],
                uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null, showHistory: false },
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
            history: [],
            uiState: { dialogue: null, choices: null, textInput: null, movieUrl: null, isWaitingForInput: false, isTransitioning: false, transitionElement: null, flash: null, showHistory: false },
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
    
            console.log('[DEBUG evaluateConditions]', {
                variableId: condition.variableId,
                operator: condition.operator,
                conditionValue: condition.value,
                effectiveVarValue,
                varValue,
                defaultValue: projectVar?.defaultValue
            });
    
            if (effectiveVarValue === undefined) {
                console.log('[DEBUG evaluateConditions] Variable undefined, returning false');
                return false; // condition on non-existent variable is false
            }
            
            let result = false;
            switch (condition.operator) {
                case 'is true': 
                    result = !!effectiveVarValue;
                    break;
                case 'is false': 
                    result = !effectiveVarValue;
                    break;
                case '==': 
                    result = String(effectiveVarValue).toLowerCase() == String(condition.value).toLowerCase();
                    break;
                case '!=': 
                    result = String(effectiveVarValue).toLowerCase() != String(condition.value).toLowerCase();
                    break;
                case '>': 
                    result = Number(effectiveVarValue) > Number(condition.value);
                    break;
                case '<': 
                    result = Number(effectiveVarValue) < Number(condition.value);
                    break;
                case '>=': 
                    result = Number(effectiveVarValue) >= Number(condition.value);
                    break;
                case '<=': 
                    result = Number(effectiveVarValue) <= Number(condition.value);
                    break;
                case 'contains': 
                    result = String(effectiveVarValue).toLowerCase().includes(String(condition.value).toLowerCase());
                    break;
                case 'startsWith': 
                    result = String(effectiveVarValue).toLowerCase().startsWith(String(condition.value).toLowerCase());
                    break;
                default: 
                    result = false;
            }
            
            console.log('[DEBUG evaluateConditions] Result:', result);
            return result;
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
                fadeAudio(audio, settings.musicVolume, 0.5);
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
    
    useEffect(() => { if (musicAudioRef.current) musicAudioRef.current.volume = settings.musicVolume; }, [settings.musicVolume]);

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
                fadeAudio(audio, settings.sfxVolume, 0.5);
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

    }, [screenStack, playerState?.mode, project.uiScreens, assetResolver, settings.sfxVolume, fadeAudio]);
    
    useEffect(() => { if (ambientNoiseAudioRef.current) ambientNoiseAudioRef.current.volume = settings.sfxVolume; }, [settings.sfxVolume]);

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
                        
                        // Stop game music and SFX immediately
                        const audio = musicAudioRef.current;
                        if (audio) {
                            audio.pause();
                            audio.currentTime = 0;
                            audio.src = '';
                        }
                        stopAllSfx();
                        
                        // Clear player state and return to title screen
                        setPlayerState(null);
                        if (project.ui.titleScreenId) {
                            setScreenStack([project.ui.titleScreenId]);
                        }
                    }
                } else {
                    // This is the last scene or scene not found in list
                    console.log('Last scene completed - returning to title');
                    
                    // Stop game music and SFX immediately
                    const audio = musicAudioRef.current;
                    if (audio) {
                        audio.pause();
                        audio.currentTime = 0;
                        audio.src = '';
                    }
                    stopAllSfx();
                    
                    // Clear player state and return to title screen
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

        // Special handling for BranchStart - check conditions and skip branch if not met
        if (command.type === CommandType.BranchStart) {
            const branchCmd = command as BranchStartCommand;
            const conditionsMet = evaluateConditions(branchCmd.conditions, playerState.variables);
            
            if (!conditionsMet) {
                // Skip to matching BranchEnd
                const branchEndIndex = playerState.currentCommands.findIndex((cmd, idx) =>
                    idx > playerState.currentIndex &&
                    cmd.type === CommandType.BranchEnd &&
                    (cmd as BranchEndCommand).branchId === branchCmd.branchId
                );
                
                if (branchEndIndex !== -1) {
                    // Jump to just after the BranchEnd
                    setPlayerState(p => p ? { ...p, currentIndex: branchEndIndex + 1 } : null);
                } else {
                    // No matching BranchEnd found, just advance
                    setPlayerState(p => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
                }
                return;
            }
            // If conditions met, continue to execute BranchStart normally (which does nothing)
            setPlayerState(p => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
            return;
        }

        // Check conditions for all other commands
        const conditionsMet = evaluateConditions(command.conditions, playerState.variables);
        console.log('[DEBUG] Command:', command.type, 'Index:', playerState.currentIndex, 'Conditions met:', conditionsMet, 'Variables:', playerState.variables);
        if (!conditionsMet) {
            console.log('[DEBUG] Skipping command due to failed conditions');
            setPlayerState(p => p ? { ...p, currentIndex: p.currentIndex + 1 } : null);
            return;
        }

        const advance = () => {
            console.log('[DEBUG advance()] Called from command:', command.type, 'Current index:', playerState.currentIndex);
            // Guard: Don't advance if we've already moved past this command
            if (lastProcessedCommandRef.current && lastProcessedCommandRef.current.index > playerState.currentIndex) {
                console.log('[DEBUG advance()] Skipping - already advanced to', lastProcessedCommandRef.current.index);
                return;
            }
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
                    // Stop game music and SFX immediately
                    const audio = musicAudioRef.current;
                    if (audio) {
                        audio.pause();
                        audio.currentTime = 0;
                        audio.src = '';
                    }
                    stopAllSfx();
                    
                    // Clear player state and return to title screen
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
        
        // Build CommandContext for handlers
        const commandContext: CommandContext = {
            project,
            playerState,
            assetResolver,
            getAssetMetadata,
            musicAudioRef,
            fadeAudio,
            playSound,
            settings,
            advance,
            setPlayerState,
            activeEffectTimeoutsRef,
        };
        
        let instantAdvance = true;
        (async () => {
            try {
            // Helper function to apply command result
            const applyResult = (result: CommandResult) => {
                if (result.updates) {
                    setPlayerState(p => {
                        if (!p) return null;
                        return {
                            ...p,
                            ...(result.updates?.currentSceneId !== undefined ? { currentSceneId: result.updates.currentSceneId } : {}),
                            ...(result.updates?.currentCommands !== undefined ? { currentCommands: result.updates.currentCommands } : {}),
                            ...(result.updates?.currentIndex !== undefined ? { currentIndex: result.updates.currentIndex } : {}),
                            ...(result.updates?.commandStack !== undefined ? { commandStack: result.updates.commandStack } : {}),
                            ...(result.updates?.variables !== undefined ? { variables: { ...p.variables, ...result.updates.variables } } : {}),
                            ...(result.updates?.stageState !== undefined ? { stageState: { ...p.stageState, ...result.updates.stageState } } : {}),
                            ...(result.updates?.musicState !== undefined ? { musicState: { ...p.musicState, ...result.updates.musicState } } : {}),
                            ...(result.updates?.uiState !== undefined ? { uiState: { ...p.uiState, ...result.updates.uiState } } : {}),
                        };
                    });
                }
                instantAdvance = result.advance;
                
                // Handle delay and callback
                if (result.delay && result.callback) {
                    const timeoutId = window.setTimeout(result.callback, result.delay);
                    activeEffectTimeoutsRef.current.push(timeoutId);
                } else if (result.callback) {
                    result.callback();
                }
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
                    break;
                }
                case CommandType.TextInput: {
                    const result = handleTextInput(command as TextInputCommand, commandContext);
                    applyResult(result);
                    break;
                }
                case CommandType.Jump: {
                    const result = handleJump(command as JumpCommand, commandContext);
                    applyResult(result);
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
                    
                    // Set shake in ref
                    activeShakeRef.current = { intensity: cmd.intensity, duration: cmd.duration };
                    
                    // Set up timeout to clear shake ref (no re-render needed - CSS animation handles it)
                    const timeoutId = window.setTimeout(() => {
                        activeShakeRef.current = null;
                        activeEffectTimeoutsRef.current = activeEffectTimeoutsRef.current.filter(id => id !== timeoutId);
                    }, cmd.duration * 1000);
                    activeEffectTimeoutsRef.current.push(timeoutId);
                    
                    // Let the normal advance() function handle index progression
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
                    
                    // Set flash in ref with unique key and trigger re-render
                    activeFlashRef.current = { color: cmd.color, duration: cmd.duration, key: Date.now() };
                    setFlashTrigger(prev => prev + 1);
                    
                    // Let the normal advance() function handle index progression
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
            }
            
            // Handle command advancement based on async modifier
            console.log('[DEBUG] Command execution complete:', command.type, '| shouldRunAsync:', shouldRunAsync, '| instantAdvance:', instantAdvance);
            if (shouldRunAsync) {
                // Run async: advance immediately, let command complete in background
                console.log('[DEBUG] Running async - advancing immediately');
                advance();
            } else if (instantAdvance) {
                // Normal: advance only if command was instant
                console.log('[DEBUG] Instant advance - advancing now');
                advance();
            } else {
                console.log('[DEBUG] Waiting for command to handle advancement (callback/user input)');
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
        setPlayerState(p => {
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
        console.log('[CHOICE] Selected:', choice.text, 'Actions:', choice.actions?.length || 0);
        setPlayerState(p => {
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
                                // Handle various boolean representations - be VERY forgiving
                                if (typeof setVarAction.value === 'boolean') {
                                    newVal = setVarAction.value;
                                } else {
                                    // Convert string/number to boolean
                                    const normalized = String(setVarAction.value).trim().toLowerCase();
                                    if (normalized === 'true' || normalized === '1') {
                                        newVal = true;
                                    } else if (normalized === 'false' || normalized === '0' || normalized === '') {
                                        newVal = false;
                                    } else {
                                        // Any other truthy value
                                        newVal = !!setVarAction.value;
                                    }
                                }
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
                    const closingScreenId = hudStack[hudStack.length - 1];
                    const closingScreen = project.uiScreens[closingScreenId];
                    const transitionDuration = closingScreen?.transitionDuration || 300;
                    const hasTransition = closingScreen?.transitionOut && closingScreen.transitionOut !== 'none';
                    
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
                                setPlayerState(p => {
                                    if (!p) return null;
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
                        }, transitionDuration);
                    } else {
                        // No transition, close immediately
                        setHudStack(s => s.slice(0, -1));
                        if (hudStack.length === 1) {
                            setPlayerState(p => {
                                if (!p) return null;
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
                }
            } else {
                if (screenStack.length > 1) {
                    const closingScreenId = screenStack[screenStack.length - 1];
                    const closingScreen = project.uiScreens[closingScreenId];
                    const transitionDuration = closingScreen?.transitionDuration || 300;
                    const hasTransition = closingScreen?.transitionOut && closingScreen.transitionOut !== 'none';
                    
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
            
            // Clear player state and return to title screen
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
            
            // Clear all active effect timeouts (FlashScreen, ShakeScreen, etc.)
            activeEffectTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
            activeEffectTimeoutsRef.current = [];
            
            // Clear active visual effects
            activeFlashRef.current = null;
            setFlashTrigger(0);
            activeShakeRef.current = null;
            
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
                console.log('[DEBUG Jump] Current variables before jump:', playerState.variables);
                setPlayerState(p => {
                    if (!p) return null;
                    console.log('Setting new scene:', {
                        targetSceneId: jumpAction.targetSceneId,
                        commandCount: targetScene.commands.length,
                        commands: targetScene.commands.map(c => ({ type: c.type, id: c.id }))
                    });
                    console.log('[DEBUG Jump] Variables being carried over:', p.variables);
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

    const handleVariableChange = (variableId: VNID, value: string | number | boolean) => {
        if (playerState) {
            // In-game: update playerState variables
            setPlayerState(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    variables: {
                        ...prev.variables,
                        [variableId]: value
                    }
                };
            });
        } else {
            // Pre-game menu: update menuVariables
            setMenuVariables(prev => ({
                ...prev,
                [variableId]: value
            }));
        }
    };
    
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
                setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, showHistory: !p.uiState.showHistory } } : null);
                return;
            }
            
            if (e.key === 'Escape') {
                // Close history if open
                if (playerState.uiState.showHistory) {
                    setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, showHistory: false } } : null);
                    return;
                }
                
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
                    onClose={() => setPlayerState(p => p ? { ...p, uiState: { ...p.uiState, showHistory: false } } : null)} 
                />
            )}
            {uiState.movieUrl && (
                <div className="absolute inset-0 bg-black z-40 flex flex-col items-center justify-center text-white" onClick={() => setPlayerState(p => p ? {...p, currentIndex: p.currentIndex + 1, uiState: {...p.uiState, isWaitingForInput: false, movieUrl: null}} : null)}>
                    <video src={uiState.movieUrl} autoPlay className="w-full h-full" onEnded={() => setPlayerState(p => p ? {...p, currentIndex: p.currentIndex + 1, uiState: {...p.uiState, isWaitingForInput: false, movieUrl: null}} : null)} />
                </div>
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
                
                /* Screen OUT transitions */
                @keyframes screenTransitionfadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
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
            `}</style>
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
                        onVariableChange={handleVariableChange}
                        isClosing={closingScreens.has(currentScreenId)}
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
                                    onVariableChange={handleVariableChange}
                                    isClosing={closingScreens.has(hudScreenId)}
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
