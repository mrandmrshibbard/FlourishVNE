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
import TemplateGallery from './templates/TemplateGallery';
import InfoModal from './ui/InfoModal';
import { PhotoIcon, Cog6ToothIcon } from './icons';
import { TemplateService } from '../features/templates/TemplateService';
import { TemplateGenerator } from '../features/templates/TemplateGenerator';
import { Template } from '../types/template';

// Create service instances
const templateService = new TemplateService();
const templateGenerator = new TemplateGenerator();


const VisualNovelEditor: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    const { project, dispatch } = useProject();
    const [activeSceneId, setActiveSceneId] = useState<VNID>(project.startSceneId);
    const [selectedCommandIndex, setSelectedCommandIndex] = useState<number | null>(null);
    const [activeMenuScreenId, setActiveMenuScreenId] = useState<VNID | null>(null);
    const [selectedUIElementId, setSelectedUIElementId] = useState<VNID | null>(null);
    const [activeCharacterId, setActiveCharacterId] = useState<VNID | null>(null);
    const [selectedExpressionId, setSelectedExpressionId] = useState<VNID | null>(null);
    const [selectedVariableId, setSelectedVariableId] = useState<VNID | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeTab, setActiveTab] = useState<NavigationTab>('scenes');
    const [isSceneEditorCollapsed, setIsSceneEditorCollapsed] = useState(false);
    const [isConfiguringScene, setIsConfiguringScene] = useState(false);
    const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false);

    // REMOVED: The useEffect hook for saving the project has been removed.
    // All changes are now held in memory until the user manually exports the project.
    // This prevents browser storage quota errors for large projects.

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
    
    useEffect(() => {
        if (activeCharacterId) {
            const character = project.characters[activeCharacterId];
            const firstExprId = character && Object.keys(character.expressions)[0];
            setSelectedExpressionId(firstExprId || null);
        } else {
            setSelectedExpressionId(null);
        }
    }, [activeCharacterId, project.characters]);

    // Add keyboard navigation for tabs (1-6 keys)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input field
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            // Map number keys 1-7 to tabs
            const tabMap: Record<string, NavigationTab> = {
                '1': 'scenes',
                '2': 'characters',
                '3': 'ui',
                '4': 'assets',
                '5': 'variables',
                '6': 'settings',
                '7': 'templates'
            };

            const newTab = tabMap[e.key];
            if (newTab) {
                e.preventDefault();
                setActiveTab(newTab);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
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
        if (isConfiguringScene) {
            return <PropertiesInspector
                activeSceneId={activeSceneId}
                selectedCommandIndex={null}
                setSelectedCommandIndex={setSelectedCommandIndex}
                isConfigScene={true}
                onCloseSceneConfig={() => setIsConfiguringScene(false)}
            />;
        }
        if (activeCharacterId) {
            return <CharacterInspector 
                activeCharacterId={activeCharacterId} 
                selectedExpressionId={selectedExpressionId}
                setSelectedExpressionId={setSelectedExpressionId}
            />;
        }
        if (activeMenuScreenId) {
            if (selectedUIElementId) {
                return <UIElementInspector screenId={activeMenuScreenId} elementId={selectedUIElementId} setSelectedElementId={setSelectedUIElementId} />;
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
        // Always show properties panel for scenes tab, even if nothing selected
        if (activeTab === 'scenes') {
            return <Panel title="Properties" style={{ width: 'var(--inspector-width)' }} className="flex-shrink-0">
                <p className="text-xs text-slate-400">Select a command to edit properties.</p>
            </Panel>;
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
    
    // Template system integration
    const [selectedTemplateId, setSelectedTemplateId] = useState<VNID | undefined>(undefined);
    const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);
    
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
        console.log('Template selected:', template);
    };
    
    const handlePreviewTemplate = (template: any) => {
        setPreviewTemplate(template);
        console.log('Previewing template:', template);
        
        // Show template details in a modal
        const details = `${template.description}\n\nCategory: ${template.category}\nVersion: ${template.version}\nTags: ${template.tags.join(', ')}\n\nClick "Apply" to use this template.`;
        showModal(template.name, details);
    };
    
    const handleApplyTemplate = async (template: Template) => {
        console.log('Applying template:', template);
        try {
            // Use the template's default config for now
            // TODO: Add configuration UI for users to customize before applying
            // Deep clone the config so the TemplateGenerator can inject variable IDs
            const config = JSON.parse(JSON.stringify(template.defaultConfig));
            
            // Generate the template content
            const result = await templateGenerator.generateInstance(
                template,
                config,
                project.id,
                {
                    validateBeforeGeneration: true,
                    trackUsage: true,
                    generateIds: true
                }
            );
            
            if (!result.success) {
                showModal('Template Application Failed', result.errors.join('\n'));
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
            const message = `Created:\n` +
                `- ${result.generatedScreens.length} UI Screen(s)\n` +
                `- ${result.generatedVariables.length} Variable(s)\n\n` +
                `Next steps:\n` +
                `1. Create a character in the Characters tab\n` +
                `2. Add layers and assets to the character\n` +
                `3. Go to UI tab and populate the asset cyclers\n` +
                `4. Test in live preview!` +
                (result.warnings.length > 0 ? `\n\nWarnings:\n${result.warnings.join('\n')}` : '');
            
            showModal(`Template "${template.name}" Applied Successfully!`, message);
            
            // Switch to UI tab to show the new screen
            if (result.generatedScreens.length > 0) {
                setActiveTab('ui');
                handleSetActiveMenuScreen(result.generatedScreens[0].id as VNID);
            }
            
        } catch (error) {
            console.error('Failed to apply template:', error);
            showModal('Template Application Error', 'Failed to apply template. Please try again.');
        }
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
            setSelectedUIElementId(null);
            setActiveCharacterId(null);
            setSelectedExpressionId(null);
            setSelectedVariableId(null);
            setIsConfiguringScene(false);
        }
    };
    return (
        <div className="bg-slate-900 text-slate-100 h-screen flex flex-col">
            <Header
                title={project.title}
                onTitleChange={handleTitleChange}
                onPlay={() => setIsPlaying(true)}
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
                    />
                }
            />
            <main className="flex-grow flex overflow-hidden">
                {/* Main Content Area - Full Width Managers */}
                <div className="flex-1 flex flex-col min-w-0">
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
                        <AssetManager project={project} />
                    ) : activeTab === 'variables' ? (
                        <VariableManager project={project} />
                    ) : activeTab === 'settings' ? (
                        <SettingsManager project={project} />
                    ) : activeTab === 'templates' ? (
                        <TemplateGallery 
                            onSelectTemplate={handleSelectTemplate}
                            onPreviewTemplate={handlePreviewTemplate}
                            onApplyTemplate={handleApplyTemplate}
                            selectedTemplateId={selectedTemplateId}
                        />
                    ) : null}
                </div>

                {/* Properties Inspector Sidebar - Always Visible */}
                {renderInspector()}
            </main>
            {isPlaying && <LivePreview onClose={() => setIsPlaying(false)} />}
            
            {/* Info Modal */}
            <InfoModal
                isOpen={modalState.isOpen}
                onClose={closeModal}
                title={modalState.title}
            >
                {modalState.message}
            </InfoModal>
        </div>
    );
};

export default VisualNovelEditor;
