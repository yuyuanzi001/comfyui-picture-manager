import { app, BrowserWindow, protocol, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { initDatabase, queryOne, saveDatabase } from './database';
import { registerAllHandlers } from './ipc';
import { ensureDirectories, getDataDir } from './utils/paths';
import { importOneFile, scanAndImport, isUuidFilename } from './services/importService';

let mainWindow: BrowserWindow | null = null;
let watcher: FSWatcher | null = null;

const isDev = process.argv.includes('--dev');

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600, frame: true,
    title: 'ComfyUI Picture Manager',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f3f3f3',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload', 'index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  mainWindow.show(); mainWindow.focus();
  mainWindow.on('closed', () => { mainWindow = null; });
}

function startWatching(dataDir: string) {
  const imagesDir = path.join(dataDir, 'images');
  ensureDirectories(dataDir);
  if (watcher) watcher.close();

  const watchPaths: string[] = [imagesDir];
  try {
    const wd = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['watch_dir']);
    if (wd?.value && fs.existsSync(wd.value)) {
      watchPaths.push(wd.value);
      console.log('[WATCH] Also watching configured dir:', wd.value);
    }
  } catch {}

  watcher = chokidar.watch(watchPaths, {
    ignored: /(^|[/\\])\./, persistent: true, ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
  });

  watcher.on('add', (filePath: string) => {
    if (isUuidFilename(path.basename(filePath))) return;
    const changed = importOneFile(filePath, dataDir);
    if (changed && mainWindow) mainWindow.webContents.send('files-changed');
  });
}

function registerProtocols() {
  protocol.registerFileProtocol('prompt-image', (request, callback) => {
    callback({ path: path.join(getDataDir(), decodeURIComponent(request.url.replace('prompt-image://', ''))) });
  });
}

app.whenReady().then(async () => {
  registerProtocols();
  const dataDir = getDataDir();
  ensureDirectories(dataDir);
  await initDatabase(dataDir);
  applySavedTheme();
  registerAllHandlers();
  startWatching(dataDir);

  // Scan existing files on startup
  scanAndImport(dataDir, dataDir);

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (watcher) { watcher.close(); watcher = null; } });

function applySavedTheme() {
  try {
    const row = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['theme']);
    if (row?.value === 'dark') nativeTheme.themeSource = 'dark';
    else if (row?.value === 'light') nativeTheme.themeSource = 'light';
    else nativeTheme.themeSource = 'system';
  } catch { nativeTheme.themeSource = 'system'; }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
}
