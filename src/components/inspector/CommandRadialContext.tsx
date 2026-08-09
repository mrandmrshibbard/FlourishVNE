/**
 * CommandRadialContext — hosts the right-click radial menu + group-scoped popover
 * for scene commands (Properties Inspector revamp pilot).
 *
 * A context lets deeply-nested triggers (command tree rows, canvas visuals) open
 * the radial without threading callbacks through every layer. The provider owns
 * the radial/popover state and renders both. Everything writes through the same
 * UPDATE_COMMAND dispatch as PropertiesInspector — presentation-only, no schema
 * impact.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNCommand } from '../../features/scene/types';
import { VNID } from '../../types';
import RadialMenu from '../ui/RadialMenu';
import { CommandGroupFields, summarizeGroup, GroupCtx } from './CommandGroupFields';
import {
    InspectorGroupId, INSPECTOR_GROUPS, getCommandGroups, isCommandGrouped,
} from './inspectorGroups';

interface RadialState { x: number; y: number; commandIndex: number; }
interface PopoverState { x: number; y: number; commandIndex: number; groupId: InspectorGroupId; }

interface CommandRadialApi {
    /** True when this command participates in the grouped/radial UI. */
    isGrouped: (command: VNCommand | null | undefined) => boolean;
    openByIndex: (commandIndex: number, x: number, y: number) => void;
    openById: (commandId: VNID, x: number, y: number) => void;
}

const Ctx = createContext<CommandRadialApi | null>(null);

/** Returns the radial API, or null if no provider is mounted (callers should no-op). */
export const useCommandRadial = (): CommandRadialApi | null => useContext(Ctx);

function commandLabel(command: VNCommand): string {
    return command.type.replace(/([A-Z])/g, ' $1').trim();
}

export const CommandRadialProvider: React.FC<{
    activeSceneId: VNID;
    setSelectedCommandIndex: (index: number | null) => void;
    children: React.ReactNode;
}> = ({ activeSceneId, setSelectedCommandIndex, children }) => {
    const { project, dispatch } = useProject();
    const { t } = useTranslation('ui');
    const [radial, setRadial] = useState<RadialState | null>(null);
    const [popover, setPopover] = useState<PopoverState | null>(null);

    const commands = project.scenes[activeSceneId]?.commands || [];

    const isGrouped = useCallback((command: VNCommand | null | undefined) => isCommandGrouped(command), []);

    const openByIndex = useCallback((commandIndex: number, x: number, y: number) => {
        setPopover(null);
        setRadial({ x, y, commandIndex });
    }, []);

    const openById = useCallback((commandId: VNID, x: number, y: number) => {
        const idx = commands.findIndex(c => c.id === commandId);
        if (idx >= 0) openByIndex(idx, x, y);
    }, [commands, openByIndex]);

    const updateCommandAt = useCallback((commandIndex: number, updates: Partial<VNCommand>) => {
        const cmd = commands[commandIndex];
        if (!cmd) return;
        dispatch({ type: 'UPDATE_COMMAND', payload: { sceneId: activeSceneId, commandIndex, command: { ...cmd, ...updates } as VNCommand } });
    }, [commands, dispatch, activeSceneId]);

    const api = useMemo<CommandRadialApi>(() => ({ isGrouped, openByIndex, openById }), [isGrouped, openByIndex, openById]);

    const radialCommand = radial ? commands[radial.commandIndex] : null;
    const radialGroups = getCommandGroups(radialCommand);
    const popoverCommand = popover ? commands[popover.commandIndex] : null;

    return (
        <Ctx.Provider value={api}>
            {children}

            {radial && radialCommand && radialGroups.length > 0 && (
                <RadialMenu
                    x={radial.x}
                    y={radial.y}
                    centerLabel={commandLabel(radialCommand)}
                    centerGlyph="⛶"
                    onCenter={() => { setSelectedCommandIndex(radial.commandIndex); setRadial(null); }}
                    items={radialGroups.map(g => {
                        const summary = summarizeGroup(g, radialCommand, project);
                        return {
                            id: g,
                            label: t(INSPECTOR_GROUPS[g].i18nKey),
                            glyph: INSPECTOR_GROUPS[g].glyph,
                            badge: summary && summary !== 'none' ? '•' : undefined,
                        };
                    })}
                    onSelect={(gid) => {
                        setPopover({ x: radial.x, y: radial.y, commandIndex: radial.commandIndex, groupId: gid as InspectorGroupId });
                        setRadial(null);
                    }}
                    onClose={() => setRadial(null)}
                />
            )}

            {popover && popoverCommand && (
                <GroupPopover
                    x={popover.x}
                    y={popover.y}
                    groupId={popover.groupId}
                    command={popoverCommand}
                    ctx={{ sceneId: activeSceneId, commandIndex: popover.commandIndex }}
                    updateCommand={(u) => updateCommandAt(popover.commandIndex, u)}
                    onExpand={() => { setSelectedCommandIndex(popover.commandIndex); setPopover(null); }}
                    onClose={() => setPopover(null)}
                />
            )}
        </Ctx.Provider>
    );
};

const POP_W = 300;

const GroupPopover: React.FC<{
    x: number; y: number;
    groupId: InspectorGroupId;
    command: VNCommand;
    ctx?: GroupCtx;
    updateCommand: (updates: Partial<VNCommand>) => void;
    onExpand: () => void;
    onClose: () => void;
}> = ({ x, y, groupId, command, ctx, updateCommand, onExpand, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    const { t } = useTranslation('ui');
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
        const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown, true);
        return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown, true); };
    }, [onClose]);

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const margin = 12;
    const left = Math.max(margin, Math.min(x, vw - POP_W - margin));
    const spaceBelow = vh - y - margin;
    const spaceAbove = y - margin;
    // Open upward when there isn't comfortable room below and there's more above —
    // anchor the popover's BOTTOM at the cursor so it grows up and never clips.
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const vStyle: React.CSSProperties = openUp
        ? { bottom: Math.max(margin, vh - y), maxHeight: Math.min(spaceAbove, vh * 0.7) }
        : { top: Math.max(margin, y), maxHeight: Math.min(spaceBelow, vh * 0.7) };
    const meta = INSPECTOR_GROUPS[groupId];

    return createPortal(
        <div
            ref={ref}
            className="fixed z-[10001] rounded-lg shadow-2xl border border-[var(--border-default)] bg-[var(--bg-secondary)] flex flex-col"
            style={{ left, ...vStyle, width: POP_W, animation: 'fade-in 0.12s ease-out' }}
        >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
                <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                    <span>{meta.glyph}</span>{t(meta.i18nKey)}
                </span>
                <div className="flex items-center gap-1">
                    <button onClick={onExpand} title={t('hc.openFullInspector', 'Open full inspector')} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)]">⤢</button>
                    <button onClick={onClose} title="Close" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1">✕</button>
                </div>
            </div>
            <div className="p-3 overflow-y-auto flex-1 min-h-0">
                <CommandGroupFields groupId={groupId} command={command} updateCommand={updateCommand} ctx={ctx} />
            </div>
        </div>,
        document.body
    );
};
