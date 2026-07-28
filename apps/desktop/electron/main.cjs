const { app, BrowserWindow, ipcMain, crashReporter, dialog, Menu, shell, session: electronSession } = require('electron');
const path = require('path');
const fs = require('fs');
const { URL, pathToFileURL } = require('url');

const isDev = !app.isPackaged;
let serverPort = 3000;

function resolveDevServerPort() {
  const fromEnv = Number.parseInt(process.env.DEV_SERVER_PORT || '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  const candidates = [
    path.join(process.cwd(), '.dev-server-port'),
    path.join(__dirname, '..', '..', '..', '.dev-server-port'),
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const port = Number.parseInt(fs.readFileSync(candidate, 'utf8').trim(), 10);
      if (Number.isFinite(port) && port > 0) {
        return port;
      }
    } catch {}
  }

  return 3000;
}

// Use an app-specific userData path (not the npm package name @hello-darzi/desktop).
// Default Electron userData is shared as "Electron" in unpackaged mode and causes cache lock errors.
app.setName('Hello Darzi');
app.setPath(
  'userData',
  path.join(app.getPath('appData'), isDev ? 'Hello Darzi Dev' : 'Hello Darzi')
);

/**
 * Older builds stored data under @hello-darzi/desktop or hello-darzi.
 * Copy local SQLite into the stable Hello Darzi folder once so shops keep their data.
 */
function migrateLegacyUserDataIfNeeded(userDataPath) {
  const destDb = path.join(userDataPath, 'data', 'hellodarzi.db');
  if (fs.existsSync(destDb)) return;

  const appData = app.getPath('appData');
  const legacyRoots = [
    path.join(appData, '@hello-darzi', 'desktop'),
    path.join(appData, 'hello-darzi'),
  ];

  for (const legacyRoot of legacyRoots) {
    const srcDb = path.join(legacyRoot, 'data', 'hellodarzi.db');
    if (!fs.existsSync(srcDb)) continue;
    try {
      const destDir = path.join(userDataPath, 'data');
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcDb, destDb);
      for (const suffix of ['-wal', '-shm']) {
        const side = srcDb + suffix;
        if (fs.existsSync(side)) {
          fs.copyFileSync(side, destDb + suffix);
        }
      }
      console.log('Migrated local database from', legacyRoot, 'to', userDataPath);
      return;
    } catch (err) {
      console.warn('Failed to migrate legacy database from', legacyRoot, err?.message || err);
    }
  }
}

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
// Business data is local SQLite. Authentication uses Supabase Auth only;
// SUPABASE_JWT_SECRET is loaded so the local server can verify sessions offline.

// ---------------------------------------------------------------------------
// ENSURE USER DATA DIRECTORY (persists across updates)
// ---------------------------------------------------------------------------
const userDataPath = app.getPath('userData');
migrateLegacyUserDataIfNeeded(userDataPath);
const dataDir = path.join(userDataPath, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
process.env.ELECTRON_USER_DATA = userDataPath;

// ---------------------------------------------------------------------------
// SUPABASE AUTH ENV (JWT secret for offline local verification)
// ---------------------------------------------------------------------------
function loadSupabaseEnvFromFile() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '..', '..', '.env'),
  ];
  if (process.resourcesPath) {
    candidates.unshift(path.join(process.resourcesPath, '.env'));
  }
  for (const envPath of candidates) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const text = fs.readFileSync(envPath, 'utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        if (!key.startsWith('SUPABASE_') && !key.startsWith('VITE_SUPABASE_')) continue;
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
      break;
    } catch (err) {
      console.warn('Could not load Supabase env from', envPath, err?.message || err);
    }
  }
}
loadSupabaseEnvFromFile();

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
    const msg = err.message || '';
    // Missing feed / offline / transient network — not a user-facing "Update Error"
    if (
      msg.includes('net_error') ||
      msg.includes('ERR_INTERNET_DISCONNECTED') ||
      msg.includes('ERR_NETWORK_CHANGED') ||
      msg.includes('ERR_CONNECTION') ||
      msg.includes('ERR_NAME_NOT_RESOLVED') ||
      msg.includes('Cannot find latest.yml') ||
      msg.includes('latest.yml') ||
      msg.includes('404') ||
      msg.includes('ENOTFOUND')
    ) {
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

ipcMain.handle('open-path', async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== 'string') {
    return { success: false, error: 'Invalid path' };
  }
  // Only allow opening under the app userData tree (safety).
  const resolved = path.resolve(targetPath);
  const root = path.resolve(userDataPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return { success: false, error: 'Path not allowed' };
  }
  try {
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    const err = await shell.openPath(resolved);
    if (err) return { success: false, error: err };
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
});

