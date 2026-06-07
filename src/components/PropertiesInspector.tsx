import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import {
    VNCommand, CommandType, DialogueCommand, SetBackgroundCommand, ShowCharacterCommand,
    HideCharacterCommand, ChoiceCommand, SetVariableCommand, TextInputCommand, JumpCommand, ChoiceOption,
    PlayMusicCommand, StopMusicCommand, PlaySoundEffectCommand, StopSoundEffectCommand, WaitCommand, ShakeScreenCommand, PlayMovieCommand,
    TintScreenCommand, PanZoomScreenCommand, ResetScreenEffectsCommand, FlashScreenCommand, ShowScreenCommand,
    HideTextCommand, HideImageCommand, ShowTextCommand, ShowImageCommand, ShowButtonCommand, HideButtonCommand,
    LabelCommand, JumpToLabelCommand, BranchStartCommand, BranchEndCommand, CreditRollCommand, CreditEntry, CreditBackground, CreditMedia,
    GroupCommand, RunScriptCommand, CallCommonEventCommand,
    SpawnParticlesCommand, StopParticlesCommand,
    ShowHotSpotCommand, HideHotSpotCommand,
    TweenElementCommand,
    VNScene,
    ChoiceAction,
    REACTIVE_VISUAL_TYPES,
} from '../features/scene/types';
import { 
    canRunAsync, 
    hasUnpredictableAsyncBehavior, 
    getAsyncWarning, 
    isCommandStacked,
    unstackCommand 
} from '../features/scene/commandStackUtils';
import { VNCondition, VNConditionOperator, UIActionType, SetVariableAction } from '../types/shared';
import { VNSetVariableOperator } from '../features/variables/types';
import { VNUIScreen } from '../features/ui/types';
import { VNVariable } from '../features/variables/types';
import { VNCharacter, VNCharacterExpression } from '../features/character/types';
import { VNBackground, VNAudio, VNVideo, VNImage } from '../features/assets/types';
import Panel from './ui/Panel';
import { FormField, Select, TextInput, TextArea, ColorInput } from './ui/Form';
import { TrashIcon, XMarkIcon, PlusIcon, ChevronUpIcon, ChevronDownIcon, LightBulbIcon, BoltIcon, StarIcon } from './icons';
import AssetSelector from './ui/AssetSelector';
import ActionEditor from './menu-editor/ActionEditor';
import SearchableSelect from './ui/SearchableSelect';
import ConditionsEditor from './ui/ConditionsEditor';
import SceneConfigEditor from './SceneConfigEditor';
import VariablePropertiesEditor from './VariablePropertiesEditor';
import { OrientationFields, TransitionFields, PositionInputs, CharacterVisualEffectsEditor } from './inspector/fields';
import { CommandGroupAccordion } from './inspector/CommandGroupFields';
import { isCommandGrouped } from './inspector/inspectorGroups';
import { pluginManager } from '../features/plugins/PluginManagerService';

const useCommandDefaults = (
    command: VNCommand | undefined,
    project: VNProject,
    updateCommand: (updates: Partial<VNCommand>) => void
) => {
    React.useEffect(() => {
        if (!command) {
            return;
        }

        switch (command.type) {
            case CommandType.Dialogue: {
                // No auto-default speaker: a Dialogue with no characterId is the
                // Narrator, which is a valid intentional state. (Previously this
                // auto-assigned the sole character on EVERY selection, which silently
                // changed the speaker and made Narrator lines impossible to keep.)
                break;
            }
            case CommandType.SetBackground: {
                const setBackground = command as SetBackgroundCommand;
                if (!setBackground.backgroundId) {
                    const backgroundIds = Object.keys(project.backgrounds);
                    const imageIds = Object.keys(project.images);
                    const totalAssets = backgroundIds.length + imageIds.length;
                    if (totalAssets === 1) {
                        const firstId = backgroundIds.length > 0 ? backgroundIds[0] : imageIds[0];
                        updateCommand({ backgroundId: firstId });
                        return;
                    }
                }
                break;
            }
            case CommandType.ShowCharacter: {
                const showCharacter = command as ShowCharacterCommand;
                const characterIds = Object.keys(project.characters);

                if (!showCharacter.characterId && characterIds.length === 1) {
                    const firstCharacterId = characterIds[0];
                    const firstCharacter = project.characters[firstCharacterId];
                    const firstExpressionId = firstCharacter ? Object.keys(firstCharacter.expressions)[0] || '' : '';
                    updateCommand({ characterId: firstCharacterId, expressionId: firstExpressionId });
                    return;
                }

                if (showCharacter.characterId && !showCharacter.expressionId) {
                    const selectedCharacter = project.characters[showCharacter.characterId];
                    if (selectedCharacter) {
                        const expressionIds = Object.keys(selectedCharacter.expressions);
                        if (expressionIds.length === 1) {
                            updateCommand({ expressionId: expressionIds[0] });
                            return;
                        }
                    }
                }
                break;
            }
            case CommandType.HideCharacter: {
                const hideCharacter = command as HideCharacterCommand;
                if (!hideCharacter.characterId) {
                    const characterIds = Object.keys(project.characters);
                    if (characterIds.length === 1) {
                        updateCommand({ characterId: characterIds[0] });
                        return;
                    }
                }
                break;
            }
            case CommandType.SetVariable: {
                const setVariable = command as SetVariableCommand;
                const variableIds = Object.keys(project.variables);

                if (!setVariable.variableId && variableIds.length === 1) {
                    updateCommand({ variableId: variableIds[0] });
                    return;
                }

                if (setVariable.variableId) {
                    const variable = project.variables[setVariable.variableId];
                    if (variable) {
                        if (variable.type === 'boolean' && typeof setVariable.value !== 'boolean') {
                            const normalizedValue = (() => {
                                if (typeof setVariable.value === 'number') {
                                    return setVariable.value === 1;
                                }
                                const serialized = String(setVariable.value).trim().toLowerCase();
                                if (serialized.length === 0) {
                                    return false;
                                }
                                return ['true', '1', 'yes', 'on'].includes(serialized);
                            })();
                            updateCommand({ value: normalizedValue });
                            return;
                        }

                        if (variable.type === 'number' && typeof setVariable.value === 'boolean') {
                            updateCommand({ value: setVariable.value ? 1 : 0 });
                            return;
                        }
                    }
                }
                break;
            }
            default:
                break;
        }
    }, [command, project.characters, project.backgrounds, project.images, project.variables, updateCommand]);
};

const useChoiceActionNormalization = (
    command: VNCommand | undefined,
    project: VNProject,
    updateCommand: (updates: Partial<VNCommand>) => void
) => {
    React.useEffect(() => {
        if (!command || command.type !== CommandType.Choice) {
            return;
        }

        const choiceCommand = command as ChoiceCommand;
        let needsUpdate = false;

        const fixedOptions = choiceCommand.options.map(option => {
            const normalizedActions = (option.actions || []).map(action => {
                if (action.type !== UIActionType.SetVariable) {
                    return action;
                }

                const setVariableAction = action as SetVariableAction;
                const variable = project.variables[setVariableAction.variableId];
                if (!variable) {
                    return action;
                }

                if (variable.type === 'boolean' && typeof setVariableAction.value !== 'boolean') {
                    needsUpdate = true;
                    const serialized = String(setVariableAction.value).trim().toLowerCase();
                    const normalizedValue = ['true', '1', 'yes', 'on'].includes(serialized);
                    return { ...setVariableAction, value: normalizedValue };
                }

                if (variable.type === 'number' && typeof setVariableAction.value === 'string') {
                    const parsedValue = parseFloat(setVariableAction.value);
                    const normalizedValue = Number.isNaN(parsedValue) ? 0 : parsedValue;
                    needsUpdate = true;
                    return { ...setVariableAction, value: normalizedValue };
                }

                return action;
            });

            if (needsUpdate) {
                return { ...option, actions: normalizedActions };
            }

            return { ...option, actions: normalizedActions };
        });

        if (needsUpdate) {
            updateCommand({ options: fixedOptions });
        }
    }, [command, project.variables, updateCommand]);
};

