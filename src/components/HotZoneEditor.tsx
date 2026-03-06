/**
 * HotZoneEditor — Visual editor for Hot Zone screen types.
 * 
 * Hot Zone screens allow interactive drag-and-drop gameplay elements:
 * - Draggable elements (images that players can move around)
 * - Hot Spots (trigger zones for click, hover, or drag-drop interactions)
 * - Win conditions (all placed, variable checks)
 * - Actions on trigger (set variable, change image, play animation, navigate)
 * - Conditions on elements and hot spots (variable-based visibility)
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { VNID } from '../types';
import { VNProject } from '../types/project';
import {
    VNUIScreen,
    VNHotSpot,
    VNHotZoneElement,
    VNHotZoneWinCondition,
    HotSpotTrigger,
    HotSpotShape,
    HotZoneElementType,
    VNFontSettings,
} from '../features/ui/types';
import { VNUIAction, UIActionType, VNCondition, VNConditionOperator } from '../types/shared';
import { VNVariable, VNVariableType, VNSetVariableOperator } from '../features/variables/types';
import { useProject } from '../contexts/ProjectContext';
import Panel from './ui/Panel';
import ResizableDraggable from './menu-editor/ResizableDraggable';
import { PlusIcon, TrashIcon, PhotoIcon, SparklesIcon } from './icons';

const generateId = (prefix: string): VNID =>
    `${prefix}-${Math.random().toString(36).substring(2, 9)}` as VNID;

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

/** Conditions editor matching PropertiesInspector pattern */
const HZConditionsEditor: React.FC<{
    conditions: VNCondition[] | undefined;
    project: VNProject;
    onChange: (conditions: VNCondition[] | undefined) => void;
}> = ({ conditions, project, onChange }) => {
    const hasVariables = Object.keys(project.variables).length > 0;

    const getOperatorsForType = (type: VNVariableType | undefined): VNConditionOperator[] => {
        switch (type) {
            case 'string': return ['==', '!=', 'contains', 'startsWith'];
            case 'number': return ['==', '!=', '>', '<', '>=', '<='];
            case 'boolean': return ['is true', 'is false'];
            default: return ['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith'];
        }
    };

    const addCondition = () => {
        const firstVarId = Object.keys(project.variables)[0];
        if (!firstVarId) return;
        onChange([...(conditions || []), { variableId: firstVarId as VNID, operator: '==', value: '' }]);
    };

    const updateCondition = (index: number, updates: Partial<VNCondition>) => {
        const next = [...(conditions || [])];
        next[index] = { ...next[index], ...updates };
        if (updates.variableId) {
            const variable = project.variables[updates.variableId];
            next[index].operator = getOperatorsForType(variable?.type)[0];
        }
        if (updates.operator) {
            const variable = project.variables[next[index].variableId];
            const allowed = getOperatorsForType(variable?.type);
            if (!allowed.includes(updates.operator)) next[index].operator = allowed[0];
        }
        onChange(next);
    };

    const removeCondition = (index: number) => {
        const next = (conditions || []).filter((_, i) => i !== index);
        onChange(next.length === 0 ? undefined : next);
    };

    if (!hasVariables) {
        return <p className="text-[10px] text-[var(--text-muted)] italic">No variables defined.</p>;
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Conditions</span>
                <button onClick={addCondition} className="text-sky-400 hover:text-sky-300 text-xs flex items-center gap-0.5">
                    <PlusIcon className="w-3 h-3" /> Add
                </button>
            </div>
            {(!conditions || conditions.length === 0) && (
                <p className="text-[10px] text-slate-500 italic">Always visible (no conditions)</p>
            )}
            {(conditions || []).map((cond, i) => {
                const variable = project.variables[cond.variableId];
                const operators = getOperatorsForType(variable?.type);
                const hideValue = cond.operator === 'is true' || cond.operator === 'is false';

                return (
                    <div key={i} className="p-1.5 mb-1 border border-[var(--border-subtle)] rounded space-y-1">
                        <div className="flex items-center gap-1">
                            <select
                                value={cond.variableId}
                                onChange={e => updateCondition(i, { variableId: e.target.value as VNID })}
                                className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                            >
                                {Object.values(project.variables).map((v: VNVariable) => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                            <button onClick={() => removeCondition(i)} className="text-red-400 hover:text-red-300 p-0.5">
                                <TrashIcon className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="flex gap-1">
                            <select
                                value={cond.operator}
                                onChange={e => updateCondition(i, { operator: e.target.value as VNConditionOperator })}
                                className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                            >
                                {operators.map(op => <option key={op} value={op}>{op}</option>)}
                            </select>
                            {!hideValue && (
                                variable?.type === 'boolean' ? (
                                    <select
                                        value={String(cond.value)}
                                        onChange={e => updateCondition(i, { value: e.target.value === 'true' })}
                                        className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                                    >
                                        <option value="true">True</option>
                                        <option value="false">False</option>
                                    </select>
                                ) : (
                                    <input
                                        type={variable?.type === 'number' ? 'number' : 'text'}
                                        value={String(cond.value ?? '')}
                                        onChange={e => updateCondition(i, { value: variable?.type === 'number' ? Number(e.target.value) : e.target.value })}
                                        className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                                        placeholder="Value..."
                                    />
                                )
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

/** Full-featured actions list editor with inline detail editors for all action types */
const HZActionsEditor: React.FC<{
    actions: VNUIAction[];
    project: VNProject;
    hotZoneElements?: Record<VNID, VNHotZoneElement>;
    onChange: (actions: VNUIAction[]) => void;
    label?: string;
}> = ({ actions, project, hotZoneElements, onChange, label = 'Actions' }) => {
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

    /** Render inline detail editor for a specific action */
    const renderDetails = (action: VNUIAction, index: number) => {
        const a = action as any;
        const inputCls = "w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]";

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
                const targetChoices = hotZoneElements ? Object.values(hotZoneElements) as VNHotZoneElement[] : [];
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
                const targetChoices = hotZoneElements ? Object.values(hotZoneElements) as VNHotZoneElement[] : [];
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

    // Friendly labels for action types
    const actionLabels: Record<string, string> = {
        [UIActionType.None]: '(No Action)',
        [UIActionType.StartNewGame]: 'Start New Game',
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
                                <option key={t} value={t}>{actionLabels[t] || t}</option>
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

/* ------------------------------------------------------------------ */
/*  Canvas Overlays                                                    */
/* ------------------------------------------------------------------ */

/** Renders a Hot Spot overlay on the canvas */
const HotSpotOverlay: React.FC<{
    spot: VNHotSpot;
    isSelected: boolean;
    parentSize: { width: number; height: number };
    onSelect: (e: React.MouseEvent) => void;
    onUpdate: (updates: { x?: number; y?: number; width?: number; height?: number }) => void;
}> = ({ spot, isSelected, parentSize, onSelect, onUpdate }) => {
    const triggerColors: Record<HotSpotTrigger, string> = {
        click: 'rgba(59, 130, 246, 0.3)',
        hover: 'rgba(234, 179, 8, 0.3)',
        'drag-drop': 'rgba(34, 197, 94, 0.3)',
    };
    const borderColors: Record<HotSpotTrigger, string> = {
        click: 'rgb(59, 130, 246)',
        hover: 'rgb(234, 179, 8)',
        'drag-drop': 'rgb(34, 197, 94)',
    };

    return (
        <ResizableDraggable
            x={spot.x}
            y={spot.y}
            width={spot.width}
            height={spot.height}
            parentSize={parentSize}
            isSelected={isSelected}
            onSelect={onSelect}
            onUpdate={onUpdate}
            snapGrid={1}
        >
            <div
                className="w-full h-full flex items-center justify-center text-xs font-bold"
                style={{
                    backgroundColor: triggerColors[spot.trigger],
                    border: `2px dashed ${borderColors[spot.trigger]}`,
                    borderRadius: spot.shape === 'circle' ? '50%' : '4px',
                    color: borderColors[spot.trigger],
                }}
            >
                {spot.name}
            </div>
        </ResizableDraggable>
    );
};

/** Renders a Hot Zone element (draggable image) on the canvas */
const HotZoneElementOverlay: React.FC<{
    element: VNHotZoneElement;
    project: VNProject;
    isSelected: boolean;
    parentSize: { width: number; height: number };
    onSelect: (e: React.MouseEvent) => void;
    onUpdate: (updates: { x?: number; y?: number; width?: number; height?: number }) => void;
}> = ({ element, project, isSelected, parentSize, onSelect, onUpdate }) => {
    const imageUrl = project.images[element.imageId]?.imageUrl ||
                     project.backgrounds[element.imageId]?.imageUrl;

    const elType = element.elementType || 'image';
    const videoUrl = element.videoId ? (project.videos[element.videoId]?.videoUrl) : null;
    return (
        <ResizableDraggable
            x={element.x}
            y={element.y}
            width={element.width}
            height={element.height}
            parentSize={parentSize}
            isSelected={isSelected}
            onSelect={onSelect}
            onUpdate={onUpdate}
            snapGrid={1}
        >
            <div className="w-full h-full relative">
                {elType === 'text' ? (
                    <div className="w-full h-full flex items-center justify-center text-white text-sm"
                        style={element.font ? { fontFamily: element.font.family, fontSize: element.font.size, fontWeight: element.font.weight, fontStyle: element.font.italic ? 'italic' : 'normal', color: element.font.color || '#fff' } : {}}>
                        {element.text || element.name}
                    </div>
                ) : elType === 'button' ? (
                    <div className="w-full h-full relative flex items-center justify-center rounded" style={{ backgroundColor: element.backgroundColor || '#4D3273' }}>
                        {imageUrl && <img src={imageUrl} alt={element.name} className="absolute inset-0 w-full h-full object-fill rounded" />}
                        <span className="relative z-10 text-white text-sm font-semibold"
                            style={element.font ? { fontFamily: element.font.family, fontSize: element.font.size, color: element.font.color || '#fff' } : {}}>
                            {element.text || element.name}
                        </span>
                    </div>
                ) : elType === 'video' ? (
                    videoUrl ? (
                        <video src={videoUrl} className="w-full h-full object-contain" muted autoPlay loop={element.videoLoop ?? true} />
                    ) : (
                        <div className="w-full h-full bg-indigo-500/30 border-2 border-indigo-400 border-dashed rounded flex items-center justify-center text-xs text-indigo-300">
                            {element.name} (no video)
                        </div>
                    )
                ) : elType === 'textInput' ? (
                    <div className="w-full h-full flex items-center gap-0">
                        <div className="flex-1 h-full rounded-l px-2 flex items-center text-xs min-w-0"
                            style={{
                                backgroundColor: element.backgroundColor || '#1e293b',
                                border: `1px solid ${element.borderColor || '#475569'}`,
                                borderRight: 'none',
                                color: element.font?.color || '#94a3b8',
                                fontFamily: element.font?.family,
                                fontSize: element.font?.size,
                            }}>
                            {element.placeholder || 'Text input...'}
                        </div>
                        <div className="h-full px-2 rounded-r text-xs font-semibold flex items-center justify-center shrink-0"
                            style={{
                                backgroundColor: element.borderColor || '#475569',
                                color: '#fff',
                                border: `1px solid ${element.borderColor || '#475569'}`,
                            }}>
                            &#x2713;
                        </div>
                    </div>
                ) : imageUrl ? (
                    <img src={imageUrl} alt={element.name} className="w-full h-full object-contain" />
                ) : (
                    <div className="w-full h-full bg-purple-500/30 border-2 border-purple-400 border-dashed rounded flex items-center justify-center text-xs text-purple-300">
                        {element.name}
                    </div>
                )}
                {element.draggable && (
                    <div className="absolute top-0 right-0 bg-sky-500/80 text-white text-[8px] px-1 rounded-bl">
                        Drag
                    </div>
                )}
                {element.conditions && element.conditions.length > 0 && (
                    <div className="absolute top-0 left-0 bg-amber-500/80 text-white text-[8px] px-1 rounded-br">
                        IF
                    </div>
                )}
            </div>
        </ResizableDraggable>
    );
};

/* ------------------------------------------------------------------ */
/*  Properties Panels                                                  */
/* ------------------------------------------------------------------ */

const HotSpotProperties: React.FC<{
    spot: VNHotSpot;
    project: VNProject;
    hotZoneElements: Record<VNID, VNHotZoneElement>;
    onUpdate: (updates: Partial<VNHotSpot>) => void;
}> = ({ spot, project, hotZoneElements, onUpdate }) => {
    return (
        <div className="space-y-3 text-sm">
            <h4 className="font-bold text-sky-300 flex items-center gap-2">
                Hot Spot Properties
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">
                    {spot.trigger}
                </span>
            </h4>
            
            <label className="block">
                <span className="text-[var(--text-secondary)] text-xs">Name</span>
                <input
                    type="text"
                    value={spot.name}
                    onChange={e => onUpdate({ name: e.target.value })}
                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                />
            </label>

            <div className="grid grid-cols-2 gap-2">
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">Shape</span>
                    <select
                        value={spot.shape}
                        onChange={e => onUpdate({ shape: e.target.value as HotSpotShape })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="rect">Rectangle</option>
                        <option value="circle">Circle</option>
                    </select>
                </label>
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">Trigger</span>
                    <select
                        value={spot.trigger}
                        onChange={e => onUpdate({ trigger: e.target.value as HotSpotTrigger })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="click">Click</option>
                        <option value="hover">Hover</option>
                        <option value="drag-drop">Drag & Drop</option>
                    </select>
                </label>
            </div>

            {spot.trigger === 'drag-drop' && (
                <div>
                    <span className="text-[var(--text-secondary)] text-xs font-semibold">Accepted Elements</span>
                    <p className="text-[10px] text-[var(--text-muted)] mb-1">Which elements can be dropped here?</p>
                    <div className="mt-0.5 space-y-0.5 max-h-28 overflow-y-auto">
                        {(Object.values(hotZoneElements) as VNHotZoneElement[]).map(el => {
                            const isAccepted = spot.acceptedElementIds?.includes(el.id) ?? false;
                            return (
                                <label key={el.id} className="flex items-center gap-2 text-[10px] px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)]">
                                    <input
                                        type="checkbox"
                                        checked={isAccepted}
                                        onChange={() => {
                                            const current = spot.acceptedElementIds || [];
                                            const next = isAccepted
                                                ? current.filter(id => id !== el.id)
                                                : [...current, el.id];
                                            onUpdate({ acceptedElementIds: next });
                                        }}
                                    />
                                    <span className={isAccepted ? 'text-green-300' : 'text-[var(--text-secondary)]'}>{el.name}</span>
                                </label>
                            );
                        })}
                        {Object.keys(hotZoneElements).length === 0 && (
                            <p className="text-[10px] text-slate-500 italic">No elements added yet</p>
                        )}
                    </div>
                </div>
            )}

            <div className="flex gap-2">
                <label className="block flex-1">
                    <span className="text-[var(--text-secondary)] text-xs">Highlight Color</span>
                    <input
                        type="color"
                        value={spot.highlightColor || '#3b82f6'}
                        onChange={e => onUpdate({ highlightColor: e.target.value })}
                        className="w-full mt-0.5 h-7 bg-transparent border border-[var(--border-default)] rounded cursor-pointer"
                    />
                </label>
                <label className="flex items-end gap-1.5 pb-0.5">
                    <input
                        type="checkbox"
                        checked={spot.visible ?? false}
                        onChange={e => onUpdate({ visible: e.target.checked })}
                    />
                    <span className="text-[var(--text-secondary)] text-xs">Visible</span>
                </label>
            </div>

            {/* Position fields */}
            <div>
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Position & Size</span>
                <div className="grid grid-cols-4 gap-1 mt-0.5">
                    {(['x', 'y', 'width', 'height'] as const).map(field => (
                        <label key={field} className="block">
                            <span className="text-[var(--text-muted)] text-[10px] uppercase">{field[0].toUpperCase()}</span>
                            <input type="number" value={spot[field]} step={0.1} min={field === 'width' || field === 'height' ? 1 : undefined}
                                onChange={e => onUpdate({ [field]: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                            />
                        </label>
                    ))}
                </div>
            </div>

            <hr className="border-[var(--border-subtle)]" />

            {/* Conditions */}
            <HZConditionsEditor
                conditions={spot.conditions}
                project={project}
                onChange={conditions => onUpdate({ conditions })}
            />

            <hr className="border-[var(--border-subtle)]" />

            {/* Actions */}
            <HZActionsEditor
                actions={spot.actions}
                project={project}
                hotZoneElements={hotZoneElements}
                onChange={actions => onUpdate({ actions })}
                label="Trigger Actions"
            />
        </div>
    );
};

const HotZoneElementProperties: React.FC<{
    element: VNHotZoneElement;
    project: VNProject;
    hotZoneElements: Record<VNID, VNHotZoneElement>;
    onUpdate: (updates: Partial<VNHotZoneElement>) => void;
}> = ({ element, project, hotZoneElements, onUpdate }) => {
    const imageAssets = useMemo(() =>
        Object.values(project.images).concat(Object.values(project.backgrounds) as any[]),
        [project.images, project.backgrounds]
    );
    const audioAssets = useMemo(() => Object.values(project.audio), [project.audio]);

    const elType = element.elementType || 'image';
    const defaultFont: VNFontSettings = { family: 'sans-serif', size: 16, color: '#ffffff', weight: 'normal', italic: false };

    return (
        <div className="space-y-3 text-sm">
            <h4 className="font-bold text-purple-300 flex items-center gap-2">
                Element Properties
                {element.draggable && (
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        draggable
                    </span>
                )}
            </h4>
            
            <label className="block">
                <span className="text-[var(--text-secondary)] text-xs">Name</span>
                <input
                    type="text"
                    value={element.name}
                    onChange={e => onUpdate({ name: e.target.value })}
                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                />
            </label>

            {/* Element Type */}
            <label className="block">
                <span className="text-[var(--text-secondary)] text-xs">Element Type</span>
                <select
                    value={elType}
                    onChange={e => onUpdate({ elementType: e.target.value as HotZoneElementType })}
                    className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                >
                    <option value="image">Image</option>
                    <option value="text">Text</option>
                    <option value="button">Button</option>
                    <option value="video">Video</option>
                    <option value="textInput">Text Input</option>
                </select>
            </label>

            {/* Image selector (for image and button types) */}
            {(elType === 'image' || elType === 'button') && (
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">{elType === 'button' ? 'Background Image' : 'Image Asset'}</span>
                    <select
                        value={element.imageId}
                        onChange={e => onUpdate({ imageId: e.target.value as VNID })}
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    >
                        <option value="">-- Select Image --</option>
                        {imageAssets.map((img: any) => (
                            <option key={img.id} value={img.id}>{img.name || img.id}</option>
                        ))}
                    </select>
                </label>
            )}

            {/* Video selector (for video type) */}
            {elType === 'video' && (
                <>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">Video Asset</span>
                        <select
                            value={element.videoId || ''}
                            onChange={e => onUpdate({ videoId: e.target.value as VNID })}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        >
                            <option value="">-- Select Video --</option>
                            {Object.values(project.videos).map((v: any) => (
                                <option key={v.id} value={v.id}>{v.name || v.id}</option>
                            ))}
                        </select>
                    </label>
                    <div className="flex gap-3">
                        <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                            <input type="checkbox" checked={element.videoLoop ?? true}
                                onChange={e => onUpdate({ videoLoop: e.target.checked })} />
                            Loop
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                            <input type="checkbox" checked={element.videoMuted ?? true}
                                onChange={e => onUpdate({ videoMuted: e.target.checked })} />
                            Muted
                        </label>
                    </div>
                </>
            )}

            {/* Text Input settings */}
            {elType === 'textInput' && (
                <>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">Bind to Variable</span>
                        <select
                            value={element.variableId || ''}
                            onChange={e => onUpdate({ variableId: e.target.value as VNID })}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        >
                            <option value="">-- Select Variable --</option>
                            {Object.values(project.variables).map((v: any) => (
                                <option key={v.id} value={v.id}>{v.name} ({v.type})</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">Placeholder</span>
                        <input
                            type="text"
                            value={element.placeholder || ''}
                            onChange={e => onUpdate({ placeholder: e.target.value })}
                            placeholder="Enter text..."
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        />
                    </label>
                    <label className="block">
                        <span className="text-[var(--text-secondary)] text-xs">Max Length</span>
                        <input
                            type="number"
                            value={element.maxLength || ''}
                            onChange={e => onUpdate({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
                            placeholder="No limit"
                            min={1}
                            className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                        />
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                        <label className="block">
                            <span className="text-[var(--text-muted)] text-[10px]">Background</span>
                            <input type="color" value={element.backgroundColor || '#1e293b'}
                                onChange={e => onUpdate({ backgroundColor: e.target.value })}
                                className="w-full h-6 bg-transparent border border-[var(--border-default)] rounded cursor-pointer" />
                        </label>
                        <label className="block">
                            <span className="text-[var(--text-muted)] text-[10px]">Border</span>
                            <input type="color" value={element.borderColor || '#475569'}
                                onChange={e => onUpdate({ borderColor: e.target.value })}
                                className="w-full h-6 bg-transparent border border-[var(--border-default)] rounded cursor-pointer" />
                        </label>
                    </div>
                </>
            )}

            {/* Text field (for text and button types) */}
            {(elType === 'text' || elType === 'button') && (
                <label className="block">
                    <span className="text-[var(--text-secondary)] text-xs">Text</span>
                    <input
                        type="text"
                        value={element.text || ''}
                        onChange={e => onUpdate({ text: e.target.value })}
                        placeholder="Display text..."
                        className="w-full mt-0.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-2 py-1 text-white text-xs"
                    />
                </label>
            )}

            {/* Font settings (for text, button, and textInput types) */}
            {(elType === 'text' || elType === 'button' || elType === 'textInput') && (() => {
                const font = element.font || defaultFont;
                const updateFont = (updates: Partial<VNFontSettings>) => onUpdate({ font: { ...font, ...updates } });
                return (
                    <div className="space-y-1">
                        <span className="text-[var(--text-secondary)] text-xs font-semibold">Font</span>
                        <div className="grid grid-cols-2 gap-1">
                            <input type="number" value={font.size} min={8} max={120}
                                onChange={e => updateFont({ size: Number(e.target.value) })}
                                className="bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                                title="Font size"
                            />
                            <input type="color" value={font.color}
                                onChange={e => updateFont({ color: e.target.value })}
                                className="h-6 bg-transparent border border-[var(--border-default)] rounded cursor-pointer"
                                title="Text color"
                            />
                        </div>
                        <div className="flex gap-2">
                            <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                                <input type="checkbox" checked={font.weight === 'bold'} onChange={e => updateFont({ weight: e.target.checked ? 'bold' : 'normal' })} />
                                Bold
                            </label>
                            <label className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                                <input type="checkbox" checked={font.italic} onChange={e => updateFont({ italic: e.target.checked })} />
                                Italic
                            </label>
                        </div>
                    </div>
                );
            })()}

            {/* Sounds */}
            <div className="space-y-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Sounds</span>
                <label className="block">
                    <span className="text-[var(--text-muted)] text-[10px]">Click Sound</span>
                    <select
                        value={element.clickSoundId || ''}
                        onChange={e => onUpdate({ clickSoundId: (e.target.value || null) as VNID | null })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                    >
                        <option value="">None</option>
                        {audioAssets.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-[var(--text-muted)] text-[10px]">Hover Sound</span>
                    <select
                        value={element.hoverSoundId || ''}
                        onChange={e => onUpdate({ hoverSoundId: (e.target.value || null) as VNID | null })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                    >
                        <option value="">None</option>
                        {audioAssets.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                    </select>
                </label>
            </div>

            {/* Behavior toggles */}
            <div className="space-y-1">
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Behavior</span>
                <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)]">
                    <input
                        type="checkbox"
                        checked={element.draggable ?? false}
                        onChange={e => onUpdate({ draggable: e.target.checked })}
                    />
                    <span className="text-[var(--text-secondary)]">Draggable by player</span>
                </label>

                {element.draggable && (
                    <>
                        <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] ml-3">
                            <input
                                type="checkbox"
                                checked={element.snapBack ?? false}
                                onChange={e => onUpdate({ snapBack: e.target.checked })}
                            />
                            <span className="text-[var(--text-secondary)]">Snap back if not on hot spot</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] ml-3">
                            <input
                                type="checkbox"
                                checked={element.snapToHotSpot ?? false}
                                onChange={e => onUpdate({ snapToHotSpot: e.target.checked })}
                            />
                            <span className="text-[var(--text-secondary)]">Snap to hot spot center</span>
                        </label>
                    </>
                )}
            </div>

            {/* Position fields */}
            <div>
                <span className="text-[var(--text-secondary)] text-xs font-semibold">Position & Size</span>
                <div className="grid grid-cols-4 gap-1 mt-0.5">
                    {(['x', 'y', 'width', 'height'] as const).map(field => (
                        <label key={field} className="block">
                            <span className="text-[var(--text-muted)] text-[10px] uppercase">{field[0].toUpperCase()}</span>
                            <input type="number" value={element[field]} step={0.1} min={field === 'width' || field === 'height' ? 1 : undefined}
                                onChange={e => onUpdate({ [field]: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                            />
                        </label>
                    ))}
                </div>
            </div>

            <hr className="border-[var(--border-subtle)]" />

            {/* Conditions */}
            <HZConditionsEditor
                conditions={element.conditions}
                project={project}
                onChange={conditions => onUpdate({ conditions })}
            />

            <hr className="border-[var(--border-subtle)]" />

            {/* Actions */}
            <HZActionsEditor
                actions={element.actions || []}
                project={project}
                hotZoneElements={hotZoneElements}
                onChange={actions => onUpdate({ actions })}
                label={element.draggable ? 'Click Actions (non-drag)' : 'Click Actions'}
            />
        </div>
    );
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface HotZoneEditorProps {
    screenId: VNID;
}

const HotZoneEditor: React.FC<HotZoneEditorProps> = ({ screenId }) => {
    const { project, dispatch } = useProject();
    const screen = project.uiScreens[screenId];
    const stageRef = useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
    const [selectedId, setSelectedId] = useState<VNID | null>(null);
    const [selectedType, setSelectedType] = useState<'hotspot' | 'element' | null>(null);

    const hotSpots = useMemo(() => screen.hotSpots || {}, [screen.hotSpots]);
    const hotZoneElements = useMemo(() => screen.hotZoneElements || {}, [screen.hotZoneElements]);

    // Track stage size
    useEffect(() => {
        if (!stageRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
            }
        });
        observer.observe(stageRef.current);
        return () => observer.disconnect();
    }, []);

    const updateScreen = useCallback((updates: Partial<VNUIScreen>) => {
        dispatch({ type: 'UPDATE_UI_SCREEN', payload: { screenId: screen.id, updates } });
    }, [dispatch, screen.id]);

    // --- Hot Spot CRUD ---
    const addHotSpot = useCallback(() => {
        const id = generateId('hs');
        const newSpot: VNHotSpot = {
            id, name: `Hot Spot ${Object.keys(hotSpots).length + 1}`,
            shape: 'rect', x: 40, y: 40, width: 20, height: 20,
            trigger: 'click', actions: [],
        };
        updateScreen({ hotSpots: { ...hotSpots, [id]: newSpot } });
        setSelectedId(id);
        setSelectedType('hotspot');
    }, [hotSpots, updateScreen]);

    const updateHotSpot = useCallback((id: VNID, updates: Partial<VNHotSpot>) => {
        const spot = hotSpots[id];
        if (!spot) return;
        updateScreen({ hotSpots: { ...hotSpots, [id]: { ...spot, ...updates } } });
    }, [hotSpots, updateScreen]);

    const deleteHotSpot = useCallback((id: VNID) => {
        const next = { ...hotSpots };
        delete next[id];
        updateScreen({ hotSpots: next });
        if (selectedId === id) { setSelectedId(null); setSelectedType(null); }
    }, [hotSpots, updateScreen, selectedId]);

    // --- Element CRUD ---
    const addElement = useCallback(() => {
        const id = generateId('hze');
        const newEl: VNHotZoneElement = {
            id, name: `Element ${Object.keys(hotZoneElements).length + 1}`,
            imageId: '' as VNID, x: 10, y: 10, width: 10, height: 10,
            draggable: true, snapBack: true,
        };
        updateScreen({ hotZoneElements: { ...hotZoneElements, [id]: newEl } });
        setSelectedId(id);
        setSelectedType('element');
    }, [hotZoneElements, updateScreen]);

    const updateElement = useCallback((id: VNID, updates: Partial<VNHotZoneElement>) => {
        const el = hotZoneElements[id];
        if (!el) return;
        updateScreen({ hotZoneElements: { ...hotZoneElements, [id]: { ...el, ...updates } } });
    }, [hotZoneElements, updateScreen]);

    const deleteElement = useCallback((id: VNID) => {
        const next = { ...hotZoneElements };
        delete next[id];
        updateScreen({ hotZoneElements: next });
        if (selectedId === id) { setSelectedId(null); setSelectedType(null); }
    }, [hotZoneElements, updateScreen, selectedId]);

    // --- Win Condition ---
    const updateWinCondition = useCallback((updates: Partial<VNHotZoneWinCondition> | null) => {
        if (!updates) {
            updateScreen({ winCondition: undefined });
            return;
        }
        const current = screen.winCondition || { type: 'allPlaced' as const, actions: [] };
        updateScreen({ winCondition: { ...current, ...updates } });
    }, [screen.winCondition, updateScreen]);

    // Background
    const getBackground = (): React.CSSProperties => {
        if (screen.background.type === 'color') return { backgroundColor: screen.background.value };
        if (screen.background.assetId) {
            const url = screen.background.type === 'image'
                ? (project.images[screen.background.assetId]?.imageUrl || project.backgrounds[screen.background.assetId]?.imageUrl)
                : project.videos[screen.background.assetId]?.videoUrl;
            if (url) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
        }
        return {};
    };

    const selectedHotSpot = selectedType === 'hotspot' && selectedId ? hotSpots[selectedId] : null;
    const selectedElement = selectedType === 'element' && selectedId ? hotZoneElements[selectedId] : null;

    return (
        <div className="flex h-full gap-2 p-2">
            {/* Left sidebar - items list */}
            <div className="w-48 flex-shrink-0 flex flex-col bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                {/* Hot Spots list */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-2 border-b border-[var(--border-subtle)]">
                        <div className="flex items-center justify-between mb-1">
                            <h4 className="text-xs font-bold text-sky-300">Hot Spots</h4>
                            <button onClick={addHotSpot} className="text-sky-400 hover:text-sky-300" title="Add Hot Spot">
                                <PlusIcon className="w-4 h-4" />
                            </button>
                        </div>
                        {(Object.values(hotSpots) as VNHotSpot[]).map(spot => (
                            <div
                                key={spot.id}
                                className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-xs ${
                                    selectedId === spot.id ? 'bg-sky-500/20 text-sky-300' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                                }`}
                                onClick={() => { setSelectedId(spot.id); setSelectedType('hotspot'); }}
                            >
                                <span className="truncate flex items-center gap-1">
                                    {spot.name}
                                    {spot.conditions && spot.conditions.length > 0 && (
                                        <span className="text-[8px] bg-amber-500/30 text-amber-300 px-0.5 rounded">IF</span>
                                    )}
                                    <span className="text-[8px] text-[var(--text-muted)]">
                                        {spot.trigger === 'drag-drop' ? '⊞' : spot.trigger === 'hover' ? '◎' : '⊡'}
                                    </span>
                                </span>
                                <button onClick={e => { e.stopPropagation(); deleteHotSpot(spot.id); }} className="text-red-400 hover:text-red-300 ml-1">
                                    <TrashIcon className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                    {/* Elements list */}
                    <div className="p-2">
                        <div className="flex items-center justify-between mb-1">
                            <h4 className="text-xs font-bold text-purple-300">Elements</h4>
                            <button onClick={addElement} className="text-purple-400 hover:text-purple-300" title="Add Element">
                                <PlusIcon className="w-4 h-4" />
                            </button>
                        </div>
                        {(Object.values(hotZoneElements) as VNHotZoneElement[]).map(el => (
                            <div
                                key={el.id}
                                className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer text-xs ${
                                    selectedId === el.id ? 'bg-purple-500/20 text-purple-300' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                                }`}
                                onClick={() => { setSelectedId(el.id); setSelectedType('element'); }}
                            >
                                <span className="truncate flex items-center gap-1">
                                    {el.name}
                                    <span className="text-[8px] bg-purple-500/20 text-purple-300 px-0.5 rounded">
                                        {{ image: 'I', text: 'T', button: 'B', video: 'V', textInput: 'TI' }[el.elementType || 'image']}
                                    </span>
                                    {el.draggable && <span className="text-[8px] bg-sky-500/30 text-sky-300 px-0.5 rounded">D</span>}
                                    {el.conditions && el.conditions.length > 0 && (
                                        <span className="text-[8px] bg-amber-500/30 text-amber-300 px-0.5 rounded">IF</span>
                                    )}
                                </span>
                                <button onClick={e => { e.stopPropagation(); deleteElement(el.id); }} className="text-red-400 hover:text-red-300 ml-1">
                                    <TrashIcon className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Win Condition */}
                <div className="border-t border-[var(--border-subtle)] p-2">
                    <h4 className="text-xs font-bold text-amber-300 mb-1">Win Condition</h4>
                    <select
                        value={screen.winCondition?.type || ''}
                        onChange={e => {
                            if (!e.target.value) { updateWinCondition(null); return; }
                            updateWinCondition({ type: e.target.value as 'allPlaced' | 'variable' });
                        }}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-xs"
                    >
                        <option value="">None</option>
                        <option value="allPlaced">All Elements Placed</option>
                        <option value="variable">Variable Check</option>
                    </select>
                    {screen.winCondition?.type === 'variable' && (
                        <div className="mt-1 space-y-1">
                            <select
                                value={screen.winCondition.variableId || ''}
                                onChange={e => updateWinCondition({ variableId: e.target.value as VNID })}
                                className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                            >
                                <option value="">-- Variable --</option>
                                {Object.values(project.variables).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                            <select
                                value={screen.winCondition.operator || '=='}
                                onChange={e => updateWinCondition({ operator: e.target.value as VNConditionOperator })}
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
                            {screen.winCondition.operator !== 'is true' && screen.winCondition.operator !== 'is false' && (
                                <input
                                    type="text"
                                    value={String(screen.winCondition.value ?? '')}
                                    placeholder="Value..."
                                    onChange={e => updateWinCondition({ value: e.target.value })}
                                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded px-1 py-0.5 text-white text-[10px]"
                                />
                            )}
                        </div>
                    )}
                    {screen.winCondition && (
                        <div className="mt-2">
                            <HZActionsEditor
                                actions={screen.winCondition.actions}
                                project={project}
                                hotZoneElements={hotZoneElements}
                                onChange={actions => updateWinCondition({ actions })}
                                label="Win Actions"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 min-w-0">
                <Panel title={`Hot Zone: ${screen.name}`} className="h-full">
                    <div
                        ref={stageRef}
                        className="bg-slate-900/50 rounded-md relative overflow-hidden mx-auto"
                        onMouseDown={() => { setSelectedId(null); setSelectedType(null); }}
                        style={{
                            ...getBackground(),
                            aspectRatio: `${project.gameResolution?.width || 16} / ${project.gameResolution?.height || 9}`,
                            maxWidth: '100%',
                            maxHeight: '100%',
                            width: '100%',
                        }}
                    >
                        {stageSize.width > 0 && (
                            <>
                                {/* Render Hot Spots (below elements) */}
                                {(Object.values(hotSpots) as VNHotSpot[]).map(spot => (
                                    <HotSpotOverlay
                                        key={spot.id}
                                        spot={spot}
                                        isSelected={selectedId === spot.id}
                                        parentSize={stageSize}
                                        onSelect={(e) => { e.stopPropagation(); setSelectedId(spot.id); setSelectedType('hotspot'); }}
                                        onUpdate={updates => updateHotSpot(spot.id, updates)}
                                    />
                                ))}
                                {/* Render Elements (above hot spots) */}
                                {(Object.values(hotZoneElements) as VNHotZoneElement[]).map(el => (
                                    <HotZoneElementOverlay
                                        key={el.id}
                                        element={el}
                                        project={project}
                                        isSelected={selectedId === el.id}
                                        parentSize={stageSize}
                                        onSelect={(e) => { e.stopPropagation(); setSelectedId(el.id); setSelectedType('element'); }}
                                        onUpdate={updates => updateElement(el.id, updates)}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                </Panel>
            </div>

            {/* Right sidebar - properties */}
            <div className="w-64 flex-shrink-0 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg overflow-y-auto p-3">
                {selectedHotSpot ? (
                    <HotSpotProperties
                        spot={selectedHotSpot}
                        project={project}
                        hotZoneElements={hotZoneElements}
                        onUpdate={updates => updateHotSpot(selectedHotSpot.id, updates)}
                    />
                ) : selectedElement ? (
                    <HotZoneElementProperties
                        element={selectedElement}
                        project={project}
                        hotZoneElements={hotZoneElements}
                        onUpdate={updates => updateElement(selectedElement.id, updates)}
                    />
                ) : (
                    <div className="text-center text-[var(--text-secondary)] text-sm mt-8">
                        <SparklesIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>Select a hot spot or element to edit its properties</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HotZoneEditor;
