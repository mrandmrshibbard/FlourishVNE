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
import { VNUIAction, UIActionType } from '../../types/shared';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { XMarkIcon } from '../icons';
import ActionEditor from './ActionEditor';

export const ActionCard: React.FC<{
    action: VNUIAction;
    index: number;
    onActionChange: (a: VNUIAction) => void;
    onRemove: () => void;
    defaultOpen?: boolean;
}> = ({ action, index, onActionChange, onRemove, defaultOpen = true }) => {
    const { t } = useTranslation('ui');
    const { project } = useProject();

    const typeLabel = (type: string): string => {
        const key = 'actions.' + (type.charAt(0).toLowerCase() + type.slice(1));
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const summary = React.useMemo(() => {
        if (!action) return '';
        const label = typeLabel(action.type);
        const a = action as any;
        let detail = '';
        if (action.type === UIActionType.SetVariable || action.type === UIActionType.ResetVariable) {
            detail = project.variables[a.variableId]?.name || '';
        } else if (action.type === UIActionType.JumpToScene) {
            detail = project.scenes[a.targetSceneId]?.name || '';
        } else if (action.type === UIActionType.GoToScreen || action.type === UIActionType.ToggleScreen) {
            detail = (project.uiScreens[a.targetScreenId] as any)?.name || '';
        }
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