const PropertiesInspector: React.FC<{
    activeSceneId: VNID;
    selectedCommandIndex: number | null;
    setSelectedCommandIndex: (index: number | null) => void;
    selectedVariableId?: VNID | null;
    setSelectedVariableId?: (id: VNID | null) => void;
    isConfigScene?: boolean;
    onCloseSceneConfig?: () => void;
}> = ({ activeSceneId, selectedCommandIndex, setSelectedCommandIndex, selectedVariableId, setSelectedVariableId, isConfigScene, onCloseSceneConfig }) => {
    const { project, dispatch } = useProject();
    const { t } = useTranslation('properties');
    const activeScene = project.scenes[activeSceneId];

    // Compute the selected command up-front and run ALL hooks before any early return,
    // so the hook count never changes between command / scene-config / variable / empty
    // states. (Hooks behind a conditional return throw "rendered fewer hooks than
    // expected" → blank screen — which is what happened opening Scene Settings with a
    // command selected.)
    const command = (selectedCommandIndex !== null && activeScene) ? activeScene.commands[selectedCommandIndex] : undefined;

    const updateCommand = React.useCallback((updatedProps: Partial<VNCommand>) => {
        if (!command || selectedCommandIndex === null) return;
        const newCommand = { ...command, ...updatedProps };
        dispatch({ type: 'UPDATE_COMMAND', payload: { sceneId: activeSceneId, commandIndex: selectedCommandIndex, command: newCommand as VNCommand } });
    }, [command, dispatch, activeSceneId, selectedCommandIndex]);

    useCommandDefaults(command, project, updateCommand);
    useChoiceActionNormalization(command, project, updateCommand);

    // ── Early returns (after all hooks have run) ──
    if (isConfigScene) {
        return <SceneConfigEditor activeSceneId={activeSceneId} onCloseSceneConfig={onCloseSceneConfig} />;
    }

    if (selectedVariableId && setSelectedVariableId) {
        return <VariablePropertiesEditor selectedVariableId={selectedVariableId} setSelectedVariableId={setSelectedVariableId} />;
    }

    if (selectedCommandIndex === null || !activeScene || !command) {
        return (
            <Panel title={t('footer.title')} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs italic">
                    <p>{t('footer.selectCommand')}</p>
                </div>
            </Panel>
        );
    }

    const generateId = () => `opt-${Math.random().toString(36).substring(2, 9)}`;

    const handleDelete = () => {
      // Check if it's a group with commands
      if (command.type === CommandType.Group) {
        const groupCmd = command as import('../features/scene/types').GroupCommand;
        if (groupCmd.commandIds && groupCmd.commandIds.length > 0) {
          if (!confirm(`This group contains ${groupCmd.commandIds.length} command(s). Deleting it will also remove these commands. Continue?`)) {
            return;
          }
        }
      }
      
      dispatch({ type: 'DELETE_COMMAND', payload: { sceneId: activeSceneId, commandIndex: selectedCommandIndex } });
      setSelectedCommandIndex(null);
    }
    
    const renderProperties = () => {
        switch (command.type) {
            case CommandType.BranchStart: {
                const cmd = command as BranchStartCommand;
                return <>
                    <FormField label="Branch Name">
                        <TextInput value={cmd.name} onChange={e => updateCommand({ name: e.target.value })} />
                    </FormField>
                    <FormField label="Branch Color">
                        <div className="flex gap-1 items-center">
                            <ColorInput 
                                value={cmd.color} 
                                onChange={val => updateCommand({ color: val })}
                                className="w-12 h-10"
                            />
                            <TextInput 
                                value={cmd.color} 
                                onChange={e => updateCommand({ color: e.target.value })}
                                placeholder="#38bdf8"
                                className="flex-grow"
                            />
                        </div>
                    </FormField>
                    <FormField label="Conditions">
                        <p className="text-xs text-[var(--text-secondary)] mb-2">
                            Commands inside this branch will only execute if all conditions are met.
                        </p>
                        <ConditionsEditor 
                            conditions={cmd.conditions} 
                            project={project} 
                            onChange={(cs) => updateCommand({ conditions: cs })}
                        />
                    </FormField>
                </>;
            }
            case CommandType.BranchEnd: {
                const cmd = command as BranchEndCommand;
                // Find the matching BranchStart
                const matchingStart = activeScene.commands.find(
                    c => c.type === CommandType.BranchStart && (c as BranchStartCommand).branchId === cmd.branchId
                ) as BranchStartCommand | undefined;
                
                return <>
                    <p className="text-[var(--text-secondary)] mb-2">
                        This marks the end of the branch: <strong className="text-[var(--accent-cyan)]">{matchingStart?.name || 'Unknown Branch'}</strong>
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                        Branch End markers are automatically paired with Branch Start commands. 
                        Deleting this will only remove the end marker - delete the Branch Start to remove the entire branch structure.
                    </p>
                </>;
            }
            case CommandType.Dialogue: {
                const cmd = command as DialogueCommand;
                const characterOptions = [
                    { value: '', label: t('shared.narrator') },
                    ...Object.values(project.characters).map((c: VNCharacter) => ({ value: c.id, label: c.name }))
                ];
                const audioOptions = [
                    { value: '', label: t('shared.none') },
                    ...Object.values(project.audio).map((a: any) => ({ value: a.id, label: a.name }))
                ];
                const textEffectOptions = [
                    { value: 'none', label: t('dialogue.effects.none') },
                    { value: 'shake', label: t('dialogue.effects.shake') },
                    { value: 'wave', label: t('dialogue.effects.wave') },
                    { value: 'rainbow', label: t('dialogue.effects.rainbow') },
                    { value: 'glitch', label: t('dialogue.effects.glitch') },
                    { value: 'pulse', label: t('dialogue.effects.pulse') },
                    { value: 'fade-in', label: t('dialogue.effects.fade-in') },
                    { value: 'bounce', label: t('dialogue.effects.bounce') },
                    { value: 'typewriter-bounce', label: t('dialogue.effects.typewriter-bounce') },
                ];
                const currentTextEffect = cmd.textEffect?.type || 'none';
                return <>
                    <FormField label={t('shared.character')}>
                        <SearchableSelect
                            options={characterOptions}
                            value={cmd.characterId || ''}
                            onChange={(value) => updateCommand({ characterId: value || null })}
                            placeholder={t('shared.selectCharacter')}
                        />
                    </FormField>
                    <FormField label={t('dialogue.text')}>
                        <TextArea value={cmd.text} onChange={e => updateCommand({ text: e.target.value })} />
                    </FormField>
                    <FormField label={t('dialogue.voiceClip')}>
                        <SearchableSelect
                            options={audioOptions}
                            value={cmd.voiceAudioId || ''}
                            onChange={(value) => updateCommand({ voiceAudioId: value || null })}
                            placeholder={t('dialogue.selectVoiceClip')}
                        />
                    </FormField>
                    <FormField label={t('dialogue.textEffect')}>
                        <Select
                            value={currentTextEffect}
                            onChange={e => {
                                const type = e.target.value as any;
                                if (type === 'none') {
                                    updateCommand({ textEffect: undefined });
                                } else {
                                    updateCommand({ textEffect: { type, speed: cmd.textEffect?.speed ?? 1, intensity: cmd.textEffect?.intensity ?? 1 } });
                                }
                            }}
                        >
                            {textEffectOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </Select>
                    </FormField>
                    {currentTextEffect !== 'none' && <>
                        <FormField label={t('dialogue.effectSpeed')}>
                            <input type="range" min="0.1" max="5" step="0.1" value={cmd.textEffect?.speed ?? 1} onChange={e => updateCommand({ textEffect: { ...(cmd.textEffect || { type: currentTextEffect as any }), speed: parseFloat(e.target.value) } })} className="w-full" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{(cmd.textEffect?.speed ?? 1).toFixed(1)}x</span>
                        </FormField>
                        <FormField label={t('dialogue.effectIntensity')}>
                            <input type="range" min="0.1" max="3" step="0.1" value={cmd.textEffect?.intensity ?? 1} onChange={e => updateCommand({ textEffect: { ...(cmd.textEffect || { type: currentTextEffect as any }), intensity: parseFloat(e.target.value) } })} className="w-full" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{(cmd.textEffect?.intensity ?? 1).toFixed(1)}x</span>
                        </FormField>
                    </>}
                    <FormField label={t('dialogue.keepOpen')}>
                        <input 
                            type="checkbox" 
                            checked={cmd.keepOpenDuringChoices ?? false} 
                            onChange={e => updateCommand({ keepOpenDuringChoices: e.target.checked })}
                            className="cursor-pointer"
                        />
                    </FormField>
                </>;
            }
            case CommandType.SetBackground: {
                const cmd = command as SetBackgroundCommand;
                const backgroundOptions: { value: string; label: string; group?: string }[] = [];
                const useColor = !!cmd.backgroundColor;
                
                if (Object.keys(project.backgrounds).length > 0) {
                    Object.values(project.backgrounds).forEach((b: VNBackground) => {
                        backgroundOptions.push({ value: b.id, label: b.name, group: 'Backgrounds' });
                    });
                }
                if (Object.keys(project.images).length > 0) {
                    Object.values(project.images).forEach((img: VNImage) => {
                        backgroundOptions.push({ value: img.id, label: img.name, group: 'Images' });
                    });
                }
                // Videos uploaded under the Videos tab can also serve as a video background.
                Object.values(project.videos || {}).forEach((v: any) => {
                    backgroundOptions.push({ value: v.id, label: v.name, group: 'Videos' });
                });
                return <>
                    <FormField label={t('background.type')}>
                        <select
                            value={useColor ? 'color' : 'image'}
                            onChange={(e) => {
                                if (e.target.value === 'color') {
                                    updateCommand({ backgroundColor: '#1a102c', backgroundId: cmd.backgroundId });
                                } else {
                                    updateCommand({ backgroundColor: undefined, backgroundId: cmd.backgroundId });
                                }
                            }}
                            className="w-full px-2 py-1 rounded bg-[var(--bg-primary)] text-white border border-[var(--border-default)]"
                        >
                            <option value="image">{t('background.imageVideo')}</option>
                            <option value="color">{t('background.solidColor')}</option>
                        </select>
                    </FormField>
                    {useColor ? (
                        <FormField label={t('background.color')}>
                            <input
                                type="color"
                                value={cmd.backgroundColor}
                                onChange={(e) => updateCommand({ backgroundColor: e.target.value })}
                                className="w-full h-10 rounded cursor-pointer"
                            />
                        </FormField>
                    ) : (
                        <FormField label={t('background.background')}>
                            <SearchableSelect 
                                options={backgroundOptions}
                                value={cmd.backgroundId} 
                                onChange={(value) => updateCommand({ backgroundId: value })}
                                placeholder={backgroundOptions.length === 0 ? "No backgrounds or images uploaded" : "Select background..."}
                            />
                        </FormField>
                    )}
                    <TransitionFields 
                        transition={cmd.transition} 
                        duration={cmd.duration} 
                        onUpdate={(updates) => updateCommand(updates)} 
                    />
                </>;
            }
            case CommandType.ShowCharacter: {
                 const cmd = command as ShowCharacterCommand;
                 const character = project.characters[cmd.characterId];
                 const isSlideTransition = cmd.transition === 'slide';
                 const characterOptions = Object.values(project.characters).map((c: VNCharacter) => ({ value: c.id, label: c.name }));
                 const expressionOptions = character 
                    ? Object.values(character.expressions).map((expr: VNCharacterExpression) => ({ value: expr.id, label: expr.name }))
                    : [];
                 return <>
                    <FormField label={t('shared.character')}>
                        <SearchableSelect
                            options={characterOptions}
                            value={cmd.characterId}
                            onChange={(value) => {
                                const newChar = project.characters[value];
                                const firstExprId = newChar ? Object.keys(newChar.expressions)[0] : '';
                                updateCommand({ characterId: value, expressionId: firstExprId || '' });
                            }}
                            placeholder={Object.keys(project.characters).length === 0 ? t('shared.noCharacters') : t('shared.selectCharacter')}
                        />
                    </FormField>
                    <FormField label={t('shared.expression')}>
                        <SearchableSelect
                            options={expressionOptions}
                            value={cmd.expressionId}
                            onChange={(value) => updateCommand({ expressionId: value })}
                            placeholder={(!character || Object.keys(character.expressions).length === 0) ? t('shared.noExpressions') : t('shared.selectExpression')}
                        />
                    </FormField>
                    
                    {isSlideTransition ? (
                        <>
                            <PositionInputs
                                label={t('shared.startPosition')}
                                position={cmd.startPosition || cmd.position}
                                onChange={(pos) => updateCommand({ startPosition: pos })}
                            />
                            <PositionInputs
                                label={t('shared.endPosition')}
                                position={cmd.endPosition || cmd.position}
                                onChange={(pos) => updateCommand({ endPosition: pos })}
                            />
                        </>
                    ) : (
                        <PositionInputs
                            label={t('shared.position')}
                            position={cmd.position}
                            onChange={(pos) => updateCommand({ position: pos })}
                        />
                    )}
                    
                    <TransitionFields 
                        transition={cmd.transition} 
                        duration={cmd.duration} 
                        onUpdate={(updates) => updateCommand(updates)} 
                    />

                    {/* Scale control */}
                    <FormField label={t('shared.scale')}>
                        <div className="flex items-center gap-2">
                            <input 
                                type="range" min="0.1" max="3" step="0.05"
                                value={cmd.scale ?? 1}
                                onChange={e => updateCommand({ scale: parseFloat(e.target.value) })}
                                className="flex-1"
                            />
                            <TextInput 
                                type="number" min="0.1" max="5" step="0.05"
                                value={cmd.scale ?? 1}
                                onChange={e => updateCommand({ scale: parseFloat(e.target.value) || 1 })}
                                style={{ width: '60px' }}
                            />
                        </div>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('character.scaleHint')}</p>
                    </FormField>

                    {/* Orientation: rotation slider + flip toggles (flipX maps to `inverted`) */}
                    <OrientationFields
                        rotation={cmd.rotation}
                        flipX={cmd.inverted}
                        flipY={cmd.flipY}
                        flipXLabel={t('character.mirrorSprite')}
                        onChange={p => {
                            const patch: any = {};
                            if ('rotation' in p) patch.rotation = p.rotation;
                            if ('flipX' in p) patch.inverted = p.flipX;
                            if ('flipY' in p) patch.flipY = p.flipY;
                            updateCommand(patch);
                        }}
                    />

                    {/* Per-Character Visual Effects — multiple stacking (shared component) */}
                    <FormField label={t('character.visualEffects')}>
                        <CharacterVisualEffectsEditor cmd={cmd} updateCommand={updateCommand} />
                    </FormField>
                 </>;
            }
            case CommandType.HideCharacter: {
                 const cmd = command as HideCharacterCommand;
                 const characterOptions = Object.values(project.characters).map((c: VNCharacter) => ({ value: c.id, label: c.name }));
                 return <>
                    <FormField label={t('shared.character')}>
                        <SearchableSelect
                            options={characterOptions}
                            value={cmd.characterId}
                            onChange={(value) => updateCommand({ characterId: value })}
                            placeholder={Object.keys(project.characters).length === 0 ? t('shared.noCharacters') : t('shared.selectCharacter')}
                        />
                    </FormField>
                    <TransitionFields
                        transition={cmd.transition}
                        duration={cmd.duration}
                        onUpdate={(updates) => updateCommand(updates)}
                    />
                    {cmd.transition === 'slide' && <PositionInputs label={t('shared.startPosition')} position={cmd.startPosition} onChange={pos => updateCommand({ startPosition: pos })} />}
                    {cmd.transition === 'slide' && <PositionInputs label={t('shared.endPosition')} position={cmd.endPosition} onChange={pos => updateCommand({ endPosition: pos })} />}
                 </>;
            }
            case CommandType.Choice: {
                const cmd = command as ChoiceCommand;

                const updateOption = (index: number, updatedProps: Partial<ChoiceOption>) => {
                    const newOptions = [...cmd.options];
                    const oldOption = newOptions[index];
                    newOptions[index] = { ...oldOption, ...updatedProps };
                    // Ensure deprecated property is removed when saving new format
                    if (newOptions[index].actions) {
                        delete (newOptions[index] as any).targetSceneId;
                    }
                    updateCommand({ options: newOptions });
                };

                const addOption = () => {
                    const firstSceneId = Object.keys(project.scenes)[0];
                    const newOption: ChoiceOption = {
                        id: generateId(),
                        text: 'New Option',
                        actions: [{ type: UIActionType.JumpToScene, targetSceneId: firstSceneId || '' }],
                    };
                    updateCommand({ options: [...cmd.options, newOption] });
                };

                const removeOption = (index: number) => updateCommand({ options: cmd.options.filter((_, i) => i !== index) });

                const updateAction = (optionIndex: number, actionIndex: number, updatedAction: Partial<ChoiceAction>) => {
                    const option = cmd.options[optionIndex];
                    const newActions = [...(option.actions || [])];
                    newActions[actionIndex] = { ...newActions[actionIndex], ...updatedAction } as ChoiceAction;
                    updateOption(optionIndex, { actions: newActions });
                };
                
                const addAction = (optionIndex: number, type: UIActionType.JumpToScene | UIActionType.SetVariable) => {
                    const option = cmd.options[optionIndex];
                    let newAction: ChoiceAction;
                    if (type === UIActionType.JumpToScene) {
                        newAction = { type: UIActionType.JumpToScene, targetSceneId: project.startSceneId };
                    } else {
                        // The type is guaranteed to be SetVariable here.
                        const firstVarId = Object.keys(project.variables)[0] || '';
                        const firstVar = project.variables[firstVarId];
                        // Initialize with proper default value based on variable type
                        let defaultValue: string | number | boolean = '';
                        if (firstVar) {
                            if (firstVar.type === 'boolean') {
                                defaultValue = false;
                            } else if (firstVar.type === 'number') {
                                defaultValue = 0;
                            } else {
                                defaultValue = '';
                            }
                        }
                        newAction = { type: UIActionType.SetVariable, variableId: firstVarId, operator: 'set', value: defaultValue };
                    }
                    updateOption(optionIndex, { actions: [...(option.actions || []), newAction] });
                };

                const removeAction = (optionIndex: number, actionIndex: number) => {
                    const option = cmd.options[optionIndex];
                    const newActions = (option.actions || []).filter((_, i) => i !== actionIndex);
                    updateOption(optionIndex, { actions: newActions });
                };

                return <div>
                    <h3 className="font-bold mb-2">{t('choice.options')}</h3>
                    {cmd.options.map((opt, i) => {
                        const migratedOpt: ChoiceOption = ('targetSceneId' in opt && !('actions' in opt)) ? {
                            id: opt.id || generateId(), text: opt.text, conditions: opt.conditions,
                            actions: [{ type: UIActionType.JumpToScene, targetSceneId: (opt as any).targetSceneId }]
                        } : { ...opt, id: opt.id || generateId(), actions: opt.actions || [] };

                        return (
                            <div key={migratedOpt.id} className="p-1 border border-[var(--border-subtle)] rounded-md mb-2">
                               <FormField label={`Option ${i+1} Text`}><TextInput value={migratedOpt.text} onChange={e => updateOption(i, { text: e.target.value })}/></FormField>
                               <h4 className="font-bold text-xs mt-3 mb-1 text-[var(--text-secondary)]">{t('choice.conditions')}</h4>
                               <p className="text-xs text-[var(--text-muted)] mb-2">{t('choice.conditionsHint')}</p>
                               <ConditionsEditor conditions={migratedOpt.conditions} project={project} onChange={(cs) => updateOption(i, { conditions: cs })}/>
                               
                                <h4 className="font-bold text-xs mt-3 mb-1 text-[var(--text-secondary)]">{t('choice.actions')}</h4>
                                <div className="space-y-2 pl-2 border-l-2 border-[var(--border-default)]">
                                    {(migratedOpt.actions || []).map((action, actionIndex) => (
                                        <div key={actionIndex} className="p-1 bg-[var(--bg-primary)] rounded-md">
                                            {action.type === UIActionType.JumpToScene ? (
                                                (() => {
                                                    const actionAsJump = action as ChoiceAction & { targetSceneId: VNID };
                                                    return (
                                                <FormField label={t('choice.jumpToScene')}>
                                                    <div className="flex items-center gap-1">
                                                        <Select value={actionAsJump.targetSceneId} onChange={e => updateAction(i, actionIndex, { targetSceneId: e.target.value })}>
                                                            {Object.values(project.scenes).map((s: VNScene) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                        </Select>
                                                        <button onClick={() => removeAction(i, actionIndex)} className="text-red-400 hover:text-red-300 p-1"><XMarkIcon className="w-4 h-4" /></button>
                                                    </div>
                                                </FormField>
                                                    );
                                                })()
                                            ) : action.type === UIActionType.SetVariable ? (
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-xs font-semibold">{t('choice.setVariable')}</p>
                                                        <button onClick={() => removeAction(i, actionIndex)} className="text-red-400 hover:text-red-300 p-1"><XMarkIcon className="w-4 h-4" /></button>
                                                    </div>
                                                    {(() => {
                                                        const actionAsSetVar = action as SetVariableAction;
                                                        const variable = project.variables[actionAsSetVar.variableId];
                                                        return (
                                                            <div className="space-y-2">
                                                                <FormField label={t('vars.variable')}>
                                                                    <Select value={actionAsSetVar.variableId} onChange={e => {
                                                                        const newVarId = e.target.value;
                                                                        const newVar = project.variables[newVarId];
                                                                        let newOperator = actionAsSetVar.operator;
                                                                        let newValue = actionAsSetVar.value;
                                                                        
                                                                        // Reset operator if switching to non-number variable
                                                                        if (newVar?.type !== 'number' && (actionAsSetVar.operator === 'add' || actionAsSetVar.operator === 'subtract')) {
                                                                            newOperator = 'set';
                                                                        }
                                                                        
                                                                        // Reset value to match new variable type
                                                                        if (newVar) {
                                                                            if (newVar.type === 'boolean') {
                                                                                newValue = false;
                                                                            } else if (newVar.type === 'number') {
                                                                                newValue = 0;
                                                                            } else {
                                                                                newValue = '';
                                                                            }
                                                                        }
                                                                        
                                                                        updateAction(i, actionIndex, { variableId: newVarId, operator: newOperator, value: newValue });
                                                                    }}>
                                                                        {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                                                    </Select>
                                                                </FormField>
                                                                <div className="grid grid-cols-2 gap-1">
                                                                    <FormField label={t('vars.operator')}>
                                                                        <Select value={actionAsSetVar.operator} onChange={e => updateAction(i, actionIndex, { operator: e.target.value as VNSetVariableOperator })}>
                                                                            <option value="set">Set (=)</option>
                                                                            {variable?.type === 'number' && <option value="add">Add (+)</option>}
                                                                            {variable?.type === 'number' && <option value="subtract">Subtract (-)</option>}
                                                                        </Select>
                                                                    </FormField>
                                                                    <FormField label={t('vars.value')}>
                                                                        {variable?.type === 'boolean' ? (
                                                                            <Select value={String(actionAsSetVar.value)} onChange={e => updateAction(i, actionIndex, { value: e.target.value === 'true' })}>
                                                                                <option value="true">{t('vars.true')}</option>
                                                                                <option value="false">{t('vars.false')}</option>
                                                                            </Select>
                                                                        ) : variable?.type === 'number' ? (
                                                                            <TextInput type="number" value={String(actionAsSetVar.value)} onChange={e => updateAction(i, actionIndex, { value: parseFloat(e.target.value) || 0 })}/>
                                                                        ) : (
                                                                            <TextInput value={String(actionAsSetVar.value)} onChange={e => updateAction(i, actionIndex, { value: e.target.value })}/>
                                                                        )}
                                                                    </FormField>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                    <div className="flex gap-1 pt-1">
                                       <button onClick={() => addAction(i, UIActionType.JumpToScene)} className="text-xs bg-sky-600 hover:bg-sky-700 px-2 py-1 rounded">{t('choice.addJump')}</button>
                                       <button onClick={() => addAction(i, UIActionType.SetVariable)} disabled={Object.keys(project.variables).length === 0} className="text-xs bg-sky-600 hover:bg-sky-700 px-2 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed">{t('choice.addSetVariable')}</button>
                                    </div>
                                </div>
                               <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-300 text-xs mt-3">{t('choice.removeOption')}</button>
                            </div>
                        )
                    })}
                    <button onClick={addOption} className="text-sky-400 hover:text-sky-300 mt-2 flex items-center gap-1 text-xs"><PlusIcon className="w-4 h-4"/>{t('choice.addOption')}</button>
                </div>
            }
            case CommandType.PlayMusic: {
                const cmd = command as PlayMusicCommand;
                return <>
                    <FormField label={t('audio.audioTrack')}><Select value={cmd.audioId} onChange={e => updateCommand({ audioId: e.target.value })}>
                        {Object.keys(project.audio).length === 0 && <option disabled>{t('audio.noAudio')}</option>}
                        {Object.values(project.audio).map((a: VNAudio) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select></FormField>
                    <FormField label={`Volume: ${Math.round((cmd.volume ?? 1) * 100)}%`}>
                        <input type="range" min="0" max="100" value={Math.round((cmd.volume ?? 1) * 100)} onChange={e => updateCommand({ volume: parseInt(e.target.value) / 100 })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                    <FormField label={t('audio.fadeDurationSec')}><TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 })}/></FormField>
                    <div className="flex items-center gap-1"><input type="checkbox" checked={cmd.loop} onChange={e => updateCommand({ loop: e.target.checked })} className="h-4 w-4 rounded bg-[var(--bg-secondary)] border-[var(--border-default)] focus:ring-[var(--accent-lavender)]" /> <label>{t('audio.loop')}</label></div>
                </>;
            }
            case CommandType.StopMusic: {
                const cmd = command as StopMusicCommand;
                return <FormField label="Fade Duration (s)"><TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 })}/></FormField>;
            }
             case CommandType.PlaySoundEffect: {
                const cmd = command as PlaySoundEffectCommand;
                return <>
                    <FormField label={t('audio.audioTrack')}><Select value={cmd.audioId} onChange={e => updateCommand({ audioId: e.target.value })}>
                        {Object.keys(project.audio).length === 0 && <option disabled>{t('audio.noAudio')}</option>}
                        {Object.values(project.audio).map((a: VNAudio) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select></FormField>
                    <FormField label={`Volume: ${Math.round((cmd.volume ?? 1) * 100)}%`}>
                        <input type="range" min="0" max="100" value={Math.round((cmd.volume ?? 1) * 100)} onChange={e => updateCommand({ volume: parseInt(e.target.value) / 100 })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text-secondary)]">
                        <input type="checkbox" checked={!!cmd.loop} onChange={e => updateCommand({ loop: e.target.checked })} className="cursor-pointer" />
                        <span>Loop (plays until a Stop Sound Effect{cmd.liveConditions ? ', or while its condition holds' : ''})</span>
                    </label>
                </>;
            }
            case CommandType.StopSoundEffect: {
                const cmd = command as StopSoundEffectCommand;
                return <>
                    <FormField label={t('audio.targetSound')}>
                        <Select value={cmd.audioId || ''} onChange={e => updateCommand({ audioId: e.target.value })}>
                            <option value="">{t('audio.allSounds')}</option>
                            {Object.values(project.audio).map((a: VNAudio) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </Select>
                    </FormField>
                    <FormField label={t('audio.fadeOutSec')}>
                        <TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration ?? 0} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 })} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('audio.fadeOutHint')}</span>
                    </FormField>
                </>;
            }
            case CommandType.PlayMovie: {
                const cmd = command as PlayMovieCommand;
                const isOverlay = cmd.displayMode === 'overlay';
                // Videos can live in videos OR backgrounds/images (uploaded under those tabs).
                const movieVideoAssets = [
                    ...Object.values(project.videos || {}),
                    ...Object.values(project.backgrounds || {}).filter((a: any) => a.isVideo || (a as any).videoUrl),
                    ...Object.values(project.images || {}).filter((a: any) => a.isVideo || (a as any).videoUrl),
                ] as any[];
                return <>
                    <FormField label={t('movie.video')}>
                        <Select value={cmd.videoId} onChange={e => updateCommand({ videoId: e.target.value })}>
                            {movieVideoAssets.length === 0 && <option disabled>{t('movie.noVideos')}</option>}
                            {movieVideoAssets.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                    </FormField>
                    <FormField label={t('movie.displayMode')}>
                        <Select value={cmd.displayMode || 'fullscreen'} onChange={e => {
                            const mode = e.target.value as 'fullscreen' | 'overlay';
                            // Overlay mode always advances immediately (non-blocking)
                            if (mode === 'overlay') {
                                updateCommand({ displayMode: mode, waitsForCompletion: false });
                            } else {
                                updateCommand({ displayMode: mode });
                            }
                        }}>
                            <option value="fullscreen">{t('movie.fullscreen')}</option>
                            <option value="overlay">{t('movie.overlay')}</option>
                        </Select>
                    </FormField>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 mb-2">
                        {isOverlay
                            ? 'Movie plays as a transparent layer behind characters. Use for effects like falling petals, rain, etc.'
                            : 'Movie fills the screen with a black background. Use for cutscenes and cinematics.'}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                        <input id="movie-loop" type="checkbox" checked={cmd.loop ?? false} onChange={e => updateCommand({ loop: e.target.checked })} className="h-4 w-4 rounded bg-[var(--bg-secondary)] border-[var(--border-default)] focus:ring-[var(--accent-lavender)]" />
                        <label htmlFor="movie-loop" className="text-sm">{t('movie.loopContinuously')}</label>
                    </div>
                    {!cmd.loop && (
                        <div className="flex items-center gap-1 mt-2">
                            <input id="movie-hold" type="checkbox" checked={cmd.holdLastFrame ?? false} onChange={e => updateCommand({ holdLastFrame: e.target.checked })} className="h-4 w-4 rounded bg-[var(--bg-secondary)] border-[var(--border-default)] focus:ring-[var(--accent-lavender)]" />
                            <label htmlFor="movie-hold" className="text-sm">Hold last frame when finished</label>
                        </div>
                    )}
                    {!isOverlay && (
                        <div className="flex items-center gap-1 mt-2">
                            <input id="waits-for-completion" type="checkbox" checked={cmd.waitsForCompletion} onChange={e => updateCommand({ waitsForCompletion: e.target.checked })} className="h-4 w-4 rounded bg-[var(--bg-secondary)] border-[var(--border-default)] focus:ring-[var(--accent-lavender)]" /> 
                            <label htmlFor="waits-for-completion" className="text-sm">{t('movie.waitForCompletion')}</label>
                        </div>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <FormField label={t('movie.displaySizing')}>
                        <Select value={cmd.objectFit || 'cover'} onChange={e => {
                            const val = e.target.value as 'cover' | 'contain' | 'fill' | 'custom';
                            if (val === 'custom') {
                                updateCommand({ objectFit: val });
                            } else {
                                // Reset position/size to defaults when switching away from custom
                                updateCommand({ objectFit: val, x: 0, y: 0, width: 100, height: 100 });
                            }
                        }}>
                            <option value="cover">{t('movie.cover')}</option>
                            <option value="contain">{t('movie.contain')}</option>
                            <option value="fill">{t('movie.fill')}</option>
                            <option value="custom">{t('movie.custom')}</option>
                        </Select>
                    </FormField>
                    {cmd.objectFit === 'custom' && (
                        <>
                            <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('movie.positionSize')}</h4>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('shared.xPosition')}><TextInput type="number" min="0" max="100" step="1" value={cmd.x ?? 0} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                                <FormField label={t('shared.yPosition')}><TextInput type="number" min="0" max="100" step="1" value={cmd.y ?? 0} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 })} /></FormField>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('shared.widthPercent')}><TextInput type="number" min="1" max="100" step="1" value={cmd.width ?? 100} onChange={e => updateCommand({ width: parseFloat(e.target.value) || 100 })} /></FormField>
                                <FormField label={t('shared.heightPercent')}><TextInput type="number" min="1" max="100" step="1" value={cmd.height ?? 100} onChange={e => updateCommand({ height: parseFloat(e.target.value) || 100 })} /></FormField>
                            </div>
                        </>
                    )}
                    <FormField label={t('movie.opacity', { value: Math.round((cmd.opacity ?? 1) * 100) })}>
                        <input type="range" min="0" max="1" step="0.01" value={cmd.opacity ?? 1} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                    {isOverlay && (
                        <p className="text-xs text-[var(--text-secondary)] mt-2">
                            <Trans t={t} i18nKey="movie.stopMovieNote" components={{ strong: <strong /> }} />
                        </p>
                    )}
                </>;
            }
            case CommandType.StopMovie: {
                return <p className="text-xs text-[var(--text-secondary)]">{t('movie.stopMovieDesc')}</p>;
            }
            case CommandType.SetVariable: {
                const cmd = command as SetVariableCommand;
                const variable = project.variables[cmd.variableId];
                return <>
                    <FormField label={t('vars.variable')}><Select value={cmd.variableId} onChange={e => {
                        const newVarId = e.target.value;
                        const newVar = project.variables[newVarId];
                        let newOperator = cmd.operator;
                        // When switching to a non-numeric variable, change operator from add/subtract/random to set
                        if (newVar?.type !== 'number' && (cmd.operator === 'add' || cmd.operator === 'subtract' || cmd.operator === 'random')) {
                            newOperator = 'set';
                        }
                        updateCommand({ variableId: newVarId, operator: newOperator });
                    }}>
                         {Object.keys(project.variables).length === 0 && <option disabled>{t('vars.noVariables')}</option>}
                        {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </Select></FormField>
                    <FormField label={t('vars.operator')}><Select value={cmd.operator} onChange={e => updateCommand({ operator: e.target.value as VNSetVariableOperator })}>
                        <option value="set">{t('vars.set')}</option>
                        {variable?.type === 'number' && <option value="add">{t('vars.add')}</option>}
                        {variable?.type === 'number' && <option value="subtract">{t('vars.subtract')}</option>}
                        {variable?.type === 'number' && <option value="random">{t('vars.random')}</option>}
                    </Select></FormField>
                    
                    {cmd.operator === 'random' && variable?.type === 'number' ? (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('vars.minValue')}>
                                <TextInput type="number" value={String(cmd.randomMin ?? 0)} onChange={e => updateCommand({ randomMin: parseFloat(e.target.value) || 0 })}/>
                            </FormField>
                            <FormField label={t('vars.maxValue')}>
                                <TextInput type="number" value={String(cmd.randomMax ?? 100)} onChange={e => updateCommand({ randomMax: parseFloat(e.target.value) || 100 })}/>
                            </FormField>
                        </div>
                    ) : (
                        <FormField label={t('vars.value')}>
                            {variable?.type === 'boolean' ? (
                                <Select value={String(cmd.value)} onChange={e => updateCommand({ value: e.target.value === 'true' })}>
                                    <option value="true">{t('vars.true')}</option>
                                    <option value="false">{t('vars.false')}</option>
                                </Select>
                            ) : variable?.type === 'number' ? (
                                <TextInput type="number" value={String(cmd.value)} onChange={e => updateCommand({ value: e.target.value })}/>
                            ) : (
                                <TextInput value={String(cmd.value)} onChange={e => updateCommand({ value: e.target.value })}/>
                            )}
                        </FormField>
                    )}
                </>;
            }
            case CommandType.TextInput: {
                const cmd = command as TextInputCommand;
                return <>
                    <FormField label={t('vars.variable')}><Select value={cmd.variableId} onChange={e => updateCommand({ variableId: e.target.value })}>
                         {Object.keys(project.variables).length === 0 && <option disabled>{t('vars.noVariables')}</option>}
                        {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </Select></FormField>
                    <FormField label={t('textInput.prompt')}><TextInput value={cmd.prompt} onChange={e => updateCommand({ prompt: e.target.value })} placeholder={t('textInput.promptPlaceholder')}/></FormField>
                    <FormField label={t('textInput.placeholder')}><TextInput value={cmd.placeholder || ''} onChange={e => updateCommand({ placeholder: e.target.value })} placeholder={t('textInput.placeholderPlaceholder')}/></FormField>
                    <FormField label={t('textInput.maxLength')}><TextInput type="number" min="1" max="1000" value={cmd.maxLength || 50} onChange={e => updateCommand({ maxLength: parseInt(e.target.value) || 50 })}/></FormField>
                </>;
            }
             case CommandType.Jump: {
                const cmd = command as JumpCommand;
                return <>
                    <FormField label={t('jump.targetScene')}><Select value={cmd.targetSceneId} onChange={e => updateCommand({ targetSceneId: e.target.value })}>
                         {Object.values(project.scenes).map((s: VNScene) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select></FormField>
                    {!project.scenes[cmd.targetSceneId] && <p className="text-red-500 text-xs">Warning: Target scene not found.</p>}
                </>;
            }
            case CommandType.Wait: {
                const cmd = command as WaitCommand;
                return <>
                    <FormField label={t('shared.durationSec')}><TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })} disabled={cmd.waitIndefinitelyForInput}/></FormField>
                    <FormField label={t('wait.waitMode')}>
                        <div className="space-y-2">
                            <label className="flex items-center gap-1">
                                <input type="checkbox" checked={!cmd.waitIndefinitelyForInput && !cmd.waitForInput} onChange={() => updateCommand({ waitForInput: false, waitIndefinitelyForInput: false })} />
                                <span className="text-xs text-[var(--text-primary)]">{t('wait.timed')}</span>
                            </label>
                            <label className="flex items-center gap-1">
                                <input type="checkbox" checked={!!cmd.waitForInput && !cmd.waitIndefinitelyForInput} onChange={() => updateCommand({ waitForInput: true, waitIndefinitelyForInput: false })} />
                                <span className="text-xs text-[var(--text-primary)]">{t('wait.allowClick')}</span>
                            </label>
                            <label className="flex items-center gap-1">
                                <input type="checkbox" checked={!!cmd.waitIndefinitelyForInput} onChange={e => updateCommand({ waitIndefinitelyForInput: e.target.checked, waitForInput: false })} />
                                <span className="text-xs text-[var(--text-primary)]">{t('wait.indefinite')}</span>
                            </label>
                        </div>
                    </FormField>
                </>;
            }
            case CommandType.ShakeScreen: {
                const cmd = command as ShakeScreenCommand;
                const isShakePersistent = cmd.duration === 0;
                return <>
                    <FormField label={t('screen.intensity', { value: cmd.intensity })}>
                        <input type="range" min="1" max="10" value={cmd.intensity} onChange={e => updateCommand({ intensity: parseInt(e.target.value, 10) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>
                    <FormField label={t('screen.duration')}>
                        <label className="flex items-center gap-2 mb-2">
                            <input type="checkbox" checked={isShakePersistent} onChange={e => updateCommand({ duration: e.target.checked ? 0 : 0.5 })} />
                            <span className="text-xs text-[var(--text-primary)]">{t('screen.persistentShake')}</span>
                        </label>
                        {!isShakePersistent && (
                            <TextInput type="number" min="0.1" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0.1 })}/>
                        )}
                    </FormField>
                    {isShakePersistent && <p className="text-xs text-amber-400/80">{t('screen.shakeWarning')}</p>}
                </>;
            }
            case CommandType.TintScreen: {
                const cmd = command as TintScreenCommand;
                return <>
                    <FormField label={t('screen.tintColor')}>
                        <TextInput type="text" value={cmd.color} onChange={e => updateCommand({ color: e.target.value })}/>
                    </FormField>
                    <FormField label={t('shared.durationSec')}>
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
                </>;
            }
            case CommandType.PanZoomScreen: {
                const cmd = command as PanZoomScreenCommand;
                return <>
                    <FormField label={t('screen.zoom', { value: cmd.zoom })}>
                        <input type="range" min="0.1" max="5" step="0.1" value={cmd.zoom} onChange={e => updateCommand({ zoom: parseFloat(e.target.value) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>
                     <FormField label={t('screen.panX', { value: cmd.panX })}>
                        <input type="range" min="-100" max="100" value={cmd.panX} onChange={e => updateCommand({ panX: parseInt(e.target.value, 10) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>
                     <FormField label={t('screen.panY', { value: cmd.panY })}>
                        <input type="range" min="-100" max="100" value={cmd.panY} onChange={e => updateCommand({ panY: parseInt(e.target.value, 10) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>
                    <FormField label={t('shared.durationSec')}>
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
                </>;
            }
            case CommandType.ResetScreenEffects: {
                const cmd = command as ResetScreenEffectsCommand;
                return <>
                    <FormField label={t('shared.durationSec')}>
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
                </>;
            }
            case CommandType.FlashScreen: {
                const cmd = command as FlashScreenCommand;
                return <>
                    <FormField label={t('screen.flashColor')}>
                        <TextInput type="text" value={cmd.color} onChange={e => updateCommand({ color: e.target.value })}/>
                    </FormField>
                    <FormField label={t('shared.durationSec')}>
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
                </>;
            }
            case CommandType.SetScreenOverlayEffect: {
                const cmd = command as any;
                const effectType = cmd.effectType as string;
                const intensity = typeof cmd.intensity === 'number' ? cmd.intensity : 0;
                const supportsColor = ['sunbeams', 'shimmer', 'rain', 'snowAsh'].includes(effectType);
                
                // Default colors for each effect type
                const defaultColors: Record<string, string> = {
                    sunbeams: '#FFDC8C',
                    shimmer: '#FFFFFF',
                    rain: '#B4D2FF',
                    snowAsh: '#FFFFFF',
                };
                const effectColor = cmd.color || defaultColors[effectType] || '#FFFFFF';
                
                return <>
                    <FormField label={t('screen.effect')}>
                        <Select value={effectType} onChange={e => updateCommand({ effectType: e.target.value, color: undefined })}>
                            <option value="crtScanlines">{t('screen.effects.crtScanlines')}</option>
                            <option value="chromaticGlitch">{t('screen.effects.chromaticGlitch')}</option>
                            <option value="sunbeams">{t('screen.effects.sunbeams')}</option>
                            <option value="shimmer">{t('screen.effects.shimmer')}</option>
                            <option value="rain">{t('screen.effects.rain')}</option>
                            <option value="snowAsh">{t('screen.effects.snowAsh')}</option>
                        </Select>
                    </FormField>

                    <FormField label={t('screen.intensityPct', { value: Math.round(intensity * 100) })}>
                        <input type="range" min="0" max="1" step="0.01" value={intensity} onChange={e => updateCommand({ intensity: parseFloat(e.target.value) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>

                    {supportsColor && (
                        <FormField label={t('screen.color')}>
                            <div className="flex items-center gap-2">
                                <ColorInput 
                                    value={effectColor} 
                                    onChange={val => updateCommand({ color: val })} 
                                    className="w-10 h-10"
                                />
                                <TextInput 
                                    value={effectColor} 
                                    onChange={e => updateCommand({ color: e.target.value })} 
                                    placeholder="#FFFFFF"
                                    className="flex-1"
                                />
                                <button 
                                    type="button"
                                    onClick={() => updateCommand({ color: undefined })}
                                    className="px-2 py-1 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)] rounded"
                                    title={t('screen.reset')}
                                >
                                    {t('screen.reset')}
                                </button>
                            </div>
                        </FormField>
                    )}

                    {effectType === 'snowAsh' && (
                        <FormField label={t('screen.mode')}>
                            <Select value={cmd.variant || 'snow'} onChange={e => updateCommand({ variant: e.target.value })}>
                                <option value="snow">{t('screen.snow')}</option>
                                <option value="ash">{t('screen.ash')}</option>
                            </Select>
                        </FormField>
                    )}
                    
                    {(() => {
                        const overlayDuration = typeof cmd.duration === 'number' ? cmd.duration : 0;
                        const isPersistent = overlayDuration === 0;
                        return <FormField label={t('screen.duration')}>
                            <label className="flex items-center gap-2 mb-2">
                                <input type="checkbox" checked={isPersistent} onChange={e => updateCommand({ duration: e.target.checked ? 0 : 5 })} />
                                <span className="text-xs text-[var(--text-primary)]">{t('screen.persistentShort')}</span>
                            </label>
                            {!isPersistent && (
                                <TextInput type="number" min="0.1" step="0.5" value={overlayDuration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0.1 })} />
                            )}
                            {!isPersistent && <p className="text-xs text-[var(--text-secondary)] mt-1">{t('screen.autoRemoveHint')}</p>}
                        </FormField>;
                    })()}

                    <p className="text-xs text-[var(--text-secondary)]">{t('screen.tip')}</p>
                </>;
            }
            case CommandType.ShowScreen: {
                const cmd = command as ShowScreenCommand;
                return <>
                    <FormField label={t('screen.uiScreen')}>
                        <Select value={cmd.screenId} onChange={e => updateCommand({ screenId: e.target.value })}>
                             {Object.keys(project.uiScreens).length === 0 && <option disabled>{t('screen.noUIScreens')}</option>}
                            {Object.values(project.uiScreens).map((s: VNUIScreen) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                    </FormField>
                </>;
            }
            case CommandType.Label: {
                const cmd = command as LabelCommand;
                return <>
                    <FormField label={t('screen.labelId')}>
                        <TextInput value={cmd.labelId} onChange={e => updateCommand({ labelId: e.target.value })} />
                    </FormField>
                </>;
            }
            case CommandType.JumpToLabel: {
                const cmd = command as JumpToLabelCommand;
                return <>
                    <FormField label={t('screen.labelId')}>
                        <TextInput value={cmd.labelId} onChange={e => updateCommand({ labelId: e.target.value })} />
                    </FormField>
                </>;
            }
            case CommandType.ShowText: {
                const cmd = command as ShowTextCommand;
                return <>
                    <FormField label={t('text.text')}>
                        <TextArea value={cmd.text} onChange={e => updateCommand({ text: e.target.value })} />
                    </FormField>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('shared.xPosition')}><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label={t('shared.yPosition')}><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 })} /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('text.maxWidth')}><TextInput type="number" value={cmd.width || ''} onChange={e => updateCommand({ width: e.target.value ? parseInt(e.target.value, 10) : undefined })} /></FormField>
                        <FormField label={t('text.maxHeight')}><TextInput type="number" value={cmd.height || ''} onChange={e => updateCommand({ height: e.target.value ? parseInt(e.target.value, 10) : undefined })} /></FormField>
                    </div>
                    <OrientationFields rotation={cmd.rotation} flipX={cmd.flipX} flipY={cmd.flipY} onChange={p => updateCommand(p)} />
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('text.styling')}</h4>
                    <FormField label={t('text.fontFamily')}><TextInput value={cmd.fontFamily} onChange={e => updateCommand({ fontFamily: e.target.value })} placeholder={t('text.fontFamilyPlaceholder')} /></FormField>
                    <div className="grid grid-cols-2 gap-1">
                         <FormField label={t('text.fontSize')}><TextInput type="number" value={cmd.fontSize} onChange={e => updateCommand({ fontSize: parseInt(e.target.value, 10) || 16 })} /></FormField>
                        <FormField label={t('shared.color')}><ColorInput value={cmd.color} onChange={val => updateCommand({ color: val })} className="p-1 h-10" /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('text.weight')}>
                            <Select value={cmd.fontWeight || 'normal'} onChange={e => updateCommand({ fontWeight: e.target.value as any })}>
                                <option value="normal">{t('text.normal')}</option>
                                <option value="bold">{t('text.bold')}</option>
                            </Select>
                        </FormField>
                        <FormField label={t('text.style')}>
                            <Select value={cmd.fontStyle || 'normal'} onChange={e => updateCommand({ fontStyle: e.target.value as any })}>
                                <option value="normal">{t('text.normal')}</option>
                                <option value="italic">{t('text.italic')}</option>
                            </Select>
                        </FormField>
                    </div>
                    <FormField label={t('text.letterSpacing')}>
                        <TextInput type="number" value={cmd.letterSpacing ?? 0} onChange={e => updateCommand({ letterSpacing: parseFloat(e.target.value) || 0 })} />
                    </FormField>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('text.textAlign')}>
                            <Select value={cmd.textAlign || 'left'} onChange={e => updateCommand({ textAlign: e.target.value as any })}>
                                <option value="left">{t('positions.left')}</option>
                                <option value="center">{t('positions.center')}</option>
                                <option value="right">{t('positions.right')}</option>
                            </Select>
                        </FormField>
                        <FormField label={t('text.verticalAlign')}>
                            <Select value={cmd.verticalAlign || 'top'} onChange={e => updateCommand({ verticalAlign: e.target.value as any })}>
                                <option value="top">{t('text.top')}</option>
                                <option value="middle">{t('text.middle')}</option>
                                <option value="bottom">{t('text.bottom')}</option>
                            </Select>
                        </FormField>
                    </div>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('text.textShadow')}</h4>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer mb-2">
                        <input type="checkbox" checked={cmd.textShadow?.enabled ?? false} onChange={e => updateCommand({ textShadow: { ...( cmd.textShadow || { offsetX: 2, offsetY: 2, blur: 4, color: '#000000' }), enabled: e.target.checked } })} />
                        {t('text.enableShadow')}
                    </label>
                    {cmd.textShadow?.enabled && (
                        <>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('text.xOffset')}><TextInput type="number" value={cmd.textShadow.offsetX} onChange={e => updateCommand({ textShadow: { ...cmd.textShadow!, offsetX: parseFloat(e.target.value) || 0 } })} /></FormField>
                                <FormField label={t('text.yOffset')}><TextInput type="number" value={cmd.textShadow.offsetY} onChange={e => updateCommand({ textShadow: { ...cmd.textShadow!, offsetY: parseFloat(e.target.value) || 0 } })} /></FormField>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('text.blur')}><TextInput type="number" value={cmd.textShadow.blur} onChange={e => updateCommand({ textShadow: { ...cmd.textShadow!, blur: parseFloat(e.target.value) || 0 } })} /></FormField>
                                <FormField label={t('text.shadowColor')}><ColorInput value={cmd.textShadow.color} onChange={val => updateCommand({ textShadow: { ...cmd.textShadow!, color: val } })} className="p-1 h-10" /></FormField>
                            </div>
                        </>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('text.textGradient')}</h4>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer mb-2">
                        <input type="checkbox" checked={cmd.textGradient?.enabled ?? false} onChange={e => updateCommand({ textGradient: { ...(cmd.textGradient || { type: 'linear', angle: 90, colors: ['#ff00a5', '#8a2be2'] }), enabled: e.target.checked } })} />
                        {t('text.enableGradient')}
                    </label>
                    {cmd.textGradient?.enabled && (
                        <>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('text.type')}>
                                    <Select value={cmd.textGradient.type} onChange={e => updateCommand({ textGradient: { ...cmd.textGradient!, type: e.target.value as any } })}>
                                        <option value="linear">{t('text.linear')}</option>
                                        <option value="radial">{t('text.radial')}</option>
                                    </Select>
                                </FormField>
                                {cmd.textGradient.type === 'linear' && (
                                    <FormField label={t('text.angle')}><TextInput type="number" value={cmd.textGradient.angle} onChange={e => updateCommand({ textGradient: { ...cmd.textGradient!, angle: parseInt(e.target.value, 10) || 0 } })} /></FormField>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('text.color1')}><ColorInput value={cmd.textGradient.colors[0] || '#ff00a5'} onChange={val => { const c = [...(cmd.textGradient!.colors)]; c[0] = val; updateCommand({ textGradient: { ...cmd.textGradient!, colors: c } }); }} className="p-1 h-10" /></FormField>
                                <FormField label={t('text.color2')}><ColorInput value={cmd.textGradient.colors[1] || '#8a2be2'} onChange={val => { const c = [...(cmd.textGradient!.colors)]; c[1] = val; updateCommand({ textGradient: { ...cmd.textGradient!, colors: c } }); }} className="p-1 h-10" /></FormField>
                            </div>
                        </>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('text.textBorder')}</h4>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer mb-2">
                        <input type="checkbox" checked={cmd.textBorder?.enabled ?? false} onChange={e => updateCommand({ textBorder: { ...(cmd.textBorder || { width: 1, color: '#000000' }), enabled: e.target.checked } })} />
                        {t('text.enableBorder')}
                    </label>
                    {cmd.textBorder?.enabled && (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('text.borderWidth')}><TextInput type="number" min="0" step="0.1" value={cmd.textBorder.width} onChange={e => updateCommand({ textBorder: { ...cmd.textBorder!, width: parseFloat(e.target.value) || 0 } })} /></FormField>
                            <FormField label={t('text.borderColor')}><ColorInput value={cmd.textBorder.color} onChange={val => updateCommand({ textBorder: { ...cmd.textBorder!, color: val } })} className="p-1 h-10" /></FormField>
                        </div>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('shared.animation')}</h4>
                    <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                </>;
            }
            case CommandType.ShowImage: {
                const cmd = command as ShowImageCommand;
                return <>
                    <AssetSelector label={t('image.image')} assetType="images" value={cmd.imageId} onChange={id => updateCommand({ imageId: id || ''})} allowVideo />
                     <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('shared.xPosition')}><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label={t('shared.yPosition')}><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 })} /></FormField>
                    </div>
                     <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('shared.widthPx')}><TextInput type="number" value={cmd.width} onChange={e => updateCommand({ width: parseInt(e.target.value, 10) || 0 })} /></FormField>
                        <FormField label={t('shared.heightPx')}><TextInput type="number" value={cmd.height} onChange={e => updateCommand({ height: parseInt(e.target.value, 10) || 0 })} /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('shared.scaleX')}><TextInput type="number" step="0.1" value={cmd.scaleX ?? 1} onChange={e => updateCommand({ scaleX: parseFloat(e.target.value) || 1 })} /></FormField>
                        <FormField label={t('shared.scaleY')}><TextInput type="number" step="0.1" value={cmd.scaleY ?? 1} onChange={e => updateCommand({ scaleY: parseFloat(e.target.value) || 1 })} /></FormField>
                    </div>
                    <OrientationFields rotation={cmd.rotation} flipX={cmd.flipX} flipY={cmd.flipY} onChange={p => updateCommand(p)} />
                    <FormField label={t('image.opacity', { value: cmd.opacity })}>
                        <input type="range" min="0" max="1" step="0.01" value={cmd.opacity} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) })} />
                    </FormField>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('shared.animation')}</h4>
                    <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                </>;
            }
            case CommandType.HideText: {
                const cmd = command as HideTextCommand;
                const availableTextCommands = activeScene.commands.filter(
                    (c, i) => c.type === CommandType.ShowText && i < selectedCommandIndex
                ) as ShowTextCommand[];

                return (
                    <>
                        <FormField label={t('overlay.targetText')}>
                            <Select value={cmd.targetCommandId} onChange={e => updateCommand({ targetCommandId: e.target.value })}>
                                <option value="">{t('overlay.selectText')}</option>
                                {availableTextCommands.map(c => (
                                    <option key={c.id} value={c.id}>
                                        "{c.text.substring(0, 40)}..." (ID: {c.id})
                                    </option>
                                ))}
                            </Select>
                        </FormField>
                        <hr className="border-[var(--border-subtle)] my-2" />
                        <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('shared.animation')}</h4>
                        <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                    </>
                );
            }
            case CommandType.HideImage: {
                const cmd = command as HideImageCommand;
                const availableImageCommands = activeScene.commands.filter(
                    (c, i) => c.type === CommandType.ShowImage && i < selectedCommandIndex
                ) as ShowImageCommand[];

                return (
                    <>
                        <FormField label={t('overlay.targetImage')}>
                            <Select value={cmd.targetCommandId} onChange={e => updateCommand({ targetCommandId: e.target.value })}>
                                <option value="">{t('overlay.selectImage')}</option>
                                {availableImageCommands.map(c => {
                                    const image = (project.images || {})[c.imageId] as VNImage | undefined;
                                    const bgForImage = project.backgrounds[c.imageId];
                                    const imageName = image?.name || bgForImage?.name || 'Unknown Image';
                                    return <option key={c.id} value={c.id}>{imageName} (ID: {c.id})</option>;
                                })}
                            </Select>
                        </FormField>
                        <hr className="border-[var(--border-subtle)] my-2" />
                        <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('shared.animation')}</h4>
                        <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                    </>
                );
            }
            case CommandType.ShowButton: {
                const cmd = command as ShowButtonCommand;
                return <>
                    <FormField label={t('button.buttonText')}><TextInput value={cmd.text} onChange={e => updateCommand({ text: e.target.value })} /></FormField>

                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('shared.xPosition')}><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label={t('shared.yPosition')}><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 })} /></FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('shared.widthPercent')}><TextInput type="number" value={cmd.width} onChange={e => updateCommand({ width: parseFloat(e.target.value) || 20 })} /></FormField>
                        <FormField label={t('shared.heightPercent')}><TextInput type="number" value={cmd.height} onChange={e => updateCommand({ height: parseFloat(e.target.value) || 8 })} /></FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('button.anchorX')}><TextInput type="number" step="0.1" value={cmd.anchorX} onChange={e => updateCommand({ anchorX: parseFloat(e.target.value) || 0.5 })} /></FormField>
                        <FormField label={t('button.anchorY')}><TextInput type="number" step="0.1" value={cmd.anchorY} onChange={e => updateCommand({ anchorY: parseFloat(e.target.value) || 0.5 })} /></FormField>
                    </div>

                    <OrientationFields rotation={cmd.rotation} flipX={cmd.flipX} flipY={cmd.flipY} onChange={p => updateCommand(p)} />

                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('text.styling')}</h4>

                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('button.background')}><ColorInput value={cmd.backgroundColor || '#6366f1'} onChange={val => updateCommand({ backgroundColor: val })} /></FormField>
                        <FormField label={t('button.textColor')}><ColorInput value={cmd.textColor || '#ffffff'} onChange={val => updateCommand({ textColor: val })} /></FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('text.fontSize')}><TextInput type="number" value={cmd.fontSize} onChange={e => updateCommand({ fontSize: parseInt(e.target.value, 10) || 18 })} /></FormField>
                        <FormField label={t('button.fontWeight')}>
                            <Select value={cmd.fontWeight} onChange={e => updateCommand({ fontWeight: e.target.value as 'normal' | 'bold' })}>
                                <option value="normal">{t('text.normal')}</option>
                                <option value="bold">{t('text.bold')}</option>
                            </Select>
                        </FormField>
                    </div>

                    <FormField label={t('button.borderRadius')}><TextInput type="number" value={cmd.borderRadius} onChange={e => updateCommand({ borderRadius: parseInt(e.target.value, 10) || 0 })} /></FormField>

                    <FormField label={t('movie.opacity', { value: Math.round((cmd.opacity ?? 1) * 100) })}>
                        <input type="range" min="0" max="1" step="0.01" value={cmd.opacity ?? 1} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>

                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('button.imagesOptional')}</h4>

                    <AssetSelector label={t('button.buttonImage')} assetType="images" value={cmd.image?.id || null} allowVideo onChange={id => {
                        if (id) {
                            updateCommand({ image: { type: 'image', id } });
                        } else {
                            updateCommand({ image: null });
                        }
                    }} />
                    
                    <AssetSelector label={t('button.hoverImage')} assetType="images" value={cmd.hoverImage?.id || null} allowVideo onChange={id => {
                        if (id) {
                            updateCommand({ hoverImage: { type: 'image', id } });
                        } else {
                            updateCommand({ hoverImage: null });
                        }
                    }} />

                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('button.onClickAction')}</h4>

                    <FormField label={t('button.waitForClick')}>
                        <div className="flex items-center gap-1">
                            <input
                                type="checkbox"
                                checked={cmd.waitForClick || false}
                                onChange={e => updateCommand({ waitForClick: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">{t('button.waitForClickHint')}</span>
                        </div>
                    </FormField>

                    <FormField label={t('button.quickMenuMode')}>
                        <div className="flex items-center gap-1">
                            <input
                                type="checkbox"
                                checked={cmd.quickMenuMode || false}
                                onChange={e => updateCommand({ quickMenuMode: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">{t('button.quickMenuModeHint')}</span>
                        </div>
                    </FormField>

                    <h4 className="font-bold text-xs mb-2 mt-2 text-[var(--text-secondary)]">{t('button.primaryAction')}</h4>
                    <ActionEditor action={cmd.onClick} onActionChange={action => updateCommand({ onClick: action })} />

                    <h4 className="font-bold text-xs mb-2 mt-2 text-[var(--text-secondary)]">{t('button.additionalActions')}</h4>
                    <div className="space-y-2">
                        {(cmd.actions || []).map((action, idx) => (
                            <div key={idx} className="p-2 bg-[var(--bg-primary)] rounded space-y-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-[var(--text-secondary)]">{t('button.action', { n: idx + 1 })}</span>
                                    <button
                                        onClick={() => {
                                            const newActions = (cmd.actions || []).filter((_, i) => i !== idx);
                                            updateCommand({ actions: newActions });
                                        }}
                                        className="p-1 hover:bg-red-600 rounded transition-colors"
                                        title={t('button.removeAction')}
                                    >
                                        <TrashIcon className="w-3 h-3" />
                                    </button>
                                </div>
                                <ActionEditor 
                                    action={action} 
                                    onActionChange={updatedAction => {
                                        const newActions = [...(cmd.actions || [])];
                                        newActions[idx] = updatedAction;
                                        updateCommand({ actions: newActions });
                                    }} 
                                />
                            </div>
                        ))}
                        <button 
                            onClick={() => {
                                const newAction = { type: 'GoToScreen', targetScreenId: '' } as any;
                                updateCommand({ actions: [...(cmd.actions || []), newAction] });
                            }}
                            className="w-full p-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors text-xs"
                        >
                            {t('button.addAction')}
                        </button>
                    </div>

                    <AssetSelector label={t('button.clickSound')} assetType="audio" value={cmd.clickSound} onChange={id => updateCommand({ clickSound: id })} />

                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('shared.animation')}</h4>
                    <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />

                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('button.showConditions')}</h4>
                    <p className="text-xs text-[var(--text-secondary)] mb-2">{t('button.showConditionsHint')}</p>
                    <ConditionsEditor
                        conditions={cmd.showConditions || []}
                        project={project}
                        onChange={(cs) => updateCommand({ showConditions: cs })}
                    />
                </>;
            }
            case CommandType.HideButton: {
                const cmd = command as HideButtonCommand;
                const availableButtonCommands = activeScene.commands.filter(
                    (c, i) => c.type === CommandType.ShowButton && i < selectedCommandIndex
                ) as ShowButtonCommand[];

                return (
                    <>
                        <FormField label={t('button.targetButton')}>
                            <Select value={cmd.targetCommandId} onChange={e => updateCommand({ targetCommandId: e.target.value })}>
                                <option value="">{t('button.selectButton')}</option>
                                {availableButtonCommands.map(c => (
                                    <option key={c.id} value={c.id}>
                                        "{c.text}" (ID: {c.id})
                                    </option>
                                ))}
                            </Select>
                        </FormField>
                        <hr className="border-[var(--border-subtle)] my-2" />
                        <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('shared.animation')}</h4>
                        <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                    </>
                );
            }
            case CommandType.ShowHotSpot: {
                const cmd = command as ShowHotSpotCommand;
                const acts = cmd.actions || [];
                return <>
                    <FormField label="Name"><TextInput value={cmd.name} onChange={e => updateCommand({ name: e.target.value })} /></FormField>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label={t('shared.xPosition')}><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label={t('shared.yPosition')}><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label={t('shared.widthPercent')}><TextInput type="number" value={cmd.width} onChange={e => updateCommand({ width: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label={t('shared.heightPercent')}><TextInput type="number" value={cmd.height} onChange={e => updateCommand({ height: parseFloat(e.target.value) || 0 })} /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Shape">
                            <Select value={cmd.shape} onChange={e => updateCommand({ shape: e.target.value as 'rect' | 'circle' })}>
                                <option value="rect">Rectangle</option>
                                <option value="circle">Circle</option>
                            </Select>
                        </FormField>
                        <FormField label="Trigger">
                            <Select value={cmd.trigger} onChange={e => updateCommand({ trigger: e.target.value as 'click' | 'hover' | 'drag-drop' })}>
                                <option value="click">Click</option>
                                <option value="hover">Hover</option>
                                <option value="drag-drop">Drop target</option>
                            </Select>
                        </FormField>
                    </div>
                    {cmd.trigger === 'drag-drop' && (
                        <FormField label="Accept tag (optional)">
                            <TextInput value={cmd.acceptedTag || ''} onChange={e => updateCommand({ acceptedTag: e.target.value })} placeholder="e.g. key — leave empty to accept any" />
                        </FormField>
                    )}
                    {cmd.trigger === 'click' && (
                        <FormField label="Advance dialogue on click">
                            <div className="flex items-center gap-1">
                                <input type="checkbox" checked={cmd.advanceOnTrigger || false} onChange={e => updateCommand({ advanceOnTrigger: e.target.checked })} className="w-4 h-4" />
                                <span className="text-xs text-[var(--text-secondary)]">Otherwise the click is consumed</span>
                            </div>
                        </FormField>
                    )}
                    <FormField label="Visible outline">
                        <div className="flex items-center gap-1">
                            <input type="checkbox" checked={cmd.visible || false} onChange={e => updateCommand({ visible: e.target.checked })} className="w-4 h-4" />
                            <span className="text-xs text-[var(--text-secondary)]">Draw the spot during play</span>
                        </div>
                    </FormField>
                    {cmd.visible && (
                        <FormField label={t('shared.color')}><ColorInput value={cmd.highlightColor || 'rgba(99,102,241,0.35)'} onChange={val => updateCommand({ highlightColor: val })} /></FormField>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Actions</h4>
                    <div className="space-y-2">
                        {acts.map((action, idx) => (
                            <div key={idx} className="p-2 bg-[var(--bg-primary)] rounded space-y-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-[var(--text-secondary)]">{t('button.action', { n: idx + 1 })}</span>
                                    <button onClick={() => updateCommand({ actions: acts.filter((_, i) => i !== idx) })} className="p-1 hover:bg-red-600 rounded transition-colors" title={t('button.removeAction')}><TrashIcon className="w-3 h-3" /></button>
                                </div>
                                <ActionEditor action={action} onActionChange={updated => { const next = [...acts]; next[idx] = updated; updateCommand({ actions: next }); }} />
                            </div>
                        ))}
                        <button onClick={() => updateCommand({ actions: [...acts, { type: 'SetVariable' } as any] })} className="w-full p-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors text-xs">{t('button.addAction')}</button>
                    </div>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">{t('footer.conditions')}</h4>
                    <ConditionsEditor conditions={cmd.conditions} project={project} onChange={cs => updateCommand({ conditions: cs })} />
                </>;
            }
            case CommandType.HideHotSpot: {
                const cmd = command as HideHotSpotCommand;
                const availableHotSpots = activeScene.commands.filter(
                    (c, i) => c.type === CommandType.ShowHotSpot && i < selectedCommandIndex
                ) as ShowHotSpotCommand[];
                return (
                    <FormField label="Target Hot Spot to Hide">
                        <Select value={cmd.targetCommandId} onChange={e => updateCommand({ targetCommandId: e.target.value })}>
                            <option value="">Select Hot Spot...</option>
                            {availableHotSpots.map(c => (
                                <option key={c.id} value={c.id}>{c.name || c.id}</option>
                            ))}
                        </Select>
                    </FormField>
                );
            }
            case CommandType.CreditRoll: {
                const cmd = command as CreditRollCommand;
                const entries = cmd.entries || [];
                
                const updateEntry = (index: number, field: keyof CreditEntry, value: string) => {
                    const newEntries = [...entries];
                    newEntries[index] = { ...newEntries[index], [field]: value };
                    updateCommand({ entries: newEntries });
                };
                const removeEntry = (index: number) => {
                    const newEntries = entries.filter((_, i) => i !== index);
                    updateCommand({ entries: newEntries });
                };
                const addEntry = (kind: 'heading' | 'credit') => {
                    const newEntry: CreditEntry = kind === 'heading'
                        ? { kind: 'heading', label: 'Section Title' }
                        : { kind: 'credit', label: 'Role', value: 'Name' };
                    updateCommand({ entries: [...entries, newEntry] });
                };
                const moveEntry = (index: number, direction: -1 | 1) => {
                    const newEntries = [...entries];
                    const swapIndex = index + direction;
                    if (swapIndex < 0 || swapIndex >= newEntries.length) return;
                    [newEntries[index], newEntries[swapIndex]] = [newEntries[swapIndex], newEntries[index]];
                    updateCommand({ entries: newEntries });
                };
                
                return <>
                    <FormField label={t('credit.entries')}>
                        <div className="space-y-2 mb-2">
                            {entries.map((entry, i) => (
                                <div key={i} className={`p-2 rounded-lg border ${
                                    entry.kind === 'heading'
                                        ? 'bg-amber-900/20 border-amber-500/30'
                                        : 'bg-[var(--bg-secondary)]/30 border-[var(--border-default)]/30'
                                }`}>
                                    <div className="flex items-center gap-1 mb-1">
                                        <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
                                            {entry.kind === 'heading' ? t('credit.heading') : t('credit.credit')}
                                        </span>
                                        <div className="flex-1" />
                                        <button onClick={() => moveEntry(i, -1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveUp')}><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => moveEntry(i, 1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveDown')}><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => removeEntry(i)} className="p-0.5 text-red-400 hover:text-red-300" title={t('credit.remove')}><XMarkIcon className="w-3.5 h-3.5" /></button>
                                    </div>
                                    {entry.kind === 'heading' ? (
                                        <TextInput
                                            value={entry.label}
                                            onChange={e => updateEntry(i, 'label', e.target.value)}
                                            placeholder={t('credit.sectionTitlePlaceholder')}
                                        />
                                    ) : (
                                        <div className="flex gap-1">
                                            <TextInput
                                                value={entry.label}
                                                onChange={e => updateEntry(i, 'label', e.target.value)}
                                                placeholder={t('credit.rolePlaceholder')}
                                                className="flex-1"
                                            />
                                            <TextInput
                                                value={entry.value || ''}
                                                onChange={e => updateEntry(i, 'value', e.target.value)}
                                                placeholder={t('credit.namePlaceholder')}
                                                className="flex-1"
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => addEntry('heading')}
                                className="flex-1 px-2 py-1.5 text-xs bg-amber-900/30 hover:bg-amber-800/40 border border-amber-500/30 rounded text-amber-300 transition-colors"
                            >
                                {t('credit.addHeading')}
                            </button>
                            <button
                                onClick={() => addEntry('credit')}
                                className="flex-1 px-2 py-1.5 text-xs bg-[var(--bg-tertiary)]/30 hover:bg-[var(--bg-tertiary)]/40 border border-[var(--border-default)]/30 rounded text-[var(--text-primary)] transition-colors"
                            >
                                {t('credit.addCredit')}
                            </button>
                        </div>
                    </FormField>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <FormField label={t('credit.scrollSpeed')}>
                        <input type="range" min="10" max="200" step="5" value={cmd.scrollSpeed || 60} onChange={e => updateCommand({ scrollSpeed: parseInt(e.target.value) || 60 })} className="w-full" />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('credit.pxPerSec', { value: cmd.scrollSpeed || 60, label: (cmd.scrollSpeed || 60) <= 40 ? t('credit.speedSlow') : (cmd.scrollSpeed || 60) <= 80 ? t('credit.speedNormal') : (cmd.scrollSpeed || 60) <= 130 ? t('credit.speedFast') : t('credit.speedVeryFast') })}</span>
                    </FormField>
                    <FormField label={t('credit.maxDuration')}>
                        <TextInput type="number" min="5" max="300" step="1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 15 })} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('credit.maxDurationHint')}</span>
                    </FormField>
                    <FormField label={t('credit.backgroundColor')}>
                        <div className="flex items-center gap-2">
                            <ColorInput value={cmd.backgroundColor.substring(0, 7)} onChange={val => updateCommand({ backgroundColor: val + 'FF' })} className="w-10 h-10" />
                            <TextInput value={cmd.backgroundColor} onChange={e => updateCommand({ backgroundColor: e.target.value })} placeholder="#000000FF" className="flex-1" />
                        </div>
                    </FormField>
                    <FormField label={t('credit.textColor')}>
                        <div className="flex items-center gap-2">
                            <ColorInput value={cmd.textColor} onChange={val => updateCommand({ textColor: val })} className="w-10 h-10" />
                            <TextInput value={cmd.textColor} onChange={e => updateCommand({ textColor: e.target.value })} placeholder="#FFFFFF" className="flex-1" />
                        </div>
                    </FormField>
                    <FormField label={t('credit.allowSkip')}>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={cmd.allowSkip} onChange={e => updateCommand({ allowSkip: e.target.checked })} />
                            <span className="text-xs text-[var(--text-primary)]">{t('credit.allowSkipHint')}</span>
                        </label>
                    </FormField>
                    <FormField label={t('credit.onComplete')}>
                        <Select value={cmd.onComplete} onChange={e => updateCommand({ onComplete: e.target.value })}>
                            <option value="advance">{t('credit.onCompleteAdvance')}</option>
                            <option value="title">{t('credit.onCompleteTitle')}</option>
                        </Select>
                    </FormField>
                    <hr className="border-[var(--border-subtle)] my-3" />
                    <FormField label={t('credit.backgroundSlideshow')}>
                        <p className="text-[10px] text-[var(--text-secondary)] mb-2">{t('credit.backgroundSlideshowHint')}</p>
                        {(() => {
                            const backgrounds: CreditBackground[] = cmd.backgrounds || [];
                            const bgAssetOptions: { value: string; label: string; group?: string }[] = [];
                            Object.values(project.backgrounds).forEach((b: VNBackground) => {
                                bgAssetOptions.push({ value: b.id, label: b.name, group: t('credit.groupBackgrounds') });
                            });
                            Object.values(project.images).forEach((img: VNImage) => {
                                bgAssetOptions.push({ value: img.id, label: img.name, group: t('credit.groupImages') });
                            });

                            const updateBg = (index: number, updates: Partial<CreditBackground>) => {
                                const newBgs = [...backgrounds];
                                newBgs[index] = { ...newBgs[index], ...updates };
                                updateCommand({ backgrounds: newBgs });
                            };
                            const removeBg = (index: number) => {
                                updateCommand({ backgrounds: backgrounds.filter((_, i) => i !== index) });
                            };
                            const addBg = () => {
                                const newBg: CreditBackground = { assetId: null, displayDuration: 5, transition: 'fade', transitionDuration: 0.8 };
                                updateCommand({ backgrounds: [...backgrounds, newBg] });
                            };
                            const moveBg = (index: number, dir: -1 | 1) => {
                                const newBgs = [...backgrounds];
                                const swap = index + dir;
                                if (swap < 0 || swap >= newBgs.length) return;
                                [newBgs[index], newBgs[swap]] = [newBgs[swap], newBgs[index]];
                                updateCommand({ backgrounds: newBgs });
                            };

                            return <>
                                <div className="space-y-2 mb-2">
                                    {backgrounds.map((bg, i) => (
                                        <div key={i} className="p-2 rounded-lg border bg-indigo-900/15 border-indigo-500/25">
                                            <div className="flex items-center gap-1 mb-1.5">
                                                <span className="text-[10px] uppercase font-bold text-indigo-300">{t('credit.slide', { n: i + 1 })}</span>
                                                <div className="flex-1" />
                                                <button onClick={() => moveBg(i, -1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveUp')}><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => moveBg(i, 1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveDown')}><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => removeBg(i)} className="p-0.5 text-red-400 hover:text-red-300" title={t('credit.remove')}><XMarkIcon className="w-3.5 h-3.5" /></button>
                                            </div>
                                            <SearchableSelect
                                                options={bgAssetOptions}
                                                value={bg.assetId || ''}
                                                onChange={(value) => updateBg(i, { assetId: value || null })}
                                                placeholder={bgAssetOptions.length === 0 ? t('credit.noAssets') : t('credit.selectImageVideo')}
                                            />
                                            <div className="grid grid-cols-2 gap-1 mt-1.5">
                                                <FormField label={t('credit.displaySec')}>
                                                    <TextInput type="number" min="1" max="120" step="0.5" value={bg.displayDuration} onChange={e => updateBg(i, { displayDuration: parseFloat(e.target.value) || 5 })} />
                                                </FormField>
                                                <FormField label={t('credit.transition')}>
                                                    <Select value={bg.transition} onChange={e => updateBg(i, { transition: e.target.value as CreditBackground['transition'] })}>
                                                        <option value="fade">{t('credit.transitionFade')}</option>
                                                        <option value="dissolve">{t('credit.transitionDissolve')}</option>
                                                        <option value="instant">{t('credit.transitionInstant')}</option>
                                                    </Select>
                                                </FormField>
                                            </div>
                                            {bg.transition !== 'instant' && (
                                                <FormField label={t('credit.transitionDuration')}>
                                                    <TextInput type="number" min="0.1" max="5" step="0.1" value={bg.transitionDuration} onChange={e => updateBg(i, { transitionDuration: parseFloat(e.target.value) || 0.5 })} />
                                                </FormField>
                                            )}
                                            <FormField label={t('credit.sizing')}>
                                                <Select value={bg.objectFit || 'cover'} onChange={e => {
                                                    const val = e.target.value as 'cover' | 'contain' | 'fill' | 'custom';
                                                    if (val === 'custom') {
                                                        updateBg(i, { objectFit: val });
                                                    } else {
                                                        updateBg(i, { objectFit: val, x: 0, y: 0, width: 100, height: 100 });
                                                    }
                                                }}>
                                                    <option value="cover">{t('credit.sizingCover')}</option>
                                                    <option value="contain">{t('credit.sizingContain')}</option>
                                                    <option value="fill">{t('credit.sizingFill')}</option>
                                                    <option value="custom">{t('credit.sizingCustom')}</option>
                                                </Select>
                                            </FormField>
                                            {bg.objectFit === 'custom' && (
                                                <>
                                                    <div className="grid grid-cols-2 gap-1 mt-1.5">
                                                        <FormField label={t('credit.x')}><TextInput type="number" min="0" max="100" step="1" value={bg.x ?? 0} onChange={e => updateBg(i, { x: parseFloat(e.target.value) || 0 })} /></FormField>
                                                        <FormField label={t('credit.y')}><TextInput type="number" min="0" max="100" step="1" value={bg.y ?? 0} onChange={e => updateBg(i, { y: parseFloat(e.target.value) || 0 })} /></FormField>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1">
                                                        <FormField label={t('credit.width')}><TextInput type="number" min="1" max="100" step="1" value={bg.width ?? 100} onChange={e => updateBg(i, { width: parseFloat(e.target.value) || 100 })} /></FormField>
                                                        <FormField label={t('credit.height')}><TextInput type="number" min="1" max="100" step="1" value={bg.height ?? 100} onChange={e => updateBg(i, { height: parseFloat(e.target.value) || 100 })} /></FormField>
                                                    </div>
                                                </>
                                            )}
                                            <FormField label={t('credit.opacity', { value: Math.round((bg.opacity ?? 1) * 100) })}>
                                                <input type="range" min="0" max="1" step="0.01" value={bg.opacity ?? 1} onChange={e => updateBg(i, { opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                                            </FormField>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={addBg}
                                    className="w-full px-2 py-1.5 text-xs bg-indigo-900/25 hover:bg-indigo-800/35 border border-indigo-500/25 rounded text-indigo-300 transition-colors"
                                >
                                    {t('credit.addBackgroundSlide')}
                                </button>
                            </>;
                        })()}
                    </FormField>
                    <hr className="border-[var(--border-subtle)] my-3" />
                    <FormField label={t('credit.foregroundMedia')}>
                        <p className="text-[10px] text-[var(--text-secondary)] mb-2">{t('credit.foregroundMediaHint')}</p>
                        {(() => {
                            const mediaList: CreditMedia[] = cmd.media || [];
                            const mediaAssetOptions: { value: string; label: string; group?: string }[] = [];
                            Object.values(project.backgrounds).forEach((b: VNBackground) => {
                                mediaAssetOptions.push({ value: b.id, label: b.name, group: t('credit.groupBackgrounds') });
                            });
                            Object.values(project.images).forEach((img: VNImage) => {
                                mediaAssetOptions.push({ value: img.id, label: img.name, group: t('credit.groupImages') });
                            });
                            Object.values(project.videos).forEach((v: VNVideo) => {
                                mediaAssetOptions.push({ value: v.id, label: v.name, group: t('credit.groupVideos') });
                            });

                            const updateMedia = (index: number, updates: Partial<CreditMedia>) => {
                                const newMedia = [...mediaList];
                                newMedia[index] = { ...newMedia[index], ...updates };
                                updateCommand({ media: newMedia });
                            };
                            const removeMedia = (index: number) => {
                                updateCommand({ media: mediaList.filter((_, i) => i !== index) });
                            };
                            const addMedia = () => {
                                const newItem: CreditMedia = { assetId: null, x: 10, y: 10, width: 30, height: 30, opacity: 1, objectFit: 'contain', showAt: 0, hideAt: 0, transition: 'fade', transitionDuration: 0.5 };
                                updateCommand({ media: [...mediaList, newItem] });
                            };
                            const moveMedia = (index: number, dir: -1 | 1) => {
                                const newMedia = [...mediaList];
                                const swap = index + dir;
                                if (swap < 0 || swap >= newMedia.length) return;
                                [newMedia[index], newMedia[swap]] = [newMedia[swap], newMedia[index]];
                                updateCommand({ media: newMedia });
                            };

                            return <>
                                <div className="space-y-2 mb-2">
                                    {mediaList.map((item, i) => (
                                        <div key={i} className="p-2 rounded-lg border bg-emerald-900/15 border-emerald-500/25">
                                            <div className="flex items-center gap-1 mb-1.5">
                                                <span className="text-[10px] uppercase font-bold text-emerald-300">{t('credit.media', { n: i + 1 })}</span>
                                                <div className="flex-1" />
                                                <button onClick={() => moveMedia(i, -1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveUp')}><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => moveMedia(i, 1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title={t('credit.moveDown')}><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => removeMedia(i)} className="p-0.5 text-red-400 hover:text-red-300" title={t('credit.remove')}><XMarkIcon className="w-3.5 h-3.5" /></button>
                                            </div>
                                            <SearchableSelect
                                                options={mediaAssetOptions}
                                                value={item.assetId || ''}
                                                onChange={(value) => updateMedia(i, { assetId: value || null })}
                                                placeholder={mediaAssetOptions.length === 0 ? t('credit.noAssets') : t('credit.selectImageVideo')}
                                            />
                                            <FormField label={t('credit.sizing')}>
                                                <Select value={item.objectFit || 'contain'} onChange={e => {
                                                    const val = e.target.value as 'cover' | 'contain' | 'fill' | 'custom';
                                                    if (val === 'custom') {
                                                        updateMedia(i, { objectFit: val });
                                                    } else {
                                                        updateMedia(i, { objectFit: val, x: 10, y: 10, width: 30, height: 30 });
                                                    }
                                                }}>
                                                    <option value="cover">{t('credit.sizingCover')}</option>
                                                    <option value="contain">{t('credit.sizingContain')}</option>
                                                    <option value="fill">{t('credit.sizingFill')}</option>
                                                    <option value="custom">{t('credit.sizingCustom')}</option>
                                                </Select>
                                            </FormField>
                                            {item.objectFit === 'custom' && (
                                                <>
                                                    <div className="grid grid-cols-2 gap-1 mt-1.5">
                                                        <FormField label={t('credit.x')}><TextInput type="number" min="0" max="100" step="1" value={item.x} onChange={e => updateMedia(i, { x: parseFloat(e.target.value) || 0 })} /></FormField>
                                                        <FormField label={t('credit.y')}><TextInput type="number" min="0" max="100" step="1" value={item.y} onChange={e => updateMedia(i, { y: parseFloat(e.target.value) || 0 })} /></FormField>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1">
                                                        <FormField label={t('credit.width')}><TextInput type="number" min="1" max="100" step="1" value={item.width} onChange={e => updateMedia(i, { width: parseFloat(e.target.value) || 30 })} /></FormField>
                                                        <FormField label={t('credit.height')}><TextInput type="number" min="1" max="100" step="1" value={item.height} onChange={e => updateMedia(i, { height: parseFloat(e.target.value) || 30 })} /></FormField>
                                                    </div>
                                                </>
                                            )}
                                            <FormField label={t('credit.opacity', { value: Math.round((item.opacity ?? 1) * 100) })}>
                                                <input type="range" min="0" max="1" step="0.01" value={item.opacity ?? 1} onChange={e => updateMedia(i, { opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                                            </FormField>
                                            <div className="grid grid-cols-2 gap-1 mt-1.5">
                                                <FormField label={t('credit.showAt')}><TextInput type="number" min="0" step="0.5" value={item.showAt} onChange={e => updateMedia(i, { showAt: parseFloat(e.target.value) || 0 })} /></FormField>
                                                <FormField label={t('credit.hideAt')}><TextInput type="number" min="0" step="0.5" value={item.hideAt} onChange={e => updateMedia(i, { hideAt: parseFloat(e.target.value) || 0 })} /></FormField>
                                            </div>
                                            <p className="text-[9px] text-[var(--text-muted)] mt-0.5">{t('credit.hideAtHint')}</p>
                                            <div className="grid grid-cols-2 gap-1 mt-1">
                                                <FormField label={t('credit.transition')}>
                                                    <Select value={item.transition} onChange={e => updateMedia(i, { transition: e.target.value as 'fade' | 'instant' })}>
                                                        <option value="fade">{t('credit.transitionFade')}</option>
                                                        <option value="instant">{t('credit.transitionInstant')}</option>
                                                    </Select>
                                                </FormField>
                                                {item.transition !== 'instant' && (
                                                    <FormField label={t('credit.duration')}>
                                                        <TextInput type="number" min="0.1" max="5" step="0.1" value={item.transitionDuration} onChange={e => updateMedia(i, { transitionDuration: parseFloat(e.target.value) || 0.5 })} />
                                                    </FormField>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={addMedia}
                                    className="w-full px-2 py-1.5 text-xs bg-emerald-900/25 hover:bg-emerald-800/35 border border-emerald-500/25 rounded text-emerald-300 transition-colors"
                                >
                                    {t('credit.addMediaItem')}
                                </button>
                            </>;
                        })()}
                    </FormField>
                </>;
            }
            case CommandType.Group: {
                const cmd = command as GroupCommand;
                return <>
                    <FormField label={t('group.name')}>
                        <TextInput value={cmd.name || ''} onChange={e => updateCommand({ name: e.target.value })} placeholder={t('group.namePlaceholder')} />
                    </FormField>
                    <p className="text-xs text-[var(--text-secondary)] mt-2">
                        {t('group.contains', { count: cmd.commandIds?.length || 0 })}
                    </p>
                </>;
            }
            case CommandType.RunScript: {
                const cmd = command as RunScriptCommand;
                const scripts = Object.values(project.scripts || {});
                const selectedScript = cmd.scriptId ? (project.scripts || {})[cmd.scriptId] : null;
                return <>
                    <FormField label={t('runScript.script')}>
                        <Select value={cmd.scriptId} onChange={e => updateCommand({ scriptId: e.target.value })}>
                            <option value="">{t('runScript.selectScript')}</option>
                            {scripts.map((s: any) => (
                                <option key={s.id} value={s.id}>{s.name}{!s.enabled ? t('runScript.disabled') : ''}</option>
                            ))}
                        </Select>
                    </FormField>
                    {scripts.length === 0 && (
                        <p className="text-xs text-amber-400">{t('runScript.noScripts')}</p>
                    )}
                    {selectedScript && (
                        <div className="text-xs p-2 rounded mt-1" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                            <p><strong>{t('runScript.trigger')}</strong> {selectedScript.trigger}</p>
                            {selectedScript.description && <p className="mt-0.5">{selectedScript.description}</p>}
                        </div>
                    )}
                    <FormField label={t('runScript.waitForCompletion')}>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={cmd.waitForCompletion} onChange={e => updateCommand({ waitForCompletion: e.target.checked })} />
                            <span className="text-xs text-[var(--text-primary)]">{t('runScript.waitForCompletionHint')}</span>
                        </label>
                    </FormField>
                </>;
            }
            case CommandType.SpawnParticles: {
                const cmd = command as SpawnParticlesCommand;
                const particlePresetOptions = [
                    { value: 'none', label: t('particles.presetCustom') },
                    { value: 'fireflies', label: t('particles.presetFireflies') },
                    { value: 'sparks', label: t('particles.presetSparks') },
                    { value: 'bubbles', label: t('particles.presetBubbles') },
                    { value: 'confetti', label: t('particles.presetConfetti') },
                    { value: 'embers', label: t('particles.presetEmbers') },
                    { value: 'dust', label: t('particles.presetDust') },
                    { value: 'petals', label: t('particles.presetPetals') },
                    { value: 'magic', label: t('particles.presetMagic') },
                    { value: 'stars', label: t('particles.presetStars') },
                ];
                const shapeOptions = [
                    { value: 'circle', label: t('particles.shapeCircle') },
                    { value: 'square', label: t('particles.shapeSquare') },
                    { value: 'star', label: t('particles.shapeStar') },
                    { value: 'heart', label: t('particles.shapeHeart') },
                    { value: 'sparkle', label: t('particles.shapeSparkle') },
                ];
                const isCustom = !cmd.config?.preset || cmd.config.preset === 'none';
                return <>
                    <FormField label={t('particles.particleTag')}>
                        <TextInput value={cmd.particleTag || ''} onChange={e => updateCommand({ particleTag: e.target.value })} placeholder={t('particles.particleTagPlaceholder')} />
                    </FormField>
                    <FormField label={t('particles.preset')}>
                        <Select value={cmd.config?.preset || 'none'} onChange={e => {
                            const newPreset = e.target.value;
                            if (newPreset === 'none') {
                                // Switching to custom: keep current config values
                                updateCommand({ config: { ...(cmd.config || {}), preset: 'none' } });
                            } else {
                                // Switching to a preset: reset config to ONLY the preset name
                                // The ParticleSystem's resolveConfig() fills in preset defaults
                                updateCommand({ config: { preset: newPreset } as any });
                            }
                        }}>
                            {particlePresetOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </Select>
                    </FormField>
                    <FormField label={t('particles.durationSec')}>
                        <input type="number" min="0" step="0.5" value={cmd.duration || 0} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.durationHint')}</span>
                    </FormField>
                    {/* Key controls shown for ALL modes (preset + custom) */}
                    <FormField label={t('particles.density')}>
                        <input type="range" min="1" max="200" value={cmd.config?.emitRate || 20} onChange={e => updateCommand({ config: { ...cmd.config, emitRate: parseInt(e.target.value) || 20 } })} className="w-full" />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.densityHint', { value: cmd.config?.emitRate || 20 })}</span>
                    </FormField>
                    <FormField label={t('particles.speed')}>
                        <div className="flex gap-1">
                            <input type="number" min="0" value={cmd.config?.speedMin ?? 10} onChange={e => updateCommand({ config: { ...cmd.config, speedMin: parseFloat(e.target.value) || 0 } })}
                                className="w-1/2 rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                            <input type="number" min="0" value={cmd.config?.speedMax ?? 50} onChange={e => updateCommand({ config: { ...cmd.config, speedMax: parseFloat(e.target.value) || 0 } })}
                                className="w-1/2 rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                        </div>
                    </FormField>
                    <FormField label={t('particles.size')}>
                        <div className="flex gap-1">
                            <input type="number" min="0.5" value={cmd.config?.sizeMin ?? 2} onChange={e => updateCommand({ config: { ...cmd.config, sizeMin: parseFloat(e.target.value) || 1 } })}
                                className="w-1/2 rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                            <input type="number" min="0.5" value={cmd.config?.sizeMax ?? 8} onChange={e => updateCommand({ config: { ...cmd.config, sizeMax: parseFloat(e.target.value) || 1 } })}
                                className="w-1/2 rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                        </div>
                    </FormField>
                    {/* Emission area controls — always visible */}
                    <FormField label={t('particles.emissionArea')}>
                        <Select value={(() => {
                            const eX = cmd.config?.emitterX ?? 50;
                            const eY = cmd.config?.emitterY ?? 50;
                            const eW = cmd.config?.emitterWidth ?? 100;
                            const eH = cmd.config?.emitterHeight ?? 100;
                            if (eW === 100 && eH === 100 && eX === 50 && eY === 50) return 'full-screen';
                            if (eW >= 90 && eH <= 10 && eY <= 5) return 'top-edge';
                            if (eW >= 90 && eH <= 10 && eY >= 95) return 'bottom-edge';
                            if (eW >= 90 && eH <= 10 && eY >= 45 && eY <= 55) return 'horizontal-line';
                            if (eW <= 10 && eH <= 10) return 'point';
                            return 'custom';
                        })()} onChange={e => {
                            const mode = e.target.value;
                            const areaPresets: Record<string, { emitterX: number; emitterY: number; emitterWidth: number; emitterHeight: number }> = {
                                'full-screen': { emitterX: 50, emitterY: 50, emitterWidth: 100, emitterHeight: 100 },
                                'top-edge': { emitterX: 50, emitterY: 0, emitterWidth: 100, emitterHeight: 5 },
                                'bottom-edge': { emitterX: 50, emitterY: 100, emitterWidth: 100, emitterHeight: 5 },
                                'horizontal-line': { emitterX: 50, emitterY: 50, emitterWidth: 100, emitterHeight: 5 },
                                'point': { emitterX: 50, emitterY: 50, emitterWidth: 0, emitterHeight: 0 },
                            };
                            if (areaPresets[mode]) {
                                updateCommand({ config: { ...cmd.config, ...areaPresets[mode] } });
                            }
                        }}>
                            <option value="full-screen">{t('particles.areaFullScreen')}</option>
                            <option value="top-edge">{t('particles.areaTopEdge')}</option>
                            <option value="bottom-edge">{t('particles.areaBottomEdge')}</option>
                            <option value="horizontal-line">{t('particles.areaHorizontalLine')}</option>
                            <option value="point">{t('particles.areaPoint')}</option>
                            <option value="custom">{t('particles.areaCustom')}</option>
                        </Select>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.emissionAreaHint')}</span>
                    </FormField>
                    <FormField label={t('particles.emitterCenter')}>
                        <div className="flex gap-1">
                            <input type="number" min="0" max="100" value={cmd.config?.emitterX ?? 50} onChange={e => updateCommand({ config: { ...cmd.config, emitterX: parseFloat(e.target.value) } })}
                                className="w-1/2 rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                            <input type="number" min="0" max="100" value={cmd.config?.emitterY ?? 50} onChange={e => updateCommand({ config: { ...cmd.config, emitterY: parseFloat(e.target.value) } })}
                                className="w-1/2 rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.emitterCenterHint')}</span>
                    </FormField>
                    <FormField label={t('particles.emitterSpread')}>
                        <div className="flex gap-1">
                            <input type="number" min="0" max="200" value={cmd.config?.emitterWidth ?? 100} onChange={e => updateCommand({ config: { ...cmd.config, emitterWidth: parseFloat(e.target.value) } })}
                                className="w-1/2 rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                            <input type="number" min="0" max="200" value={cmd.config?.emitterHeight ?? 100} onChange={e => updateCommand({ config: { ...cmd.config, emitterHeight: parseFloat(e.target.value) } })}
                                className="w-1/2 rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                        </div>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.emitterSpreadHint')}</span>
                    </FormField>
                    {/* Extended controls only for custom mode */}
                    {isCustom && <>
                        <FormField label={t('particles.shape')}>
                            <Select value={cmd.config?.shape || 'circle'} onChange={e => updateCommand({ config: { ...cmd.config, shape: e.target.value } })}>
                                {shapeOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </Select>
                        </FormField>
                        <FormField label={t('particles.lifetime')}>
                            <input type="number" min="0.1" max="30" step="0.1" value={cmd.config?.lifetime || 3} onChange={e => updateCommand({ config: { ...cmd.config, lifetime: parseFloat(e.target.value) || 3 } })}
                                className="w-full rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                        </FormField>
                        <FormField label={t('particles.gravity')}>
                            <input type="range" min="-100" max="100" value={cmd.config?.gravity || 0} onChange={e => updateCommand({ config: { ...cmd.config, gravity: parseFloat(e.target.value) } })} className="w-full" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.gravityHint', { value: cmd.config?.gravity || 0 })}</span>
                        </FormField>
                        <FormField label={t('particles.wind')}>
                            <input type="range" min="-50" max="50" value={cmd.config?.wind || 0} onChange={e => updateCommand({ config: { ...cmd.config, wind: parseFloat(e.target.value) } })} className="w-full" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{cmd.config?.wind || 0}</span>
                        </FormField>
                        <FormField label={t('particles.colors')}>
                            <TextInput value={(cmd.config?.colors || ['#FFFFFF']).join(', ')} onChange={e => updateCommand({ config: { ...cmd.config, colors: e.target.value.split(',').map((c: string) => c.trim()).filter(Boolean) } })} placeholder="#FF0000, #00FF00, #0000FF" />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.colorsHint')}</span>
                        </FormField>
                        <FormField label={t('particles.options')}>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={cmd.config?.fadeOut ?? true} onChange={e => updateCommand({ config: { ...cmd.config, fadeOut: e.target.checked } })} />
                                <span className="text-xs text-[var(--text-primary)]">{t('particles.fadeOut')}</span>
                            </label>
                            <label className="flex items-center gap-2 mt-1">
                                <input type="checkbox" checked={cmd.config?.shrink ?? false} onChange={e => updateCommand({ config: { ...cmd.config, shrink: e.target.checked } })} />
                                <span className="text-xs text-[var(--text-primary)]">{t('particles.shrink')}</span>
                            </label>
                        </FormField>
                    </>}
                </>;
            }
            case CommandType.StopParticles: {
                const cmd = command as StopParticlesCommand;
                // Offer the actual emitters spawned earlier in this scene. A free-text
                // tag silently matched nothing when mistyped (or when relying on the old
                // shared default), so particles never stopped. The effective tag mirrors
                // the runtime: `particleTag || particles_<spawnCommandId>`.
                const availableEmitters = activeScene.commands
                    .filter((c, i): c is SpawnParticlesCommand => c.type === CommandType.SpawnParticles && i < selectedCommandIndex)
                    .map(c => {
                        const tag = c.particleTag || `particles_${c.id}`;
                        const preset = c.config?.preset && c.config.preset !== 'none' ? c.config.preset : 'particles';
                        return { tag, label: c.particleTag ? c.particleTag : `${preset} (${c.id.slice(0, 6)})` };
                    });
                // Preserve a custom/legacy tag that isn't in the spawn list so it isn't lost.
                if (cmd.particleTag && !availableEmitters.some(e => e.tag === cmd.particleTag)) {
                    availableEmitters.push({ tag: cmd.particleTag, label: cmd.particleTag });
                }
                return <>
                    <FormField label={t('particles.particleTag')}>
                        <Select value={cmd.particleTag || ''} onChange={e => updateCommand({ particleTag: e.target.value })}>
                            <option value="">{t('particles.stopAll')}</option>
                            {availableEmitters.map((em, i) => (
                                <option key={`${em.tag}-${i}`} value={em.tag}>{em.label}</option>
                            ))}
                        </Select>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.stopTagHint')}</span>
                    </FormField>
                    <FormField label={t('particles.fadeDurationSec')}>
                        <input type="number" min="0" step="0.1" value={cmd.fadeDuration || 0} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded px-2 py-1 text-sm" style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('particles.fadeInstant')}</span>
                    </FormField>
                </>;
            }
            case CommandType.CallCommonEvent: {
                const cmd = command as CallCommonEventCommand;
                const commonEvents = Object.values(project.commonEvents || {});
                const selectedCE = cmd.commonEventId ? (project.commonEvents || {})[cmd.commonEventId] : null;
                return <>
                    <FormField label={t('callCommonEvent.commonEvent')}>
                        <Select value={cmd.commonEventId || ''} onChange={e => updateCommand({ commonEventId: e.target.value, arguments: {} })}>
                            <option value="">{t('callCommonEvent.selectCommonEvent')}</option>
                            {commonEvents.map((ce: any) => (
                                <option key={ce.id} value={ce.id}>{ce.name}{!ce.enabled ? t('callCommonEvent.disabled') : ''}</option>
                            ))}
                        </Select>
                    </FormField>
                    {commonEvents.length === 0 && (
                        <p className="text-xs text-amber-400">{t('callCommonEvent.noCommonEvents')}</p>
                    )}
                    {selectedCE && (
                        <div className="text-xs p-2 rounded mt-1" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                            <p><strong>{t('callCommonEvent.trigger')}</strong> {selectedCE.trigger}</p>
                            <p><strong>{t('callCommonEvent.commands')}</strong> {selectedCE.commands?.length || 0}</p>
                            {selectedCE.description && <p className="mt-0.5">{selectedCE.description}</p>}
                        </div>
                    )}
                    {selectedCE && selectedCE.parameters && selectedCE.parameters.length > 0 && (
                        <>
                            <hr className="border-[var(--border-subtle)] my-2" />
                            <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{t('callCommonEvent.arguments')}</h4>
                            <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                                {t('callCommonEvent.argumentsHint')}
                            </p>
                            {selectedCE.parameters.map((param: any) => (
                                <FormField key={param.id} label={param.name}>
                                    {param.type === 'boolean' ? (
                                        <label className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={!!(cmd.arguments || {})[param.id] ?? param.defaultValue}
                                                onChange={e => updateCommand({
                                                    arguments: { ...(cmd.arguments || {}), [param.id]: e.target.checked }
                                                })}
                                            />
                                            <span className="text-xs text-[var(--text-secondary)]">{param.description || param.name}</span>
                                        </label>
                                    ) : param.type === 'number' ? (
                                        <input
                                            type="number"
                                            value={Number((cmd.arguments || {})[param.id] ?? param.defaultValue)}
                                            onChange={e => updateCommand({
                                                arguments: { ...(cmd.arguments || {}), [param.id]: parseFloat(e.target.value) || 0 }
                                            })}
                                            className="w-full rounded px-2 py-1 text-sm"
                                            style={{ backgroundColor: 'var(--background-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
                                        />
                                    ) : (
                                        <TextInput
                                            value={String((cmd.arguments || {})[param.id] ?? param.defaultValue)}
                                            onChange={e => updateCommand({
                                                arguments: { ...(cmd.arguments || {}), [param.id]: e.target.value }
                                            })}
                                            placeholder={param.description || t('callCommonEvent.valueFor', { name: param.name })}
                                        />
                                    )}
                                </FormField>
                            ))}
                        </>
                    )}
                </>;
            }
            case CommandType.TweenElement: {
                const cmd = command as TweenElementCommand;
                const targetTypeOptions = [
                    { value: 'character', label: t('tween.typeCharacter') },
                    { value: 'image', label: t('tween.typeImage') },
                    { value: 'text', label: t('tween.typeText') },
                    { value: 'button', label: t('tween.typeButton') },
                    { value: 'movie', label: t('tween.typeMovie') },
                    { value: 'screen', label: t('tween.typeScreen') },
                ];
                const easingOptions = [
                    { group: 'Linear', options: ['linear'] },
                    { group: 'Quad', options: ['easeInQuad', 'easeOutQuad', 'easeInOutQuad'] },
                    { group: 'Cubic', options: ['easeInCubic', 'easeOutCubic', 'easeInOutCubic'] },
                    { group: 'Quart', options: ['easeInQuart', 'easeOutQuart', 'easeInOutQuart'] },
                    { group: 'Quint', options: ['easeInQuint', 'easeOutQuint', 'easeInOutQuint'] },
                    { group: 'Sine', options: ['easeInSine', 'easeOutSine', 'easeInOutSine'] },
                    { group: 'Expo', options: ['easeInExpo', 'easeOutExpo', 'easeInOutExpo'] },
                    { group: 'Circ', options: ['easeInCirc', 'easeOutCirc', 'easeInOutCirc'] },
                    { group: 'Back', options: ['easeInBack', 'easeOutBack', 'easeInOutBack'] },
                    { group: 'Elastic', options: ['easeInElastic', 'easeOutElastic', 'easeInOutElastic'] },
                    { group: 'Bounce', options: ['easeInBounce', 'easeOutBounce', 'easeInOutBounce'] },
                ];
                // Build target ID options based on selected target type
                const targetIdOptions: { value: string; label: string }[] = [];
                if (cmd.targetType === 'character') {
                    Object.values(project.characters).forEach((c: VNCharacter) => targetIdOptions.push({ value: c.id, label: c.name }));
                } else if (cmd.targetType === 'screen') {
                    targetIdOptions.push({ value: '__screen__', label: t('tween.screen') });
                } else if (cmd.targetType === 'text') {
                    activeScene.commands
                        .filter((c): c is ShowTextCommand => c.type === CommandType.ShowText)
                        .forEach(c => targetIdOptions.push({ value: c.id, label: `"${c.text.substring(0, 30)}${c.text.length > 30 ? '…' : ''}"` }));
                } else if (cmd.targetType === 'image') {
                    activeScene.commands
                        .filter((c): c is ShowImageCommand => c.type === CommandType.ShowImage)
                        .forEach(c => {
                            const img = (project.images || {})[c.imageId] as VNImage | undefined;
                            targetIdOptions.push({ value: c.id, label: img?.name || t('tween.imageLabel', { id: c.id.substring(0, 8) }) });
                        });
                } else if (cmd.targetType === 'button') {
                    activeScene.commands
                        .filter((c): c is ShowButtonCommand => c.type === CommandType.ShowButton)
                        .forEach(c => targetIdOptions.push({ value: c.id, label: `"${c.text.substring(0, 30)}${c.text.length > 30 ? '…' : ''}"` }));
                } else if (cmd.targetType === 'movie') {
                    activeScene.commands
                        .filter((c): c is PlayMovieCommand => c.type === CommandType.PlayMovie)
                        .forEach(c => { const v = (project.videos || {})[c.videoId]; targetIdOptions.push({ value: c.id, label: v?.name || t('tween.imageLabel', { id: c.id.substring(0, 8) }) }); });
                }

                const showPosFields = cmd.targetType !== 'screen';
                const showSizeFields = cmd.targetType === 'image' || cmd.targetType === 'button' || cmd.targetType === 'text' || cmd.targetType === 'movie';
                const showOpacity = cmd.targetType !== 'screen' && cmd.targetType !== 'text';
                const showRotation = cmd.targetType === 'image' || cmd.targetType === 'movie';
                const showScale = cmd.targetType === 'character';
                const showScaleXY = cmd.targetType === 'image' || cmd.targetType === 'movie';
                const showFontSize = cmd.targetType === 'text' || cmd.targetType === 'button';
                const showBorderRadius = cmd.targetType === 'button';
                const showBgColor = cmd.targetType === 'button';
                const showColor = cmd.targetType === 'text';
                const showZoomPan = cmd.targetType === 'screen';

                return <>
                    <FormField label={t('tween.targetType')}>
                        <Select value={cmd.targetType} onChange={e => updateCommand({ targetType: e.target.value, targetId: '' })}>
                            {targetTypeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </Select>
                    </FormField>
                    <FormField label={t('tween.targetId')}>
                        {targetIdOptions.length > 0 ? (
                            <SearchableSelect
                                options={targetIdOptions}
                                value={cmd.targetId}
                                onChange={(value) => updateCommand({ targetId: value })}
                                placeholder={t('tween.selectTarget')}
                            />
                        ) : (
                            <TextInput
                                value={cmd.targetId}
                                onChange={e => updateCommand({ targetId: e.target.value })}
                                placeholder={t('tween.noMatchingShow')}
                            />
                        )}
                    </FormField>
                    <FormField label={t('tween.durationSeconds')}>
                        <TextInput type="number" min="0.01" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 1 })} />
                    </FormField>
                    <FormField label={t('tween.easing')}>
                        <Select value={cmd.easing || 'easeInOutCubic'} onChange={e => updateCommand({ easing: e.target.value })}>
                            {easingOptions.map(group => (
                                <optgroup key={group.group} label={group.group}>
                                    {group.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </optgroup>
                            ))}
                        </Select>
                    </FormField>
                    <div className="flex items-center gap-1 mt-1">
                        <input type="checkbox" checked={cmd.waitForCompletion !== false} onChange={e => updateCommand({ waitForCompletion: e.target.checked })} className="h-4 w-4 rounded bg-[var(--bg-secondary)] border-[var(--border-default)]" />
                        <label className="text-sm">{t('tween.waitForCompletion')}</label>
                    </div>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{t('tween.targetProperties')}</h4>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{t('tween.targetPropertiesHint')}</p>
                    {showPosFields && (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('tween.x')}><TextInput type="number" step="0.1" value={cmd.x ?? ''} onChange={e => updateCommand({ x: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                            <FormField label={t('tween.y')}><TextInput type="number" step="0.1" value={cmd.y ?? ''} onChange={e => updateCommand({ y: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                        </div>
                    )}
                    {showSizeFields && (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('tween.width')}><TextInput type="number" min="0" step="1" value={cmd.width ?? ''} onChange={e => updateCommand({ width: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                            <FormField label={t('tween.height')}><TextInput type="number" min="0" step="1" value={cmd.height ?? ''} onChange={e => updateCommand({ height: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                        </div>
                    )}
                    {showOpacity && (
                        <FormField label={cmd.opacity !== undefined ? t('tween.opacity', { value: Math.round(cmd.opacity * 100) + '%' }) : t('tween.opacityNone')}>
                            <input type="range" min="0" max="1" step="0.01" value={cmd.opacity ?? 1} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                        </FormField>
                    )}
                    {showRotation && (
                        <FormField label={t('tween.rotation')}><TextInput type="number" step="1" value={cmd.rotation ?? ''} onChange={e => updateCommand({ rotation: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                    )}
                    {showScale && (
                        <FormField label={t('tween.scale')}>
                            <div className="flex items-center gap-2">
                                <input type="range" min="0.1" max="3" step="0.05" value={cmd.scale ?? 1} onChange={e => updateCommand({ scale: parseFloat(e.target.value) })} className="flex-1" />
                                <TextInput type="number" min="0.1" max="5" step="0.05" value={cmd.scale ?? ''} onChange={e => updateCommand({ scale: e.target.value ? parseFloat(e.target.value) : undefined })} style={{ width: '60px' }} />
                            </div>
                        </FormField>
                    )}
                    {showScaleXY && (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label={t('tween.scaleX')}><TextInput type="number" step="0.05" value={cmd.scaleX ?? ''} onChange={e => updateCommand({ scaleX: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                            <FormField label={t('tween.scaleY')}><TextInput type="number" step="0.05" value={cmd.scaleY ?? ''} onChange={e => updateCommand({ scaleY: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                        </div>
                    )}
                    {showFontSize && (
                        <FormField label={t('tween.fontSize')}><TextInput type="number" min="1" step="1" value={cmd.fontSize ?? ''} onChange={e => updateCommand({ fontSize: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                    )}
                    {showBorderRadius && (
                        <FormField label={t('tween.borderRadius')}><TextInput type="number" min="0" step="1" value={cmd.borderRadius ?? ''} onChange={e => updateCommand({ borderRadius: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                    )}
                    {showColor && (
                        <FormField label={t('tween.textColor')}>
                            <div className="flex gap-1 items-center">
                                <ColorInput value={cmd.color || '#FFFFFF'} onChange={val => updateCommand({ color: val })} className="w-12 h-10" />
                                <TextInput value={cmd.color ?? ''} onChange={e => updateCommand({ color: e.target.value || undefined })} placeholder="–" className="flex-grow" />
                            </div>
                        </FormField>
                    )}
                    {showBgColor && (
                        <FormField label={t('tween.backgroundColor')}>
                            <div className="flex gap-1 items-center">
                                <ColorInput value={cmd.backgroundColor || '#6366f1'} onChange={val => updateCommand({ backgroundColor: val })} className="w-12 h-10" />
                                <TextInput value={cmd.backgroundColor ?? ''} onChange={e => updateCommand({ backgroundColor: e.target.value || undefined })} placeholder="–" className="flex-grow" />
                            </div>
                        </FormField>
                    )}
                    {showZoomPan && (
                        <>
                            <FormField label={t('tween.zoom')}><TextInput type="number" min="0.1" step="0.1" value={cmd.zoom ?? ''} onChange={e => updateCommand({ zoom: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label={t('tween.panX')}><TextInput type="number" step="1" value={cmd.panX ?? ''} onChange={e => updateCommand({ panX: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                                <FormField label={t('tween.panY')}><TextInput type="number" step="1" value={cmd.panY ?? ''} onChange={e => updateCommand({ panY: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="–" /></FormField>
                            </div>
                        </>
                    )}
                </>;
            }
            default: return <p>{t('footer.noProperties')}</p>;
        }
    };

    return <Panel title={t('footer.titleNamed', { name: t(`commands:names.${command.type}`, { defaultValue: command.type.replace(/([A-Z])/g, ' $1').trim() }) })} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
        <div className="flex flex-col h-full">
            <div className="flex-grow overflow-y-auto pr-1">
                {(() => {
                    // Plugin-provided custom command: render a generic editor from its parameter schema.
                    const customDef = pluginManager.getCommand(command.type as string);
                    if (customDef) {
                        const params: Record<string, any> = (command as any).params || {};
                        const setParam = (name: string, value: any) => updateCommand({ params: { ...params, [name]: value } } as any);
                        return (
                            <div className="space-y-2">
                                {customDef.description && <p className="text-xs text-[var(--text-secondary)]">{customDef.description}</p>}
                                {(customDef.parameters || []).map(p => {
                                    const cur = params[p.name] ?? p.defaultValue ?? '';
                                    return (
                                        <label key={p.name} className="block text-xs">
                                            <span className="block mb-0.5 text-[var(--text-secondary)]">{p.label || p.name}{p.required ? ' *' : ''}</span>
                                            {p.type === 'boolean' ? (
                                                <input type="checkbox" checked={!!cur} onChange={e => setParam(p.name, e.target.checked)} />
                                            ) : p.type === 'select' ? (
                                                <select value={String(cur)} onChange={e => setParam(p.name, e.target.value)} className="w-full bg-[var(--bg-secondary)] text-[var(--text-primary)] px-2 py-1 rounded border border-[var(--border-default)]">
                                                    {(p.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                </select>
                                            ) : p.type === 'variable' ? (
                                                <select value={String(cur)} onChange={e => setParam(p.name, e.target.value)} className="w-full bg-[var(--bg-secondary)] text-[var(--text-primary)] px-2 py-1 rounded border border-[var(--border-default)]">
                                                    <option value="">—</option>
                                                    {Object.values(project.variables).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                                </select>
                                            ) : p.type === 'color' ? (
                                                <input type="color" value={String(cur || '#ffffff')} onChange={e => setParam(p.name, e.target.value)} className="w-full" />
                                            ) : (
                                                <input type={p.type === 'number' ? 'number' : 'text'} value={String(cur)} onChange={e => setParam(p.name, p.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value)} className="w-full bg-[var(--bg-secondary)] text-[var(--text-primary)] px-2 py-1 rounded border border-[var(--border-default)]" />
                                            )}
                                            {p.description && <span className="text-[10px] text-[var(--text-muted)]">{p.description}</span>}
                                        </label>
                                    );
                                })}
                            </div>
                        );
                    }
                    return isCommandGrouped(command) ? <CommandGroupAccordion command={command} updateCommand={updateCommand} ctx={{ sceneId: activeSceneId, commandIndex: selectedCommandIndex ?? 0 }} /> : renderProperties();
                })()}
                {(() => {
                    // Shared "Reset Position" for any positionable command — snaps the element
                    // back to its default placement (centre for overlays, 'center' for characters,
                    // top-left for movies). Covers media, text, image, button and character commands.
                    const RESETS: Partial<Record<CommandType, Partial<VNCommand>>> = {
                        [CommandType.ShowImage]: { x: 50, y: 50 } as Partial<VNCommand>,
                        [CommandType.ShowText]: { x: 50, y: 50 } as Partial<VNCommand>,
                        [CommandType.ShowButton]: { x: 50, y: 50 } as Partial<VNCommand>,
                        [CommandType.ShowCharacter]: { position: 'center' } as Partial<VNCommand>,
                        [CommandType.PlayMovie]: { x: 0, y: 0 } as Partial<VNCommand>,
                    };
                    const patch = RESETS[command.type];
                    if (!patch) return null;
                    return (
                        <button
                            type="button"
                            onClick={() => updateCommand(patch)}
                            className="w-full mt-3 text-xs px-2 py-1.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                            title="Snap this element back to its default position."
                        >
                            ⤢ Reset Position
                        </button>
                    );
                })()}
                <>
                    <hr className="border-[var(--border-subtle)] my-4" />
                    <h3 className="font-bold text-[var(--text-primary)]">{t('footer.parallelExecution')}</h3>
                    <p className="text-xs text-[var(--text-secondary)] mb-2">{t('footer.parallelDesc')}</p>
                    
                    {/* Run Async Checkbox */}
                    <div className="mb-4">
                        <label className="flex items-center gap-1 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={command.modifiers?.runAsync || false}
                                disabled={!canRunAsync(command.type)}
                                onChange={(e) => {
                                    const newModifiers = {
                                        ...command.modifiers,
                                        runAsync: e.target.checked
                                    };
                                    // Remove modifiers entirely if all values are falsy
                                    if (!newModifiers.runAsync && !newModifiers.stackId) {
                                        updateCommand({ modifiers: undefined });
                                    } else {
                                        updateCommand({ modifiers: newModifiers });
                                    }
                                }}
                                className="w-4 h-4 rounded border-[var(--border-default)] bg-[var(--bg-secondary)] text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                            />
                            <span className={`text-xs ${!canRunAsync(command.type) ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                                {t('footer.runAsync')} {command.modifiers?.runAsync && <BoltIcon className="w-3.5 h-3.5 inline text-[var(--accent-lavender)]" />}
                            </span>
                        </label>
                        
                        {/* Blocking Warning */}
                        {!canRunAsync(command.type) && (
                            <div className="mt-2 p-2 bg-red-900/30 border border-red-500/50 rounded text-xs text-red-300">
                                <span className="font-bold">{t('footer.cannotRunAsync')}</span> {t('footer.cannotRunAsyncDesc')}
                            </div>
                        )}
                        
                        {/* Unpredictable Warning */}
                        {canRunAsync(command.type) && hasUnpredictableAsyncBehavior(command.type) && command.modifiers?.runAsync && (
                            <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-500/50 rounded text-xs text-yellow-300">
                                <span className="font-bold">{t('footer.warning')}</span> {getAsyncWarning(command.type)}
                            </div>
                        )}
                        
                        {/* Stack Info */}
                        {isCommandStacked(command) && (
                            <div className="mt-2 p-2 bg-purple-900/30 border border-purple-500/50 rounded text-xs">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-purple-300 font-bold">{t('footer.stackedCommand')}</span>
                                    <span className="text-purple-400">{t('footer.stackId', { id: command.modifiers?.stackId?.substring(0, 8) })}</span>
                                </div>
                                <div className="text-purple-200 mb-2">
                                    {t('footer.positionInStack', { n: (command.modifiers?.stackOrder ?? 0) + 1 })}
                                </div>
                                <button
                                    onClick={() => {
                                        const unstacked = unstackCommand(command);
                                        updateCommand({ modifiers: unstacked.modifiers });
                                    }}
                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1 px-2 rounded transition-colors"
                                >
                                    {t('footer.unstackCommand')}
                                </button>
                            </div>
                        )}
                        
                        {/* Help Text */}
                        {command.modifiers?.runAsync && !isCommandStacked(command) && (
                            <p className="mt-2 text-xs text-[var(--text-secondary)]">
                                <LightBulbIcon className="w-3.5 h-3.5 inline text-yellow-400 mr-0.5" /> {t('footer.asyncTip')}
                            </p>
                        )}
                    </div>
                </>
                {/* Conditions footer — hidden for grouped commands, which surface it as
                    their own "Conditions" accordion group (with the live toggle) instead. */}
                {!isCommandGrouped(command) && (
                <>
                    <hr className="border-[var(--border-subtle)] my-4" />
                    <h3 className="font-bold text-[var(--text-primary)]">{t('footer.conditions')}</h3>
                    <p className="text-xs text-[var(--text-secondary)] mb-2">{t('footer.conditionsDesc')}</p>
                    <ConditionsEditor
                        conditions={command.conditions}
                        project={project}
                        onChange={(cs) => updateCommand({ conditions: cs })}
                    />
                    {(REACTIVE_VISUAL_TYPES.has(command.type) || command.type === CommandType.PlaySoundEffect) && (
                        <label className="flex items-start gap-2 mt-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!command.liveConditions}
                                onChange={e => updateCommand({ liveConditions: e.target.checked })}
                                className="w-4 h-4 mt-0.5 flex-shrink-0"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">
                                <span className="font-bold text-[var(--text-primary)]">{t('footer.liveConditions')}</span><br />
                                {command.type === CommandType.PlaySoundEffect
                                    ? 'Re-check this sound’s conditions as variables change: loop while met (or play once each time they become true).'
                                    : t('footer.liveConditionsDesc')}
                            </span>
                        </label>
                    )}
                </>
                )}
            </div>
            <div className="pt-2 mt-auto">
                <button onClick={handleDelete} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-[10px] flex items-center justify-center gap-1 transition-colors">
                    <TrashIcon className="w-3 h-3" /> {t('common:delete')}
                </button>
            </div>
        </div>
    </Panel>;
};

export default PropertiesInspector;



