const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// ── Steam Detection ─────────────────────────────────────────────────────────
// When Flourish is launched through the Steam client, Steam injects several
// environment variables into the process. Detecting these lets us disable the
// GitHub-based electron-updater so it doesn't fight with Steam's own update
// system. Steam users get updates automatically through the Steam client;
// itch.io and direct-download users continue to get updates from GitHub
// exactly as before.
const isRunningUnderSteam = !!(process.env.SteamAppId || process.env.SteamGameId);
if (isRunningUnderSteam) {
  console.log('[startup] Detected Steam environment — GitHub auto-updater disabled. Updates will be handled by Steam.');
}

/** Write one game file to disk, handling the various shapes that arrive over IPC. */
function writeGameFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (content instanceof Buffer) {
    fs.writeFileSync(filePath, content);
  } else if (content instanceof ArrayBuffer) {
    fs.writeFileSync(filePath, Buffer.from(content));
  } else if (ArrayBuffer.isView(content)) {
    fs.writeFileSync(filePath, Buffer.from(content.buffer, content.byteOffset, content.byteLength));
  } else if (content && typeof content === 'object' && content.type === 'Buffer' && Array.isArray(content.data)) {
    fs.writeFileSync(filePath, Buffer.from(content.data));
  } else {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

/**
 * Locate the build toolchain that ships bundled with Flourish:
 *   build-tools/
 *     node(.exe)                – portable Node runtime used to run the builder
 *     node_modules/             – electron + electron-builder, pre-installed
 *     cache/electron            – pre-seeded Electron binaries (offline)
 *     cache/electron-builder    – pre-seeded NSIS / winCodeSign tools (offline)
 *
 * Packaged builds ship this under `resources/build-tools` (electron-builder
 * extraResources). In development it's staged at `<repo>/build-tools` by
 * `npm run stage:build-tools`.
 */
function getBuildToolchain() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'build-tools'));
  candidates.push(path.join(__dirname, '..', 'build-tools'));

  const toolsDir = candidates.find((d) => fs.existsSync(d));
  if (!toolsDir) {
    throw new Error(
      'The desktop build tools were not found. They should ship inside Flourish ' +
      '(resources/build-tools). Try reinstalling Flourish Visual Novel Engine.'
    );
  }
  return {
    toolsDir,
    nodeExe: path.join(toolsDir, process.platform === 'win32' ? 'node.exe' : 'node'),
    nodeModules: path.join(toolsDir, 'node_modules'),
    cacheDir: path.join(toolsDir, 'cache'),
  };
}

/** Pick the deliverable that electron-builder produced in dist/. */
function pickBuiltArtifact(files, platform) {
  if (platform === 'win') {
    const setup = files.find((f) => /setup/i.test(f) && f.toLowerCase().endsWith('.exe'));
    if (setup) return { name: setup, isDir: false };
    const exe = files.find((f) => f.toLowerCase().endsWith('.exe'));
    if (exe) return { name: exe, isDir: false };
    const unpacked = files.find((f) => f.includes('win-unpacked'));
    if (unpacked) return { name: unpacked, isDir: true };
  } else if (platform === 'mac') {
    const dmg = files.find((f) => f.toLowerCase().endsWith('.dmg'));
    if (dmg) return { name: dmg, isDir: false };
    const appBundle = files.find((f) => f.endsWith('.app'));
    if (appBundle) return { name: appBundle, isDir: true };
  } else {
    const appImage = files.find((f) => f.endsWith('.AppImage'));
    if (appImage) return { name: appImage, isDir: false };
    const deb = files.find((f) => f.endsWith('.deb'));
    if (deb) return { name: deb, isDir: false };
    const unpacked = files.find((f) => f.includes('linux-unpacked'));
    if (unpacked) return { name: unpacked, isDir: true };
  }
  return { name: null, isDir: false };
}

/** Spawn a process, streaming each stdout/stderr line to onLine. Resolves on exit 0. */
function spawnWithProgress(command, args, options, onLine) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { ...options, windowsHide: true });
    let tail = '';
    const handle = (buf) => {
      const text = buf.toString();
      tail = (tail + text).slice(-4000);
      text.split(/\r?\n/).forEach((line) => { if (line.trim()) onLine(line.trim()); });
    };
    if (proc.stdout) proc.stdout.on('data', handle);
    if (proc.stderr) proc.stderr.on('data', handle);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('electron-builder exited with code ' + code + (tail ? '\n' + tail : '')));
    });
  });
}


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
let updateDownloaded = false;
/** File path passed via CLI / file-association / second-instance. */
let pendingOpenFilePath = null;

