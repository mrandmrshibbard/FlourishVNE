import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../contexts/ProjectContext';
import { VNID } from '../types';
import NavigationTabs, { NavigationTab } from './NavigationTabs';
import SceneManager from './SceneManager';
import CharacterManager from './CharacterManager';
import UIManager from './UIManager';
import AssetManager from './AssetManager';
import VariableManager from './VariableManager';
import ErrorBoundary from './ErrorBoundary';
import { focusMainWindow } from '../utils/windowManager';
import { XMarkIcon } from './icons';

interface ManagerWindowProps {
    initialTab: NavigationTab;
}

/**
 * Simplified window for managing specific tabs (Scenes, Characters, UI, Assets, Variables)
 * Designed for multi-window workflows - strips away preview and inspector panels
 */
const ManagerWindow: React.FC<ManagerWindowProps> = ({ initialTab }) => {
    const { t } = useTranslation('components');
    const { project } = useProject();
    const [activeTab, setActiveTab] = useState<NavigationTab>(initialTab);
    
    // State for scene manager
    const [activeSceneId, setActiveSceneId] = useState<VNID>(project?.startSceneId || '');
    const [selectedCommandIndex, setSelectedCommandIndex] = useState<number | null>(null);
    const [isSceneEditorCollapsed, setIsSceneEditorCollapsed] = useState(false);
    
    // State for character manager
    const [activeCharacterId, setActiveCharacterId] = useState<VNID | null>(null);
    const [selectedExpressionId, setSelectedExpressionId] = useState<VNID | null>(null);
    
    // State for UI manager
    const [activeMenuScreenId, setActiveMenuScreenId] = useState<VNID | null>(null);
    const [selectedUIElementId, setSelectedUIElementId] = useState<VNID | null>(null);
    
    // State for variable manager
    const [selectedVariableId, setSelectedVariableId] = useState<VNID | null>(null);

    // Safety checks for project data
    if (!project) {
        return (
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-[var(--bg-primary)] via-purple-900/20 to-[var(--bg-primary)]">
                <div className="text-center">
                    <div className="text-white text-xl mb-4">{t('managerWindow.loading')}</div>
                    <div className="text-[var(--text-secondary)] text-sm">{t('managerWindow.initializing')}</div>
                </div>
            </div>
        );
    }

    const sceneCount = project.scenes?.length || 0;
    const characterCount = project.characters?.length || 0;
    const uiScreenCount = project.menuScreens?.length || 0;
    const assetCount = 
        (project.backgrounds?.length || 0) + 
        (project.images?.length || 0) + 
        (project.audio?.length || 0) + 
        (project.videos?.length || 0);
    const variableCount = project.variables?.length || 0;

    const handleCloseWindow = () => {
        focusMainWindow();
        window.close();
    };

    return (
        <div className="h-screen flex flex-col bg-gradient-to-br from-[var(--bg-primary)] via-purple-900/20 to-[var(--bg-primary)]">
            {/* Minimal Header */}
            <div className="flex items-center justify-between gap-2 p-2 panel border-b border-[var(--border-subtle)]">
            
                <NavigationTabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    sceneCount={sceneCount}
                    characterCount={characterCount}
                    uiScreenCount={uiScreenCount}
                    assetCount={assetCount}
                    variableCount={variableCount}
                />

                <button
                    onClick={handleCloseWindow}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white transition-all"
                    title={t('managerWindow.closeWindow')}
                >
                    <XMarkIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Manager Content */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'scenes' && (
                    <SceneManager
                        project={project}
                        activeSceneId={activeSceneId}
                        setActiveSceneId={setActiveSceneId}
                        selectedCommandIndex={selectedCommandIndex}
                        setSelectedCommandIndex={setSelectedCommandIndex}
                        setSelectedVariableId={setSelectedVariableId}
                        onConfigureScene={() => {}}
                        isCollapsed={isSceneEditorCollapsed}
                        onToggleCollapse={() => setIsSceneEditorCollapsed(!isSceneEditorCollapsed)}
                    />
                )}
                {activeTab === 'characters' && (
                    <CharacterManager
                        project={project}
                        activeCharacterId={activeCharacterId}
                        setActiveCharacterId={setActiveCharacterId}
                        selectedExpressionId={selectedExpressionId}
                        setSelectedExpressionId={setSelectedExpressionId}
                    />
                )}
                {activeTab === 'ui' && (
                    <ErrorBoundary fallback={<div className="p-4 text-red-400">{t('managerWindow.uiManagerFailed')}</div>}>
                        <UIManager
                            project={project}
                            activeMenuScreenId={activeMenuScreenId}
                            setActiveMenuScreenId={setActiveMenuScreenId}
                            selectedUIElementId={selectedUIElementId}
                            setSelectedUIElementId={setSelectedUIElementId}
                        />
                    </ErrorBoundary>
                )}
                {activeTab === 'assets' && <AssetManager />}
                {activeTab === 'variables' && (
                    <VariableManager
                        project={project}
                        selectedVariableId={selectedVariableId}
                        setSelectedVariableId={setSelectedVariableId}
                    />
                )}
            </div>
        </div>
    );
};

export default ManagerWindow;
