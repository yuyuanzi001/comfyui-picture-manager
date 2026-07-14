import { ipcMain, dialog, app, BrowserWindow, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { IPC } from '../../shared/ipc-channels';
import { getAppPaths, getDataDir, setDataDir, ensureDirectories } from '../utils/paths';
import { queryAll, queryOne, execute, getDb, saveDatabase } from '../database';
import { generateThumbnail, getImageDimensions } from '../utils/thumbnail';
import { extractMetadata } from '../utils/png-metadata';
import { v4 as uuidv4 } from 'uuid';
import type { Prompt, Tag, ImageRecord, PromptListItem, ExtractedMetadata } from '../../shared/types';

function dbPath(): string {
  return path.join(getDataDir(), 'prompts.db');
}

export function registerAllHandlers(): void {
  // ---- App ----
  ipcMain.handle(IPC.APP_GET_PATHS, () => {
    return getAppPaths(getDataDir());
  });

  // Settings
  ipcMain.handle(IPC.APP_GET_SETTING, (_event, key: string) => {
    const row = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value ?? null;
  });

  ipcMain.handle(IPC.APP_SET_SETTING, (_event, key: string, value: string) => {
    execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    saveDatabase(dbPath());

    // Apply theme to Electron's native theme
    if (key === 'theme') {
      const { nativeTheme } = require('electron');
      if (value === 'dark') {
        nativeTheme.themeSource = 'dark';
      } else if (value === 'light') {
        nativeTheme.themeSource = 'light';
      } else {
        nativeTheme.themeSource = 'system';
      }
    }

    return { success: true };
  });

  // Data dir management
  ipcMain.handle(IPC.APP_GET_DATA_DIR, () => getDataDir());
  ipcMain.handle(IPC.APP_OPEN_PATH, (_event, p: string) => {
    const { shell } = require('electron');
    shell.openPath(p); return { success: true };
  });
  ipcMain.handle(IPC.APP_SET_DATA_DIR, async (_event, dir: string) => {
    const { initDatabase: reInitDb, closeDb: doClose } = require('../database');
    setDataDir(dir);
    doClose();
    const newDir = getDataDir();
    await reInitDb(newDir);
    saveDatabase(path.join(newDir, 'prompts.db'));

    // Restart file watcher on new location
    const { ensureDirectories } = require('../utils/paths');
    ensureDirectories(newDir);
    const { ipcMain: ipc } = require('electron');
    // Notify all windows to reload
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('files-changed');
    }
    return { success: true };
  });

  // ---- Dialog ----
  ipcMain.handle(IPC.DIALOG_OPEN_IMAGES, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(IPC.DIALOG_OPEN_DIR, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ---- Prompts ----
  ipcMain.handle(IPC.PROMPTS_LIST, async (_event, opts) => {
    const page = opts.page || 1;
    const pageSize = opts.pageSize || 48;
    const offset = (page - 1) * pageSize;
    const sort = opts.sort || 'created_at';
    const order = opts.order || 'desc';

    let where = '';
    const params: any[] = [];

    if (opts.tagIds && opts.tagIds.length > 0) {
      const placeholders = opts.tagIds.map(() => '?').join(',');
      where = `WHERE p.id IN (
        SELECT pt.prompt_id FROM prompt_tags pt
        WHERE pt.tag_id IN (${placeholders})
        GROUP BY pt.prompt_id
        HAVING COUNT(DISTINCT pt.tag_id) = ?
      )`;
      params.push(...opts.tagIds, opts.tagIds.length);
    }

    // Validate sort column to prevent SQL injection
    const validSorts = ['created_at', 'updated_at', 'model', 'steps'];
    const safeSort = validSorts.includes(sort) ? sort : 'created_at';
    const safeOrder = order === 'asc' ? 'ASC' : 'DESC';

    const countRow = queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM prompts p ${where}`, params
    );
    const total = countRow?.total || 0;

    const items = queryAll<any>(
      `SELECT p.*,
        i.thumb_path AS primary_thumb_path,
        i.file_path AS primary_file_path
      FROM prompts p
      LEFT JOIN images i ON i.prompt_id = p.id AND i.is_primary = 1
      ${where}
      ORDER BY p.${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // Enrich with tags
    const enriched = items.map((item: any) => {
      const tags = queryAll<{ id: number; name: string }>(
        `SELECT t.id, t.name FROM tags t
         JOIN prompt_tags pt ON t.id = pt.tag_id
         WHERE pt.prompt_id = ?`,
        [item.id]
      );
      return {
        ...item,
        tag_ids: tags.map(t => t.id),
        tag_names: tags.map(t => t.name),
      };
    });

    return {
      items: enriched,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });

  ipcMain.handle(IPC.PROMPTS_GET, async (_event, id: number) => {
    const prompt = queryOne<Prompt>('SELECT * FROM prompts WHERE id = ?', [id]);
    if (!prompt) throw new Error('Prompt not found');

    const images = queryAll<ImageRecord>(
      'SELECT * FROM images WHERE prompt_id = ? ORDER BY sort_order', [id]
    );
    const tags = queryAll<Tag>(
      `SELECT t.* FROM tags t
       JOIN prompt_tags pt ON t.id = pt.tag_id
       WHERE pt.prompt_id = ?`, [id]
    );

    return { ...prompt, images, tags };
  });

  ipcMain.handle(IPC.PROMPTS_CREATE, async (_event, dto) => {
    const db = getDb();

    execute(
      `INSERT INTO prompts (positive, negative, model, sampler, steps, cfg, seed, width, height, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dto.positive, dto.negative, dto.model, dto.sampler, dto.steps, dto.cfg, dto.seed, dto.width, dto.height, dto.notes || '']
    );

    // Get the last inserted ID
    const lastRow = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
    const promptId = lastRow?.id || 0;

    // Handle tags
    if (dto.tagIds && dto.tagIds.length > 0 && promptId) {
      for (const tagId of dto.tagIds) {
        execute('INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)', [promptId, tagId]);
      }
    }

    // Handle image import
    if (dto.imagePaths && dto.imagePaths.length > 0 && promptId) {
      const { imagesDir, thumbnailsDir } = getAppPaths(getDataDir());
      for (let i = 0; i < dto.imagePaths.length; i++) {
        try {
          const srcPath = dto.imagePaths[i];
          const uuid = uuidv4();
          const ext = path.extname(srcPath).toLowerCase();
          const fileName = `${uuid}${ext}`;
          const destPath = path.join(imagesDir, fileName);

          // Copy image
          fs.copyFileSync(srcPath, destPath);

          // Get dimensions
          const dims = getImageDimensions(destPath);
          const stats = fs.statSync(destPath);

          // Generate thumbnail
          let thumbRelPath: string | null = null;
          try {
            thumbRelPath = generateThumbnail(destPath, thumbnailsDir, uuid);
          } catch (e) {
            console.error('Thumbnail generation failed:', e);
          }

          execute(
            `INSERT INTO images (prompt_id, file_name, file_path, thumb_path, width, height, file_size, is_primary, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [promptId, path.basename(srcPath), `images/${fileName}`, thumbRelPath, dims.width, dims.height, stats.size, i === 0 ? 1 : 0, i]
          );
        } catch (err: any) {
          console.error('Image import error:', err);
        }
      }
    }

    saveDatabase(dbPath());

    // Return the created prompt
    return queryOne('SELECT * FROM prompts WHERE id = ?', [promptId]);
  });

  ipcMain.handle(IPC.PROMPTS_UPDATE, async (_event, id, dto) => {
    const fields: string[] = [];
    const values: any[] = [];

    const updatableFields = ['positive', 'negative', 'model', 'sampler', 'steps', 'cfg', 'seed', 'width', 'height', 'notes'];
    for (const field of updatableFields) {
      if (dto[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(dto[field]);
      }
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now', 'localtime')");
      execute(`UPDATE prompts SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
      saveDatabase(dbPath());
    }

    return queryOne('SELECT * FROM prompts WHERE id = ?', [id]);
  });

  ipcMain.handle(IPC.PROMPTS_DELETE, async (_event, id: number) => {
    // Get images to clean up files
    const images = queryAll<ImageRecord>('SELECT * FROM images WHERE prompt_id = ?', [id]);
    for (const img of images) {
      try {
        if (img.file_path) fs.unlinkSync(path.join(getDataDir(), img.file_path));
        if (img.thumb_path) fs.unlinkSync(path.join(getDataDir(), img.thumb_path));
      } catch {}
    }

    execute('DELETE FROM prompts WHERE id = ?', [id]);
    saveDatabase(dbPath());
    return { success: true };
  });

  ipcMain.handle(IPC.PROMPTS_BATCH_DELETE, async (_event, ids: number[]) => {
    for (const id of ids) {
      const images = queryAll<ImageRecord>('SELECT * FROM images WHERE prompt_id = ?', [id]);
      for (const img of images) {
        try {
          if (img.file_path) fs.unlinkSync(path.join(getDataDir(), img.file_path));
          if (img.thumb_path) fs.unlinkSync(path.join(getDataDir(), img.thumb_path));
        } catch {}
      }
      execute('DELETE FROM prompts WHERE id = ?', [id]);
    }
    saveDatabase(dbPath());
    return { success: true };
  });

  // ---- Tags ----
  ipcMain.handle(IPC.TAGS_ALL, async () => {
    return queryAll<Tag>(
      `SELECT t.*, COUNT(pt.prompt_id) as prompt_count
       FROM tags t
       LEFT JOIN prompt_tags pt ON t.id = pt.tag_id
       GROUP BY t.id
       ORDER BY prompt_count DESC`
    );
  });

  ipcMain.handle(IPC.TAGS_CREATE, async (_event, name: string) => {
    execute('INSERT OR IGNORE INTO tags (name) VALUES (?)', [name]);
    saveDatabase(dbPath());
    return queryOne<Tag>('SELECT * FROM tags WHERE name = ?', [name]);
  });

  ipcMain.handle(IPC.TAGS_DELETE, async (_event, id: number) => {
    execute('DELETE FROM tags WHERE id = ?', [id]);
    saveDatabase(dbPath());
    return { success: true };
  });

  ipcMain.handle(IPC.TAGS_GET_FOR_PROMPT, async (_event, promptId: number) => {
    return queryAll<Tag>(
      `SELECT t.* FROM tags t
       JOIN prompt_tags pt ON t.id = pt.tag_id
       WHERE pt.prompt_id = ?`, [promptId]
    );
  });

  ipcMain.handle(IPC.TAGS_SET_FOR_PROMPT, async (_event, promptId: number, tagIds: number[]) => {
    execute('DELETE FROM prompt_tags WHERE prompt_id = ?', [promptId]);
    for (const tagId of tagIds) {
      execute('INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)', [promptId, tagId]);
    }
    saveDatabase(dbPath());
    return { success: true };
  });

  // ---- Images ----
  ipcMain.handle(IPC.IMAGES_IMPORT, async (_event, req) => {
    const { filePaths, autoExtract } = req;
    const { imagesDir, thumbnailsDir } = getAppPaths(getDataDir());
    const errors: Array<{ fileName: string; error: string }> = [];
    let importedCount = 0;

    console.log(`[IMPORT] Starting import of ${filePaths.length} files`);
    console.log(`[IMPORT] Images dir: ${imagesDir}`);
    console.log(`[IMPORT] Thumbs dir: ${thumbnailsDir}`);

    for (const srcPath of filePaths) {
      const baseName = path.basename(srcPath);
      console.log(`[IMPORT] Processing: ${baseName}`);

      try {
        // Verify source file exists
        if (!fs.existsSync(srcPath)) {
          throw new Error(`源文件不存在: ${srcPath}`);
        }

        const uuid = uuidv4();
        const ext = path.extname(srcPath).toLowerCase() || '.png';
        const storageName = `${uuid}${ext}`;
        const destPath = path.join(imagesDir, storageName);

        // Step 1: Copy image to storage
        console.log(`[IMPORT] Copying to: ${destPath}`);
        fs.copyFileSync(srcPath, destPath);
        console.log(`[IMPORT] Copied successfully`);

        // Step 2: Extract metadata from the copied file
        let metadata: any = {};
        if (autoExtract !== false) {
          try {
            console.log(`[IMPORT] Extracting metadata...`);
            const extracted = extractMetadata(destPath);
            if (extracted) {
              metadata = extracted;
              console.log(`[IMPORT] Metadata extracted: model=${metadata.model}, steps=${metadata.steps}, seed=${metadata.seed}`);
            } else {
              console.log(`[IMPORT] No metadata found in file`);
            }
          } catch (extractErr: any) {
            console.log(`[IMPORT] Metadata extraction failed:`, extractErr.message);
          }
        }

        // Step 3: Get image dimensions and file size
        const dims = getImageDimensions(destPath);
        const stats = fs.statSync(destPath);
        console.log(`[IMPORT] Dimensions: ${dims.width}x${dims.height}, size: ${stats.size}`);

        // Step 4: Generate thumbnail (respect size setting)
        let thumbRelPath: string | null = null;
        try {
          const sizeRow = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['thumbnail_size']);
          const thumbSize = sizeRow ? parseInt(sizeRow.value) : 256;
          thumbRelPath = generateThumbnail(destPath, thumbnailsDir, uuid, thumbSize);
          console.log(`[IMPORT] Thumbnail generated (${thumbSize}px): ${thumbRelPath}`);
        } catch (thumbErr: any) {
          console.error(`[IMPORT] Thumbnail generation failed:`, thumbErr.message);
        }

        // Step 5: Insert prompt record
        console.log(`[IMPORT] Inserting prompt into DB...`);
        execute(
          `INSERT INTO prompts (positive, negative, model, sampler, steps, cfg, seed, width, height)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            metadata.positive || '',
            metadata.negative || '',
            metadata.model || '',
            metadata.sampler || '',
            metadata.steps || 0,
            metadata.cfg || 0,
            metadata.seed || 0,
            metadata.width || dims.width,
            metadata.height || dims.height,
          ]
        );

        // Get the prompt ID
        const lastRow = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
        const promptId = lastRow?.id || 0;
        console.log(`[IMPORT] Prompt inserted with id: ${promptId}`);

        if (!promptId) {
          throw new Error('Failed to get prompt ID after insert');
        }

        // Step 6: Insert image record
        execute(
          `INSERT INTO images (prompt_id, file_name, file_path, thumb_path, width, height, file_size, is_primary)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [promptId, baseName, `images/${storageName}`, thumbRelPath || '', dims.width, dims.height, stats.size]
        );
        console.log(`[IMPORT] Image record inserted`);

        importedCount++;
        console.log(`[IMPORT] ✅ Successfully imported: ${baseName}`);
      } catch (err: any) {
        const errorMsg = err.message || 'Unknown error';
        console.error(`[IMPORT] ❌ Failed to import ${baseName}:`, errorMsg);
        errors.push({ fileName: baseName, error: errorMsg });
      }
    }

    // Save database to disk
    console.log(`[IMPORT] Saving database. Imported: ${importedCount}, Errors: ${errors.length}`);
    try {
      saveDatabase(dbPath());
      console.log(`[IMPORT] Database saved successfully`);
    } catch (saveErr: any) {
      console.error(`[IMPORT] Failed to save database:`, saveErr.message);
    }

    return { importedCount, errors };
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
      return `data:image/jpeg;base64,${data.toString('base64')}`;
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

  // Rebuild all thumbnails
  // Refresh: clean orphans + scan for new images
  ipcMain.handle(IPC.IMAGES_SCAN, async () => {
    const dataDir = getDataDir();
    const imagesDir = path.join(dataDir, 'images');
    const thumbDir = path.join(dataDir, 'thumbnails');
    ensureDirectories(dataDir);
    console.log('[REFRESH] dataDir:', dataDir);

    let cleaned = 0;
    // Step 1: remove orphan records (image file gone)
    const allImgs = queryAll<ImageRecord>('SELECT * FROM images');
    for (const img of allImgs) {
      const absPath = path.join(dataDir, img.file_path);
      if (!fs.existsSync(absPath)) {
        // Delete orphan: clean thumbnail, DB records (prompt cascade)
        if (img.thumb_path) try { fs.unlinkSync(path.join(dataDir, img.thumb_path)); } catch {}
        execute('DELETE FROM images WHERE id = ?', [img.id]);
        execute('DELETE FROM prompts WHERE id = ?', [img.prompt_id]);
        cleaned++;
      }
    }
    if (cleaned > 0) saveDatabase(path.join(dataDir, 'prompts.db'));

    // Step 2: scan dataDir root for new images
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

    // Dedup by filename
    const existingNames = new Set(queryAll<{ file_name: string }>('SELECT file_name FROM images').map(r => r.file_name));
    let imported = 0;

    for (const srcPath of allFiles) {
      const f = path.basename(srcPath);
      if (existingNames.has(f)) continue;

      try {
        const stats = fs.statSync(srcPath);
        const meta = extractMetadata(srcPath) || { positive: '', negative: '', model: '', sampler: '', steps: 0, cfg: 0, seed: 0, width: 0, height: 0 };
        const uuid = uuidv4();
        const storageName = `${uuid}${path.extname(f)}`;
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
          [row.id, f, `images/${storageName}`, thumbRel, dims.width, dims.height, stats.size]
        );
        saveDatabase(path.join(dataDir, 'prompts.db'));
        existingNames.add(f);
        imported++;
      } catch (err: any) { console.error('[REFRESH]', f, err.message); }
    }

    // Also fix: regenerate thumbnails for images missing them
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

    console.log('[REFRESH] done scanned:', allFiles.length, 'imported:', imported, 'cleaned:', cleaned, 'fixedThumbs:', fixedThumbs);
    return { scanned: allFiles.length, imported, cleaned, fixedThumbs };
  });

  ipcMain.handle(IPC.IMAGES_REBUILD_THUMBS, async (_event, sizeOverride?: number) => {
    const { thumbnailsDir } = getAppPaths(getDataDir());
    const sizeRow = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['thumbnail_size']);
    const size = sizeOverride || (sizeRow ? parseInt(sizeRow.value) : 256);

    const images = queryAll<ImageRecord>('SELECT * FROM images');
    let rebuilt = 0;
    let failed = 0;

    console.log(`[REBUILD] Rebuilding ${images.length} thumbnails at ${size}px`);

    for (const img of images) {
      try {
        const srcPath = path.join(getDataDir(), img.file_path);
        if (!fs.existsSync(srcPath)) {
          console.log(`[REBUILD] Source missing: ${srcPath}`);
          failed++;
          continue;
        }

        // Delete old thumbnail if exists
        if (img.thumb_path) {
          const oldPath = path.join(getDataDir(), img.thumb_path);
          try { fs.unlinkSync(oldPath); } catch {}
        }

        // Generate new thumbnail
        const uuid = path.basename(img.file_path, path.extname(img.file_path));
        const newThumbRelPath = generateThumbnail(srcPath, thumbnailsDir, uuid, size);

        // Update DB
        execute('UPDATE images SET thumb_path = ? WHERE id = ?', [newThumbRelPath, img.id]);
        rebuilt++;
      } catch (err: any) {
        console.error(`[REBUILD] Failed for image ${img.id}:`, err.message);
        failed++;
      }
    }

    saveDatabase(dbPath());
    console.log(`[REBUILD] Done: ${rebuilt} rebuilt, ${failed} failed`);
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

  // ---- Search ----
  ipcMain.handle(IPC.SEARCH_QUERY, async (_event, params) => {
    console.log('[SEARCH] params:', JSON.stringify({ query: params.query, tagIds: params.tagIds, page: params.page, sort: params.sort }));
    try {
    const page = params.page || 1;
    const pageSize = params.pageSize || 48;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const bindings: any[] = [];

    if (params.query.trim()) {
      const tokens = params.query.trim().split(/\s+/).filter((t: string) => t.length > 0);
      if (tokens.length > 0) {
        // Use LIKE-based search (sql.js doesn't include FTS5 by default)
        const likeConditions = tokens.map(() =>
          '(p.positive LIKE ? OR p.negative LIKE ? OR p.model LIKE ? OR p.sampler LIKE ? OR p.notes LIKE ?)'
        ).join(' AND ');
        conditions.push(`(${likeConditions})`);
        for (const token of tokens) {
          const likeStr = `%${token}%`;
          bindings.push(likeStr, likeStr, likeStr, likeStr, likeStr);
        }
      }
    }

    if (params.tagIds && params.tagIds.length > 0) {
      const placeholders = params.tagIds.map(() => '?').join(',');
      conditions.push(`p.id IN (
        SELECT pt.prompt_id FROM prompt_tags pt
        WHERE pt.tag_id IN (${placeholders})
        GROUP BY pt.prompt_id
        HAVING COUNT(DISTINCT pt.tag_id) = ?
      )`);
      bindings.push(...params.tagIds, params.tagIds.length);
    }

    if (params.model) {
      conditions.push('p.model = ?');
      bindings.push(params.model);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    console.log('[SEARCH] whereClause:', whereClause, 'bindings count:', bindings.length);

    const hasSearchQuery = params.query.trim().length > 0;
    const selectClause = `SELECT p.*, i.thumb_path AS primary_thumb_path, i.file_path AS primary_file_path`;

    const fromClause = `FROM prompts p
         LEFT JOIN images i ON i.prompt_id = p.id AND i.is_primary = 1`;

    let orderClause: string;
    if (hasSearchQuery && params.sort === 'relevance') {
      orderClause = 'ORDER BY rank';
    } else if (params.sort === 'updated_at') {
      orderClause = 'ORDER BY p.updated_at DESC';
    } else {
      orderClause = 'ORDER BY p.created_at DESC';
    }

    const countRow = queryOne<{ total: number }>(
      `SELECT COUNT(*) as total ${fromClause} ${whereClause}`, bindings
    );
    const total = countRow?.total || 0;

    const items = queryAll<any>(
      `${selectClause} ${fromClause} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
      [...bindings, pageSize, offset]
    );

    const enriched = items.map((item: any) => {
      const tags = queryAll<{ id: number; name: string }>(
        `SELECT t.id, t.name FROM tags t
         JOIN prompt_tags pt ON t.id = pt.tag_id
         WHERE pt.prompt_id = ?`, [item.id]
      );
      return {
        ...item,
        tag_ids: tags.map(t => t.id),
        tag_names: tags.map(t => t.name),
      };
    });

    console.log('[SEARCH] returning', total, 'results');
    return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    } catch (err: any) {
      console.error('[SEARCH] error:', err.message, err.stack);
      return { items: [], total: 0, page: params.page || 1, pageSize: params.pageSize || 48, totalPages: 0 };
    }
  });

  ipcMain.handle(IPC.SEARCH_SUGGEST, async (_event, prefix: string) => {
    if (!prefix || prefix.length < 1) return [];

    const like = `${prefix}%`;
    const tags = queryAll<{ type: string; text: string; id: number }>(
      `SELECT 'tag' as type, name as text, id FROM tags
       WHERE name LIKE ? COLLATE NOCASE LIMIT 5`, [like]
    );

    const models = queryAll<{ type: string; text: string; id: null }>(
      `SELECT DISTINCT 'model' as type, model as text, NULL as id
       FROM prompts WHERE model LIKE ? COLLATE NOCASE LIMIT 5`, [like]
    );

    return [...tags, ...models];
  });
}
