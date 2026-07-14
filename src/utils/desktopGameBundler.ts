/**
 * Desktop Game Bundler
 * Creates standalone Electron desktop executables with file-based save system
 * Uses electron-builder to create actual .exe/.app/.AppImage files
 */

import { VNProject } from '../types/project';
import { BuildProgress } from './gameBundler';

// Check if we're running in Electron
const isElectron = typeof window !== 'undefined' && 
                   typeof (window as any).electronAPI !== 'undefined';

/**
 * Builds desktop game by:
 * 1. Generating the same HTML game as web build
 * 2. Adding Electron wrapper for native file-based saves
 * 3. Running electron-builder to create executable
 */
export type DesktopFormat = 'standalone' | 'installer';

export async function buildDesktopGame(
  project: VNProject,
  onProgress: (progress: BuildProgress) => void,
  iconDataUrl?: string,
  desktopFormat: DesktopFormat = 'standalone'
): Promise<Blob> {
  
  // Check if running in Electron
  if (!isElectron) {
    throw new Error('Desktop builds are only available in the Electron version of Flourish Visual Novel Engine. Please use the desktop app to create a desktop build.');
  }
  
  onProgress({ step: 'prepare', progress: 10, message: 'Preparing desktop build...' });

  // Import the web game bundler functions
  const { generateStandaloneHTML, collectAllAssets, buildLeanProject, dataURLToBlob } = await import('./gameBundler');

  onProgress({ step: 'generate', progress: 20, message: 'Generating game files...' });

  // Stream file-backed media straight to disk files (no base64 re-inline) + resolve the rest.
  const { resolveProjectAssets, streamManagedAssets } = await import('./gameBundler');
  const gameFiles: Record<string, string | ArrayBuffer> = {};
  const streamedProject = await streamManagedAssets(project, (rel, bytes) => {
    gameFiles[rel] = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  });
  const resolvedProject = await resolveProjectAssets(streamedProject, onProgress);

  // Strip data URLs from the project before inlining into HTML. The same
  // assets get written to disk under `assets/` and loaded lazily by the
  // runtime — keeps the index.html lean so Electron can parse it quickly
  // on launch (and avoids the multi-hundred-megabyte HTML files that used
  // to make large built games fail to open).
  const assetUrls = collectAllAssets(resolvedProject);
  const leanProject = buildLeanProject(resolvedProject, assetUrls);

  // Generate the same HTML as web build, using the lean project
  const htmlContent = await generateStandaloneHTML(leanProject);

  // Asset writing follows below — the asset map was already built above
  onProgress({ step: 'assets', progress: 25, message: 'Collecting assets...' });
  gameFiles['index.html'] = htmlContent;
  
  // Convert assets to buffers
  let assetCount = 0;
  for (const [name, dataUrl] of Object.entries(assetUrls)) {
    assetCount++;
    const progressPercent = 25 + (assetCount / Object.keys(assetUrls).length) * 15;
    
    onProgress({
      step: 'assets',
      progress: progressPercent,
      message: `Processing asset ${assetCount}/${Object.keys(assetUrls).length}...`
    });

    if (dataUrl.startsWith('data:')) {
      const blob = dataURLToBlob(dataUrl);
      const arrayBuffer = await blob.arrayBuffer();
      gameFiles[`assets/${name}`] = arrayBuffer;
    }
  }
  
  onProgress({ step: 'generate', progress: 40, message: 'Creating Electron configuration...' });

  // ── Handle optional custom icon ──
  let hasCustomIcon = false;
  if (iconDataUrl && iconDataUrl.startsWith('data:')) {
    const { dataURLToBlob: iconToBlob } = await import('./gameBundler');
    const iconBlob = iconToBlob(iconDataUrl);
    const iconBuffer = await iconBlob.arrayBuffer();
    gameFiles['icon.png'] = iconBuffer;
    hasCustomIcon = true;
  }
  
  // Create package.json for Electron with electron-builder config
  const appName = project.title || 'Visual Novel Game';
  const packageName = appName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  const buildFiles = [
    'main.js',
    'preload.js',
    'index.html',
    'assets/**/*'
  ];
  if (hasCustomIcon) buildFiles.push('icon.png');

  const isInstaller = desktopFormat === 'installer';

  const winConfig: Record<string, unknown> = isInstaller
    ? {
        target: 'nsis',
        icon: hasCustomIcon ? 'icon.png' : undefined,
      }
    : {
        target: 'portable',
        icon: hasCustomIcon ? 'icon.png' : undefined,
      };

  // NSIS installer configuration
  const nsisConfig: Record<string, unknown> | undefined = isInstaller
    ? {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: appName,
        installerIcon: hasCustomIcon ? 'icon.png' : undefined,
        uninstallerIcon: hasCustomIcon ? 'icon.png' : undefined,
        installerHeaderIcon: hasCustomIcon ? 'icon.png' : undefined,
      }
    : undefined;

  const macConfig: Record<string, unknown> = { target: 'dir' };
  const linuxConfig: Record<string, unknown> = { target: 'dir' };
  if (hasCustomIcon) {
    macConfig.icon = 'icon.png';
    linuxConfig.icon = 'icon.png';
  }
  
  gameFiles['package.json'] = JSON.stringify({
    name: packageName,
    productName: appName,
    version: '1.0.0',
    description: appName,
    main: 'main.js',
    scripts: {
      start: 'electron .',
      build: 'electron-builder',
      'build:win': 'electron-builder --win',
      'build:mac': 'electron-builder --mac',
      'build:linux': 'electron-builder --linux'
    },
    author: project.author || 'Unknown',
    license: 'MIT',
    devDependencies: {
      'electron': '28.3.3',
      'electron-builder': '^24.13.3'
    },
    build: {
      appId: `com.${packageName}.app`,
      productName: appName,
      // Pin to the Electron version bundled with Flourish so the offline,
      // pre-seeded Electron binary cache is used (no network at build time).
      electronVersion: '28.3.3',
      // The game has no native dependencies — skip electron-builder's rebuild
      // step so it never tries to invoke npm/node-gyp.
      npmRebuild: false,
      directories: {
        output: 'dist'
      },
      files: buildFiles,
      win: winConfig,
      mac: macConfig,
      linux: linuxConfig,
      ...(nsisConfig ? { nsis: nsisConfig } : {})
    }
  }, null, 2);
  
  // Pre-compute the escaped title for safe inclusion in the generated JavaScript
  const safeTitle = (project.title || 'Visual Novel')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  // Create Electron main.js - simple wrapper that uses file system for saves
  // Includes a native splash window that shows instantly while the game HTML loads.
  // NOTE: We avoid nested template literals by using string concatenation for the
  // splash HTML to prevent escaping issues with the outer TypeScript template.
  gameFiles['main.js'] = `const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// GPU stability on Windows + prevent renderer from being suspended when
// the window loses focus (avoids black screen on alt-tab while maximised).
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('use-angle', 'd3d11');
}
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Single-instance lock prevents duplicate background processes
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let mainWindow;
let splashWindow;
const saveDir = path.join(app.getPath('userData'), 'saves');

if (!fs.existsSync(saveDir)) {
  fs.mkdirSync(saveDir, { recursive: true });
}

const GAME_TITLE = '${safeTitle}';
const ICON_PATH = path.join(__dirname, 'icon.png');
const HAS_ICON = fs.existsSync(ICON_PATH);

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    show: true,
    icon: HAS_ICON ? ICON_PATH : undefined,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  // Tiny inline HTML splash – renders in <50ms
  var splashHtml = '<!DOCTYPE html>'
    + '<html><head><style>'
    + 'body{margin:0;display:flex;flex-direction:column;align-items:center;'
    + 'justify-content:center;height:100vh;background:#000;'
    + 'font-family:Segoe UI,sans-serif;color:#fff;overflow:hidden}'
    + 'h1{font-size:1.8rem;margin:0 0 1.2rem;opacity:.95}'
    + '.bw{width:200px;height:4px;border-radius:4px;'
    + 'background:rgba(255,255,255,.15);overflow:hidden}'
    + '.b{height:100%;width:30%;border-radius:4px;'
    + 'background:linear-gradient(90deg,#ff00a5,#8a2be2);'
    + 'animation:l 1.2s ease-in-out infinite alternate}'
    + '@keyframes l{from{width:20%;margin-left:0}to{width:50%;margin-left:50%}}'
    + 'p{margin:.8rem 0 0;font-size:.8rem;opacity:.6}'
    + '</style></head><body>'
    + '<h1>' + GAME_TITLE + '</h1>'
    + '<div class="bw"><div class="b"></div></div>'
    + '<p>Loading...</p>'
    + '</body></html>';
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    show: false,
    icon: HAS_ICON ? ICON_PATH : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    },
    title: GAME_TITLE
  });

  // Remove the default menu bar for a clean game experience
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile('index.html');

  // Force repaint on focus to prevent stale black frames
  mainWindow.on('focus', () => {
    try { mainWindow.webContents.invalidate(); } catch {}
  });
  mainWindow.on('restore', () => {
    try { mainWindow.webContents.invalidate(); } catch {}
  });
  
  // Once the game HTML is painted, swap from splash to main window
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Hard fallback: if app.quit() or will-quit don't terminate us, force exit
    setTimeout(() => { process.exit(0); }, 2000);
  });
}

app.whenReady().then(() => {
  createSplashWindow();
  // Defer main window creation until splash is painted
  if (splashWindow) {
    splashWindow.webContents.once('did-finish-load', () => { createWindow(); });
    setTimeout(() => { if (!mainWindow) createWindow(); }, 3000);
  } else {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

// Ensure the process actually terminates
app.on('will-quit', () => {
  setTimeout(() => { process.exit(0); }, 1500);
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow();
    createWindow();
  }
});

// Simple save system - replaces localStorage with file system
ipcMain.handle('electron-save', async (event, key, value) => {
  try {
    const filePath = path.join(saveDir, \`\${key}.json\`);
    // Atomic: these are the PLAYER'S save games. A power cut mid-write must not corrupt the slot
    // file — write a sidecar, then rename it into place.
    const tmpPath = filePath + '.part';
    fs.writeFileSync(tmpPath, JSON.stringify(value));
    try { fs.renameSync(tmpPath, filePath); }
    catch (e) { try { fs.rmSync(tmpPath, { force: true }); } catch {} throw e; }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('electron-load', async (event, key) => {
  try {
    const filePath = path.join(saveDir, \`\${key}.json\`);
    if (!fs.existsSync(filePath)) return { success: false, data: null };
    const data = fs.readFileSync(filePath, 'utf8');
    return { success: true, data: JSON.parse(data) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('electron-delete', async (event, key) => {
  try {
    const filePath = path.join(saveDir, \`\${key}.json\`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('electron-list-keys', async () => {
  try {
    const files = fs.readdirSync(saveDir);
    const keys = files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    return { success: true, keys };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
`;
  
  onProgress({ step: 'generate', progress: 42, message: 'Creating preload script...' });
  
  // Create preload script
  const preloadJs = `const { contextBridge, ipcRenderer } = require('electron');

// Expose Electron storage API to replace localStorage
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  save: (key, value) => ipcRenderer.invoke('electron-save', key, value),
  load: (key) => ipcRenderer.invoke('electron-load', key),
  delete: (key) => ipcRenderer.invoke('electron-delete', key),
  listKeys: () => ipcRenderer.invoke('electron-list-keys')
});

// Override localStorage methods to use Electron file system
window.addEventListener('DOMContentLoaded', () => {
  const electronStorage = {
    getItem: async (key) => {
      const result = await window.electronAPI.load(key);
      return result.success ? result.data : null;
    },
    setItem: async (key, value) => {
      await window.electronAPI.save(key, value);
    },
    removeItem: async (key) => {
      await window.electronAPI.delete(key);
    },
    clear: async () => {
      const result = await window.electronAPI.listKeys();
      if (result.success) {
        for (const key of result.keys) {
          await window.electronAPI.delete(key);
        }
      }
    }
  };
  
  window.__electronStorage = electronStorage;
});
`;
  
  gameFiles['preload.js'] = preloadJs;
  
  onProgress({ step: 'finalize', progress: 45, message: 'Calling electron-builder...' });
  
  // Call the Electron main process to build the executable
  const electronAPI = (window as any).electronAPI;
  
  // Listen for build progress from main process
  if (electronAPI.onBuildProgress) {
    electronAPI.onBuildProgress((data: BuildProgress) => {
      onProgress(data);
    });
  }
  
  // Call the build function
  const result = await electronAPI.buildDesktopGame(project, gameFiles);
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to build desktop game');
  }
  
  onProgress({ step: 'complete', progress: 100, message: `Executable saved to: ${result.path}` });
  
  // Return an empty blob since the file was saved directly by Electron
  return new Blob([''], { type: 'text/plain' });
}
