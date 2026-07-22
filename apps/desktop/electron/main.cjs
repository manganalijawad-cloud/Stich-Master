const { app, BrowserWindow, ipcMain, crashReporter, dialog, Menu, shell, session: electronSession } = require('electron');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

const isDev = !app.isPackaged;
let serverPort = 3000;

// ---------------------------------------------------------------------------
// CUSTOM PROTOCOL (Deep Link)
// ---------------------------------------------------------------------------
const PROTOCOL = 'hellodarzi';

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Store the OAuth callback promise resolver so the renderer can await it
let pendingOAuthResolve = null;

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
      if (config.VITE_SUPABASE_URL) process.env.VITE_SUPABASE_URL = config.VITE_SUPABASE_URL;
      if (config.VITE_SUPABASE_ANON_KEY) process.env.VITE_SUPABASE_ANON_KEY = config.VITE_SUPABASE_ANON_KEY;
      return true;
    }
  } catch (err) {
    console.error('Failed to load config from', configPath, err.message);
  }
  return false;
}

function validateConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    const missing = [];
    if (!url && !process.env.VITE_SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!key && !process.env.VITE_SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
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
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

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
    log.info('Update downloaded, ready to install.');
    mainWindow?.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err.message);
    if (err.message && (
      err.message.includes('net_error') ||
      err.message.includes('ERR_INTERNET_DISCONNECTED') ||
      err.message.includes('ERR_NETWORK_CHANGED') ||
      err.message.includes('ERR_CONNECTION') ||
      err.message.includes('ERR_NAME_NOT_RESOLVED')
    )) {
      mainWindow?.webContents.send('update-not-available');
    } else {
      mainWindow?.webContents.send('update-error', { message: err.message });
    }
  });
}

// ---------------------------------------------------------------------------
// IPC HANDLERS
// ---------------------------------------------------------------------------
ipcMain.handle('get-app-version', () => {
  const paths = [
    path.join(__dirname, '..', '..', '..', 'package.json'),
    path.join(__dirname, '..', 'package.json'),
    path.join(process.resourcesPath || '', '..', 'package.json'),
    path.join(process.cwd(), 'package.json'),
  ];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8')).version || '1.0.0';
      }
    } catch {}
  }
  return '1.0.0';
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
    if (result?.updateInfo?.version) {
      // Start downloading
      await autoUpdater.downloadUpdate(result.updateInfo);
      return { updateAvailable: true, version: result.updateInfo.version };
    }
    return { updateAvailable: false };
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('net_error') || msg.includes('ERR_INTERNET_DISCONNECTED') || msg.includes('ERR_NETWORK') || msg.includes('ERR_CONNECTION') || msg.includes('ERR_NAME')) {
      return { updateAvailable: false, offline: true };
    }
    return { updateAvailable: false, error: msg };
  }
});

ipcMain.handle('install-update', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall();
  }
});

ipcMain.handle('download-update', async () => {
  if (!autoUpdater) return { success: false, error: 'Auto-updater not available' };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
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
// SECOND-INSTANCE HANDLER (also receives deep link from OS)
// ---------------------------------------------------------------------------
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  // Handle deep link from second instance (Windows sends URL as argument)
  const deepLink = argv.find(a => a.startsWith(`${PROTOCOL}://`));
  if (deepLink) handleDeepLink(deepLink);
});

// macOS: Open URL event
app.on('open-url', (_event, url) => {
  if (url && url.startsWith(`${PROTOCOL}://`)) {
    handleDeepLink(url);
  }
});

