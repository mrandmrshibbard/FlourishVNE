/**
 * UIActionsListEditor
 * ───────────────────
 * Compact list editor for `VNUIAction[]` with inline detail editors per
 * action type. Extracted from the original `HZActionsEditor` inside
 * `HotZoneEditor.tsx` so it can be shared by the win-condition editor and
 * other places that edit action lists.
 */
import React from 'react';
import { VNID } from '../../types';
import { VNProject } from '../../types/project';
import {
    VNUIAction,
    UIActionType,
} from '../../types/shared';
import { VNVariable, VNSetVariableOperator } from '../../features/variables/types';
import { PlusIcon, TrashIcon } from '../icons';

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

const ACTION_LABELS: Record<string, string> = {
    [UIActionType.None]: '(No Action)',
    [UIActionType.StartNewGame]: 'Start New Game',
    [UIActionType.ContinueGame]: 'Continue Game',
    [UIActionType.GoToScreen]: 'Go To Screen',
    [UIActionType.LoadGame]: 'Load Game',
    [UIActionType.SaveGame]: 'Save Game',
    [UIActionType.ReturnToGame]: 'Return To Game',
    [UIActionType.ReturnToPreviousScreen]: 'Return To Previous Screen',
    [UIActionType.QuitToTitle]: 'Quit To Title',
    [UIActionType.ExitGame]: 'Exit Game',
    [UIActionType.JumpToScene]: 'Jump To Scene',
    [UIActionType.JumpToLabel]: 'Jump To Label',
    [UIActionType.SetVariable]: 'Set Variable',
    [UIActionType.CycleLayerAsset]: 'Cycle Layer Asset',
    [UIActionType.ToggleScreen]: 'Toggle Screen',
    [UIActionType.OpenURL]: 'Open URL',
    [UIActionType.PlayAnimation]: 'Play Animation',
    [UIActionType.ChangeImage]: 'Change Image',
    [UIActionType.ShowLog]: 'Show Log / History',
    [UIActionType.ToggleAutoAdvance]: 'Toggle Auto-Advance',
    [UIActionType.ToggleSkip]: 'Toggle Skip',
    [UIActionType.SkipBackward]: 'Skip Backward (Rewind)',
};

