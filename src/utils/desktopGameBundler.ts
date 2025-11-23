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
export async function buildDesktopGame(
  project: VNProject,
  onProgress: (progress: BuildProgress) => void
): Promise<Blob> {
  
  // Check if running in Electron
  if (!isElectron) {
    throw new Error('Desktop builds are only available in the Electron version of Flourish VNE');
  }
  
  onProgress({ step: 'prepare', progress: 10, message: 'Preparing desktop build...' });
  
  // Import the web game bundler functions
  const { generateStandaloneHTML, collectAllAssets, dataURLToBlob } = await import('./gameBundler');
  
  onProgress({ step: 'generate', progress: 20, message: 'Generating game files...' });
  
  // Generate the same HTML as web build
  const htmlContent = generateStandaloneHTML(project);
  
  // Collect all assets
  onProgress({ step: 'assets', progress: 25, message: 'Collecting assets...' });
  
  const assetUrls = collectAllAssets(project);
  const gameFiles: Record<string, string | ArrayBuffer> = {
    'index.html': htmlContent
  };
  
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
  
  // Create package.json for Electron with electron-builder config
  const appName = project.title || 'Visual Novel Game';
  const packageName = appName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  gameFiles['package.json'] = JSON.stringify({
    name: packageName,
    productName: appName,
    version: '1.0.0',
    description: project.description || 'A visual novel game created with Flourish VNE',
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
      'electron': '^27.0.0',
      'electron-builder': '^24.13.3'
    },
    build: {
      appId: `com.${packageName}.app`,
      productName: appName,
      directories: {
        output: 'dist'
      },
      files: [
        'main.js',
        'preload.js',
        'index.html',
        'assets/**/*'
      ],
      win: {
        target: 'portable'
      },
      mac: {
        target: 'dir'
      },
      linux: {
        target: 'dir'
      }
    }
  }, null, 2);
  
  // Create Electron main.js - simple wrapper that uses file system for saves
  gameFiles['main.js'] = `const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const saveDir = path.join(app.getPath('userData'), 'saves');

if (!fs.existsSync(saveDir)) {
  fs.mkdirSync(saveDir, { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: '${project.title || 'Visual Novel'}'
  });

  mainWindow.loadFile('index.html');
  
  // Show window when ready to avoid flashing
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Simple save system - replaces localStorage with file system
ipcMain.handle('electron-save', async (event, key, value) => {
  try {
    const filePath = path.join(saveDir, \`\${key}.json\`);
    fs.writeFileSync(filePath, JSON.stringify(value));
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
