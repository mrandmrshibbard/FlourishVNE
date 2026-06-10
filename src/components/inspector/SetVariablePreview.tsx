/**
 * Plain-English preview of a Set Variable command (e.g. "Increase Affection by 1"),
 * shown under the Set Variable editor so non-technical authors can read what the
 * command does. Presentation-only — derives its text from the command + variable
 * definition and never writes anything. Used by BOTH the flat Choice/SetVariable
 * editor in PropertiesInspector and the grouped editor in CommandGroupFields.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNVariable, VNSetVariableOperator } from '../../features/variables/types';
import { resolveBoolLabels } from '../../features/variables/booleanLabels';

export const SetVariablePreview: React.FC<{
    variable: VNVariable | undefined;
    operator: VNSetVariableOperator;
    value: string | number | boolean;
    randomMin?: number;
    randomMax?: number;
}> = ({ variable, operator, value, randomMin, randomMax }) => {
    const { t } = useTranslation('properties');
    if (!variable) return null;
    const name = variable.name;

    let text: string;
    if (variable.type === 'boolean') {
        const on = value === true || String(value).toLowerCase() === 'true';
        const { yes, no } = resolveBoolLabels(variable, t('vars.true'), t('vars.false'));
        text = t(on ? 'vars.preview.boolOn' : 'vars.preview.boolOff', { name, value: on ? yes : no });
    } else if (variable.type === 'number') {
        switch (operator) {
            case 'add':      text = t('vars.preview.add', { name, value: String(value) }); break;
            case 'subtract': text = t('vars.preview.subtract', { name, value: String(value) }); break;
            case 'random':   text = t('vars.preview.random', { name, min: String(randomMin ?? 0), max: String(randomMax ?? 100) }); break;
            default:         text = t('vars.preview.setNum', { name, value: String(value) });
        }
    } else {
        text = t('vars.preview.setStr', { name, value: String(value) });
    }

    return <p className="text-[10px] text-sky-300/70 italic mt-1 px-1">{text}</p>;
};
