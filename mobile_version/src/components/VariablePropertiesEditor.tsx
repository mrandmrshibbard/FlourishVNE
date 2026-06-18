import React from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import { VNID } from '../types';
import { VNVariableType } from '../features/variables/types';
import { resolveBoolLabels } from '../features/variables/booleanLabels';
import Panel from './ui/Panel';
import { FormField, Select, TextInput } from './ui/Form';
import { TrashIcon } from './icons';
import BooleanLabelEditor from './BooleanLabelEditor';

const VariablePropertiesEditor: React.FC<{
    selectedVariableId: VNID;
    setSelectedVariableId: (id: VNID | null) => void;
}> = ({ selectedVariableId, setSelectedVariableId }) => {
    const { t } = useTranslation('components');
    const { project, dispatch } = useProject();
    const variable = project.variables[selectedVariableId];

    if (!variable) {
        return (
            <Panel title={t('varProps.propertiesTitle')} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
                <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-xs italic">
                    <p>{t('varProps.notFound')}</p>
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
        if (confirm(t('varProps.confirmDelete', { name: variable.name }))) {
            dispatch({ type: 'DELETE_VARIABLE', payload: { variableId: selectedVariableId } });
            setSelectedVariableId(null);
        }
    };

    return (
        <Panel title={t('varProps.variableTitle', { name: variable.name })} className="w-72 min-w-[280px] max-w-[320px] flex-shrink-0 h-full">
            <div className="flex flex-col h-full">
                <div className="flex-grow overflow-y-auto pr-1">
                    <FormField label={t('varProps.name')}>
                        <TextInput value={variable.name} onChange={e => updateVariable({ name: e.target.value })} />
                    </FormField>
                    <FormField label={t('varProps.type')}>
                        <Select value={variable.type} onChange={e => updateVariable({ type: e.target.value as VNVariableType })}>
                            <option value="string">{t('varProps.typeString')}</option>
                            <option value="number">{t('varProps.typeNumber')}</option>
                            <option value="boolean">{t('varProps.typeBoolean')}</option>
                        </Select>
                    </FormField>
                    <FormField label={t('varProps.defaultValue')}>
                        {variable.type === 'boolean' ? (
                            (() => {
                                const { yes, no } = resolveBoolLabels(variable, t('varProps.valTrue'), t('varProps.valFalse'));
                                return (
                                    <Select value={String(variable.defaultValue)} onChange={e => updateVariable({ defaultValue: e.target.value === 'true' })}>
                                        <option value="true">{yes}</option>
                                        <option value="false">{no}</option>
                                    </Select>
                                );
                            })()
                        ) : variable.type === 'number' ? (
                            <TextInput type="number" value={Number(variable.defaultValue)} onChange={e => updateVariable({ defaultValue: parseFloat(e.target.value) || 0 })} />
                        ) : (
                            <TextInput value={String(variable.defaultValue)} onChange={e => updateVariable({ defaultValue: e.target.value })} />
                        )}
                    </FormField>
                    {variable.type === 'boolean' && (
                        <div className="mb-3">
                            <BooleanLabelEditor trueLabel={variable.trueLabel} falseLabel={variable.falseLabel}
                                onChange={updates => updateVariable(updates)} />
                        </div>
                    )}
                    {variable.type === 'number' && (
                        <FormField label={t('varProps.clampRange')}>
                            <div className="grid grid-cols-2 gap-2">
                                <TextInput type="number" value={variable.min ?? ''} placeholder={t('varProps.noMin')}
                                    onChange={e => updateVariable({ min: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })} />
                                <TextInput type="number" value={variable.max ?? ''} placeholder={t('varProps.noMax')}
                                    onChange={e => updateVariable({ max: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) })} />
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">{t('varProps.clampHint')}</p>
                        </FormField>
                    )}
                    <div className="text-xs text-[var(--text-secondary)] mt-2">
                        <p><strong>{t('varProps.typeLabel')}</strong> {variable.type}</p>
                        <p><strong>{t('varProps.currentValue')}</strong> {String(variable.defaultValue)}</p>
                        <p className="mt-2">{t('varProps.helpText')}</p>
                    </div>
                </div>
                <div className="pt-4 mt-auto">
                    <button onClick={handleDelete} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-lg flex items-center justify-center gap-1 transition-colors">
                        <TrashIcon/> {t('varProps.deleteVariable')}
                    </button>
                </div>
            </div>
        </Panel>
    );
};

export default VariablePropertiesEditor;
