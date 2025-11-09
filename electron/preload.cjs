const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  buildDesktopGame: (project, gameFiles) => 
    ipcRenderer.invoke('build-desktop-game', { project, gameFiles }),
  
  onBuildProgress: (callback) => 
    ipcRenderer.on('build-progress', (event, data) => callback(data)),
  
  // Multi-window support
  openManagerWindow: (config) => 
    ipcRenderer.send('open-manager-window', config),
  
  focusMainWindow: () => 
    ipcRenderer.send('focus-main-window'),
  
  focusManagerWindow: (type) =>
    ipcRenderer.send('focus-manager-window', type),
  
  closeAllManagerWindows: () => 
    ipcRenderer.send('close-all-manager-windows'),
  
  // Receive window type for manager windows
  onWindowType: (callback) => 
    ipcRenderer.on('window-type', (event, type) => callback(type)),
  
  // Project state synchronization
  syncProjectState: (projectData) =>
    ipcRenderer.send('sync-project-state', projectData),
  
  onProjectStateUpdate: (callback) =>
    ipcRenderer.on('project-state-update', (event, projectData) => callback(projectData)),
  
  // Window close handling
  onRequestSaveBeforeQuit: (callback) =>
    ipcRenderer.on('request-save-before-quit', () => callback()),
  
  confirmQuit: () =>
    ipcRenderer.send('confirm-quit'),
  
  cancelQuit: () =>
    ipcRenderer.send('cancel-quit'),

  saveProjectExport: (data, filename) =>
    ipcRenderer.invoke('save-project-export', { data, filename }),
});

