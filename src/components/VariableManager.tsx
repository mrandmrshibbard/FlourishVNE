import React, { useState, useMemo } from 'react';
import { VNProject } from '../types/project';
import { VNVariable } from '../features/variables/types';
import { useProject } from '../contexts/ProjectContext';
import { PlusIcon, TrashIcon, Cog6ToothIcon, PencilIcon } from './icons';
import { CommandType, VNCommand, SetVariableCommand, TextInputCommand, ChoiceCommand } from '../features/scene/types';
import { VNUIScreen, VNUIElement } from '../features/ui/types';
import { VNCondition, UIActionType, SetVariableAction, CycleLayerAssetAction } from '../types/shared';
import ConfirmationModal from './ui/ConfirmationModal';

interface VariableUsage {
    location: string;
    type: 'command' | 'condition' | 'ui-action' | 'text-reference';
    detail: string;
}

// Find all usages of a variable in the project
function findVariableUsages(project: VNProject, variableId: string, variableName: string): VariableUsage[] {
    const usages: VariableUsage[] = [];
    
    // Check all scenes for commands using this variable
    for (const sceneId in project.scenes) {
        const scene = project.scenes[sceneId];
        scene.commands.forEach((cmd, index) => {
            // SetVariable command
            if (cmd.type === CommandType.SetVariable && (cmd as SetVariableCommand).variableId === variableId) {
                usages.push({
                    location: `Scene: ${scene.name}`,
                    type: 'command',
                    detail: `Command ${index + 1}: Set Variable`
                });
            }
            
            // TextInput command
            if (cmd.type === CommandType.TextInput && (cmd as TextInputCommand).variableId === variableId) {
                usages.push({
                    location: `Scene: ${scene.name}`,
                    type: 'command',
                    detail: `Command ${index + 1}: Text Input`
                });
            }
            
            // Check conditions on any command
            if (cmd.conditions?.some((c: VNCondition) => c.variableId === variableId)) {
                usages.push({
                    location: `Scene: ${scene.name}`,
                    type: 'condition',
                    detail: `Command ${index + 1}: Has condition using variable`
                });
            }
            
            // Check Choice options for conditions and actions
            if (cmd.type === CommandType.Choice) {
                const choiceCmd = cmd as ChoiceCommand;
                choiceCmd.options.forEach((opt, optIndex) => {
                    if (opt.conditions?.some((c: VNCondition) => c.variableId === variableId)) {
                        usages.push({
                            location: `Scene: ${scene.name}`,
                            type: 'condition',
                            detail: `Command ${index + 1}, Option ${optIndex + 1}: Has condition`
                        });
                    }
                    opt.actions?.forEach(action => {
                        if (action.type === UIActionType.SetVariable && (action as SetVariableAction).variableId === variableId) {
                            usages.push({
                                location: `Scene: ${scene.name}`,
                                type: 'ui-action',
                                detail: `Command ${index + 1}, Option ${optIndex + 1}: Sets variable`
                            });
                        }
                    });
                });
            }
            
            // Check Dialogue text for variable references like {variableName} or {variableId}
            if (cmd.type === CommandType.Dialogue) {
                const text = (cmd as any).text || '';
                if (text.includes(`{${variableName}}`) || text.includes(`{${variableId}}`)) {
                    usages.push({
                        location: `Scene: ${scene.name}`,
                        type: 'text-reference',
                        detail: `Command ${index + 1}: Referenced in dialogue text`
                    });
                }
            }
        });
    }
    
    // Check UI screens for variable usages
    for (const screenId in project.uiScreens) {
        const screen = project.uiScreens[screenId];
        checkUIElementsForVariableUsage(screen.elements, variableId, variableName, `UI Screen: ${screen.name}`, usages);
    }
    
    return usages;
}

function checkUIElementsForVariableUsage(
    elements: VNUIElement[], 
    variableId: string, 
    variableName: string,
    locationPrefix: string, 
    usages: VariableUsage[]
): void {
    elements.forEach(element => {
        // Check element conditions
        if (element.conditions?.some((c: VNCondition) => c.variableId === variableId)) {
            usages.push({
                location: locationPrefix,
                type: 'condition',
                detail: `Element "${element.name || element.type}": Has condition`
            });
        }
        
        // Check element actions (for buttons)
        if (element.actions) {
            element.actions.forEach(action => {
                if (action.type === UIActionType.SetVariable && (action as SetVariableAction).variableId === variableId) {
                    usages.push({
                        location: locationPrefix,
                        type: 'ui-action',
                        detail: `Element "${element.name || element.type}": Sets variable`
                    });
                }
                if (action.type === UIActionType.CycleLayerAsset && (action as CycleLayerAssetAction).variableId === variableId) {
                    usages.push({
                        location: locationPrefix,
                        type: 'ui-action',
                        detail: `Element "${element.name || element.type}": Cycles layer asset`
                    });
                }
            });
        }
        
        // Check text content for variable references
        if (element.content && (element.content.includes(`{${variableName}}`) || element.content.includes(`{${variableId}}`))) {
            usages.push({
                location: locationPrefix,
                type: 'text-reference',
                detail: `Element "${element.name || element.type}": Referenced in text`
            });
        }
        
        // Recursively check children
        if (element.children) {
            checkUIElementsForVariableUsage(element.children, variableId, variableName, locationPrefix, usages);
        }
    });
}

