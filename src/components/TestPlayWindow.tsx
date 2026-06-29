/**
 * TestPlayWindow — runs the game (LivePreview) in its own pop-out window (desktop / Electron).
 *
 * The window receives the project via the multi-window project-sync channel (and stays live as you edit
 * in the main editor). The "Reload" button remounts LivePreview, restarting the game from the beginning
 * with the LATEST synced project — so you can edit in the main window, hit Reload here, and see changes
 * without juggling the in-editor preview overlay.
 */

import React, { useEffect, useRef, useState } from 'react';
import LivePreview from './LivePreview';
import { pluginManager } from '../features/plugins/PluginManagerService';
import { onEditorContextUpdate, EditorContext } from '../utils/windowManager';

const TestPlayWindow: React.FC = () => {
    const [runKey, setRunKey] = useState(0);

    // Treat this window as "test playing" so extensions flagged "hide during test play" stay hidden here
    // too (consistent with the in-editor preview).
    useEffect(() => {
        try { pluginManager.setTestPlayActive(true); } catch { /* no-op */ }
        return () => { try { pluginManager.setTestPlayActive(false); } catch { /* no-op */ } };
    }, []);

    // Track the main editor's current scene + selected command (synced across windows), so the
    // "Reload to line" button can hot-reload the running game right to the line being edited.
    const ctxRef = useRef<Partial<EditorContext> | null>((window as any).__FLOURISH_EDITOR_CONTEXT__ || null);
    useEffect(() => {
        onEditorContextUpdate((incoming: EditorContext) => {
            ctxRef.current = incoming;
            (window as any).__FLOURISH_EDITOR_CONTEXT__ = incoming;
        });
    }, []);

    // Hot-reload: jump the running engine to the scene/command being edited, preserving variables &
    // inventory. Falls back to a full restart if no editor context (e.g. nothing selected yet).
    const reloadToLine = () => {
        const ctx = ctxRef.current || (window as any).__FLOURISH_EDITOR_CONTEXT__;
        if (!ctx || !ctx.activeSceneId) { setRunKey(k => k + 1); return; }
        window.dispatchEvent(new CustomEvent('flourish:hotReload', {
            detail: { sceneId: ctx.activeSceneId, commandIndex: ctx.selectedCommandIndex ?? 0 },
        }));
    };

    const btn: React.CSSProperties = {
        border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.55)', color: '#fff',
        borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', backdropFilter: 'blur(4px)',
    };

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 100000, display: 'flex', gap: 6 }}>
                <button style={btn} title="Hot reload: jump to the scene + command you're editing with the latest edits, keeping variables & inventory" onClick={reloadToLine}>⟲ Reload to line</button>
                <button style={btn} title="Restart the game from the beginning with the latest edits from the editor" onClick={() => setRunKey(k => k + 1)}>↻ Restart</button>
                <button style={btn} title="Close this window" onClick={() => window.close()}>✕</button>
            </div>
            <LivePreview key={runKey} onClose={() => window.close()} hideCloseButton={true} autoStartMusic={true} />
        </div>
    );
};

export default TestPlayWindow;
