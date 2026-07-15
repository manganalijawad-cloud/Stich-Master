const { contextBridge, ipcRenderer, shell } = require('electron');
const path = require('path');

let appVersion = '1.0.0';
try {
  appVersion = require(path.join(__dirname, '..', 'package.json')).version;
} catch {}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: appVersion,
  isElectron: true,

  openExternal: (url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
        return shell.openExternal(url);
      }
    } catch {}
    return Promise.resolve();
  },

  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu-action', handler);
    return () => ipcRenderer.removeListener('menu-action', handler);
  },

  removeMenuListener: () => {
    ipcRenderer.removeAllListeners('menu-action');
  },
});
