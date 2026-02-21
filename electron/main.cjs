const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');

/**
 * Run a shell command asynchronously, returning a promise.
 * This keeps the Electron main process responsive during long-running builds.
 */
function execAsync(command, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = exec(command, { ...options, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
    // Log output in real-time for debugging
    if (proc.stdout) proc.stdout.on('data', (d) => console.log('[build stdout]', d.toString().trim()));
    if (proc.stderr) proc.stderr.on('data', (d) => console.log('[build stderr]', d.toString().trim()));
  });
}

/**
 * Run a shell command with real-time progress callback for stdout/stderr lines.
 */
function execAsyncWithProgress(command, options = {}, onLine = () => {}) {
  return new Promise((resolve, reject) => {
    const proc = exec(command, { ...options, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
    if (proc.stdout) proc.stdout.on('data', (d) => {
      const line = d.toString().trim();
      console.log('[build stdout]', line);
      onLine(line);
    });
    if (proc.stderr) proc.stderr.on('data', (d) => {
      const line = d.toString().trim();
      console.log('[build stderr]', line);
      onLine(line);
    });
  });
}

// GPU stability on Windows: use ANGLE's D3D11 backend instead of the native GL
// driver, which crashes on some machines. Keep GPU compositing active so the UI
// stays smooth at any window size.
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('use-angle', 'd3d11');
}
// Speed up Electron startup — defer non-essential init
app.commandLine.appendSwitch('enable-features', 'WinDelaySpellcheckServiceInit');
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');
// Prevent Chromium from throttling or suspending the renderer when the window
// loses focus / is occluded.  This is the root cause of the "black screen when
// switching back to the maximised window" problem.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Enforce single instance – prevents duplicate background processes.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow;
let splashWindow;
let isHubActive = false;
let isQuitting = false;

/**
 * Create a lightweight native splash window that shows immediately while the
 * main renderer loads React, Tailwind, fonts, etc.
 */
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    transparent: false,
    backgroundColor: '#1a102c',
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    show: true,
    center: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  // data:URL HTML renders in <50ms – no file I/O needed
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html>
<html><head><style>
  body { margin:0; display:flex; flex-direction:column; align-items:center;
         justify-content:center; height:100vh; background:#1a102c;
         font-family:'Segoe UI',sans-serif; color:#fff; overflow:hidden; }
  .brand { font-size:2.2rem; font-weight:700; margin-bottom:1.4rem;
           background:linear-gradient(135deg,#ff00a5,#8a2be2,#00f2ea);
           -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .bar-wrap { width:200px; height:4px; border-radius:4px;
              background:rgba(255,255,255,0.1); overflow:hidden; margin-bottom:0.8rem; }
  .bar { height:100%; width:30%; border-radius:4px;
         background:linear-gradient(90deg,#ff00a5,#8a2be2);
         animation:loading 1.2s ease-in-out infinite alternate; }
  @keyframes loading { from{width:20%;margin-left:0} to{width:50%;margin-left:50%} }
  p { margin:0; font-size:0.8rem; opacity:0.5; }
</style></head><body>
  <div class="brand">Flourish VNE</div>
  <div class="bar-wrap"><div class="bar"></div></div>
  <p>Loading editor...</p>
</body></html>`));
}

function isSafeNavigationUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'file:';
  } catch {
    return false;
  }
}

function hardenWebContents(contents) {
  // Disallow opening new windows inside the app; open external URLs in browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeNavigationUrl(url)) {
      return { action: 'allow' };
    }
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  // Prevent in-app navigation away from our bundled file:// app.
  contents.on('will-navigate', (event, url) => {
    if (!isSafeNavigationUrl(url)) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    icon: path.join(__dirname, '../docs/Flourish.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    backgroundColor: '#1a102c',
    title: 'Flourish Visual Novel Engine',
    show: false, // Don't show until ready
  });

  // Load the built app from dist folder
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // Show the main window and close the splash once the app is painted.
  // We use ready-to-show because it fires once the first non-blank frame is
  // ready — at that point the user can see real UI, not a blank window.
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  // Force a repaint whenever the window regains focus so the renderer
  // is never left showing a stale (black) frame.
  mainWindow.on('focus', () => {
    try { mainWindow.webContents.invalidate(); } catch {}
  });
  mainWindow.on('restore', () => {
    try { mainWindow.webContents.invalidate(); } catch {}
  });

  // If the renderer crashes/freezes, offer a recovery path instead of leaving a stuck window.
  mainWindow.on('unresponsive', async () => {
    try {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Flourish is not responding',
        message: 'The editor has become unresponsive. Reload the window?',
        buttons: ['Reload', 'Quit'],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) mainWindow.reload();
      else app.quit();
    } catch {
      app.quit();
    }
  });

  mainWindow.webContents.on('render-process-gone', async (_event, details) => {
    try {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Renderer crashed',
        message: `The editor window crashed (${details?.reason || 'unknown reason'}).`,
        detail: 'You can reload the window, or quit the app.',
        buttons: ['Reload', 'Quit'],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) mainWindow.reload();
      else app.quit();
    } catch {
      app.quit();
    }
  });

  hardenWebContents(mainWindow.webContents);

  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.reload();
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: async () => {
            await shell.openPath(path.join(__dirname, '../docs/index.html'));
          }
        },
        {
          label: 'About Flourish',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Flourish Visual Novel Engine',
              message: 'Flourish Visual Novel Engine',
              detail: 'Version 2.0\n\nCreate beautiful interactive stories without coding.\n\n© 2025 - Made with ❤️ for storytellers everywhere',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Prevent window from closing, ask renderer to show save dialog
  mainWindow.on('close', (e) => {
    // If we're already closing (confirmed) or app is quitting, allow it
    if (mainWindow.forceClose || isQuitting) {
      return;
    }

    if (isHubActive) {
      return;
    }

    // If the renderer is already gone/crashed, don't block shutdown.
    try {
      if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
        return;
      }
      if (typeof mainWindow.webContents.isCrashed === 'function' && mainWindow.webContents.isCrashed()) {
        return;
      }
    } catch {
      return;
    }

    // Prevent the window from closing
    e.preventDefault();
    
    // Ask renderer to show save dialog
    try {
      mainWindow.webContents.send('request-save-before-quit');
    } catch {
      // If messaging fails (renderer disposed mid-flight), allow close.
      mainWindow.forceClose = true;
      mainWindow.destroy();
      return;
    }

    // Safety net: if the renderer never replies within 10 seconds, force-close
    // so the process doesn't linger as a background zombie.
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.forceClose) {
        console.warn('Close confirmation timed out – force-closing window.');
        mainWindow.forceClose = true;
        mainWindow.destroy();
      }
    }, 10_000);
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App ready – show splash immediately, then start loading the full app.
// The splash window uses show:true + backgroundColor so it appears the instant
// BrowserWindow is created (before the data-URL HTML even paints).  We do NOT
// wait for did-finish-load — the main window can start loading in the
// background while the splash animates, shaving ~200-400ms off perceived
// startup time.
app.whenReady().then(() => {
  createSplashWindow();
  // Start the heavy main-window load immediately — no need to wait for the
  // simple splash HTML to finish loading.
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// If a second instance is launched, focus the existing window instead.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Set quitting flag so the close handler skips the save-confirmation dialog.
app.on('before-quit', () => {
  isQuitting = true;
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  app.quit();
});

// Safety net: ensure the process actually terminates and doesn't linger.
app.on('will-quit', () => {
  // Destroy any lingering manager windows
  managerWindows.forEach(win => {
    if (!win.isDestroyed()) win.destroy();
  });
  managerWindows.clear();

  // Force-exit after a brief grace period in case something keeps the
  // event loop alive (GPU process, open handles, etc.).
  setTimeout(() => {
    console.warn('App did not exit cleanly – forcing process.exit()');
    process.exit(0);
  }, 3000);
});

// IPC Handler: Build Desktop Game with Electron Builder
// ── Persistent cache for node_modules to avoid re-downloading every build ──
const buildCacheDir = path.join(app.getPath('userData'), 'build-cache');
const cachedNodeModules = path.join(buildCacheDir, 'node_modules');
const cachedPackageJson = path.join(buildCacheDir, 'package.json');

ipcMain.handle('build-desktop-game', async (event, { project, gameFiles }) => {
  try {
    // Create temporary build directory
    const tempDir = path.join(os.tmpdir(), 'flourish-game-build-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    // Write all game files
    for (const [filename, content] of Object.entries(gameFiles)) {
      const filePath = path.join(tempDir, filename);
      const dir = path.dirname(filePath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      if (content instanceof Buffer) {
        fs.writeFileSync(filePath, content);
      } else if (content instanceof ArrayBuffer) {
        fs.writeFileSync(filePath, Buffer.from(content));
      } else if (ArrayBuffer.isView(content)) {
        fs.writeFileSync(filePath, Buffer.from(content.buffer));
      } else if (content && typeof content === 'object' && content.type === 'Buffer' && Array.isArray(content.data)) {
        // Handle Buffer serialized through JSON (fallback)
        fs.writeFileSync(filePath, Buffer.from(content.data));
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
      }
    }

    // ── Dependency installation with persistent cache ──
    // Compare the package.json from the game with the cached one. If they
    // match we can reuse the cached node_modules and skip `npm install`
    // entirely, which saves ~30-60 s on subsequent builds.
    event.sender.send('build-progress', { 
      step: 'install', 
      progress: 30, 
      message: 'Preparing dependencies...' 
    });
    
    const newPkgPath = path.join(tempDir, 'package.json');
    const newPkgContent = fs.existsSync(newPkgPath) ? fs.readFileSync(newPkgPath, 'utf8') : '';
    const cachedPkgContent = fs.existsSync(cachedPackageJson) ? fs.readFileSync(cachedPackageJson, 'utf8') : '';
    const cacheHit = newPkgContent && cachedPkgContent && newPkgContent === cachedPkgContent
                     && fs.existsSync(cachedNodeModules);

    if (cacheHit) {
      // Reuse cached node_modules – just copy (or symlink) into the build dir
      event.sender.send('build-progress', { 
        step: 'install', 
        progress: 35, 
        message: 'Reusing cached dependencies...' 
      });
      console.log('[build] Cache hit – reusing node_modules from', buildCacheDir);
      
      // Use junction on Windows (fast, no admin rights), symlink elsewhere
      const targetLink = path.join(tempDir, 'node_modules');
      try {
        fs.symlinkSync(cachedNodeModules, targetLink, 'junction');
      } catch {
        // Fallback: copy if symlink fails
        fs.cpSync(cachedNodeModules, targetLink, { recursive: true });
      }
    } else {
      // Fresh install – then persist the result for next time
      event.sender.send('build-progress', { 
        step: 'install', 
        progress: 30, 
        message: 'Installing dependencies (first build may take a minute)...' 
      });
      console.log('[build] Cache miss – running npm install');
      
      try {
        await execAsync('npm install', { cwd: tempDir });
      } catch (err) {
        throw new Error('Failed to install dependencies: ' + (err.stderr || err.message));
      }

      // Save to cache for next time
      try {
        fs.mkdirSync(buildCacheDir, { recursive: true });
        // Remove old cache
        if (fs.existsSync(cachedNodeModules)) {
          fs.rmSync(cachedNodeModules, { recursive: true, force: true });
        }
        fs.cpSync(path.join(tempDir, 'node_modules'), cachedNodeModules, { recursive: true });
        fs.writeFileSync(cachedPackageJson, newPkgContent, 'utf8');
        console.log('[build] Dependencies cached for future builds');
      } catch (cacheErr) {
        console.warn('[build] Failed to cache node_modules:', cacheErr.message);
      }
    }

    // Run electron-builder with real-time progress feedback
    event.sender.send('build-progress', { 
      step: 'build', 
      progress: 50, 
      message: 'Starting executable build...' 
    });
    
    const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
    const platformFlag = `--${platform}`;
    
    // Use node_modules/.bin/electron-builder directly
    const builderPath = path.join(tempDir, 'node_modules', '.bin', 'electron-builder');
    const builderCmd = process.platform === 'win32' ? `"${builderPath}.cmd"` : builderPath;
    
    // Track build phases from electron-builder output for granular progress
    let buildProgress = 50;
    const progressPhases = {
      'loaded configuration': { pct: 52, msg: 'Loading build configuration...' },
      'electron-builder': { pct: 54, msg: 'Initializing electron-builder...' },
      'downloading': { pct: 58, msg: 'Downloading Electron binary (one-time)...' },
      'verifying': { pct: 62, msg: 'Verifying Electron binary...' },
      'packaging': { pct: 66, msg: 'Packaging application files...' },
      'building': { pct: 72, msg: 'Building executable...' },
      'packing': { pct: 78, msg: 'Packing into final executable...' },
      'done': { pct: 84, msg: 'Finalising build output...' },
    };

    try {
      await execAsyncWithProgress(`${builderCmd} ${platformFlag}`, { 
        cwd: tempDir, 
        env: { ...process.env, CI: 'true' }
      }, (line) => {
        const lower = line.toLowerCase();
        for (const [keyword, info] of Object.entries(progressPhases)) {
          if (lower.includes(keyword) && info.pct > buildProgress) {
            buildProgress = info.pct;
            event.sender.send('build-progress', {
              step: 'build',
              progress: buildProgress,
              message: info.msg
            });
          }
        }
        // Nudge progress up gradually even without keyword matches so the bar
        // never sits still for too long.
        if (buildProgress < 84) {
          buildProgress = Math.min(buildProgress + 0.5, 84);
          event.sender.send('build-progress', {
            step: 'build',
            progress: Math.round(buildProgress),
            message: 'Building executable... please wait'
          });
        }
      });
    } catch (err) {
      console.error('Build error:', err);
      const stderr = err.stderr || '';
      const stdout = err.stdout || '';
      const message = err.message || '';
      throw new Error('Electron builder failed: ' + (stderr || stdout || message));
    }

    event.sender.send('build-progress', {
      step: 'build',
      progress: 86,
      message: 'Build complete — locating executable...'
    });

    // Find the built executable
    const distDir = path.join(tempDir, 'dist');
    
    if (!fs.existsSync(distDir)) {
      throw new Error('Dist directory not found after build');
    }
    
    const files = fs.readdirSync(distDir);
    console.log('Files in dist directory:', files);
    
    let exePath;
    let fullExePath;
    let isDirectory = false;
    
    if (platform === 'win') {
      // For portable build, look for .exe file directly in dist
      exePath = files.find(f => f.endsWith('.exe') && !f.includes('Setup'));
      if (exePath) {
        fullExePath = path.join(distDir, exePath);
      } else {
        // Look for win-unpacked folder
        const unpackedDir = files.find(f => f.includes('win-unpacked'));
        if (unpackedDir) {
          fullExePath = path.join(distDir, unpackedDir);
          exePath = unpackedDir;
          isDirectory = true;
        }
      }
    } else if (platform === 'mac') {
      // For mac dir build, look for .app folder
      exePath = files.find(f => f.endsWith('.app'));
      if (exePath) {
        fullExePath = path.join(distDir, exePath);
        isDirectory = true;
      }
    } else {
      // For linux dir build, look for AppImage or unpacked folder
      exePath = files.find(f => f.endsWith('.AppImage'));
      if (exePath) {
        fullExePath = path.join(distDir, exePath);
      } else {
        // Look for unpacked folder
        const unpackedDir = files.find(f => f.includes('linux-unpacked'));
        if (unpackedDir) {
          fullExePath = path.join(distDir, unpackedDir);
          exePath = unpackedDir;
          isDirectory = true;
        }
      }
    }

    if (!fullExePath || !fs.existsSync(fullExePath)) {
      console.error('Available files:', files);
      throw new Error('Built executable not found. Available files: ' + files.join(', '));
    }

    // Ask user where to save
    event.sender.send('build-progress', {
      step: 'save',
      progress: 88,
      message: 'Choose where to save your game...'
    });

    let savePath;
    if (isDirectory) {
      // For directories, use folder selection dialog
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose Where to Save Game Folder',
        defaultPath: app.getPath('downloads'),
        properties: ['openDirectory', 'createDirectory']
      });
      
      if (result.filePaths && result.filePaths.length > 0) {
        savePath = path.join(result.filePaths[0], exePath);
      }
    } else {
      // For single files, use save dialog
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Desktop Game',
        defaultPath: path.join(app.getPath('downloads'), exePath),
        filters: [
          { name: 'Executable', extensions: [exePath.split('.').pop()] }
        ]
      });
      savePath = result.filePath;
    }

    if (savePath) {
      event.sender.send('build-progress', {
        step: 'save',
        progress: 90,
        message: 'Saving executable...'
      });

      // Yield to the event loop so the progress update actually reaches the renderer
      await new Promise(resolve => setTimeout(resolve, 50));

      if (isDirectory) {
        // Copy entire directory recursively
        fs.cpSync(fullExePath, savePath, { recursive: true });
      } else {
        // Copy single file
        fs.copyFileSync(fullExePath, savePath);
      }

      event.sender.send('build-progress', {
        step: 'save',
        progress: 94,
        message: 'Cleaning up temporary files...'
      });

      // Yield so the UI updates before blocking cleanup
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Clean up temp directory with retry logic
      // Remove junction/symlink first so rmSync doesn't follow into cache
      const nmLink = path.join(tempDir, 'node_modules');
      try {
        const stat = fs.lstatSync(nmLink);
        if (stat.isSymbolicLink()) fs.unlinkSync(nmLink);
      } catch { /* not a link, fine */ }

      let retries = 3;
      while (retries > 0) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
          break;
        } catch (err) {
          retries--;
          if (retries === 0) {
            console.warn('Failed to clean up temp directory:', err);
          } else {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      return { success: true, path: savePath };
    }

    // Clean up temp directory (remove junction first)
    try {
      const nmLink2 = path.join(tempDir, 'node_modules');
      try { const s = fs.lstatSync(nmLink2); if (s.isSymbolicLink()) fs.unlinkSync(nmLink2); } catch {}
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
    } catch (err) {
      console.warn('Failed to clean up temp directory:', err);
    }
    
    return { success: false, error: 'User cancelled' };
    
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      details: error.stack 
    };
  }
});

// Multi-Window Management
const managerWindows = new Map();

ipcMain.on('open-manager-window', (event, config) => {
  const { type, width, height, title } = config;
  
  // If window already exists, focus it
  if (managerWindows.has(type) && !managerWindows.get(type).isDestroyed()) {
    managerWindows.get(type).focus();
    return;
  }
  
  // Create new manager window
  const managerWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../docs/Flourish.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    backgroundColor: '#1a102c',
    title,
    show: false,
    skipTaskbar: false
  });
  
  // Load the same app
  managerWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  hardenWebContents(managerWindow.webContents);
  
  // Send window type and project data to renderer after load
  managerWindow.webContents.once('did-finish-load', () => {
    // Get project data from main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript('window.__FLOURISH_PROJECT__')
        .then(projectData => {
          managerWindow.webContents.send('window-type', { type, project: projectData });
          managerWindow.show();
        })
        .catch(() => {
          // If no project data, just send type
          managerWindow.webContents.send('window-type', { type });
          managerWindow.show();
        });
    } else {
      managerWindow.webContents.send('window-type', { type });
      managerWindow.show();
    }
  });
  
  // Remove from map when closed
  managerWindow.on('closed', () => {
    managerWindows.delete(type);
  });
  
  managerWindows.set(type, managerWindow);
});

ipcMain.on('focus-main-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    mainWindow.show();
    mainWindow.restore(); // In case it's minimized
  }
});

ipcMain.on('focus-manager-window', (event, type) => {
  if (managerWindows.has(type) && !managerWindows.get(type).isDestroyed()) {
    const win = managerWindows.get(type);
    win.focus();
    win.show();
    win.restore(); // In case it's minimized
  }
});

ipcMain.on('close-all-manager-windows', () => {
  managerWindows.forEach(win => {
    if (!win.isDestroyed()) {
      win.close();
    }
  });
  managerWindows.clear();
});

// Sync project changes across all windows
ipcMain.on('sync-project-state', (event, projectData) => {
  // Update main window
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== event.sender) {
    mainWindow.webContents.send('project-state-update', projectData);
  }
  
  // Update all manager windows
  managerWindows.forEach(win => {
    if (!win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send('project-state-update', projectData);
    }
  });
});

ipcMain.handle('save-project-export', async (event, { data, filename }) => {
  try {
    const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showSaveDialog(targetWindow, {
      title: 'Save Project Export',
      defaultPath: path.join(app.getPath('downloads'), filename),
      filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    const buffer = Buffer.from(data);
    fs.writeFileSync(result.filePath, buffer);

    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Failed to save project export:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('set-hub-active', (_event, isActive) => {
  isHubActive = isActive;
});

// Allow renderer to quit the app after save confirmation
ipcMain.on('confirm-quit', () => {
  // Close all manager/child windows first so window-all-closed fires cleanly.
  managerWindows.forEach(win => {
    if (!win.isDestroyed()) win.destroy();
  });
  managerWindows.clear();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.forceClose = true;
    mainWindow.close();
  }
});

// Get app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});



// Cancel quit
ipcMain.on('cancel-quit', () => {
  // Just do nothing, window won't close
  console.log('Quit cancelled by user');
});