const PREFS_FILE = path.join(userDataPath, 'preferences.json');

function readPrefs() {
  try {
    if (fs.existsSync(PREFS_FILE)) {
      return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function writePrefs(prefs) {
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
  } catch (err) {
    console.warn('Failed to write preferences:', err?.message || err);
  }
}

function applyAutoLaunch(enable) {
  app.setLoginItemSettings({
    openAtLogin: !!enable,
    openAsHidden: false,
    path: process.execPath,
    args: [],
  });
  const prefs = readPrefs();
  prefs.autoLaunch = !!enable;
  writePrefs(prefs);
  return !!enable;
}

/** Packaged installs open with Windows by default; preference can turn it off. */
function ensureAutoLaunchDefault() {
  if (isDev) return;
  const prefs = readPrefs();
  if (typeof prefs.autoLaunch !== 'boolean') {
    applyAutoLaunch(true);
    return;
  }
  const current = app.getLoginItemSettings().openAtLogin;
  if (current !== prefs.autoLaunch) {
    applyAutoLaunch(prefs.autoLaunch);
  }
}

ipcMain.handle('get-auto-launch', () => {
  const prefs = readPrefs();
  if (typeof prefs.autoLaunch === 'boolean') return prefs.autoLaunch;
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-auto-launch', (_event, enable) => {
  return applyAutoLaunch(enable);
});

ipcMain.handle('check-for-updates', async () => {
  if (!autoUpdater) return { updateAvailable: false, error: 'Auto-updater not available' };
  try {
    const result = await autoUpdater.checkForUpdates();
    const available = !!(result && (result.isUpdateAvailable || result.downloadPromise));
    if (available && result?.updateInfo?.version) {
      // downloadUpdate() takes an optional CancellationToken — not updateInfo
      await autoUpdater.downloadUpdate();
      return { updateAvailable: true, version: result.updateInfo.version };
    }
    return { updateAvailable: false };
  } catch (err) {
    const msg = err.message || String(err);
    if (
      msg.includes('net_error') ||
      msg.includes('ERR_INTERNET_DISCONNECTED') ||
      msg.includes('ERR_NETWORK') ||
      msg.includes('ERR_CONNECTION') ||
      msg.includes('ERR_NAME') ||
      msg.includes('Cannot find latest.yml') ||
      msg.includes('latest.yml') ||
      msg.includes('404') ||
      msg.includes('ENOTFOUND')
    ) {
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
// PRINT PREVIEW (Electron does not ship Chromium's print-preview WebUI)
// ---------------------------------------------------------------------------
const printPreviewTempFiles = new WeakMap();

function cleanupPrintPreviewFiles(win) {
  const files = printPreviewTempFiles.get(win);
  if (!files) return;
  printPreviewTempFiles.delete(win);
  for (const filePath of files) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }
}

function buildPrintPreviewHtml(pdfUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Print Preview — Hello Darzi</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      height: 100%;
      overflow: hidden;
      font-family: "Segoe UI", Tahoma, sans-serif;
      background: #f8fafc;
      color: #0f172a;
    }
    .toolbar {
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 14px;
      background: #0f172a;
      color: #fff;
    }
    .toolbar h1 {
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .actions { display: flex; gap: 8px; }
    button {
      border: 0;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-close {
      background: transparent;
      color: #cbd5e1;
      border: 1px solid #334155;
    }
    .btn-close:hover { background: #1e293b; }
    .btn-print { background: #fff; color: #0f172a; }
    .btn-print:hover { background: #e2e8f0; }
    .btn-print:disabled { opacity: 0.65; cursor: wait; }
    iframe {
      width: 100%;
      height: calc(100% - 52px);
      border: 0;
      background: #fff;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <h1>Print Preview</h1>
    <div class="actions">
      <button type="button" class="btn-close" id="closeBtn">Close</button>
      <button type="button" class="btn-print" id="printBtn">Print</button>
    </div>
  </div>
  <iframe id="pdfFrame" src="${pdfUrl}" title="Print preview document"></iframe>
  <script>
    document.getElementById('closeBtn').addEventListener('click', () => {
      window.helloDarziPrint?.close();
    });
    document.getElementById('printBtn').addEventListener('click', async () => {
      const btn = document.getElementById('printBtn');
      btn.disabled = true;
      try {
        await window.helloDarziPrint?.print();
      } finally {
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

ipcMain.handle('print', async (event) => {
  const source = event.sender;
  if (!source || source.isDestroyed()) {
    return { success: false, error: 'Window unavailable' };
  }

  // Wait a tick so React print-option state/DOM updates settle before capture.
  await new Promise((resolve) => setTimeout(resolve, 50));

  let pdfData;
  try {
    pdfData = await source.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' },
      preferCSSPageSize: true,
    });
  } catch (err) {
    console.error('printToPDF failed:', err);
    return { success: false, error: err.message || String(err) };
  }

  const stamp = Date.now();
  const tempDir = app.getPath('temp');
  const pdfPath = path.join(tempDir, `hellodarzi-print-${stamp}.pdf`);
  const htmlPath = path.join(tempDir, `hellodarzi-print-${stamp}.html`);

  try {
    fs.writeFileSync(pdfPath, pdfData);
    const pdfDataUrl = `data:application/pdf;base64,${Buffer.from(pdfData).toString('base64')}`;
    fs.writeFileSync(htmlPath, buildPrintPreviewHtml(pdfDataUrl), 'utf8');
  } catch (err) {
    try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch {}
    try { if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath); } catch {}
    return { success: false, error: err.message || String(err) };
  }

  const parent = BrowserWindow.fromWebContents(source);
  const previewWin = new BrowserWindow({
    width: 920,
    height: 740,
    minWidth: 640,
    minHeight: 480,
    title: 'Print Preview — Hello Darzi',
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: false,
    autoHideMenuBar: true,
    backgroundColor: '#F8FAFC',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'print-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  printPreviewTempFiles.set(previewWin, [pdfPath, htmlPath]);
  previewWin.__hellodarziPdfPath = pdfPath;

  previewWin.once('ready-to-show', () => {
    if (!previewWin.isDestroyed()) previewWin.show();
  });

  previewWin.on('closed', () => {
    cleanupPrintPreviewFiles(previewWin);
  });

  try {
    await previewWin.loadFile(htmlPath);
  } catch (err) {
    cleanupPrintPreviewFiles(previewWin);
    if (!previewWin.isDestroyed()) previewWin.close();
    return { success: false, error: err.message || String(err) };
  }

  return { success: true };
});

ipcMain.handle('print-preview-print', async (event) => {
  const previewWin = BrowserWindow.fromWebContents(event.sender);
  const pdfPath = previewWin?.__hellodarziPdfPath;
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return { success: false, error: 'Preview document not found' };
  }

  return new Promise((resolve) => {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
      },
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (!printWin.isDestroyed()) printWin.close();
      resolve(result);
    };

    printWin.webContents.on('did-fail-load', (_e, _code, desc) => {
      finish({ success: false, error: desc || 'Failed to load print document' });
    });

    printWin.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        if (printWin.isDestroyed()) {
          finish({ success: false, error: 'Print window closed' });
          return;
        }
        printWin.webContents.print(
          { silent: false, printBackground: true },
          (success, failureReason) => {
            finish({
              success: !!success,
              error: success ? undefined : (failureReason || 'Print cancelled or failed'),
            });
          }
        );
      }, 300);
    });

    printWin.loadURL(pathToFileURL(pdfPath).href).catch((err) => {
      finish({ success: false, error: err.message || String(err) });
    });
  });
});

ipcMain.handle('print-preview-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
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
    // hellodarzi://order?orderId=&itemIdx= (QR) and other custom-protocol URLs
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('deep-link', url);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch (err) {
    console.error('Failed to handle deep link:', err.message);
  }
}

// ---------------------------------------------------------------------------
// CREATE MAIN WINDOW
// ---------------------------------------------------------------------------
let mainWindow = null;
let loadRetries = 0;
const MAX_LOAD_RETRIES = 5;

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
    backgroundColor: '#0f172a',
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

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    // Ignore splash / about:blank failures; only retry the app URL.
    if (validatedURL && !validatedURL.includes(`localhost:${serverPort}`)) return;
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

  // Instant first paint — splash while the local server boots.
  try {
    await mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  } catch (err) {
    console.warn('Splash load failed:', err?.message || err);
  }
}

async function loadAppIntoWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  loadRetries = 0;
  const url = `http://localhost:${serverPort}`;
  try {
    await mainWindow.loadURL(url);
  } catch (err) {
    console.error('Initial page load failed:', err?.message || err);
    // did-fail-load retries handle recovery; avoid turning this into an unhandled rejection.
  }
}

// ---------------------------------------------------------------------------
// START EXPRESS SERVER
// ---------------------------------------------------------------------------
/**
 * server.cjs is loaded from extraResources (resources/dist), outside the asar.
 * Native better-sqlite3 lives in app.asar.unpacked; its JS deps (bindings, etc.)
 * normally stay inside app.asar. Prepend BOTH module roots so require() can find
 * the native addon and its JavaScript dependencies on clean installs.
 */
function ensurePackagedNativeModulePaths() {
  if (isDev) return;
  const Module = require('module');
  const resourcesPath = process.resourcesPath || '';
  process.env.ELECTRON_RESOURCES_PATH = resourcesPath;

  const moduleRoots = [
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules'),
    path.join(resourcesPath, 'app.asar', 'node_modules'),
    // Fallback if electron-builder also mirrors deps next to the server bundle
    path.join(resourcesPath, 'dist', 'node_modules'),
  ].filter((p) => fs.existsSync(p));

  if (moduleRoots.length === 0) {
    console.warn('Packaged native module folders missing under', resourcesPath);
    return;
  }

  const parts = [...moduleRoots];
  if (process.env.NODE_PATH) parts.push(process.env.NODE_PATH);
  process.env.NODE_PATH = parts.join(path.delimiter);
  Module._initPaths();
}

async function startExpressServer() {
  if (isDev) return true;

  process.env.NODE_ENV = 'production';
  process.env.ELECTRON_RUN = 'true';
  // Prevent the server module from auto-listening on require — we call startServer().
  process.env.ELECTRON_SERVER_MANAGED = '1';

  ensurePackagedNativeModulePaths();

  try {
    const serverPath = path.join(process.resourcesPath || '', 'dist', 'server.cjs');
    const serverModule = require(serverPath);
    serverPort = await serverModule.startServer(serverModule.PORT);
    return true;
  } catch (err) {
    console.error('Failed to start server:', err);
    dialog.showErrorBox(
      'Server Error',
      `Failed to start the application server.\n\n${err.message}`
    );
    app.quit();
    return false;
  }
}

// ---------------------------------------------------------------------------
// APP LIFECYCLE
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  ensureAutoLaunchDefault();

  // Show splash immediately so startup feels instant.
  await createWindow();

  const serverReady = await startExpressServer();
  if (!serverReady) return;

  if (isDev) {
    serverPort = resolveDevServerPort();
    console.log(`Electron dev mode loading http://localhost:${serverPort}`);
  }
  await loadAppIntoWindow();

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
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().then(() => loadAppIntoWindow()).catch(() => {});
  }
});

app.on('before-quit', () => {
  if (mainWindow) {
    saveWindowState(mainWindow.getBounds(), mainWindow.isMaximized());
  }
});
