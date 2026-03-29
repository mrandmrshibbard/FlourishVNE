import React from 'react';
import { useProject } from '../contexts/ProjectContext';
import { VNID } from '../types';
import { VNVariableType } from '../features/variables/types';
import Panel from './ui/Panel';
import { FormField, Select, TextInput } from './ui/Form';
import { TrashIcon } from './icons';

const VariablePropertiesEditor: React.FC<{
    selectedVariableId: VNID;
    setSelectedVariableId: (id: VNID | null) => void;
}> = ({ selectedVariableId, setSelectedVariableId }) => {
    const { project, dispatch } = useProject();
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

    const updateVariable = (updates: Partial<typeof variable>) => {
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
};

export default VariablePropertiesEditor;
