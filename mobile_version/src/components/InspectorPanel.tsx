import React from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import { VNID } from '../types';
import { NavigationTab } from './NavigationTabs';
import Panel from './ui/Panel';
import PropertiesInspector from './PropertiesInspector';
import ScreenInspector from './menu-editor/ScreenInspector';
import UIElementInspector from './menu-editor/UIElementInspector';
import { HotSpotProperties, InteractiveElementProperties } from './interactive-elements/InteractiveElementInspectors';
import { isHotSpotElement, isInteractiveElement } from '../utils/interactiveElements';
import { VNUIElement } from '../features/ui/types';

/**
 * The Properties Inspector content, extracted verbatim from VisualNovelEditor.renderInspector so the
 * SAME contextual inspector can render in two places: the editor's right sidebar AND a popped-out
 * inspector window. It is a pure function of the current selection (passed as props) + the synced
 * project (read from ProjectContext). Returns null when there is nothing to inspect.
 */
export interface InspectorPanelProps {
    activeTab: NavigationTab;
    uiEditorMode: 'screens' | 'ingame';
    activeSceneId: VNID;
    selectedCommandIndex: number | null;
    setSelectedCommandIndex: (i: number | null) => void;
    activeMenuScreenId: VNID | null;
    selectedUIElementIds: VNID[];
    setSelectedUIElementIds: (ids: VNID[]) => void;
    activeCharacterId: VNID | null;
    selectedVariableId: VNID | null;
    setSelectedVariableId: (id: VNID | null) => void;
    onOpenInSystems: (sel: { system: 'items' | 'inventory' | 'stats'; id?: VNID }) => void;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({
    activeTab,
    uiEditorMode,
    activeSceneId,
    selectedCommandIndex,
    setSelectedCommandIndex,
    activeMenuScreenId,
    selectedUIElementIds,
    setSelectedUIElementIds,
    activeCharacterId,
    selectedVariableId,
    setSelectedVariableId,
    onOpenInSystems,
}) => {
    const { t } = useTranslation('editorTools');
    const { project, dispatch } = useProject();

    // InGameUIEditor has its own built-in properties panel
    if (activeTab === 'ui' && uiEditorMode === 'ingame') return null;
    // When on the UI tab in 'screens' mode with no screen selected, show placeholder
    if (activeTab === 'ui' && !activeMenuScreenId && uiEditorMode === 'screens') {
        return <Panel title={t('visualNovelEditor.propertiesTitle')} style={{ width: 'var(--inspector-width)' }} className="flex-shrink-0">
            <p className="text-xs text-slate-400">{t('visualNovelEditor.selectUiScreenHint')}</p>
        </Panel>;
    }
    if (activeCharacterId) {
        // Character properties are now integrated into the unified CharacterEditor
        return null;
    }
    if (activeMenuScreenId) {
        const activeScreen = project.uiScreens[activeMenuScreenId];
        if (selectedUIElementIds.length > 0 && activeScreen) {
            const lastId = selectedUIElementIds[selectedUIElementIds.length - 1];
            const selectedElement = activeScreen.elements[lastId] as VNUIElement | undefined;

            // Dispatch on element type. Hot spots → HotSpotProperties.
            // Image maps + draggable elements → InteractiveElementProperties.
            // Everything else → the standard UIElementInspector.
            if (selectedElement) {
                const targetable = (Object.values(activeScreen.elements || {}) as VNUIElement[])
                    .filter(isInteractiveElement)
                    .map(el => ({ id: el.id, name: el.name }));
                // Drag tags already in use — power the Drag-tag / Accept-tag autocomplete. Includes
                // both draggable screen objects AND carry-to-use inventory items (so a hot spot can
                // be set to accept an item's tag without retyping it).
                const dragTagOptions = Array.from(new Set([
                    ...(Object.values(activeScreen.elements || {}) as VNUIElement[]).map(el => (el as any).dragTag),
                    ...(Object.values(project.items || {}) as any[]).map(it => it.dragTag),
                ].filter((tag): tag is string => !!tag)));
                const deleteSelectedElement = () => {
                    dispatch({ type: 'DELETE_UI_ELEMENT', payload: { screenId: activeMenuScreenId, elementId: lastId } });
                    setSelectedUIElementIds([]);
                };
                if (isHotSpotElement(selectedElement)) {
                    return (
                        <HotSpotProperties
                            spot={selectedElement}
                            project={project}
                            targetableElements={targetable}
                            dragTagOptions={dragTagOptions}
                            onUpdate={(patch) => dispatch({
                                type: 'UPDATE_UI_ELEMENT',
                                payload: { screenId: activeMenuScreenId, elementId: lastId, updates: patch as Partial<VNUIElement> },
                            })}
                            onDelete={deleteSelectedElement}
                        />
                    );
                }
                if (isInteractiveElement(selectedElement)) {
                    return (
                        <InteractiveElementProperties
                            element={selectedElement}
                            project={project}
                            targetableElements={targetable}
                            dragTagOptions={dragTagOptions}
                            onUpdate={(patch) => dispatch({
                                type: 'UPDATE_UI_ELEMENT',
                                payload: { screenId: activeMenuScreenId, elementId: lastId, updates: patch },
                            })}
                            onDelete={deleteSelectedElement}
                        />
                    );
                }
            }
            return <UIElementInspector screenId={activeMenuScreenId} elementId={lastId} setSelectedElementId={(id) => setSelectedUIElementIds(id ? [id] : [])} onOpenSystems={onOpenInSystems} />;
        }
        return <ScreenInspector screenId={activeMenuScreenId} />;
    }
    if (selectedVariableId) {
        return <PropertiesInspector
            activeSceneId={activeSceneId}
            selectedCommandIndex={selectedCommandIndex}
            setSelectedCommandIndex={setSelectedCommandIndex}
            selectedVariableId={selectedVariableId}
            setSelectedVariableId={setSelectedVariableId}
        />;
    }
    if (selectedCommandIndex !== null) {
        return <PropertiesInspector
            activeSceneId={activeSceneId}
            selectedCommandIndex={selectedCommandIndex}
            setSelectedCommandIndex={setSelectedCommandIndex}
        />;
    }
    // Scenes tab with nothing selected → show Scene Settings (contextual, like the command inspector).
    if (activeTab === 'scenes') {
        return <PropertiesInspector
            activeSceneId={activeSceneId}
            selectedCommandIndex={null}
            setSelectedCommandIndex={setSelectedCommandIndex}
            isConfigScene={true}
        />;
    }
    return null; // Other tabs handle their own inspectors internally
};

export default InspectorPanel;
