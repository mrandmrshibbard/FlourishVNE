/**
 * Electron Main Process for Desktop Game Builds
 * Standalone game window with save/load functionality
 */

const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

// GPU stability: ANGLE D3D11 on Windows, plus prevent renderer backgrounding
// to avoid black screen when switching back to a maximised window.
if (process.platform === 'win32') {
    app.commandLine.appendSwitch('use-angle', 'd3d11');
}
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload-game.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true
        },
        title: 'Visual Novel Game',
        icon: path.join(__dirname, 'icon.png'),
        backgroundColor: '#1e293b',
        show: false
    });

    // Load the game
    mainWindow.loadFile('index.html');

    // Force repaint on focus to prevent black frame
    mainWindow.on('focus', () => {
        try { mainWindow.webContents.invalidate(); } catch {}
    });
    mainWindow.on('restore', () => {
        try { mainWindow.webContents.invalidate(); } catch {}
    });

    mainWindow.on('unresponsive', async () => {
        try {
            const result = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Game is not responding',
                message: 'The game has become unresponsive. Reload the window?',
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
                message: `The game window crashed (${details?.reason || 'unknown reason'}).`,
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

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Prevent window title changes
    mainWindow.on('page-title-updated', (event) => {
        event.preventDefault();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
