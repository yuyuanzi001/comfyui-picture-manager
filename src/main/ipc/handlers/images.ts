import { ipcMain, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { IPC } from '../../../shared/ipc-channels';
import { getAppPaths, getDataDir, ensureDirectories } from '../../utils/paths';
import { queryAll, queryOne, execute, saveDatabase } from '../../database';
import { generateThumbnail } from '../../utils/thumbnail';
import { extractMetadata } from '../../utils/png-metadata';
import { v4 as uuidv4 } from 'uuid';
import { importFiles, IMG_EXT } from '../../services/importService';
import type { ImageRecord } from '../../../shared/types';

function dbPath(): string {
  return path.join(getDataDir(), 'prompts.db');
}

export function registerImageHandlers(): void {
  ipcMain.handle(IPC.IMAGES_IMPORT, async (_event, req) => {
    const dataDir = getDataDir();
    const sizeRow = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['thumbnail_size']);
    const thumbSize = sizeRow ? parseInt(sizeRow.value) : 256;
    const result = importFiles(req.filePaths, dataDir, thumbSize);
    try { saveDatabase(dbPath()); } catch {}
    return result;
  });

  ipcMain.handle(IPC.IMAGES_DELETE, async (_event, id: number) => {
    const img = queryOne<ImageRecord>('SELECT * FROM images WHERE id = ?', [id]);
    if (img) {
      try {
        if (img.file_path) fs.unlinkSync(path.join(getDataDir(), img.file_path));
        if (img.thumb_path) fs.unlinkSync(path.join(getDataDir(), img.thumb_path));
      } catch {}
      execute('DELETE FROM images WHERE id = ?', [id]);
      saveDatabase(dbPath());
    }
    return { success: true };
  });

  ipcMain.handle(IPC.IMAGES_GET_FOR_PROMPT, async (_event, promptId: number) => {
    return queryAll<ImageRecord>(
      'SELECT * FROM images WHERE prompt_id = ? ORDER BY sort_order', [promptId]
    );
  });

  ipcMain.handle(IPC.IMAGES_GET_THUMBNAIL, async (_event, imageId: number) => {
    const img = queryOne<ImageRecord>('SELECT * FROM images WHERE id = ?', [imageId]);
    if (!img || !img.thumb_path) return null;

    const thumbPath = path.join(getDataDir(), img.thumb_path);
    if (fs.existsSync(thumbPath)) {
      const data = fs.readFileSync(thumbPath);
      return 'data:image/jpeg;base64,' + data.toString('base64');
    }
    return null;
  });

  ipcMain.handle(IPC.IMAGES_SET_PRIMARY, async (_event, id: number) => {
    const img = queryOne<ImageRecord>('SELECT * FROM images WHERE id = ?', [id]);
    if (img) {
      execute('UPDATE images SET is_primary = 0 WHERE prompt_id = ?', [img.prompt_id]);
      execute('UPDATE images SET is_primary = 1 WHERE id = ?', [id]);
      saveDatabase(dbPath());
    }
    return { success: true };
  });

  ipcMain.handle(IPC.IMAGES_REORDER, async (_event, ids: number[]) => {
    for (let i = 0; i < ids.length; i++) {
      execute('UPDATE images SET sort_order = ? WHERE id = ?', [i, ids[i]]);
    }
    saveDatabase(dbPath());
    return { success: true };
  });

  ipcMain.handle(IPC.IMAGES_SCAN, async () => {
    const dataDir = getDataDir();
    const imagesDir = path.join(dataDir, 'images');
    const thumbDir = path.join(dataDir, 'thumbnails');
    ensureDirectories(dataDir);

    let cleaned = 0;
    const allImgs = queryAll<ImageRecord>('SELECT * FROM images');
    for (const img of allImgs) {
      const absPath = path.join(dataDir, img.file_path);
      if (!fs.existsSync(absPath)) {
        if (img.thumb_path) try { fs.unlinkSync(path.join(dataDir, img.thumb_path)); } catch {}
        execute('DELETE FROM images WHERE id = ?', [img.id]);
        execute('DELETE FROM prompts WHERE id = ?', [img.prompt_id]);
        cleaned++;
      }
    }
    if (cleaned > 0) saveDatabase(path.join(dataDir, 'prompts.db'));

    const allFiles: string[] = [];
    if (fs.existsSync(dataDir)) {
      for (const f of fs.readdirSync(dataDir)) {
        const ext = path.extname(f).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;
        if (f.startsWith('.')) continue;
        const base = f.slice(0, -ext.length);
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(base)) continue;
        allFiles.push(path.join(dataDir, f));
      }
    }

    const existingNames = new Set(queryAll<{ file_name: string }>('SELECT file_name FROM images').map(r => r.file_name));
    let imported = 0;

    for (const srcPath of allFiles) {
      const f = path.basename(srcPath);
      if (existingNames.has(f)) continue;

      try {
        const stats = fs.statSync(srcPath);
        const meta = extractMetadata(srcPath) || { positive: '', negative: '', model: '', sampler: '', steps: 0, cfg: 0, seed: 0, width: 0, height: 0 };
        const uuid = uuidv4();
        const storageName = uuid + path.extname(f);
        const destPath = path.join(imagesDir, storageName);

        if (path.resolve(srcPath) !== path.resolve(destPath)) fs.copyFileSync(srcPath, destPath);

        let thumbRel = '';
        try { thumbRel = generateThumbnail(destPath, thumbDir, uuid); } catch {}

        const img = nativeImage.createFromPath(destPath);
        const dims = img.isEmpty() ? { width: 0, height: 0 } : img.getSize();

        execute(
          'INSERT INTO prompts (positive, negative, model, sampler, steps, cfg, seed, width, height) VALUES (?,?,?,?,?,?,?,?,?)',
          [meta.positive, meta.negative, meta.model, meta.sampler, meta.steps, meta.cfg, meta.seed, meta.width || dims.width, meta.height || dims.height]
        );
        const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
        if (row) execute(
          'INSERT INTO images (prompt_id, file_name, file_path, thumb_path, width, height, file_size, is_primary) VALUES (?,?,?,?,?,?,?,1)',
          [row.id, f, 'images/' + storageName, thumbRel, dims.width, dims.height, stats.size]
        );
        existingNames.add(f);
        imported++;
      } catch {}
    }

    let fixedThumbs = 0;
    for (const img of queryAll<ImageRecord>('SELECT * FROM images WHERE thumb_path IS NULL OR thumb_path = ?', [''])) {
      const srcPath = path.join(dataDir, img.file_path);
      if (!fs.existsSync(srcPath)) continue;
      try {
        const uuid = path.basename(img.file_path, path.extname(img.file_path));
        const newThumb = generateThumbnail(srcPath, thumbDir, uuid);
        execute('UPDATE images SET thumb_path = ? WHERE id = ?', [newThumb, img.id]);
        fixedThumbs++;
      } catch {}
    }
    if (fixedThumbs > 0) saveDatabase(path.join(dataDir, 'prompts.db'));

    return { scanned: allFiles.length, imported, cleaned, fixedThumbs };
  });

  ipcMain.handle(IPC.IMAGES_REBUILD_THUMBS, async (_event, sizeOverride?: number) => {
    const { thumbnailsDir } = getAppPaths(getDataDir());
    const sizeRow = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['thumbnail_size']);
    const size = sizeOverride || (sizeRow ? parseInt(sizeRow.value) : 256);

    const images = queryAll<ImageRecord>('SELECT * FROM images');
    let rebuilt = 0;
    let failed = 0;
    const total = images.length;

    // Send initial progress
    for (const win of require('electron').BrowserWindow.getAllWindows()) {
      win.webContents.send('rebuild-progress', { rebuilt: 0, failed: 0, total });
    }

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try {
        const srcPath = path.join(getDataDir(), img.file_path);
        if (!fs.existsSync(srcPath)) { failed++; continue; }

        if (img.thumb_path) {
          try { fs.unlinkSync(path.join(getDataDir(), img.thumb_path)); } catch {}
        }

        const uuid = path.basename(img.file_path, path.extname(img.file_path));
        const newThumbRelPath = generateThumbnail(srcPath, thumbnailsDir, uuid, size);
        execute('UPDATE images SET thumb_path = ? WHERE id = ?', [newThumbRelPath, img.id]);
        rebuilt++;

        // Send progress every 10 images or on last one
        if (rebuilt % 10 === 0 || i === images.length - 1) {
          for (const win of require('electron').BrowserWindow.getAllWindows()) {
            win.webContents.send('rebuild-progress', { rebuilt, failed, total });
          }
        }
      } catch { failed++; }
    }

    saveDatabase(dbPath());
    return { rebuilt, failed, total: images.length, size };
  });

  ipcMain.handle(IPC.IMAGES_OPEN_FOLDER, async (_event, id: number) => {
    const img = queryOne<ImageRecord>('SELECT * FROM images WHERE id = ?', [id]);
    if (img) {
      const fullPath = path.join(getDataDir(), img.file_path);
      const { shell } = require('electron');
      shell.showItemInFolder(fullPath);
    }
    return { success: true };
  });
}