// ── Auto-Updater Logging ────────────────────────────────────────────────────
// All auto-updater events are written to BOTH the console AND a dedicated
// log file in the user's Documents folder, where it's easy to find:
//
//   Windows:  %USERPROFILE%\Documents\Flourish Visual Novel Engine\Logs\auto-updater.log
//   macOS:    ~/Documents/Flourish Visual Novel Engine/Logs/auto-updater.log
//   Linux:    ~/Documents/Flourish Visual Novel Engine/Logs/auto-updater.log
//
// We use SYNCHRONOUS file writes (appendFileSync) so logs are guaranteed to
// land on disk even if the app crashes immediately after the call. The path
// is resolved lazily so it works whether the logger is invoked before or
// after app.whenReady().
let autoUpdaterLogFile = null;
let autoUpdaterLogFileError = null;
function getAutoUpdaterLogFile() {
  if (autoUpdaterLogFile) return autoUpdaterLogFile;
  // Try Documents first (user-visible). Fall back to userData, then temp.
  const candidates = [];
  try { candidates.push(path.join(app.getPath('documents'), 'Flourish Visual Novel Engine', 'Logs')); } catch {}
  try { candidates.push(path.join(app.getPath('userData'), 'logs')); } catch {}
  try { candidates.push(path.join(os.tmpdir(), 'flourish-vne-logs')); } catch {}

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'auto-updater.log');
      // Touch the file to ensure we have write permission.
      fs.appendFileSync(file, '');
      autoUpdaterLogFile = file;
      return autoUpdaterLogFile;
    } catch (err) {
      autoUpdaterLogFileError = `${dir}: ${err?.message}`;
      // Try next candidate.
    }
  }
  console.error('[auto-updater] Could not create log file in any candidate location. Last error:', autoUpdaterLogFileError);
  return null;
}

/**
 * Append a structured, timestamped line to the auto-updater log file
 * AND echo it to the console. Uses SYNCHRONOUS file I/O so messages
 * are flushed to disk immediately — important when diagnosing crashes
 * or hangs in the updater pipeline.
 *
 * @param {'info'|'warn'|'error'|'debug'} level
 * @param {string} message
 * @param {object} [meta]  Optional structured data to JSON-stringify.
 */
function logUpdate(level, message, meta) {
  const ts = new Date().toISOString();
  const prefix = `[auto-updater] [${level.toUpperCase()}]`;
  let metaStr = '';
  if (meta !== undefined) {
    try {
      metaStr = ' ' + (typeof meta === 'string' ? meta : JSON.stringify(meta));
    } catch {
      metaStr = ' [meta unserializable]';
    }
  }
  const line = `${ts} ${prefix} ${message}${metaStr}`;

  // Console output (visible in `electron .` terminal / packaged app logs).
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  // SYNCHRONOUS file output so logs are durable even if the app crashes.
  try {
    const file = getAutoUpdaterLogFile();
    if (file) {
      fs.appendFileSync(file, line + '\n');
    }
  } catch (err) {
    console.error('[auto-updater] Logger threw while writing to file:', err?.message);
  }
}

// Emit a startup banner as early as possible so the log file is created and
// you can see immediately whether logging is wired up. This runs at module
// load, BEFORE app.whenReady().
(() => {
  const file = getAutoUpdaterLogFile();
  try {
    if (file) {
      const banner =
        '\n' +
        '════════════════════════════════════════════════════════════════════\n' +
        ` Flourish Visual Novel Engine auto-updater log — process started ${new Date().toISOString()}\n` +
        ` PID: ${process.pid}   Platform: ${process.platform}   Electron: ${process.versions.electron}\n` +
        ` Log file: ${file}\n` +
        '════════════════════════════════════════════════════════════════════\n';
      fs.appendFileSync(file, banner);
      console.log(banner.trim());
    } else {
      console.error('[auto-updater] WARNING: log file could not be created. Last error:', autoUpdaterLogFileError);
    }
  } catch (err) {
    console.error('[auto-updater] Failed to write startup banner:', err?.message);
  }
})();

