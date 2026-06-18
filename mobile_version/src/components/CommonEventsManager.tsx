/**
 * Common Events Manager
 *
 * Full-page manager for creating, editing, and organising Common Events.
 * Common Events are reusable command sequences that can be invoked from
 * any scene via the "Call Common Event" command, run in parallel, or
 * execute automatically at scene start.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useProject } from '../contexts/ProjectContext';
import { VNCommonEvent, CommonEventTrigger, createDefaultCommonEvent } from '../types/commonEvents';
import { CommandType, VNCommand } from '../features/scene/types';
import { VNID } from '../types';
import {
    PlusIcon, TrashIcon, PencilIcon, DuplicateIcon,
    ChevronDownIcon, ChevronRightIcon, SearchIcon,
    CommonEventsIcon, BoltIcon, GripVerticalIcon
} from './icons';
import { getCommandColor, COMMAND_CATEGORIES } from './CommandPalette';
import { CommandGroupAccordion } from './inspector/CommandGroupFields';
import { useCommandDefaults, useChoiceActionNormalization } from './PropertiesInspector';

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

const formatCommandName = (type: string): string =>
    i18n.t(`commands:names.${type}`, { defaultValue: type.replace(/([A-Z])/g, ' $1').trim() });

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface CommonEventsManagerProps {
    project: any;
}

const CommonEventsManager: React.FC<CommonEventsManagerProps> = ({ project }) => {
    const { dispatch } = useProject();
    const { t } = useTranslation(['commonEvents', 'common']);
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
    const [selectedCommandIndex, setSelectedCommandIndex] = useState<number | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(['properties', 'commands'])
    );

    const selectedEvent = selectedEventId ? (project.commonEvents || {})[selectedEventId] as VNCommonEvent | undefined : undefined;

    // The command currently open for editing, and a writer that targets it in the reducer.
    const selectedCommand: VNCommand | undefined =
        (selectedEvent && selectedCommandIndex !== null) ? selectedEvent.commands[selectedCommandIndex] : undefined;
    const updateSelectedCommand = useCallback((updates: Partial<VNCommand>) => {
        if (!selectedEventId || selectedCommandIndex === null) return;
        dispatch({ type: 'UPDATE_COMMON_EVENT_COMMAND', payload: { commonEventId: selectedEventId, commandIndex: selectedCommandIndex, updates } });
    }, [dispatch, selectedEventId, selectedCommandIndex]);

    // Clear the open command editor whenever the selected event changes.
    React.useEffect(() => { setSelectedCommandIndex(null); }, [selectedEventId]);

    // Apply the same auto-defaults the scene inspector uses (e.g. select the first variable for a
    // new Set Variable so the number operators appear, first character for Show Character, etc.)
    // and normalize choice actions — so editing a CE command behaves exactly like a scene command.
    useCommandDefaults(selectedCommand, project, updateSelectedCommand);
    useChoiceActionNormalization(selectedCommand, project, updateSelectedCommand);

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
        const name = newEventName.trim() || t('defaultName', { n: commonEvents.length + 1 });
        const ce = createDefaultCommonEvent(name);
        dispatch({ type: 'ADD_COMMON_EVENT', payload: { commonEvent: ce } });
        setSelectedEventId(ce.id);
        setNewEventName('');
        setShowNewDialog(false);
    }, [dispatch, newEventName, commonEvents.length]);

    const handleDelete = useCallback((id: VNID) => {
        if (!confirm(t('deleteConfirm'))) return;
        dispatch({ type: 'DELETE_COMMON_EVENT', payload: { commonEventId: id } });
        if (selectedEventId === id) {
            const remaining = commonEvents.filter(e => e.id !== id);
            setSelectedEventId(remaining[0]?.id || null);
        }
    }, [dispatch, selectedEventId, commonEvents]);

    const handleDuplicate = useCallback((id: VNID) => {
        dispatch({ type: 'DUPLICATE_COMMON_EVENT', payload: { commonEventId: id } });
    }, [dispatch]);

    // ── Cross-project library: export all common events to a JSON file ──
    const handleExportLibrary = useCallback(() => {
        try {
            const payload = { flourishCommonEvents: commonEvents, exportedAt: new Date().toISOString() };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'common-events.json';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { console.error('[CommonEvents] export failed:', e); }
    }, [commonEvents]);

    // Import common events from a JSON file; each gets a fresh top-level id (internal
    // command/param ids are kept so in-event references stay intact). Note: commands that
    // reference project variables by id won't auto-resolve in a different project.
    const handleImportLibrary = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result || '{}'));
                const list: VNCommonEvent[] = Array.isArray(parsed) ? parsed : (parsed.flourishCommonEvents || []);
                // Pass 1: assign fresh ids and remember old→new so nested calls within this batch
                // keep pointing at the right (re-id'd) event.
                const idMap: Record<string, VNID> = {};
                const prepared = list.filter(ce => ce && ce.name).map(ce => {
                    const newId = `ce-${Math.random().toString(36).substring(2, 9)}` as VNID;
                    idMap[ce.id] = newId;
                    return { ...ce, id: newId };
                });
                // Pass 2: remap CallCommonEvent targets that reference another imported event.
                const remapCmds = (cmds: any[] | undefined): any[] =>
                    (cmds || []).map(c => (c && c.type === 'CallCommonEvent' && c.commonEventId && idMap[c.commonEventId])
                        ? { ...c, commonEventId: idMap[c.commonEventId] }
                        : c);
                const stamp = new Date().toISOString();
                let lastId: VNID | null = null;
                for (const ce of prepared) {
                    const fresh: VNCommonEvent = { ...ce, commands: remapCmds(ce.commands), createdAt: stamp, updatedAt: stamp };
                    dispatch({ type: 'ADD_COMMON_EVENT', payload: { commonEvent: fresh } });
                    lastId = fresh.id;
                }
                if (lastId) setSelectedEventId(lastId);
            } catch (err) {
                console.error('[CommonEvents] import failed:', err);
                alert('Import failed: invalid common-events file.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
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
        // Indices shift after a delete — clear the open editor to avoid editing the wrong command.
        setSelectedCommandIndex(null);
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
                    <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{t('title')}</h2>
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
                            placeholder={t('searchPlaceholder')}
                            className="w-full pl-7 pr-2 py-1 rounded text-xs outline-none"
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                        />
                    </div>
                </div>

                {/* New button + cross-project library import/export */}
                <div className="p-2 border-b space-y-1" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                        onClick={() => setShowNewDialog(true)}
                        className="w-full py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 font-bold transition-colors"
                        style={{ background: 'var(--accent-amber, #f59e0b)', color: '#fff' }}
                    >
                        <PlusIcon className="w-3 h-3" /> {t('newEvent')}
                    </button>
                    <div className="flex gap-1">
                        <button
                            onClick={handleExportLibrary}
                            disabled={commonEvents.length === 0}
                            className="flex-1 py-1 px-2 rounded text-[11px] bg-slate-700 hover:bg-slate-600 text-white transition-colors disabled:opacity-40"
                            title="Export all common events to a JSON file"
                        >
                            Export
                        </button>
                        <label className="flex-1 py-1 px-2 rounded text-[11px] bg-slate-700 hover:bg-slate-600 text-white transition-colors text-center cursor-pointer" title="Import common events from a JSON file">
                            Import
                            <input type="file" accept=".json" onChange={handleImportLibrary} className="hidden" />
                        </label>
                    </div>
                </div>

                {/* New event dialog */}
                {showNewDialog && (
                    <div className="p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                        <input
                            type="text"
                            value={newEventName}
                            onChange={e => setNewEventName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreate()}
                            placeholder={t('eventNamePlaceholder')}
                            className="w-full px-2 py-1 rounded text-xs outline-none ring-1 ring-amber-500 mb-1"
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                            autoFocus
                        />
                        <div className="flex gap-1">
                            <button onClick={handleCreate} className="flex-1 py-1 rounded text-xs text-white" style={{ background: 'var(--accent-amber, #f59e0b)' }}>{t('create')}</button>
                            <button onClick={() => setShowNewDialog(false)} className="flex-1 py-1 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>{t('common:cancel')}</button>
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
                                    ? t('emptyListNew')
                                    : t('emptyListNoMatch')}
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
                                                title={t('common:rename')}
                                            >
                                                <PencilIcon className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleDuplicate(event.id); }}
                                                className="p-0.5 rounded hover:bg-white/10"
                                                title={t('common:duplicate')}
                                            >
                                                <DuplicateIcon className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleDelete(event.id); }}
                                                className="p-0.5 rounded hover:bg-red-500/20"
                                                title={t('common:delete')}
                                            >
                                                <TrashIcon className="w-3 h-3 text-red-400" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 pl-3.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${triggerInfo.color}`}>
                                            {t(`triggers.${event.trigger}`)}
                                        </span>
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                            {t('cmdCount', { count: event.commands.length })}
                                        </span>
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
                                {t(`triggers.${selectedEvent.trigger}`)}
                            </span>
                        </div>

                        {/* ─── Properties section ─── */}
                        <div className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                            <button
                                onClick={() => toggleSection('properties')}
                                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors"
                            >
                                {expandedSections.has('properties') ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{t('properties')}</span>
                            </button>

                            {expandedSections.has('properties') && (
                                <div className="px-4 pb-3 space-y-2">
                                    {/* Name */}
                                    <div>
                                        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t('name')}</label>
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
                                        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t('description')}</label>
                                        <textarea
                                            value={selectedEvent.description || ''}
                                            onChange={e => updateEvent({ description: e.target.value })}
                                            placeholder={t('descriptionPlaceholder')}
                                            rows={2}
                                            className="w-full px-2 py-1 rounded text-xs outline-none resize-none"
                                            style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                        />
                                    </div>

                                    {/* Trigger */}
                                    <div>
                                        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t('trigger')}</label>
                                        <select
                                            value={selectedEvent.trigger}
                                            onChange={e => updateEvent({ trigger: e.target.value as CommonEventTrigger })}
                                            className="w-full px-2 py-1 rounded text-xs outline-none"
                                            style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                        >
                                            {Object.keys(TRIGGER_LABELS).map((value) => (
                                                <option key={value} value={value}>{t(`triggers.${value}`)} — {t(`triggerDesc.${value}`)}</option>
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
                                        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('enabled')}</label>
                                    </div>

                                    {/* Condition Variable (for parallel/auto) */}
                                    {(selectedEvent.trigger === 'parallel' || selectedEvent.trigger === 'auto') && (
                                        <div>
                                            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                                                {t('conditionVariable')}
                                            </label>
                                            <select
                                                value={selectedEvent.conditionVariableId || ''}
                                                onChange={e => updateEvent({ conditionVariableId: e.target.value || null })}
                                                className="w-full px-2 py-1 rounded text-xs outline-none"
                                                style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                                            >
                                                <option value="">{t('noCondition')}</option>
                                                {Object.values(project.variables || {}).map((v: any) => (
                                                    <option key={v.id} value={v.id}>{v.name}</option>
                                                ))}
                                            </select>
                                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                {t('conditionHint')}
                                            </p>
                                        </div>
                                    )}

                                    {/* Parallel events only run background-safe commands — make that explicit. */}
                                    {selectedEvent.trigger === 'parallel' && (
                                        <div className="text-[10px] rounded p-2 leading-relaxed" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--text-secondary)' }}>
                                            {t('parallelNote')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ─── Commands section ─── */}
                        <div>
                            <button
                                onClick={() => toggleSection('commands')}
                                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition-colors border-b"
                                style={{ borderColor: 'var(--border-subtle)' }}
                            >
                                {expandedSections.has('commands') ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{t('commands')}</span>
                                <span className="text-[10px] ml-auto px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                                    {selectedEvent.commands.length}
                                </span>
                            </button>

                            {expandedSections.has('commands') && (
                                <div className="px-4 py-3">
                                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                                        {t('commandsHint')}
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
                                                    {t('dropHere')}
                                                </p>
                                            </div>
                                        ) : (
                                            selectedEvent.commands.map((cmd: VNCommand, index: number) => {
                                                const colorClass = getCommandColor(cmd.type);
                                                const isSelected = selectedCommandIndex === index;
                                                return (
                                                    <div
                                                        key={cmd.id}
                                                        onClick={() => setSelectedCommandIndex(isSelected ? null : index)}
                                                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs border ${colorClass} group cursor-pointer ${isSelected ? 'ring-2 ring-amber-400' : ''}`}
                                                        title={t('editCommand')}
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
                                                                    → {(project.commonEvents || {})[(cmd as any).commonEventId]?.name || t('unknown')}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteCommand(index); }}
                                                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-opacity"
                                                            title={t('removeCommand')}
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
                                                title={t('addCommandTitle', { name: formatCommandName(cmdType) })}
                                            >
                                                + {formatCommandName(cmdType)}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Selected command's property editor (reuses the scene inspector's
                                        grouped fields, writing via UPDATE_COMMON_EVENT_COMMAND). */}
                                    {selectedCommand ? (
                                        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                                                    {t('editingCommand', { name: formatCommandName(selectedCommand.type) })}
                                                </span>
                                                <button onClick={() => setSelectedCommandIndex(null)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
                                                    {t('common:close')}
                                                </button>
                                            </div>
                                            <CommandGroupAccordion command={selectedCommand} updateCommand={updateSelectedCommand} />
                                        </div>
                                    ) : selectedEvent.commands.length > 0 ? (
                                        <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--text-muted)' }}>{t('clickCommandToEdit')}</p>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <CommonEventsIcon className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                            <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{t('emptyTitle')}</h3>
                            <p className="text-xs max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
                                {commonEvents.length === 0
                                    ? t('emptyDescNew')
                                    : t('emptyDescSelect')}
                            </p>
                            {commonEvents.length === 0 && (
                                <button
                                    onClick={() => setShowNewDialog(true)}
                                    className="mt-3 px-4 py-1.5 rounded text-xs font-bold text-white transition-colors"
                                    style={{ background: 'var(--accent-amber, #f59e0b)' }}
                                >
                                    <PlusIcon className="w-3 h-3 inline mr-1" /> {t('createFirst')}
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
