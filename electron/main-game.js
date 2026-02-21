/**
 * Electron Main Process for Desktop Game Builds
 * Standalone game window with save/load functionality
 * Includes a native splash window for instant visual feedback
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
let splashWindow;

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
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    // Tiny inline HTML splash – renders in <50ms
    splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html>
<html><head><style>
  body { margin:0; display:flex; flex-direction:column; align-items:center;
         justify-content:center; height:100vh; background:#000;
         font-family:'Segoe UI',sans-serif; color:#fff; overflow:hidden; }
  h1 { font-size:1.8rem; margin:0 0 1.2rem; opacity:0.95; }
  .bar-wrap { width:200px; height:4px; background:rgba(255,255,255,0.15);
              border-radius:4px; overflow:hidden; }
  .bar { height:100%; width:30%; border-radius:4px;
         background:linear-gradient(90deg,#ff00a5,#8a2be2);
         animation:loading 1.2s ease-in-out infinite alternate; }
  @keyframes loading { from{width:20%;margin-left:0} to{width:50%;margin-left:50%} }
  p { margin:0.8rem 0 0; font-size:0.8rem; opacity:0.6; }
</style></head><body>
  <h1>Visual Novel Game</h1>
  <div class="bar-wrap"><div class="bar"></div></div>
  <p>Loading...</p>
</body></html>`));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        webPreferences: {
            preload: path.join(__dirname, 'preload-game.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            backgroundThrottling: false
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

    // Show main window and close splash once the game HTML is ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
            splashWindow = null;
        }
    });

    // Prevent window title changes
    mainWindow.on('page-title-updated', (event) => {
        event.preventDefault();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        // Hard fallback: force exit if app.quit() doesn't terminate
        setTimeout(() => { process.exit(0); }, 2000);
    });
}

app.whenReady().then(() => {
    createSplashWindow();
    // Defer main window creation until splash is painted on-screen
    if (splashWindow) {
        splashWindow.webContents.once('did-finish-load', () => { createWindow(); });
        // Safety: if did-finish-load never fires, don't hang forever
        setTimeout(() => { if (!mainWindow) createWindow(); }, 3000);
    } else {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    app.quit();
});

// Ensure the process actually terminates and doesn't linger as a background task
app.on('will-quit', () => {
    setTimeout(() => {
        console.warn('Game did not exit cleanly – forcing process.exit()');
        process.exit(0);
    }, 1500);
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createSplashWindow();
        createWindow();
    }
});
