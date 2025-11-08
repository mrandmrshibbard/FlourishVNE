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
  
  closeAllManagerWindows: () => 
    ipcRenderer.send('close-all-manager-windows'),
  
  // Receive window type for manager windows
  onWindowType: (callback) => 
    ipcRenderer.on('window-type', (event, type) => callback(type)),
});

