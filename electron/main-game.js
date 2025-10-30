/**
 * Electron Main Process for Desktop Game Builds
 * Standalone game window with save/load functionality
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

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
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
