import React, { useState, useEffect } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import { UIScreenThemeProvider } from './contexts/UIScreenThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import VisualNovelEditor from './components/VisualNovelEditor';
import { ProjectHub } from './components/ProjectHub';
import { VNProject } from './types/project';
import { NavigationTab } from './components/NavigationTabs';

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

const App = () => {
    const [activeProject, setActiveProject] = useState<VNProject | null>(null);
    const [initialTab, setInitialTab] = useState<NavigationTab | undefined>(undefined);

    // Listen for window-type message from Electron
    useEffect(() => {
        if ((window as any).electronAPI?.onWindowType) {
            (window as any).electronAPI.onWindowType((data: { type: NavigationTab; project?: VNProject }) => {
                editorDebugLog('Received window data:', data);
                setInitialTab(data.type);
                if (data.project) {
                    setActiveProject(data.project);
                }
                // Mark this as a manager window
                (window as any).__IS_MANAGER_WINDOW__ = true;
            });
        }
    }, []);

    // Expose project to Electron for sharing with manager windows
    useEffect(() => {
        if (activeProject) {
            (window as any).__FLOURISH_PROJECT__ = activeProject;
        }
    }, [activeProject]);

    const handleProjectSelect = (project: VNProject) => {
        setActiveProject(project);
    };

    const handleCloseProject = () => {
        setActiveProject(null);
    };

    if (!activeProject) {
        return (
            <ToastProvider>
                <ProjectHub onProjectSelect={handleProjectSelect} />
            </ToastProvider>
        );
    }
    
    return (
        <ToastProvider>
            <ProjectProvider key={activeProject.id} initialProject={activeProject}>
                <UIScreenThemeProvider>
                    <VisualNovelEditor onExit={handleCloseProject} initialTab={initialTab} />
                </UIScreenThemeProvider>
            </ProjectProvider>
        </ToastProvider>
    );
};

export default App;
