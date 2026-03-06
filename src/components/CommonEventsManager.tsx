/**
 * Common Events Manager
 *
 * Full-page manager for creating, editing, and organising Common Events.
 * Common Events are reusable command sequences that can be invoked from
 * any scene via the "Call Common Event" command, run in parallel, or
 * execute automatically at scene start.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { VNCommonEvent, CommonEventParameter, CommonEventTrigger, createDefaultCommonEvent, createCommonEventParameter } from '../types/commonEvents';
import { CommandType, VNCommand } from '../features/scene/types';
import { VNID } from '../types';
import {
    PlusIcon, TrashIcon, PencilIcon, DuplicateIcon,
    ChevronDownIcon, ChevronRightIcon, SearchIcon,
    CommonEventsIcon, BoltIcon, GripVerticalIcon
} from './icons';
import { getCommandColor, COMMAND_CATEGORIES } from './CommandPalette';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const generateId = (): string => Math.random().toString(36).substring(2, 9);

const TRIGGER_LABELS: Record<CommonEventTrigger, { label: string; description: string; color: string }> = {
    called: {
        label: 'Called',
        description: 'Only runs when explicitly invoked via "Call Common Event" command',
        color: 'bg-purple-500/20 text-purple-300 border-purple-500/40'
    },
    parallel: {
        label: 'Parallel',
        description: 'Runs alongside the current scene automatically',
        color: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    },
    auto: {
        label: 'Auto-Run',
        description: 'Runs once automatically when the scene starts',
        color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    },
};

const formatCommandName = (type: string): string => {
    if (type === 'BranchStart') return 'Branch';
    return type.replace(/([A-Z])/g, ' $1').trim();
};

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface CommonEventsManagerProps {
    project: any;
}

const CommonEventsManager: React.FC<CommonEventsManagerProps> = ({ project }) => {
    const { dispatch } = useProject();
    const commonEvents = useMemo(
        () => Object.values(project.commonEvents || {}) as VNCommonEvent[],
        [project.commonEvents]
    );

    const [selectedEventId, setSelectedEventId] = useState<VNID | null>(commonEvents[0]?.id || null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [newEventName, setNewEventName] = useState('');
    const [renamingEventId, setRenamingEventId] = useState<VNID | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(['properties', 'parameters', 'commands'])
    );

    const selectedEvent = selectedEventId ? (project.commonEvents || {})[selectedEventId] as VNCommonEvent | undefined : undefined;

    const filteredEvents = useMemo(() => {
        if (!searchQuery) return commonEvents;
        const q = searchQuery.toLowerCase();
        return commonEvents.filter(
            e => e.name.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q)
        );
    }, [commonEvents, searchQuery]);

    /* ------------------------------------------------------------ */
    /*  CRUD handlers                                                */
    /* ------------------------------------------------------------ */

    const handleCreate = useCallback(() => {
        const name = newEventName.trim() || `Common Event ${commonEvents.length + 1}`;
        const ce = createDefaultCommonEvent(name);
        dispatch({ type: 'ADD_COMMON_EVENT', payload: { commonEvent: ce } });
        setSelectedEventId(ce.id);
        setNewEventName('');
        setShowNewDialog(false);
    }, [dispatch, newEventName, commonEvents.length]);

    const handleDelete = useCallback((id: VNID) => {
        if (!confirm('Delete this Common Event? Any "Call Common Event" commands referencing it will be cleared.')) return;
        dispatch({ type: 'DELETE_COMMON_EVENT', payload: { commonEventId: id } });
        if (selectedEventId === id) {
            const remaining = commonEvents.filter(e => e.id !== id);
            setSelectedEventId(remaining[0]?.id || null);
        }
    }, [dispatch, selectedEventId, commonEvents]);

    const handleDuplicate = useCallback((id: VNID) => {
        dispatch({ type: 'DUPLICATE_COMMON_EVENT', payload: { commonEventId: id } });
    }, [dispatch]);

    const handleRenameStart = useCallback((event: VNCommonEvent) => {
        setRenamingEventId(event.id);
        setRenameValue(event.name);
    }, []);

    const handleRenameConfirm = useCallback(() => {
        if (renamingEventId && renameValue.trim()) {
            dispatch({
                type: 'UPDATE_COMMON_EVENT',
                payload: { commonEventId: renamingEventId, updates: { name: renameValue.trim() } }
            });
        }
        setRenamingEventId(null);
        setRenameValue('');
    }, [dispatch, renamingEventId, renameValue]);

    /* ------------------------------------------------------------ */
    /*  Property handlers                                            */
    /* ------------------------------------------------------------ */

    const updateEvent = useCallback((updates: Partial<VNCommonEvent>) => {
        if (!selectedEventId) return;
        dispatch({ type: 'UPDATE_COMMON_EVENT', payload: { commonEventId: selectedEventId, updates } });
    }, [dispatch, selectedEventId]);

    /* ------------------------------------------------------------ */
    /*  Parameter handlers                                           */
    /* ------------------------------------------------------------ */

    const handleAddParam = useCallback(() => {
        if (!selectedEventId) return;
        const param = createCommonEventParameter(`param_${(selectedEvent?.parameters.length || 0) + 1}`);
        dispatch({ type: 'ADD_COMMON_EVENT_PARAMETER', payload: { commonEventId: selectedEventId, parameter: param } });
    }, [dispatch, selectedEventId, selectedEvent]);

    const handleUpdateParam = useCallback((paramId: VNID, updates: Partial<CommonEventParameter>) => {
        if (!selectedEventId) return;
        dispatch({ type: 'UPDATE_COMMON_EVENT_PARAMETER', payload: { commonEventId: selectedEventId, parameterId: paramId, updates } });
    }, [dispatch, selectedEventId]);

    const handleDeleteParam = useCallback((paramId: VNID) => {
        if (!selectedEventId) return;
        dispatch({ type: 'DELETE_COMMON_EVENT_PARAMETER', payload: { commonEventId: selectedEventId, parameterId: paramId } });
    }, [dispatch, selectedEventId]);

    /* ------------------------------------------------------------ */
    /*  Command handlers                                             */
    /* ------------------------------------------------------------ */

    const handleCommandDrop = useCallback((e: React.DragEvent, index?: number) => {
        e.preventDefault();
        setDragOverIndex(null);
        if (!selectedEventId) return;

        const commandType = e.dataTransfer.getData('application/vn-command-type') as CommandType;
        if (!commandType) return;

        const newCommand: any = {
            id: `cmd-${generateId()}`,
            type: commandType,
        };

        // Set default values based on command type
        switch (commandType) {
            case CommandType.Dialogue:
                newCommand.characterId = null;
                newCommand.text = '';
                break;
            case CommandType.Wait:
                newCommand.duration = 1;
                break;
            case CommandType.SetVariable:
                newCommand.variableId = '';
                newCommand.operator = 'set';
                newCommand.value = '';
                break;
            case CommandType.Jump:
                newCommand.targetSceneId = '';
                break;
            case CommandType.Label:
                newCommand.labelId = '';
                break;
            case CommandType.JumpToLabel:
                newCommand.labelId = '';
                break;
            case CommandType.SetBackground:
                newCommand.backgroundId = '';
                newCommand.transition = 'fade';
                newCommand.duration = 0.5;
                break;
            case CommandType.ShowCharacter:
                newCommand.characterId = '';
                newCommand.expressionId = '';
                newCommand.position = 'center';
                newCommand.transition = 'fade';
                newCommand.duration = 0.3;
                break;
            case CommandType.HideCharacter:
                newCommand.characterId = '';
                newCommand.transition = 'fade';
                newCommand.duration = 0.3;
                break;
            case CommandType.PlayMusic:
                newCommand.audioId = '';
                newCommand.loop = true;
                newCommand.volume = 1;
                break;
            case CommandType.StopMusic:
                newCommand.fadeDuration = 1;
                break;
            case CommandType.PlaySoundEffect:
                newCommand.audioId = '';
                newCommand.volume = 1;
                break;
            case CommandType.StopSoundEffect:
                break;
            case CommandType.CallCommonEvent:
                newCommand.commonEventId = '';
                newCommand.arguments = {};
                break;
            default:
                break;
        }

        dispatch({
            type: 'ADD_COMMON_EVENT_COMMAND',
            payload: { commonEventId: selectedEventId, command: newCommand, index }
        });
    }, [dispatch, selectedEventId]);

    const handleDeleteCommand = useCallback((index: number) => {
        if (!selectedEventId) return;
        dispatch({ type: 'DELETE_COMMON_EVENT_COMMAND', payload: { commonEventId: selectedEventId, commandIndex: index } });
    }, [dispatch, selectedEventId]);

    /* ------------------------------------------------------------ */
    /*  Section toggle                                               */
    /* ------------------------------------------------------------ */

    const toggleSection = (section: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    /* ------------------------------------------------------------ */
    /*  Render                                                       */
    /* ------------------------------------------------------------ */

    return (
        <div className="flex h-full overflow-hidden">
            {/* ─── Left sidebar: event list ─── */}
            <div
                className="w-72 flex-shrink-0 border-r flex flex-col"
                style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}
            >
                {/* Header */}
                <div className="p-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
                    <CommonEventsIcon className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Common Events</h2>
                    <span className="text-xs ml-auto px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-amber, #f59e0b)', color: '#fff' }}>
                        {commonEvents.length}
                    </span>
                </div>

                {/* Search */}
                <div className="px-2 py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="relative">
                        <SearchIcon className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search events..."
                            className="w-full pl-7 pr-2 py-1 rounded text-xs outline-none"
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                        />
                    </div>
                </div>

                {/* New button */}
                <div className="p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                        onClick={() => setShowNewDialog(true)}
                        className="w-full py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 font-bold transition-colors"
                        style={{ background: 'var(--accent-amber, #f59e0b)', color: '#fff' }}
                    >
                        <PlusIcon className="w-3 h-3" /> New Common Event
                    </button>
                </div>

                {/* New event dialog */}
                {showNewDialog && (
                    <div className="p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                        <input
                            type="text"
                            value={newEventName}
                            onChange={e => setNewEventName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            placeholder="Event name..."
                            className="w-full px-2 py-1 rounded text-xs outline-none ring-1 ring-amber-500 mb-1"
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                            autoFocus
                        />
                        <div className="flex gap-1">
                            <button onClick={handleCreate} className="flex-1 py-1 rounded text-xs text-white" style={{ background: 'var(--accent-amber, #f59e0b)' }}>Create</button>
                            <button onClick={() => setShowNewDialog(false)} className="flex-1 py-1 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Cancel</button>
                        </div>
                    </div>
                )}

                {/* Event list */}
                <div className="flex-1 overflow-y-auto">
                    {filteredEvents.length === 0 ? (
                        <div className="p-4 text-center">
                            <CommonEventsIcon className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {commonEvents.length === 0
                                    ? 'No Common Events yet.\nCreate one to build reusable command sequences.'
                                    : 'No matching events found.'}
                            </p>
                        </div>
                    ) : (
                        filteredEvents.map(event => {
                            const isSelected = selectedEventId === event.id;
                            const triggerInfo = TRIGGER_LABELS[event.trigger];

                            return (
                                <div
                                    key={event.id}
                                    onClick={() => setSelectedEventId(event.id)}
                                    className={`group relative flex flex-col gap-0.5 px-3 py-2 cursor-pointer transition-colors border-b ${
                                        isSelected
                                            ? 'bg-amber-500/15 border-amber-500/30'
                                            : 'hover:bg-white/5 border-transparent'
                                    }`}
                                    style={{ borderBottomColor: isSelected ? undefined : 'var(--border-subtle)' }}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${event.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                                        {renamingEventId === event.id ? (
                                            <input
                                                type="text"
                                                value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onBlur={handleRenameConfirm}
                                                onKeyDown={e => { if (e.key === 'Enter') handleRenameConfirm(); if (e.key === 'Escape') setRenamingEventId(null); }}
                                                className="flex-1 text-xs px-1 py-0.5 rounded outline-none ring-1 ring-amber-500"
                                                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                                                autoFocus
                                                onClick={e => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span className="text-xs flex-1 truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                                                {event.name}
                                            </span>
                                        )}
                                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={e => { e.stopPropagation(); handleRenameStart(event); }}
                                                className="p-0.5 rounded hover:bg-white/10"
                                                title="Rename"
                                            >
                                                <PencilIcon className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleDuplicate(event.id); }}
                                                className="p-0.5 rounded hover:bg-white/10"
                                                title="Duplicate"
                                            >
                                                <DuplicateIcon className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleDelete(event.id); }}
                                                className="p-0.5 rounded hover:bg-red-500/20"
                                                title="Delete"
                                            >
                                                <TrashIcon className="w-3 h-3 text-red-400" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 pl-3.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${triggerInfo.color}`}>
                                            {triggerInfo.label}
                                        </span>
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                            {event.commands.length} cmd{event.commands.length !== 1 ? 's' : ''}
                                        </span>
                                        {event.parameters.length > 0 && (
                                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                {event.parameters.length} param{event.parameters.length !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ─── Right panel: event editor ─── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                {selectedEvent ? (
                    <div className="flex-1 overflow-y-auto">
                        {/* Event header */}
                        <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                            <CommonEventsIcon className="w-5 h-5 text-amber-400" />
                            <div className="flex-1">
                                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedEvent.name}</h3>
                                {selectedEvent.description && (
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{selectedEvent.description}</p>
                                )}
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full border ${TRIGGER_LABELS[selectedEvent.trigger].color}`}>
                                {TRIGGER_LABELS[selectedEvent.trigger].label}
                            </span>
                        </div>

                        {/* ─── Properties section ─── */}
                        <div className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                            <button
                                onClick={() => toggleSection('properties')}
                                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors"
                            >
                                {expandedSections.has('properties') ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Properties</span>
                            </button>

                            {expandedSections.has('properties') && (
                                <div className="px-4 pb-3 space-y-2">
                                    {/* Name */}
                                    <div>
                                        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Name</label>
                                        <input
                                            type="text"
                                            value={selectedEvent.name}
                                            onChange={e => updateEvent({ name: e.target.value })}
                                            className="w-full px-2 py-1 rounded text-xs outline-none"
                                            style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                        />
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Description</label>
                                        <textarea
                                            value={selectedEvent.description || ''}
                                            onChange={e => updateEvent({ description: e.target.value })}
                                            placeholder="Optional description..."
                                            rows={2}
                                            className="w-full px-2 py-1 rounded text-xs outline-none resize-none"
                                            style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                        />
                                    </div>

                                    {/* Trigger */}
                                    <div>
                                        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: 'var(--text-secondary)' }}>Trigger</label>
                                        <select
                                            value={selectedEvent.trigger}
                                            onChange={e => updateEvent({ trigger: e.target.value as CommonEventTrigger })}
                                            className="w-full px-2 py-1 rounded text-xs outline-none"
                                            style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                        >
                                            {Object.entries(TRIGGER_LABELS).map(([value, info]) => (
                                                <option key={value} value={value}>{info.label} — {info.description}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Enabled toggle */}
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedEvent.enabled}
                                            onChange={e => updateEvent({ enabled: e.target.checked })}
                                            className="accent-amber-500"
                                        />
                                        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Enabled</label>
                                    </div>

                                    {/* Condition Variable (for parallel/auto) */}
                                    {(selectedEvent.trigger === 'parallel' || selectedEvent.trigger === 'auto') && (
                                        <div>
                                            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                                Condition Variable (optional)
                                            </label>
                                            <select
                                                value={selectedEvent.conditionVariableId || ''}
                                                onChange={e => updateEvent({ conditionVariableId: e.target.value || null })}
                                                className="w-full px-2 py-1 rounded text-xs outline-none"
                                                style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                            >
                                                <option value="">No condition (always run)</option>
                                                {Object.values(project.variables || {}).map((v: any) => (
                                                    <option key={v.id} value={v.id}>{v.name}</option>
                                                ))}
                                            </select>
                                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                When set, this event only fires when the variable is truthy.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ─── Parameters section (for called events) ─── */}
                        {selectedEvent.trigger === 'called' && (
                            <div className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                                <button
                                    onClick={() => toggleSection('parameters')}
                                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors"
                                >
                                    {expandedSections.has('parameters') ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                                    <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Parameters</span>
                                    <span className="text-[10px] ml-auto px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                                        {selectedEvent.parameters.length}
                                    </span>
                                </button>

                                {expandedSections.has('parameters') && (
                                    <div className="px-4 pb-3 space-y-2">
                                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                            Parameters allow callers to pass values when invoking this event. Use them inside commands via variable references.
                                        </p>

                                        {selectedEvent.parameters.map((param: CommonEventParameter) => (
                                            <div key={param.id} className="flex items-start gap-2 p-2 rounded" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}>
                                                <div className="flex-1 space-y-1">
                                                    <input
                                                        type="text"
                                                        value={param.name}
                                                        onChange={e => handleUpdateParam(param.id, { name: e.target.value })}
                                                        placeholder="Parameter name"
                                                        className="w-full px-1.5 py-0.5 rounded text-xs outline-none"
                                                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                                    />
                                                    <div className="flex gap-1">
                                                        <select
                                                            value={param.type}
                                                            onChange={e => handleUpdateParam(param.id, { type: e.target.value as 'string' | 'number' | 'boolean' })}
                                                            className="px-1.5 py-0.5 rounded text-[10px] outline-none"
                                                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                                        >
                                                            <option value="string">String</option>
                                                            <option value="number">Number</option>
                                                            <option value="boolean">Boolean</option>
                                                        </select>
                                                        <input
                                                            type="text"
                                                            value={String(param.defaultValue)}
                                                            onChange={e => handleUpdateParam(param.id, {
                                                                defaultValue: param.type === 'number'
                                                                    ? Number(e.target.value) || 0
                                                                    : param.type === 'boolean'
                                                                        ? e.target.value === 'true'
                                                                        : e.target.value
                                                            })}
                                                            placeholder="Default value"
                                                            className="flex-1 px-1.5 py-0.5 rounded text-[10px] outline-none"
                                                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteParam(param.id)}
                                                    className="p-1 rounded hover:bg-red-500/20 text-red-400"
                                                    title="Remove parameter"
                                                >
                                                    <TrashIcon className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}

                                        <button
                                            onClick={handleAddParam}
                                            className="w-full py-1 rounded text-xs flex items-center justify-center gap-1 transition-colors"
                                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px dashed var(--border-subtle)' }}
                                        >
                                            <PlusIcon className="w-3 h-3" /> Add Parameter
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── Commands section ─── */}
                        <div>
                            <button
                                onClick={() => toggleSection('commands')}
                                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors border-b"
                                style={{ borderColor: 'var(--border-subtle)' }}
                            >
                                {expandedSections.has('commands') ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Commands</span>
                                <span className="text-[10px] ml-auto px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                                    {selectedEvent.commands.length}
                                </span>
                            </button>

                            {expandedSections.has('commands') && (
                                <div className="px-4 py-3">
                                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                                        Drag commands from the Command Palette (visible on the Scenes tab) and drop them here, or use the quick-add buttons below.
                                    </p>

                                    {/* Command list */}
                                    <div
                                        className="min-h-[80px] rounded-lg p-2 space-y-1 mb-2 transition-colors"
                                        style={{
                                            background: dragOverIndex !== null ? 'rgba(245,158,11,0.1)' : 'var(--bg-primary)',
                                            border: `2px dashed ${dragOverIndex !== null ? 'var(--accent-amber, #f59e0b)' : 'var(--border-subtle)'}`,
                                        }}
                                        onDragOver={e => { e.preventDefault(); setDragOverIndex(-1); }}
                                        onDragLeave={() => setDragOverIndex(null)}
                                        onDrop={e => handleCommandDrop(e)}
                                    >
                                        {selectedEvent.commands.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-6">
                                                <BoltIcon className="w-6 h-6 mb-1" style={{ color: 'var(--text-muted)' }} />
                                                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                                                    Drop commands here or use quick-add below
                                                </p>
                                            </div>
                                        ) : (
                                            selectedEvent.commands.map((cmd: VNCommand, index: number) => {
                                                const colorClass = getCommandColor(cmd.type);
                                                return (
                                                    <div
                                                        key={cmd.id}
                                                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs border ${colorClass} group`}
                                                    >
                                                        <GripVerticalIcon className="w-3 h-3 flex-shrink-0 opacity-40" />
                                                        <span className="flex-1 truncate font-medium">
                                                            {formatCommandName(cmd.type)}
                                                            {cmd.type === CommandType.Dialogue && (cmd as any).text && (
                                                                <span className="ml-1 opacity-50 font-normal">"{(cmd as any).text.slice(0, 30)}{(cmd as any).text.length > 30 ? '…' : ''}"</span>
                                                            )}
                                                            {cmd.type === CommandType.Label && (cmd as any).labelId && (
                                                                <span className="ml-1 opacity-50 font-normal">({(cmd as any).labelId})</span>
                                                            )}
                                                            {cmd.type === CommandType.CallCommonEvent && (cmd as any).commonEventId && (
                                                                <span className="ml-1 opacity-50 font-normal">
                                                                    → {(project.commonEvents || {})[(cmd as any).commonEventId]?.name || 'Unknown'}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDeleteCommand(index)}
                                                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-opacity"
                                                            title="Remove command"
                                                        >
                                                            <TrashIcon className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Quick-add buttons */}
                                    <div className="flex flex-wrap gap-1">
                                        {[
                                            CommandType.Dialogue,
                                            CommandType.Wait,
                                            CommandType.SetVariable,
                                            CommandType.ShowCharacter,
                                            CommandType.HideCharacter,
                                            CommandType.SetBackground,
                                            CommandType.PlayMusic,
                                            CommandType.PlaySoundEffect,
                                            CommandType.Jump,
                                            CommandType.CallCommonEvent,
                                        ].map(cmdType => (
                                            <button
                                                key={cmdType}
                                                onClick={() => {
                                                    const fakeDropEvent = {
                                                        preventDefault: () => {},
                                                        dataTransfer: {
                                                            getData: () => cmdType,
                                                        },
                                                    } as any;
                                                    handleCommandDrop(fakeDropEvent);
                                                }}
                                                className={`px-2 py-0.5 rounded text-[10px] border ${getCommandColor(cmdType)} hover:opacity-80 transition-opacity`}
                                                title={`Add ${formatCommandName(cmdType)}`}
                                            >
                                                + {formatCommandName(cmdType)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <CommonEventsIcon className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                            <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Common Events</h3>
                            <p className="text-xs max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
                                {commonEvents.length === 0
                                    ? 'Create reusable command sequences that can be called from any scene. Common Events work like functions — author once, reuse everywhere.'
                                    : 'Select a Common Event from the sidebar to edit it.'}
                            </p>
                            {commonEvents.length === 0 && (
                                <button
                                    onClick={() => setShowNewDialog(true)}
                                    className="mt-3 px-4 py-1.5 rounded text-xs font-bold text-white transition-colors"
                                    style={{ background: 'var(--accent-amber, #f59e0b)' }}
                                >
                                    <PlusIcon className="w-3 h-3 inline mr-1" /> Create First Common Event
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommonEventsManager;
