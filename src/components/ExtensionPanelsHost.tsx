/**
 * ExtensionPanelsHost — renders editor PANELS contributed by extensions (Phase C1).
 *
 * Each open panel is shown in a lightweight floating, draggable + resizable window. The panel's own
 * `render(container, ctx)` runs into the window body (free-form: it may render any DOM, including
 * iframes — editor extensions run with full trust on the author's machine). Opened from the Header's
 * Tools → Extension Panels menu. Desktop + mobile editor; inert until an extension registers a panel.
 */

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { pluginManager } from '../features/plugins/PluginManagerService';
import type { EditorPanelContribution, EditorMenuItemContribution, EditorDatabaseCategory, EditorUIElementType } from '../types/plugins';

type PanelEntry = { panel: EditorPanelContribution; pluginId: string };
type MenuEntry = { item: EditorMenuItemContribution; pluginId: string };
type DbCatEntry = { category: EditorDatabaseCategory; pluginId: string };
type UIElementTypeEntry = { def: EditorUIElementType; pluginId: string };

/** Live list of editor panels contributed by enabled extensions (re-renders when the registry changes). */
export function useExtensionPanels(): PanelEntry[] {
    const [panels, setPanels] = useState<PanelEntry[]>(() => pluginManager.getRegisteredPanels());
    useEffect(() => {
        const update = () => setPanels(pluginManager.getRegisteredPanels());
        pluginManager.addListener(update);
        update();
        return () => pluginManager.removeListener(update);
    }, []);
    return panels;
}

/** Live list of editor menu items / tools contributed by enabled extensions. */
export function useExtensionMenuItems(): MenuEntry[] {
    const [items, setItems] = useState<MenuEntry[]>(() => pluginManager.getRegisteredMenuItems());
    useEffect(() => {
        const update = () => setItems(pluginManager.getRegisteredMenuItems());
        pluginManager.addListener(update);
        update();
        return () => pluginManager.removeListener(update);
    }, []);
    return items;
}

/** Live list of custom database categories contributed by enabled extensions. */
export function useExtensionDatabaseCategories(): DbCatEntry[] {
    const [cats, setCats] = useState<DbCatEntry[]>(() => pluginManager.getRegisteredDbCategories());
    useEffect(() => {
        const update = () => setCats(pluginManager.getRegisteredDbCategories());
        pluginManager.addListener(update);
        update();
        return () => pluginManager.removeListener(update);
    }, []);
    return cats;
}

/** Live list of custom UI element types contributed by enabled extensions (for the element palette). */
export function useExtensionUIElementTypes(): UIElementTypeEntry[] {
    const [types, setTypes] = useState<UIElementTypeEntry[]>(() => pluginManager.getRegisteredUIElementTypes());
    useEffect(() => {
        const update = () => setTypes(pluginManager.getRegisteredUIElementTypes());
        pluginManager.addListener(update);
        update();
        return () => pluginManager.removeListener(update);
    }, []);
    return types;
}

/** Run a contributed menu item with a fresh editor context. Errors are isolated + logged. */
export function runExtensionMenuItem(entry: MenuEntry): void {
    try {
        entry.item.run(pluginManager.buildPanelContext(entry.pluginId));
    } catch (e) {
        console.error('[Extension tool] run failed:', e);
    }
}

const ExtensionPanelWindow: React.FC<{ entry: PanelEntry; index: number; onClose: () => void }> = ({ entry, index, onClose }) => {
    const winRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 140 + index * 28, y: 120 + index * 28 });
    const dragRef = useRef<{ dx: number; dy: number } | null>(null);

    // Set the initial size ONCE (imperatively) so CSS `resize` owns width/height afterwards — React only
    // controls position (left/top), so dragging the window never resets the user's chosen size.
    useEffect(() => {
        const w = winRef.current;
        if (w) { w.style.width = '380px'; w.style.height = '320px'; }
    }, []);

    // Mount the extension's panel into the body; run its optional cleanup when the panel closes.
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        el.innerHTML = '';
        let cleanup: void | (() => void);
        try {
            cleanup = entry.panel.render(el, pluginManager.buildPanelContext(entry.pluginId));
        } catch (e) {
            console.error('[Extension panel] render failed:', e);
            el.innerHTML = '<div style="padding:12px;color:#f87171;font:12px sans-serif">This panel failed to render. See the console.</div>';
        }
        return () => {
            try { if (typeof cleanup === 'function') cleanup(); } catch (e) { console.error('[Extension panel] cleanup failed:', e); }
            if (el) el.innerHTML = '';
        };
    }, [entry]);

    const onHeaderDown = (e: React.MouseEvent) => {
        dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        const move = (ev: MouseEvent) => { if (dragRef.current) setPos({ x: ev.clientX - dragRef.current.dx, y: ev.clientY - dragRef.current.dy }); };
        const up = () => { dragRef.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    };

    return ReactDOM.createPortal(
        <div
            ref={winRef}
            style={{
                position: 'fixed', left: pos.x, top: pos.y, zIndex: 9000,
                display: 'flex', flexDirection: 'column',
                background: 'var(--bg-secondary, #161b22)', border: '1px solid var(--border-subtle, #30363d)',
                borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                resize: 'both', overflow: 'hidden', minWidth: 220, minHeight: 140,
            }}
        >
            <div
                onMouseDown={onHeaderDown}
                style={{ cursor: 'move', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: 'var(--bg-elevated, #21262d)', borderBottom: '1px solid var(--border-subtle, #30363d)', userSelect: 'none' }}
            >
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #c9d1d9)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.panel.icon ? entry.panel.icon + ' ' : ''}{entry.panel.title}
                </span>
                <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#8b949e', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px' }} title="Close">✕</button>
            </div>
            <div ref={bodyRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }} />
        </div>,
        document.body,
    );
};

/** Renders one floating window per open panel id. Closed panels (or unregistered ids) render nothing. */
export const ExtensionPanelsHost: React.FC<{ openIds: string[]; onClose: (id: string) => void }> = ({ openIds, onClose }) => {
    const panels = useExtensionPanels();
    return (
        <>
            {openIds.map((id, i) => {
                const entry = panels.find(p => p.panel.id === id);
                if (!entry) return null;
                return <ExtensionPanelWindow key={id} entry={entry} index={i} onClose={() => onClose(id)} />;
            })}
        </>
    );
};

export default ExtensionPanelsHost;
