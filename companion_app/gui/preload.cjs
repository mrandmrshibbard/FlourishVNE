// Bridges the renderer to the main process (contextIsolation-safe).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', {
  pickFlourish: () => ipcRenderer.invoke('pick-flourish'),
  pickOutput: () => ipcRenderer.invoke('pick-output'),
  runPipeline: (args) => ipcRenderer.invoke('run-pipeline', args),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  onStep: (cb) => ipcRenderer.on('pipeline-step', (_e, msg) => cb(msg)),
});
