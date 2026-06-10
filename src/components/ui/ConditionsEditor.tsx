import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { VNCondition, VNConditionOperator } from '../../types/shared';
import { VNVariable, VNVariableType } from '../../features/variables/types';
import { resolveBoolLabels } from '../../features/variables/booleanLabels';
import { CollapsibleSection } from './CollapsibleSection';
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

// Plain-English label key (under `conditions.op.*`) for each operator, so users read
// "is at least 5" instead of ">= 5". The stored operator value is unchanged.
const OP_LABEL_KEY: Record<VNConditionOperator, string> = {
    '==': 'eq', '!=': 'neq', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte',
    'contains': 'contains', 'startsWith': 'startsWith', 'is true': 'isOn', 'is false': 'isOff',
};

const ConditionsEditor: React.FC<{
    conditions: VNCondition[] | undefined;
    project: VNProject;
    onChange: (newConditions: VNCondition[] | undefined) => void;
    isRequired?: boolean;
    /** When true, wraps the editor in a collapsible accordion (count badge on the header)
     *  so a command/element's conditions can be folded away. */
    collapsible?: boolean;
    /** Header title used in collapsible mode (defaults to "Conditions"). */
    title?: string;
    /** Optional one-line hint shown under the header while collapsed (collapsible mode only). */
    hint?: string;
}> = ({ conditions, project, onChange, isRequired, collapsible, title, hint }) => {
    const { t } = useTranslation('ui');
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

    // Migrate stale boolean conditions (e.g. operator '==' with a true/false value) to the
    // canonical 'is true' / 'is false' so the editor isn't confusing. Runs once when needed.
    useEffect(() => {
        if (!conditions || conditions.length === 0) return;
        let changed = false;
        const migrated = conditions.map(c => {
            const v = project.variables[c.variableId];
            if (v?.type === 'boolean' && c.operator !== 'is true' && c.operator !== 'is false') {
                const truthy = c.value === true || String(c.value).toLowerCase() === 'true';
                const op: VNConditionOperator = (c.operator === '!=' ? !truthy : truthy) ? 'is true' : 'is false';
                changed = true;
                return { variableId: c.variableId, operator: op, connector: c.connector };
            }
            return c;
        });
        if (changed) onChange(migrated);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conditions, project.variables]);

    // Collapsible mode: fold the editor into an accordion with a count badge. Renders a plain
    // (non-collapsible) ConditionsEditor inside so the body logic stays in one place.
    if (collapsible) {
        const count = conditions?.length ?? 0;
        return (
            <CollapsibleSection
                title={title || t('conditions.sectionTitle')}
                badge={count ? String(count) : undefined}
                defaultOpen={count > 0}
                hint={hint}
            >
                <ConditionsEditor conditions={conditions} project={project} onChange={onChange} isRequired={isRequired} />
            </CollapsibleSection>
        );
    }

    if (!hasVariables) {
        return <p className="text-xs text-[var(--text-muted)]">{t('conditions.noVariables')}</p>;
    }

    if (!conditions && !isRequired) {
        return <button onClick={handleAddCondition} className="text-sky-400 hover:text-sky-300 text-xs">{t('conditions.addCondition')}</button>;
    }

    return (
        <div className="space-y-2">
            {(conditions || []).map((condition, index) => {
                const variable = project.variables[condition.variableId];
                const operators = getOperatorsForType(variable?.type);
                const isBool = variable?.type === 'boolean';
                // For booleans, normalize a stale '=='/'!=' operator to is true/is false for display
                // and never show the separate value dropdown (the operator already says it).
                const truthyVal = condition.value === true || String(condition.value).toLowerCase() === 'true';
                const displayOperator: VNConditionOperator = isBool
                    ? ((condition.operator === 'is true' || condition.operator === 'is false')
                        ? condition.operator
                        : ((condition.operator === '!=' ? !truthyVal : truthyVal) ? 'is true' : 'is false'))
                    : condition.operator;
                const valueIsHidden = displayOperator === 'is true' || displayOperator === 'is false';
                // Per-variable boolean labels (e.g. Locked/Unlocked); fall back to global Yes/No.
                const { yes, no } = resolveBoolLabels(variable, t('conditions.true'), t('conditions.false'));
                const opText = (op: VNConditionOperator) => t(`conditions.op.${OP_LABEL_KEY[op]}`, { value: op === 'is true' ? yes : op === 'is false' ? no : '' });

                return (
                    <React.Fragment key={index}>
                    {index > 0 && (
                        <div className="flex justify-center -my-0.5">
                            <Select
                                value={condition.connector ?? 'and'}
                                onChange={e => handleUpdateCondition(index, { connector: e.target.value as 'and' | 'or' })}
                                className="!w-auto !py-0.5 !px-2 text-[11px] font-semibold uppercase tracking-wide"
                            >
                                <option value="and">{t('conditions.and')}</option>
                                <option value="or">{t('conditions.or')}</option>
                            </Select>
                        </div>
                    )}
                    <div className="p-1 border border-[var(--border-subtle)] rounded-md">
                        <div className="flex gap-1 items-start">
                            <div className="flex-grow space-y-1">
                                <FormField label={t('conditions.variable')}>
                                    <Select value={condition.variableId} onChange={e => handleUpdateCondition(index, { variableId: e.target.value })}>
                                        {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </Select>
                                </FormField>
                                <div className="grid grid-cols-2 gap-1">
                                    <FormField label={t('conditions.operator')}>
                                        <Select value={displayOperator} onChange={e => handleUpdateCondition(index, { operator: e.target.value as VNConditionOperator })}>
                                            {operators.map(op => <option key={op} value={op}>{opText(op)}</option>)}
                                        </Select>
                                    </FormField>
                                    {!valueIsHidden && (
                                        <FormField label={t('conditions.value')}>
                                            {variable?.type === 'boolean' ? (
                                                <Select value={String(condition.value)} onChange={e => handleUpdateCondition(index, { value: e.target.value === 'true' })}>
                                                    <option value="true">{yes}</option>
                                                    <option value="false">{no}</option>
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
                        {variable && (
                            <p className="text-[10px] text-sky-300/70 italic mt-1 px-1">
                                {variable.name} {opText(displayOperator)}{valueIsHidden ? '' : ` ${String(condition.value ?? '')}`}
                            </p>
                        )}
                    </div>
                    </React.Fragment>
                );
            })}
            {(conditions || []).length > 1 && (
                <p className="text-[10px] text-[var(--text-muted)] italic">{t('conditions.evalHint')}</p>
            )}
            <button onClick={handleAddCondition} className="text-sky-400 hover:text-sky-300 text-xs mt-2 flex items-center gap-1"><PlusIcon className="w-4 h-4"/>{t('conditions.addCondition')}</button>
        </div>
    );
};

export default ConditionsEditor;
