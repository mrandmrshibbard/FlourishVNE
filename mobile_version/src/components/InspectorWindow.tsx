import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import InspectorPanel from './InspectorPanel';
import InGameUIEditor from './InGameUIEditor';
import { EditorContext, onEditorContextUpdate, focusMainWindow } from '../utils/windowManager';
import { NavigationTab } from './NavigationTabs';
import { XMarkIcon } from './icons';

/**
 * A focused, popped-out Properties Inspector window. It is NOT a full editor — it renders only the
 * contextual inspector (the shared InspectorPanel), mirroring whatever is selected in the main editor.
 *
 * Two sync channels feed it:
 *  - the project (via ProjectContext, kept in sync by the existing project-state IPC), and
 *  - the editor "context" (selection) via the editor-context IPC channel.
 * Edits made here dispatch project changes that flow back to the main window through project sync.
 * Selection is one-way (main → here): this window follows, it doesn't drive the main selection.
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

// Mirrors InspectorPanel's non-null branches: does this context actually have properties to show?
// (true: scenes tab, a selected command/variable, a selected UI screen/element, or the UI screens-mode
// placeholder. false: characters, UI in-game mode, or any other tab with nothing selected.)
const isInspectableContext = (c: EditorContext): boolean => {
    if (c.activeTab === 'ui' && c.uiEditorMode === 'ingame') return false;
    if (c.activeTab === 'ui' && !c.activeMenuScreenId && c.uiEditorMode === 'screens') return true;
    if (c.activeCharacterId) return false;
    if (c.activeMenuScreenId) return true;
    if (c.selectedVariableId) return true;
    if (c.selectedCommandIndex !== null && c.selectedCommandIndex !== undefined) return true;
    if (c.activeTab === 'scenes') return true;
    return false;
};

const InspectorWindow: React.FC = () => {
    const { t } = useTranslation('components');
    const { project } = useProject();
    const seedCtx: EditorContext = (() => {
        const seed = (window as any).__FLOURISH_EDITOR_CONTEXT__;
        return seed ? { ...DEFAULT_CONTEXT, ...seed } : DEFAULT_CONTEXT;
    })();
    const [ctx, setCtx] = useState<EditorContext>(seedCtx);

    // Follow whichever editor is active. The window STAYS OPEN — it shows the selected thing's
    // properties, or an empty state when the active editor has nothing to inspect.
    useEffect(() => {
        onEditorContextUpdate((incoming) => {
            (window as any).__FLOURISH_EDITOR_CONTEXT__ = incoming;
            setCtx({ ...DEFAULT_CONTEXT, ...incoming });
        });
    }, []);

    const inspectable = isInspectableContext(ctx);
    // In-Game UI properties: this adaptive Properties window shows the In-Game properties pane when the
    // editor is in In-Game mode (its shared view-state syncs via InGameUIEditor's own channel).
    const inGameProps = ctx.activeTab === 'ui' && ctx.uiEditorMode === 'ingame';

    const handleClose = () => {
        focusMainWindow();
        window.close();
    };

    return (
        <div
            className="h-screen flex flex-col bg-gradient-to-br from-[var(--bg-primary)] via-purple-900/20 to-[var(--bg-primary)]"
            style={{ ['--inspector-width' as any]: '100%' }}
        >
            {/* The inspector panels hard-code their sidebar width (w-72 / max-w-[320px]); inside this
                dedicated window we force the panel to FILL the window so there's no empty space and it
                grows when the window is resized. */}
            <style>{`
                .flourish-popout-inspector > * {
                    width: 100% !important;
                    max-width: 100% !important;
                    min-width: 0 !important;
                }
            `}</style>
            <div className="flex items-center justify-between gap-2 p-2 panel border-b border-[var(--border-subtle)]">
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)] px-1">
                    {t('inspectorWindow.title', { defaultValue: 'Properties' })}
                </span>
                <button
                    onClick={handleClose}
                    className="flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold bg-red-500/80 hover:bg-red-600 text-white transition-all"
                    title={t('inspectorWindow.close', { defaultValue: 'Close window' })}
                >
                    <XMarkIcon className="w-4 h-4" />
                </button>
            </div>
            {inGameProps ? (
                <div className="flex-1 min-h-0">
                    <InGameUIEditor project={project} showTree={false} showCanvas={false} />
                </div>
            ) : (
                <div className="flourish-popout-inspector flex-1 overflow-auto p-1 min-w-0">
                    {inspectable ? (
                        <InspectorPanel
                            activeTab={ctx.activeTab as NavigationTab}
                            uiEditorMode={ctx.uiEditorMode}
                            activeSceneId={ctx.activeSceneId}
                            selectedCommandIndex={ctx.selectedCommandIndex}
                            setSelectedCommandIndex={(i) => setCtx(c => ({ ...c, selectedCommandIndex: i }))}
                            activeMenuScreenId={ctx.activeMenuScreenId}
                            selectedUIElementIds={ctx.selectedUIElementIds}
                            setSelectedUIElementIds={(ids) => setCtx(c => ({ ...c, selectedUIElementIds: ids }))}
                            activeCharacterId={ctx.activeCharacterId}
                            selectedVariableId={ctx.selectedVariableId}
                            setSelectedVariableId={(id) => setCtx(c => ({ ...c, selectedVariableId: id }))}
                            onOpenInSystems={() => { focusMainWindow(); }}
                        />
                    ) : (
                        <div className="h-full flex items-center justify-center p-6 text-center text-xs text-[var(--text-secondary)]">
                            {t('inspectorWindow.empty', { defaultValue: 'Nothing to inspect — select something in the editor.' })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default InspectorWindow;
