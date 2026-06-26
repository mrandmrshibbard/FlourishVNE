const { contextBridge, ipcRenderer } = require('electron');

// 'window-type' is sent ONCE on did-finish-load and carries the project for popped-out windows. The
// renderer subscribes from a React effect, which can run AFTER the message has already arrived — in
// which case a lazily-attached listener would miss it and the window would hang on "Loading…". So
// attach the IPC listener at preload time (before any page script runs), buffer the last message, and
// replay it the moment the renderer subscribes. Deterministic, no race.
let __bufferedWindowType = null;
let __windowTypeCb = null;
ipcRenderer.on('window-type', (event, data) => {
  __bufferedWindowType = data;
  if (__windowTypeCb) { try { __windowTypeCb(data); } catch {} }
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  buildDesktopGame: (project, gameFiles) =>
    ipcRenderer.invoke('build-desktop-game', { project, gameFiles }),

  // Cancel an in-flight build (main process kills the build process tree).
  cancelBuild: () => ipcRenderer.send('cancel-build'),

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
  
  // Receive window type for manager windows. Registers the callback and immediately replays the
  // buffered message if it already arrived (see the listener at the top of this file).
  onWindowType: (callback) => {
    __windowTypeCb = callback;
    if (__bufferedWindowType) { try { callback(__bufferedWindowType); } catch {} }
  },
  
  // Project state synchronization
  syncProjectState: (projectData) =>
    ipcRenderer.send('sync-project-state', projectData),

  onProjectStateUpdate: (callback) =>
    ipcRenderer.on('project-state-update', (event, projectData) => callback(projectData)),

  // Editor context (selection) synchronization — drives popped-out inspector/canvas windows.
  syncEditorContext: (context) =>
    ipcRenderer.send('sync-editor-context', context),

  onEditorContextUpdate: (callback) =>
    ipcRenderer.on('editor-context-update', (event, context) => callback(context)),

  // Which focused PANEL windows (inspector, canvas) are open — editors hide the matching inline panel.
  onPanelWindowState: (callback) =>
    ipcRenderer.on('panel-window-state', (event, panels) => callback(panels)),

  // In-Game UI editor shared view-state sync (drives its popped-out canvas + properties windows).
  syncInGameState: (state) =>
    ipcRenderer.send('sync-ingame-state', state),

  onInGameStateUpdate: (callback) =>
    ipcRenderer.on('ingame-state-update', (event, state) => callback(state)),
  
  // Window close handling
  onRequestSaveBeforeQuit: (callback) =>
    ipcRenderer.on('request-save-before-quit', () => callback()),
  
  confirmQuit: () =>
    ipcRenderer.send('confirm-quit'),
  
  cancelQuit: () =>
    ipcRenderer.send('cancel-quit'),

  saveProjectExport: (data, filename, filePath) =>
    ipcRenderer.invoke('save-project-export', { data, filename, filePath }),

  // Streaming project export: open a write stream (dialog or given path), append chunks, finalize.
  // Lets huge projects export without holding the whole archive in memory.
  exportStreamStart: (filename, filePath) =>
    ipcRenderer.invoke('export-stream-start', { filename, filePath }),
  exportStreamChunk: (chunk) =>
    ipcRenderer.invoke('export-stream-chunk', chunk),
  exportStreamEnd: () =>
    ipcRenderer.invoke('export-stream-end'),
  exportStreamAbort: () =>
    ipcRenderer.invoke('export-stream-abort'),

  // Managed project asset library (file-backed media via the flourish-asset:// protocol).
  writeProjectAsset: (projectId, type, id, ext, data) =>
    ipcRenderer.invoke('write-project-asset', { projectId, type, id, ext, data }),
  readProjectAsset: (projectId, relPath) =>
    ipcRenderer.invoke('read-project-asset', { projectId, relPath }),
  deleteProjectAsset: (projectId, relPath) =>
    ipcRenderer.invoke('delete-project-asset', { projectId, relPath }),
  deleteProjectAssetFolder: (projectId) =>
    ipcRenderer.invoke('delete-project-asset-folder', { projectId }),
  copyProjectAssetFolder: (fromProjectId, toProjectId) =>
    ipcRenderer.invoke('copy-project-asset-folder', { fromProjectId, toProjectId }),
  listProjectAssets: (projectId) =>
    ipcRenderer.invoke('list-project-assets', { projectId }),
  getProjectAssetSizes: (projectId) =>
    ipcRenderer.invoke('get-project-asset-sizes', { projectId }),

  setHubActive: (isActive) =>
    ipcRenderer.send('set-hub-active', isActive),

  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),

  // ── Auto-Update ──
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update-status', (_event, data) => callback(data)),

  installUpdate: () =>
    ipcRenderer.invoke('install-update'),

  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),

  getUpdateLogPath: () =>
    ipcRenderer.invoke('get-update-log-path'),

  openUpdateLog: () =>
    ipcRenderer.invoke('open-update-log'),

  // ── File System / Project Management ──
  getUserDataPaths: () =>
    ipcRenderer.invoke('get-user-data-paths'),

  saveProjectToPath: (data, filename, filePath, ext, defaultDir) =>
    ipcRenderer.invoke('save-project-to-path', { data, filename, filePath, ext, defaultDir }),

  openProjectDialog: () =>
    ipcRenderer.invoke('open-project-dialog'),

  readProjectFile: (filePath) =>
    ipcRenderer.invoke('read-project-file', filePath),

  listProjectFiles: () =>
    ipcRenderer.invoke('list-project-files'),

  revealInExplorer: (dirPath) =>
    ipcRenderer.invoke('reveal-in-explorer', dirPath),

  /** Fired when the user double-clicks a .flourish file or the app is
   *  launched with a file path argument. */
  onOpenFile: (callback) =>
    ipcRenderer.on('open-file', (_event, filePath) => callback(filePath)),

  // ── Android build ──
  /** Returns { ready, estimate } — whether the one-time Android toolchain is
   *  installed, plus the pinned download size to show in the confirmation gate. */
  androidToolchainStatus: () =>
    ipcRenderer.invoke('android-toolchain-status'),

  /** Downloads + installs the Android toolchain (one-time, ~1.4 GB). Progress is
   *  streamed via onAndroidToolchainProgress. */
  installAndroidToolchain: () =>
    ipcRenderer.invoke('android-toolchain-install'),

  onAndroidToolchainProgress: (callback) =>
    ipcRenderer.on('android-toolchain-progress', (_event, data) => callback(data)),

  /** Builds an installable APK from the generated Android project files. */
  buildAndroidGame: (project, androidFiles, options) =>
    ipcRenderer.invoke('build-android-game', { project, androidFiles, options }),

  onAndroidBuildProgress: (callback) =>
    ipcRenderer.on('android-build-progress', (_event, data) => callback(data)),
});