// ── Default user directories ────────────────────────────────────────────────
// These are created on first launch so the user always has a sensible place
// for projects and built games, located in Documents/Flourish Visual Novel Engine.
const flourishDocsRoot = path.join(app.getPath('documents'), 'Flourish VNE');
const defaultProjectsDir = path.join(flourishDocsRoot, 'Projects');
const defaultBuildsWebDir = path.join(flourishDocsRoot, 'Builds', 'Web');
const defaultBuildsDesktopDir = path.join(flourishDocsRoot, 'Builds', 'Desktop');

/**
 * Ensure all default user directories exist.  Called once on app-ready.
 */
function ensureUserDirectories() {
  for (const dir of [defaultProjectsDir, defaultBuildsWebDir, defaultBuildsDesktopDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

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
  <div class="brand">Flourish Visual Novel Engine</div>
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
    icon: path.join(__dirname, '../public/Flourish.png'),
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

  // Show the main window maximized and close the splash once the app is painted.
  // We use ready-to-show because it fires once the first non-blank frame is
  // ready — at that point the user can see real UI, not a blank window.
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  // Once the renderer's DOM is fully loaded, send any pending file-open
  // request (from double-clicking a .flourish file to launch the app).
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingOpenFilePath) {
      mainWindow.webContents.send('open-file', pendingOpenFilePath);
      pendingOpenFilePath = null;
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
            // Docs ship as unpacked extraResources in a packaged build (real filesystem path so the
            // OS can open the .html), and live at repo-root /docs in dev. Resolve accordingly, verify
            // the file exists, and surface a friendly dialog instead of a raw Windows "file not found".
            const docsDir = app.isPackaged
              ? path.join(process.resourcesPath, 'docs')
              : path.join(__dirname, '../docs');
            const indexPath = path.join(docsDir, 'index.html');
            try {
              if (!fs.existsSync(indexPath)) {
                throw new Error(`Documentation file not found at:\n${indexPath}`);
              }
              const err = await shell.openPath(indexPath);
              if (err) throw new Error(err);
            } catch (e) {
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Documentation',
                message: 'Could not open the documentation.',
                detail: (e && e.message) ? e.message : String(e),
                buttons: ['OK']
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Open Auto-Updater Log',
          click: async () => {
            const file = getAutoUpdaterLogFile();
            if (file) {
              shell.showItemInFolder(file);
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Auto-Updater Log',
                message: 'Log file is not available.',
                detail: autoUpdaterLogFileError || 'Could not create a log file in any candidate location.',
                buttons: ['OK']
              });
            }
          }
        },
        {
          label: 'Open Logs Folder',
          click: async () => {
            const file = getAutoUpdaterLogFile();
            const dir = file ? path.dirname(file) : null;
            if (dir) {
              await shell.openPath(dir);
            } else {
              dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Logs Folder',
                message: 'Logs folder is not available.',
                detail: autoUpdaterLogFileError || 'Could not create a logs folder in any candidate location.',
                buttons: ['OK']
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'About Flourish',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Flourish Visual Novel Engine',
              message: 'Flourish Visual Novel Engine',
              detail: `Version ${app.getVersion()}\n\nCreate beautiful interactive stories without coding.\n\n© 2025 - Made with ❤️ for storytellers everywhere`,
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
  // Create default user directories (Documents/Flourish Visual Novel Engine/…)
  ensureUserDirectories();

  // ── File-association / CLI open ──
  // If the user double-clicked a .flourish file, the path is in process.argv.
  const cliFile = process.argv.find(
    (a) => a.endsWith('.flourish') && fs.existsSync(a)
  );
  if (cliFile) pendingOpenFilePath = path.resolve(cliFile);

  createSplashWindow();
  // Start the heavy main-window load immediately — no need to wait for the
  // simple splash HTML to finish loading.
  createWindow();

  // ── Auto-Update ──────────────────────────────────────────────────────────
  // Configure electron-updater: download updates silently in the background.
  // Once downloaded, the renderer is notified and shows a restart prompt.
  // SKIPPED entirely when running under Steam — Steam handles its own updates
  // and we don't want two update systems fighting over the same files.
  logUpdate('info', '=== Auto-updater bootstrap starting ===', {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    isRunningUnderSteam,
    logFile: getAutoUpdaterLogFile(),
  });

  if (isRunningUnderSteam) {
    logUpdate('info', 'Skipping electron-updater initialization — running under Steam.');
  } else if (!app.isPackaged) {
    logUpdate('warn', 'App is not packaged (dev mode). electron-updater normally requires a packaged build; check will likely fail with "dev-app-update.yml" errors.');
  }

  if (!isRunningUnderSteam) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false; // Disable so manual "Restart & Update" is the single trigger — prevents double-spawning the installer.
    autoUpdater.autoRunAppAfterInstall = true;
    logUpdate('info', 'electron-updater configured', {
      autoDownload: autoUpdater.autoDownload,
      autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
      autoRunAppAfterInstall: autoUpdater.autoRunAppAfterInstall,
    });

    // Wire electron-updater's internal logger into our file logger so we
    // capture the library's own diagnostic output too (HTTP requests, file
    // hash checks, signature verification, etc.).
    autoUpdater.logger = {
      info: (msg) => logUpdate('info', `[lib] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`),
      warn: (msg) => logUpdate('warn', `[lib] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`),
      error: (msg) => logUpdate('error', `[lib] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`),
      debug: (msg) => logUpdate('debug', `[lib] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`),
    };

    // Log resolved feed URL so we can verify the publish config is reaching
    // electron-updater correctly. Wrapped in try/catch because getFeedURL can
    // throw if no feed is configured yet.
    try {
      const feedUrl = autoUpdater.getFeedURL?.();
      logUpdate('info', 'Feed URL', { feedUrl: feedUrl || '(none / using publish config)' });
    } catch (err) {
      logUpdate('warn', 'Could not read feed URL', { error: err?.message });
    }

    // Forward update lifecycle events to the renderer so we can show UI.
    autoUpdater.on('checking-for-update', () => {
      logUpdate('info', 'Event: checking-for-update');
      sendUpdateStatus('checking');
    });

    autoUpdater.on('update-available', (info) => {
      logUpdate('info', 'Event: update-available', {
        version: info?.version,
        releaseDate: info?.releaseDate,
        files: Array.isArray(info?.files) ? info.files.map(f => ({ url: f.url, size: f.size })) : undefined,
      });
      sendUpdateStatus('available', {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      logUpdate('info', 'Event: update-not-available', {
        currentVersion: app.getVersion(),
        latestVersion: info?.version,
      });
      sendUpdateStatus('not-available');
    });

    autoUpdater.on('download-progress', (progress) => {
      logUpdate('info', 'Event: download-progress', {
        percent: Math.round(progress?.percent ?? 0),
        bytesPerSecond: progress?.bytesPerSecond,
        transferred: progress?.transferred,
        total: progress?.total,
      });
      sendUpdateStatus('downloading', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      updateDownloaded = true;
      logUpdate('info', 'Event: update-downloaded', {
        version: info?.version,
        releaseDate: info?.releaseDate,
        downloadedFile: info?.downloadedFile,
      });
      sendUpdateStatus('downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('error', (err) => {
      logUpdate('error', 'Event: error', {
        message: err?.message,
        code: err?.code,
        stack: err?.stack,
      });
      sendUpdateStatus('error', { message: err?.message || 'Unknown error' });
    });

    // Kick off the check after a short delay so the UI finishes rendering first.
    setTimeout(() => {
      logUpdate('info', 'Initial auto-check: calling autoUpdater.checkForUpdates()');
      autoUpdater.checkForUpdates()
        .then((result) => {
          logUpdate('info', 'Initial auto-check: checkForUpdates() resolved', {
            updateInfoVersion: result?.updateInfo?.version,
            cancellationToken: !!result?.cancellationToken,
          });
        })
        .catch((err) => {
          logUpdate('error', 'Initial auto-check: checkForUpdates() rejected', {
            message: err?.message,
            code: err?.code,
            stack: err?.stack,
          });
        });
    }, 3000); // milliseconds
  }

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Send auto-update status to the renderer process.
 * Silently no-ops if the window doesn't exist yet.
 */
function sendUpdateStatus(status, data = {}) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status, ...data });
      logUpdate('debug', `IPC → renderer 'update-status'`, { status, ...data });
    } else {
      logUpdate('warn', `IPC → renderer 'update-status' dropped (no main window)`, { status, ...data });
    }
  } catch (err) {
    // Window may be mid-creation; ignore but log.
    logUpdate('warn', `sendUpdateStatus threw`, { error: err?.message, status });
  }
}

/**
 * Gracefully quit the app and install the pending update.
 *
 * We avoid force-destroying windows or overriding app.quit because that
 * kills Electron's background processes (GPU, renderer) instantly, and
 * the NSIS installer races against those lingering file locks.
 *
 * Instead we let electron-updater close windows through the normal
 * lifecycle so all child processes release file handles naturally.
 * The `isQuitting` flag tells our own 'close' handlers to allow it.
 */
function performQuitAndInstall() {
  logUpdate('info', 'performQuitAndInstall() invoked — preparing graceful shutdown');

  // Signal to our window 'close' listeners that closing is allowed.
  isQuitting = true;

  // Remove any custom 'window-all-closed' listener that might interfere
  // with electron-updater's shutdown sequence.
  app.removeAllListeners('window-all-closed');
  logUpdate('debug', 'Removed window-all-closed listeners; calling autoUpdater.quitAndInstall(false, true)');

  // Let electron-updater gracefully close the app and run the installer.
  // isSilent = false → allows the NSIS installer to briefly show its progress
  //   bar UI, which gives Windows the few milliseconds it needs to fully
  //   release file locks before the installer overwrites files.  With
  //   oneClick: true in package.json no wizard/prompts appear — just a
  //   small progress bar that vanishes automatically.
  // isForceRunAfter = true → automatically restart the app after installing.
  try {
    autoUpdater.quitAndInstall(false, true);
    logUpdate('info', 'autoUpdater.quitAndInstall returned (app should be exiting now)');
  } catch (err) {
    logUpdate('error', 'autoUpdater.quitAndInstall threw', {
      message: err?.message,
      stack: err?.stack,
    });
  }
}

// IPC: renderer requests to install a downloaded update and restart.
// Uses handle (not on) so the renderer gets a response / error.
ipcMain.handle('install-update', async () => {
  logUpdate('info', "IPC ← renderer 'install-update' received", { updateDownloaded, isRunningUnderSteam });

  // Steam users should never trigger this path — Steam manages updates
  // independently. If somehow called (e.g. UI button still visible), return
  // a friendly status so the renderer can ignore it gracefully.
  if (isRunningUnderSteam) {
    logUpdate('info', "'install-update' ignored — running under Steam");
    return { status: 'managed-externally', message: 'Updates are managed automatically by Steam.' };
  }

  if (updateDownloaded) {
    // Already downloaded — quit and install immediately.
    logUpdate('info', "'install-update': update already downloaded — performing quit-and-install");
    performQuitAndInstall();
    return { status: 'installing' };
  }

  // Not yet downloaded. Trigger check + download, then auto-install
  // once the download completes.
  logUpdate('info', "'install-update': update not yet downloaded — triggering check + download");
  sendUpdateStatus('downloading', { percent: 0 });

  return new Promise((resolve) => {
    // Set a timeout so the user isn't stuck forever
    const timeout = setTimeout(() => {
      cleanup();
      const msg = 'Update timed out. Please try downloading manually from GitHub.';
      logUpdate('error', "'install-update': timed out after 120s", { msg });
      sendUpdateStatus('error', { message: msg });
      resolve({ status: 'error', message: msg });
    }, 120000); // 2 minutes

    function cleanup() {
      clearTimeout(timeout);
      autoUpdater.removeListener('update-downloaded', onDownloaded);
      autoUpdater.removeListener('error', onError);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      logUpdate('debug', "'install-update': cleanup() — listeners removed");
    }

    const onDownloaded = (info) => {
      cleanup();
      logUpdate('info', "'install-update': onDownloaded — performing quit-and-install", {
        version: info?.version,
        downloadedFile: info?.downloadedFile,
      });
      performQuitAndInstall();
      resolve({ status: 'installing' });
    };

    const onError = (err) => {
      cleanup();
      const msg = err?.message || 'Download failed';
      logUpdate('error', "'install-update': onError", {
        message: msg,
        code: err?.code,
        stack: err?.stack,
      });
      sendUpdateStatus('error', { message: msg });
      resolve({ status: 'error', message: msg });
    };

    const onNotAvailable = (info) => {
      cleanup();
      const msg = 'No update available to download. You may already be on the latest version.';
      logUpdate('warn', "'install-update': onNotAvailable", {
        currentVersion: app.getVersion(),
        latestVersion: info?.version,
      });
      sendUpdateStatus('error', { message: msg });
      resolve({ status: 'error', message: msg });
    };

    autoUpdater.once('update-downloaded', onDownloaded);
    autoUpdater.once('error', onError);
    autoUpdater.once('update-not-available', onNotAvailable);

    logUpdate('info', "'install-update': calling autoUpdater.checkForUpdates()");
    autoUpdater.checkForUpdates()
      .then((result) => {
        logUpdate('info', "'install-update': checkForUpdates() resolved", {
          updateInfoVersion: result?.updateInfo?.version,
          cancellationToken: !!result?.cancellationToken,
        });
      })
      .catch((err) => {
        cleanup();
        const msg = err?.message || 'Failed to check for updates';
        logUpdate('error', "'install-update': checkForUpdates() rejected", {
          message: msg,
          code: err?.code,
          stack: err?.stack,
        });
        sendUpdateStatus('error', { message: msg });
        resolve({ status: 'error', message: msg });
      });
  });
});

// IPC: renderer requests a manual update check
ipcMain.handle('check-for-updates', async () => {
  logUpdate('info', "IPC ← renderer 'check-for-updates' received", { isRunningUnderSteam });

  // Under Steam, return a status indicating updates are externally managed
  // rather than actually hitting GitHub.
  if (isRunningUnderSteam) {
    logUpdate('info', "'check-for-updates' short-circuited under Steam");
    return { success: true, managedExternally: true, message: 'Updates are managed automatically by Steam.' };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    logUpdate('info', "'check-for-updates' resolved", {
      updateInfoVersion: result?.updateInfo?.version,
      currentVersion: app.getVersion(),
    });
    return { success: true, version: result?.updateInfo?.version };
  } catch (err) {
    logUpdate('error', "'check-for-updates' threw", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });
    return { success: false, message: err?.message || 'Check failed' };
  }
});

// IPC: renderer requests the location of the auto-updater log file.
// Returns the absolute path so the UI can show it or open it.
ipcMain.handle('get-update-log-path', async () => {
  const file = getAutoUpdaterLogFile();
  return {
    path: file,
    folder: file ? path.dirname(file) : null,
    error: file ? null : autoUpdaterLogFileError,
  };
});

// IPC: renderer asks us to reveal the log file in Explorer / Finder.
ipcMain.handle('open-update-log', async () => {
  const file = getAutoUpdaterLogFile();
  if (!file) {
    return { success: false, message: autoUpdaterLogFileError || 'Log file not available' };
  }
  try {
    // Show the file highlighted in its parent folder (Explorer on Windows,
    // Finder on macOS, file manager on Linux).
    shell.showItemInFolder(file);
    return { success: true, path: file };
  } catch (err) {
    return { success: false, message: err?.message || 'Failed to open log file' };
  }
});

// If a second instance is launched, focus the existing window instead.
// If the second instance was invoked with a .flourish file path (e.g. the
// user double-clicked a project file while the app is running), forward it
// to the renderer so it can open the project.
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    // Look for a .flourish path in the new argv
    const filePath = argv.find(
      (a) => a.endsWith('.flourish') && fs.existsSync(a)
    );
    if (filePath) {
      mainWindow.webContents.send('open-file', path.resolve(filePath));
    }
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

  // If we're installing an update, do NOT force-exit — let the installer
  // take over gracefully.
  if (updateDownloaded) return;

  // Force-exit after a brief grace period in case something keeps the
  // event loop alive (GPU process, open handles, etc.).
  setTimeout(() => {
    console.warn('App did not exit cleanly – forcing process.exit()');
    process.exit(0);
  }, 3000);
});

