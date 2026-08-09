/**
 * Common Events Manager
 *
 * Full-page manager for creating, editing, and organising Common Events.
 * Common Events are reusable command sequences that can be invoked from
 * any scene via the "Call Common Event" command, run in parallel, or
 * execute automatically at scene start.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
import { createCommand } from '../utils/commandFactory';
import { isReorderableCommand, moveCommonEventCommand, stepCommonEventCommand } from '../utils/commonEventReorder';
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
    /** One-shot deep link (variable X-ray "take me there", or double-clicking an event-owned
     *  element on the scene canvas — the latter also targets a specific command). Consumed on arrival. */
    initialSelection?: { eventId: VNID; commandIndex?: number } | null;
    onSelectionConsumed?: () => void;
}

const CommonEventsManager: React.FC<CommonEventsManagerProps> = ({ project, initialSelection, onSelectionConsumed }) => {
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
    // ── Command reorder drag (pointer-based, like the scene editor's list) ──
    // dropLine = the insertion index the amber line previews (0..length; null = not dragging).
    const [dropLine, setDropLine] = useState<number | null>(null);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const reorderRef = useRef<{
        fromIndex: number; startX: number; startY: number; started: boolean;
        /** Row midpoints snapshotted at drag START (stable against our own drop-line shifting
         *  layout — the scene editor's hard-won lesson). */
        mids: number[];
        /** The command index of each visible row, aligned with `mids` — collapsed-branch rows
         *  are missing from the DOM, so a mids position must be mapped back through this. */
        rowIdx: number[];
    } | null>(null);
    const justDraggedRef = useRef(false);
    const commandListRef = useRef<HTMLDivElement | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(['properties', 'commands'])
    );

    const selectedEvent = selectedEventId ? (project.commonEvents || {})[selectedEventId] as VNCommonEvent | undefined : undefined;

    // Branch nesting depth per row, for the visual block indent (mirrors the scene editor's
    // "a branch is ONE block" reading): contents sit one level deeper than their Branch row;
    // Otherwise-if / Otherwise / End markers sit at the Branch's own level.
    const rowDepths = useMemo(() => {
        const depths: number[] = [];
        let d = 0;
        for (const c of (selectedEvent?.commands || []) as VNCommand[]) {
            if (c.type === CommandType.BranchEnd) d = Math.max(0, d - 1);
            const isMidMarker = c.type === CommandType.BranchElseIf || c.type === CommandType.BranchElse;
            depths.push(isMidMarker ? Math.max(0, d - 1) : d);
            if (c.type === CommandType.BranchStart) d += 1;
        }
        return depths;
    }, [selectedEvent?.commands]);

    // Rows hidden by a collapsed Branch (everything between its Start and matching End,
    // markers and End included) — persisted on the BranchStart's `isCollapsed` field, exactly
    // like the scene editor. Nested branches inside a collapsed one stay hidden regardless of
    // their own collapse state (the walk stays balanced either way).
    const hiddenRows = useMemo(() => {
        const hidden = new Set<number>();
        let hideDepth = 0;
        ((selectedEvent?.commands || []) as VNCommand[]).forEach((c, i) => {
            if (c.type === CommandType.BranchEnd) {
                if (hideDepth > 0) { hidden.add(i); hideDepth -= 1; }
                return;
            }
            if (hideDepth > 0) hidden.add(i);
            if (c.type === CommandType.BranchStart && (hideDepth > 0 || (c as { isCollapsed?: boolean }).isCollapsed)) {
                hideDepth += 1;
            }
        });
        return hidden;
    }, [selectedEvent?.commands]);

    const toggleBranchCollapse = useCallback((index: number, collapsed: boolean) => {
        if (!selectedEventId) return;
        dispatch({ type: 'UPDATE_COMMON_EVENT_COMMAND', payload: { commonEventId: selectedEventId, commandIndex: index, updates: { isCollapsed: collapsed } as Partial<VNCommand> } });
    }, [dispatch, selectedEventId]);

    /** Walk a branch block STRUCTURALLY (balanced Start/End) from its BranchStart row.
     *  Position-based rather than branchId-based so a legacy/oddly-tagged branch still behaves,
     *  and so a nested branch's own Otherwise never counts as this branch's. */
    const branchBlock = useCallback((cmds: VNCommand[], startIndex: number) => {
        let depth = 0, endIndex = -1, elseIndex = -1;
        for (let i = startIndex; i < cmds.length; i++) {
            const c = cmds[i];
            if (c.type === CommandType.BranchStart) { depth++; continue; }
            if (c.type === CommandType.BranchEnd) { depth--; if (depth === 0) { endIndex = i; break; } continue; }
            if (depth === 1 && c.type === CommandType.BranchElse && elseIndex === -1) elseIndex = i;  // direct child only
        }
        return { endIndex, elseIndex, hasElse: elseIndex !== -1 };
    }, []);

    /** Add an "Otherwise if" / "Otherwise" segment to a branch — the Common Events twin of the
     *  scene editor's branch-block buttons (these markers are deliberately absent from the command
     *  palette, because a loose marker with a fresh branchId would belong to no branch).
     *  Otherwise-if goes before any existing Otherwise; Otherwise goes just before the End. */
    const addBranchSegment = useCallback((startIndex: number, segType: CommandType.BranchElseIf | CommandType.BranchElse) => {
        if (!selectedEventId || !selectedEvent) return;
        const cmds = selectedEvent.commands;
        const branchId = (cmds[startIndex] as { branchId?: string })?.branchId;
        if (!branchId) return;                                  // runtime pairs markers by branchId
        const { endIndex, elseIndex } = branchBlock(cmds, startIndex);
        if (endIndex === -1) return;                            // dangling branch — nothing to close
        // Otherwise-if slots in before an existing Otherwise so the catch-all stays last.
        const insertAt = (segType === CommandType.BranchElseIf && elseIndex !== -1) ? elseIndex : endIndex;
        const marker = createCommand(segType, project, { branchId });
        if (!marker) return;
        // The reducer stamps an id when one is missing.
        dispatch({ type: 'ADD_COMMON_EVENT_COMMAND', payload: { commonEventId: selectedEventId, command: marker as VNCommand, index: insertAt } });
    }, [dispatch, selectedEventId, selectedEvent, project, branchBlock]);

    // A deep link's target command index, stashed (tagged with its event) so the "clear the command
    // editor when the event changes" effect below consumes it instead of wiping it.
    const pendingCommandIndexRef = useRef<{ eventId: VNID; index: number } | null>(null);

    // Adopt a deep link from elsewhere in the editor (the variable X-ray's "take me there", or a
    // double-clicked event element on the scene canvas), then tell the owner it's been used —
    // otherwise it would re-select on every later visit to this tab.
    useEffect(() => {
        if (!initialSelection) return;
        if ((project.commonEvents || {})[initialSelection.eventId]) {
            const idx = typeof initialSelection.commandIndex === 'number' ? initialSelection.commandIndex : null;
            if (initialSelection.eventId === selectedEventId) {
                // Same event — no event switch coming, apply the index directly.
                if (idx !== null) setSelectedCommandIndex(idx);
            } else {
                if (idx !== null) pendingCommandIndexRef.current = { eventId: initialSelection.eventId, index: idx };
                setSelectedEventId(initialSelection.eventId);
            }
        }
        onSelectionConsumed?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSelection]);

    // The command currently open for editing, and a writer that targets it in the reducer.
    const selectedCommand: VNCommand | undefined =
        (selectedEvent && selectedCommandIndex !== null) ? selectedEvent.commands[selectedCommandIndex] : undefined;
    const updateSelectedCommand = useCallback((updates: Partial<VNCommand>) => {
        if (!selectedEventId || selectedCommandIndex === null) return;
        dispatch({ type: 'UPDATE_COMMON_EVENT_COMMAND', payload: { commonEventId: selectedEventId, commandIndex: selectedCommandIndex, updates } });
    }, [dispatch, selectedEventId, selectedCommandIndex]);

    // Clear the open command editor when the selected event GENUINELY changes — unless a deep link
    // targeting a command in the new event is pending (it survives the switch). prevEventIdRef makes
    // this a no-op on mount and on StrictMode's double-run of mount effects, where a deep-link-set
    // index would otherwise be wiped right after being applied.
    const prevEventIdRef = useRef<VNID | null | undefined>(undefined);
    React.useEffect(() => {
        const prev = prevEventIdRef.current;
        prevEventIdRef.current = selectedEventId;
        const pending = pendingCommandIndexRef.current;
        if (pending && pending.eventId === selectedEventId) {
            setSelectedCommandIndex(pending.index);
            pendingCommandIndexRef.current = null;
        } else if (!pending && prev !== undefined && prev !== selectedEventId) {
            setSelectedCommandIndex(null);
        }
    }, [selectedEventId]);

    // ── Command reorder: pointer drag + ▲▼ (parity with the scene editor's list). ──
    // One UPDATE_COMMON_EVENT dispatch with the rebuilt array = one clean undo step.
    const commitCommandsReorder = useCallback((next: VNCommand[] | null) => {
        if (!next || !selectedEventId) return;
        dispatch({ type: 'UPDATE_COMMON_EVENT', payload: { commonEventId: selectedEventId, updates: { commands: next } } });
        setSelectedCommandIndex(null);
    }, [dispatch, selectedEventId]);

    const beginCommandReorder = useCallback((e: React.PointerEvent, index: number) => {
        if (e.button !== 0 || !selectedEvent) return;
        if (!isReorderableCommand(selectedEvent.commands[index])) return;
        // Snapshot row midpoints NOW (in viewport space) — detection must not read the
        // drop-line-shifted layout mid-drag or the target flickers (scene-editor lesson).
        // Rows inside a collapsed branch aren't in the DOM, so keep the VISIBLE rows' command
        // indices alongside their midpoints — a mids position is NOT a command index.
        const rows = (Array.from(commandListRef.current?.querySelectorAll('[data-ce-row]') || []) as HTMLElement[])
            .sort((a, b) => Number(a.dataset.ceRow) - Number(b.dataset.ceRow));
        const rowIdx = rows.map(r => Number(r.dataset.ceRow));
        const mids = rows.map(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
        reorderRef.current = { fromIndex: index, startX: e.clientX, startY: e.clientY, started: false, mids, rowIdx };

        // Insertion COMMAND index = the index of the first visible row whose midpoint is below
        // the cursor (end of list → past the last command).
        const insertIndexAt = (clientY: number): number => {
            const st = reorderRef.current;
            if (!st || !selectedEvent) return 0;
            for (let i = 0; i < st.mids.length; i++) {
                if (clientY < st.mids[i]) return st.rowIdx[i];
            }
            return selectedEvent.commands.length;
        };
        const onMove = (ev: PointerEvent) => {
            const st = reorderRef.current;
            if (!st) return;
            if (!st.started) {
                if (Math.abs(ev.clientY - st.startY) + Math.abs(ev.clientX - st.startX) < 5) return;
                st.started = true;
                setDraggingIndex(st.fromIndex);
            }
            setDropLine(insertIndexAt(ev.clientY));
        };
        const onUp = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            const st = reorderRef.current;
            const insert = st ? insertIndexAt(ev.clientY) : 0;
            reorderRef.current = null;
            setDraggingIndex(null);
            setDropLine(null);
            if (!st || !st.started || !selectedEvent) return;
            justDraggedRef.current = true;
            setTimeout(() => { justDraggedRef.current = false; }, 0);
            commitCommandsReorder(moveCommonEventCommand(selectedEvent.commands, st.fromIndex, insert));
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }, [selectedEvent, commitCommandsReorder]);

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

        // Build the command with the SAME canonical factory the scene editor uses, so EVERY command
        // type gets proper defaults (and its inspector populates) — not just a hand-picked few.
        const withId = (built: Omit<VNCommand, 'id'> | null) => built ? ({ id: `cmd-${generateId()}`, ...built } as VNCommand) : null;

        // A Branch is a paired Start+End (markers paired by branchId). Insert BOTH so it's usable,
        // mirroring the scene editor — otherwise a lone BranchStart would never close.
        if (commandType === CommandType.BranchStart) {
            const branchId = `branch-${generateId()}`;
            const start = withId(createCommand(CommandType.BranchStart, project, { branchId }));
            const end = withId(createCommand(CommandType.BranchEnd, project, { branchId }));
            if (start && end) {
                dispatch({ type: 'ADD_COMMON_EVENT_COMMAND', payload: { commonEventId: selectedEventId, command: start, index } });
                dispatch({ type: 'ADD_COMMON_EVENT_COMMAND', payload: { commonEventId: selectedEventId, command: end, index: index === undefined ? undefined : index + 1 } });
            }
            return;
        }

        const newCommand = withId(createCommand(commandType, project));
        if (!newCommand) return;
        dispatch({
            type: 'ADD_COMMON_EVENT_COMMAND',
            payload: { commonEventId: selectedEventId, command: newCommand, index }
        });
    }, [dispatch, selectedEventId, project]);

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
                            autoFocus
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
                            title={t('hc.exportAllCommonEventsTo', 'Export all common events to a JSON file')}
                        >
                            {t('hc.export', 'Export')}
                        </button>
                        <label className="flex-1 py-1 px-2 rounded text-[11px] bg-slate-700 hover:bg-slate-600 text-white transition-colors text-center cursor-pointer" title={t('hc.importCommonEventsFromA', 'Import common events from a JSON file')}>
                            {t('hc.import', 'Import')}
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
                                        ref={commandListRef}
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
                                                if (hiddenRows.has(index)) return null;
                                                const colorClass = getCommandColor(cmd.type);
                                                const isSelected = selectedCommandIndex === index;
                                                const reorderable = isReorderableCommand(cmd);
                                                const depth = rowDepths[index] || 0;
                                                const branchCmd = cmd.type === CommandType.BranchStart ? (cmd as { branchId?: string; name?: string; color?: string; isCollapsed?: boolean }) : null;
                                                // The branch's closing marker renders as a slim block edge — not a command
                                                // row. It has no editor and can't be deleted alone (the reducer enforces
                                                // it); dragging it still moves the whole paired block.
                                                if (cmd.type === CommandType.BranchEnd) {
                                                    return (
                                                        <React.Fragment key={cmd.id}>
                                                            {dropLine === index && <div className="h-0.5 rounded" style={{ background: 'var(--accent-amber, #f59e0b)' }} />}
                                                            <div
                                                                data-ce-row={index}
                                                                onPointerDown={e => beginCommandReorder(e, index)}
                                                                className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] select-none cursor-grab"
                                                                style={{ marginLeft: depth * 14, color: 'var(--text-muted)', ...(draggingIndex === index ? { opacity: 0.45 } : {}) }}
                                                                title={t('branchEndTip', 'Closes the Branch above — it moves and is removed together with it.')}
                                                            >
                                                                <span className="inline-block w-3 h-2 border-l-2 border-b-2 rounded-bl" style={{ borderColor: 'var(--border-subtle)' }} aria-hidden />
                                                                {t('branchEndLabel', 'end of branch')}
                                                            </div>
                                                        </React.Fragment>
                                                    );
                                                }
                                                return (
                                                    <React.Fragment key={cmd.id}>
                                                        {dropLine === index && <div className="h-0.5 rounded" style={{ background: 'var(--accent-amber, #f59e0b)' }} />}
                                                        <div
                                                            data-ce-row={index}
                                                            onClick={() => { if (justDraggedRef.current) return; setSelectedCommandIndex(isSelected ? null : index); }}
                                                            onPointerDown={e => beginCommandReorder(e, index)}
                                                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs border ${colorClass} group cursor-pointer ${isSelected ? 'ring-2 ring-amber-400' : ''}`}
                                                            style={{ marginLeft: depth * 14, ...(branchCmd?.color ? { borderColor: branchCmd.color } : {}), ...(draggingIndex === index ? { opacity: 0.45 } : {}) }}
                                                            title={reorderable ? t('dragToReorder', 'Click to edit · drag to reorder') : t('editCommand')}
                                                        >
                                                            <GripVerticalIcon className={`w-3 h-3 flex-shrink-0 ${reorderable ? 'opacity-40 cursor-grab' : 'opacity-10'}`} />
                                                            {branchCmd && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); toggleBranchCollapse(index, !branchCmd.isCollapsed); }}
                                                                    onPointerDown={e => e.stopPropagation()}
                                                                    className="p-0.5 rounded hover:bg-white/10 flex-shrink-0"
                                                                    title={branchCmd.isCollapsed ? t('expandBranch', 'Expand branch') : t('collapseBranch', 'Collapse branch')}
                                                                >
                                                                    <span className="inline-block text-[9px] transition-transform" style={{ transform: branchCmd.isCollapsed ? '' : 'rotate(90deg)' }}>▶</span>
                                                                </button>
                                                            )}
                                                            <span className="flex-1 truncate font-medium">
                                                                {formatCommandName(cmd.type)}
                                                                {branchCmd?.name && (
                                                                    <span className="ml-1 opacity-70 font-normal">({branchCmd.name})</span>
                                                                )}
                                                                {branchCmd?.isCollapsed && (
                                                                    <span className="ml-1 opacity-50 font-normal">⋯</span>
                                                                )}
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
                                                            {reorderable && <>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); commitCommandsReorder(stepCommonEventCommand(selectedEvent.commands, index, -1)); }}
                                                                    onPointerDown={e => e.stopPropagation()}
                                                                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
                                                                    title={t('moveUp', 'Move up')}
                                                                >▲</button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); commitCommandsReorder(stepCommonEventCommand(selectedEvent.commands, index, 1)); }}
                                                                    onPointerDown={e => e.stopPropagation()}
                                                                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
                                                                    title={t('moveDown', 'Move down')}
                                                                >▼</button>
                                                            </>}
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteCommand(index); }}
                                                                onPointerDown={e => e.stopPropagation()}
                                                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-opacity"
                                                                title={branchCmd ? t('removeBranchTip', 'Remove the branch (the commands inside it stay)') : t('removeCommand')}
                                                            >
                                                                <TrashIcon className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        {/* Segment buttons on their OWN line under the Branch, indented to the
                                                            branch body — mirrors the scene editor's branch-block header. These
                                                            markers are not in the command palette (a loose one would belong to no
                                                            branch), so this is the only way to build an if / else-if / else chain.
                                                            On the row itself they were 9px grey text ~1000px right of the branch
                                                            name: present, but nobody could find them. */}
                                                        {branchCmd && !branchCmd.isCollapsed && (() => {
                                                            const { hasElse } = branchBlock(selectedEvent.commands, index);
                                                            const btn = "px-2 py-1 rounded text-[10px] font-medium border border-[var(--accent-cyan)]/40 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 hover:border-[var(--accent-cyan)]";
                                                            // A branch can only have ONE Otherwise. Show the button DISABLED with a
                                                            // reason rather than hiding it — a button that silently vanishes reads
                                                            // as "the feature is missing" (exactly how this was first reported).
                                                            const btnOff = "px-2 py-1 rounded text-[10px] font-medium border border-[var(--border-subtle)] text-[var(--text-muted)] opacity-60 cursor-not-allowed";
                                                            return (
                                                                <div className="flex items-center gap-1.5 mt-0.5 mb-0.5" style={{ marginLeft: (depth + 1) * 14 }}>
                                                                    <button
                                                                        onClick={() => addBranchSegment(index, CommandType.BranchElseIf)}
                                                                        className={btn}
                                                                        title={t('addOtherwiseIfTip', 'Add an “Otherwise if” — another check, tried when the ones above do not match')}
                                                                    >
                                                                        {t('addOtherwiseIf', '+ Otherwise if')}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { if (!hasElse) addBranchSegment(index, CommandType.BranchElse); }}
                                                                        disabled={hasElse}
                                                                        className={hasElse ? btnOff : btn}
                                                                        title={hasElse
                                                                            ? t('addOtherwiseAlready', 'This branch already has an “Otherwise” — a branch can only have one.')
                                                                            : t('addOtherwiseTip', 'Add an “Otherwise” — runs when nothing above matched')}
                                                                    >
                                                                        {t('addOtherwise', '+ Otherwise')}
                                                                    </button>
                                                                </div>
                                                            );
                                                        })()}
                                                    </React.Fragment>
                                                );
                                            })
                                        )}
                                        {dropLine !== null && selectedEvent.commands.length > 0 && dropLine >= selectedEvent.commands.length && (
                                            <div className="h-0.5 rounded" style={{ background: 'var(--accent-amber, #f59e0b)' }} />
                                        )}
                                    </div>

                                    {/* Add-command palette — the FULL categorized command set (same as the
                                        scene editor), so every command type can be used in a Common Event.
                                        BranchEnd is a paired marker (inserted automatically with Branch). */}
                                    <div className="space-y-1.5">
                                        {Object.entries(COMMAND_CATEGORIES).map(([catName, cat]) => {
                                            const cmds = (cat.commands as readonly CommandType[]).filter(ct => ct !== CommandType.BranchEnd);
                                            if (cmds.length === 0) return null;
                                            return (
                                                <div key={catName}>
                                                    <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>{catName}</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {cmds.map(cmdType => (
                                                            <button
                                                                key={cmdType}
                                                                onClick={() => {
                                                                    const fakeDropEvent = {
                                                                        preventDefault: () => {},
                                                                        dataTransfer: { getData: () => cmdType },
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
                                                </div>
                                            );
                                        })}
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
