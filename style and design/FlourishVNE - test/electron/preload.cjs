const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  onSwitchTab: (callback) => ipcRenderer.on('switch-tab', (event, tab) => callback(tab)),
  onTriggerPlay: (callback) => ipcRenderer.on('trigger-play', () => callback()),
  onTriggerBuild: (callback) => ipcRenderer.on('trigger-build', () => callback()),
  onTriggerExport: (callback) => ipcRenderer.on('trigger-export', () => callback()),
  onTriggerImport: (callback) => ipcRenderer.on('trigger-import', () => callback()),
  openChildWindow: (windowKey, title, width, height, options) => ipcRenderer.send('open-child-window', windowKey, title, width, height, options),
  buildDesktopGame: (projectZipBuffer, gameName) => ipcRenderer.invoke('build-desktop-game', { projectZipBuffer, gameName }),
  onBuildProgress: (callback) => ipcRenderer.on('build-progress', (event, data) => callback(data)),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  updateMenuState: (isProjectHubVisible) => ipcRenderer.send('update-menu-state', { isProjectHubVisible }),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
