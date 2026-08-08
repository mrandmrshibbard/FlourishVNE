import React, { Suspense, useEffect, useRef, useState } from 'react';
import { pluginManager } from '../features/plugins/PluginManagerService';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import Header from './Header';
import PropertiesInspector from './PropertiesInspector';
import { VNID } from '../types';
import LivePreview from './LivePreview';
import Panel from './ui/Panel';
import InspectorPanel from './InspectorPanel';
import { isManagerWindow, isMultiWindowSupported, openManagerWindow, syncEditorContext, onPanelWindowState, onEditorContextUpdate } from '../utils/windowManager';
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
import { UsageLocation } from '../utils/variableUsage';
const AssetManager = React.lazy(() => import('./AssetManager'));
const VariableManager = React.lazy(() => import('./VariableManager'));
const SettingsManager = React.lazy(() => import('./SettingsManager'));
const CommonEventsManager = React.lazy(() => import('./CommonEventsManager'));
const SystemsManager = React.lazy(() => import('./SystemsManager'));
const MiniGamesManager = React.lazy(() => import('./MiniGamesManager'));
const StoryBibleManager = React.lazy(() => import('./story-bible/StoryBibleManager'));
const TemplateGallery = React.lazy(() => import('./templates/TemplateGallery'));
const TemplateConfigComponent = React.lazy(() => import('./templates/TemplateConfig').then(m => ({ default: m.TemplateConfigComponent })));
import InfoModal from './ui/InfoModal';
import KeyboardShortcutsModal from './ui/KeyboardShortcutsModal';
import GuidedTour from './GuidedTour';
import { PhotoIcon, Cog6ToothIcon } from './icons';
import { toggleBackgroundMusic, isBgmPlaying } from '../utils/hubAudio';
import { resolveFieldUrl } from '../utils/assetStore';
import { loadFontOnce } from '../utils/styleUtils';
import { testPlayState } from '../utils/testPlayState';
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
    // "Play from here": test play starting at a specific scene + command (set by the ▶ button on
    // a command row; cleared when the preview closes so the normal Play button is unaffected).
    const [playStartAt, setPlayStartAt] = useState<{ sceneId: VNID; index: number } | null>(null);
    // "Test this screen": test play boots straight into this UI screen (set by the ▶ button on a
    // screen row in the Screens tab; cleared when the preview closes).
    const [playStartScreenId, setPlayStartScreenId] = useState<VNID | null>(null);
    // Suspend any extensions flagged "Hide during test play" while the preview is open, restore after.
    // Also flip the global test-play flag so editor previews UNMOUNT their <video> backgrounds while
    // the full-screen preview is up (the browser evicts an off-screen video and won't auto-resume,
    // leaving it blank on return — unmount/remount fixes it). See utils/testPlayState.
    useEffect(() => { pluginManager.setTestPlayActive(isPlaying); testPlayState.set(isPlaying); }, [isPlaying]);
    const [activeTab, setActiveTab] = useState<NavigationTab>(initialTab || 'scenes');
    const [isSceneEditorCollapsed, setIsSceneEditorCollapsed] = useState(false);
    const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);
    const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
    const [showTour, setShowTour] = useState(() => !localStorage.getItem('flourish:tourCompleted'));
    const [uiEditorMode, setUiEditorMode] = useState<'screens' | 'ingame'>('screens');
    // One-shot deep link into the Systems tab (set by "Manage in Systems" links in the UI editor).
    const [systemsSelection, setSystemsSelection] = useState<{ system: 'items' | 'inventory' | 'stats'; id?: VNID } | null>(null);
    /** One-shot deep link into the Common Events tab (variable X-ray, or double-clicking an
     *  event-owned element on the scene canvas). Consumed on arrival. */
    const [commonEventSelection, setCommonEventSelection] = useState<{ eventId: VNID; commandIndex?: number } | null>(null);

    // Broadcast the editor "context" (active scene/tab + current selection) so popped-out PANEL
    // windows — currently the Properties Inspector — follow whatever editor the user is ACTIVELY
    // working in (main OR a popped-out tab). Each full editor broadcasts only while it's the focused
    // window, so the inspector tracks the last-focused editor. (Full editors never CONSUME context, so
    // there's no feedback loop.) isFocusedRef is kept truthful by real focus/blur listeners below —
    // we avoid `document.hasFocus()` at broadcast time because it reads false during DevTools/dialogs.
    const isFocusedRef = useRef<boolean>(typeof document !== 'undefined' ? document.hasFocus() : true);
    const ctxRef = useRef<any>(null);
    useEffect(() => {
        const ctx = {
            activeTab,
            uiEditorMode,
            activeSceneId,
            selectedCommandIndex,
            activeMenuScreenId,
            selectedUIElementIds,
            activeCharacterId,
            selectedVariableId,
        };
        ctxRef.current = ctx;
        (window as any).__FLOURISH_EDITOR_CONTEXT__ = ctx;
        if (isFocusedRef.current) syncEditorContext(ctx);
    }, [activeTab, uiEditorMode, activeSceneId, selectedCommandIndex, activeMenuScreenId, selectedUIElementIds, activeCharacterId, selectedVariableId]);

    // Re-broadcast this window's context when it gains focus, so switching windows (even without a new
    // click) makes a popped-out panel follow the now-active editor.
    useEffect(() => {
        const onFocus = () => { isFocusedRef.current = true; if (ctxRef.current) syncEditorContext(ctxRef.current); };
        const onBlur = () => { isFocusedRef.current = false; };
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
    }, []);

    // Adopt SELECTION broadcast by another window (e.g. selecting an element in the popped-out canvas)
    // so this editor's Properties inspector follows it. Only while this window is NOT focused, and only
    // within the SAME scene/screen (so it can't mis-select in a different one). Other navigation fields
    // (active tab/scene/screen) stay under this window's own control.
    useEffect(() => {
        onEditorContextUpdate((incoming) => {
            if (isFocusedRef.current) return;
            const cur = ctxRef.current;
            if (!cur || !incoming) return;
            if (incoming.activeMenuScreenId && incoming.activeMenuScreenId === cur.activeMenuScreenId && Array.isArray(incoming.selectedUIElementIds)) {
                setSelectedUIElementIds(incoming.selectedUIElementIds);
            }
            if (incoming.activeSceneId && incoming.activeSceneId === cur.activeSceneId && incoming.selectedCommandIndex !== undefined) {
                setSelectedCommandIndex(incoming.selectedCommandIndex);
            }
        });
    }, []);

    // Which focused PANEL windows (inspector, canvas) are popped out — this editor hides the matching
    // inline panel so the floating one can be docked beside it without a duplicate. Seeded for windows
    // opened while one is already out; kept live by the main-process broadcast. (Canvas hiding is done
    // inside SceneManager, which owns the staging area; the inspector hiding is handled here.)
    const [openPanels, setOpenPanels] = useState<{ inspector: boolean; canvas: boolean }>(
        () => ((window as any).__FLOURISH_PANELS_OPEN__ || { inspector: false, canvas: false })
    );
    useEffect(() => {
        onPanelWindowState((panels) => {
            (window as any).__FLOURISH_PANELS_OPEN__ = panels;
            setOpenPanels({ inspector: !!panels?.inspector, canvas: !!panels?.canvas });
        });
    }, []);

    // REMOVED: The useEffect hook for saving the project has been removed.
    // All changes are now held in memory until the user manually exports the project.
    // This prevents browser storage quota errors for large projects.

    // Load custom fonts into the document so they're available in the editor.
    // TWO load-bearing details (both were bugs): the stored ref MUST go through resolveFieldUrl
    // (desktop file-backed fonts are bare "assets/…" paths that 404 raw — the font then silently
    // fell back to the default face in the editor while WORKING in test play), and each font
    // registers ONCE (this effect refires on every character edit; re-parsing a big font each
    // time grew document.fonts until the renderer ran out of memory and the app crashed).
    useEffect(() => {
        const loadProjectFonts = async () => {
            const projectFonts = (project as any).fonts || {};
            for (const fontId in projectFonts) {
                const font = projectFonts[fontId];
                if (font?.fontUrl && font?.fontFamily) {
                    await loadFontOnce(font.fontFamily, resolveFieldUrl(project.id, font.fontUrl) || font.fontUrl);
                }
            }
            // Also load character custom fonts
            for (const charId in project.characters) {
                const char = project.characters[charId];
                if ((char as any).fontUrl && (char as any).fontFamily) {
                    await loadFontOnce((char as any).fontFamily, resolveFieldUrl(project.id, (char as any).fontUrl) || (char as any).fontUrl);
                }
            }
        };
        loadProjectFonts();
    }, [(project as any).fonts, project.characters, project.id]);

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
    
    // Keep a VALID expression selected — but never stomp an existing valid selection:
    // this effect re-runs on every character edit (project.characters changes identity),
    // and unconditionally picking the first expression bounced the author back to Default
    // after every single layer-image change (Brad's report). Reset only when switching
    // characters or when the selected expression no longer exists (deleted).
    useEffect(() => {
        if (!activeCharacterId) { setSelectedExpressionId(null); return; }
        const character = project.characters[activeCharacterId];
        setSelectedExpressionId(prev =>
            prev && character?.expressions?.[prev]
                ? prev
                : (character ? (Object.keys(character.expressions)[0] as VNID) ?? null : null)
        );
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
    // The reverse jump: UI editor → Systems tab with the right item list / stat selected
    // (the mirror of handleOpenScreenInUIEditor; sets the tab directly for the same reason).
    const handleOpenInSystems = (sel: { system: 'items' | 'inventory' | 'stats'; id?: VNID }) => {
        setSystemsSelection(sel);
        setActiveTab('systems');
    };
     const handleSetActiveCharacter = (id: VNID | null) => {
        setActiveCharacterId(id);
        setActiveMenuScreenId(null);
        setSelectedCommandIndex(null);
        setSelectedUIElementIds([]);
    }
    // UI editor → Characters tab with a specific character open (used by the Customizer's
    // "Edit this character's layers & art" jump). Mirrors handleOpenInSystems.
    const handleOpenCharacter = (charId: VNID) => {
        setActiveTab('characters');
        handleSetActiveCharacter(charId);
    };

    /**
     * "Take me to where this variable is used" — the Variables tab's X-ray panel.
     *
     * ORDER MATTERS: handleSetActiveScene / handleSetActiveMenuScreen both CLEAR the sub-selection, so
     * the command index / element id must be set AFTER them, not before.
     */
    const handleJumpToUsage = (loc: UsageLocation) => {
        switch (loc.area) {
            case 'scene':
                if (!loc.sceneId) return;
                setActiveTab('scenes');
                handleSetActiveScene(loc.sceneId);
                if (loc.commandIndex !== undefined) setSelectedCommandIndex(loc.commandIndex);
                break;
            case 'screen':
                if (!loc.screenId) return;
                handleOpenScreenInUIEditor(loc.screenId, loc.elementId);
                break;
            case 'commonEvent':
                // The Common Events manager owns its own selection, so this is a one-shot deep link
                // consumed on the other side — the same pattern as systemsSelection.
                setCommonEventSelection(loc.commonEventId ? { eventId: loc.commonEventId } : null);
                setActiveTab('commonEvents');
                break;
            case 'systems':
            case 'map':
                // Maps are edited from inside the Systems tab (a modal), so this lands the author in
                // the right place, one click short of the exact spot.
                handleOpenInSystems({ system: loc.statId ? 'stats' : 'items', id: loc.statId ?? loc.itemId });
                break;
            case 'miniGame':
                setActiveTab('miniGames');
                break;
            default:
                break;
        }
    };

    const renderInspector = () => (
        <InspectorPanel
            activeTab={activeTab}
            uiEditorMode={uiEditorMode}
            activeSceneId={activeSceneId}
            selectedCommandIndex={selectedCommandIndex}
            setSelectedCommandIndex={setSelectedCommandIndex}
            activeMenuScreenId={activeMenuScreenId}
            selectedUIElementIds={selectedUIElementIds}
            setSelectedUIElementIds={setSelectedUIElementIds}
            activeCharacterId={activeCharacterId}
            selectedVariableId={selectedVariableId}
            setSelectedVariableId={setSelectedVariableId}
            onOpenInSystems={handleOpenInSystems}
            onOpenCharacters={handleOpenCharacter}
        />
    );

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
    const miniGameCount = project.miniGames ? Object.keys(project.miniGames).length : 0;
    
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
                '7': 'settings',
                '8': 'miniGames',
                '9': 'storyBible'
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
                        storyBibleCount={project.storyBible?.sections?.length ?? 0}
                        systemItemCount={systemItemCount}
                        miniGameCount={miniGameCount}
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
                                onPlayFromHere={(index: number) => {
                                    if (!activeSceneId) return;
                                    if (isBgmPlaying()) toggleBackgroundMusic(false);
                                    setPlayStartAt({ sceneId: activeSceneId, index });
                                    setIsPlaying(true);
                                }}
                                onOpenCommonEvent={(eventId: VNID, commandIndex: number) => {
                                    setCommonEventSelection({ eventId, commandIndex });
                                    setActiveTab('commonEvents');
                                }}
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
                                initialEditorMode={uiEditorMode}
                                isPlaying={isPlaying}
                                onTestScreen={(screenId: VNID) => {
                                    if (isBgmPlaying()) toggleBackgroundMusic(false);
                                    setPlayStartScreenId(screenId);
                                    setIsPlaying(true);
                                }}
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
                                <VariableManager project={project} onJumpToUsage={handleJumpToUsage} />
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
                                <CommonEventsManager project={project} initialSelection={commonEventSelection} onSelectionConsumed={() => setCommonEventSelection(null)} />
                            </Suspense>
                        </ErrorBoundary>
                    ) : activeTab === 'systems' ? (
                        <ErrorBoundary panelName="Systems">
                            <Suspense fallback={<div className="text-slate-300 p-4">Loading systems…</div>}>
                                <SystemsManager project={project} onOpenScreenInEditor={handleOpenScreenInUIEditor} onOpenInGameUI={() => { setActiveTab('ui'); setUiEditorMode('ingame'); }} initialSelection={systemsSelection} onSelectionConsumed={() => setSystemsSelection(null)} />
                            </Suspense>
                        </ErrorBoundary>
                    ) : activeTab === 'miniGames' ? (
                        <ErrorBoundary panelName="Mini Games">
                            <Suspense fallback={<div className="text-slate-300 p-4">Loading mini games…</div>}>
                                <MiniGamesManager project={project} />
                            </Suspense>
                        </ErrorBoundary>
                    ) : activeTab === 'storyBible' ? (
                        <ErrorBoundary panelName="Story Bible">
                            <Suspense fallback={<div className="text-slate-300 p-4">Loading story bible…</div>}>
                                <StoryBibleManager project={project} />
                            </Suspense>
                        </ErrorBoundary>
                    ) : null}
                </div>

                {/* Properties Inspector Sidebar - Always Visible.
                    A small ⧉ button pops the inspector into its own window (desktop only); the popped
                    window follows this editor's selection via the editor-context sync channel. */}
                {(() => {
                    // Hidden while the inspector is popped out into its own window (no duplicate panel).
                    if (openPanels.inspector) return null;
                    const inspectorNode = renderInspector();
                    if (!inspectorNode) return null;
                    return (
                        <div className="relative flex-shrink-0 flex flex-col min-h-0">
                            {isMultiWindowSupported() && !isManagerWindow() && (
                                <button
                                    onClick={() => openManagerWindow('inspector')}
                                    title={t('visualNovelEditor.popOutProperties', { defaultValue: 'Open Properties in its own window' })}
                                    className="absolute top-1.5 right-1.5 z-20 w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-black/20 hover:bg-black/40 border border-[var(--border-subtle)] transition-all"
                                >
                                    ⧉
                                </button>
                            )}
                            {/* Inner scroller: Panel clips its own content (overflow-hidden), so the inline
                                inspector needs an outer scroll region — the same one the pop-out window adds.
                                Without it, tall property lists (e.g. UI screen elements) were unreachable. */}
                            <div className="flex-1 min-h-0 overflow-y-auto">
                                {inspectorNode}
                            </div>
                        </div>
                    );
                })()}
            </main>
            {isPlaying && (
                <ErrorBoundary panelName="Live Preview">
                    <LivePreview startAt={playStartAt} startScreenId={playStartScreenId} onClose={() => {
                        setIsPlaying(false);
                        setPlayStartAt(null);
                        setPlayStartScreenId(null);
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