// IPC Handler: Build a desktop game with electron-builder.
//
// The build toolchain (Node, electron-builder, Electron + offline caches) ships
// bundled inside Flourish — see getBuildToolchain(). So this runs with no system
// Node, no npm install, and no network: the game files are written to a temp
// folder, the pre-bundled node_modules are linked in, and electron-builder is
// run by the bundled Node to produce a standalone .exe or an installer.
ipcMain.handle('build-desktop-game', async (event, { project, gameFiles }) => {
  const send = (step, progress, message) => {
    try { event.sender.send('build-progress', { step, progress, message }); } catch {}
  };

  let tempDir;
  try {
    const { nodeExe, nodeModules, cacheDir } = getBuildToolchain();
    if (!fs.existsSync(nodeExe)) {
      throw new Error('The bundled Node runtime is missing (' + path.basename(nodeExe) + '). Try reinstalling Flourish VNE.');
    }
    if (!fs.existsSync(nodeModules)) {
      throw new Error('The bundled build dependencies are missing. Try reinstalling Flourish Visual Novel Engine.');
    }

    // 1. Write the generated game files into a fresh temp build directory.
    tempDir = path.join(os.tmpdir(), 'flourish-game-build-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    send('generate', 28, 'Preparing build files...');
    for (const [filename, content] of Object.entries(gameFiles)) {
      writeGameFile(path.join(tempDir, filename), content);
    }

    // 2. Link the pre-bundled dependencies into the build dir (no npm install).
    //    A junction is instant and needs no admin rights on Windows.
    send('install', 38, 'Linking bundled dependencies...');
    const nmLink = path.join(tempDir, 'node_modules');
    try {
      fs.symlinkSync(nodeModules, nmLink, 'junction');
    } catch {
      fs.cpSync(nodeModules, nmLink, { recursive: true });
    }
    const ebCli = path.join(nmLink, 'electron-builder', 'out', 'cli', 'cli.js');
    if (!fs.existsSync(ebCli)) {
      throw new Error('Bundled electron-builder not found. Try reinstalling Flourish Visual Novel Engine.');
    }

    // 3. Run electron-builder via the bundled Node, fully offline. Caches are
    //    pre-seeded so it never reaches the network.
    const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
    send('build', 50, 'Starting executable build...');
    let pct = 50;
    const phases = {
      'loaded configuration': 54,
      'packaging': 62,
      'building': 70,
      'building embedded': 74,
      'signing': 78,
      'building block map': 82,
    };
    const env = {
      ...process.env,
      ELECTRON_CACHE: path.join(cacheDir, 'electron'),
      electron_config_cache: path.join(cacheDir, 'electron'),
      ELECTRON_BUILDER_CACHE: path.join(cacheDir, 'electron-builder'),
      CI: 'true',
    };

    try {
      await spawnWithProgress(nodeExe, [ebCli, '--' + platform], { cwd: tempDir, env }, (line) => {
        console.log('[electron-builder]', line);
        const lower = line.toLowerCase();
        for (const [keyword, target] of Object.entries(phases)) {
          if (lower.includes(keyword) && target > pct) {
            pct = target;
            send('build', pct, 'Building executable...');
          }
        }
        if (pct < 84) {
          pct = Math.min(pct + 0.4, 84);
          send('build', Math.round(pct), 'Building executable... please wait');
        }
      });
    } catch (err) {
      const msg = (err && err.message) || String(err);
      throw new Error('The game build failed.\n' + msg.slice(0, 600));
    }

    // 4. Locate the artifact electron-builder produced.
    send('save', 86, 'Locating built game...');
    const distDir = path.join(tempDir, 'dist');
    if (!fs.existsSync(distDir)) {
      throw new Error('The build finished but produced no output folder.');
    }
    const files = fs.readdirSync(distDir);
    const { name: artifactName, isDir } = pickBuiltArtifact(files, platform);
    if (!artifactName) {
      throw new Error('Could not find the built game. Output contained: ' + files.join(', '));
    }
    const artifactPath = path.join(distDir, artifactName);

    // 5. Drop it into the user's Desktop builds folder.
    send('save', 92, 'Saving to your Desktop builds folder...');
    await new Promise((r) => setTimeout(r, 50));
    fs.mkdirSync(defaultBuildsDesktopDir, { recursive: true });
    const destPath = path.join(defaultBuildsDesktopDir, artifactName);
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    }
    if (isDir) {
      fs.cpSync(artifactPath, destPath, { recursive: true });
    } else {
      fs.copyFileSync(artifactPath, destPath);
    }

    send('complete', 100, 'Build complete!');
    try { shell.showItemInFolder(destPath); } catch {}

    return { success: true, path: destPath, folder: defaultBuildsDesktopDir };
  } catch (error) {
    console.error('[build] Desktop build failed:', error);
    return {
      success: false,
      error: error && error.message ? error.message : String(error),
      details: error && error.stack,
    };
  } finally {
    if (tempDir) {
      try {
        const nm = path.join(tempDir, 'node_modules');
        try { const s = fs.lstatSync(nm); if (s.isSymbolicLink()) fs.unlinkSync(nm); } catch {}
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
      } catch (e) {
        console.warn('[build] temp cleanup failed:', e && e.message);
      }
    }
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
    icon: path.join(__dirname, '../public/Flourish.png'),
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
  
  // Load the same app. Pass ?manager=<type> so the renderer can detect a
  // popped-out window *synchronously* on mount (before the async 'window-type'
  // message arrives) — otherwise it would auto-start its own hub music.
  managerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { manager: type } });

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
    // Ensure default filename uses .flourish extension
    const defaultName = filename.replace(/\.zip$/i, '').replace(/\.flourish$/i, '') + '.flourish';
    const result = await dialog.showSaveDialog(targetWindow, {
      title: 'Save Project',
      defaultPath: path.join(defaultProjectsDir, defaultName),
      filters: [
        { name: 'Flourish Project', extensions: ['flourish'] },
        { name: 'Zip Archive (legacy)', extensions: ['zip'] },
      ],
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

// ── User Directories & File-System Project Management ─────────────────────

/**
 * Return the default user data paths so the renderer can display them and
 * pre-fill save/open dialogs.
 */
ipcMain.handle('get-user-data-paths', () => {
  return {
    projects: defaultProjectsDir,
    buildsWeb: defaultBuildsWebDir,
    buildsDesktop: defaultBuildsDesktopDir,
    documents: flourishDocsRoot,
  };
});

/**
 * Save a project export (ZIP bytes) to a file path, defaulting to the
 * Projects directory.  If `filePath` is provided, writes directly there
 * (for "Save" to a known path).  If not, shows a native Save dialog.
 *
 * The `ext` parameter lets the caller choose between .flourish (the working
 * project format) and .zip (the classic shareable archive).
 */
ipcMain.handle('save-project-to-path', async (event, { data, filename, filePath, ext, defaultDir }) => {
  try {
    const extension = ext || 'flourish';
    let targetPath = filePath;

    if (!targetPath) {
      const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
      const defaultName = filename.replace(/\.zip$/i, '').replace(/\.flourish$/i, '') + '.' + extension;
      const saveDir = defaultDir || defaultProjectsDir;
      
      // Choose filters based on extension type
      const filters = extension === 'zip'
        ? [{ name: 'Zip Archive', extensions: ['zip'] }]
        : [
            { name: 'Flourish Project', extensions: ['flourish'] },
            { name: 'Zip Archive', extensions: ['zip'] },
          ];

      const result = await dialog.showSaveDialog(targetWindow, {
        title: extension === 'zip' ? 'Save Build' : 'Save Project',
        defaultPath: path.join(saveDir, defaultName),
        filters,
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      targetPath = result.filePath;
    }

    const buffer = Buffer.from(data);
    fs.writeFileSync(targetPath, buffer);

    return { success: true, filePath: targetPath };
  } catch (error) {
    console.error('Failed to save project:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Show an Open dialog, read a .flourish / .zip project file from disk,
 * and return its raw bytes to the renderer for import.
 */
ipcMain.handle('open-project-dialog', async (event) => {
  try {
    const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showOpenDialog(targetWindow, {
      title: 'Open Project',
      defaultPath: defaultProjectsDir,
      filters: [
        { name: 'Flourish Projects', extensions: ['flourish', 'zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    const fileBuffer = fs.readFileSync(filePath);

    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      data: fileBuffer, // Electron IPC serializes Buffer → Uint8Array in renderer
    };
  } catch (error) {
    console.error('Failed to open project:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Read a project file from a known path (e.g. from Recent Projects or
 * file-association double-click).  Returns raw file bytes.
 */
ipcMain.handle('read-project-file', async (_event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found: ' + filePath };
    }
    const fileBuffer = fs.readFileSync(filePath);
    return {
      success: true,
      filePath,
      fileName: path.basename(filePath),
      data: fileBuffer,
    };
  } catch (error) {
    console.error('Failed to read project file:', error);
    return { success: false, error: error.message };
  }
});

/**
 * List all .flourish and .zip files in the default Projects directory
 * so the ProjectHub can display them.
 */
ipcMain.handle('list-project-files', async () => {
  try {
    if (!fs.existsSync(defaultProjectsDir)) {
      return { success: true, files: [] };
    }

    const entries = fs.readdirSync(defaultProjectsDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && /\.(flourish|zip)$/i.test(e.name))
      .map((e) => {
        const fullPath = path.join(defaultProjectsDir, e.name);
        const stat = fs.statSync(fullPath);
        return {
          name: e.name,
          path: fullPath,
          size: stat.size,
          modified: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.modified - a.modified); // newest first

    return { success: true, files };
  } catch (error) {
    console.error('Failed to list project files:', error);
    return { success: false, error: error.message, files: [] };
  }
});

/**
 * Reveal a directory in the OS file explorer (Explorer / Finder).
 */
ipcMain.handle('reveal-in-explorer', async (_event, dirPath) => {
  try {
    if (fs.existsSync(dirPath)) {
      shell.openPath(dirPath);
      return { success: true };
    }
    return { success: false, error: 'Directory not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});