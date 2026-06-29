import React, { createContext, Dispatch, useContext, useCallback, useRef, useState, useEffect } from 'react';
import { VNProject } from '../types/project';
import { ProjectAction } from '../state/actions';
import { rootReducer } from '../state/rootReducer';
import { saveProjectToIDB } from '../utils/storage';
import { createLogger } from '../utils/logger';
import { WorkflowTracker } from '../features/analytics/WorkflowTracker';
import { useToast } from './ToastContext';
import { migrateProjectToUnifiedScreens } from '../utils/unifiedScreenMigration';
import { migrateProjectRemoveLegacyCommands } from '../utils/legacyCommandMigration';
import { migrateItemCountVariableBounds, migrateStatVariables, repairOrphanBranchMarkers } from '../utils/itemVariableMigration';
import { migrateInventorySlotButton } from '../utils/inventoryElementMigration';
import { pluginManager } from '../features/plugins/PluginManagerService';
import { externalizeProjectAssets, type MigrationProgress } from '../utils/assetMigration';
import { isElectronAssetStore } from '../utils/assetStore';
import MigrationStatusBar from '../components/MigrationStatusBar';

interface UndoRedoState {
  past: VNProject[];
  present: VNProject;
  future: VNProject[];
}

const log = createLogger('ProjectContext');
const AUTO_SAVE_INTERVAL = 2 * 60 * 1000; // milliseconds (2 minutes)
const MAX_HISTORY = 20;
const COALESCE_MS = 300; // milliseconds

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
  isDirty: boolean;
  markSaved: () => void;
} | null>(null);

export const ProjectProvider: React.FC<{
  children: React.ReactNode;
  initialProject: VNProject;
}> = ({ children, initialProject }) => {
  const toast = useToast();
  // Run the schema migration on the incoming project before storing it. Projects
  // loaded from `.flourish` files or auto-saves bypass the reducer's SET_PROJECT
  // case (ProjectProvider initializes state directly), so we have to migrate here
  // or stranded hot zone data never makes it into `screen.elements`.
  const [history, setHistory] = useState<UndoRedoState>(() => ({
    past: [],
    present: repairOrphanBranchMarkers(migrateStatVariables(migrateItemCountVariableBounds(migrateInventorySlotButton(migrateProjectRemoveLegacyCommands(migrateProjectToUnifiedScreens(initialProject)))))),
    future: []
  }));
  const [lastAutoSave, setLastAutoSave] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [migration, setMigration] = useState<MigrationProgress | null>(null);

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
      setIsDirty(true);

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

  // On desktop, normalize a project's media to the managed file store on open: write any embedded
  // base64 to files AND upgrade older bare "assets/…" refs to flourish-asset:// URLs (so editor
  // canvases that read the field directly can load them). Idempotent + cheap when already normalized;
  // only re-saves when something actually changed. No-op on web/mobile (assets stay base64).
  useEffect(() => {
    if (!isElectronAssetStore()) return;
    let cancelled = false;
    (async () => {
      try {
        const { project: migrated, changed, migratedCount } = await externalizeProjectAssets(
          historyRef.current.present,
          (p) => { if (!cancelled) setMigration(p); },
        );
        if (cancelled) return;
        setMigration(null);
        if (!changed) return;
        setHistory(prev => ({ ...prev, present: { ...migrated } }));
        try { await saveProjectToIDB(migrated); } catch { /* autosave will retry */ }
        if (migratedCount > 0) {
          try { toast.success(`Moved ${migratedCount} asset${migratedCount === 1 ? '' : 's'} into the new project storage`); } catch { /* no-op */ }
        }
      } catch (err) {
        log.warn('Asset externalization failed:', err);
        if (!cancelled) setMigration(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProject.id]);

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

  // Debounced save after every change so the auto-save always reflects the latest work.
  // The 2-minute interval alone meant edits made shortly before closing (e.g. wiring a
  // freshly-added asset into a command) were never persisted, so reloading the last
  // auto-save came back missing them. Saves ~1.2s after edits settle.
  useEffect(() => {
    const id = setTimeout(() => {
      saveProjectToIDB(history.present)
        .then(() => setLastAutoSave(Date.now()))
        .catch(err => log.warn('Debounced auto-save failed:', err));
    }, 1200);
    return () => clearTimeout(id);
  }, [history.present]);

  // Flush the latest state when the editor unmounts (e.g. returning to the Hub). React
  // unmount is not a browser unload, so `beforeunload` doesn't fire here — without this,
  // the last batch of edits before leaving the editor would be lost.
  useEffect(() => {
    return () => {
      saveProjectToIDB(historyRef.current.present).catch(err => log.warn('Save on editor exit failed:', err));
    };
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

  const markSaved = useCallback(() => {
    setIsDirty(false);
  }, []);

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

  // Give the plugin manager an editor-level host bridge (project / dispatch / toast) so
  // plugin APIs can read project data, persist scoped storage, and surface notifications.
  // The live runtime bridge (variables) is set separately by LivePreview during play.
  useEffect(() => {
    pluginManager.setHost({
      getProject: () => historyRef.current.present,
      dispatch: dispatchWithHistory,
      notify: (message, type = 'info') => { try { toast.addToast(message, type); } catch { /* no-op */ } },
    });
    // Load any already-enabled plugins so their commands/effects/hooks are available.
    try { pluginManager.ensureLoaded(historyRef.current.present); } catch (e) { log.warn('Plugin ensureLoaded failed:', e); }
  }, [dispatchWithHistory, toast]);

  return (
    <ProjectContext.Provider value={{
      project: history.present,
      dispatch: dispatchWithHistory,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      lastAutoSave,
      isDirty,
      markSaved
    }}>
      {children}
      <MigrationStatusBar status={migration} />
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