interface VariableManagerProps {
    project: VNProject;
    selectedVariableId?: string | null;
    setSelectedVariableId?: (id: string | null) => void;
}

const VariableManager: React.FC<VariableManagerProps> = ({
    project,
    selectedVariableId: controlledSelectedId,
    setSelectedVariableId: setControlledSelectedId
}) => {
    const { dispatch } = useProject();
    const [internalSelectedVariableId, setInternalSelectedVariableId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ variableId: string; usages: VariableUsage[] } | null>(null);

    const isControlledSelection = controlledSelectedId !== undefined && typeof setControlledSelectedId === 'function';
    const selectedVariableId = isControlledSelection ? controlledSelectedId ?? null : internalSelectedVariableId;

    const setSelectedVariableId = (id: string | null) => {
        if (isControlledSelection && setControlledSelectedId) {
            setControlledSelectedId(id);
        } else {
            setInternalSelectedVariableId(id);
        }
    };

    const variablesArray = useMemo(
        () => Object.values(project.variables || {}) as VNVariable[],
        [project.variables]
    );

    const addVariable = () => {
        const name = `new_variable_${Object.keys(project.variables || {}).length + 1}`;
        dispatch({ type: 'ADD_VARIABLE', payload: { name, type: 'number', defaultValue: 0 } });
    };

    const handleRequestDelete = (variableId: string) => {
        const variable = project.variables[variableId];
        if (!variable) return;
        
        const usages = findVariableUsages(project, variableId, variable.name);
        
        if (usages.length > 0) {
            // Show confirmation with usage info
            setDeleteConfirm({ variableId, usages });
        } else {
            // No usages, delete directly
            handleDeleteVariable(variableId);
        }
    };

    const handleDeleteVariable = (variableId: string) => {
        dispatch({ type: 'DELETE_VARIABLE', payload: { variableId } });
        if (selectedVariableId === variableId) {
            setSelectedVariableId(null);
        }
        setDeleteConfirm(null);
    };

    const handleRenameVariable = (variableId: string, name: string) => {
        dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId, updates: { name } } });
        setRenamingId(null);
    };

    const handleUpdateVariable = (variableId: string, updates: Partial<VNVariable>) => {
        dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId, updates } });
    };

    return (
        <div className="flex h-full">
            {/* Variables List Sidebar */}
            <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Cog6ToothIcon className="w-5 h-5" />
                        Variables
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {variablesArray.map(variable => (
                        <VariableItem
                            key={variable.id}
                            variable={variable}
                            isSelected={selectedVariableId === variable.id}
                            isRenaming={renamingId === variable.id}
                            onSelect={() => setSelectedVariableId(variable.id)}
                            onStartRenaming={() => setRenamingId(variable.id)}
                            onCommitRename={(name) => handleRenameVariable(variable.id, name)}
                            onDelete={() => handleRequestDelete(variable.id)}
                        />
                    ))}
                </div>

                <div className="p-2 border-t border-slate-700">
                    <button
                        onClick={addVariable}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-md flex items-center justify-center gap-2 font-bold transition-colors"
                    >
                        <PlusIcon className="w-4 h-4" />
                        Add Variable
                    </button>
                </div>
            </div>

            {/* Variable Inspector */}
            <div className="flex-1 flex flex-col min-w-0">
                {selectedVariableId ? (
                    <VariableInspector
                        variableId={selectedVariableId}
                        project={project}
                        onUpdate={(updates) => handleUpdateVariable(selectedVariableId, updates)}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400">
                        <div className="text-center">
                            <Cog6ToothIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg">Select a variable to inspect</p>
                            <p className="text-sm">View and edit variable properties</p>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Delete Confirmation Modal with Usage Info */}
            {deleteConfirm && (
                <ConfirmationModal
                    isOpen={true}
                    onClose={() => setDeleteConfirm(null)}
                    onConfirm={() => handleDeleteVariable(deleteConfirm.variableId)}
                    title="⚠️ Variable In Use"
                    confirmLabel="Delete Anyway"
                >
                    <div className="space-y-3">
                        <p className="text-[var(--text-primary)]">
                            This variable is used in <strong>{deleteConfirm.usages.length}</strong> place{deleteConfirm.usages.length !== 1 ? 's' : ''}. 
                            Deleting it may break your game!
                        </p>
                        <div className="max-h-48 overflow-y-auto bg-[var(--bg-tertiary)] rounded-lg p-3">
                            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Usages found:</p>
                            <ul className="space-y-1.5 text-sm">
                                {deleteConfirm.usages.slice(0, 10).map((usage, i) => (
                                    <li key={i} className="flex items-start gap-2 text-[var(--text-secondary)]">
                                        <span className="flex-shrink-0">
                                            {usage.type === 'command' && '📜'}
                                            {usage.type === 'condition' && '❓'}
                                            {usage.type === 'ui-action' && '🔘'}
                                            {usage.type === 'text-reference' && '💬'}
                                        </span>
                                        <span>
                                            <strong>{usage.location}</strong>
                                            <br />
                                            <span className="text-xs opacity-75">{usage.detail}</span>
                                        </span>
                                    </li>
                                ))}
                                {deleteConfirm.usages.length > 10 && (
                                    <li className="text-xs text-[var(--text-secondary)] italic pt-1">
                                        ...and {deleteConfirm.usages.length - 10} more
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                </ConfirmationModal>
            )}
        </div>
    );
};

interface VariableItemProps {
    variable: VNVariable;
    isSelected: boolean;
    isRenaming: boolean;
    onSelect: () => void;
    onStartRenaming: () => void;
    onCommitRename: (name: string) => void;
    onDelete: () => void;
}

const VariableItem: React.FC<VariableItemProps> = ({
    variable,
    isSelected,
    isRenaming,
    onSelect,
    onStartRenaming,
    onCommitRename,
    onDelete
}) => {
    const [renameValue, setRenameValue] = useState(variable.name);

    const handleRenameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onCommitRename(renameValue);
        } else if (e.key === 'Escape') {
            setRenameValue(variable.name);
            onStartRenaming();
        }
    };

    const handleRenameBlur = () => {
        onCommitRename(renameValue);
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'number': return '🔢';
            case 'string': return '📝';
            case 'boolean': return '✅';
            default: return '❓';
        }
    };

    return (
        <div
            onClick={onSelect}
            onDoubleClick={onStartRenaming}
            className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                isSelected
                    ? 'bg-sky-500/20 border border-sky-500/50'
                    : 'hover:bg-slate-700'
            }`}
        >
            <div className="w-8 h-8 rounded-md bg-slate-700 flex items-center justify-center flex-shrink-0 text-sm">
                {getTypeIcon(variable.type)}
            </div>

            <div className="flex-grow truncate">
                {isRenaming ? (
                    <input
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={handleRenameKeyDown}
                        className="w-full bg-slate-900 text-white p-1 rounded text-sm outline-none ring-1 ring-sky-500"
                        onClick={e => e.stopPropagation()}
                        autoFocus
                    />
                ) : (
                    <span className="text-sm">{variable.name}</span>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs text-slate-400 capitalize px-2 py-1 bg-slate-600 rounded">
                    {variable.type}
                </span>

                <button
                    onClick={(e) => { e.stopPropagation(); onStartRenaming(); }}
                    className="p-1 text-slate-500 hover:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rename"
                >
                    <PencilIcon className="w-3 h-3" />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                >
                    <TrashIcon className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
};

interface VariableInspectorProps {
    variableId: string;
    project: VNProject;
    onUpdate: (updates: Partial<VNVariable>) => void;
}

const VariableInspector: React.FC<VariableInspectorProps> = ({ variableId, project, onUpdate }) => {
    const variable = project.variables?.[variableId];

    if (!variable) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-400">
                <p>Variable not found</p>
            </div>
        );
    }

    const handleTypeChange = (type: 'number' | 'string' | 'boolean') => {
        let defaultValue: any = variable.defaultValue;

        // Convert default value to new type
        switch (type) {
            case 'number':
                defaultValue = typeof variable.defaultValue === 'number' ? variable.defaultValue : 0;
                break;
            case 'string':
                defaultValue = String(variable.defaultValue);
                break;
            case 'boolean':
                defaultValue = Boolean(variable.defaultValue);
                break;
        }

        onUpdate({ type, defaultValue });
    };

    const handleDefaultValueChange = (value: any) => {
        onUpdate({ defaultValue: value });
    };

    return (
        <div className="flex-1 p-4 overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-4">{variable.name}</h3>

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Type</label>
                    <select
                        value={variable.type}
                        onChange={(e) => handleTypeChange(e.target.value as 'number' | 'string' | 'boolean')}
                        className="w-full bg-slate-800 text-white p-2 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                        <option value="number">Number</option>
                        <option value="string">String</option>
                        <option value="boolean">Boolean</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Default Value</label>
                    {variable.type === 'boolean' ? (
                        <select
                            value={variable.defaultValue ? 'true' : 'false'}
                            onChange={(e) => handleDefaultValueChange(e.target.value === 'true')}
                            className="w-full bg-slate-800 text-white p-2 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        >
                            <option value="false">False</option>
                            <option value="true">True</option>
                        </select>
                    ) : variable.type === 'number' ? (
                        <input
                            type="number"
                            value={variable.defaultValue}
                            onChange={(e) => handleDefaultValueChange(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-800 text-white p-2 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                    ) : (
                        <input
                            type="text"
                            value={variable.defaultValue}
                            onChange={(e) => handleDefaultValueChange(e.target.value)}
                            className="w-full bg-slate-800 text-white p-2 rounded-md border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-slate-700">
                    <div>
                        <span className="text-slate-400">ID:</span>
                        <span className="text-white ml-2 font-mono text-xs">{variable.id}</span>
                    </div>
                    <div>
                        <span className="text-slate-400">Type:</span>
                        <span className="text-white ml-2 capitalize">{variable.type}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(VariableManager);