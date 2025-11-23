import React from 'react';
import { VNID } from '../../types';
import { VNUIScreen } from '../../features/ui/types';
import { VNUIAction, UIActionType, GoToScreenAction, JumpToSceneAction, JumpToLabelAction, SetVariableAction, CycleLayerAssetAction } from '../../types/shared';
import { VNSetVariableOperator } from '../../features/variables/types';
import { VNScene, CommandType, LabelCommand } from '../../features/scene/types';
import { VNVariable } from '../../features/variables/types';
import { VNCharacter } from '../../features/character/types';
import { useProject } from '../../contexts/ProjectContext';
import { FormField, Select, TextInput } from '../ui/Form';

const ActionEditor: React.FC<{
    action: VNUIAction;
    onActionChange: (newAction: VNUIAction) => void;
}> = ({ action, onActionChange }) => {
    const { project } = useProject();

    const allLabels = React.useMemo(() => {
        const labels: Array<{ labelId: string; sceneName: string; sceneId: string }> = [];
        Object.values(project.scenes).forEach((scene: VNScene) => {
            scene.commands.forEach(cmd => {
                if (cmd.type === CommandType.Label) {
                    labels.push({
                        labelId: (cmd as LabelCommand).labelId,
                        sceneName: scene.name,
                        sceneId: scene.id
                    });
                }
            });
        });
        return labels;
    }, [project.scenes]);

    const numericVariables = React.useMemo(() => (
        Object.values(project.variables).filter((v: VNVariable) => v.type === 'number')
    ), [project.variables]);

    // Handle null/undefined action
    if (!action) {
        const defaultAction: VNUIAction = { type: UIActionType.None };
        return (
            <div>
                <FormField label="Action Type">
                    <Select value={UIActionType.None} onChange={e => onActionChange({ type: e.target.value as UIActionType })}>
                        <option value={UIActionType.None}>None</option>
                        <option value={UIActionType.StartNewGame}>Start New Game</option>
                        <option value={UIActionType.GoToScreen}>Go To Screen</option>
                        <option value={UIActionType.LoadGame}>Load Game</option>
                        <option value={UIActionType.SaveGame}>Save Game</option>
                        <option value={UIActionType.ReturnToGame}>Return To Game</option>
                        <option value={UIActionType.ReturnToPreviousScreen}>Return To Previous Screen</option>
                        <option value={UIActionType.QuitToTitle}>Quit To Title</option>
                        <option value={UIActionType.ExitGame}>Exit Game</option>
                        <option value={UIActionType.JumpToScene}>Jump To Scene</option>
                        <option value={UIActionType.JumpToLabel}>Jump To Label</option>
                        <option value={UIActionType.SetVariable}>Set Variable</option>
                        <option value={UIActionType.CycleLayerAsset}>Cycle Layer Asset</option>
                        <option value={UIActionType.ToggleScreen}>Toggle Screen</option>
                    </Select>
                </FormField>
            </div>
        );
    }

    const handleTypeChange = (type: UIActionType) => {
        let newAction: VNUIAction = { type };
        switch(type) {
            case UIActionType.GoToScreen:
                newAction = { ...newAction, targetScreenId: Object.keys(project.uiScreens)[0] || '' } as GoToScreenAction;
                break;
            case UIActionType.JumpToScene:
                newAction = { ...newAction, targetSceneId: project.startSceneId } as JumpToSceneAction;
                break;
            case UIActionType.JumpToLabel: {
                // Find the first available label across all scenes
                let firstLabel = '';
                for (const scene of Object.values(project.scenes) as VNScene[]) {
                    const labelCmd = scene.commands.find(cmd => cmd.type === CommandType.Label);
                    if (labelCmd) {
                        firstLabel = (labelCmd as LabelCommand).labelId;
                        break;
                    }
                }
                newAction = { ...newAction, targetLabel: firstLabel } as JumpToLabelAction;
                break;
            }
            case UIActionType.SetVariable:
                newAction = { ...newAction, variableId: Object.keys(project.variables)[0] || '', operator: 'set', value: '' } as SetVariableAction;
                break;
            case UIActionType.CycleLayerAsset:
                const firstCharId = Object.keys(project.characters)[0] || '';
                const firstChar = project.characters[firstCharId];
                const firstLayerId = firstChar ? Object.keys(firstChar.layers)[0] || '' : '';
                const firstVarId = Object.keys(project.variables)[0] || '';
                newAction = { ...newAction, characterId: firstCharId, layerId: firstLayerId, variableId: firstVarId, direction: 'next' } as CycleLayerAssetAction;
                break;
        }
        onActionChange(newAction);
    };

    React.useEffect(() => {
        if (!action) {
            return;
        }

        switch (action.type) {
            case UIActionType.GoToScreen: {
                const goToScreen = action as GoToScreenAction;
                if (!goToScreen.targetScreenId) {
                    const screenIds = Object.keys(project.uiScreens);
                    if (screenIds.length === 1) {
                        onActionChange({ ...goToScreen, targetScreenId: screenIds[0] });
                    }
                }
                break;
            }
            case UIActionType.JumpToScene: {
                const jumpToScene = action as JumpToSceneAction;
                if (!jumpToScene.targetSceneId) {
                    const sceneIds = Object.keys(project.scenes);
                    if (sceneIds.length === 1) {
                        onActionChange({ ...jumpToScene, targetSceneId: sceneIds[0] });
                    }
                }
                break;
            }
            case UIActionType.JumpToLabel: {
                const jumpToLabel = action as JumpToLabelAction;
                if (!jumpToLabel.targetLabel && allLabels.length === 1) {
                    onActionChange({ ...jumpToLabel, targetLabel: allLabels[0].labelId });
                }
                break;
            }
            case UIActionType.SetVariable: {
                const setVariable = action as SetVariableAction;
                const variableIds = Object.keys(project.variables);
                if (!setVariable.variableId && variableIds.length === 1) {
                    const firstVar = project.variables[variableIds[0]];
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
                    onActionChange({ ...setVariable, variableId: variableIds[0], value: defaultValue });
                    break;
                }

                const variable = project.variables[setVariable.variableId];
                if (variable) {
                    if (variable.type === 'boolean' && typeof setVariable.value !== 'boolean') {
                        const normalized = String(setVariable.value).trim().toLowerCase();
                        const boolValue = ['true', '1', 'yes', 'on'].includes(normalized);
                        onActionChange({ ...setVariable, value: boolValue });
                    } else if (variable.type === 'number' && typeof setVariable.value === 'string') {
                        const parsedValue = parseFloat(setVariable.value);
                        onActionChange({ ...setVariable, value: Number.isNaN(parsedValue) ? 0 : parsedValue });
                    }
                }
                break;
            }
            case UIActionType.CycleLayerAsset: {
                const cycleAction = action as CycleLayerAssetAction;
                const characterIds = Object.keys(project.characters);

                if (!cycleAction.characterId && characterIds.length === 1) {
                    const firstCharId = characterIds[0];
                    const firstChar = project.characters[firstCharId];
                    const firstLayerId = firstChar ? Object.keys(firstChar.layers)[0] || '' : '';
                    onActionChange({ ...cycleAction, characterId: firstCharId, layerId: firstLayerId });
                    break;
                }

                if (cycleAction.characterId) {
                    const character = project.characters[cycleAction.characterId];
                    if (character && !cycleAction.layerId) {
                        const layerIds = Object.keys(character.layers);
                        if (layerIds.length === 1) {
                            onActionChange({ ...cycleAction, layerId: layerIds[0] });
                            break;
                        }
                    }
                }

                if (!cycleAction.variableId && numericVariables.length === 1) {
                    onActionChange({ ...cycleAction, variableId: numericVariables[0].id });
                }
                break;
            }
            default:
                break;
        }
    }, [action, allLabels, numericVariables, onActionChange, project.characters, project.scenes, project.uiScreens, project.variables]);

    const renderActionFields = () => {
        switch (action.type) {
            case UIActionType.GoToScreen: {
                const goToScreen = action as GoToScreenAction;
                return (
                    <FormField label="Target Screen">
                        <Select value={goToScreen.targetScreenId} onChange={e => onActionChange({ ...goToScreen, targetScreenId: e.target.value })}>
                            {Object.values(project.uiScreens).map((s: VNUIScreen) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </Select>
                    </FormField>
                );
            }
            case UIActionType.JumpToScene: {
                const jumpToScene = action as JumpToSceneAction;
                return (
                    <FormField label="Target Scene">
                        <Select value={jumpToScene.targetSceneId} onChange={e => onActionChange({ ...jumpToScene, targetSceneId: e.target.value })}>
                            {Object.values(project.scenes).map((s: VNScene) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </Select>
                    </FormField>
                );
            }
            case UIActionType.JumpToLabel: {
                const jumpToLabel = action as JumpToLabelAction;
                return (
                    <FormField label="Target Label">
                        <Select value={jumpToLabel.targetLabel} onChange={e => onActionChange({ ...jumpToLabel, targetLabel: e.target.value })}>
                            {allLabels.length === 0 && <option value="">No labels found</option>}
                            {allLabels.map((labelInfo, idx) => (
                                <option key={idx} value={labelInfo.labelId}>
                                    {labelInfo.labelId} (in {labelInfo.sceneName})
                                </option>
                            ))}
                        </Select>
                    </FormField>
                );
            }
            case UIActionType.SetVariable: {
                const setVariable = action as SetVariableAction;
                const variable = project.variables[setVariable.variableId];
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label="Variable"><Select value={setVariable.variableId} onChange={e => {
                            const newVarId = e.target.value;
                            const newVar = project.variables[newVarId];
                            let newOperator = setVariable.operator;
                            if (newVar?.type !== 'number' && (setVariable.operator === 'add' || setVariable.operator === 'subtract' || setVariable.operator === 'random')) {
                                newOperator = 'set';
                            }
                            onActionChange({ ...setVariable, variableId: newVarId, operator: newOperator });
                        }}>
                             {Object.keys(project.variables).length === 0 && <option disabled>No variables defined</option>}
                            {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select></FormField>

                        <FormField label="Operator"><Select value={setVariable.operator} onChange={e => onActionChange({ ...setVariable, operator: e.target.value as VNSetVariableOperator })}>
                            <option value="set">Set (=)</option>
                            {project.variables[setVariable.variableId]?.type === 'number' && <option value="add">Add (+)</option>}
                            {project.variables[setVariable.variableId]?.type === 'number' && <option value="subtract">Subtract (-)</option>}
                            {project.variables[setVariable.variableId]?.type === 'number' && <option value="random">Random (Range)</option>}
                        </Select></FormField>

                        {setVariable.operator === 'random' && project.variables[setVariable.variableId]?.type === 'number' ? (
                            <div className="grid grid-cols-2 gap-2">
                                <FormField label="Min">
                                    <TextInput type="number" value={String(setVariable.randomMin ?? 0)} onChange={e => onActionChange({ ...setVariable, randomMin: parseFloat(e.target.value) || 0 })}/>
                                </FormField>
                                <FormField label="Max">
                                    <TextInput type="number" value={String(setVariable.randomMax ?? 100)} onChange={e => onActionChange({ ...setVariable, randomMax: parseFloat(e.target.value) || 100 })}/>
                                </FormField>
                            </div>
                        ) : project.variables[setVariable.variableId]?.type === 'boolean' ? (
                            <FormField label="Value">
                                <Select value={String(setVariable.value)} onChange={e => onActionChange({ ...setVariable, value: e.target.value === 'true' })}>
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                </Select>
                            </FormField>
                        ) : (
                            <FormField label="Value"><TextInput value={String(setVariable.value)} onChange={e => onActionChange({ ...setVariable, value: e.target.value })}/></FormField>
                        )}
                    </div>
                );
            }
            case UIActionType.CycleLayerAsset: {
                const cycleAction = action as CycleLayerAssetAction;
                const character = cycleAction.characterId ? project.characters[cycleAction.characterId] : undefined;
                const availableLayers = character ? Object.values(character.layers) : [];
                return (
                    <div className="space-y-2 p-2 border border-slate-700 rounded">
                        <FormField label="Character">
                            <Select value={cycleAction.characterId} onChange={e => {
                                const newCharId = e.target.value;
                                const newChar = project.characters[newCharId];
                                const firstLayerId = newChar ? Object.keys(newChar.layers)[0] || '' : '';
                                onActionChange({ ...cycleAction, characterId: newCharId, layerId: firstLayerId });
                            }}>
                                {Object.keys(project.characters).length === 0 && <option disabled>No characters defined</option>}
                                {Object.values(project.characters).map((c: VNCharacter) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                        </FormField>

                        {cycleAction.characterId && (
                            <FormField label="Layer">
                                <Select value={cycleAction.layerId} onChange={e => onActionChange({ ...cycleAction, layerId: e.target.value })}>
                                    {availableLayers.length === 0 && <option disabled>No layers in character</option>}
                                    {availableLayers.map((layer: any) => {
                                        const assetCount = layer.assets ? Object.keys(layer.assets).length : 0;
                                        return (
                                            <option key={layer.id} value={layer.id}>{layer.name} ({assetCount} assets)</option>
                                        );
                                    })}
                                </Select>
                            </FormField>
                        )}

                        <FormField label="Index Variable (to track position)">
                            <Select value={cycleAction.variableId} onChange={e => onActionChange({ ...cycleAction, variableId: e.target.value })}>
                                {Object.keys(project.variables).length === 0 && <option disabled>No variables defined</option>}
                                {numericVariables.map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </Select>
                        </FormField>

                        <FormField label="Direction">
                            <Select value={cycleAction.direction} onChange={e => onActionChange({ ...cycleAction, direction: e.target.value as 'next' | 'prev' })}>
                                <option value="next">Next (forward)</option>
                                <option value="prev">Previous (backward)</option>
                            </Select>
                        </FormField>
                    </div>
                );
            }
            default:
                return null;
        }
    };
    
    return (
        <div>
            <FormField label="Action Type">
                <Select value={action.type} onChange={e => handleTypeChange(e.target.value as UIActionType)}>
                    <option value={UIActionType.None}>None</option>
                    <option value={UIActionType.StartNewGame}>Start New Game</option>
                    <option value={UIActionType.GoToScreen}>Go To Screen</option>
                    <option value={UIActionType.LoadGame}>Load Game</option>
                    <option value={UIActionType.SaveGame}>Save Game</option>
                    <option value={UIActionType.ReturnToGame}>Return To Game</option>
                    <option value={UIActionType.ReturnToPreviousScreen}>Return To Previous Screen</option>
                    <option value={UIActionType.QuitToTitle}>Quit To Title</option>
                    <option value={UIActionType.ExitGame}>Exit Game</option>
                    <option value={UIActionType.JumpToScene}>Jump To Scene</option>
                    <option value={UIActionType.JumpToLabel}>Jump To Label</option>
                    <option value={UIActionType.SetVariable}>Set Variable</option>
                    <option value={UIActionType.CycleLayerAsset}>Cycle Layer Asset</option>
                    <option value={UIActionType.ToggleScreen}>Toggle Screen</option>
                </Select>
            </FormField>
            {renderActionFields()}
        </div>
    );
};

export default ActionEditor;
