import React, { useState, useEffect } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import VisualNovelEditor from './components/VisualNovelEditor';
import { ProjectHub } from './components/ProjectHub';
import { VNProject } from './types/project';
import { NavigationTab } from './components/NavigationTabs';

const App = () => {
    const [activeProject, setActiveProject] = useState<VNProject | null>(null);
    const [initialTab, setInitialTab] = useState<NavigationTab | undefined>(undefined);

    // Listen for window-type message from Electron
    useEffect(() => {
        if ((window as any).electronAPI?.onWindowType) {
            (window as any).electronAPI.onWindowType((data: { type: NavigationTab; project?: VNProject }) => {
                console.log('Received window data:', data);
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
        return <ProjectHub onProjectSelect={handleProjectSelect} />;
    }
    
    return (
        <ProjectProvider key={activeProject.id} initialProject={activeProject}>
            <VisualNovelEditor onExit={handleCloseProject} initialTab={initialTab} />
        </ProjectProvider>
    );
};

export default App;
