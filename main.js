const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const driveScanner = require('./services/driveScanner');
const { buildIndex } = require('./services/indexer');
const { copyAll } = require('./services/copier');
const { verifyAll } = require('./services/verifier');
const renamer = require('./services/renamer');
const { buildCsv } = require('./services/reporter');
const presets = require('./services/presets');
const notifier = require('./services/notifier');

let win;
const presetFile = () => path.join(app.getPath('userData'), 'presets.json');

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    backgroundColor: '#111111',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    title: 'BackupSafe',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('scan-drives', () => driveScanner.scanDrives());

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('build-index', (_e, cardPath) => buildIndex(cardPath));

ipcMain.handle('copy', async (_e, { index, destinations, folderName }) => {
  return copyAll({
    index, destinations, folderName,
    onProgress: (p) => win.webContents.send('progress', { phase: 'copy', ...p }),
  });
});

ipcMain.handle('verify', async (_e, { destinations, folderName, index, hashes }) => {
  const results = await verifyAll({
    destinations, folderName, index, hashes,
    onProgress: (p) => win.webContents.send('progress', { phase: 'verify', ...p }),
  });
  const allOk = results.every((r) => r.allOk);
  if (allOk) {
    const ok = results.reduce((s, r) => s + r.ok, 0);
    notifier.notifyComplete(Notification, { ok });
  } else {
    const corrupt = results.reduce((s, r) => s + r.corrupt.length, 0);
    const missing = results.reduce((s, r) => s + r.missing.length, 0);
    notifier.notifyProblem(Notification, { corrupt, missing });
  }
  return results;
});

ipcMain.handle('rename-preview', (_e, args) => renamer.renamePreview(args));
ipcMain.handle('apply-rename', (_e, args) => renamer.applyRename(args));

ipcMain.handle('export-csv', async (_e, results) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'backup-report.csv' });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, buildCsv(results), 'utf8');
  return r.filePath;
});

ipcMain.handle('load-presets', () => presets.loadPresets(presetFile()));
ipcMain.handle('save-preset', (_e, { name, locations }) =>
  presets.savePreset(presetFile(), name, locations));
