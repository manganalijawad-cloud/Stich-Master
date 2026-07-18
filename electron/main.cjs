const { app, BrowserWindow, crashReporter, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const PORT = 3000;

// ---------------------------------------------------------------------------
// PRODUCTION CONFIGURATION — load before anything else
// ---------------------------------------------------------------------------
function loadProductionConfig() {
  if (isDev) return true;

  const searchPaths = [
    path.join(__dirname, '..', 'config', 'production.json'),
    path.join(process.resourcesPath || '', 'config', 'production.json'),
  ];

  for (const configPath of searchPaths) {
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
// SINGLE-INSTANCE LOCK — prevents second EADDRINUSE crash
// ---------------------------------------------------------------------------
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
}

// ---------------------------------------------------------------------------
// AUTO-UPDATER — loaded lazily so a missing module never crashes the app
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
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available.`,
      detail: 'Would you like to download it now?',
      buttons: ['Download & Install', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No updates available.');
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${progress.percent}%`);
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. Restart now to install?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
  });
}

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
// WINDOW STATE PERSISTENCE (debounced)
// ---------------------------------------------------------------------------
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
let stateSaveTimer = null;

function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return { width: 1280, height: 800, x: undefined, y: undefined };
}

function saveWindowState(bounds) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(bounds));
  } catch {}
}

function debouncedSaveWindowState() {
  if (stateSaveTimer) clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(() => {
    if (mainWindow) saveWindowState(mainWindow.getBounds());
    stateSaveTimer = null;
  }, 500);
}

// ---------------------------------------------------------------------------
// SECOND-INSTANCE HANDLER — focus existing window
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
    backgroundColor: '#F8FAFC',
    show: false,
    icon: (function() { const p = path.join(__dirname, '..', 'dist', 'favicon.ico'); try { if (fs.existsSync(p)) return p; } catch {} return path.join(__dirname, '..', 'public', 'favicon.ico'); })(),
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load page:', errorCode, errorDescription);
  });

  const url = `http://localhost:${PORT}`;
  await mainWindow.loadURL(url);
}

// ---------------------------------------------------------------------------
// START EXPRESS SERVER (production only)
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
    const serverPath = path.join(__dirname, '..', 'dist', 'server.cjs');
    const { startServer } = require(serverPath);
    await startServer();
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
  if (mainWindow) saveWindowState(mainWindow.getBounds());
});
