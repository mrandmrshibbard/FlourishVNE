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
const STORAGE_DEBOUNCE_MS = 300; // Debounce localStorage writes

export const ProjectProvider: React.FC<{
  children: React.ReactNode;
  initialProject: VNProject;
}> = ({ children, initialProject }) => {
  const [history, setHistory] = useState<UndoRedoState>({
    past: [],
    present: initialProject,
    future: []
  });

  const storageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced localStorage save
  const saveToLocalStorage = useCallback((project: VNProject) => {
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');
    if (!isElectron) return;

    // Clear existing timeout
    if (storageTimeoutRef.current) {
      clearTimeout(storageTimeoutRef.current);
    }

    // Set new timeout
    storageTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem('flourish-active-project', JSON.stringify(project));
      } catch (error) {
        console.error('[ProjectContext] Failed to save to localStorage:', error);
      }
    }, STORAGE_DEBOUNCE_MS);
  }, []);

  // Sync with external project updates (for child windows syncing with main window)
  useEffect(() => {
    // Only update if the project has actually changed
    const initialStr = JSON.stringify(initialProject);
    const currentStr = JSON.stringify(history.present);
    
    if (initialStr !== currentStr) {
      setHistory({
        past: [],
        present: initialProject,
        future: []
      });
    }
  }, [initialProject]); // Don't include history.present to avoid circular updates

  const dispatchWithHistory = useCallback((action: ProjectAction) => {
    setHistory(prev => {
      const newPresent = rootReducer(prev.present, action);

      // Skip history update if reducers returned the same reference
      if (newPresent === prev.present) {
        return prev;
      }

      // Debounced save to localStorage for cross-window sync (Electron only)
      saveToLocalStorage(newPresent);

      return {
        past: [...prev.past.slice(-MAX_HISTORY + 1), prev.present],
        present: newPresent,
        future: [] // Clear future when new action is performed
      };
    });
  }, [saveToLocalStorage]);

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
