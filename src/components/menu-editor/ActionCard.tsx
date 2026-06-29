/**
 * Collapsible, clearly-separated card around a single button/element/command action.
 * Used by every multi-action list (choice options, Show Button, UI elements, etc.) so a
 * button that changes several variables reads as a tidy, foldable list instead of a wall.
 * The card header shows "Action N" + a one-line summary (type + key target) and a remove
 * button; the body is the existing ActionEditor.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNUIAction } from '../../types/shared';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { XMarkIcon } from '../icons';
import ActionEditor from './ActionEditor';
import { actionLabel, actionSummaryDetail } from '../../utils/actionMeta';

export const ActionCard: React.FC<{
    action: VNUIAction;
    index: number;
    onActionChange: (a: VNUIAction) => void;
    onRemove: () => void;
    defaultOpen?: boolean;
}> = ({ action, index, onActionChange, onRemove, defaultOpen = true }) => {
    const { t } = useTranslation('ui');
    const { project } = useProject();

    const summary = React.useMemo(() => {
        if (!action) return '';
        const label = actionLabel(action.type, t);
        const detail = actionSummaryDetail(action, project);
        return detail ? `${label}: ${detail}` : label;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [action, project]);

    return (
        <CollapsibleSection
            title={t('actionEditor.actionN', { n: index + 1 })}
            summary={summary}
            defaultOpen={defaultOpen}
            action={
                <button onClick={onRemove} title={t('actionEditor.removeAction')}
                    className="text-red-400 hover:text-red-300 p-1">
                    <XMarkIcon className="w-4 h-4" />
                </button>
            }
        >
            <ActionEditor action={action} onActionChange={onActionChange} />
        </CollapsibleSection>
    );
};

export default ActionCard;
