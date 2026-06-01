/**
 * WinConditionEditor
 * ──────────────────
 * Edits a screen-level VNHotZoneWinCondition. Reusable between
 * HotZoneEditor and the standard MenuEditor's ScreenInspector — every
 * screen is allowed to carry a win condition now.
 */
import React from 'react';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import { VNHotZoneWinCondition } from '../../features/ui/types';
import { VNConditionOperator } from '../../types/shared';
import UIActionsListEditor, { ActionTargetableElement } from './UIActionsListEditor';

interface WinConditionEditorProps {
    winCondition: VNHotZoneWinCondition | undefined;
    project: VNProject;
    /** Elements that show up in ChangeImage / PlayAnimation target pickers (hot zone elements
     *  on the current screen). Pass an empty array if the screen has none. */
    targetableElements?: ActionTargetableElement[];
    onChange: (next: VNHotZoneWinCondition | undefined) => void;
}

const WinConditionEditor: React.FC<WinConditionEditorProps> = ({
    winCondition,
    project,
    targetableElements,
    onChange,
}) => {
    const update = (patch: Partial<VNHotZoneWinCondition>) => {
        const current = winCondition || { type: 'allPlaced' as const, actions: [] };
        onChange({ ...current, ...patch });
    };

    return (
        <div>
            <h4 className="text-xs font-bold text-amber-300 mb-1">Win Condition</h4>
            <select
                value={winCondition?.type || ''}
                onChange={e => {
                    if (!e.target.value) { onChange(undefined); return; }
                    update({ type: e.target.value as 'allPlaced' | 'variable' });
                }}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-xs"
            >
                <option value="">None</option>
                <option value="allPlaced">All Elements Placed</option>
                <option value="variable">Variable Check</option>
            </select>
            {winCondition?.type === 'variable' && (
                <div className="mt-1 space-y-1">
                    <select
                        value={winCondition.variableId || ''}
                        onChange={e => update({ variableId: e.target.value as VNID })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                    >
                        <option value="">-- Variable --</option>
                        {Object.values(project.variables).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <select
                        value={winCondition.operator || '=='}
                        onChange={e => update({ operator: e.target.value as VNConditionOperator })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                    >
                        <option value="==">==</option>
                        <option value="!=">!=</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="is true">is true</option>
                        <option value="is false">is false</option>
                    </select>
                    {winCondition.operator !== 'is true' && winCondition.operator !== 'is false' && (
                        <input
                            type="text"
                            value={String(winCondition.value ?? '')}
                            placeholder="Value..."
                            onChange={e => update({ value: e.target.value })}
                            className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                        />
                    )}
                </div>
            )}
            {winCondition && (
                <div className="mt-2">
                    <UIActionsListEditor
                        actions={winCondition.actions}
                        project={project}
                        targetableElements={targetableElements}
                        onChange={actions => update({ actions })}
                        label="Win Actions"
                    />
                </div>
            )}
        </div>
    );
};

export default WinConditionEditor;
