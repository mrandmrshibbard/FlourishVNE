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
            
            {action.type === UIActionType.GoToScreen && (
                <FormField label="Target Screen">
                    <Select value={(action as GoToScreenAction).targetScreenId} onChange={e => onActionChange({ ...(action as GoToScreenAction), targetScreenId: e.target.value })}>
                        {Object.values(project.uiScreens).map((s: VNUIScreen) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </Select>
                </FormField>
            )}
             {action.type === UIActionType.JumpToScene && (
                <FormField label="Target Scene">
                    <Select value={(action as JumpToSceneAction).targetSceneId} onChange={e => onActionChange({ ...(action as JumpToSceneAction), targetSceneId: e.target.value })}>
                        {Object.values(project.scenes).map((s: VNScene) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </Select>
                </FormField>
            )}
            {action.type === UIActionType.JumpToLabel && (() => {
                // Collect all labels from all scenes
                const allLabels: Array<{ labelId: string; sceneName: string; sceneId: string }> = [];
                Object.values(project.scenes).forEach((scene: VNScene) => {
                    scene.commands.forEach(cmd => {
                        if (cmd.type === CommandType.Label) {
                            allLabels.push({
                                labelId: (cmd as LabelCommand).labelId,
                                sceneName: scene.name,
                                sceneId: scene.id
                            });
                        }
                    });
                });
                
                return (
                    <FormField label="Target Label">
                        <Select value={(action as JumpToLabelAction).targetLabel} onChange={e => onActionChange({ ...(action as JumpToLabelAction), targetLabel: e.target.value })}>
                            {allLabels.length === 0 && <option value="">No labels found</option>}
                            {allLabels.map((labelInfo, idx) => (
                                <option key={idx} value={labelInfo.labelId}>
                                    {labelInfo.labelId} (in {labelInfo.sceneName})
                                </option>
                            ))}
                        </Select>
                    </FormField>
                );
            })()}
            {action.type === UIActionType.SetVariable && (
                <div className="space-y-2 p-2 border border-slate-700 rounded">
                    <FormField label="Variable"><Select value={(action as SetVariableAction).variableId} onChange={e => {
                        const newVarId = e.target.value;
                        const newVar = project.variables[newVarId];
                        const currentAction = action as SetVariableAction;
                        let newOperator = currentAction.operator;
                        if (newVar?.type !== 'number' && (currentAction.operator === 'add' || currentAction.operator === 'subtract' || currentAction.operator === 'random')) {
                            newOperator = 'set';
                        }
                        onActionChange({ ...currentAction, variableId: newVarId, operator: newOperator });
                    }}>
                         {Object.keys(project.variables).length === 0 && <option disabled>No variables defined</option>}
                        {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </Select></FormField>
                    
                    <FormField label="Operator"><Select value={(action as SetVariableAction).operator} onChange={e => onActionChange({ ...(action as SetVariableAction), operator: e.target.value as VNSetVariableOperator })}>
                        <option value="set">Set (=)</option>
                        {project.variables[(action as SetVariableAction).variableId]?.type === 'number' && <option value="add">Add (+)</option>}
                        {project.variables[(action as SetVariableAction).variableId]?.type === 'number' && <option value="subtract">Subtract (-)</option>}
                        {project.variables[(action as SetVariableAction).variableId]?.type === 'number' && <option value="random">Random (Range)</option>}
                    </Select></FormField>
                    
                    {(action as SetVariableAction).operator === 'random' && project.variables[(action as SetVariableAction).variableId]?.type === 'number' ? (
                        <div className="grid grid-cols-2 gap-2">
                            <FormField label="Min">
                                <TextInput type="number" value={String((action as SetVariableAction).randomMin ?? 0)} onChange={e => onActionChange({ ...(action as SetVariableAction), randomMin: parseFloat(e.target.value) || 0 })}/>
                            </FormField>
                            <FormField label="Max">
                                <TextInput type="number" value={String((action as SetVariableAction).randomMax ?? 100)} onChange={e => onActionChange({ ...(action as SetVariableAction), randomMax: parseFloat(e.target.value) || 100 })}/>
                            </FormField>
                        </div>
                    ) : project.variables[(action as SetVariableAction).variableId]?.type === 'boolean' ? (
                        <FormField label="Value">
                            <Select value={String((action as SetVariableAction).value)} onChange={e => onActionChange({ ...(action as SetVariableAction), value: e.target.value })}>
                                <option value="true">True</option>
                                <option value="false">False</option>
                            </Select>
                        </FormField>
                    ) : (
                        <FormField label="Value"><TextInput value={String((action as SetVariableAction).value)} onChange={e => onActionChange({ ...(action as SetVariableAction), value: e.target.value })}/></FormField>
                    )}
                </div>
            )}
            {action.type === UIActionType.CycleLayerAsset && (
                <div className="space-y-2 p-2 border border-slate-700 rounded">
                    <FormField label="Character">
                        <Select value={(action as CycleLayerAssetAction).characterId} onChange={e => {
                            const newCharId = e.target.value;
                            const newChar = project.characters[newCharId];
                            const firstLayerId = newChar ? Object.keys(newChar.layers)[0] || '' : '';
                            onActionChange({ ...(action as CycleLayerAssetAction), characterId: newCharId, layerId: firstLayerId });
                        }}>
                            {Object.keys(project.characters).length === 0 && <option disabled>No characters defined</option>}
                            {Object.values(project.characters).map((c: VNCharacter) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                    </FormField>
                    
                    {(action as CycleLayerAssetAction).characterId && project.characters[(action as CycleLayerAssetAction).characterId] && (
                        <FormField label="Layer">
                            <Select value={(action as CycleLayerAssetAction).layerId} onChange={e => onActionChange({ ...(action as CycleLayerAssetAction), layerId: e.target.value })}>
                                {Object.keys(project.characters[(action as CycleLayerAssetAction).characterId].layers).length === 0 && <option disabled>No layers in character</option>}
                                {Object.values(project.characters[(action as CycleLayerAssetAction).characterId].layers).map((layer: any) => {
                                    const assetCount = layer.assets ? Object.keys(layer.assets).length : 0;
                                    return (
                                        <option key={layer.id} value={layer.id}>{layer.name} ({assetCount} assets)</option>
                                    );
                                })}
                            </Select>
                        </FormField>
                    )}
                    
                    <FormField label="Index Variable (to track position)">
                        <Select value={(action as CycleLayerAssetAction).variableId} onChange={e => onActionChange({ ...(action as CycleLayerAssetAction), variableId: e.target.value })}>
                            {Object.keys(project.variables).length === 0 && <option disabled>No variables defined</option>}
                            {Object.values(project.variables).filter((v: VNVariable) => v.type === 'number').map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                    </FormField>
                    
                    <FormField label="Direction">
                        <Select value={(action as CycleLayerAssetAction).direction} onChange={e => onActionChange({ ...(action as CycleLayerAssetAction), direction: e.target.value as 'next' | 'prev' })}>
                            <option value="next">Next (forward)</option>
                            <option value="prev">Previous (backward)</option>
                        </Select>
                    </FormField>
                </div>
            )}
        </div>
    );
};

export default ActionEditor;