const UIActionsListEditor: React.FC<UIActionsListEditorProps> = ({
    actions,
    project,
    targetableElements,
    onChange,
    label = 'Actions',
}) => {
    const addAction = () => {
        onChange([...actions, { type: UIActionType.None }]);
    };

    const updateAction = (index: number, updates: Partial<VNUIAction>) => {
        const next = [...actions];
        next[index] = { ...next[index], ...updates } as VNUIAction;
        onChange(next);
    };

    const removeAction = (index: number) => {
        onChange(actions.filter((_, i) => i !== index));
    };

    const changeActionType = (index: number, newType: UIActionType) => {
        const defaults: Record<string, any> = {
            [UIActionType.SetVariable]: { variableId: '' as VNID, operator: 'set' as VNSetVariableOperator, value: '' },
            [UIActionType.GoToScreen]: { targetScreenId: '' as VNID },
            [UIActionType.JumpToScene]: { targetSceneId: '' as VNID },
            [UIActionType.JumpToLabel]: { targetLabel: '' },
            [UIActionType.ChangeImage]: { targetElementId: '' as VNID, newImageId: '' as VNID },
            [UIActionType.PlayAnimation]: { targetElementId: '' as VNID, animation: 'shake', duration: 500 },
            [UIActionType.ToggleScreen]: { targetScreenId: '' as VNID },
            [UIActionType.OpenURL]: { url: '', newTab: true },
            [UIActionType.LoadGame]: { slotNumber: 1 },
            [UIActionType.SaveGame]: { slotNumber: 1 },
        };
        const next = [...actions];
        next[index] = { type: newType, ...(defaults[newType] || {}) } as VNUIAction;
        onChange(next);
    };

    const renderDetails = (action: VNUIAction, index: number) => {
        const a = action as any;
        const inputCls = "w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]";
        const targetChoices = targetableElements || [];

        switch (action.type) {
            case UIActionType.SetVariable: {
                const variable = a.variableId ? project.variables[a.variableId] : null;
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30 space-y-1">
                        <select value={a.variableId || ''} onChange={e => updateAction(index, { variableId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">-- Variable --</option>
                            {Object.values(project.variables).map((v: VNVariable) => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                        </select>
                        <div className="flex gap-1">
                            <select value={a.operator || 'set'} onChange={e => updateAction(index, { operator: e.target.value as VNSetVariableOperator } as any)} className={inputCls}>
                                <option value="set">Set to</option>
                                <option value="add">Add</option>
                                <option value="subtract">Subtract</option>
                                <option value="random">Random</option>
                            </select>
                            {a.operator === 'random' ? (
                                <div className="flex gap-1 flex-1">
                                    <input type="number" value={a.randomMin ?? 0} placeholder="Min" onChange={e => updateAction(index, { randomMin: Number(e.target.value) } as any)} className={inputCls} />
                                    <input type="number" value={a.randomMax ?? 100} placeholder="Max" onChange={e => updateAction(index, { randomMax: Number(e.target.value) } as any)} className={inputCls} />
                                </div>
                            ) : variable?.type === 'boolean' ? (
                                <select value={String(a.value ?? '')} onChange={e => updateAction(index, { value: e.target.value === 'true' } as any)} className={inputCls}>
                                    <option value="true">True</option>
                                    <option value="false">False</option>
                                </select>
                            ) : (
                                <input
                                    type={variable?.type === 'number' ? 'number' : 'text'}
                                    value={String(a.value ?? '')}
                                    placeholder="Value"
                                    onChange={e => updateAction(index, { value: variable?.type === 'number' ? Number(e.target.value) : e.target.value } as any)}
                                    className={inputCls}
                                />
                            )}
                        </div>
                    </div>
                );
            }
            case UIActionType.GoToScreen:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <select value={a.targetScreenId || ''} onChange={e => updateAction(index, { targetScreenId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">-- Target Screen --</option>
                            {Object.values(project.uiScreens).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                );
            case UIActionType.ToggleScreen:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <select value={a.targetScreenId || ''} onChange={e => updateAction(index, { targetScreenId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">-- Target Screen --</option>
                            {Object.values(project.uiScreens).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                );
            case UIActionType.JumpToScene:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <select value={a.targetSceneId || ''} onChange={e => updateAction(index, { targetSceneId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">-- Target Scene --</option>
                            {Object.values(project.scenes).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                );
            case UIActionType.JumpToLabel:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <input type="text" value={a.targetLabel || ''} placeholder="Label name..."
                            onChange={e => updateAction(index, { targetLabel: e.target.value } as any)} className={inputCls} />
                    </div>
                );
            case UIActionType.OpenURL:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30 space-y-1">
                        <input type="text" value={a.url || ''} placeholder="https://..."
                            onChange={e => updateAction(index, { url: e.target.value } as any)} className={inputCls} />
                        <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                            <input type="checkbox" checked={a.newTab ?? true}
                                onChange={e => updateAction(index, { newTab: e.target.checked } as any)} />
                            Open in new tab
                        </label>
                    </div>
                );
            case UIActionType.PlayAnimation: {
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-purple-500/30 space-y-1">
                        <select value={a.targetElementId || ''} onChange={e => updateAction(index, { targetElementId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">-- Target Element --</option>
                            {targetChoices.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                        </select>
                        <div className="flex gap-1">
                            <select value={a.animation || 'shake'} onChange={e => updateAction(index, { animation: e.target.value } as any)} className={inputCls}>
                                <option value="shake">Shake</option>
                                <option value="bounce">Bounce</option>
                                <option value="pulse">Pulse</option>
                                <option value="spin">Spin</option>
                                <option value="fadeIn">Fade In</option>
                                <option value="fadeOut">Fade Out</option>
                                <option value="slideIn">Slide In</option>
                                <option value="glow">Glow</option>
                            </select>
                            <input type="number" value={a.duration ?? 500} min={100} step={100} placeholder="ms"
                                onChange={e => updateAction(index, { duration: Number(e.target.value) } as any)} className={inputCls} />
                        </div>
                    </div>
                );
            }
            case UIActionType.ChangeImage: {
                const imageAssets = Object.values(project.images).concat(Object.values(project.backgrounds) as any[]);
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-purple-500/30 space-y-1">
                        <select value={a.targetElementId || ''} onChange={e => updateAction(index, { targetElementId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">-- Target Element --</option>
                            {targetChoices.map(el => <option key={el.id} value={el.id}>{el.name}</option>)}
                        </select>
                        <select value={a.newImageId || ''} onChange={e => updateAction(index, { newImageId: e.target.value as VNID } as any)} className={inputCls}>
                            <option value="">-- New Image --</option>
                            {imageAssets.map((img: any) => <option key={img.id} value={img.id}>{img.name || img.id}</option>)}
                        </select>
                    </div>
                );
            }
            case UIActionType.SaveGame:
            case UIActionType.LoadGame:
                return (
                    <div className="ml-3 mt-1 mb-2 p-1.5 border-l-2 border-sky-500/30">
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-[var(--text-secondary)]">Slot:</span>
                            <input type="number" value={a.slotNumber ?? 1} min={1} max={99}
                                onChange={e => updateAction(index, { slotNumber: Number(e.target.value) } as any)} className={inputCls + ' w-16'} />
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">{label}</span>
                <button onClick={addAction} className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-0.5">
                    <PlusIcon className="w-3 h-3" /> Add
                </button>
            </div>
            {actions.length === 0 && (
                <p className="text-[10px] text-slate-500 italic">No actions configured</p>
            )}
            {actions.map((action, i) => (
                <React.Fragment key={i}>
                    <div className="flex items-center gap-1 mb-0.5">
                        <select
                            value={action.type}
                            onChange={e => changeActionType(i, e.target.value as UIActionType)}
                            className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                        >
                            {Object.values(UIActionType).map(t => (
                                <option key={t} value={t}>{ACTION_LABELS[t] || t}</option>
                            ))}
                        </select>
                        <button onClick={() => removeAction(i)} className="text-red-400 hover:text-red-300 p-0.5">
                            <TrashIcon className="w-3 h-3" />
                        </button>
                    </div>
                    {renderDetails(action, i)}
                </React.Fragment>
            ))}
        </div>
    );
};

export default UIActionsListEditor;
