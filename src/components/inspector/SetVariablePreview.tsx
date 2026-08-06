/**
 * Plain-English preview of a Set Variable command ("Increase Affection by 1"), shown under the
 * Set Variable editor so non-technical authors can read what the command does.
 *
 * The sentence itself is built by utils/variableLanguage.ts — the SAME renderer the command list, the
 * collapsed group badges and the action cards use. This component is now only the translator hookup
 * plus the styling. Do not re-implement the phrasing here: the whole point of the shared module is
 * that there is no second copy to drift out of step (there used to be five).
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNVariable, VNSetVariableOperator } from '../../features/variables/types';
import { describeSetVariable, Translate } from '../../utils/variableLanguage';

export const SetVariablePreview: React.FC<{
    variable: VNVariable | undefined;
    operator: VNSetVariableOperator;
    value: string | number | boolean;
    randomMin?: number;
    randomMax?: number;
    valueSource?: 'variable' | 'calc';
    valueVariableId?: string;
    calc?: import('../../types/shared').VNValueCalc;
}> = ({ variable, operator, value, randomMin, randomMax, valueSource, valueVariableId, calc }) => {
    const { t } = useTranslation('properties');
    const { project } = useProject();
    if (!variable) return null;

    const text = describeSetVariable(
        project,
        { variableId: variable.id, operator, value, randomMin, randomMax, valueSource, valueVariableId, calc },
        t as unknown as Translate,
    );

    return <p className="text-[10px] text-sky-300/70 italic mt-1 px-1">{text}</p>;
};
