import React, { createContext, useReducer, Dispatch, useContext } from 'react';
import { VNProject } from '../types/project';
import { ProjectAction } from '../state/actions';
import { rootReducer } from '../state/rootReducer';

export const ProjectContext = createContext<{
  project: VNProject;
  dispatch: Dispatch<ProjectAction>;
} | null>(null);

export const ProjectProvider: React.FC<{
  children: React.ReactNode;
  initialProject: VNProject;
}> = ({ children, initialProject }) => {
  const [project, dispatch] = useReducer(rootReducer, initialProject);

  return (
    <ProjectContext.Provider value={{ project, dispatch }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
