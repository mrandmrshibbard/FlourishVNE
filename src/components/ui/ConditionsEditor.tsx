import React from 'react';
import { VNCondition, VNConditionOperator } from '../../types/shared';
import { VNVariable, VNVariableType } from '../../features/variables/types';
import { VNProject } from '../../types/project';
import { FormField, Select, TextInput } from './Form';
import { XMarkIcon, PlusIcon } from '../icons';

const getOperatorsForType = (type: VNVariableType | undefined): VNConditionOperator[] => {
    switch (type) {
        case 'string': return ['==', '!=', 'contains', 'startsWith'];
        case 'number': return ['==', '!=', '>', '<', '>=', '<='];
        case 'boolean': return ['is true', 'is false'];
        default: return ['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith'];
    }
};

const ConditionsEditor: React.FC<{
    conditions: VNCondition[] | undefined;
    project: VNProject;
    onChange: (newConditions: VNCondition[] | undefined) => void;
    isRequired?: boolean;
}> = ({ conditions, project, onChange, isRequired }) => {
    const hasVariables = Object.keys(project.variables).length > 0;

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

        if (updates.operator) {
            const variable = project.variables[newConditions[index].variableId];
            const allowedOperators = getOperatorsForType(variable?.type);
            if (!allowedOperators.includes(updates.operator)) {
                newConditions[index].operator = allowedOperators[0];
            }
        }
        if (updates.variableId) {
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
};

export default ConditionsEditor;
