import React, { useState, useEffect } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import VisualNovelEditor from './components/VisualNovelEditor';
import { ProjectHub } from './components/ProjectHub';
import { VNProject } from './types/project';

const App = () => {
    const [activeProject, setActiveProject] = useState<VNProject | null>(null);
    const [initialTab, setInitialTab] = useState<string | null>(null);
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');

    // Notify Electron about menu state based on active project
    useEffect(() => {
        if (isElectron && (window as any).electronAPI?.updateMenuState) {
            const isProjectHubVisible = !activeProject;
            (window as any).electronAPI.updateMenuState(isProjectHubVisible);
        }
    }, [activeProject, isElectron]);

    useEffect(() => {
        // Check if this is a child window by looking at URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const isChildWindow = urlParams.get('childWindow') === 'true';
        const tab = urlParams.get('tab');
        
        if (isChildWindow && tab) {
            setInitialTab(tab);
        }

        // If this is a child window or Electron, try to load the active project from localStorage
        if (isElectron || isChildWindow) {
            try {
                const sharedProjectData = localStorage.getItem('flourish-active-project');
                if (sharedProjectData && isChildWindow) {
                    // Only auto-load for child windows
                    const project = JSON.parse(sharedProjectData);
                    setActiveProject(project);
                }
            } catch (error) {
                console.error('Failed to load shared project:', error);
            }
        }

        // Listen for storage changes to sync between ALL windows (main and child)
        if (isElectron) {
            const handleStorageChange = (e: StorageEvent) => {
                if (e.key === 'flourish-active-project' && e.newValue) {
                    try {
                        const updatedProject = JSON.parse(e.newValue);
                        setActiveProject(updatedProject);
                    } catch (error) {
                        console.error('[App] Failed to sync project:', error);
                    }
                }
            };

            window.addEventListener('storage', handleStorageChange);
            return () => window.removeEventListener('storage', handleStorageChange);
        }
    }, [isElectron]);

    const handleProjectSelect = (project: VNProject) => {
        setActiveProject(project);
        // Store in localStorage for child windows to access
        if (isElectron) {
            localStorage.setItem('flourish-active-project', JSON.stringify(project));
        }
    };

    const handleCloseProject = () => {
        setActiveProject(null);
        if (isElectron) {
            localStorage.removeItem('flourish-active-project');
        }
    };

    if (!activeProject) {
        return <ProjectHub onProjectSelect={handleProjectSelect} />;
    }
    
    return (
        <ProjectProvider key={activeProject.id} initialProject={activeProject}>
            <VisualNovelEditor onExit={handleCloseProject} initialTab={initialTab} isChildWindow={!!initialTab} />
        </ProjectProvider>
    );
};

export default App;
