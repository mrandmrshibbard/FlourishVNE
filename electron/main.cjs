const { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

// Custom scheme that streams a project's media files from the managed asset library on disk, so the
// editor never has to hold gigabytes of base64 in memory. Must be declared as privileged BEFORE the
// app is ready. URL shape: flourish-asset://<projectId>/<relativePath> (e.g. assets/videos/<id>.mp4).
protocol.registerSchemesAsPrivileged([
  { scheme: 'flourish-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const androidToolchain = require('./androidToolchain.cjs');

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

// Long-running build/toolchain child processes (electron-builder, Gradle, sdkmanager,
// 7za, …). Tracked so we can kill them — and crucially their CHILDREN — if the user quits
// Flourish or cancels mid-build. On Windows a child's grandchildren (electron-builder spawns
// app-builder/makensis/7za; gradle spawns java) survive a plain parent kill, so we use
// `taskkill /T /F` to take down the whole tree; otherwise they'd orphan and keep running
// after the app closes.
const activeBuildProcs = new Set();

function killProcessTree(proc, sync) {
  if (!proc || proc.killed || proc.exitCode !== null) return;
  try {
    if (process.platform === 'win32' && proc.pid) {
      const args = ['/pid', String(proc.pid), '/T', '/F'];
      if (sync) spawnSync('taskkill', args, { windowsHide: true });
      else spawn('taskkill', args, { windowsHide: true });
    } else {
      proc.kill('SIGKILL');
    }
  } catch { /* best-effort */ }
}

/** Kill every tracked build process tree (on cancel or app quit). */
function killAllBuilds(sync) {
  for (const proc of activeBuildProcs) killProcessTree(proc, sync);
  activeBuildProcs.clear();
}

/** Spawn a process, streaming each stdout/stderr line to onLine. Resolves on exit 0. */
function spawnWithProgress(command, args, options, onLine) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { ...options, windowsHide: true });
    activeBuildProcs.add(proc);
    const done = () => activeBuildProcs.delete(proc);
    let tail = '';
    const handle = (buf) => {
      const text = buf.toString();
      tail = (tail + text).slice(-4000);
      text.split(/\r?\n/).forEach((line) => { if (line.trim()) onLine(line.trim()); });
    };
    if (proc.stdout) proc.stdout.on('data', handle);
    if (proc.stderr) proc.stderr.on('data', handle);
    proc.on('error', (err) => { done(); reject(err); });
    proc.on('close', (code) => {
      done();
      if (code === 0) resolve();
      else reject(new Error(path.basename(command) + ' exited with code ' + code + (tail ? '\n' + tail : '')));
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
const defaultBuildsAndroidDir = path.join(flourishDocsRoot, 'Builds', 'Android');

// The Android build toolchain (JDK + Android SDK + Gradle) is downloaded once on
// first use into userData (not bundled in the installer — it's ~3 GB on disk).
const androidToolchainRoot = path.join(app.getPath('userData'), 'android-toolchain');

// Managed per-project asset library: userData/projectAssets/<projectId>/<type>/<id>.<ext>
const projectAssetsRoot = path.join(app.getPath('userData'), 'projectAssets');
// Keep an id/segment to a single safe path segment (no separators, no traversal).
const safeSeg = (s) => String(s || '').replace(/[^a-zA-Z0-9._-]/g, '_');
function projectAssetDir(projectId) { return path.join(projectAssetsRoot, safeSeg(projectId)); }

/**
 * Ensure all default user directories exist.  Called once on app-ready.
 */
function ensureUserDirectories() {
  for (const dir of [defaultProjectsDir, defaultBuildsWebDir, defaultBuildsDesktopDir, defaultBuildsAndroidDir]) {
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
  .brand { font-size:2.2rem; font-weight:700; margin-bottom:1.4rem; text-align:center;
           padding:0 1rem;
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
    // Low minimum so the editor can be freely shrunk and docked beside popped-out panels.
    minWidth: 460,
    minHeight: 380,
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

  // ── The renderer died or is reloading: release any in-flight save ──────────────────────────────
  // The streaming export is driven chunk-by-chunk from the renderer; if that renderer goes away
  // (crash, Ctrl+R, the "New Project" reload, the unresponsive-recovery reload), its abort call
  // never arrives. Without this, `exportStream` stayed open forever and the re-entrancy guard then
  // refused EVERY future save with "A save is already in progress" until the app was restarted —
  // we'd traded a corruption bug for a can't-save bug. The user's real file is safe either way
  // (we only ever stream into a sidecar .part); this just cleans up so saving works again.
  const releaseAbandonedExport = (why) => {
    if (!isExportInProgress()) return;
    console.warn(`Renderer went away mid-save (${why}) — releasing the abandoned export stream.`);
    const temp = exportTempPath;
    try { exportStream.destroy(); } catch {}
    clearExportState();
    try { if (temp) fs.rmSync(temp, { force: true }); } catch {}
  };
  mainWindow.webContents.on('did-start-navigation', (_e, _url, _isInPlace, isMainFrame) => {
    if (isMainFrame) releaseAbandonedExport('reload/navigation');
  });
  mainWindow.webContents.on('destroyed', () => releaseAbandonedExport('webContents destroyed'));

  mainWindow.webContents.on('render-process-gone', async (_event, details) => {
    releaseAbandonedExport(`render process gone: ${details?.reason || 'unknown'}`);
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

    // Safety net: if the renderer never replies, force-close so the process doesn't linger as a
    // background zombie.
    //
    // ⚠️ THIS TIMER USED TO DESTROY THE WINDOW MID-SAVE.
    // The renderer answers `request-save-before-quit` by showing a modal; the author reads it, clicks
    // "Save & Quit", and only THEN does the export start. So the old flat 10-second clock had to cover
    // the reading, the clicking, AND compressing/streaming a multi-hundred-megabyte project. On a big
    // project it simply could not. At t=10s the window was destroyed with the write stream still open
    // on the author's save file — which is how a good .flourish became a headless stump.
    //
    // The watchdog only fires when nothing is actually happening — three states, three rules:
    //  1. A save is in flight and still writing chunks → WAIT (a stall of 30s+ still lets us exit).
    //  2. No save yet, but the renderer ANSWERS a ping → the user is reading the "Save & Quit?"
    //     modal. A human deciding is not a hang — NEVER destroy the window under them. (The first
    //     version of this fix only protected state 1: a user who took >10s to click still had the
    //     window destroyed with the modal open, discarding the very save they were about to make.)
    //  3. The renderer doesn't answer → it's genuinely dead/hung; force-close so the process doesn't
    //     linger as a background zombie — the one job this watchdog was born to do.
    // ⚠️ THIS IS NOT A COUNTDOWN. It never closes a working app, no matter how long the user sits
    // with the "Save before quitting?" modal open — a human deciding is not a hang. Its ONE job is
    // the zombie case: close was intercepted to show the modal, so if the renderer is genuinely dead
    // (crashed/hung), nothing will ever answer it and the window would be unclosable short of Task
    // Manager. We detect "dead" by pinging the renderer, and require TWO consecutive failed pings so
    // a momentary main-thread stall can't be mistaken for death.
    const IDLE_LIMIT = 10_000;
    const STALLED_SAVE_LIMIT = 30_000;
    const PING_TIMEOUT = 3_000;
    let failedPings = 0;
    const forceClose = (why) => {
      console.warn(`${why} – force-closing window.`);
      mainWindow.forceClose = true;
      mainWindow.destroy();
    };
    const tick = () => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.forceClose) return;
      if (isExportInProgress()) {
        const quiet = Date.now() - exportLastActivity;
        if (quiet < STALLED_SAVE_LIMIT) {
          setTimeout(tick, 2_000);      // still saving — let it finish, check back shortly
          return;
        }
        forceClose('Save appears stalled');
        return;
      }
      // No save running: is anyone home?
      Promise.race([
        mainWindow.webContents.executeJavaScript('1', true),
        new Promise((_r, reject) => setTimeout(() => reject(new Error('ping timeout')), PING_TIMEOUT)),
      ]).then(
        () => { failedPings = 0; setTimeout(tick, 5_000); },   // alive — user is deciding; wait as long as they like
        () => {
          failedPings++;
          if (failedPings < 2) { setTimeout(tick, 2_000); return; }   // one blip ≠ dead — ask again
          if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.forceClose) forceClose('Renderer unresponsive during close (2 failed pings)');
        },
      );
    };
    setTimeout(tick, IDLE_LIMIT);
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
  try { fs.mkdirSync(projectAssetsRoot, { recursive: true }); } catch {}

  // Serve managed project assets. net.fetch on a file:// URL handles streaming + Range requests
  // (so video/audio can seek). Paths are sanitized + confined to the project's asset folder.
  protocol.handle('flourish-asset', async (request) => {
    try {
      const u = new URL(request.url);
      const baseDir = projectAssetDir(u.hostname);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const filePath = path.normalize(path.join(baseDir, rel));
      if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers });
    } catch (err) {
      console.error('flourish-asset serve failed:', err);
      return new Response('Error', { status: 500 });
    }
  });

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
  logUpdate('debug', 'Removed window-all-closed listeners; calling autoUpdater.quitAndInstall(true, true)');

  // Let electron-updater gracefully close the app and run the installer.
  // isSilent = true → run the installer silently for the UPDATE. This matters
  //   because the installer is now an ASSISTED installer (package.json nsis
  //   oneClick:false, allowToChangeInstallationDirectory:true) so first-time
  //   users can pick their drive/folder. If we passed isSilent=false here the
  //   FULL wizard (welcome + directory page + …) would appear on every
  //   auto-update — users could even accidentally relocate the app. Silent
  //   update mode reinstalls in place at the existing $INSTDIR recorded in the
  //   registry (no prompts, no directory page) and electron-updater's own NSIS
  //   template waits for this app's PID to exit before overwriting files, so
  //   the file-lock timing the old progress-bar hack guarded against is handled.
  // isForceRunAfter = true → automatically restart the app after installing.
  try {
    autoUpdater.quitAndInstall(true, true);
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
  // Reap any in-flight build/toolchain processes (and their children) so they don't
  // orphan and keep running after Flourish closes. Async kill is enough here.
  killAllBuilds(false);
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

  // Safety net: synchronously reap any still-tracked build processes before we
  // force-exit, so the force-exit below can't strand an orphaned build tree.
  killAllBuilds(true);

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

// Cancel an in-progress build: kill the build process tree(s) so nothing is left running.
// (The renderer's build promise will then reject with a non-zero exit, which the UI treats
// as a cancellation.)
ipcMain.on('cancel-build', () => {
  killAllBuilds(false);
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

// ── Android build: toolchain status + first-run install ──────────────────────
// The Android toolchain is downloaded once into userData (not bundled). The UI
// calls 'android-toolchain-status' to decide whether to show the download gate,
// then 'android-toolchain-install' (after the user confirms) to fetch it.
ipcMain.handle('android-toolchain-status', () => {
  try {
    return {
      ready: androidToolchain.isAndroidToolchainReady(androidToolchainRoot),
      estimate: androidToolchain.getDownloadEstimate(),
      root: androidToolchainRoot,
    };
  } catch (error) {
    return { ready: false, error: error && error.message ? error.message : String(error) };
  }
});

let androidToolchainInstalling = false;
ipcMain.handle('android-toolchain-install', async (event) => {
  if (androidToolchainInstalling) {
    return { success: false, error: 'A toolchain download is already in progress.' };
  }
  androidToolchainInstalling = true;
  const send = (data) => { try { event.sender.send('android-toolchain-progress', data); } catch {} };
  try {
    if (androidToolchain.isAndroidToolchainReady(androidToolchainRoot)) {
      send({ phase: 'done', pct: 100, message: 'Android toolchain already installed.' });
      return { success: true, alreadyInstalled: true };
    }
    await androidToolchain.installToolchain(androidToolchainRoot, send);
    return { success: true };
  } catch (error) {
    console.error('[android] toolchain install failed:', error);
    send({ phase: 'error', pct: 0, message: (error && error.message) || String(error) });
    return { success: false, error: error && error.message ? error.message : String(error) };
  } finally {
    androidToolchainInstalling = false;
  }
});

/**
 * Ensure a persistent app-signing keystore exists, generating one with keytool on
 * first use. The same keystore is reused for every rebuild so that updated APKs
 * keep a stable signature (Android requires this to upgrade an installed app).
 * Returns { storeFile, storePassword, keyAlias, keyPassword }.
 */
async function ensureAndroidKeystore(p, javaHome) {
  const metaPath = path.join(p.keystoreDir, 'keystore.json');
  if (fs.existsSync(p.keystorePath) && fs.existsSync(metaPath)) {
    try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
  }
  fs.mkdirSync(p.keystoreDir, { recursive: true });
  const keytool = androidToolchain.binIn(javaHome, 'keytool');
  if (!keytool || !fs.existsSync(keytool)) {
    throw new Error('keytool was not found in the bundled JDK. Try reinstalling the Android tools.');
  }
  const password = (crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '') + 'Fv1').slice(0, 24);
  const alias = 'flourish';
  // Remove any half-written keystore from a previous failed attempt.
  try { if (fs.existsSync(p.keystorePath)) fs.rmSync(p.keystorePath, { force: true }); } catch {}
  await spawnWithProgress(
    keytool,
    [
      '-genkeypair', '-v',
      '-keystore', p.keystorePath,
      '-storetype', 'PKCS12',
      '-storepass', password,
      '-keypass', password,
      '-alias', alias,
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-dname', 'CN=Flourish VNE, OU=Games, O=Flourish, L=, ST=, C=US',
    ],
    { env: { ...process.env, JAVA_HOME: javaHome } },
    (line) => console.log('[keytool]', line)
  );
  const meta = { storeFile: p.keystorePath, storePassword: password, keyAlias: alias, keyPassword: password };
  fs.writeFileSync(metaPath, JSON.stringify(meta));
  return meta;
}

// ── Android build: compile the WebView project into a signed, installable APK ──
ipcMain.handle('build-android-game', async (event, { androidFiles, options }) => {
  const send = (step, progress, message) => {
    try { event.sender.send('android-build-progress', { step, progress, message }); } catch {}
  };
  let tempDir;
  try {
    if (!androidToolchain.isAndroidToolchainReady(androidToolchainRoot)) {
      throw new Error('The Android build tools are not installed yet. Run the one-time setup first.');
    }
    const p = androidToolchain.getAndroidPaths(androidToolchainRoot);
    const javaHome = androidToolchain.resolveJavaHome(p.jdkDir);
    if (!javaHome) throw new Error('The bundled Java runtime is missing. Try reinstalling the Android tools.');

    // 1. Write the generated project into a temp build dir.
    tempDir = path.join(os.tmpdir(), 'flourish-android-build-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    send('generate', 50, 'Writing project files...');
    for (const [filename, content] of Object.entries(androidFiles || {})) {
      writeGameFile(path.join(tempDir, filename), content);
    }

    // 2. Ensure the persistent signing key.
    send('generate', 55, 'Preparing signing key...');
    const ks = await ensureAndroidKeystore(p, javaHome);

    // 3. Compile with the downloaded Gradle (caches were seeded → effectively offline).
    send('build', 60, 'Compiling APK (this can take a few minutes)...');
    const env = {
      ...process.env,
      JAVA_HOME: javaHome,
      ANDROID_SDK_ROOT: p.sdkRoot,
      ANDROID_HOME: p.sdkRoot,
      GRADLE_USER_HOME: p.gradleHome,
      PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`,
    };
    // AAB (Android App Bundle) targets the Google Play Store; APK is for direct
    // install / sideloading. Same signing config covers both.
    const isAab = options && options.format === 'aab';
    const gradleTask = isAab ? 'bundleRelease' : 'assembleRelease';
    const artifactLabel = isAab ? 'AAB' : 'APK';
    let pct = 60;
    await spawnWithProgress(
      p.gradleBin,
      [
        gradleTask,
        '--no-daemon',
        '--console=plain',
        `--gradle-user-home=${p.gradleHome}`,
        `-PflourishStoreFile=${ks.storeFile}`,
        `-PflourishStorePassword=${ks.storePassword}`,
        `-PflourishKeyAlias=${ks.keyAlias}`,
        `-PflourishKeyPassword=${ks.keyPassword}`,
      ],
      { cwd: tempDir, env },
      (line) => {
        console.log('[gradle]', line);
        const lower = line.toLowerCase();
        if (lower.includes('> task')) {
          pct = Math.min(pct + 0.4, 90);
          send('build', Math.round(pct), `Compiling ${artifactLabel}...`);
        } else if (lower.includes('build successful')) {
          send('build', 92, 'Finalizing...');
        }
      }
    );

    // 4. Locate the signed artifact (APK or AAB).
    send('save', 94, `Locating ${artifactLabel}...`);
    const outExt = isAab ? '.aab' : '.apk';
    const outDir = isAab
      ? path.join(tempDir, 'app', 'build', 'outputs', 'bundle', 'release')
      : path.join(tempDir, 'app', 'build', 'outputs', 'apk', 'release');
    const outName = fs.existsSync(outDir) ? fs.readdirSync(outDir).find((f) => f.toLowerCase().endsWith(outExt)) : null;
    if (!outName) {
      throw new Error(`The build finished but produced no ${artifactLabel}.`);
    }

    // 5. Drop it into the user's Android builds folder.
    send('save', 97, 'Saving to your Android builds folder...');
    fs.mkdirSync(defaultBuildsAndroidDir, { recursive: true });
    const safeName = ((options && options.appName) || 'game').replace(/[^a-z0-9 _-]/gi, '').trim() || 'game';
    const destPath = path.join(defaultBuildsAndroidDir, safeName + outExt);
    if (fs.existsSync(destPath)) fs.rmSync(destPath, { force: true });
    fs.copyFileSync(path.join(outDir, outName), destPath);

    // 5b. For AAB (Play Store) builds, also export the publishing guide and a copy
    // of the signing key the user MUST keep — without it they can't ship updates.
    if (isAab) {
      try {
        if (options.playStoreGuideText) {
          fs.writeFileSync(path.join(defaultBuildsAndroidDir, safeName + '_PLAY_STORE_GUIDE.txt'), String(options.playStoreGuideText), 'utf8');
        }
        // Copy the upload keystore beside the bundle so the user owns/backs it up.
        const keyCopyName = safeName + '_upload-key.keystore';
        const keyCopyPath = path.join(defaultBuildsAndroidDir, keyCopyName);
        try { fs.copyFileSync(ks.storeFile, keyCopyPath); } catch (e) { console.warn('[android] keystore copy failed:', e && e.message); }
        if (options.signingReadmeTemplate) {
          const readme = String(options.signingReadmeTemplate)
            .replace(/\{\{keyFile\}\}/g, keyCopyName)
            .replace(/\{\{alias\}\}/g, ks.keyAlias)
            .replace(/\{\{password\}\}/g, ks.storePassword);
          fs.writeFileSync(path.join(defaultBuildsAndroidDir, safeName + '_SIGNING_KEY_BACKUP.txt'), readme, 'utf8');
        }
      } catch (e) {
        console.warn('[android] failed to write AAB docs:', e && e.message);
      }
    }

    send('complete', 100, 'Build complete!');
    try { shell.showItemInFolder(destPath); } catch {}
    return { success: true, path: destPath, folder: defaultBuildsAndroidDir, format: isAab ? 'aab' : 'apk' };
  } catch (error) {
    console.error('[android] build failed:', error);
    return { success: false, error: error && error.message ? error.message : String(error), details: error && error.stack };
  } finally {
    if (tempDir) {
      try { fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 }); } catch (e) {
        console.warn('[android] temp cleanup failed:', e && e.message);
      }
    }
  }
});

// Multi-Window Management
const managerWindows = new Map();
// Most recent editor selection context (from whichever editor window was last active). Used to seed
// a newly-opened panel window so it shows the last-active editor's selection.
let lastEditorContext = null;

// Which focused PANEL windows are open? Full editors hide their matching INLINE panel while one is,
// so the floating panel can be docked beside the editor without a duplicate.
function isManagerOpen(type) {
  return managerWindows.has(type) && !managerWindows.get(type).isDestroyed();
}
function panelWindowState() {
  return {
    inspector: isManagerOpen('inspector'),
    canvas: isManagerOpen('canvas'),
    ingameCanvas: isManagerOpen('ingame-canvas'),
    ingameProperties: isManagerOpen('ingame-properties'),
  };
}
function broadcastPanelState() {
  const panels = panelWindowState();
  if (mainWindow && !mainWindow.isDestroyed()) { try { mainWindow.webContents.send('panel-window-state', panels); } catch {} }
  managerWindows.forEach(win => { if (!win.isDestroyed()) { try { win.webContents.send('panel-window-state', panels); } catch {} } });
}
// PANEL window types — opening/closing one tells editors to hide/show their matching inline panel.
const PANEL_WINDOW_TYPES = new Set(['inspector', 'canvas', 'ingame-canvas', 'ingame-properties']);
// Most recent In-Game UI shared view-state (selected surface + preview sub-states), for seeding new
// In-Game panel windows so they open agreeing with the main editor.
let lastInGameState = null;

ipcMain.on('open-manager-window', (event, config) => {
  const { type, width, height, title, minWidth, minHeight } = config;
  
  // If window already exists, focus it
  if (managerWindows.has(type) && !managerWindows.get(type).isDestroyed()) {
    managerWindows.get(type).focus();
    return;
  }
  
  // Create new manager window
  const managerWindow = new BrowserWindow({
    width,
    height,
    minWidth: minWidth || 800,
    minHeight: minHeight || 600,
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
      mainWindow.webContents.executeJavaScript('({ project: window.__FLOURISH_PROJECT__, context: window.__FLOURISH_EDITOR_CONTEXT__ })')
        .then(data => {
          const projectData = data && data.project;
          // Prefer the cached last-active context (could be from a popped tab); fall back to the main
          // window's own global. Carry it INSIDE the window-type message (not a separate event): the
          // popped window's editor-context listener isn't mounted yet at this point, so a standalone
          // event would be missed. window-type IS handled at the app root, so it always lands — and it
          // seeds the popped window's __FLOURISH_EDITOR_CONTEXT__ before the inspector mounts.
          const contextData = lastEditorContext || (data && data.context);
          // Seed which panel windows are already open so a newly-opened editor hides its matching inline
          // panel from the start (avoids a flash of the duplicate panel).
          managerWindow.webContents.send('window-type', { type, project: projectData, context: contextData, panelsOpen: panelWindowState(), inGameState: lastInGameState });
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
    // If a panel window closed, tell editors to bring their matching inline panel back.
    if (PANEL_WINDOW_TYPES.has(type)) broadcastPanelState();
  });

  managerWindows.set(type, managerWindow);
  // Tell editors a panel window now exists (so they hide their matching inline panel).
  if (PANEL_WINDOW_TYPES.has(type)) broadcastPanelState();
});

ipcMain.on('focus-main-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Only restore when actually minimized — calling restore() on a MAXIMIZED window un-maximizes it
    // (which is what made closing a popped-out window pull the main app out of maximize).
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.on('focus-manager-window', (event, type) => {
  if (managerWindows.has(type) && !managerWindows.get(type).isDestroyed()) {
    const win = managerWindows.get(type);
    if (win.isMinimized()) win.restore(); // don't un-maximize a maximized window
    win.show();
    win.focus();
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

// Sync the editor "context" (active scene/tab + current selection — just ids/indices, tiny) across
// windows. This is what lets a popped-out Properties Inspector follow what's selected in the active
// editor. Separate from project state because selection is transient UI state, not saved data.
// Cache the most recent context so a freshly-opened panel window seeds from the LAST-ACTIVE editor
// (which may be a popped-out tab), not always the main window.
// Relay In-Game UI shared view-state across its popped-out parts (canvas/properties) + the main editor.
ipcMain.on('sync-ingame-state', (event, state) => {
  lastInGameState = state;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== event.sender) {
    mainWindow.webContents.send('ingame-state-update', state);
  }
  managerWindows.forEach(win => {
    if (!win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send('ingame-state-update', state);
    }
  });
});

ipcMain.on('sync-editor-context', (event, context) => {
  lastEditorContext = context;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== event.sender) {
    mainWindow.webContents.send('editor-context-update', context);
  }
  managerWindows.forEach(win => {
    if (!win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send('editor-context-update', context);
    }
  });
});

/**
 * Write a file WITHOUT ever endangering what's already there.
 *
 * `fs.writeFileSync(target, data)` opens with 'w' — it truncates the existing file to zero bytes and
 * THEN writes. A crash, power cut, or full disk in that window leaves the user a stump where their
 * file was. That is precisely the failure that destroyed a real user's project via the streaming
 * path; these one-shot paths carried the identical disease with a smaller window.
 *
 * So: write a sidecar next to the destination (same volume — a cross-device rename is a copy, not
 * atomic), fsync it, park the old file as .bak, rename the new one into place, drop the .bak.
 * Every failure branch leaves the original either untouched or restored.
 */
function writeFileAtomicSync(target, buffer) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.saving-${process.pid}-${Date.now()}.part`;
  try {
    const fd = fs.openSync(temp, 'w');
    try {
      fs.writeSync(fd, buffer);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    const backup = `${target}.bak`;
    let backedUp = false;
    if (fs.existsSync(target)) {
      try { fs.rmSync(backup, { force: true }); } catch {}
      fs.renameSync(target, backup);
      backedUp = true;
    }
    try {
      fs.renameSync(temp, target);
    } catch (swapError) {
      if (backedUp) { try { fs.renameSync(backup, target); } catch {} }
      throw swapError;
    }
    if (backedUp) { try { fs.rmSync(backup, { force: true }); } catch {} }
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch {}
    throw error;
  }
}

ipcMain.handle('save-project-export', async (event, { data, filename, filePath }) => {
  try {
    // Silent re-save: when the renderer passes the project's existing file path (name unchanged),
    // write straight to it — no dialog, no overwrite prompt. Any failure falls through to the dialog.
    //
    // GUARD: only overwrite silently if the file is STILL THERE. If the user moved or renamed it in
    // Explorer, the recent-projects entry still points at the old spot; recreating the file there
    // would silently fork their project into two diverging copies. Fall through to the dialog instead.
    if (filePath && fs.existsSync(filePath)) {
      try {
        writeFileAtomicSync(filePath, Buffer.from(data));
        return { success: true, filePath };
      } catch (silentErr) {
        console.warn('Silent project save failed, falling back to dialog:', silentErr);
      }
    }
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

    writeFileAtomicSync(result.filePath, Buffer.from(data));

    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Failed to save project export:', error);
    return { success: false, error: error.message };
  }
});

// ── Streaming project export (chunked write to disk) ──────────────────────────────────────────
// Lets very large projects export without ever holding the whole .flourish archive in one buffer
// (which would hit V8's ~2GB ArrayBuffer limit). The renderer opens a stream, sends chunks, finalizes.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE RULE THIS CODE EXISTS TO ENFORCE: **NEVER TOUCH THE USER'S SAVE UNTIL THE NEW ONE IS WHOLE.**
//
// The original version of this streamed STRAIGHT INTO the user's existing .flourish
// (`fs.createWriteStream(target)`, which opens with 'w' and truncates it to zero bytes on the spot).
// From that instant until the very last byte landed, the author had NO valid save — and a zip whose
// central directory hasn't been written yet is unopenable. Anything that interrupted the run (a
// force-close on quit, a second Save click, an error mid-compression) left the author's newest save
// as a headless stump: "Corrupt Zip: can't find end of central directory". That is exactly the bug a
// user reported, and it destroyed real work.
//
// So now: we stream to a SIDECAR temp file, fsync it, and only then swap it into place with an
// atomic rename. The real file is either the old good one or the new good one — never a half one.
// On any failure we delete the temp and leave the original completely untouched.
// ═════════════════════════════════════════════════════════════════════════════════════════════
let exportStream = null;
let exportStreamPath = null;      // the FINAL destination
let exportTempPath = null;        // what we are actually writing to
/** Bumped on every chunk, so the quit watchdog can tell "still saving" from "hung". */
let exportLastActivity = 0;

/** Is a project save in flight? The quit path must not kill the app while this is true. */
function isExportInProgress() {
  return !!exportStream;
}

function clearExportState() {
  exportStream = null;
  exportStreamPath = null;
  exportTempPath = null;
  exportLastActivity = 0;
}

ipcMain.handle('export-stream-start', async (event, { filename, filePath }) => {
  try {
    // RE-ENTRANCY GUARD. The old code destroyed the in-flight stream and stole its globals, so a
    // second Save (a double-click, or a manual save racing the save-on-quit) would corrupt BOTH
    // files: leftover chunks from run #1 got written into run #2's file, and run #1's abort handler
    // would happily unlink run #2's output. Refuse instead.
    if (isExportInProgress()) {
      return { success: false, error: 'A save is already in progress. Please wait for it to finish.' };
    }

    let target = filePath;
    // The SILENT overwrite path (no dialog) is only honest while the file it claims to be updating
    // is actually there. Two guards:
    //  • If it's missing but its `.bak` survives (we died between the two renames of a previous
    //    save), restore the .bak — that IS the user's file.
    //  • If it's simply gone (the user moved/renamed it in Explorer), do NOT quietly recreate it at
    //    the stale path — that forks their project into two diverging copies. Ask instead.
    if (target && !fs.existsSync(target)) {
      const bak = `${target}.bak`;
      if (fs.existsSync(bak)) {
        console.warn(`Save target missing but backup found — restoring ${bak}`);
        try { fs.renameSync(bak, target); } catch { target = null; }
      } else {
        target = null;   // fall through to the save dialog
      }
    }
    if (target) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
    } else {
      const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
      const defaultName = String(filename || 'project').replace(/\.(zip|flourish)$/i, '') + '.flourish';
      const result = await dialog.showSaveDialog(win, {
        title: 'Save Project',
        defaultPath: filePath || path.join(defaultProjectsDir, defaultName),
        filters: [
          { name: 'Flourish Project', extensions: ['flourish'] },
          { name: 'Zip Archive (legacy)', extensions: ['zip'] },
        ],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      target = result.filePath;
    }

    // Sidecar next to the destination (NOT in the OS temp dir) so the final rename stays on the same
    // filesystem — a cross-device rename is a copy, which is neither atomic nor fast.
    const temp = `${target}.saving-${process.pid}-${Date.now()}.part`;
    exportStream = fs.createWriteStream(temp);
    exportStreamPath = target;
    exportTempPath = temp;
    exportLastActivity = Date.now();
    return { success: true, filePath: target };
  } catch (error) {
    console.error('export-stream-start failed:', error);
    clearExportState();
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-stream-chunk', async (_event, chunk) => {
  try {
    if (!exportStream) return { success: false, error: 'No export in progress.' };
    const buf = Buffer.from(chunk);
    await new Promise((resolve, reject) => {
      exportStream.write(buf, (err) => (err ? reject(err) : resolve()));
    });
    exportLastActivity = Date.now();
    return { success: true };
  } catch (error) {
    console.error('export-stream-chunk failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-stream-end', async () => {
  const target = exportStreamPath;
  const temp = exportTempPath;
  const stream = exportStream;
  try {
    if (!stream || !temp || !target) return { success: false, error: 'No export in progress.' };

    // 1. Flush and close the temp file. Only now is the archive complete — central directory and all.
    await new Promise((resolve, reject) => {
      stream.end((err) => (err ? reject(err) : resolve()));
    });
    // Force it to the platter before we swap. Without this a power loss right after the rename could
    // leave the *new* name pointing at unwritten data.
    try {
      const fd = fs.openSync(temp, 'r+');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    } catch { /* fsync is best-effort; a failure here is not worth losing the save over */ }

    // 2. Swap it in. Keep the old file until the new one is safely in place, then drop it.
    const backup = `${target}.bak`;
    let backedUp = false;
    if (fs.existsSync(target)) {
      try { fs.rmSync(backup, { force: true }); } catch {}
      fs.renameSync(target, backup);       // old save → .bak
      backedUp = true;
    }
    try {
      fs.renameSync(temp, target);         // new save → the real name (atomic on the same volume)
    } catch (swapError) {
      // Put the original back. The author's save survives even a failed save.
      if (backedUp) { try { fs.renameSync(backup, target); } catch {} }
      throw swapError;
    }
    if (backedUp) { try { fs.rmSync(backup, { force: true }); } catch {} }

    clearExportState();
    return { success: true, filePath: target };
  } catch (error) {
    console.error('export-stream-end failed:', error);
    try { if (temp) fs.rmSync(temp, { force: true }); } catch {}
    clearExportState();
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-stream-abort', async () => {
  try {
    if (exportStream) {
      const temp = exportTempPath;
      try { exportStream.destroy(); } catch {}
      clearExportState();
      // Delete ONLY the half-written temp. The old code unlinked the DESTINATION here, which meant a
      // failed save deleted the author's previous good file outright.
      try { if (temp) fs.rmSync(temp, { force: true }); } catch {}
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ── Managed project asset library (file-backed media) ─────────────────────────────────────────
// Write a single asset file and return its project-relative path (assets/<type>/<id>.<ext>).
ipcMain.handle('write-project-asset', async (_event, { projectId, type, id, ext, data }) => {
  try {
    const rel = path.posix.join('assets', safeSeg(type), `${safeSeg(id)}.${safeSeg(ext || 'bin')}`);
    const filePath = path.join(projectAssetDir(projectId), rel);
    // Atomic: an asset id can be re-written (character base image replaced) — a crash mid-write must
    // not leave the author's ONLY copy of that art half-written on disk.
    writeFileAtomicSync(filePath, Buffer.from(data));
    return { success: true, relPath: rel };
  } catch (error) {
    console.error('write-project-asset failed:', error);
    return { success: false, error: error.message };
  }
});

// Read an asset file back as bytes (used by export to copy files into the .flourish zip).
ipcMain.handle('read-project-asset', async (_event, { projectId, relPath }) => {
  try {
    const baseDir = projectAssetDir(projectId);
    const filePath = path.normalize(path.join(baseDir, relPath));
    if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) return { success: false, error: 'Forbidden' };
    if (!fs.existsSync(filePath)) return { success: false, error: 'Not found' };
    return { success: true, data: fs.readFileSync(filePath) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-project-asset', async (_event, { projectId, relPath }) => {
  try {
    const baseDir = projectAssetDir(projectId);
    const filePath = path.normalize(path.join(baseDir, relPath));
    if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) return { success: false, error: 'Forbidden' };
    try { fs.unlinkSync(filePath); } catch {}
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-project-asset-folder', async (_event, { projectId }) => {
  try {
    fs.rmSync(projectAssetDir(projectId), { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('copy-project-asset-folder', async (_event, { fromProjectId, toProjectId }) => {
  try {
    const src = projectAssetDir(fromProjectId);
    if (fs.existsSync(src)) fs.cpSync(src, projectAssetDir(toProjectId), { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Total bytes + per-file sizes of a project's managed asset folder (for size display).
ipcMain.handle('get-project-asset-sizes', async (_event, { projectId }) => {
  try {
    const baseDir = projectAssetDir(projectId);
    const sizes = {};
    let total = 0;
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else {
          try { const sz = fs.statSync(full).size; total += sz; sizes[path.relative(baseDir, full).split(path.sep).join('/')] = sz; } catch {}
        }
      }
    };
    walk(baseDir);
    return { success: true, total, sizes };
  } catch (error) {
    return { success: false, error: error.message, total: 0, sizes: {} };
  }
});

// Relative paths of every file currently in a project's asset folder (for orphan cleanup / export).
ipcMain.handle('list-project-assets', async (_event, { projectId }) => {
  try {
    const baseDir = projectAssetDir(projectId);
    const out = [];
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else out.push(path.relative(baseDir, full).split(path.sep).join('/'));
      }
    };
    walk(baseDir);
    return { success: true, files: out };
  } catch (error) {
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
    buildsAndroid: defaultBuildsAndroidDir,
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

    // Atomic — this handler is pointed at EXISTING files (Game Builder re-saves); a plain
    // writeFileSync would truncate the user's file before writing. See writeFileAtomicSync.
    writeFileAtomicSync(targetPath, Buffer.from(data));

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
      // CRASH RECOVERY: the atomic-save dance parks the old file as `<name>.bak` before renaming the
      // new one into place. If the process died exactly between those two renames, the real name is
      // gone but the .bak holds the user's last good save. Nothing else ever restores it — a
      // non-technical user just sees their project "vanished". So restore it here, at the moment
      // they try to open it.
      const bak = `${filePath}.bak`;
      if (fs.existsSync(bak)) {
        console.warn(`Project file missing but backup found — restoring ${bak}`);
        fs.renameSync(bak, filePath);
      } else {
        return { success: false, error: 'File not found: ' + filePath };
      }
    }
    // Housekeeping: clear out stale sidecars from saves that died mid-write (>1h old, so we can
    // never race a save that's genuinely running — those are refreshed every chunk).
    try {
      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith(`${base}.saving-`) || !f.endsWith('.part')) continue;
        const full = path.join(dir, f);
        try {
          if (Date.now() - fs.statSync(full).mtimeMs > 3600_000) fs.rmSync(full, { force: true });
        } catch {}
      }
    } catch {}
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