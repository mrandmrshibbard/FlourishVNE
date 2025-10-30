const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;
let childWindows = {}; // Track open child windows

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
      preload: path.join(__dirname, 'preload.cjs'),
    },
    backgroundColor: '#1a102c',
    title: 'Flourish Visual Novel Engine',
    show: false, // Don't show until ready
    frame: true, // Show native window frame for professional look
    titleBarStyle: 'default', // Use default title bar
  });

  // Load the built app from dist folder
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // Show window when ready to avoid flicker
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize(); // Open maximized
    mainWindow.show();
  });

  // Function to create or focus child window
  const openChildWindow = (windowKey, title, width = 1000, height = 700, options = {}) => {
    // If window already exists, focus it
    if (childWindows[windowKey] && !childWindows[windowKey].isDestroyed()) {
      childWindows[windowKey].focus();
      return;
    }

    // Default options
    const {
      resizable = true,
      minimizable = true,
      maximizable = true,
      minWidth = 800,
      minHeight = 600
    } = options;

    // Create new child window
    const childWindow = new BrowserWindow({
      width,
      height,
      minWidth,
      minHeight,
      resizable,
      minimizable,
      maximizable,
      parent: mainWindow,
      modal: false,
      autoHideMenuBar: true, // Hide menu bar for child windows
      frame: true, // Show native window frame
      titleBarStyle: 'default',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false,
        preload: path.join(__dirname, 'preload.cjs'),
      },
      backgroundColor: '#1a102c',
      title: title,
      show: false,
    });

    // Load with query parameter to indicate child window and tab
    childWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { childWindow: 'true', tab: windowKey }
    });
    
    // Show when ready
    childWindow.once('ready-to-show', () => {
      childWindow.show();
      // Send message after showing to switch tab
      childWindow.webContents.send('switch-tab', windowKey);
    });

    childWindow.on('closed', () => {
      delete childWindows[windowKey];
    });

    childWindows[windowKey] = childWindow;
  };

  // IPC handler for opening child windows from renderer
  ipcMain.on('open-child-window', (event, windowKey, title, width, height, options) => {
    openChildWindow(windowKey, title, width, height, options);
  });

  // IPC handler for building desktop games
  ipcMain.handle('build-desktop-game', async (event, { projectZipBuffer, gameName }) => {
    const fs = require('fs');
    const { exec } = require('child_process');
    const os = require('os');
    
    try {
      // Create temp directory for the build
      const tempDir = path.join(os.tmpdir(), 'flourish-build-' + Date.now());
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Write the project ZIP to temp location
      const zipPath = path.join(tempDir, 'project.zip');
      fs.writeFileSync(zipPath, Buffer.from(projectZipBuffer));
      
      // Get the app's root directory (where scripts are)
      const appRoot = app.isPackaged 
        ? path.join(process.resourcesPath, 'app.asar.unpacked')
        : path.join(__dirname, '..');
      
      const scriptPath = path.join(appRoot, 'scripts', 'build-desktop-game.js');
      const outputDir = path.join(app.getPath('documents'), 'Flourish Games');
      
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      return new Promise((resolve, reject) => {
        // Build command
        const command = `node "${scriptPath}" --input "${zipPath}" --name "${gameName}" --output "${outputDir}"`;
        
        console.log('Running build command:', command);
        
        const buildProcess = exec(command, { 
          maxBuffer: 50 * 1024 * 1024, // 50MB buffer
          cwd: appRoot
        });
        
        let output = '';
        let errorOutput = '';
        
        buildProcess.stdout.on('data', (data) => {
          output += data.toString();
          console.log(data.toString());
          // Send progress updates to renderer
          event.sender.send('build-progress', { message: data.toString() });
        });
        
        buildProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
          console.error(data.toString());
        });
        
        buildProcess.on('close', (code) => {
          // Cleanup temp directory
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (e) {
            console.warn('Failed to cleanup temp directory:', e);
          }
          
          if (code === 0) {
            const gameExePath = path.join(outputDir, gameName, `${gameName}.exe`);
            resolve({ 
              success: true, 
              output,
              exePath: gameExePath,
              outputDir: path.join(outputDir, gameName)
            });
          } else {
            reject(new Error(`Build failed with code ${code}\n${errorOutput || output}`));
          }
        });
        
        buildProcess.on('error', (error) => {
          reject(error);
        });
      });
      
    } catch (error) {
      console.error('Desktop game build error:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // IPC handler for opening folders in system file explorer
  ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
      await shell.openPath(folderPath);
      return { success: true };
    } catch (error) {
      console.error('Error opening folder:', error);
      return { success: false, error: error.message };
    }
  });

  // Function to create/update menu based on Project Hub visibility
  const updateMenuState = (isProjectHubVisible) => {
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
            label: 'Export Project',
            accelerator: 'CmdOrCtrl+E',
            enabled: !isProjectHubVisible,
            click: () => {
              mainWindow.webContents.send('trigger-export');
            }
          },
          {
            label: 'Import Project',
            accelerator: 'CmdOrCtrl+I',
            click: () => {
              mainWindow.webContents.send('trigger-import');
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
        enabled: !isProjectHubVisible,
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
        enabled: !isProjectHubVisible,
        submenu: [
          { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
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
        label: 'Windows',
        enabled: !isProjectHubVisible,
        submenu: [
          {
            label: 'Characters',
            accelerator: 'CmdOrCtrl+1',
            click: () => openChildWindow('characters', 'Character Manager', 1400, 750, { 
              resizable: true, 
              minWidth: 1200, 
              minHeight: 650 
            })
          },
          {
            label: 'UI Screens',
            accelerator: 'CmdOrCtrl+2',
            click: () => openChildWindow('ui', 'UI Screen Manager', 1500, 900, { 
              resizable: true, 
              minWidth: 1200, 
              minHeight: 750 
            })
          },
          {
            label: 'Assets',
            accelerator: 'CmdOrCtrl+3',
            click: () => openChildWindow('assets', 'Asset Manager', 1300, 850, { 
              resizable: true, 
              minWidth: 1100, 
              minHeight: 700 
            })
          },
          {
            label: 'Variables',
            accelerator: 'CmdOrCtrl+4',
            click: () => openChildWindow('variables', 'Variable Manager', 1100, 750, { 
              resizable: true, 
              minWidth: 900, 
              minHeight: 650 
            })
          },
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+5',
            click: () => openChildWindow('settings', 'Project Settings', 900, 700, { 
              resizable: true, 
              minWidth: 800, 
              minHeight: 600 
            })
          }
        ]
      },
      {
        label: 'Project',
        enabled: !isProjectHubVisible,
        submenu: [
          {
            label: 'Play / Test',
            accelerator: 'F5',
            click: () => {
              mainWindow.webContents.send('trigger-play');
            }
          },
          {
            label: 'Build Game',
            accelerator: 'CmdOrCtrl+B',
            click: () => {
              mainWindow.webContents.send('trigger-build');
            }
          }
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
  };

  // Create initial menu (Project Hub visible by default)
  updateMenuState(true);

  // IPC handler for updating menu state based on Project Hub visibility
  ipcMain.on('update-menu-state', (event, { isProjectHubVisible }) => {
    updateMenuState(isProjectHubVisible);
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
