const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('backupsafe', {
  scanDrives: () => ipcRenderer.invoke('scan-drives'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  buildIndex: (cardPath) => ipcRenderer.invoke('build-index', cardPath),
  copy: (args) => ipcRenderer.invoke('copy', args),
  verify: (args) => ipcRenderer.invoke('verify', args),
  preview: (args) => ipcRenderer.invoke('rename-preview', args),
  applyRename: (args) => ipcRenderer.invoke('apply-rename', args),
  exportCsv: (results) => ipcRenderer.invoke('export-csv', results),
  loadPresets: () => ipcRenderer.invoke('load-presets'),
  savePreset: (name, locations) => ipcRenderer.invoke('save-preset', { name, locations }),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
  applyToken: (text, cursor, token) => {
    return { text: text.slice(0, cursor) + token + text.slice(cursor), cursor: cursor + token.length };
  },
});
