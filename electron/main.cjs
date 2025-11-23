const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');

let mainWindow;
let isHubActive = false;

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
      webSecurity: false, // Allow loading external resources (CDNs)
      preload: path.join(__dirname, 'preload.cjs')
    },
    backgroundColor: '#1a102c',
    title: 'Flourish Visual Novel Engine',
    show: false, // Don't show until ready
  });

  // Load the built app from dist folder
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // Show window when ready to avoid flicker
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

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
            const { shell } = require('electron');
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
    // If we're already closing (confirmed), allow it
    if (mainWindow.forceClose) {
      return;
    }

    if (isHubActive) {
      return;
    }

    // Prevent the window from closing
    e.preventDefault();
    
    // Ask renderer to show save dialog
    mainWindow.webContents.send('request-save-before-quit');
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler: Build Desktop Game with Electron Builder
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

    // Install dependencies
    event.sender.send('build-progress', { 
      step: 'install', 
      progress: 30, 
      message: 'Installing dependencies...' 
    });
    
    try {
      execSync('npm install', { cwd: tempDir, stdio: 'ignore' });
    } catch (err) {
      throw new Error('Failed to install dependencies: ' + err.stderr?.toString() || err.message);
    }

    // Run electron-builder directly
    event.sender.send('build-progress', { 
      step: 'build', 
      progress: 60, 
      message: 'Building executable...' 
    });
    
    const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
    const platformFlag = `--${platform}`;
    
    // Use node_modules/.bin/electron-builder directly
    const builderPath = path.join(tempDir, 'node_modules', '.bin', 'electron-builder');
    const builderCmd = process.platform === 'win32' ? `"${builderPath}.cmd"` : builderPath;
    
    try {
      const output = execSync(`${builderCmd} ${platformFlag}`, { 
        cwd: tempDir, 
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' }
      });
      console.log('Build output:', output);
    } catch (err) {
      console.error('Build error:', err);
      const stderr = err.stderr || '';
      const stdout = err.stdout || '';
      const message = err.message || '';
      throw new Error('Electron builder failed: ' + (stderr || stdout || message));
    }

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
      if (isDirectory) {
        // Copy entire directory recursively
        fs.cpSync(fullExePath, savePath, { recursive: true });
      } else {
        // Copy single file
        fs.copyFileSync(fullExePath, savePath);
      }
      
      // Clean up temp directory with retry logic
      let retries = 3;
      while (retries > 0) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
          break;
        } catch (err) {
          retries--;
          if (retries === 0) {
            console.warn('Failed to clean up temp directory:', err);
            // Don't throw - build succeeded even if cleanup failed
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      return { success: true, path: savePath };
    }

    // Clean up temp directory
    try {
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
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    backgroundColor: '#1a102c',
    title,
    show: false,
    skipTaskbar: false
  });
  
  // Load the same app
  managerWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.forceClose = true;
    mainWindow.close();
  }
});

// Cancel quit
ipcMain.on('cancel-quit', () => {
  // Just do nothing, window won't close
  console.log('Quit cancelled by user');
});
