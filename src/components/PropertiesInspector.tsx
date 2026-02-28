import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { VNID, VNPosition, VNPositionPreset, VNTransition } from '../types';
import { VNProject } from '../types/project';
import {
    VNCommand, CommandType, DialogueCommand, SetBackgroundCommand, ShowCharacterCommand,
    HideCharacterCommand, ChoiceCommand, SetVariableCommand, TextInputCommand, JumpCommand, ChoiceOption,
    PlayMusicCommand, StopMusicCommand, PlaySoundEffectCommand, WaitCommand, ShakeScreenCommand, PlayMovieCommand,
    TintScreenCommand, PanZoomScreenCommand, ResetScreenEffectsCommand, FlashScreenCommand, ShowScreenCommand,
    HideTextCommand, HideImageCommand, ShowTextCommand, ShowImageCommand, ShowButtonCommand, HideButtonCommand,
    LabelCommand, JumpToLabelCommand, BranchStartCommand, BranchEndCommand, CreditRollCommand, CreditEntry, CreditBackground, CreditMedia,
    GroupCommand, RunScriptCommand,
    VNScene,
    ChoiceAction,
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
import { VNVariable, VNVariableType } from '../features/variables/types';
import { VNCharacter, VNCharacterExpression } from '../features/character/types';
import { VNBackground, VNAudio, VNVideo, VNImage } from '../features/assets/types';
import Panel from './ui/Panel';
import { FormField, Select, TextInput, TextArea, ColorInput } from './ui/Form';
import { TrashIcon, XMarkIcon, PlusIcon, ChevronUpIcon, ChevronDownIcon, LightBulbIcon, BoltIcon, StarIcon } from './icons';
import AssetSelector from './ui/AssetSelector';
import ActionEditor from './menu-editor/ActionEditor';
import SearchableSelect from './ui/SearchableSelect';
import TransitionPreview from './ui/TransitionPreview';

const PositionInputs: React.FC<{
    label: string;
    position: VNPosition;
    onChange: (position: VNPosition) => void;
    disabled?: boolean;
}> = ({ label, position, onChange, disabled }) => {
    const isCustom = typeof position === 'object';
    const coords = isCustom ? position : { x: 50, y: 50 }; // default center
    const [showCustom, setShowCustom] = React.useState(isCustom);

    return (
        <div className={`space-y-2 ${disabled ? 'opacity-50' : ''}`}>
            <FormField label={label}>
                <div className="space-y-2">
                    <Select 
                        value={showCustom ? 'custom' : (isCustom ? 'custom' : position)} 
                        onChange={e => {
                            if (e.target.value === 'custom') {
                                setShowCustom(true);
                                onChange({ x: 50, y: 50 });
                            } else {
                                setShowCustom(false);
                                onChange(e.target.value as VNPositionPreset);
                            }
                        }}
                        disabled={disabled}
                    >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                        <option value="custom">Custom Coordinates</option>
                    </Select>
                    {showCustom && (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label="X (%)">
                                <TextInput 
                                    type="number" 
                                    min="0" 
                                    max="100" 
                                    value={coords.x} 
                                    onChange={e => onChange({ ...coords, x: parseFloat(e.target.value) || 0 })} 
                                    disabled={disabled}
                                />
                            </FormField>
                            <FormField label="Y (%)">
                                <TextInput 
                                    type="number" 
                                    min="0" 
                                    max="100" 
                                    value={coords.y} 
                                    onChange={e => onChange({ ...coords, y: parseFloat(e.target.value) || 0 })} 
                                    disabled={disabled}
                                />
                            </FormField>
                        </div>
                    )}
                </div>
            </FormField>
        </div>
    );
};

const ConditionsEditor: React.FC<{
    conditions: VNCondition[] | undefined;
    project: VNProject;
    onChange: (newConditions: VNCondition[] | undefined) => void;
    isRequired?: boolean;
}> = ({ conditions, project, onChange, isRequired }) => {
    const hasVariables = Object.keys(project.variables).length > 0;

    const getOperatorsForType = (type: VNVariableType | undefined): VNConditionOperator[] => {
        switch (type) {
            case 'string': return ['==', '!=', 'contains', 'startsWith'];
            case 'number': return ['==', '!=', '>', '<', '>=', '<='];
            case 'boolean': return ['is true', 'is false'];
            default: return ['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith'];
        }
    };

    const handleAddCondition = () => {
        const firstVarId = Object.keys(project.variables)[0];
        if (!firstVarId) return;
        const newCondition: VNCondition = {
            variableId: firstVarId,
            operator: '==',
            value: ''
        };
        onChange([...(conditions || []), newCondition]);
    };

    const handleUpdateCondition = (index: number, updates: Partial<VNCondition>) => {
        const newConditions = [...(conditions || [])];
        newConditions[index] = { ...newConditions[index], ...updates };

        // If operator changes, check if it's compatible
        if(updates.operator) {
            const variable = project.variables[newConditions[index].variableId];
            const allowedOperators = getOperatorsForType(variable?.type);
            if(!allowedOperators.includes(updates.operator)) {
                newConditions[index].operator = allowedOperators[0];
            }
        }
        // If variable changes, reset operator
        if(updates.variableId) {
            const variable = project.variables[updates.variableId];
            newConditions[index].operator = getOperatorsForType(variable?.type)[0];
        }

        onChange(newConditions);
    };

    const handleRemoveCondition = (index: number) => {
        const newConditions = (conditions || []).filter((_, i) => i !== index);
        if (newConditions.length === 0 && !isRequired) {
            onChange(undefined);
        } else {
            onChange(newConditions);
        }
    };

    if (!hasVariables) {
        return <p className="text-xs text-[var(--text-muted)]">No variables defined to create conditions.</p>;
    }

    if (!conditions && !isRequired) {
        return <button onClick={handleAddCondition} className="text-sky-400 hover:text-sky-300 text-xs">Add Condition</button>;
    }

    return (
        <div className="space-y-2">
            {(conditions || []).map((condition, index) => {
                const variable = project.variables[condition.variableId];
                const operators = getOperatorsForType(variable?.type);
                const valueIsHidden = condition.operator === 'is true' || condition.operator === 'is false';

                return (
                    <div key={index} className="p-1 border border-[var(--border-subtle)] rounded-md">
                        <div className="flex gap-1 items-start">
                            <div className="flex-grow space-y-1">
                                <FormField label="Variable">
                                    <Select value={condition.variableId} onChange={e => handleUpdateCondition(index, { variableId: e.target.value })}>
                                        {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </Select>
                                </FormField>
                                <div className="grid grid-cols-2 gap-1">
                                    <FormField label="Operator">
                                        <Select value={condition.operator} onChange={e => handleUpdateCondition(index, { operator: e.target.value as VNConditionOperator })}>
                                            {operators.map(op => <option key={op} value={op}>{op}</option>)}
                                        </Select>
                                    </FormField>
                                    {!valueIsHidden && (
                                        <FormField label="Value">
                                            {variable?.type === 'boolean' ? (
                                                <Select value={String(condition.value)} onChange={e => handleUpdateCondition(index, { value: e.target.value === 'true' })}>
                                                    <option value="true">True</option>
                                                    <option value="false">False</option>
                                                </Select>
                                            ) : (
                                                <TextInput value={String(condition.value || '')} onChange={e => handleUpdateCondition(index, { value: e.target.value })} />
                                            )}
                                        </FormField>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => handleRemoveCondition(index)} className="text-red-400 hover:text-red-300 mt-1 p-1"><XMarkIcon className="w-4 h-4" /></button>
                        </div>
                    </div>
                );
            })}
             <button onClick={handleAddCondition} className="text-sky-400 hover:text-sky-300 text-xs mt-2 flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Add Condition</button>
        </div>
    );
}

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
                const dialogue = command as DialogueCommand;
                if (!dialogue.characterId) {
                    const characterIds = Object.keys(project.characters);
                    if (characterIds.length === 1) {
                        updateCommand({ characterId: characterIds[0] });
                        return;
                    }
                }
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

const TransitionFields: React.FC<{
    transition: VNTransition;
    duration: number;
    onUpdate: (updates: { transition?: VNTransition; duration?: number }) => void;
}> = ({ transition, duration, onUpdate }) => (
    <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1">
            <FormField label="Transition">
                <Select value={transition} onChange={e => onUpdate({ transition: e.target.value as VNTransition })}>
                    <option value="fade">Fade</option>
                    <option value="dissolve">Dissolve</option>
                    <option value="slide">Slide</option>
                    <option value="iris-in">Iris</option>
                    <option value="wipe-right">Wipe</option>
                    <option value="instant">Instant</option>
                </Select>
            </FormField>
            <FormField label="Duration (s)">
                <TextInput type="number" min="0" step="0.1" value={duration} onChange={e => onUpdate({ duration: parseFloat(e.target.value) || 0 })} />
            </FormField>
        </div>
        <TransitionPreview transition={transition} duration={duration} />
    </div>
);


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
    const activeScene = project.scenes[activeSceneId];

    // Handle scene configuration
    if (isConfigScene && activeScene) {
        const updateScene = (updates: Partial<Pick<VNScene, 'conditions' | 'fallbackSceneId' | 'outTransition' | 'outTransitionDuration'>>) => {
            dispatch({ type: 'UPDATE_SCENE_CONFIG', payload: { sceneId: activeSceneId, updates } });
        };

        return (
            <Panel title={`Scene Config: ${activeScene.name}`} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
                <div className="flex flex-col h-full">
                    <div className="flex-grow overflow-y-auto pr-1">
                        {/* Exit Transition Settings */}
                        <div className="mb-4">
                            <h3 className="font-bold mb-2 text-[var(--accent-cyan)]">Exit Transition</h3>
                            <p className="text-xs text-[var(--text-secondary)] mb-3">
                                How the screen transitions out when leaving this scene.
                            </p>
                            <FormField label="Transition Style">
                                <Select
                                    value={activeScene.outTransition || 'fade'}
                                    onChange={e => updateScene({ outTransition: (e.target.value as VNScene['outTransition']) || undefined })}
                                >
                                    <option value="fade">Fade to Black</option>
                                    <option value="dissolve">Dissolve</option>
                                    <option value="iris-out">Iris Out</option>
                                    <option value="wipe-right">Wipe Right</option>
                                    <option value="slide-left">Slide Left</option>
                                    <option value="instant">Instant (No Transition)</option>
                                </Select>
                            </FormField>
                            {(activeScene.outTransition || 'fade') !== 'instant' && (
                                <FormField label="Duration (s)">
                                    <TextInput
                                        type="number"
                                        min={0.1}
                                        max={5}
                                        step={0.1}
                                        value={activeScene.outTransitionDuration ?? 0.5}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            if (!isNaN(val) && val >= 0.1 && val <= 5) {
                                                updateScene({ outTransitionDuration: val });
                                            }
                                        }}
                                    />
                                </FormField>
                            )}
                        </div>

                        <hr className="border-[var(--border-subtle)] mb-4" />

                        <div className="mb-4">
                            <h3 className="font-bold mb-2 text-[var(--accent-cyan)]">Scene Conditions</h3>
                            <p className="text-xs text-[var(--text-secondary)] mb-3">
                                This scene will only play if all conditions are met. If conditions fail, the scene will be skipped.
                            </p>
                            <ConditionsEditor 
                                conditions={activeScene.conditions} 
                                project={project} 
                                onChange={(cs) => updateScene({ conditions: cs })}
                            />
                        </div>
                        
                        {activeScene.conditions && activeScene.conditions.length > 0 && (
                            <div className="mt-4">
                                <FormField label="Fallback Scene">
                                    <p className="text-xs text-[var(--text-secondary)] mb-2">
                                        If conditions fail, jump to this scene instead:
                                    </p>
                                    <Select 
                                        value={activeScene.fallbackSceneId || ''} 
                                        onChange={e => updateScene({ fallbackSceneId: e.target.value || undefined })}
                                    >
                                        <option value="">Skip to next scene in sequence</option>
                                        {Object.values(project.scenes).filter((s: VNScene) => s.id !== activeSceneId).map((s: VNScene) => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </Select>
                                </FormField>
                            </div>
                        )}
                    </div>
                    <div className="pt-4 mt-auto">
                        <button 
                            onClick={onCloseSceneConfig} 
                            className="w-full bg-[var(--accent-cyan)] hover:opacity-80 text-black font-bold py-1 px-2 rounded-lg transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </Panel>
        );
    }

    // Handle variable editing
    if (selectedVariableId && setSelectedVariableId) {
        const variable = project.variables[selectedVariableId];
        if (!variable) {
            return (
                <Panel title="Properties" className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
                    <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs italic">
                        <p>Variable not found.</p>
                    </div>
                </Panel>
            );
        }

        const updateVariable = (updates: Partial<VNVariable>) => {
            // Handle type changes that require defaultValue conversion
            if (updates.type && updates.type !== variable.type) {
                let newDefaultValue: string | number | boolean;
                switch (updates.type) {
                    case 'string':
                        newDefaultValue = String(variable.defaultValue);
                        break;
                    case 'number':
                        newDefaultValue = Number(variable.defaultValue) || 0;
                        break;
                    case 'boolean':
                        newDefaultValue = Boolean(variable.defaultValue);
                        break;
                    default:
                        newDefaultValue = variable.defaultValue;
                }
                updates.defaultValue = newDefaultValue;
            }
            dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId: selectedVariableId, updates } });
        };

        const handleDelete = () => {
            if (confirm(`Delete variable "${variable.name}"? This will break any commands that reference it.`)) {
                dispatch({ type: 'DELETE_VARIABLE', payload: { variableId: selectedVariableId } });
                setSelectedVariableId(null);
            }
        };

        return (
            <Panel title={`Variable: ${variable.name}`} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
                <div className="flex flex-col h-full">
                    <div className="flex-grow overflow-y-auto pr-1">
                        <FormField label="Name">
                            <TextInput value={variable.name} onChange={e => updateVariable({ name: e.target.value })} />
                        </FormField>
                        <FormField label="Type">
                            <Select value={variable.type} onChange={e => updateVariable({ type: e.target.value as VNVariableType })}>
                                <option value="string">String</option>
                                <option value="number">Number</option>
                                <option value="boolean">Boolean</option>
                            </Select>
                        </FormField>
                        <FormField label="Default Value">
                            {variable.type === 'boolean' ? (
                                <Select value={String(variable.defaultValue)} onChange={e => updateVariable({ defaultValue: e.target.value === 'true' })}>
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                </Select>
                            ) : variable.type === 'number' ? (
                                <TextInput type="number" value={Number(variable.defaultValue)} onChange={e => updateVariable({ defaultValue: parseFloat(e.target.value) || 0 })} />
                            ) : (
                                <TextInput value={String(variable.defaultValue)} onChange={e => updateVariable({ defaultValue: e.target.value })} />
                            )}
                        </FormField>
                        <div className="text-xs text-[var(--text-secondary)] mt-2">
                            <p><strong>Type:</strong> {variable.type}</p>
                            <p><strong>Current Value:</strong> {String(variable.defaultValue)}</p>
                            <p className="mt-2">The default value is used when the game starts. You can change the variable's value during gameplay using Set Variable commands.</p>
                        </div>
                    </div>
                    <div className="pt-4 mt-auto">
                        <button onClick={handleDelete} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-lg flex items-center justify-center gap-1 transition-colors">
                            <TrashIcon/> Delete Variable
                        </button>
                    </div>
                </div>
            </Panel>
        );
    }

    if (selectedCommandIndex === null || !activeScene || !activeScene.commands[selectedCommandIndex]) {
        return (
            <Panel title="Properties" className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs italic">
                    <p>Select a command to edit its properties.</p>
                </div>
            </Panel>
        );
    }
    
    const command = activeScene.commands[selectedCommandIndex];
    const generateId = () => `opt-${Math.random().toString(36).substring(2, 9)}`;

    const updateCommand = React.useCallback((updatedProps: Partial<VNCommand>) => {
        if (!command) {
            return;
        }
        const newCommand = { ...command, ...updatedProps };
        dispatch({ type: 'UPDATE_COMMAND', payload: { sceneId: activeSceneId, commandIndex: selectedCommandIndex, command: newCommand as VNCommand } });
    }, [command, dispatch, activeSceneId, selectedCommandIndex]);

    useCommandDefaults(command, project, updateCommand);
    useChoiceActionNormalization(command, project, updateCommand);

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
                    { value: '', label: 'Narrator' },
                    ...Object.values(project.characters).map((c: VNCharacter) => ({ value: c.id, label: c.name }))
                ];
                return <>
                    <FormField label="Character">
                        <SearchableSelect 
                            options={characterOptions}
                            value={cmd.characterId || ''} 
                            onChange={(value) => updateCommand({ characterId: value || null })}
                            placeholder="Select character..."
                        />
                    </FormField>
                    <FormField label="Dialogue Text">
                        <TextArea value={cmd.text} onChange={e => updateCommand({ text: e.target.value })} />
                    </FormField>
                </>;
            }
            case CommandType.SetBackground: {
                const cmd = command as SetBackgroundCommand;
                const backgroundOptions: { value: string; label: string; group?: string }[] = [];
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
                return <>
                    <FormField label="Background">
                        <SearchableSelect 
                            options={backgroundOptions}
                            value={cmd.backgroundId} 
                            onChange={(value) => updateCommand({ backgroundId: value })}
                            placeholder={backgroundOptions.length === 0 ? "No backgrounds or images uploaded" : "Select background..."}
                        />
                    </FormField>
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
                    <FormField label="Character">
                        <SearchableSelect 
                            options={characterOptions}
                            value={cmd.characterId} 
                            onChange={(value) => {
                                const newChar = project.characters[value];
                                const firstExprId = newChar ? Object.keys(newChar.expressions)[0] : '';
                                updateCommand({ characterId: value, expressionId: firstExprId || '' });
                            }}
                            placeholder={Object.keys(project.characters).length === 0 ? "No characters defined" : "Select character..."}
                        />
                    </FormField>
                    <FormField label="Expression">
                        <SearchableSelect 
                            options={expressionOptions}
                            value={cmd.expressionId} 
                            onChange={(value) => updateCommand({ expressionId: value })}
                            placeholder={(!character || Object.keys(character.expressions).length === 0) ? "No expressions" : "Select expression..."}
                        />
                    </FormField>
                    
                    {isSlideTransition ? (
                        <>
                            <PositionInputs 
                                label="Start Position" 
                                position={cmd.startPosition || cmd.position} 
                                onChange={(pos) => updateCommand({ startPosition: pos })} 
                            />
                            <PositionInputs 
                                label="End Position" 
                                position={cmd.endPosition || cmd.position} 
                                onChange={(pos) => updateCommand({ endPosition: pos })} 
                            />
                        </>
                    ) : (
                        <PositionInputs 
                            label="Position" 
                            position={cmd.position} 
                            onChange={(pos) => updateCommand({ position: pos })} 
                        />
                    )}
                    
                    <TransitionFields 
                        transition={cmd.transition} 
                        duration={cmd.duration} 
                        onUpdate={(updates) => updateCommand(updates)} 
                    />
                 </>;
            }
            case CommandType.HideCharacter: {
                 const cmd = command as HideCharacterCommand;
                 const characterOptions = Object.values(project.characters).map((c: VNCharacter) => ({ value: c.id, label: c.name }));
                 return <>
                    <FormField label="Character">
                        <SearchableSelect 
                            options={characterOptions}
                            value={cmd.characterId} 
                            onChange={(value) => updateCommand({ characterId: value })}
                            placeholder={Object.keys(project.characters).length === 0 ? "No characters defined" : "Select character..."}
                        />
                    </FormField>
                    <TransitionFields 
                        transition={cmd.transition} 
                        duration={cmd.duration} 
                        onUpdate={(updates) => updateCommand(updates)} 
                    />
                    {cmd.transition === 'slide' && <PositionInputs label="Start Position" position={cmd.startPosition} onChange={pos => updateCommand({ startPosition: pos })} />}
                    {cmd.transition === 'slide' && <PositionInputs label="End Position" position={cmd.endPosition} onChange={pos => updateCommand({ endPosition: pos })} />}
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
                    <h3 className="font-bold mb-2">Options</h3>
                    {cmd.options.map((opt, i) => {
                        const migratedOpt: ChoiceOption = ('targetSceneId' in opt && !('actions' in opt)) ? {
                            id: opt.id || generateId(), text: opt.text, conditions: opt.conditions,
                            actions: [{ type: UIActionType.JumpToScene, targetSceneId: (opt as any).targetSceneId }]
                        } : { ...opt, id: opt.id || generateId(), actions: opt.actions || [] };

                        return (
                            <div key={migratedOpt.id} className="p-1 border border-[var(--border-subtle)] rounded-md mb-2">
                               <FormField label={`Option ${i+1} Text`}><TextInput value={migratedOpt.text} onChange={e => updateOption(i, { text: e.target.value })}/></FormField>
                               <h4 className="font-bold text-xs mt-3 mb-1 text-[var(--text-secondary)]">Conditions</h4>
                               <p className="text-xs text-[var(--text-muted)] mb-2">This option will only be shown if all conditions are met.</p>
                               <ConditionsEditor conditions={migratedOpt.conditions} project={project} onChange={(cs) => updateOption(i, { conditions: cs })}/>
                               
                                <h4 className="font-bold text-xs mt-3 mb-1 text-[var(--text-secondary)]">Actions</h4>
                                <div className="space-y-2 pl-2 border-l-2 border-[var(--border-default)]">
                                    {(migratedOpt.actions || []).map((action, actionIndex) => (
                                        <div key={actionIndex} className="p-1 bg-[var(--bg-primary)] rounded-md">
                                            {action.type === UIActionType.JumpToScene ? (
                                                (() => {
                                                    const actionAsJump = action as ChoiceAction & { targetSceneId: VNID };
                                                    return (
                                                <FormField label="Jump to Scene">
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
                                                        <p className="text-xs font-semibold">Set Variable</p>
                                                        <button onClick={() => removeAction(i, actionIndex)} className="text-red-400 hover:text-red-300 p-1"><XMarkIcon className="w-4 h-4" /></button>
                                                    </div>
                                                    {(() => {
                                                        const actionAsSetVar = action as SetVariableAction;
                                                        const variable = project.variables[actionAsSetVar.variableId];
                                                        return (
                                                            <div className="space-y-2">
                                                                <FormField label="Variable">
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
                                                                    <FormField label="Operator">
                                                                        <Select value={actionAsSetVar.operator} onChange={e => updateAction(i, actionIndex, { operator: e.target.value as VNSetVariableOperator })}>
                                                                            <option value="set">Set (=)</option>
                                                                            {variable?.type === 'number' && <option value="add">Add (+)</option>}
                                                                            {variable?.type === 'number' && <option value="subtract">Subtract (-)</option>}
                                                                        </Select>
                                                                    </FormField>
                                                                    <FormField label="Value">
                                                                        {variable?.type === 'boolean' ? (
                                                                            <Select value={String(actionAsSetVar.value)} onChange={e => updateAction(i, actionIndex, { value: e.target.value === 'true' })}>
                                                                                <option value="true">True</option>
                                                                                <option value="false">False</option>
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
                                       <button onClick={() => addAction(i, UIActionType.JumpToScene)} className="text-xs bg-sky-600 hover:bg-sky-700 px-2 py-1 rounded">Add Jump</button>
                                       <button onClick={() => addAction(i, UIActionType.SetVariable)} disabled={Object.keys(project.variables).length === 0} className="text-xs bg-sky-600 hover:bg-sky-700 px-2 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed">Add Set Variable</button>
                                    </div>
                                </div>
                               <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-300 text-xs mt-3">Remove Option</button>
                            </div>
                        )
                    })}
                    <button onClick={addOption} className="text-sky-400 hover:text-sky-300 mt-2 flex items-center gap-1 text-xs"><PlusIcon className="w-4 h-4"/>Add Option</button>
                </div>
            }
            case CommandType.PlayMusic: {
                const cmd = command as PlayMusicCommand;
                return <>
                    <FormField label="Audio Track"><Select value={cmd.audioId} onChange={e => updateCommand({ audioId: e.target.value })}>
                        {Object.keys(project.audio).length === 0 && <option disabled>No audio uploaded</option>}
                        {Object.values(project.audio).map((a: VNAudio) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select></FormField>
                    <FormField label={`Volume: ${Math.round((cmd.volume ?? 1) * 100)}%`}>
                        <input type="range" min="0" max="100" value={Math.round((cmd.volume ?? 1) * 100)} onChange={e => updateCommand({ volume: parseInt(e.target.value) / 100 })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                    <FormField label="Fade Duration (s)"><TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 })}/></FormField>
                    <div className="flex items-center gap-1"><input type="checkbox" checked={cmd.loop} onChange={e => updateCommand({ loop: e.target.checked })} className="h-4 w-4 rounded bg-[var(--bg-secondary)] border-[var(--border-default)] focus:ring-[var(--accent-lavender)]" /> <label>Loop</label></div>
                </>;
            }
            case CommandType.StopMusic: {
                const cmd = command as StopMusicCommand;
                return <FormField label="Fade Duration (s)"><TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 })}/></FormField>;
            }
             case CommandType.PlaySoundEffect: {
                const cmd = command as PlaySoundEffectCommand;
                return <>
                    <FormField label="Audio Track"><Select value={cmd.audioId} onChange={e => updateCommand({ audioId: e.target.value })}>
                        {Object.keys(project.audio).length === 0 && <option disabled>No audio uploaded</option>}
                        {Object.values(project.audio).map((a: VNAudio) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select></FormField>
                    <FormField label={`Volume: ${Math.round((cmd.volume ?? 1) * 100)}%`}>
                        <input type="range" min="0" max="100" value={Math.round((cmd.volume ?? 1) * 100)} onChange={e => updateCommand({ volume: parseInt(e.target.value) / 100 })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                </>;
            }
            case CommandType.PlayMovie: {
                const cmd = command as PlayMovieCommand;
                const isOverlay = cmd.displayMode === 'overlay';
                return <>
                    <FormField label="Video">
                        <Select value={cmd.videoId} onChange={e => updateCommand({ videoId: e.target.value })}>
                            {Object.keys(project.videos).length === 0 && <option disabled>No videos uploaded</option>}
                            {Object.values(project.videos).map((v: VNVideo) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                    </FormField>
                    <FormField label="Display Mode">
                        <Select value={cmd.displayMode || 'fullscreen'} onChange={e => {
                            const mode = e.target.value as 'fullscreen' | 'overlay';
                            // Overlay mode always advances immediately (non-blocking)
                            if (mode === 'overlay') {
                                updateCommand({ displayMode: mode, waitsForCompletion: false });
                            } else {
                                updateCommand({ displayMode: mode });
                            }
                        }}>
                            <option value="fullscreen">Fullscreen (black background)</option>
                            <option value="overlay">Overlay (transparent, plays over scene)</option>
                        </Select>
                    </FormField>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 mb-2">
                        {isOverlay
                            ? 'Movie plays as a transparent layer behind characters. Use for effects like falling petals, rain, etc.'
                            : 'Movie fills the screen with a black background. Use for cutscenes and cinematics.'}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                        <input id="movie-loop" type="checkbox" checked={cmd.loop ?? false} onChange={e => updateCommand({ loop: e.target.checked })} className="h-4 w-4 rounded bg-[var(--bg-secondary)] border-[var(--border-default)] focus:ring-[var(--accent-lavender)]" />
                        <label htmlFor="movie-loop" className="text-sm">Loop continuously</label>
                    </div>
                    {!isOverlay && (
                        <div className="flex items-center gap-1 mt-2">
                            <input id="waits-for-completion" type="checkbox" checked={cmd.waitsForCompletion} onChange={e => updateCommand({ waitsForCompletion: e.target.checked })} className="h-4 w-4 rounded bg-[var(--bg-secondary)] border-[var(--border-default)] focus:ring-[var(--accent-lavender)]" /> 
                            <label htmlFor="waits-for-completion" className="text-sm">Wait for completion</label>
                        </div>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <FormField label="Display Sizing">
                        <Select value={cmd.objectFit || 'cover'} onChange={e => {
                            const val = e.target.value as 'cover' | 'contain' | 'fill' | 'custom';
                            if (val === 'custom') {
                                updateCommand({ objectFit: val });
                            } else {
                                // Reset position/size to defaults when switching away from custom
                                updateCommand({ objectFit: val, x: 0, y: 0, width: 100, height: 100 });
                            }
                        }}>
                            <option value="cover">Cover (fill area, may crop)</option>
                            <option value="contain">Contain (fit inside, may letterbox)</option>
                            <option value="fill">Fill (stretch to fit)</option>
                            <option value="custom">Custom (set position & size)</option>
                        </Select>
                    </FormField>
                    {cmd.objectFit === 'custom' && (
                        <>
                            <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Position & Size</h4>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label="X Position (%)"><TextInput type="number" min="0" max="100" step="1" value={cmd.x ?? 0} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                                <FormField label="Y Position (%)"><TextInput type="number" min="0" max="100" step="1" value={cmd.y ?? 0} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 })} /></FormField>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label="Width (%)"><TextInput type="number" min="1" max="100" step="1" value={cmd.width ?? 100} onChange={e => updateCommand({ width: parseFloat(e.target.value) || 100 })} /></FormField>
                                <FormField label="Height (%)"><TextInput type="number" min="1" max="100" step="1" value={cmd.height ?? 100} onChange={e => updateCommand({ height: parseFloat(e.target.value) || 100 })} /></FormField>
                            </div>
                        </>
                    )}
                    <FormField label={`Opacity: ${Math.round((cmd.opacity ?? 1) * 100)}%`}>
                        <input type="range" min="0" max="1" step="0.01" value={cmd.opacity ?? 1} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                    {isOverlay && (
                        <p className="text-xs text-[var(--text-secondary)] mt-2">
                            Use the <strong>Stop Movie</strong> command to remove overlay movies.
                        </p>
                    )}
                </>;
            }
            case CommandType.StopMovie: {
                return <p className="text-xs text-[var(--text-secondary)]">Stops all currently playing movie overlays.</p>;
            }
            case CommandType.SetVariable: {
                const cmd = command as SetVariableCommand;
                const variable = project.variables[cmd.variableId];
                return <>
                    <FormField label="Variable"><Select value={cmd.variableId} onChange={e => {
                        const newVarId = e.target.value;
                        const newVar = project.variables[newVarId];
                        let newOperator = cmd.operator;
                        // When switching to a non-numeric variable, change operator from add/subtract/random to set
                        if (newVar?.type !== 'number' && (cmd.operator === 'add' || cmd.operator === 'subtract' || cmd.operator === 'random')) {
                            newOperator = 'set';
                        }
                        updateCommand({ variableId: newVarId, operator: newOperator });
                    }}>
                         {Object.keys(project.variables).length === 0 && <option disabled>No variables defined</option>}
                        {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </Select></FormField>
                    <FormField label="Operator"><Select value={cmd.operator} onChange={e => updateCommand({ operator: e.target.value as VNSetVariableOperator })}>
                        <option value="set">Set (=)</option>
                        {variable?.type === 'number' && <option value="add">Add (+)</option>}
                        {variable?.type === 'number' && <option value="subtract">Subtract (-)</option>}
                        {variable?.type === 'number' && <option value="random">Random (Range)</option>}
                    </Select></FormField>
                    
                    {cmd.operator === 'random' && variable?.type === 'number' ? (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label="Min Value">
                                <TextInput type="number" value={String(cmd.randomMin ?? 0)} onChange={e => updateCommand({ randomMin: parseFloat(e.target.value) || 0 })}/>
                            </FormField>
                            <FormField label="Max Value">
                                <TextInput type="number" value={String(cmd.randomMax ?? 100)} onChange={e => updateCommand({ randomMax: parseFloat(e.target.value) || 100 })}/>
                            </FormField>
                        </div>
                    ) : (
                        <FormField label="Value">
                            {variable?.type === 'boolean' ? (
                                <Select value={String(cmd.value)} onChange={e => updateCommand({ value: e.target.value === 'true' })}>
                                    <option value="true">True</option>
                                    <option value="false">False</option>
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
                    <FormField label="Variable"><Select value={cmd.variableId} onChange={e => updateCommand({ variableId: e.target.value })}>
                         {Object.keys(project.variables).length === 0 && <option disabled>No variables defined</option>}
                        {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </Select></FormField>
                    <FormField label="Prompt"><TextInput value={cmd.prompt} onChange={e => updateCommand({ prompt: e.target.value })} placeholder="Enter your name:"/></FormField>
                    <FormField label="Placeholder"><TextInput value={cmd.placeholder || ''} onChange={e => updateCommand({ placeholder: e.target.value })} placeholder="Type here..."/></FormField>
                    <FormField label="Max Length"><TextInput type="number" min="1" max="1000" value={cmd.maxLength || 50} onChange={e => updateCommand({ maxLength: parseInt(e.target.value) || 50 })}/></FormField>
                </>;
            }
             case CommandType.Jump: {
                const cmd = command as JumpCommand;
                return <>
                    <FormField label="Target Scene"><Select value={cmd.targetSceneId} onChange={e => updateCommand({ targetSceneId: e.target.value })}>
                         {Object.values(project.scenes).map((s: VNScene) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select></FormField>
                    {!project.scenes[cmd.targetSceneId] && <p className="text-red-500 text-xs">Warning: Target scene not found.</p>}
                </>;
            }
            case CommandType.Wait: {
                const cmd = command as WaitCommand;
                return <>
                    <FormField label="Duration (s)"><TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/></FormField>
                    <FormField label="Allow input to advance">
                        <label className="flex items-center gap-1">
                            <input type="checkbox" checked={!!cmd.waitForInput} onChange={e => updateCommand({ waitForInput: e.target.checked })} />
                            <span className="text-xs text-[var(--text-primary)]">User input (click / Enter / Space) will advance early</span>
                        </label>
                    </FormField>
                </>;
            }
            case CommandType.ShakeScreen: {
                const cmd = command as ShakeScreenCommand;
                const isShakePersistent = cmd.duration === 0;
                return <>
                    <FormField label={`Intensity: ${cmd.intensity}`}>
                        <input type="range" min="1" max="10" value={cmd.intensity} onChange={e => updateCommand({ intensity: parseInt(e.target.value, 10) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>
                    <FormField label="Duration">
                        <label className="flex items-center gap-2 mb-2">
                            <input type="checkbox" checked={isShakePersistent} onChange={e => updateCommand({ duration: e.target.checked ? 0 : 0.5 })} />
                            <span className="text-xs text-[var(--text-primary)]">Persistent (until cleared by Reset Screen Effects or scene change)</span>
                        </label>
                        {!isShakePersistent && (
                            <TextInput type="number" min="0.1" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0.1 })}/>
                        )}
                    </FormField>
                    {isShakePersistent && <p className="text-xs text-amber-400/80">⚠ Shake will continue until a "Reset Screen Effects" command runs or the scene changes.</p>}
                </>;
            }
            case CommandType.TintScreen: {
                const cmd = command as TintScreenCommand;
                return <>
                    <FormField label="Tint Color (Hex with Alpha: #RRGGBBAA)">
                        <TextInput type="text" value={cmd.color} onChange={e => updateCommand({ color: e.target.value })}/>
                    </FormField>
                    <FormField label="Duration (s)">
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
                </>;
            }
            case CommandType.PanZoomScreen: {
                const cmd = command as PanZoomScreenCommand;
                return <>
                    <FormField label={`Zoom: ${cmd.zoom}x`}>
                        <input type="range" min="0.1" max="5" step="0.1" value={cmd.zoom} onChange={e => updateCommand({ zoom: parseFloat(e.target.value) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>
                     <FormField label={`Pan X: ${cmd.panX}%`}>
                        <input type="range" min="-100" max="100" value={cmd.panX} onChange={e => updateCommand({ panX: parseInt(e.target.value, 10) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>
                     <FormField label={`Pan Y: ${cmd.panY}%`}>
                        <input type="range" min="-100" max="100" value={cmd.panY} onChange={e => updateCommand({ panY: parseInt(e.target.value, 10) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>
                    <FormField label="Duration (s)">
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
                </>;
            }
            case CommandType.ResetScreenEffects: {
                const cmd = command as ResetScreenEffectsCommand;
                return <>
                    <FormField label="Duration (s)">
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
                </>;
            }
            case CommandType.FlashScreen: {
                const cmd = command as FlashScreenCommand;
                return <>
                    <FormField label="Flash Color">
                        <TextInput type="text" value={cmd.color} onChange={e => updateCommand({ color: e.target.value })}/>
                    </FormField>
                    <FormField label="Duration (s)">
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
                    <FormField label="Effect">
                        <Select value={effectType} onChange={e => updateCommand({ effectType: e.target.value, color: undefined })}>
                            <option value="crtScanlines">CRT Scanlines</option>
                            <option value="chromaticGlitch">Chromatic Glitch</option>
                            <option value="sunbeams">Undulating Sunbeams</option>
                            <option value="shimmer">Undulating Shimmer</option>
                            <option value="rain">Rain</option>
                            <option value="snowAsh">Snow / Ash</option>
                        </Select>
                    </FormField>

                    <FormField label={`Intensity: ${Math.round(intensity * 100)}%`}>
                        <input type="range" min="0" max="1" step="0.01" value={intensity} onChange={e => updateCommand({ intensity: parseFloat(e.target.value) })} className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-lavender)]"/>
                    </FormField>

                    {supportsColor && (
                        <FormField label="Color">
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
                                    title="Reset to default"
                                >
                                    Reset
                                </button>
                            </div>
                        </FormField>
                    )}

                    {effectType === 'snowAsh' && (
                        <FormField label="Mode">
                            <Select value={cmd.variant || 'snow'} onChange={e => updateCommand({ variant: e.target.value })}>
                                <option value="snow">Snow</option>
                                <option value="ash">Ash</option>
                            </Select>
                        </FormField>
                    )}
                    
                    {(() => {
                        const overlayDuration = typeof cmd.duration === 'number' ? cmd.duration : 0;
                        const isPersistent = overlayDuration === 0;
                        return <FormField label="Duration">
                            <label className="flex items-center gap-2 mb-2">
                                <input type="checkbox" checked={isPersistent} onChange={e => updateCommand({ duration: e.target.checked ? 0 : 5 })} />
                                <span className="text-xs text-[var(--text-primary)]">Persistent (until cleared)</span>
                            </label>
                            {!isPersistent && (
                                <TextInput type="number" min="0.1" step="0.5" value={overlayDuration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0.1 })} />
                            )}
                            {!isPersistent && <p className="text-xs text-[var(--text-secondary)] mt-1">Effect will automatically remove itself after this many seconds.</p>}
                        </FormField>;
                    })()}
                    
                    <p className="text-xs text-[var(--text-secondary)]">Tip: set intensity to 0 to disable this effect.</p>
                </>;
            }
            case CommandType.ShowScreen: {
                const cmd = command as ShowScreenCommand;
                return <>
                    <FormField label="UI Screen">
                        <Select value={cmd.screenId} onChange={e => updateCommand({ screenId: e.target.value })}>
                             {Object.keys(project.uiScreens).length === 0 && <option disabled>No UI Screens defined</option>}
                            {Object.values(project.uiScreens).map((s: VNUIScreen) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                    </FormField>
                </>;
            }
            case CommandType.Label: {
                const cmd = command as LabelCommand;
                return <>
                    <FormField label="Label ID">
                        <TextInput value={cmd.labelId} onChange={e => updateCommand({ labelId: e.target.value })} />
                    </FormField>
                </>;
            }
            case CommandType.JumpToLabel: {
                const cmd = command as JumpToLabelCommand;
                return <>
                    <FormField label="Label ID">
                        <TextInput value={cmd.labelId} onChange={e => updateCommand({ labelId: e.target.value })} />
                    </FormField>
                </>;
            }
            case CommandType.ShowText: {
                const cmd = command as ShowTextCommand;
                return <>
                    <FormField label="Text">
                        <TextArea value={cmd.text} onChange={e => updateCommand({ text: e.target.value })} />
                    </FormField>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="X Position (%)"><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label="Y Position (%)"><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 })} /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Max Width (px, optional)"><TextInput type="number" value={cmd.width || ''} onChange={e => updateCommand({ width: e.target.value ? parseInt(e.target.value, 10) : undefined })} /></FormField>
                        <FormField label="Max Height (px, optional)"><TextInput type="number" value={cmd.height || ''} onChange={e => updateCommand({ height: e.target.value ? parseInt(e.target.value, 10) : undefined })} /></FormField>
                    </div>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Styling</h4>
                    <FormField label="Font Family"><TextInput value={cmd.fontFamily} onChange={e => updateCommand({ fontFamily: e.target.value })} placeholder="e.g., Arial, sans-serif" /></FormField>
                    <div className="grid grid-cols-2 gap-1">
                         <FormField label="Font Size (px)"><TextInput type="number" value={cmd.fontSize} onChange={e => updateCommand({ fontSize: parseInt(e.target.value, 10) || 16 })} /></FormField>
                        <FormField label="Color"><ColorInput value={cmd.color} onChange={val => updateCommand({ color: val })} className="p-1 h-10" /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Weight">
                            <Select value={cmd.fontWeight || 'normal'} onChange={e => updateCommand({ fontWeight: e.target.value as any })}>
                                <option value="normal">Normal</option>
                                <option value="bold">Bold</option>
                            </Select>
                        </FormField>
                        <FormField label="Style">
                            <Select value={cmd.fontStyle || 'normal'} onChange={e => updateCommand({ fontStyle: e.target.value as any })}>
                                <option value="normal">Normal</option>
                                <option value="italic">Italic</option>
                            </Select>
                        </FormField>
                    </div>
                    <FormField label="Letter Spacing (px)">
                        <TextInput type="number" value={cmd.letterSpacing ?? 0} onChange={e => updateCommand({ letterSpacing: parseFloat(e.target.value) || 0 })} />
                    </FormField>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Text Align">
                            <Select value={cmd.textAlign || 'left'} onChange={e => updateCommand({ textAlign: e.target.value as any })}>
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                            </Select>
                        </FormField>
                        <FormField label="Vertical Align">
                            <Select value={cmd.verticalAlign || 'top'} onChange={e => updateCommand({ verticalAlign: e.target.value as any })}>
                                <option value="top">Top</option>
                                <option value="middle">Middle</option>
                                <option value="bottom">Bottom</option>
                            </Select>
                        </FormField>
                    </div>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Text Shadow</h4>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer mb-2">
                        <input type="checkbox" checked={cmd.textShadow?.enabled ?? false} onChange={e => updateCommand({ textShadow: { ...( cmd.textShadow || { offsetX: 2, offsetY: 2, blur: 4, color: '#000000' }), enabled: e.target.checked } })} />
                        Enable Shadow
                    </label>
                    {cmd.textShadow?.enabled && (
                        <>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label="X Offset"><TextInput type="number" value={cmd.textShadow.offsetX} onChange={e => updateCommand({ textShadow: { ...cmd.textShadow!, offsetX: parseFloat(e.target.value) || 0 } })} /></FormField>
                                <FormField label="Y Offset"><TextInput type="number" value={cmd.textShadow.offsetY} onChange={e => updateCommand({ textShadow: { ...cmd.textShadow!, offsetY: parseFloat(e.target.value) || 0 } })} /></FormField>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label="Blur"><TextInput type="number" value={cmd.textShadow.blur} onChange={e => updateCommand({ textShadow: { ...cmd.textShadow!, blur: parseFloat(e.target.value) || 0 } })} /></FormField>
                                <FormField label="Shadow Color"><ColorInput value={cmd.textShadow.color} onChange={val => updateCommand({ textShadow: { ...cmd.textShadow!, color: val } })} className="p-1 h-10" /></FormField>
                            </div>
                        </>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Text Gradient</h4>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer mb-2">
                        <input type="checkbox" checked={cmd.textGradient?.enabled ?? false} onChange={e => updateCommand({ textGradient: { ...(cmd.textGradient || { type: 'linear', angle: 90, colors: ['#ff00a5', '#8a2be2'] }), enabled: e.target.checked } })} />
                        Enable Gradient
                    </label>
                    {cmd.textGradient?.enabled && (
                        <>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label="Type">
                                    <Select value={cmd.textGradient.type} onChange={e => updateCommand({ textGradient: { ...cmd.textGradient!, type: e.target.value as any } })}>
                                        <option value="linear">Linear</option>
                                        <option value="radial">Radial</option>
                                    </Select>
                                </FormField>
                                {cmd.textGradient.type === 'linear' && (
                                    <FormField label="Angle (°)"><TextInput type="number" value={cmd.textGradient.angle} onChange={e => updateCommand({ textGradient: { ...cmd.textGradient!, angle: parseInt(e.target.value, 10) || 0 } })} /></FormField>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                                <FormField label="Color 1"><ColorInput value={cmd.textGradient.colors[0] || '#ff00a5'} onChange={val => { const c = [...(cmd.textGradient!.colors)]; c[0] = val; updateCommand({ textGradient: { ...cmd.textGradient!, colors: c } }); }} className="p-1 h-10" /></FormField>
                                <FormField label="Color 2"><ColorInput value={cmd.textGradient.colors[1] || '#8a2be2'} onChange={val => { const c = [...(cmd.textGradient!.colors)]; c[1] = val; updateCommand({ textGradient: { ...cmd.textGradient!, colors: c } }); }} className="p-1 h-10" /></FormField>
                            </div>
                        </>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Text Border</h4>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer mb-2">
                        <input type="checkbox" checked={cmd.textBorder?.enabled ?? false} onChange={e => updateCommand({ textBorder: { ...(cmd.textBorder || { width: 1, color: '#000000' }), enabled: e.target.checked } })} />
                        Enable Border
                    </label>
                    {cmd.textBorder?.enabled && (
                        <div className="grid grid-cols-2 gap-1">
                            <FormField label="Width (px)"><TextInput type="number" value={cmd.textBorder.width} onChange={e => updateCommand({ textBorder: { ...cmd.textBorder!, width: parseFloat(e.target.value) || 0 } })} /></FormField>
                            <FormField label="Border Color"><ColorInput value={cmd.textBorder.color} onChange={val => updateCommand({ textBorder: { ...cmd.textBorder!, color: val } })} className="p-1 h-10" /></FormField>
                        </div>
                    )}
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Animation</h4>
                    <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                </>;
            }
            case CommandType.ShowImage: {
                const cmd = command as ShowImageCommand;
                return <>
                    <AssetSelector label="Image" assetType="images" value={cmd.imageId} onChange={id => updateCommand({ imageId: id || ''})} allowVideo />
                     <div className="grid grid-cols-2 gap-1">
                        <FormField label="X Position (%)"><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label="Y Position (%)"><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 })} /></FormField>
                    </div>
                     <div className="grid grid-cols-2 gap-1">
                        <FormField label="Width (px)"><TextInput type="number" value={cmd.width} onChange={e => updateCommand({ width: parseInt(e.target.value, 10) || 0 })} /></FormField>
                        <FormField label="Height (px)"><TextInput type="number" value={cmd.height} onChange={e => updateCommand({ height: parseInt(e.target.value, 10) || 0 })} /></FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Scale X"><TextInput type="number" step="0.1" value={cmd.scaleX ?? 1} onChange={e => updateCommand({ scaleX: parseFloat(e.target.value) || 1 })} /></FormField>
                        <FormField label="Scale Y"><TextInput type="number" step="0.1" value={cmd.scaleY ?? 1} onChange={e => updateCommand({ scaleY: parseFloat(e.target.value) || 1 })} /></FormField>
                    </div>
                    <FormField label="Rotation (°)">
                        <TextInput type="number" value={cmd.rotation} onChange={e => updateCommand({ rotation: parseInt(e.target.value, 10) || 0 })} />
                    </FormField>
                    <FormField label={`Opacity: ${cmd.opacity}`}>
                        <input type="range" min="0" max="1" step="0.01" value={cmd.opacity} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) })} />
                    </FormField>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Animation</h4>
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
                        <FormField label="Target Text to Hide">
                            <Select value={cmd.targetCommandId} onChange={e => updateCommand({ targetCommandId: e.target.value })}>
                                <option value="">Select Text...</option>
                                {availableTextCommands.map(c => (
                                    <option key={c.id} value={c.id}>
                                        "{c.text.substring(0, 40)}..." (ID: {c.id})
                                    </option>
                                ))}
                            </Select>
                        </FormField>
                        <hr className="border-[var(--border-subtle)] my-2" />
                        <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Animation</h4>
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
                        <FormField label="Target Image to Hide">
                            <Select value={cmd.targetCommandId} onChange={e => updateCommand({ targetCommandId: e.target.value })}>
                                <option value="">Select Image...</option>
                                {availableImageCommands.map(c => {
                                    const image = (project.images || {})[c.imageId] as VNImage | undefined;
                                    const bgForImage = project.backgrounds[c.imageId];
                                    const imageName = image?.name || bgForImage?.name || 'Unknown Image';
                                    return <option key={c.id} value={c.id}>{imageName} (ID: {c.id})</option>;
                                })}
                            </Select>
                        </FormField>
                        <hr className="border-[var(--border-subtle)] my-2" />
                        <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Animation</h4>
                        <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                    </>
                );
            }
            case CommandType.ShowButton: {
                const cmd = command as ShowButtonCommand;
                return <>
                    <FormField label="Button Text"><TextInput value={cmd.text} onChange={e => updateCommand({ text: e.target.value })} /></FormField>
                    
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="X Position (%)"><TextInput type="number" value={cmd.x} onChange={e => updateCommand({ x: parseFloat(e.target.value) || 0 })} /></FormField>
                        <FormField label="Y Position (%)"><TextInput type="number" value={cmd.y} onChange={e => updateCommand({ y: parseFloat(e.target.value) || 0 })} /></FormField>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Width (%)"><TextInput type="number" value={cmd.width} onChange={e => updateCommand({ width: parseFloat(e.target.value) || 20 })} /></FormField>
                        <FormField label="Height (%)"><TextInput type="number" value={cmd.height} onChange={e => updateCommand({ height: parseFloat(e.target.value) || 8 })} /></FormField>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Anchor X"><TextInput type="number" step="0.1" value={cmd.anchorX} onChange={e => updateCommand({ anchorX: parseFloat(e.target.value) || 0.5 })} /></FormField>
                        <FormField label="Anchor Y"><TextInput type="number" step="0.1" value={cmd.anchorY} onChange={e => updateCommand({ anchorY: parseFloat(e.target.value) || 0.5 })} /></FormField>
                    </div>
                    
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Styling</h4>
                    
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Background"><ColorInput value={cmd.backgroundColor || '#6366f1'} onChange={val => updateCommand({ backgroundColor: val })} /></FormField>
                        <FormField label="Text Color"><ColorInput value={cmd.textColor || '#ffffff'} onChange={val => updateCommand({ textColor: val })} /></FormField>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Font Size (px)"><TextInput type="number" value={cmd.fontSize} onChange={e => updateCommand({ fontSize: parseInt(e.target.value, 10) || 18 })} /></FormField>
                        <FormField label="Font Weight">
                            <Select value={cmd.fontWeight} onChange={e => updateCommand({ fontWeight: e.target.value as 'normal' | 'bold' })}>
                                <option value="normal">Normal</option>
                                <option value="bold">Bold</option>
                            </Select>
                        </FormField>
                    </div>
                    
                    <FormField label="Border Radius (px)"><TextInput type="number" value={cmd.borderRadius} onChange={e => updateCommand({ borderRadius: parseInt(e.target.value, 10) || 0 })} /></FormField>
                    
                    <FormField label={`Opacity: ${Math.round((cmd.opacity ?? 1) * 100)}%`}>
                        <input type="range" min="0" max="1" step="0.01" value={cmd.opacity ?? 1} onChange={e => updateCommand({ opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                    </FormField>
                    
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Images (Optional)</h4>
                    
                    <AssetSelector label="Button Image" assetType="images" value={cmd.image?.id || null} allowVideo onChange={id => {
                        if (id) {
                            updateCommand({ image: { type: 'image', id } });
                        } else {
                            updateCommand({ image: null });
                        }
                    }} />
                    
                    <AssetSelector label="Hover Image" assetType="images" value={cmd.hoverImage?.id || null} allowVideo onChange={id => {
                        if (id) {
                            updateCommand({ hoverImage: { type: 'image', id } });
                        } else {
                            updateCommand({ hoverImage: null });
                        }
                    }} />
                    
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">On Click Action</h4>
                    
                    <FormField label="Wait for Click">
                        <div className="flex items-center gap-1">
                            <input 
                                type="checkbox" 
                                checked={cmd.waitForClick || false} 
                                onChange={e => updateCommand({ waitForClick: e.target.checked })} 
                                className="w-4 h-4"
                            />
                            <span className="text-xs text-[var(--text-secondary)]">Pause scene execution until this button is clicked</span>
                        </div>
                    </FormField>
                    
                    <h4 className="font-bold text-xs mb-2 mt-2 text-[var(--text-secondary)]">Primary Action</h4>
                    <ActionEditor action={cmd.onClick} onActionChange={action => updateCommand({ onClick: action })} />
                    
                    <h4 className="font-bold text-xs mb-2 mt-2 text-[var(--text-secondary)]">Additional Actions</h4>
                    <div className="space-y-2">
                        {(cmd.actions || []).map((action, idx) => (
                            <div key={idx} className="p-2 bg-[var(--bg-primary)] rounded space-y-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs text-[var(--text-secondary)]">Action {idx + 1}</span>
                                    <button 
                                        onClick={() => {
                                            const newActions = (cmd.actions || []).filter((_, i) => i !== idx);
                                            updateCommand({ actions: newActions });
                                        }}
                                        className="p-1 hover:bg-red-600 rounded transition-colors"
                                        title="Remove Action"
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
                            + Add Action
                        </button>
                    </div>
                    
                    <AssetSelector label="Click Sound" assetType="audio" value={cmd.clickSound} onChange={id => updateCommand({ clickSound: id })} />
                    
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Animation</h4>
                    <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                    
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Show Conditions</h4>
                    <p className="text-xs text-[var(--text-secondary)] mb-2">Button will only show if these conditions are met.</p>
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
                        <FormField label="Target Button to Hide">
                            <Select value={cmd.targetCommandId} onChange={e => updateCommand({ targetCommandId: e.target.value })}>
                                <option value="">Select Button...</option>
                                {availableButtonCommands.map(c => (
                                    <option key={c.id} value={c.id}>
                                        "{c.text}" (ID: {c.id})
                                    </option>
                                ))}
                            </Select>
                        </FormField>
                        <hr className="border-[var(--border-subtle)] my-2" />
                        <h4 className="font-bold text-xs mb-2 text-[var(--text-secondary)]">Animation</h4>
                        <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                    </>
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
                    <FormField label="Credit Entries">
                        <div className="space-y-2 mb-2">
                            {entries.map((entry, i) => (
                                <div key={i} className={`p-2 rounded-lg border ${
                                    entry.kind === 'heading'
                                        ? 'bg-amber-900/20 border-amber-500/30'
                                        : 'bg-[var(--bg-secondary)]/30 border-[var(--border-default)]/30'
                                }`}>
                                    <div className="flex items-center gap-1 mb-1">
                                        <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
                                            {entry.kind === 'heading' ? 'Heading' : 'Credit'}
                                        </span>
                                        <div className="flex-1" />
                                        <button onClick={() => moveEntry(i, -1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title="Move up"><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => moveEntry(i, 1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title="Move down"><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => removeEntry(i)} className="p-0.5 text-red-400 hover:text-red-300" title="Remove"><XMarkIcon className="w-3.5 h-3.5" /></button>
                                    </div>
                                    {entry.kind === 'heading' ? (
                                        <TextInput
                                            value={entry.label}
                                            onChange={e => updateEntry(i, 'label', e.target.value)}
                                            placeholder="Section Title (e.g. Cast, Staff)"
                                        />
                                    ) : (
                                        <div className="flex gap-1">
                                            <TextInput
                                                value={entry.label}
                                                onChange={e => updateEntry(i, 'label', e.target.value)}
                                                placeholder="Role"
                                                className="flex-1"
                                            />
                                            <TextInput
                                                value={entry.value || ''}
                                                onChange={e => updateEntry(i, 'value', e.target.value)}
                                                placeholder="Name"
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
                                + Heading
                            </button>
                            <button
                                onClick={() => addEntry('credit')}
                                className="flex-1 px-2 py-1.5 text-xs bg-[var(--bg-tertiary)]/30 hover:bg-[var(--bg-tertiary)]/40 border border-[var(--border-default)]/30 rounded text-[var(--text-primary)] transition-colors"
                            >
                                + Credit
                            </button>
                        </div>
                    </FormField>
                    <hr className="border-[var(--border-subtle)] my-2" />
                    <FormField label="Scroll Duration (s)">
                        <TextInput type="number" min="5" max="300" step="1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 15 })} />
                    </FormField>
                    <FormField label="Background Color">
                        <div className="flex items-center gap-2">
                            <ColorInput value={cmd.backgroundColor.substring(0, 7)} onChange={val => updateCommand({ backgroundColor: val + 'FF' })} className="w-10 h-10" />
                            <TextInput value={cmd.backgroundColor} onChange={e => updateCommand({ backgroundColor: e.target.value })} placeholder="#000000FF" className="flex-1" />
                        </div>
                    </FormField>
                    <FormField label="Text Color">
                        <div className="flex items-center gap-2">
                            <ColorInput value={cmd.textColor} onChange={val => updateCommand({ textColor: val })} className="w-10 h-10" />
                            <TextInput value={cmd.textColor} onChange={e => updateCommand({ textColor: e.target.value })} placeholder="#FFFFFF" className="flex-1" />
                        </div>
                    </FormField>
                    <FormField label="Allow Skip">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={cmd.allowSkip} onChange={e => updateCommand({ allowSkip: e.target.checked })} />
                            <span className="text-xs text-[var(--text-primary)]">Player can click/press to skip credits</span>
                        </label>
                    </FormField>
                    <FormField label="On Complete">
                        <Select value={cmd.onComplete} onChange={e => updateCommand({ onComplete: e.target.value })}>
                            <option value="advance">Continue to next command</option>
                            <option value="title">Return to Title Screen</option>
                        </Select>
                    </FormField>
                    <hr className="border-[var(--border-subtle)] my-3" />
                    <FormField label="Background Slideshow">
                        <p className="text-[10px] text-[var(--text-secondary)] mb-2">Add images/videos that cycle behind the scrolling credits. Leave empty for a solid color background.</p>
                        {(() => {
                            const backgrounds: CreditBackground[] = cmd.backgrounds || [];
                            const bgAssetOptions: { value: string; label: string; group?: string }[] = [];
                            Object.values(project.backgrounds).forEach((b: VNBackground) => {
                                bgAssetOptions.push({ value: b.id, label: b.name, group: 'Backgrounds' });
                            });
                            Object.values(project.images).forEach((img: VNImage) => {
                                bgAssetOptions.push({ value: img.id, label: img.name, group: 'Images' });
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
                                                <span className="text-[10px] uppercase font-bold text-indigo-300">Slide {i + 1}</span>
                                                <div className="flex-1" />
                                                <button onClick={() => moveBg(i, -1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title="Move up"><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => moveBg(i, 1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title="Move down"><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => removeBg(i)} className="p-0.5 text-red-400 hover:text-red-300" title="Remove"><XMarkIcon className="w-3.5 h-3.5" /></button>
                                            </div>
                                            <SearchableSelect
                                                options={bgAssetOptions}
                                                value={bg.assetId || ''}
                                                onChange={(value) => updateBg(i, { assetId: value || null })}
                                                placeholder={bgAssetOptions.length === 0 ? "No assets uploaded" : "Select image/video..."}
                                            />
                                            <div className="grid grid-cols-2 gap-1 mt-1.5">
                                                <FormField label="Display (s)">
                                                    <TextInput type="number" min="1" max="120" step="0.5" value={bg.displayDuration} onChange={e => updateBg(i, { displayDuration: parseFloat(e.target.value) || 5 })} />
                                                </FormField>
                                                <FormField label="Transition">
                                                    <Select value={bg.transition} onChange={e => updateBg(i, { transition: e.target.value as CreditBackground['transition'] })}>
                                                        <option value="fade">Fade</option>
                                                        <option value="dissolve">Dissolve</option>
                                                        <option value="instant">Instant</option>
                                                    </Select>
                                                </FormField>
                                            </div>
                                            {bg.transition !== 'instant' && (
                                                <FormField label="Transition Duration (s)">
                                                    <TextInput type="number" min="0.1" max="5" step="0.1" value={bg.transitionDuration} onChange={e => updateBg(i, { transitionDuration: parseFloat(e.target.value) || 0.5 })} />
                                                </FormField>
                                            )}
                                            <FormField label="Sizing">
                                                <Select value={bg.objectFit || 'cover'} onChange={e => {
                                                    const val = e.target.value as 'cover' | 'contain' | 'fill' | 'custom';
                                                    if (val === 'custom') {
                                                        updateBg(i, { objectFit: val });
                                                    } else {
                                                        updateBg(i, { objectFit: val, x: 0, y: 0, width: 100, height: 100 });
                                                    }
                                                }}>
                                                    <option value="cover">Cover</option>
                                                    <option value="contain">Contain</option>
                                                    <option value="fill">Fill</option>
                                                    <option value="custom">Custom</option>
                                                </Select>
                                            </FormField>
                                            {bg.objectFit === 'custom' && (
                                                <>
                                                    <div className="grid grid-cols-2 gap-1 mt-1.5">
                                                        <FormField label="X (%)"><TextInput type="number" min="0" max="100" step="1" value={bg.x ?? 0} onChange={e => updateBg(i, { x: parseFloat(e.target.value) || 0 })} /></FormField>
                                                        <FormField label="Y (%)"><TextInput type="number" min="0" max="100" step="1" value={bg.y ?? 0} onChange={e => updateBg(i, { y: parseFloat(e.target.value) || 0 })} /></FormField>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1">
                                                        <FormField label="Width (%)"><TextInput type="number" min="1" max="100" step="1" value={bg.width ?? 100} onChange={e => updateBg(i, { width: parseFloat(e.target.value) || 100 })} /></FormField>
                                                        <FormField label="Height (%)"><TextInput type="number" min="1" max="100" step="1" value={bg.height ?? 100} onChange={e => updateBg(i, { height: parseFloat(e.target.value) || 100 })} /></FormField>
                                                    </div>
                                                </>
                                            )}
                                            <FormField label={`Opacity: ${Math.round((bg.opacity ?? 1) * 100)}%`}>
                                                <input type="range" min="0" max="1" step="0.01" value={bg.opacity ?? 1} onChange={e => updateBg(i, { opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                                            </FormField>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={addBg}
                                    className="w-full px-2 py-1.5 text-xs bg-indigo-900/25 hover:bg-indigo-800/35 border border-indigo-500/25 rounded text-indigo-300 transition-colors"
                                >
                                    + Add Background Slide
                                </button>
                            </>;
                        })()}
                    </FormField>
                    <hr className="border-[var(--border-subtle)] my-3" />
                    <FormField label="Foreground Media">
                        <p className="text-[10px] text-[var(--text-secondary)] mb-2">Add positioned images/videos that appear during the credit roll with timed visibility.</p>
                        {(() => {
                            const mediaList: CreditMedia[] = cmd.media || [];
                            const mediaAssetOptions: { value: string; label: string; group?: string }[] = [];
                            Object.values(project.backgrounds).forEach((b: VNBackground) => {
                                mediaAssetOptions.push({ value: b.id, label: b.name, group: 'Backgrounds' });
                            });
                            Object.values(project.images).forEach((img: VNImage) => {
                                mediaAssetOptions.push({ value: img.id, label: img.name, group: 'Images' });
                            });
                            Object.values(project.videos).forEach((v: VNVideo) => {
                                mediaAssetOptions.push({ value: v.id, label: v.name, group: 'Videos' });
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
                                                <span className="text-[10px] uppercase font-bold text-emerald-300">Media {i + 1}</span>
                                                <div className="flex-1" />
                                                <button onClick={() => moveMedia(i, -1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title="Move up"><ChevronUpIcon className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => moveMedia(i, 1)} className="p-0.5 text-[var(--text-secondary)] hover:text-white" title="Move down"><ChevronDownIcon className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => removeMedia(i)} className="p-0.5 text-red-400 hover:text-red-300" title="Remove"><XMarkIcon className="w-3.5 h-3.5" /></button>
                                            </div>
                                            <SearchableSelect
                                                options={mediaAssetOptions}
                                                value={item.assetId || ''}
                                                onChange={(value) => updateMedia(i, { assetId: value || null })}
                                                placeholder={mediaAssetOptions.length === 0 ? "No assets uploaded" : "Select image/video..."}
                                            />
                                            <FormField label="Sizing">
                                                <Select value={item.objectFit || 'contain'} onChange={e => {
                                                    const val = e.target.value as 'cover' | 'contain' | 'fill' | 'custom';
                                                    if (val === 'custom') {
                                                        updateMedia(i, { objectFit: val });
                                                    } else {
                                                        updateMedia(i, { objectFit: val, x: 10, y: 10, width: 30, height: 30 });
                                                    }
                                                }}>
                                                    <option value="cover">Cover</option>
                                                    <option value="contain">Contain</option>
                                                    <option value="fill">Fill</option>
                                                    <option value="custom">Custom</option>
                                                </Select>
                                            </FormField>
                                            {item.objectFit === 'custom' && (
                                                <>
                                                    <div className="grid grid-cols-2 gap-1 mt-1.5">
                                                        <FormField label="X (%)"><TextInput type="number" min="0" max="100" step="1" value={item.x} onChange={e => updateMedia(i, { x: parseFloat(e.target.value) || 0 })} /></FormField>
                                                        <FormField label="Y (%)"><TextInput type="number" min="0" max="100" step="1" value={item.y} onChange={e => updateMedia(i, { y: parseFloat(e.target.value) || 0 })} /></FormField>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1">
                                                        <FormField label="Width (%)"><TextInput type="number" min="1" max="100" step="1" value={item.width} onChange={e => updateMedia(i, { width: parseFloat(e.target.value) || 30 })} /></FormField>
                                                        <FormField label="Height (%)"><TextInput type="number" min="1" max="100" step="1" value={item.height} onChange={e => updateMedia(i, { height: parseFloat(e.target.value) || 30 })} /></FormField>
                                                    </div>
                                                </>
                                            )}
                                            <FormField label={`Opacity: ${Math.round((item.opacity ?? 1) * 100)}%`}>
                                                <input type="range" min="0" max="1" step="0.01" value={item.opacity ?? 1} onChange={e => updateMedia(i, { opacity: parseFloat(e.target.value) })} className="w-full accent-[var(--accent-lavender)]" />
                                            </FormField>
                                            <div className="grid grid-cols-2 gap-1 mt-1.5">
                                                <FormField label="Show at (s)"><TextInput type="number" min="0" step="0.5" value={item.showAt} onChange={e => updateMedia(i, { showAt: parseFloat(e.target.value) || 0 })} /></FormField>
                                                <FormField label="Hide at (s)"><TextInput type="number" min="0" step="0.5" value={item.hideAt} onChange={e => updateMedia(i, { hideAt: parseFloat(e.target.value) || 0 })} /></FormField>
                                            </div>
                                            <p className="text-[9px] text-[var(--text-muted)] mt-0.5">Hide at 0 = show for entire credit duration</p>
                                            <div className="grid grid-cols-2 gap-1 mt-1">
                                                <FormField label="Transition">
                                                    <Select value={item.transition} onChange={e => updateMedia(i, { transition: e.target.value as 'fade' | 'instant' })}>
                                                        <option value="fade">Fade</option>
                                                        <option value="instant">Instant</option>
                                                    </Select>
                                                </FormField>
                                                {item.transition !== 'instant' && (
                                                    <FormField label="Duration (s)">
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
                                    + Add Media Item
                                </button>
                            </>;
                        })()}
                    </FormField>
                </>;
            }
            case CommandType.Group: {
                const cmd = command as GroupCommand;
                return <>
                    <FormField label="Group Name">
                        <TextInput value={cmd.name || ''} onChange={e => updateCommand({ name: e.target.value })} placeholder="Group name" />
                    </FormField>
                    <p className="text-xs text-[var(--text-secondary)] mt-2">
                        Contains {cmd.commandIds?.length || 0} command(s). Groups are visual only and have no effect during playback.
                    </p>
                </>;
            }
            case CommandType.RunScript: {
                const cmd = command as RunScriptCommand;
                const scripts = Object.values(project.scripts || {});
                const selectedScript = cmd.scriptId ? (project.scripts || {})[cmd.scriptId] : null;
                return <>
                    <FormField label="Script">
                        <Select value={cmd.scriptId} onChange={e => updateCommand({ scriptId: e.target.value })}>
                            <option value="">Select Script...</option>
                            {scripts.map((s: any) => (
                                <option key={s.id} value={s.id}>{s.name}{!s.enabled ? ' (disabled)' : ''}</option>
                            ))}
                        </Select>
                    </FormField>
                    {scripts.length === 0 && (
                        <p className="text-xs text-amber-400">No scripts created yet. Open Script Editor from Tools menu to create scripts.</p>
                    )}
                    {selectedScript && (
                        <div className="text-xs p-2 rounded mt-1" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                            <p><strong>Trigger:</strong> {selectedScript.trigger}</p>
                            {selectedScript.description && <p className="mt-0.5">{selectedScript.description}</p>}
                        </div>
                    )}
                    <FormField label="Wait for Completion">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={cmd.waitForCompletion} onChange={e => updateCommand({ waitForCompletion: e.target.checked })} />
                            <span className="text-xs text-[var(--text-primary)]">Wait for script to finish before advancing</span>
                        </label>
                    </FormField>
                </>;
            }
            default: return <p>This command has no properties.</p>;
        }
    };

    return <Panel title={`Properties: ${command.type.replace(/([A-Z])/g, ' $1').trim()}`} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
        <div className="flex flex-col h-full">
            <div className="flex-grow overflow-y-auto pr-1">
                {renderProperties()}
                <>
                    <hr className="border-[var(--border-subtle)] my-4" />
                    <h3 className="font-bold text-[var(--text-primary)]">Parallel Execution</h3>
                    <p className="text-xs text-[var(--text-secondary)] mb-2">Control how this command runs in relation to other commands.</p>
                    
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
                                Run Async (Parallel) {command.modifiers?.runAsync && <BoltIcon className="w-3.5 h-3.5 inline text-[var(--accent-lavender)]" />}
                            </span>
                        </label>
                        
                        {/* Blocking Warning */}
                        {!canRunAsync(command.type) && (
                            <div className="mt-2 p-2 bg-red-900/30 border border-red-500/50 rounded text-xs text-red-300">
                                <span className="font-bold">Cannot Run Async:</span> This command blocks execution and must wait for user input or scene changes.
                            </div>
                        )}
                        
                        {/* Unpredictable Warning */}
                        {canRunAsync(command.type) && hasUnpredictableAsyncBehavior(command.type) && command.modifiers?.runAsync && (
                            <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-500/50 rounded text-xs text-yellow-300">
                                <span className="font-bold">Warning:</span> {getAsyncWarning(command.type)}
                            </div>
                        )}
                        
                        {/* Stack Info */}
                        {isCommandStacked(command) && (
                            <div className="mt-2 p-2 bg-purple-900/30 border border-purple-500/50 rounded text-xs">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-purple-300 font-bold">Stacked Command</span>
                                    <span className="text-purple-400">Stack ID: {command.modifiers?.stackId?.substring(0, 8)}...</span>
                                </div>
                                <div className="text-purple-200 mb-2">
                                    Position in stack: {(command.modifiers?.stackOrder ?? 0) + 1}
                                </div>
                                <button
                                    onClick={() => {
                                        const unstacked = unstackCommand(command);
                                        updateCommand({ modifiers: unstacked.modifiers });
                                    }}
                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1 px-2 rounded transition-colors"
                                >
                                    Unstack Command
                                </button>
                            </div>
                        )}
                        
                        {/* Help Text */}
                        {command.modifiers?.runAsync && !isCommandStacked(command) && (
                            <p className="mt-2 text-xs text-[var(--text-secondary)]">
                                <LightBulbIcon className="w-3.5 h-3.5 inline text-yellow-400 mr-0.5" /> Tip: This command will execute and immediately advance to the next command without waiting for completion.
                            </p>
                        )}
                    </div>
                </>
                <>
                    <hr className="border-[var(--border-subtle)] my-4" />
                    <h3 className="font-bold text-[var(--text-primary)]">Conditions</h3>
                    <p className="text-xs text-[var(--text-secondary)] mb-2">This command will only run if all conditions are met.</p>
                    <ConditionsEditor
                        conditions={command.conditions}
                        project={project}
                        onChange={(cs) => updateCommand({ conditions: cs })}
                    />
                </>
            </div>
            <div className="pt-2 mt-auto">
                <button onClick={handleDelete} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-[10px] flex items-center justify-center gap-1 transition-colors">
                    <TrashIcon className="w-3 h-3" /> Delete
                </button>
            </div>
        </div>
    </Panel>;
};

export default PropertiesInspector;



