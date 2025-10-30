import React from 'react';
import { VNID, VNPosition, VNTransition, VNPositionPreset } from '../types';
import { VNProject } from '../types/project';
import {
    CommandType, ShowCharacterCommand, DialogueCommand, FlashScreenCommand, ChoiceOption,
    ChoiceCommand, SetBackgroundCommand, ShowTextCommand, ShowImageCommand, VNScene, ShowButtonCommand
} from '../features/scene/types';
// FIX: VNCondition is not exported from scene/types, but from shared types.
import { VNCondition } from '../types/shared';
import { VNFontSettings } from '../features/ui/types';
import { VNCharacterLayer } from '../features/character/types';
import { PhotoIcon, FilmIcon, Cog6ToothIcon } from './icons';
import Panel from './ui/Panel';
import { fontSettingsToStyle } from '../utils/styleUtils';
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
    };
    dialogue: {
        characterName: string;
        characterColor: string;
        text: string;
    } | null;
    movie: { videoName: string } | null;
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
    const [showCommandIndicators, setShowCommandIndicators] = React.useState(true);
    const [showVariableState, setShowVariableState] = React.useState(false);
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
        },
        dialogue: null,
        movie: null,
        flash: null,
        choices: null,
        commandIndicator: null,
        variables: {},
    });

    React.useEffect(() => {
        const scene = project.scenes[activeSceneId];
        if (!scene) {
            setStageState({
                backgroundUrl: null, characters: {}, textOverlays: [], imageOverlays: [], buttonOverlays: [],
                screen: { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0 },
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
        let screen = { shake: { active: false, intensity: 0 }, tint: 'transparent', zoom: 1, panX: 0, panY: 0 };
        let dialogue: StageState['dialogue'] = null;
        let movie: StageState['movie'] = null;
        let flash: StageState['flash'] = null;
        let choices: StageState['choices'] = null;
        let commandIndicator: StageState['commandIndicator'] = null;
        let currentVariables: StageState['variables'] = {};

        // Initialize variables with project defaults
        Object.values(project.variables).forEach(v => {
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
                    backgroundUrl = project.backgrounds[command.backgroundId]?.imageUrl || null;
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
                        characters[command.characterId] = { charId: command.characterId, position: command.position, imageUrls, transition: command.transition };
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
                        width: command.width, height: command.height, textAlign: command.textAlign, verticalAlign: command.verticalAlign
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
                    dialogue = { characterName: char?.name || 'Narrator', characterColor: char?.color || '#FFFFFF', text: currentCommand.text };
                    break;
                case CommandType.Choice:
                    choices = currentCommand.options.filter(opt => evaluateConditions(opt.conditions, currentVariables));
                    break;
                case CommandType.PlayMovie:
                    movie = { videoName: project.videos[currentCommand.videoId]?.name || 'N/A' };
                    break;
                case CommandType.FlashScreen:
                    flash = { color: currentCommand.color };
                    break;
                case CommandType.SetVariable:
                case CommandType.PlayMusic:
                case CommandType.PlaySoundEffect:
                case CommandType.StopMusic:
                case CommandType.Jump:
                case CommandType.Wait:
                case CommandType.TextInput:
                    commandIndicator = { type: currentCommand.type, details: '' };
                    break;
            }
        }

        setStageState({ backgroundUrl, characters, textOverlays, imageOverlays, buttonOverlays, screen, dialogue, movie, flash, choices, commandIndicator, variables: currentVariables });

    }, [activeSceneId, selectedCommandIndex, project]);

    const getPositionStyle = (position: VNPosition): React.CSSProperties => {
        if (typeof position === 'object') {
            return { left: `${position.x}%`, top: `${position.y}%`, transform: 'translate(-50%, 0)' };
        }
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

    // Resolve choice button image URL
    const choiceButtonImageUrl = project.ui.choiceButtonImage 
        ? (project.images[project.ui.choiceButtonImage.id]?.imageUrl || project.backgrounds[project.ui.choiceButtonImage.id]?.imageUrl)
        : null;

    const renderDialogueBox = (dialogue: NonNullable<StageState['dialogue']>) => {
        const interpolatedText = interpolateVariables(dialogue.text, currentVariables, project);
        return (
            <div className={`absolute bottom-5 left-5 right-5 p-5 z-20 ${dialogueBoxImageUrl ? 'dialogue-box-custom bg-black/70' : 'bg-black/70 rounded-lg border-2 border-slate-500'}`}
                 style={dialogueBoxImageUrl ? { borderImageSource: `url(${dialogueBoxImageUrl})` } : {}}>
                {dialogue.characterName !== 'Narrator' && (
                    <h3 className="mb-2" style={{...fontSettingsToStyle(project.ui.dialogueNameFont), color: dialogue.characterColor}}>
                        {dialogue.characterName}
                    </h3>
                )}
                <p className="leading-relaxed" style={fontSettingsToStyle(project.ui.dialogueTextFont)}>
                    {interpolatedText}
                </p>
            </div>
        );
    };

    const renderChoiceMenu = (choices: NonNullable<StageState['choices']>) => (
        <div className="absolute inset-0 bg-black/30 z-30 flex flex-col items-center justify-center p-8 space-y-4">
            {choices.map((choice) => {
                 const interpolatedText = interpolateVariables(choice.text, currentVariables, project);
                return (
                    <button key={choice.id} className={`px-8 py-4 ${choiceButtonImageUrl ? 'choice-button-custom bg-slate-800/80 hover:bg-slate-700/90' : 'bg-slate-800/80 hover:bg-slate-700/90 border-2 border-slate-500 rounded-lg'}`}
                            style={choiceButtonImageUrl ? { borderImageSource: `url(${choiceButtonImageUrl})`, ...fontSettingsToStyle(project.ui.choiceTextFont) } : fontSettingsToStyle(project.ui.choiceTextFont)}>
                        {interpolatedText}
                    </button>
                )
            })}
        </div>
    );
    
    return (
        <Panel title="Staging Area" className={className} style={style}>
            <div className="w-full h-full flex items-center justify-center p-2">
                <div className="relative bg-slate-900/50 rounded-md overflow-hidden" style={{ aspectRatio: '16/9', width: '100%', height: 'auto', maxHeight: '100%', maxWidth: '100%' }}>
                    {stageState.backgroundUrl && <img src={stageState.backgroundUrl} alt="background" className="absolute inset-0 w-full h-full object-cover" />}
                {Object.values(stageState.characters).map((char) => (
                    <div key={char.charId} className="absolute w-auto aspect-[3/4]" style={{ ...getPositionStyle(char.position), height: '90%', bottom: '0', top: 'auto' }}>
                        {char.imageUrls.map((url, index) => <img key={index} src={url} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ zIndex: index }} />)}
                    </div>
                ))}
                {stageState.textOverlays.map(o => (
                     <div key={o.id} style={{
                        position: 'absolute', left: `${o.x}%`, top: `${o.y}%`,
                        width: o.width ? `${o.width}px` : 'auto', height: o.height ? `${o.height}px` : 'auto',
                        transform: 'translate(-50%, -50%)', ...fontSettingsToStyle({ family: o.fontFamily, size: o.fontSize, color: o.color, weight: 'normal', italic: false }),
                        textAlign: o.textAlign,
                     }}>{o.text}</div>
                ))}
                 {stageState.imageOverlays.map(o => (
                     <div key={o.id} style={{
                         position: 'absolute', left: `${o.x}%`, top: `${o.y}%`,
                         width: `${o.width}px`, height: `${o.height}px`,
                         transform: `translate(-50%, -50%) rotate(${o.rotation}deg) scale(${o.scaleX}, ${o.scaleY})`,
                         opacity: o.opacity,
                     }}>
                        <img src={o.imageUrl} alt="" className="w-full h-full object-contain" />
                     </div>
                ))}
                {stageState.buttonOverlays.map(btn => (
                    <div key={btn.id} style={{
                        position: 'absolute',
                        left: `${btn.x}%`,
                        top: `${btn.y}%`,
                        width: `${btn.width}%`,
                        height: `${btn.height}%`,
                        transform: 'translate(-50%, -50%)',
                    }}>
                        {btn.imageUrl ? (
                            <div className="w-full h-full relative">
                                <img src={btn.imageUrl} alt="" className="w-full h-full object-cover" style={{ borderRadius: `${btn.borderRadius}px` }} />
                                <div className="absolute inset-0 flex items-center justify-center" style={{
                                    color: btn.textColor,
                                    fontSize: `${btn.fontSize}px`,
                                    fontWeight: btn.fontWeight,
                                }}>
                                    {btn.text}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center cursor-pointer" style={{
                                backgroundColor: btn.backgroundColor,
                                color: btn.textColor,
                                fontSize: `${btn.fontSize}px`,
                                fontWeight: btn.fontWeight,
                                borderRadius: `${btn.borderRadius}px`,
                            }}>
                                {btn.text}
                            </div>
                        )}
                    </div>
                ))}

                {currentDialogue && renderDialogueBox(currentDialogue)}
                {currentChoices && renderChoiceMenu(currentChoices)}

                {stageState.movie && (
                    <div className="absolute inset-0 bg-black z-40 flex flex-col items-center justify-center text-white">
                        <FilmIcon className="w-24 h-24" />
                        <p>Play Movie: {stageState.movie.videoName}</p>
                    </div>
                )}
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

                 <div className="absolute top-2 right-2 flex flex-col gap-2 z-50">
                    <button onClick={() => setShowCommandIndicators(s => !s)} className={`p-2 rounded-full ${showCommandIndicators ? 'bg-sky-500/80' : 'bg-slate-700/80'}`} title="Toggle Command Indicators"><PhotoIcon /></button>
                    <button onClick={() => setShowVariableState(s => !s)} className={`p-2 rounded-full ${showVariableState ? 'bg-sky-500/80' : 'bg-slate-700/80'}`} title="Toggle Variable State"><Cog6ToothIcon /></button>
                 </div>
                </div>
            </div>
        </Panel>
    );
};

export default StagingArea;
