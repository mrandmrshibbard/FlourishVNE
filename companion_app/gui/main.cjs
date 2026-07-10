// Electron main process for the Console Porting Companion GUI.
// A friendly one-window shell over the export→convert pipeline. No console SDK, no signing, no W4 —
// it only makes a stock-Godot project the user can play on their PC (spec §1 boundaries).
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#12141c',
    title: 'Flourish → Godot',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

// Let the user pick a .flourish file.
ipcMain.handle('pick-flourish', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Choose your Flourish game',
    properties: ['openFile'],
    filters: [{ name: 'Flourish game', extensions: ['flourish'] }, { name: 'All files', extensions: ['*'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

// Let the user choose where the Godot project is written (defaults to next to the .flourish).
ipcMain.handle('pick-output', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Where should the Godot project go?',
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

// Run the full pipeline. Progress is streamed back to the window via the 'pipeline-step' channel.
ipcMain.handle('run-pipeline', async (evt, { flourishPath, outParent }) => {
  try {
    if (!flourishPath || !fs.existsSync(flourishPath)) return { ok: false, error: 'That Flourish file could not be found.' };
    const dest = outParent && fs.existsSync(outParent) ? outParent : path.dirname(flourishPath);
    const { runPipeline } = await import(pathToFileURL(path.join(__dirname, 'pipeline.mjs')).href);
    const result = await runPipeline(flourishPath, dest, (msg) => evt.sender.send('pipeline-step', msg));
    return result;
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
});

ipcMain.handle('open-path', async (evt, p) => {
  if (p && fs.existsSync(p)) shell.showItemInFolder(p);
});
ipcMain.handle('open-folder', async (evt, p) => {
  if (p && fs.existsSync(p)) shell.openPath(p);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
