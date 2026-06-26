import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import StagingArea from './StagingArea';
import MenuEditor from './menu-editor/MenuEditor';
import InGameUIEditor from './InGameUIEditor';
import { CommandRadialProvider } from './inspector/CommandRadialContext';
import { ElementRadialProvider } from './menu-editor/ElementRadialContext';
import { EditorContext, onEditorContextUpdate, syncEditorContext } from '../utils/windowManager';

/**
 * A focused, popped-out Canvas window that ADAPTS to the active editor: it shows the scene staging
 * canvas (StagingArea) on the Scenes tab, and the UI-screen canvas (MenuEditor) on the UI > Screens
 * tab. It follows the editor-context channel (active tab + scene/screen + selection) and the synced
 * project (ProjectContext). Drag/resize dispatch UPDATE_COMMAND / UPDATE_UI_ELEMENT, which flow back
 * to the editor through project sync. Stays open; shows an empty state when there's no canvas to show.
 */

const DEFAULT_CONTEXT: EditorContext = {
    activeTab: 'scenes',
    uiEditorMode: 'screens',
    activeSceneId: '',
    selectedCommandIndex: null,
    activeMenuScreenId: null,
    selectedUIElementIds: [],
    activeCharacterId: null,
    selectedVariableId: null,
};

const CanvasWindow: React.FC = () => {
    const { t } = useTranslation('components');
    const { project } = useProject();
    const [ctx, setCtx] = useState<EditorContext>(() => {
        const seed = (window as any).__FLOURISH_EDITOR_CONTEXT__;
        return seed ? { ...DEFAULT_CONTEXT, ...seed } : DEFAULT_CONTEXT;
    });
    const ctxRef = useRef<EditorContext>(ctx);
    ctxRef.current = ctx;
    const isFocusedRef = useRef<boolean>(typeof document !== 'undefined' ? document.hasFocus() : false);

    // Follow whichever editor is active — but NOT while this window is focused (so the user's own
    // selection here isn't clobbered by an incoming update).
    useEffect(() => {
        onEditorContextUpdate((incoming) => {
            if (isFocusedRef.current) return;
            (window as any).__FLOURISH_EDITOR_CONTEXT__ = incoming;
            setCtx({ ...DEFAULT_CONTEXT, ...incoming });
        });
    }, []);

    // Track focus so we only BROADCAST our selection while this window is the active one.
    useEffect(() => {
        const onFocus = () => { isFocusedRef.current = true; };
        const onBlur = () => { isFocusedRef.current = false; };
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
    }, []);

    // Apply a selection change made INSIDE this window, and broadcast it so the editor + a popped-out
    // Properties inspector follow what's selected here (the fix for "selecting in the canvas didn't
    // update the properties"). Broadcasts only while focused (this window is the active one).
    const applySelection = (patch: Partial<EditorContext>) => {
        const next = { ...ctxRef.current, ...patch };
        ctxRef.current = next;
        (window as any).__FLOURISH_EDITOR_CONTEXT__ = next;
        setCtx(next);
        if (isFocusedRef.current) syncEditorContext(next);
    };

    // The scene staging canvas applies on the Scenes tab; the UI-screen canvas on UI > Screens.
    const sceneValid = ctx.activeTab === 'scenes' && !!(project.scenes && project.scenes[ctx.activeSceneId]);
    const uiValid = ctx.activeTab === 'ui' && ctx.uiEditorMode === 'screens'
        && !!ctx.activeMenuScreenId && !!(project.uiScreens && project.uiScreens[ctx.activeMenuScreenId]);
    // In-Game UI: this adaptive canvas shows the In-Game canvas (just that pane) when the editor is in
    // In-Game mode. The In-Game shared view-state (selected surface etc.) syncs via InGameUIEditor.
    const inGameActive = ctx.activeTab === 'ui' && ctx.uiEditorMode === 'ingame';

    // Chromeless: the canvas fills the window (the native window frame handles move/close), so the
    // popped-out canvas shows ONLY the canvas — no surrounding editor UI.
    return (
        <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--bg-primary)]">
            {sceneValid ? (
                <CommandRadialProvider
                    activeSceneId={ctx.activeSceneId}
                    setSelectedCommandIndex={(i) => applySelection({ selectedCommandIndex: i })}
                >
                    <StagingArea
                        bare
                        project={project}
                        activeSceneId={ctx.activeSceneId}
                        selectedCommandIndex={ctx.selectedCommandIndex}
                        className="h-full w-full"
                        style={{ height: '100%' }}
                    />
                </CommandRadialProvider>
            ) : uiValid ? (
                <ElementRadialProvider
                    activeScreenId={ctx.activeMenuScreenId as string}
                    selectElement={(id) => applySelection({ selectedUIElementIds: id ? [id] : [] })}
                >
                    <MenuEditor
                        activeScreenId={ctx.activeMenuScreenId as string}
                        selectedElementIds={ctx.selectedUIElementIds}
                        setSelectedElementIds={(ids) => applySelection({ selectedUIElementIds: ids })}
                        isPlaying={false}
                    />
                </ElementRadialProvider>
            ) : inGameActive ? (
                <div className="flex-1 min-h-0">
                    <InGameUIEditor project={project} showTree={false} showProperties={false} />
                </div>
            ) : (
                <div className="h-full flex items-center justify-center p-6 text-center text-xs text-[var(--text-secondary)]">
                    {t('canvasWindow.empty', { defaultValue: 'Select a scene or UI screen in the editor to see its canvas.' })}
                </div>
            )}
        </div>
    );
};

export default CanvasWindow;
