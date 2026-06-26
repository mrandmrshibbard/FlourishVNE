/**
 * Window Manager for Multi-Window Support
 * 
 * Allows opening managers (Scenes, Characters, UI, etc.) in separate windows
 * for improved workflow and multi-monitor support
 */

export type ManagerWindowType =
  | 'scenes'
  | 'characters'
  | 'ui'
  | 'assets'
  | 'variables'
  | 'commonEvents'
  | 'settings'
  | 'templates'
  // Focused PANEL windows (not whole tabs) — these render a single panel that follows the main
  // editor's selection via the editor-context sync channel, rather than a full editor.
  | 'inspector'
  | 'canvas'
  // The In-Game UI editor's canvas and properties, each poppable into its own window.
  | 'ingame-canvas'
  | 'ingame-properties'
  // A dedicated test-play window (the running game in its own window, with a Reload button).
  | 'testplay';

/** Which focused PANEL windows are currently open (editors hide their matching inline panel). */
export interface PanelWindowState {
  inspector: boolean;
  canvas: boolean;
  ingameCanvas: boolean;
  ingameProperties: boolean;
}

/**
 * The In-Game UI editor's shared view state, synced across its popped-out parts (tree in main, canvas
 * + properties in their own windows) so they all agree on which surface is being edited / previewed.
 */
export interface InGameUIState {
  selectedElement: string | null;
  selectedThemeId: string | null;
  confirmPreviewVariant: string;
  phonePreviewView: string;
}

/**
 * The transient editor "context" (selection) that travels between windows so a popped-out panel
 * (e.g. the Properties Inspector) can show what's selected in the main editor. Ids/indices only —
 * tiny, and deliberately NOT part of the saved project.
 */
export interface EditorContext {
  activeTab: string;
  uiEditorMode: 'screens' | 'ingame';
  activeSceneId: string;
  selectedCommandIndex: number | null;
  activeMenuScreenId: string | null;
  selectedUIElementIds: string[];
  activeCharacterId: string | null;
  selectedVariableId: string | null;
}

interface WindowConfig {
  type: ManagerWindowType;
  width: number; // in pixels
  height: number; // in pixels
  title: string;
  minWidth?: number; // optional per-type minimum (defaults to 800 in main process)
  minHeight?: number; // optional per-type minimum (defaults to 600 in main process)
}

const WINDOW_CONFIGS: Record<ManagerWindowType, WindowConfig> = {
  scenes: {
    type: 'scenes',
    width: 1200,
    height: 800,
    title: 'Scenes Manager'
  },
  characters: {
    type: 'characters',
    width: 1000,
    height: 700,
    title: 'Characters Manager'
  },
  ui: {
    type: 'ui',
    width: 1200,
    height: 800,
    title: 'UI Screens Manager'
  },
  assets: {
    type: 'assets',
    width: 900,
    height: 700,
    title: 'Asset Manager'
  },
  variables: {
    type: 'variables',
    width: 800,
    height: 600,
    title: 'Variables Manager'
  },
  commonEvents: {
    type: 'commonEvents',
    width: 1000,
    height: 700,
    title: 'Common Events Manager'
  },
  settings: {
    type: 'settings',
    width: 700,
    height: 600,
    title: 'Settings Manager'
  },
  templates: {
    type: 'templates',
    width: 1000,
    height: 700,
    title: 'Template Gallery'
  },
  inspector: {
    type: 'inspector',
    width: 420,
    height: 820,
    title: 'Properties',
    // A properties panel should be narrow-dockable — don't inherit the 800px manager-window minimum.
    minWidth: 260,
    minHeight: 320
  },
  canvas: {
    type: 'canvas',
    width: 760,
    height: 560,
    title: 'Scene Canvas',
    minWidth: 320,
    minHeight: 240
  },
  'ingame-canvas': {
    type: 'ingame-canvas',
    width: 760,
    height: 560,
    title: 'In-Game UI Canvas',
    minWidth: 320,
    minHeight: 240
  },
  'ingame-properties': {
    type: 'ingame-properties',
    width: 360,
    height: 820,
    title: 'In-Game UI Properties',
    minWidth: 280,
    minHeight: 320
  },
  testplay: {
    type: 'testplay',
    width: 1280,
    height: 760,
    title: 'Test Play',
    minWidth: 480,
    minHeight: 360
  }
};

