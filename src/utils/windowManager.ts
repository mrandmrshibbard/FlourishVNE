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
  | 'settings'
  | 'templates';

interface WindowConfig {
  type: ManagerWindowType;
  width: number;
  height: number;
  title: string;
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
      title: config.title
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
