const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  buildDesktopGame: (project, gameFiles) => 
    ipcRenderer.invoke('build-desktop-game', { project, gameFiles }),
  
  onBuildProgress: (callback) => 
    ipcRenderer.on('build-progress', (event, data) => callback(data)),
});
