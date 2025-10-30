import React, { useState } from 'react';
import { ProjectProvider } from './contexts/ProjectContext';
import VisualNovelEditor from './components/VisualNovelEditor';
import { ProjectHub } from './components/ProjectHub';
import { VNProject } from './types/project';

const App = () => {
    const [activeProject, setActiveProject] = useState<VNProject | null>(null);

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
            <VisualNovelEditor onExit={handleCloseProject} />
        </ProjectProvider>
    );
};

export default App;
