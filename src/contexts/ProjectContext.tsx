import React, { createContext, Dispatch, useContext, useCallback, useRef, useState, useEffect } from 'react';
import { VNProject } from '../types/project';
import { ProjectAction } from '../state/actions';
import { rootReducer } from '../state/rootReducer';
import { saveProjectToIDB } from '../utils/storage';
import { createLogger } from '../utils/logger';
import { WorkflowTracker } from '../features/analytics/WorkflowTracker';
import { useToast } from './ToastContext';

interface UndoRedoState {
  past: VNProject[];
  present: VNProject;
  future: VNProject[];
}

const log = createLogger('ProjectContext');
const AUTO_SAVE_INTERVAL = 2 * 60 * 1000;
const MAX_HISTORY = 20;
const COALESCE_MS = 300;

const NON_UNDOABLE_ACTIONS = new Set([
  'UPDATE_PROJECT_TITLE',
]);

export const ProjectContext = createContext<{
  project: VNProject;
  dispatch: Dispatch<ProjectAction>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  lastAutoSave: number | null;
} | null>(null);

export const ProjectProvider: React.FC<{
  children: React.ReactNode;
  initialProject: VNProject;
}> = ({ children, initialProject }) => {
  const toast = useToast();
  const [history, setHistory] = useState<UndoRedoState>({
    past: [],
    present: initialProject,
    future: []
  });
  const [lastAutoSave, setLastAutoSave] = useState<number | null>(null);

  const isSyncing = useRef(false);
  const historyRef = useRef(history);
  historyRef.current = history;
  const lastActionTime = useRef(0);
  const lastActionType = useRef('');

  const dispatchWithHistory = useCallback((action: ProjectAction) => {
    setHistory(prev => {
      const newPresent = rootReducer(prev.present, action);

      if (newPresent === prev.present) {
        return prev;
      }

      WorkflowTracker.getInstance().trackAction(action.type, 'editor');

      const now = Date.now();
      const shouldCoalesce =
        action.type === lastActionType.current &&
        now - lastActionTime.current < COALESCE_MS;
      const skipUndo = NON_UNDOABLE_ACTIONS.has(action.type);

      lastActionTime.current = now;
      lastActionType.current = action.type;

      let newPast: VNProject[];
      if (shouldCoalesce || skipUndo) {
        newPast = prev.past;
      } else {
        newPast = [...prev.past.slice(-MAX_HISTORY + 1), prev.present];
      }

      const newHistory = {
        past: newPast,
        present: newPresent,
        future: []
      };

      if (!isSyncing.current && (window as any).electronAPI?.syncProjectState) {
        (window as any).electronAPI.syncProjectState(newPresent);
      }

      return newHistory;
    });
  }, []);

  useEffect(() => {
    if ((window as any).electronAPI?.onProjectStateUpdate) {
      (window as any).electronAPI.onProjectStateUpdate((projectData: VNProject) => {
        isSyncing.current = true;
        setHistory(prev => ({
          past: [...prev.past.slice(-MAX_HISTORY + 1), prev.present],
          present: projectData,
          future: []
        }));
        isSyncing.current = false;
      });
    }
  }, []);

  useEffect(() => {
    const autoSave = async () => {
      const project = historyRef.current.present;
      try {
        await saveProjectToIDB(project);
        setLastAutoSave(Date.now());
      } catch (err) {
        log.warn('Auto-save failed:', err);
      }
    };

    autoSave();

    const intervalId = setInterval(autoSave, AUTO_SAVE_INTERVAL);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const project = historyRef.current.present;
      try {
        saveProjectToIDB(project);
      } catch (err) {
        log.warn('Emergency save on unload failed:', err);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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
    toast.info('Undo', { duration: 1200 });
  }, [toast]);

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
    toast.info('Redo', { duration: 1200 });
  }, [toast]);

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
      canRedo: history.future.length > 0,
      lastAutoSave
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
