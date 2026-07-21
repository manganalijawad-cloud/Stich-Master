const { app, BrowserWindow, ipcMain, crashReporter, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
let serverPort = 3000;

// ---------------------------------------------------------------------------
// SINGLE-INSTANCE LOCK
// ---------------------------------------------------------------------------
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
}

// ---------------------------------------------------------------------------
// WINDOWS APP USER MODEL ID (proper taskbar grouping)
// ---------------------------------------------------------------------------
app.setAppUserModelId('com.hellodarzi.app');

// ---------------------------------------------------------------------------
// PRODUCTION CONFIGURATION
// ---------------------------------------------------------------------------
function loadProductionConfig() {
  if (isDev) return true;

  const configPath = path.join(process.resourcesPath || '', 'config', 'production.json');

  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.SUPABASE_URL) process.env.SUPABASE_URL = config.SUPABASE_URL;
      if (config.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
      if (config.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = config.SUPABASE_SERVICE_ROLE_KEY;
      return true;
    }
  } catch (err) {
    console.error('Failed to load config from', configPath, err.message);
  }
  return false;
}

function validateConfig() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    const missing = [];
    if (!url) missing.push('SUPABASE_URL');
    if (!key) missing.push('SUPABASE_ANON_KEY');
    dialog.showErrorBox(
      'Configuration Required',
      'Hello Darzi cannot start without Supabase configuration.\n\n' +
      'Missing: ' + missing.join(', ') + '\n\n' +
      'Please rebuild the application with valid configuration:\n' +
      '  npm run electron:build\n\n' +
      'Contact your system administrator for assistance.'
    );
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// ENSURE USER DATA DIRECTORY (persists across updates)
// ---------------------------------------------------------------------------
const userDataPath = app.getPath('userData');
const dataDir = path.join(userDataPath, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
process.env.ELECTRON_USER_DATA = userDataPath;

// ---------------------------------------------------------------------------
// AUTO-UPDATER (GitHub Releases)
// ---------------------------------------------------------------------------
let autoUpdater = null;
let log = null;

if (!isDev) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    log = require('electron-log');
  } catch (e) {
    console.warn('Auto-updater modules not available — updates disabled:', e.message);
  }
}

if (!isDev && autoUpdater && log) {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    mainWindow?.webContents.send('update-available', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No updates available.');
    mainWindow?.webContents.send('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${progress.percent}%`);
    mainWindow?.webContents.send('update-download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded, installing on quit...');
    mainWindow?.webContents.send('update-downloaded');
    autoUpdater.quitAndInstall();
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err.message);
    mainWindow?.webContents.send('update-error', { message: err.message });
  });
}

// ---------------------------------------------------------------------------
// IPC HANDLERS
// ---------------------------------------------------------------------------
ipcMain.handle('get-app-version', () => {
  try {
    return require(path.join(__dirname, '..', '..', '..', 'package.json')).version;
  } catch {
    return '1.0.0';
  }
});

ipcMain.handle('get-user-data-path', () => {
  return userDataPath;
});

ipcMain.handle('get-auto-launch', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-auto-launch', (_event, enable) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe'),
  });
  return true;
});

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { updateAvailable: false, error: 'Auto-updater not available' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { updateAvailable: true, version: result?.updateInfo?.version };
  } catch (err) {
    return { updateAvailable: false, error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall();
  }
});

// ---------------------------------------------------------------------------
// WINDOW CONTROL IPC (frameless window)
// ---------------------------------------------------------------------------
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// ---------------------------------------------------------------------------
// GLOBAL CRASH & ERROR HANDLING
// ---------------------------------------------------------------------------
crashReporter.start({ uploadToServer: false });

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  dialog.showErrorBox(
    'Unexpected Error',
    `Hello Darzi encountered an unexpected error and needs to restart.\n\n${err.message}`
  );
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  if (!isDev) {
    dialog.showErrorBox(
      'Application Error',
      `An unexpected error occurred.\n\n${reason && reason.message ? reason.message : String(reason)}`
    );
  }
});

// ---------------------------------------------------------------------------
// WINDOW STATE PERSISTENCE
// ---------------------------------------------------------------------------
const STATE_FILE = path.join(userDataPath, 'window-state.json');
let stateSaveTimer = null;

function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return { width: 1280, height: 800, x: undefined, y: undefined, maximized: true };
}

function saveWindowState(bounds, maximized) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...bounds, maximized }));
  } catch {}
}

function debouncedSaveWindowState() {
  if (stateSaveTimer) clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(() => {
    if (mainWindow) {
      saveWindowState(mainWindow.getBounds(), mainWindow.isMaximized());
    }
    stateSaveTimer = null;
  }, 500);
}

// ---------------------------------------------------------------------------
// SECOND-INSTANCE HANDLER
// ---------------------------------------------------------------------------
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ---------------------------------------------------------------------------
// CREATE MAIN WINDOW
// ---------------------------------------------------------------------------
let mainWindow = null;

async function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 600,
    title: 'Hello Darzi',
    frame: false,
    backgroundColor: '#F8FAFC',
    show: false,
    icon: (function() { const p = path.join(__dirname, '..', '..', '..', 'dist', 'icon.ico'); try { if (fs.existsSync(p)) return p; } catch {} return path.join(__dirname, '..', '..', '..', 'public', 'icon.ico'); })(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.on('resize', debouncedSaveWindowState);
  mainWindow.on('move', debouncedSaveWindowState);
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.on('maximize', () => {
    debouncedSaveWindowState();
    mainWindow?.webContents.send('window-maximized-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    debouncedSaveWindowState();
    mainWindow?.webContents.send('window-maximized-changed', false);
  });

  mainWindow.once('ready-to-show', () => {
    if (state.maximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load page:', errorCode, errorDescription);
  });

  const url = `http://localhost:${serverPort}`;
  await mainWindow.loadURL(url);
}

// ---------------------------------------------------------------------------
// START EXPRESS SERVER
// ---------------------------------------------------------------------------
async function startExpressServer() {
  if (isDev) return;

  process.env.NODE_ENV = 'production';
  process.env.ELECTRON_RUN = 'true';

  if (!loadProductionConfig()) {
    console.warn('No bundled config found — relying on existing environment variables.');
  }

  if (!validateConfig()) {
    app.quit();
    return;
  }

  try {
    const serverPath = path.join(process.resourcesPath || '', 'dist', 'server.cjs');
    const serverModule = require(serverPath);
    serverPort = await serverModule.startServer(serverModule.PORT);
  } catch (err) {
    console.error('Failed to start server:', err);
    dialog.showErrorBox(
      'Server Error',
      `Failed to start the application server.\n\n${err.message}`
    );
    app.quit();
  }
}

// ---------------------------------------------------------------------------
// APP LIFECYCLE
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  await startExpressServer();
  await createWindow();

  if (!isDev && autoUpdater) {
    setTimeout(() => autoUpdater.checkForUpdates().catch((err) => {
      if (log) log.warn('Update check failed:', err.message);
    }), 5000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (mainWindow) {
    saveWindowState(mainWindow.getBounds(), mainWindow.isMaximized());
  }
});
