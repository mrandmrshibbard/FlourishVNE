import React, { useState, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import Header from './Header';
import ResourceManager from './ResourceManager';
import SceneEditor from './SceneEditor';
import PropertiesInspector from './PropertiesInspector';
import StagingArea from './StagingArea';
import { VNID } from '../types';
import MenuEditor from './menu-editor/MenuEditor';
import LivePreview from './LivePreview';
import ScreenInspector from './menu-editor/ScreenInspector';
import UIElementInspector from './menu-editor/UIElementInspector';
import Panel from './ui/Panel';
import CharacterEditor from './CharacterEditor';
import CharacterInspector from './CharacterInspector';
import NavigationTabs, { NavigationTab } from './NavigationTabs';
import SceneManager from './SceneManager';
import CharacterManager from './CharacterManager';
import UIManager from './UIManager';
import AssetManager from './AssetManager';
import VariableManager from './VariableManager';
import SettingsManager from './SettingsManager';
import OnboardingModal from './ui/OnboardingModal';
import { PhotoIcon, Cog6ToothIcon } from './icons';


const VisualNovelEditor: React.FC<{ onExit: () => void; initialTab?: string | null; isChildWindow?: boolean }> = ({ onExit, initialTab, isChildWindow = false }) => {
    const { project, dispatch } = useProject();
    const [activeSceneId, setActiveSceneId] = useState<VNID>(project.startSceneId);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState<number | null>(null);
    const [activeMenuScreenId, setActiveMenuScreenId] = useState<VNID | null>(null);
    const [selectedUIElementId, setSelectedUIElementId] = useState<VNID | null>(null);
    const [activeCharacterId, setActiveCharacterId] = useState<VNID | null>(null);
    const [selectedExpressionId, setSelectedExpressionId] = useState<VNID | null>(null);
    const [selectedVariableId, setSelectedVariableId] = useState<VNID | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeTab, setActiveTab] = useState<NavigationTab>(initialTab as NavigationTab || 'scenes');
    const [isSceneEditorCollapsed, setIsSceneEditorCollapsed] = useState(false);
    const [isConfiguringScene, setIsConfiguringScene] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    
    // Detect if running in Electron
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');

    // Sync project changes to localStorage for child windows in Electron
    useEffect(() => {
        if (isElectron) {
            localStorage.setItem('flourish-active-project', JSON.stringify(project));
        }
    }, [project, isElectron]);

    // ADDED: Warn user before leaving the page to prevent data loss.
    // Skip this warning in Electron since it prevents the app from closing.
    useEffect(() => {
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
    }, [isElectron]);
    
    // Listen for Electron IPC messages
    useEffect(() => {
        if (!isElectron || !(window as any).electronAPI) return;
        
        const electronAPI = (window as any).electronAPI;
        
        electronAPI.onSwitchTab((tab: NavigationTab) => {
            setActiveTab(tab);
        });
        
        electronAPI.onTriggerPlay(() => {
            setIsPlaying(true);
        });
        
        return () => {
            if (electronAPI.removeAllListeners) {
                electronAPI.removeAllListeners('switch-tab');
                electronAPI.removeAllListeners('trigger-play');
            }
        };
    }, [isElectron]);
    
    // Listen for storage changes from other windows (for syncing project data)
    useEffect(() => {
        if (!isElectron || isChildWindow) return; // Don't sync if this IS a child window
        
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'flourish-active-project' && e.newValue) {
                try {
                    const updatedProject = JSON.parse(e.newValue);
                    // Only reload if project ID matches but content differs
                    if (updatedProject.id === project.id && JSON.stringify(updatedProject) !== JSON.stringify(project)) {
                        // Instead of reloading, just log - the useEffect on line 46 will handle the sync
                        console.log('[VisualNovelEditor] Project updated from child window');
                    }
                } catch (error) {
                    console.error('Failed to sync project update:', error);
                }
            }
        };
        
        window.addEventListener('storage', handleStorageChange);
        
        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [isElectron, isChildWindow, project]);
    
    // Add Escape key handler for child windows
    useEffect(() => {
        if (!isChildWindow) return;
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                window.close();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isChildWindow]);
    
    useEffect(() => {
        // Check if user has seen onboarding before
        const hasSeenOnboarding = localStorage.getItem('flourish-onboarding-seen');
        if (!hasSeenOnboarding) {
            // Delay showing onboarding to let the app load first
            const timer = setTimeout(() => {
                setShowOnboarding(true);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, []);

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
        setSelectedUIElementId(null); 
        setActiveCharacterId(null);
    }
     const handleSetActiveCharacter = (id: VNID | null) => {
        setActiveCharacterId(id);
        setActiveMenuScreenId(null);
        setSelectedCommandIndex(null);
        setSelectedUIElementId(null);
    }

    const renderInspector = () => {
        // Only render inspector for scenes tab
        // Other managers (UI, Characters, Assets, Variables, Settings) handle their own layout internally
        if (activeTab === 'ui' || activeTab === 'characters' || activeTab === 'assets' || activeTab === 'variables' || activeTab === 'settings') {
            return null;
        }
        
        if (isConfiguringScene) {
            return <PropertiesInspector
                activeSceneId={activeSceneId}
                selectedCommandIndex={null}
                setSelectedCommandIndex={setSelectedCommandIndex}
                isConfigScene={true}
                onCloseSceneConfig={() => setIsConfiguringScene(false)}
            />;
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
        // Show scene properties when in scenes tab and no specific item selected
        if (activeTab === 'scenes' && selectedCommandIndex === null && !isConfiguringScene) {
            return <PropertiesInspector
                activeSceneId={activeSceneId}
                selectedCommandIndex={null}
                setSelectedCommandIndex={setSelectedCommandIndex}
                showSceneProperties={true}
            />;
        }
        return <Panel title="Properties" className="w-80 flex-shrink-0"><p className="text-slate-400 text-sm">Select an item to see its properties.</p></Panel>
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
        }
        // For assets, variables, and settings tabs, we don't need to set any active IDs
    };
    return (
        <div className="bg-slate-900 text-slate-100 h-screen flex flex-col min-w-[1200px] overflow-x-auto border-4 border-slate-700/50">
            {!isChildWindow && (
                <>
                    {!isElectron && (
                        <Header
                            title={project.title}
                            onTitleChange={handleTitleChange}
                            onPlay={() => setIsPlaying(true)}
                            onExit={onExit}
                        />
                    )}
                    {isElectron && (
                        <Header
                            title={project.title}
                            onTitleChange={handleTitleChange}
                            onPlay={() => setIsPlaying(true)}
                            onExit={onExit}
                        />
                    )}
                </>
            )}
            <main className="flex-grow flex gap-4 p-4">
                {/* Main Content Area - Always show SceneManager in Electron, tabs in browser */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    {isElectron ? (
                        // In Electron: Always show scenes unless this is a child window with different tab
                        activeTab === 'scenes' ? (
                            <SceneManager
                                project={project}
                                activeSceneId={activeSceneId}
                                setActiveSceneId={handleSetActiveScene}
                                selectedCommandIndex={selectedCommandIndex}
                                setSelectedCommandIndex={setSelectedCommandIndex}
                                setSelectedVariableId={setSelectedVariableId}
                                onConfigureScene={() => {
                                    setIsConfiguringScene(true);
                                    setSelectedCommandIndex(null);
                                }}
                                isCollapsed={isSceneEditorCollapsed}
                                onToggleCollapse={() => setIsSceneEditorCollapsed(prev => !prev)}
                            />
                        ) : activeTab === 'characters' ? (
                            <CharacterManager
                                project={project}
                                activeCharacterId={activeCharacterId}
                                setActiveCharacterId={handleSetActiveCharacter}
                                selectedExpressionId={selectedExpressionId}
                                setSelectedExpressionId={setSelectedExpressionId}
                            />
                        ) : activeTab === 'ui' ? (
                            <UIManager
                                project={project}
                                activeMenuScreenId={activeMenuScreenId}
                                setActiveMenuScreenId={handleSetActiveMenuScreen}
                                selectedUIElementId={selectedUIElementId}
                                setSelectedUIElementId={setSelectedUIElementId}
                            />
                        ) : activeTab === 'assets' ? (
                            <AssetManager />
                        ) : activeTab === 'variables' ? (
                            <VariableManager project={project} />
                        ) : activeTab === 'settings' ? (
                            <SettingsManager project={project} />
                        ) : null
                    ) : (
                        // In Browser: Show tab navigation with all managers
                        <>
                            <NavigationTabs
                                activeTab={activeTab}
                                onTabChange={handleTabChange}
                                sceneCount={sceneCount}
                                characterCount={characterCount}
                                uiScreenCount={uiScreenCount}
                                assetCount={assetCount}
                                variableCount={variableCount}
                            />
                            {activeTab === 'scenes' ? (
                                <SceneManager
                                    project={project}
                                    activeSceneId={activeSceneId}
                                    setActiveSceneId={handleSetActiveScene}
                                    selectedCommandIndex={selectedCommandIndex}
                                    setSelectedCommandIndex={setSelectedCommandIndex}
                                    setSelectedVariableId={setSelectedVariableId}
                                    onConfigureScene={() => {
                                        setIsConfiguringScene(true);
                                        setSelectedCommandIndex(null);
                                    }}
                                    isCollapsed={isSceneEditorCollapsed}
                                    onToggleCollapse={() => setIsSceneEditorCollapsed(prev => !prev)}
                                />
                            ) : activeTab === 'characters' ? (
                                <CharacterManager
                                    project={project}
                                    activeCharacterId={activeCharacterId}
                                    setActiveCharacterId={handleSetActiveCharacter}
                                    selectedExpressionId={selectedExpressionId}
                                    setSelectedExpressionId={setSelectedExpressionId}
                                />
                            ) : activeTab === 'ui' ? (
                                <UIManager
                                    project={project}
                                    activeMenuScreenId={activeMenuScreenId}
                                    setActiveMenuScreenId={handleSetActiveMenuScreen}
                                    selectedUIElementId={selectedUIElementId}
                                    setSelectedUIElementId={setSelectedUIElementId}
                                />
                            ) : activeTab === 'assets' ? (
                                <AssetManager />
                            ) : activeTab === 'variables' ? (
                                <VariableManager project={project} />
                            ) : activeTab === 'settings' ? (
                                <SettingsManager project={project} />
                            ) : null}
                        </>
                    )}
                </div>

                {/* Properties Inspector Sidebar */}
                {renderInspector()}
            </main>
            {isPlaying && <LivePreview onClose={() => setIsPlaying(false)} />}
            <OnboardingModal
                isOpen={showOnboarding}
                onClose={() => setShowOnboarding(false)}
                onComplete={() => {
                    localStorage.setItem('flourish-onboarding-seen', 'true');
                    setShowOnboarding(false);
                }}
            />
        </div>
    );
};

export default VisualNovelEditor;
