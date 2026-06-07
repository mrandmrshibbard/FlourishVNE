/**
 * ElementRadialContext — right-click radial menu + group-scoped popover for UI
 * screen elements (the menu-editor counterpart to CommandRadialContext). A context
 * lets the element tree rows (UIManager) and the canvas overlays (MenuEditor) open
 * the radial without threading callbacks. Writes flow through UPDATE_UI_ELEMENT —
 * presentation-only, no schema impact.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../contexts/ProjectContext';
import { VNUIElement } from '../../features/ui/types';
import { VNProject } from '../../types/project';
import { VNID } from '../../types';
import RadialMenu from '../ui/RadialMenu';
import { InspectorGroupId, INSPECTOR_GROUPS } from '../inspector/inspectorGroups';
import { ElementGroupFields, getElementGroups, summarizeElementGroup } from '../inspector/ElementGroupFields';

interface RadialState { x: number; y: number; elementId: VNID; }
interface PopoverState { x: number; y: number; elementId: VNID; groupId: InspectorGroupId; }

interface ElementRadialApi {
    openByElementId: (elementId: VNID, x: number, y: number) => void;
}

const Ctx = createContext<ElementRadialApi | null>(null);

/** Returns the radial API, or null if no provider is mounted (callers should no-op). */
export const useElementRadial = (): ElementRadialApi | null => useContext(Ctx);

export const ElementRadialProvider: React.FC<{
    activeScreenId: VNID | null;
    selectElement: (id: VNID | null) => void;
    children: React.ReactNode;
}> = ({ activeScreenId, selectElement, children }) => {
    const { project, dispatch } = useProject();
    const { t } = useTranslation('ui');
    const [radial, setRadial] = useState<RadialState | null>(null);
    const [popover, setPopover] = useState<PopoverState | null>(null);

    const screen = activeScreenId ? project.uiScreens[activeScreenId] : null;
    const elements = screen?.elements || {};

    const openByElementId = useCallback((elementId: VNID, x: number, y: number) => {
        setPopover(null);
        setRadial({ x, y, elementId });
    }, []);

    const updateElementAt = useCallback((elementId: VNID, updates: Partial<VNUIElement>) => {
        if (!activeScreenId) return;
        dispatch({ type: 'UPDATE_UI_ELEMENT', payload: { screenId: activeScreenId, elementId, updates } });
    }, [dispatch, activeScreenId]);

    const api = useMemo<ElementRadialApi>(() => ({ openByElementId }), [openByElementId]);

    const radialElement = radial ? elements[radial.elementId] : null;
    const radialGroups = radialElement ? getElementGroups(radialElement) : [];
    const popoverElement = popover ? elements[popover.elementId] : null;

    return (
        <Ctx.Provider value={api}>
            {children}

            {radial && radialElement && radialGroups.length > 0 && (
                <RadialMenu
                    x={radial.x}
                    y={radial.y}
                    centerLabel={radialElement.name || radialElement.type}
                    centerGlyph="⛶"
                    onCenter={() => { selectElement(radial.elementId); setRadial(null); }}
                    items={radialGroups.map(g => {
                        const summary = summarizeElementGroup(radialElement, g, project);
                        return {
                            id: g,
                            label: t(INSPECTOR_GROUPS[g].i18nKey),
                            glyph: INSPECTOR_GROUPS[g].glyph,
                            badge: summary && summary !== 'none' ? '•' : undefined,
                        };
                    })}
                    onSelect={(gid) => {
                        setPopover({ x: radial.x, y: radial.y, elementId: radial.elementId, groupId: gid as InspectorGroupId });
                        setRadial(null);
                    }}
                    onClose={() => setRadial(null)}
                />
            )}

            {popover && popoverElement && (
                <ElementGroupPopover
                    x={popover.x}
                    y={popover.y}
                    groupId={popover.groupId}
                    element={popoverElement}
                    project={project}
                    updateElement={(u) => updateElementAt(popover.elementId, u)}
                    onExpand={() => { selectElement(popover.elementId); setPopover(null); }}
                    onClose={() => setPopover(null)}
                />
            )}
        </Ctx.Provider>
    );
};

const POP_W = 300;

const ElementGroupPopover: React.FC<{
    x: number; y: number;
    groupId: InspectorGroupId;
    element: VNUIElement;
    project: VNProject;
    updateElement: (updates: Partial<VNUIElement>) => void;
    onExpand: () => void;
    onClose: () => void;
}> = ({ x, y, groupId, element, project, updateElement, onExpand, onClose }) => {
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
                    <button onClick={onExpand} title="Open full inspector" className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)]">⤢</button>
                    <button onClick={onClose} title="Close" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1">✕</button>
                </div>
            </div>
            <div className="p-3 overflow-y-auto flex-1 min-h-0">
                <ElementGroupFields groupId={groupId} element={element} project={project} updateElement={updateElement} />
            </div>
        </div>,
        document.body
    );
};
