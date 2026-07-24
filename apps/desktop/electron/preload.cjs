const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,

  openExternal: (url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:' || parsed.protocol === 'hellodarzi:') {
        return shell.openExternal(url);
      }
    } catch {}
    return Promise.resolve();
  },

  // App version from main process
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // User data path (persistent storage location)
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // Auto-launch on Windows startup
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enable) => ipcRenderer.invoke('set-auto-launch', enable),

  // Print with in-app PDF preview (Electron lacks Chromium print preview)
  print: () => ipcRenderer.invoke('print'),

  // Window controls (frameless)
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (callback) => {
    const handler = (_event, maximized) => callback(maximized);
    ipcRenderer.on('window-maximized-changed', handler);
    return () => ipcRenderer.removeListener('window-maximized-changed', handler);
  },

  // Auto-update controls
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),

  // Update event listeners
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

  onUpdateNotAvailable: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('update-not-available', handler);
    return () => ipcRenderer.removeListener('update-not-available', handler);
  },

  onUpdateDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },

  onUpdateDownloaded: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },

  onUpdateError: (callback) => {
    const handler = (_event, error) => callback(error);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },

  // OAuth with system browser + deep link (hellodarzi://)
  oauthStart: (authUrl) => ipcRenderer.invoke('oauth-start', authUrl),
  oauthCancel: () => ipcRenderer.invoke('oauth-cancel'),
  oauthParseCallback: (url) => ipcRenderer.invoke('oauth-parse-callback', url),
  oauthIsProtocolRegistered: () => ipcRenderer.invoke('oauth-is-protocol-registered'),
  onOAuthCallback: (callback) => {
    const handler = (_event, url) => callback(url);
    ipcRenderer.on('oauth-callback', handler);
    return () => ipcRenderer.removeListener('oauth-callback', handler);
  },
});
