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
    LabelCommand, JumpToLabelCommand, BranchStartCommand, BranchEndCommand,
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
import { FormField, Select, TextInput, TextArea } from './ui/Form';
import { TrashIcon, XMarkIcon, PlusIcon } from './icons';
import AssetSelector from './ui/AssetSelector';
import ActionEditor from './menu-editor/ActionEditor';

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
        return <p className="text-xs text-slate-500">No variables defined to create conditions.</p>;
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
                    <div key={index} className="p-1 border border-slate-700 rounded-md">
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

const TransitionFields: React.FC<{
    transition: VNTransition;
    duration: number;
    onUpdate: (updates: { transition?: VNTransition; duration?: number }) => void;
}> = ({ transition, duration, onUpdate }) => (
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
        const updateScene = (updates: Partial<Pick<VNScene, 'conditions' | 'fallbackSceneId'>>) => {
            dispatch({ type: 'UPDATE_SCENE_CONFIG', payload: { sceneId: activeSceneId, updates } });
        };

        return (
            <Panel title={`Scene Config: ${activeScene.name}`} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0">
                <div className="flex flex-col h-full">
                    <div className="flex-grow overflow-y-auto pr-1">
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
            return <Panel title="Properties" className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0"><p>Variable not found.</p></Panel>;
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
            <Panel title={`Variable: ${variable.name}`} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0">
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
                        <div className="text-xs text-slate-400 mt-2">
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
        return <Panel title="Properties" className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0"><p>Select a command to edit its properties.</p></Panel>;
    }
    
    const command = activeScene.commands[selectedCommandIndex];
    const generateId = () => `opt-${Math.random().toString(36).substring(2, 9)}`;

    const updateCommand = (updatedProps: Partial<VNCommand>) => {
        const newCommand = { ...command, ...updatedProps };
        dispatch({ type: 'UPDATE_COMMAND', payload: { sceneId: activeSceneId, commandIndex: selectedCommandIndex, command: newCommand as VNCommand } });
    };

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
                            <input 
                                type="color" 
                                value={cmd.color} 
                                onChange={e => updateCommand({ color: e.target.value })}
                                className="w-12 h-10 rounded border border-[var(--bg-tertiary)] bg-[var(--bg-primary)] cursor-pointer"
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
                return <>
                    <FormField label="Character">
                        <Select value={cmd.characterId || ''} onChange={e => updateCommand({ characterId: e.target.value || null })}>
                            <option value="">Narrator</option>
                            {Object.values(project.characters).map((c: VNCharacter) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                    </FormField>
                    <FormField label="Dialogue Text">
                        <TextArea value={cmd.text} onChange={e => updateCommand({ text: e.target.value })} />
                    </FormField>
                </>;
            }
            case CommandType.SetBackground: {
                const cmd = command as SetBackgroundCommand;
                return <>
                    <FormField label="Background">
                        <Select value={cmd.backgroundId} onChange={e => updateCommand({ backgroundId: e.target.value })}>
                             {Object.keys(project.backgrounds).length === 0 && <option disabled>No backgrounds uploaded</option>}
                            {Object.values(project.backgrounds).map((b: VNBackground) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </Select>
                    </FormField>
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Transition">
                            <Select value={cmd.transition} onChange={e => updateCommand({ transition: e.target.value as VNTransition })}>
                                <option value="fade">Fade (to black)</option>
                                <option value="dissolve">Dissolve</option>
                                <option value="slide">Slide</option>
                                <option value="iris-in">Iris In</option>
                                <option value="wipe-right">Wipe Right</option>
                                <option value="instant">Instant</option>
                            </Select>
                        </FormField>
                        <FormField label="Duration (s)">
                            <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })} />
                        </FormField>
                    </div>
                </>;
            }
            case CommandType.ShowCharacter: {
                 const cmd = command as ShowCharacterCommand;
                 const character = project.characters[cmd.characterId];
                 const isSlideTransition = cmd.transition === 'slide';
                 
                 return <>
                    <FormField label="Character"><Select value={cmd.characterId} onChange={e => {
                        const newChar = project.characters[e.target.value];
                        const firstExprId = newChar ? Object.keys(newChar.expressions)[0] : '';
                        updateCommand({ characterId: e.target.value, expressionId: firstExprId || '' })
                    }}>
                        {Object.keys(project.characters).length === 0 && <option disabled>No characters defined</option>}
                        {Object.values(project.characters).map((c: VNCharacter) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select></FormField>
                    <FormField label="Expression"><Select value={cmd.expressionId} onChange={e => updateCommand({ expressionId: e.target.value })}>
                        {(!character || Object.keys(character.expressions).length === 0) && <option disabled>No expressions</option>}
                        {character && Object.values(character.expressions).map((expr: VNCharacterExpression) => <option key={expr.id} value={expr.id}>{expr.name}</option>)}
                    </Select></FormField>
                    
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
                    
                     <div className="grid grid-cols-2 gap-1">
                        <FormField label="Transition"><Select value={cmd.transition} onChange={e => updateCommand({ transition: e.target.value as VNTransition })}>
                            <option value="fade">Fade</option>
                            <option value="dissolve">Dissolve</option>
                            <option value="slide">Slide</option>
                            <option value="iris-in">Iris</option>
                            <option value="wipe-right">Wipe</option>
                            <option value="instant">Instant</option>
                        </Select></FormField>
                        <FormField label="Duration (s)">
                            <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })} />
                        </FormField>
                    </div>
                 </>;
            }
            case CommandType.HideCharacter: {
                 const cmd = command as HideCharacterCommand;
                 return <>
                    <FormField label="Character"><Select value={cmd.characterId} onChange={e => updateCommand({ characterId: e.target.value })}>
                        {Object.keys(project.characters).length === 0 && <option disabled>No characters defined</option>}
                        {Object.values(project.characters).map((c: VNCharacter) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select></FormField>
                     <div className="grid grid-cols-2 gap-1">
                        <FormField label="Transition"><Select value={cmd.transition} onChange={e => updateCommand({ transition: e.target.value as VNTransition })}>
                            <option value="fade">Fade</option>
                            <option value="dissolve">Dissolve</option>
                            <option value="slide">Slide</option>
                            <option value="iris-in">Iris</option>
                            <option value="wipe-right">Wipe</option>
                            <option value="instant">Instant</option>
                        </Select></FormField>
                        <FormField label="Duration (s)">
                            <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })} />
                        </FormField>
                    </div>
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
                            <div key={migratedOpt.id} className="p-1 border border-slate-700 rounded-md mb-2">
                               <FormField label={`Option ${i+1} Text`}><TextInput value={migratedOpt.text} onChange={e => updateOption(i, { text: e.target.value })}/></FormField>
                               <h4 className="font-bold text-xs mt-3 mb-1 text-slate-400">Conditions</h4>
                               <p className="text-xs text-slate-500 mb-2">This option will only be shown if all conditions are met.</p>
                               <ConditionsEditor conditions={migratedOpt.conditions} project={project} onChange={(cs) => updateOption(i, { conditions: cs })}/>
                               
                                <h4 className="font-bold text-xs mt-3 mb-1 text-slate-400">Actions</h4>
                                <div className="space-y-2 pl-2 border-l-2 border-slate-600">
                                    {(migratedOpt.actions || []).map((action, actionIndex) => (
                                        <div key={actionIndex} className="p-1 bg-slate-800 rounded-md">
                                            {action.type === UIActionType.JumpToScene ? (
                                                <FormField label="Jump to Scene">
                                                    <div className="flex items-center gap-1">
                                                        <Select value={action.targetSceneId} onChange={e => updateAction(i, actionIndex, { targetSceneId: e.target.value })}>
                                                            {Object.values(project.scenes).map((s: VNScene) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                        </Select>
                                                        <button onClick={() => removeAction(i, actionIndex)} className="text-red-400 hover:text-red-300 p-1"><XMarkIcon className="w-4 h-4" /></button>
                                                    </div>
                                                </FormField>
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
                                                                        if (newVar?.type !== 'number' && (actionAsSetVar.operator === 'add' || actionAsSetVar.operator === 'subtract')) {
                                                                            newOperator = 'set';
                                                                        }
                                                                        updateAction(i, actionIndex, { variableId: newVarId, operator: newOperator });
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
                                                                            <TextInput type="number" value={String(actionAsSetVar.value)} onChange={e => updateAction(i, actionIndex, { value: e.target.value })}/>
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
                    <FormField label="Fade Duration (seconds)"><TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 })}/></FormField>
                    <div className="flex items-center gap-1"><input type="checkbox" checked={cmd.loop} onChange={e => updateCommand({ loop: e.target.checked })} className="h-4 w-4 rounded bg-slate-700 border-slate-600 focus:ring-sky-500" /> <label>Loop</label></div>
                </>;
            }
            case CommandType.StopMusic: {
                const cmd = command as StopMusicCommand;
                return <FormField label="Fade Duration (seconds)"><TextInput type="number" min="0" step="0.1" value={cmd.fadeDuration} onChange={e => updateCommand({ fadeDuration: parseFloat(e.target.value) || 0 })}/></FormField>;
            }
             case CommandType.PlaySoundEffect: {
                const cmd = command as PlaySoundEffectCommand;
                return <FormField label="Audio Track"><Select value={cmd.audioId} onChange={e => updateCommand({ audioId: e.target.value })}>
                        {Object.keys(project.audio).length === 0 && <option disabled>No audio uploaded</option>}
                        {Object.values(project.audio).map((a: VNAudio) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select></FormField>;
            }
            case CommandType.PlayMovie: {
                const cmd = command as PlayMovieCommand;
                return <>
                    <FormField label="Video">
                        <Select value={cmd.videoId} onChange={e => updateCommand({ videoId: e.target.value })}>
                            {Object.keys(project.videos).length === 0 && <option disabled>No videos uploaded</option>}
                            {Object.values(project.videos).map((v: VNVideo) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                    </FormField>
                    <div className="flex items-center gap-1 mt-2">
                        <input id="waits-for-completion" type="checkbox" checked={cmd.waitsForCompletion} onChange={e => updateCommand({ waitsForCompletion: e.target.checked })} className="h-4 w-4 rounded bg-slate-700 border-slate-600 focus:ring-sky-500" /> 
                        <label htmlFor="waits-for-completion">Wait for completion</label>
                    </div>
                </>;
            }
            case CommandType.SetVariable: {
                const cmd = command as SetVariableCommand;
                const variable = project.variables[cmd.variableId];
            
                // Normalize value if variable type changed
                React.useEffect(() => {
                    if (variable) {
                        if (variable.type === 'boolean' && typeof cmd.value !== 'boolean') {
                            // Convert non-boolean to boolean
                            const normalizedValue = String(cmd.value) === 'true' || cmd.value === 1 || String(cmd.value) === '1';
                            updateCommand({ value: normalizedValue });
                        } else if (variable.type === 'number' && typeof cmd.value === 'boolean') {
                            // Convert boolean to number  
                            const normalizedValue = cmd.value ? 1 : 0;
                            updateCommand({ value: normalizedValue });
                        }
                    }
                }, [variable?.type, cmd.value]);
            
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
                    <FormField label="Duration (seconds)"><TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/></FormField>
                    <FormField label="Allow input to advance">
                        <label className="flex items-center gap-1">
                            <input type="checkbox" checked={!!cmd.waitForInput} onChange={e => updateCommand({ waitForInput: e.target.checked })} />
                            <span className="text-xs text-slate-300">User input (click / Enter / Space) will advance early</span>
                        </label>
                    </FormField>
                </>;
            }
            case CommandType.ShakeScreen: {
                const cmd = command as ShakeScreenCommand;
                return <>
                    <FormField label="Duration (seconds)"><TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/></FormField>
                    <FormField label={`Intensity: ${cmd.intensity}`}>
                        <input type="range" min="1" max="10" value={cmd.intensity} onChange={e => updateCommand({ intensity: parseInt(e.target.value, 10) })} className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-sky-500"/>
                    </FormField>
                </>;
            }
            case CommandType.TintScreen: {
                const cmd = command as TintScreenCommand;
                return <>
                    <FormField label="Tint Color (Hex with Alpha: #RRGGBBAA)">
                        <TextInput type="text" value={cmd.color} onChange={e => updateCommand({ color: e.target.value })}/>
                    </FormField>
                    <FormField label="Duration (seconds)">
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
                </>;
            }
            case CommandType.PanZoomScreen: {
                const cmd = command as PanZoomScreenCommand;
                return <>
                    <FormField label={`Zoom: ${cmd.zoom}x`}>
                        <input type="range" min="0.1" max="5" step="0.1" value={cmd.zoom} onChange={e => updateCommand({ zoom: parseFloat(e.target.value) })} className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-sky-500"/>
                    </FormField>
                     <FormField label={`Pan X: ${cmd.panX}%`}>
                        <input type="range" min="-100" max="100" value={cmd.panX} onChange={e => updateCommand({ panX: parseInt(e.target.value, 10) })} className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-sky-500"/>
                    </FormField>
                     <FormField label={`Pan Y: ${cmd.panY}%`}>
                        <input type="range" min="-100" max="100" value={cmd.panY} onChange={e => updateCommand({ panY: parseInt(e.target.value, 10) })} className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-sky-500"/>
                    </FormField>
                    <FormField label="Duration (seconds)">
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
                </>;
            }
            case CommandType.ResetScreenEffects: {
                const cmd = command as ResetScreenEffectsCommand;
                return <>
                    <FormField label="Duration (seconds)">
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
                    <FormField label="Duration (seconds)">
                        <TextInput type="number" min="0" step="0.1" value={cmd.duration} onChange={e => updateCommand({ duration: parseFloat(e.target.value) || 0 })}/>
                    </FormField>
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
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">Styling</h4>
                    <FormField label="Font Family"><TextInput value={cmd.fontFamily} onChange={e => updateCommand({ fontFamily: e.target.value })} placeholder="e.g., Arial, sans-serif" /></FormField>
                    <div className="grid grid-cols-2 gap-1">
                         <FormField label="Font Size (px)"><TextInput type="number" value={cmd.fontSize} onChange={e => updateCommand({ fontSize: parseInt(e.target.value, 10) || 16 })} /></FormField>
                        <FormField label="Color"><TextInput type="color" value={cmd.color} onChange={e => updateCommand({ color: e.target.value })} className="p-1 h-10" /></FormField>
                    </div>
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
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">Animation</h4>
                    <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                </>;
            }
            case CommandType.ShowImage: {
                const cmd = command as ShowImageCommand;
                return <>
                    <AssetSelector label="Image" assetType="images" value={cmd.imageId} onChange={id => updateCommand({ imageId: id || ''})} />
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
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">Animation</h4>
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
                        <hr className="border-slate-700 my-2" />
                        <h4 className="font-bold text-xs mb-2 text-slate-400">Animation</h4>
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
                        <hr className="border-slate-700 my-2" />
                        <h4 className="font-bold text-xs mb-2 text-slate-400">Animation</h4>
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
                        <FormField label="Anchor X (0-1)"><TextInput type="number" step="0.1" value={cmd.anchorX} onChange={e => updateCommand({ anchorX: parseFloat(e.target.value) || 0.5 })} /></FormField>
                        <FormField label="Anchor Y (0-1)"><TextInput type="number" step="0.1" value={cmd.anchorY} onChange={e => updateCommand({ anchorY: parseFloat(e.target.value) || 0.5 })} /></FormField>
                    </div>
                    
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">Styling</h4>
                    
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Background"><TextInput type="color" value={cmd.backgroundColor} onChange={e => updateCommand({ backgroundColor: e.target.value })} /></FormField>
                        <FormField label="Text Color"><TextInput type="color" value={cmd.textColor} onChange={e => updateCommand({ textColor: e.target.value })} /></FormField>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1">
                        <FormField label="Font Size"><TextInput type="number" value={cmd.fontSize} onChange={e => updateCommand({ fontSize: parseInt(e.target.value, 10) || 18 })} /></FormField>
                        <FormField label="Font Weight">
                            <Select value={cmd.fontWeight} onChange={e => updateCommand({ fontWeight: e.target.value as 'normal' | 'bold' })}>
                                <option value="normal">Normal</option>
                                <option value="bold">Bold</option>
                            </Select>
                        </FormField>
                    </div>
                    
                    <FormField label="Border Radius (px)"><TextInput type="number" value={cmd.borderRadius} onChange={e => updateCommand({ borderRadius: parseInt(e.target.value, 10) || 0 })} /></FormField>
                    
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">Images (Optional)</h4>
                    
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
                    
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">On Click Action</h4>
                    
                    <FormField label="Wait for Click">
                        <div className="flex items-center gap-1">
                            <input 
                                type="checkbox" 
                                checked={cmd.waitForClick || false} 
                                onChange={e => updateCommand({ waitForClick: e.target.checked })} 
                                className="w-4 h-4"
                            />
                            <span className="text-xs text-slate-400">Pause scene execution until this button is clicked</span>
                        </div>
                    </FormField>
                    
                    <ActionEditor action={cmd.onClick} onActionChange={action => updateCommand({ onClick: action })} />
                    
                    <AssetSelector label="Click Sound" assetType="audio" value={cmd.clickSound} onChange={id => updateCommand({ clickSound: id })} />
                    
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">Animation</h4>
                    <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                    
                    <hr className="border-slate-700 my-2" />
                    <h4 className="font-bold text-xs mb-2 text-slate-400">Show Conditions</h4>
                    <p className="text-xs text-slate-400 mb-2">Button will only show if these conditions are met.</p>
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
                        <hr className="border-slate-700 my-2" />
                        <h4 className="font-bold text-xs mb-2 text-slate-400">Animation</h4>
                        <TransitionFields transition={cmd.transition} duration={cmd.duration} onUpdate={updateCommand} />
                    </>
                );
            }
            default: return <p>This command has no properties.</p>;
        }
    };

    return <Panel title={`Properties: ${command.type.replace(/([A-Z])/g, ' $1').trim()}`} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0">
        <div className="flex flex-col h-full">
            <div className="flex-grow overflow-y-auto pr-1">
                {renderProperties()}
                <>
                    <hr className="border-slate-700 my-4" />
                    <h3 className="font-bold text-slate-300">Parallel Execution</h3>
                    <p className="text-xs text-slate-400 mb-2">Control how this command runs in relation to other commands.</p>
                    
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
                                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                            />
                            <span className={`text-xs ${!canRunAsync(command.type) ? 'text-slate-500' : 'text-slate-300'}`}>
                                Run Async (Parallel) {command.modifiers?.runAsync && '✨'}
                            </span>
                        </label>
                        
                        {/* Blocking Warning */}
                        {!canRunAsync(command.type) && (
                            <div className="mt-2 p-2 bg-red-900/30 border border-red-500/50 rounded text-xs text-red-300">
                                <span className="font-bold">❌ Cannot Run Async:</span> This command blocks execution and must wait for user input or scene changes.
                            </div>
                        )}
                        
                        {/* Unpredictable Warning */}
                        {canRunAsync(command.type) && hasUnpredictableAsyncBehavior(command.type) && command.modifiers?.runAsync && (
                            <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-500/50 rounded text-xs text-yellow-300">
                                <span className="font-bold">⚠ Warning:</span> {getAsyncWarning(command.type)}
                            </div>
                        )}
                        
                        {/* Stack Info */}
                        {isCommandStacked(command) && (
                            <div className="mt-2 p-2 bg-purple-900/30 border border-purple-500/50 rounded text-xs">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-purple-300 font-bold">🔗 Stacked Command</span>
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
                            <p className="mt-2 text-xs text-slate-400">
                                💡 Tip: This command will execute and immediately advance to the next command without waiting for completion.
                            </p>
                        )}
                    </div>
                </>
                <>
                    <hr className="border-slate-700 my-4" />
                    <h3 className="font-bold text-slate-300">Conditions</h3>
                    <p className="text-xs text-slate-400 mb-2">This command will only run if all conditions are met.</p>
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



