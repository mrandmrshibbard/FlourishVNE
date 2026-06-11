import React, { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import Header from './Header';
import PropertiesInspector from './PropertiesInspector';
import { VNID } from '../types';
import LivePreview from './LivePreview';
import Panel from './ui/Panel';
import NavigationTabs, { NavigationTab } from './NavigationTabs';
import SceneManager from './SceneManager';
import CharacterManager from './CharacterManager';
import UIManager from './UIManager';
import ErrorBoundary from './ErrorBoundary';
import ScreenInspector from './menu-editor/ScreenInspector';
import UIElementInspector from './menu-editor/UIElementInspector';
import { HotSpotProperties, InteractiveElementProperties } from './interactive-elements/InteractiveElementInspectors';
import { isHotSpotElement, isInteractiveElement } from '../utils/interactiveElements';
import { VNUIElement } from '../features/ui/types';
const AssetManager = React.lazy(() => import('./AssetManager'));
const VariableManager = React.lazy(() => import('./VariableManager'));
const SettingsManager = React.lazy(() => import('./SettingsManager'));
const CommonEventsManager = React.lazy(() => import('./CommonEventsManager'));
const SystemsManager = React.lazy(() => import('./SystemsManager'));
const TemplateGallery = React.lazy(() => import('./templates/TemplateGallery'));
const TemplateConfigComponent = React.lazy(() => import('./templates/TemplateConfig').then(m => ({ default: m.TemplateConfigComponent })));
import InfoModal from './ui/InfoModal';
import KeyboardShortcutsModal from './ui/KeyboardShortcutsModal';
import GuidedTour from './GuidedTour';
import { PhotoIcon, Cog6ToothIcon } from './icons';
import { toggleBackgroundMusic, isBgmPlaying } from '../utils/hubAudio';
import { TemplateService } from '../features/templates/TemplateService';
import { TemplateGenerator } from '../features/templates/TemplateGenerator';
import { Template, TemplateConfig as TConfig } from '../types/template';

// Create service instances
const templateService = new TemplateService();
const templateGenerator = new TemplateGenerator();

function isEditorDebugEnabled(): boolean {
    try {
        return window.localStorage.getItem('flourish:editorDebug') === '1';
    } catch {
        return false;
    }
}

function editorDebugLog(...args: unknown[]): void {
    if (!isEditorDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log(...args);
}


const VisualNovelEditor: React.FC<{ onExit: () => void; initialTab?: NavigationTab }> = ({ onExit, initialTab }) => {
    const { t } = useTranslation('editorTools');
    const { project, dispatch } = useProject();
    const [activeSceneId, setActiveSceneId] = useState<VNID>(project.startSceneId);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState<number | null>(null);
    const [activeMenuScreenId, setActiveMenuScreenId] = useState<VNID | null>(null);
    const [selectedUIElementIds, setSelectedUIElementIds] = useState<VNID[]>([]);
    const [activeCharacterId, setActiveCharacterId] = useState<VNID | null>(null);
    const [selectedExpressionId, setSelectedExpressionId] = useState<VNID | null>(null);
    const [selectedVariableId, setSelectedVariableId] = useState<VNID | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeTab, setActiveTab] = useState<NavigationTab>(initialTab || 'scenes');
    const [isSceneEditorCollapsed, setIsSceneEditorCollapsed] = useState(false);
    const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
    const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
    const [showTour, setShowTour] = useState(() => !localStorage.getItem('flourish:tourCompleted'));
    const [uiEditorMode, setUiEditorMode] = useState<'screens' | 'ingame'>('screens');

    // REMOVED: The useEffect hook for saving the project has been removed.
    // All changes are now held in memory until the user manually exports the project.
    // This prevents browser storage quota errors for large projects.

    // Load custom fonts into the document so they're available in the editor
    useEffect(() => {
        const loadProjectFonts = async () => {
            const projectFonts = (project as any).fonts || {};
            for (const fontId in projectFonts) {
                const font = projectFonts[fontId];
                if (font?.fontUrl && font?.fontFamily) {
                    try {
                        const fontFace = new FontFace(font.fontFamily, `url(${font.fontUrl})`);
                        await fontFace.load();
                        (document as any).fonts.add(fontFace);
                        console.log(`✓ Loaded project font: ${font.fontFamily}`);
                    } catch (error) {
                        console.error(`Failed to load project font ${font?.name || fontId}:`, error);
                    }
                }
            }
            // Also load character custom fonts
            for (const charId in project.characters) {
                const char = project.characters[charId];
                if ((char as any).fontUrl && (char as any).fontFamily) {
                    try {
                        const fontFace = new FontFace((char as any).fontFamily, `url(${(char as any).fontUrl})`);
                        await fontFace.load();
                        (document as any).fonts.add(fontFace);
                    } catch (error) {
                        console.error(`Failed to load custom font for ${char.name}:`, error);
                    }
                }
            }
        };
        loadProjectFonts();
    }, [(project as any).fonts, project.characters]);

    // ADDED: Warn user before leaving the page to prevent data loss.
    // Skip this warning in Electron since it prevents the app from closing.
    useEffect(() => {
        // Detect if running in Electron
        const isElectron = navigator.userAgent.toLowerCase().includes('electron');
        
        if (isElectron) {
            // Skip beforeunload warning in Electron to allow app to close normally
            return;
        }

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            // This message is often not displayed by modern browsers, but setting returnValue is necessary to trigger the prompt.
            e.returnValue = 'You have unsaved changes that will be lost. Are you sure you want to leave?';
            return e.returnValue;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // Keyboard shortcut for help (? key)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if in input/textarea
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }
            // ? key (with or without shift)
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                e.preventDefault();
                setShowKeyboardShortcuts(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    
    useEffect(() => {
        if (activeCharacterId) {
            const character = project.characters[activeCharacterId];
            const firstExprId = character && Object.keys(character.expressions)[0];
            setSelectedExpressionId(firstExprId || null);
        } else {
            setSelectedExpressionId(null);
        }
    }, [activeCharacterId, project.characters]);

    const handleTitleChange = (newTitle: string) => {
        dispatch({ type: 'UPDATE_PROJECT_TITLE', payload: { title: newTitle } });
    };

    const handleSetActiveScene = (id: VNID) => {
        setActiveSceneId(id);
        setSelectedCommandIndex(null);
        setActiveMenuScreenId(null);
        setActiveCharacterId(null);
    }
    const handleSetActiveMenuScreen = (id: VNID | null) => {
        setActiveMenuScreenId(id);
        setSelectedCommandIndex(null);
        setSelectedUIElementIds([]);
        setActiveCharacterId(null);
    }
    // Switch to the UI editor with a specific screen selected (used by the Systems hub to jump to a
    // freshly-created inventory screen). Sets the tab directly (not handleTabChange, which would reset
    // the selection to the first screen).
    const handleOpenScreenInUIEditor = (screenId: VNID, elementId?: VNID) => {
        setActiveTab('ui');
        handleSetActiveMenuScreen(screenId);
        // Auto-select the element (e.g. the inventory grid) so its inspector (rows, spacing, Use
        // button, etc.) shows immediately — handleSetActiveMenuScreen clears the selection, so set after.
        if (elementId) setSelectedUIElementIds([elementId]);
    };
     const handleSetActiveCharacter = (id: VNID | null) => {
        setActiveCharacterId(id);
        setActiveMenuScreenId(null);
        setSelectedCommandIndex(null);
        setSelectedUIElementIds([]);
    }

    const renderInspector = () => {
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
                                onUpdate={(patch) => dispatch({
                                    type: 'UPDATE_UI_ELEMENT',
                                    payload: { screenId: activeMenuScreenId, elementId: lastId, updates: patch },
                                })}
                                onDelete={deleteSelectedElement}
                            />
                        );
                    }
                }
                return <UIElementInspector screenId={activeMenuScreenId} elementId={lastId} setSelectedElementId={(id) => setSelectedUIElementIds(id ? [id] : [])} />;
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
    }

    // Calculate tab counts
    const sceneCount = project.scenes ? Object.keys(project.scenes).length : 0;
    const characterCount = project.characters ? Object.keys(project.characters).length : 0;
    const uiScreenCount = project.uiScreens ? Object.keys(project.uiScreens).length : 0;
    const assetCount = (project.backgrounds ? Object.keys(project.backgrounds).length : 0) +
                      (project.images ? Object.keys(project.images).length : 0) +
                      (project.audio ? Object.keys(project.audio).length : 0) +
                      (project.videos ? Object.keys(project.videos).length : 0);
    const variableCount = project.variables ? Object.keys(project.variables).length : 0;
    const commonEventCount = (project as any).commonEvents ? Object.keys((project as any).commonEvents).length : 0;
    const systemItemCount = project.items ? Object.keys(project.items).length : 0;
    
    // Template system integration
    const [selectedTemplateId, setSelectedTemplateId] = useState<VNID | undefined>(undefined);
    const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);
    const [configuringTemplate, setConfiguringTemplate] = useState<Template | null>(null);
    const [templateConfigDraft, setTemplateConfigDraft] = useState<TConfig | null>(null);
    const [isTemplateConfigValid, setIsTemplateConfigValid] = useState(true);
    
    // Modal state
    const [modalState, setModalState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
    }>({
        isOpen: false,
        title: '',
        message: ''
    });
    
    const showModal = (title: string, message: string) => {
        setModalState({ isOpen: true, title, message });
    };
    
    const closeModal = () => {
        setModalState({ isOpen: false, title: '', message: '' });
    };
    
    const handleSelectTemplate = (template: any) => {
        setSelectedTemplateId(template.id);
        editorDebugLog('Template selected:', template);
    };
    
    const handlePreviewTemplate = (template: any) => {
        setPreviewTemplate(template);
        editorDebugLog('Previewing template:', template);
        
        // Show template details in a modal
        const details = `${template.description}\n\nCategory: ${template.category}\nVersion: ${template.version}\nTags: ${template.tags.join(', ')}\n\nClick "Apply" to use this template.`;
        showModal(template.name, details);
    };
    
    const applyTemplateWithConfig = async (template: Template, config: TConfig) => {
        editorDebugLog('Applying template:', template);
        try {
            // Deep clone the config so the TemplateGenerator can inject variable IDs
            const clonedConfig = JSON.parse(JSON.stringify(config));

            // Generate the template content
            const result = await templateGenerator.generateInstance(
                template,
                clonedConfig,
                project.id,
                {
                    validateBeforeGeneration: true,
                    trackUsage: true,
                    generateIds: true
                }
            );

            if (!result.success) {
                showModal(t('visualNovelEditor.templateApplyFailed'), result.errors.join('\n'));
                return;
            }

            // Add generated UI screens to project
            if (result.generatedScreens && result.generatedScreens.length > 0) {
                result.generatedScreens.forEach(screen => {
                    // Add the screen with its ID and name
                    dispatch({
                        type: 'ADD_UI_SCREEN',
                        payload: {
                            name: screen.name,
                            id: screen.id
                        }
                    });

                    // Then update it with the full structure
                    dispatch({
                        type: 'UPDATE_UI_SCREEN',
                        payload: {
                            screenId: screen.id,
                            updates: {
                                background: screen.background,
                                music: screen.music,
                                ambientNoise: screen.ambientNoise,
                                transitionIn: screen.transitionIn,
                                transitionOut: screen.transitionOut,
                                transitionDuration: screen.transitionDuration,
                                showDialogue: screen.showDialogue
                            }
                        }
                    });

                    // Add each UI element
                    Object.values(screen.elements).forEach(element => {
                        dispatch({
                            type: 'ADD_UI_ELEMENT',
                            payload: {
                                screenId: screen.id,
                                element: element
                            }
                        });
                    });
                });
            }

            // Add generated variables to project
            if (result.generatedVariables && result.generatedVariables.length > 0) {
                result.generatedVariables.forEach(variable => {
                    dispatch({
                        type: 'ADD_VARIABLE',
                        payload: {
                            id: variable.id,
                            name: variable.name,
                            type: variable.type,
                            defaultValue: variable.defaultValue
                        }
                    });
                });
            }

            // Show success message
            const message =
                t('visualNovelEditor.templateAppliedMsg', {
                    screens: result.generatedScreens.length,
                    variables: result.generatedVariables.length,
                }) +
                (result.warnings.length > 0 ? t('visualNovelEditor.templateAppliedWarnings', { warnings: result.warnings.join('\n') }) : '');

            showModal(t('visualNovelEditor.templateAppliedTitle', { name: template.name }), message);

            // Switch to UI tab to show the new screen
            if (result.generatedScreens.length > 0) {
                setActiveTab('ui');
                handleSetActiveMenuScreen(result.generatedScreens[0].id as VNID);
            }
        } catch (error) {
            console.error('Failed to apply template:', error);
            showModal(t('visualNovelEditor.templateApplyError'), t('visualNovelEditor.templateApplyErrorMsg'));
        }
    };

    const handleApplyTemplate = async (template: Template) => {
        // Open the configurator (no-code) instead of applying immediately.
        setConfiguringTemplate(template);
        setTemplateConfigDraft(JSON.parse(JSON.stringify(template.defaultConfig)));
        setIsTemplateConfigValid(true);
    };

    const handleTabChange = (tab: NavigationTab) => {
        setActiveTab(tab);
        if (tab === 'scenes') {
            handleSetActiveScene(activeSceneId); // This will clear other active states
        } else if (tab === 'characters') {
            // Switch to characters - set first character as active if available
            const firstCharacterId = project.characters ? (Object.keys(project.characters)[0] as VNID | undefined) : undefined;
            handleSetActiveCharacter(firstCharacterId || null);
        } else if (tab === 'ui') {
            // Switch to UI screens - set first screen as active if available
            const firstScreenId = project.uiScreens ? (Object.keys(project.uiScreens)[0] as VNID | undefined) : undefined;
            handleSetActiveMenuScreen(firstScreenId || null);
        } else {
            // For assets, variables, settings, templates tabs - clear all active states
            setActiveSceneId(project.startSceneId);
            setSelectedCommandIndex(null);
            setActiveMenuScreenId(null);
            setSelectedUIElementIds([]);
            setActiveCharacterId(null);
            setSelectedExpressionId(null);
            setSelectedVariableId(null);
        }
    };

    // Add keyboard navigation for tabs (1-7 keys)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input field
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            // Map number keys 1-8 to tabs
            const tabMap: Record<string, NavigationTab> = {
                '1': 'scenes',
                '2': 'characters',
                '3': 'ui',
                '4': 'assets',
                '5': 'variables',
                '6': 'commonEvents',
                '7': 'settings'
            };

            const newTab = tabMap[e.key];
            if (newTab) {
                e.preventDefault();
                handleTabChange(newTab);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeSceneId, project.startSceneId, project.characters, project.uiScreens]);

    return (
        <div 
            className="text-slate-100 h-screen flex flex-col relative overflow-hidden"
            style={{
                background: `
                    radial-gradient(ellipse at 10% 20%, rgba(255, 126, 179, 0.08) 0%, transparent 40%),
                    radial-gradient(ellipse at 90% 80%, rgba(126, 255, 255, 0.06) 0%, transparent 40%),
                    radial-gradient(ellipse at 50% 50%, rgba(184, 126, 255, 0.05) 0%, transparent 50%),
                    radial-gradient(ellipse at 80% 20%, rgba(126, 255, 184, 0.04) 0%, transparent 35%),
                    linear-gradient(180deg, var(--bg-primary) 0%, #080510 100%)
                `
            }}
        >
            <Header
                title={project.title}
                onTitleChange={handleTitleChange}
                onPlay={() => {
                    // Stop hub background music before starting live preview
                    if (isBgmPlaying()) {
                        toggleBackgroundMusic(false);
                    }
                    setIsPlaying(true);
                }}
                onExit={onExit}
                navigationTabs={
                    <NavigationTabs
                        activeTab={activeTab}
                        onTabChange={handleTabChange}
                        sceneCount={sceneCount}
                        characterCount={characterCount}
                        uiScreenCount={uiScreenCount}
                        assetCount={assetCount}
                        variableCount={variableCount}
                        commonEventCount={commonEventCount}
                        systemItemCount={systemItemCount}
                    />
                }
                onShowKeyboardShortcuts={() => setShowKeyboardShortcuts(true)}
            />
            <main className="flex-grow flex overflow-hidden">
                {/* Main Content Area - Full Width Managers */}
                <div className="flex-1 flex flex-col min-w-0">
                    {configuringTemplate && templateConfigDraft ? (
                        <div className="flex-1 overflow-auto p-4">
                            <Suspense fallback={<div className="text-slate-300">{t('visualNovelEditor.loadingTemplateConfigurator')}</div>}>
                                <TemplateConfigComponent
                                    template={configuringTemplate}
                                    initialConfig={templateConfigDraft}
                                    onConfigChange={(cfg, isValid) => {
                                        setTemplateConfigDraft(cfg);
                                        setIsTemplateConfigValid(isValid);
                                    }}
                                    onCancel={() => {
                                        setConfiguringTemplate(null);
                                        setTemplateConfigDraft(null);
                                    }}
                                    onSave={async (cfg) => {
                                        if (!isTemplateConfigValid) {
                                            showModal(t('visualNovelEditor.fixTemplateSettings'), t('visualNovelEditor.fixTemplateSettingsMsg'));
                                            return;
                                        }
                                        const tpl = configuringTemplate;
                                        setConfiguringTemplate(null);
                                        setTemplateConfigDraft(null);
                                        await applyTemplateWithConfig(tpl, cfg);
                                    }}
                                    showPreview={true}
                                />
                            </Suspense>
                        </div>
                    ) : activeTab === 'scenes' ? (
                        <ErrorBoundary panelName="Scene Manager">
                            <SceneManager
                                project={project}
                                activeSceneId={activeSceneId}
                                setActiveSceneId={handleSetActiveScene}
                                selectedCommandIndex={selectedCommandIndex}
                                setSelectedCommandIndex={setSelectedCommandIndex}
                                setSelectedVariableId={setSelectedVariableId}
                                onConfigureScene={() => {
                                    // Scene Settings is the inspector's default when nothing is selected,
                                    // so the header button just clears the command selection to reveal it.
                                    setSelectedCommandIndex(null);
                                }}
                                isCollapsed={isSceneEditorCollapsed}
                                onToggleCollapse={() => setIsSceneEditorCollapsed(prev => !prev)}
                            />
                        </ErrorBoundary>
                    ) : activeTab === 'characters' ? (
                        <ErrorBoundary panelName="Character Manager">
                            <CharacterManager
                                project={project}
                                activeCharacterId={activeCharacterId}
                                setActiveCharacterId={handleSetActiveCharacter}
                                selectedExpressionId={selectedExpressionId}
                                setSelectedExpressionId={setSelectedExpressionId}
                            />
                        </ErrorBoundary>
                    ) : activeTab === 'ui' ? (
                        <ErrorBoundary panelName="UI Manager">
                            <UIManager
                                project={project}
                                activeMenuScreenId={activeMenuScreenId}
                                setActiveMenuScreenId={handleSetActiveMenuScreen}
                                selectedUIElementIds={selectedUIElementIds}
                                setSelectedUIElementIds={setSelectedUIElementIds}
                                onEditorModeChange={setUiEditorMode}
                                isPlaying={isPlaying}
                            />
                        </ErrorBoundary>
                    ) : activeTab === 'assets' ? (
                        <ErrorBoundary panelName="Asset Manager">
                            <Suspense fallback={<div className="text-slate-300 p-4">{t('visualNovelEditor.loadingAssets')}</div>}>
                                <AssetManager project={project} />
                            </Suspense>
                        </ErrorBoundary>
                    ) : activeTab === 'variables' ? (
                        <ErrorBoundary panelName="Variable Manager">
                            <Suspense fallback={<div className="text-slate-300 p-4">{t('visualNovelEditor.loadingVariables')}</div>}>
                                <VariableManager project={project} />
                            </Suspense>
                        </ErrorBoundary>
                    ) : activeTab === 'settings' ? (
                        <ErrorBoundary panelName="Settings">
                            <Suspense fallback={<div className="text-slate-300 p-4">{t('visualNovelEditor.loadingSettings')}</div>}>
                                <SettingsManager project={project} />
                            </Suspense>
                        </ErrorBoundary>
                    ) : activeTab === 'commonEvents' ? (
                        <ErrorBoundary panelName="Common Events">
                            <Suspense fallback={<div className="text-slate-300 p-4">{t('visualNovelEditor.loadingCommonEvents')}</div>}>
                                <CommonEventsManager project={project} />
                            </Suspense>
                        </ErrorBoundary>
                    ) : activeTab === 'systems' ? (
                        <ErrorBoundary panelName="Systems">
                            <Suspense fallback={<div className="text-slate-300 p-4">Loading systems…</div>}>
                                <SystemsManager project={project} onOpenScreenInEditor={handleOpenScreenInUIEditor} />
                            </Suspense>
                        </ErrorBoundary>
                    ) : null}
                </div>

                {/* Properties Inspector Sidebar - Always Visible */}
                {renderInspector()}
            </main>
            {isPlaying && (
                <ErrorBoundary panelName="Live Preview">
                    <LivePreview onClose={() => {
                        setIsPlaying(false);
                        // Tell the editor canvases to remount their <video> backgrounds — the browser
                        // evicts videos that sat behind the fullscreen preview and won't auto-resume.
                        try { window.dispatchEvent(new CustomEvent('flourish:playended')); } catch { /* no-op */ }
                    }} />
                </ErrorBoundary>
            )}
            
            {/* Info Modal */}
            <InfoModal
                isOpen={modalState.isOpen}
                onClose={closeModal}
                title={modalState.title}
            >
                {modalState.message}
            </InfoModal>
            
            {/* Keyboard Shortcuts Modal */}
            <KeyboardShortcutsModal
                isOpen={showKeyboardShortcuts}
                onClose={() => setShowKeyboardShortcuts(false)}
            />
            
            {/* Guided Tour */}
            <GuidedTour isActive={showTour} onComplete={() => setShowTour(false)} />
        </div>
    );
};

export default VisualNovelEditor;
