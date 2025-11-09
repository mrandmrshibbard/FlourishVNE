import React, { createContext, useReducer, Dispatch, useContext, useCallback, useRef, useState, useEffect } from 'react';
import { VNProject } from '../types/project';
import { ProjectAction } from '../state/actions';
import { rootReducer } from '../state/rootReducer';

interface UndoRedoState {
  past: VNProject[];
  present: VNProject;
  future: VNProject[];
}

export const ProjectContext = createContext<{
  project: VNProject;
  dispatch: Dispatch<ProjectAction>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
} | null>(null);

const MAX_HISTORY = 50; // Keep last 50 states

export const ProjectProvider: React.FC<{
  children: React.ReactNode;
  initialProject: VNProject;
}> = ({ children, initialProject }) => {
  const [history, setHistory] = useState<UndoRedoState>({
    past: [],
    present: initialProject,
    future: []
  });

  const isSyncing = useRef(false);

  const dispatchWithHistory = useCallback((action: ProjectAction) => {
    setHistory(prev => {
      const newPresent = rootReducer(prev.present, action);
      
      // Don't add to history if reducer returned identical state reference
      if (newPresent === prev.present) {
        return prev;
      }

      const newHistory = {
        past: [...prev.past.slice(-MAX_HISTORY + 1), prev.present],
        present: newPresent,
        future: [] // Clear future when new action is performed
      };

      // Sync to other windows if in Electron
      if (!isSyncing.current && (window as any).electronAPI?.syncProjectState) {
        (window as any).electronAPI.syncProjectState(newPresent);
      }

      return newHistory;
    });
  }, []);

  // Listen for project updates from other windows
  useEffect(() => {
    if ((window as any).electronAPI?.onProjectStateUpdate) {
      (window as any).electronAPI.onProjectStateUpdate((projectData: VNProject) => {
        isSyncing.current = true;
        setHistory(prev => ({
          past: [...prev.past.slice(-MAX_HISTORY + 1), prev.present],
          present: projectData,
          future: [] // Clear future on external update
        }));
        isSyncing.current = false;
      });
    }
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;
      
      const newPast = prev.past.slice(0, -1);
      const newPresent = prev.past[prev.past.length - 1];
      
      return {
        past: newPast,
        present: newPresent,
        future: [prev.present, ...prev.future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;
      
      const newFuture = prev.future.slice(1);
      const newPresent = prev.future[0];
      
      return {
        past: [...prev.past, prev.present],
        present: newPresent,
        future: newFuture
      };
    });
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__FLOURISH_PROJECT__ = history.present;
    }
  }, [history.present]);

  return (
    <ProjectContext.Provider value={{ 
      project: history.present, 
      dispatch: dispatchWithHistory,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0
    }}>
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
