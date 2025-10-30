import React, { useState } from 'react';
import { VNProject } from '../types/project';
import { VNVariable } from '../features/variables/types';
import { useProject } from '../contexts/ProjectContext';
import { PlusIcon, TrashIcon, Cog6ToothIcon, PencilIcon } from './icons';

interface VariableManagerProps {
    project: VNProject;
}

const VariableManager: React.FC<VariableManagerProps> = ({ project }) => {
    const { dispatch } = useProject();
    const [selectedVariableId, setSelectedVariableId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);

    const variablesArray = Object.values(project.variables || {}) as VNVariable[];

    const addVariable = () => {
        const name = `new_variable_${Object.keys(project.variables || {}).length + 1}`;
        dispatch({ type: 'ADD_VARIABLE', payload: { name, type: 'number', defaultValue: 0 } });
    };

    const handleDeleteVariable = (variableId: string) => {
        dispatch({ type: 'DELETE_VARIABLE', payload: { variableId } });
        if (selectedVariableId === variableId) {
            setSelectedVariableId(null);
        }
    };

    const handleRenameVariable = (variableId: string, name: string) => {
        dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId, updates: { name } } });
        setRenamingId(null);
    };

    const handleUpdateVariable = (variableId: string, updates: Partial<VNVariable>) => {
        dispatch({ type: 'UPDATE_VARIABLE', payload: { variableId, updates } });
    };

    return (
        <div className="flex h-full min-w-[1100px] max-w-[1100px] min-h-[750px] max-h-[750px] gap-4 p-4 overflow-hidden">
            {/* Variables List Sidebar */}
            <div className="w-80 panel flex flex-col max-h-full">
                <div className="p-3 border-b-2 border-slate-700 flex-shrink-0">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Cog6ToothIcon className="w-5 h-5 text-cyan-400" />
                        Variables
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">Track game state and player choices</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {variablesArray.map(variable => (
                        <VariableItem
                            key={variable.id}
                            variable={variable}
                            isSelected={selectedVariableId === variable.id}
                            isRenaming={renamingId === variable.id}
                            onSelect={() => setSelectedVariableId(variable.id)}
                            onStartRenaming={() => setRenamingId(variable.id)}
                            onCommitRename={(name) => handleRenameVariable(variable.id, name)}
                            onDelete={() => handleDeleteVariable(variable.id)}
                        />
                    ))}
                </div>

                <div className="p-3 border-t-2 border-slate-700 flex-shrink-0">
                    <button
                        onClick={addVariable}
                        className="w-full bg-sky-500 hover:bg-sky-600 text-white py-3 px-4 rounded-md flex items-center justify-center gap-2 font-bold text-sm transition-colors shadow-lg"
                    >
                        <PlusIcon className="w-5 h-5" />
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
        <div className="flex-1 p-4 overflow-y-auto panel">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Cog6ToothIcon className="w-6 h-6 text-cyan-400" />
                {variable.name}
            </h3>

            <div className="space-y-4 max-w-2xl">
                <div>
                    <label className="form-label">Type</label>
                    <select
                        value={variable.type}
                        onChange={(e) => handleTypeChange(e.target.value as 'number' | 'string' | 'boolean')}
                        className="form-input"
                    >
                        <option value="number">Number</option>
                        <option value="string">String</option>
                        <option value="boolean">Boolean</option>
                    </select>
                </div>

                <div>
                    <label className="form-label">Default Value</label>
                    {variable.type === 'boolean' ? (
                        <select
                            value={variable.defaultValue ? 'true' : 'false'}
                            onChange={(e) => handleDefaultValueChange(e.target.value === 'true')}
                            className="form-input"
                        >
                            <option value="false">False</option>
                            <option value="true">True</option>
                        </select>
                    ) : variable.type === 'number' ? (
                        <input
                            type="number"
                            value={variable.defaultValue}
                            onChange={(e) => handleDefaultValueChange(parseFloat(e.target.value) || 0)}
                            className="form-input"
                        />
                    ) : (
                        <input
                            type="text"
                            value={variable.defaultValue}
                            onChange={(e) => handleDefaultValueChange(e.target.value)}
                            className="form-input"
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

export default VariableManager;