function handleDeepLink(url) {
  try {
    const parsed = new URL(url);
    // Expected format: hellodarzi://auth/callback#access_token=xxx&refresh_token=xxx&...
    // or hellodarzi://auth/callback?code=xxx&state=xxx (PKCE flow)
    if (parsed.pathname === '/auth/callback' || parsed.pathname === 'auth/callback') {
      if (pendingOAuthResolve) {
        const resolve = pendingOAuthResolve;
        pendingOAuthResolve = null;
        resolve({ url: url });
      }
      // Also forward to renderer so it can process the session
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('oauth-callback', url);
      }
    }
  } catch (err) {
    console.error('Failed to parse deep link:', err.message);
  }
}

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
    icon: (function() { const candidates = [ path.join(process.resourcesPath || '', 'dist', 'icon.ico'), path.join(__dirname, 'icon.ico'), ]; for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch {} } return undefined; })(),
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

  let loadRetries = 0;
  const MAX_LOAD_RETRIES = 5;

  // ---------------------------------------------------------------------------
  // IPC: Start OAuth flow by opening the system browser
  // ---------------------------------------------------------------------------
  ipcMain.handle('oauth-start', async (_event, authUrl) => {
    // Set up a promise that will resolve when the deep link callback arrives
    return new Promise((resolve, reject) => {
      // Clear any previous pending resolver
      pendingOAuthResolve = null;

      // Set a timeout (2 minutes)
      const timeout = setTimeout(() => {
        if (pendingOAuthResolve === resolve) {
          pendingOAuthResolve = null;
          resolve({ error: 'Authentication timed out. Please try again.' });
        }
      }, 120000);

      pendingOAuthResolve = (result) => {
        clearTimeout(timeout);
        resolve(result);
      };

      // Open the auth URL in the user's default system browser
      shell.openExternal(authUrl).catch((err) => {
        clearTimeout(timeout);
        if (pendingOAuthResolve === resolve) {
          pendingOAuthResolve = null;
          resolve({ error: `Failed to open browser: ${err.message}` });
        }
      });
    });
  });

  // ---------------------------------------------------------------------------
  // IPC: Cancel a pending OAuth flow
  // ---------------------------------------------------------------------------
  ipcMain.handle('oauth-cancel', async () => {
    if (pendingOAuthResolve) {
      const resolve = pendingOAuthResolve;
      pendingOAuthResolve = null;
      resolve({ error: 'Authentication cancelled.' });
    }
  });

  // ---------------------------------------------------------------------------
  // IPC: Parse a deep link callback URL and extract the Supabase session
  // ---------------------------------------------------------------------------
  ipcMain.handle('oauth-parse-callback', async (_event, url) => {
    try {
      const parsed = new URL(url);
      // Support both hash fragment (implicit flow) and query params (PKCE code flow)
      let params;
      if (parsed.hash) {
        params = new URLSearchParams(parsed.hash.replace('#', '?'));
      } else {
        params = parsed.searchParams;
      }

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');
      const tokenType = params.get('token_type');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      if (error) {
        return { error: errorDescription || error };
      }

      if (accessToken) {
        return {
          access_token: accessToken,
          refresh_token: refreshToken || '',
          expires_in: expiresIn ? parseInt(expiresIn) : null,
          token_type: tokenType || 'bearer',
        };
      }

      return { error: 'No access token found in callback URL.' };
    } catch {
      return { error: 'Invalid callback URL.' };
    }
  });

  // ---------------------------------------------------------------------------
  // IPC: Check if custom protocol is registered
  // ---------------------------------------------------------------------------
  ipcMain.handle('oauth-is-protocol-registered', async () => {
    return app.isDefaultProtocolClient(PROTOCOL);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('Failed to load page:', errorCode, errorDescription);
    if (loadRetries < MAX_LOAD_RETRIES && mainWindow) {
      loadRetries++;
      console.log(`Retrying load (${loadRetries}/${MAX_LOAD_RETRIES})...`);
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.loadURL(`http://localhost:${serverPort}`).catch(e => console.error('Retry failed:', e));
        }
      }, 1000 * loadRetries);
    }
  });

  mainWindow.webContents.on('crashed', () => {
    console.error('Renderer process crashed');
    dialog.showErrorBox(
      'Application Error',
      'The application encountered an error and needs to reload.'
    );
    if (mainWindow) {
      mainWindow.loadURL(`http://localhost:${serverPort}`).catch(() => {});
    }
  });

  mainWindow.on('unresponsive', () => {
    console.warn('Window became unresponsive');
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

  // Handle deep link if app was launched via the custom protocol
  const deepLinkArg = process.argv.find(a => a.startsWith(`${PROTOCOL}://`));
  if (deepLinkArg) {
    // Small delay to ensure the renderer is ready
    setTimeout(() => handleDeepLink(deepLinkArg), 1000);
  }

  if (!isDev && autoUpdater) {
    const checkUpdate = () => autoUpdater.checkForUpdates().catch((err) => {
      if (log) log.warn('Update check failed:', err.message);
    });
    // Check shortly after startup
    setTimeout(checkUpdate, 5000);
    // Then check every hour
    setInterval(checkUpdate, 60 * 60 * 1000);
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
