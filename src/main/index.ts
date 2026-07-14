import { app, BrowserWindow, protocol, nativeTheme } from 'electron';
import path from 'path';
import { initDatabase, queryOne } from './database';
import { registerAllHandlers } from './ipc';
import { ensureDirectories } from './utils/paths';

let mainWindow: BrowserWindow | null = null;

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    title: 'ComfyUI Picture Manager',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f3f3f3',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  }

  // Ensure window is visible and focused
  mainWindow.show();
  mainWindow.focus();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom protocol for serving local images efficiently
function registerProtocols(): void {
  protocol.registerFileProtocol('prompt-image', (request, callback) => {
    const userDataPath = app.getPath('userData');
    const relativePath = request.url.replace('prompt-image://', '');
    const filePath = path.join(userDataPath, decodeURIComponent(relativePath));
    callback({ path: filePath });
  });
}

app.whenReady().then(async () => {
  registerProtocols();

  // Ensure data directories exist
  const userDataPath = app.getPath('userData');
  ensureDirectories(userDataPath);

  // Initialize database (async for sql.js WASM loading)
  await initDatabase(userDataPath);

  // Apply saved theme before creating window
  applySavedTheme(userDataPath);

  // Register IPC handlers
  registerAllHandlers();

  // Create main window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function applySavedTheme(_userDataPath: string) {
  try {
    const row = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['theme']);
    const theme = row?.value || 'system';
    if (theme === 'dark') {
      nativeTheme.themeSource = 'dark';
    } else if (theme === 'light') {
      nativeTheme.themeSource = 'light';
    } else {
      nativeTheme.themeSource = 'system';
    }
  } catch {
    nativeTheme.themeSource = 'system';
  }
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
