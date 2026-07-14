import { app, BrowserWindow, protocol, nativeTheme, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { initDatabase, queryOne, queryAll, execute, saveDatabase } from './database';
import { registerAllHandlers } from './ipc';
import { ensureDirectories, getDataDir } from './utils/paths';
import { extractMetadata } from './utils/png-metadata';
import { generateThumbnail } from './utils/thumbnail';
import { v4 as uuidv4 } from 'uuid';
import type { ExtractedMetadata } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let watcher: FSWatcher | null = null;

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

const noMeta: ExtractedMetadata = { positive: '', negative: '', model: '', sampler: '', steps: 0, cfg: 0, seed: 0, width: 0, height: 0 };

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

// ---- Reusable import logic ----

function importOneFile(srcPath: string, dataDir: string): boolean {
  const ext = path.extname(srcPath).toLowerCase();
  if (!IMG_EXT.includes(ext)) return false;

  const imagesDir = path.join(dataDir, 'images');
  const relPath = `images/${path.basename(srcPath)}`;

  // Already imported?
  const existing = queryAll<{ id: number }>('SELECT id FROM images WHERE file_path = ?', [relPath]);
  if (existing.length > 0) return false;

  try {
    const stats = fs.statSync(srcPath);
    const meta = extractMetadata(srcPath) || noMeta;
    const uuid = uuidv4();
    const storageName = `${uuid}${ext}`;
    const destPath = path.join(imagesDir, storageName);

    // Copy into managed folder if not already there
    if (path.resolve(srcPath) !== path.resolve(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }

    // Thumbnail
    let thumbRel = '';
    try { thumbRel = generateThumbnail(destPath, path.join(dataDir, 'thumbnails'), uuid); } catch {}

    // Dimensions
    const img = nativeImage.createFromPath(destPath);
    const dims = img.isEmpty() ? { width: 0, height: 0 } : img.getSize();

    // Insert
    execute(
      'INSERT INTO prompts (positive, negative, model, sampler, steps, cfg, seed, width, height) VALUES (?,?,?,?,?,?,?,?,?)',
      [meta.positive, meta.negative, meta.model, meta.sampler, meta.steps, meta.cfg, meta.seed, meta.width || dims.width, meta.height || dims.height]
    );
    const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
    if (row) {
      execute(
        'INSERT INTO images (prompt_id, file_name, file_path, thumb_path, width, height, file_size, is_primary) VALUES (?,?,?,?,?,?,?,1)',
        [row.id, path.basename(srcPath), `images/${storageName}`, thumbRel, dims.width, dims.height, stats.size]
      );
    }
    saveDatabase(path.join(dataDir, 'prompts.db'));
    return true;
  } catch (err: any) {
    console.error('[IMPORT]', path.basename(srcPath), err.message);
    return false;
  }
}

function scanImagesFolder(dataDir: string): { scanned: number; imported: number } {
  const imagesDir = path.join(dataDir, 'images');
  if (!fs.existsSync(imagesDir)) return { scanned: 0, imported: 0 };

  const files = fs.readdirSync(imagesDir).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return IMG_EXT.includes(ext) && !f.startsWith('.');
  });

  let imported = 0;
  for (const f of files) {
    const fullPath = path.join(imagesDir, f);
    if (importOneFile(fullPath, dataDir)) imported++;
  }

  return { scanned: files.length, imported };
}

// ---- Watcher (new files only) ----

function startWatching(dataDir: string) {
  const imagesDir = path.join(dataDir, 'images');
  ensureDirectories(dataDir);
  if (watcher) watcher.close();

  watcher = chokidar.watch(imagesDir, {
    ignored: /(^|[/\\])\./, persistent: true, ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
  });

  watcher.on('add', (filePath: string) => {
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
  applySavedTheme(dataDir);
  registerAllHandlers();
  startWatching(dataDir);

  // Scan existing files on startup
  const result = scanImagesFolder(dataDir);
  if (result.imported > 0) console.log(`[STARTUP] Imported ${result.imported} existing images`);

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (watcher) { watcher.close(); watcher = null; } });

function applySavedTheme(_dataDir: string) {
  try {
    const row = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['theme']);
    if (row?.value === 'dark') nativeTheme.themeSource = 'dark';
    else if (row?.value === 'light') nativeTheme.themeSource = 'light';
    else nativeTheme.themeSource = 'system';
  } catch { nativeTheme.themeSource = 'system'; }
}

function restartWatcher(dataDir: string) {
  startWatching(dataDir);
  const result = scanImagesFolder(dataDir);
  if (mainWindow) mainWindow.webContents.send('files-changed');
  return result;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
}
