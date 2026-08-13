/**
 * UIActionsListEditor
 * ───────────────────
 * Compact list editor for `VNUIAction[]` with inline detail editors per
 * action type. Extracted from the original `HZActionsEditor` inside
 * `HotZoneEditor.tsx` so it can be shared by the win-condition editor and
 * other places that edit action lists.
 *
 * Per-action fields, labels, defaults and summaries now come from the SHARED
 * `actionFields` / `actionMeta` modules (the same ones ActionEditor uses), so the
 * two editors can never drift again.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { VNProject } from '../../types/project';
import { VNID } from '../../types';
import { VNUIAction, UIActionType, VNCondition } from '../../types/shared';
import { CollapsibleSection } from './CollapsibleSection';
import ConditionsEditor from './ConditionsEditor';
import { PlusIcon, TrashIcon } from '../icons';
import ActionFields from './actionFields';
import { actionLabel, actionSummaryDetail, defaultActionForType } from '../../utils/actionMeta';
import SearchableSelect from './SearchableSelect';

export interface ActionTargetableElement {
    id: VNID;
    name: string;
}

interface UIActionsListEditorProps {
    actions: VNUIAction[];
    project: VNProject;
    /** Elements that show up in target-element pickers (ChangeImage / PlayAnimation).
     *  Usually the hot zone elements on the current screen. */
    targetableElements?: ActionTargetableElement[];
    onChange: (actions: VNUIAction[]) => void;
    label?: string;
}

const UIActionsListEditor: React.FC<UIActionsListEditorProps> = ({
    actions,
    project,
    targetableElements,
    onChange,
    label,
}) => {
    const { t } = useTranslation('ui');
    const listLabel = label ?? t('actionsList.actions');

    const addAction = () => onChange([...actions, { type: UIActionType.None }]);
    const removeAction = (index: number) => onChange(actions.filter((_, i) => i !== index));
    // Replace a row wholesale — ActionFields/ConditionsEditor always emit a FULL action.
    const replaceAction = (index: number, next: VNUIAction) => {
        const arr = [...actions];
        arr[index] = next;
        onChange(arr);
    };
    const changeActionType = (index: number, newType: UIActionType) => replaceAction(index, defaultActionForType(newType, project));

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">{listLabel}</span>
                <button onClick={addAction} className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-0.5">
                    <PlusIcon className="w-3 h-3" /> {t('actionsList.add')}
                </button>
            </div>
            {actions.length === 0 && (
                <p className="text-[10px] text-slate-500 italic">{t('actionsList.noActions')}</p>
            )}
            <div className="space-y-1">
                {actions.map((action, i) => {
                    const detail = actionSummaryDetail(action, project);
                    const summary = detail ? `${actionLabel(action.type, t)}: ${detail}` : actionLabel(action.type, t);
                    return (
                        <CollapsibleSection
                            key={i}
                            title={t('actionEditor.actionN', { n: i + 1 })}
                            summary={summary}
                            defaultOpen={true}
                            action={
                                <button onClick={() => removeAction(i)} title={t('actionEditor.removeAction')} className="text-red-400 hover:text-red-300 p-0.5">
                                    <TrashIcon className="w-3 h-3" />
                                </button>
                            }
                        >
                            {/* Searchable (~60 types). Deliberately still Object.values — this list
                                editor has always offered every action type, unlike ActionEditor's
                                curated MENU_ACTION_TYPES; changing which types are offered is a
                                separate decision from making them findable. */}
                            <SearchableSelect
                                value={action.type}
                                onChange={v => changeActionType(i, v as UIActionType)}
                                options={Object.values(UIActionType).map(at => ({ value: at, label: actionLabel(at, t) }))}
                                className="mb-1 text-[10px]"
                            />
                            <ActionFields
                                action={action}
                                project={project}
                                onChange={next => replaceAction(i, next)}
                                options={{
                                    targetableElements,
                                    variant: 'compact',
                                    // Nested action lists (e.g. a Start Timer action's on-finish actions)
                                    // reuse this same editor — injected to avoid a circular import.
                                    renderActionList: (acts, onCh, lbl) => (
                                        <UIActionsListEditor actions={acts} project={project} targetableElements={targetableElements} onChange={onCh} label={lbl} />
                                    ),
                                }}
                            />
                            {action.type !== UIActionType.None && (
                                <div className="mt-1">
                                    <ConditionsEditor
                                        collapsible
                                        title={t('actionsList.runOnlyIf', 'Run only if…')}
                                        conditions={(action as { conditions?: VNCondition[] }).conditions}
                                        project={project}
                                        onChange={(conds: VNCondition[]) => replaceAction(i, { ...action, conditions: conds } as VNUIAction)}
                                    />
                                </div>
                            )}
                        </CollapsibleSection>
                    );
                })}
            </div>
        </div>
    );
};

export default UIActionsListEditor;