/**
 * Check if we're running in Electron
 */
export const isElectron = (): boolean => {
  return navigator.userAgent.toLowerCase().includes('electron');
};

/**
 * Open a manager in a new window (or focus if already open)
 * The Electron main process will automatically focus existing windows
 * instead of creating duplicates
 */
export const openManagerWindow = (type: ManagerWindowType): void => {
  if (!isElectron()) {
    console.warn('Multi-window support only available in Electron');
    return;
  }

  const config = WINDOW_CONFIGS[type];
  
  // Send message to main process via IPC
  // Main process will check if window exists and focus it, or create new one
  if ((window as any).electronAPI?.openManagerWindow) {
    (window as any).electronAPI.openManagerWindow({
      type: config.type,
      width: config.width,
      height: config.height,
      title: config.title,
      minWidth: config.minWidth,
      minHeight: config.minHeight
    });
  } else {
    console.error('Electron API not available for window management');
  }
};

/**
 * Check if manager windows are supported
 */
export const isMultiWindowSupported = (): boolean => {
  return isElectron() && !!(window as any).electronAPI?.openManagerWindow;
};

/**
 * Check if this is a manager (child) window
 */
export const isManagerWindow = (): boolean => {
  return !!(window as any).__IS_MANAGER_WINDOW__;
};

/**
 * Which kind of popped-out window is this? Read synchronously from the ?manager=<type> query that
 * Electron appends when creating the window (see electron/main.cjs). Returns null in the main window.
 */
export const getManagerWindowType = (): ManagerWindowType | null => {
  try {
    const fromSearch = new URLSearchParams(window.location.search).get('manager');
    if (fromSearch) return fromSearch as ManagerWindowType;
    const m = /[?&#]manager=([^&#]+)/.exec(window.location.href);
    return m ? (decodeURIComponent(m[1]) as ManagerWindowType) : null;
  } catch {
    return null;
  }
};

/**
 * Broadcast the editor selection to every other window (drives popped-out panels). No-op off Electron.
 */
export const syncEditorContext = (context: EditorContext): void => {
  (window as any).electronAPI?.syncEditorContext?.(context);
};

/**
 * Subscribe to editor-context updates from other windows. Returns true if the listener was wired.
 */
export const onEditorContextUpdate = (callback: (context: EditorContext) => void): boolean => {
  if ((window as any).electronAPI?.onEditorContextUpdate) {
    (window as any).electronAPI.onEditorContextUpdate(callback);
    return true;
  }
  return false;
};

/**
 * Subscribe to which focused PANEL windows (inspector, canvas) are open. Editors use this to hide the
 * matching inline panel while a floating one exists. No-op off Electron.
 */
export const onPanelWindowState = (callback: (panels: PanelWindowState) => void): void => {
  (window as any).electronAPI?.onPanelWindowState?.(callback);
};

/** Broadcast the In-Game UI editor's shared view state to its other popped-out parts. No-op off Electron. */
export const syncInGameState = (state: InGameUIState): void => {
  (window as any).electronAPI?.syncInGameState?.(state);
};

/** Subscribe to In-Game UI shared-state updates from other windows. */
export const onInGameStateUpdate = (callback: (state: InGameUIState) => void): void => {
  (window as any).electronAPI?.onInGameStateUpdate?.(callback);
};

/**
 * Focus the main editor window
 */
export const focusMainWindow = (): void => {
  if (!isElectron()) return;
  
  if ((window as any).electronAPI?.focusMainWindow) {
    (window as any).electronAPI.focusMainWindow();
  }
};

/**
 * Focus a manager window if it exists
 */
export const focusManagerWindow = (type: ManagerWindowType): void => {
  if (!isElectron()) return;
  
  if ((window as any).electronAPI?.focusManagerWindow) {
    (window as any).electronAPI.focusManagerWindow(type);
  }
};

/**
 * Close all manager windows
 */
export const closeAllManagerWindows = (): void => {
  if (!isElectron()) return;
  
  if ((window as any).electronAPI?.closeAllManagerWindows) {
    (window as any).electronAPI.closeAllManagerWindows();
  }
};
