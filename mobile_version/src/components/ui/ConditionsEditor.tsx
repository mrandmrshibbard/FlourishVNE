import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { VNCondition, VNConditionOperator } from '../../types/shared';
import { VNVariable, VNVariableType } from '../../features/variables/types';
import { resolveBoolLabels } from '../../features/variables/booleanLabels';
import { hasBands, sortedBands, describeBand } from '../../features/variables/bands';
import { describeConditions } from '../../utils/conditionLogic';
import VariablePicker from '../variables/VariablePicker';
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

/**
 * A number variable that has NAMED BANDS gets a different, friendlier operator set: the author talks
 * about the names they invented ("is a Friend", "is Friend or better") instead of doing arithmetic.
 * The raw numeric operators stay available underneath — see the "use exact numbers" escape hatch —
 * because a band is a convenience, never a cage.
 */
const BAND_OPERATORS: VNConditionOperator[] = ['inBand', 'atLeastBand', 'belowBand'];
const isBandOp = (op: VNConditionOperator) => BAND_OPERATORS.includes(op);

const operatorsFor = (variable: VNVariable | undefined): VNConditionOperator[] =>
    hasBands(variable)
        ? [...BAND_OPERATORS, ...getOperatorsForType('number')]
        : getOperatorsForType(variable?.type);

// Plain-English label key (under `conditions.op.*`) for each operator, so users read
// "is at least 5" instead of ">= 5". The stored operator value is unchanged.
const OP_LABEL_KEY: Record<VNConditionOperator, string> = {
    '==': 'eq', '!=': 'neq', '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte',
    'contains': 'contains', 'startsWith': 'startsWith', 'is true': 'isOn', 'is false': 'isOff',
    'inBand': 'inBand', 'atLeastBand': 'atLeastBand', 'belowBand': 'belowBand',
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

    const handleAddCondition = () => {
        // An empty variableId is FINE now: the row's VariablePicker can create the variable in place.
        // This used to bail out entirely when the project had no variables, which left a brand-new
        // author staring at "No variables defined to create conditions." with nothing to click.
        const firstVarId = Object.keys(project.variables)[0] ?? '';
        const newCondition: VNCondition = {
            variableId: firstVarId,
            operator: '==',
            value: ''
        };
        onChange([...(conditions || []), newCondition]);
    };

    const handleUpdateCondition = (index: number, updates: Partial<VNCondition>) => {
        const newConditions = [...(conditions || [])];
        const prevOperator = newConditions[index].operator;
        newConditions[index] = { ...newConditions[index], ...updates };

        if (updates.operator) {
            const variable = project.variables[newConditions[index].variableId];
            const allowedOperators = operatorsFor(variable);
            if (!allowedOperators.includes(updates.operator)) {
                newConditions[index].operator = allowedOperators[0];
            }
            // A band operator's `value` is a BAND ID; every other operator's is a literal. Crossing
            // that line makes the carried-over value nonsense — "Affection is 41" with 41 read as a
            // band id is a condition that can never be true. So reset the value when the KIND of
            // value changes.
            const nowBand = isBandOp(newConditions[index].operator);
            if (isBandOp(prevOperator) !== nowBand) {
                newConditions[index].value = nowBand ? (sortedBands(variable)[0]?.id ?? '') : '';
                // Band values are ids, never comparisons — a compare-to-variable can't cross over.
                delete (newConditions[index] as any).compareVariableId;
            }
        }
        if (updates.variableId) {
            const variable = project.variables[updates.variableId];
            const ops = operatorsFor(variable);
            newConditions[index].operator = ops[0];
            // Same reasoning: the old value belonged to the OLD variable's world.
            newConditions[index].value = isBandOp(ops[0]) ? (sortedBands(variable)[0]?.id ?? '') : '';
            delete (newConditions[index] as any).compareVariableId;
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

    if (!conditions && !isRequired) {
        return <button onClick={handleAddCondition} className="text-sky-400 hover:text-sky-300 text-xs">{t('conditions.addCondition')}</button>;
    }

    return (
        <div className="space-y-2">
            {(conditions || []).map((condition, index) => {
                const variable = project.variables[condition.variableId];
                const operators = operatorsFor(variable);
                const bands = sortedBands(variable);
                const usingBand = isBandOp(condition.operator);
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
                                    <VariablePicker
                                        value={condition.variableId}
                                        onChange={id => handleUpdateCondition(index, { variableId: id })}
                                    />
                                </FormField>
                                <div className="grid grid-cols-2 gap-1">
                                    <FormField label={t('conditions.operator')}>
                                        <Select value={displayOperator} onChange={e => handleUpdateCondition(index, { operator: e.target.value as VNConditionOperator })}>
                                            {operators.map(op => <option key={op} value={op}>{opText(op)}</option>)}
                                        </Select>
                                    </FormField>
                                    {!valueIsHidden && (
                                        <FormField label={usingBand ? t('conditions.step', 'Step') : t('conditions.value')}>
                                            {usingBand ? (
                                                // The whole point: the author picks the WORD they invented, not a number.
                                                <Select value={String(condition.value ?? '')} onChange={e => handleUpdateCondition(index, { value: e.target.value })}>
                                                    {bands.map(b => (
                                                        <option key={b.id} value={b.id}>{describeBand(variable, b, t('bands.andUpShort', 'and up'))}</option>
                                                    ))}
                                                </Select>
                                            ) : variable?.type === 'boolean' ? (
                                                <Select value={String(condition.value)} onChange={e => handleUpdateCondition(index, { value: e.target.value === 'true' })}>
                                                    <option value="true">{yes}</option>
                                                    <option value="false">{no}</option>
                                                </Select>
                                            ) : (
                                                // Compare against a typed value (default) or ANOTHER
                                                // variable of the same type ("Strength is more than
                                                // Enemy Strength"). Booleans are excluded — is Yes /
                                                // is No already covers them.
                                                <div className="space-y-1">
                                                    <Select
                                                        value={condition.compareVariableId !== undefined ? 'variable' : 'typed'}
                                                        onChange={e => handleUpdateCondition(index, { compareVariableId: e.target.value === 'variable' ? ('' as any) : undefined })}
                                                    >
                                                        <option value="typed">{t('conditions.compareTyped', 'a value I type')}</option>
                                                        <option value="variable">{t('conditions.compareVariable', 'another variable')}</option>
                                                    </Select>
                                                    {condition.compareVariableId !== undefined ? (
                                                        <VariablePicker
                                                            value={condition.compareVariableId}
                                                            onChange={id => handleUpdateCondition(index, { compareVariableId: id })}
                                                            allowedTypes={[variable?.type === 'number' ? 'number' : 'string']}
                                                            allowCreate={false}
                                                        />
                                                    ) : (
                                                        <TextInput value={String(condition.value || '')} onChange={e => handleUpdateCondition(index, { value: e.target.value })} />
                                                    )}
                                                </div>
                                            )}
                                        </FormField>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => handleRemoveCondition(index)} className="text-red-400 hover:text-red-300 mt-1 p-1"><XMarkIcon className="w-4 h-4" /></button>
                        </div>
                        {variable && (
                            // The plain-English echo, now produced by the SAME renderer the command list and
                            // branch strip use — so the sentence an author reads here is the sentence they see
                            // everywhere else.
                            <p className="text-[10px] text-sky-300/70 italic mt-1 px-1">
                                {describeConditions([{ ...condition, operator: displayOperator, connector: undefined }], project.variables)}
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
