import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { IPC } from '../../../shared/ipc-channels';
import { getAppPaths, getDataDir } from '../../utils/paths';
import { queryAll, queryOne, execute, saveDatabase } from '../../database';
import { generateThumbnail, getImageDimensions } from '../../utils/thumbnail';
import { extractMetadata } from '../../utils/png-metadata';
import { v4 as uuidv4 } from 'uuid';
import type { Prompt, Tag, ImageRecord, PromptListItem } from '../../../shared/types';

function dbPath(): string {
  return path.join(getDataDir(), 'prompts.db');
}

export function registerPromptHandlers(): void {
  ipcMain.handle(IPC.PROMPTS_LIST, async (_event, opts) => {
    const page = opts.page || 1;
    const pageSize = opts.pageSize || 48;
    const offset = (page - 1) * pageSize;
    const sort = opts.sort || 'created_at';
    const order = opts.order || 'desc';

    const validSorts = ['created_at', 'updated_at', 'model', 'steps'];
    const safeSort = validSorts.includes(sort) ? sort : 'created_at';
    const safeOrder = order === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: any[] = [];

    if (opts.tagIds && opts.tagIds.length > 0) {
      const placeholders = opts.tagIds.map(() => '?').join(',');
      conditions.push(`p.id IN (
        SELECT pt.prompt_id FROM prompt_tags pt
        WHERE pt.tag_id IN (${placeholders})
        GROUP BY pt.prompt_id
        HAVING COUNT(DISTINCT pt.tag_id) = ?
      )`);
      params.push(...opts.tagIds, opts.tagIds.length);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM prompts p ${where}`, params
    )?.total || 0;

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

    return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
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
    execute(
      `INSERT INTO prompts (positive, negative, model, sampler, steps, cfg, seed, width, height, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dto.positive, dto.negative, dto.model, dto.sampler, dto.steps, dto.cfg, dto.seed, dto.width, dto.height, dto.notes || '']
    );

    const lastRow = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
    const promptId = lastRow?.id || 0;

    if (dto.tagIds && dto.tagIds.length > 0 && promptId) {
      for (const tagId of dto.tagIds) {
        execute('INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)', [promptId, tagId]);
      }
    }

    if (dto.imagePaths && dto.imagePaths.length > 0 && promptId) {
      const { imagesDir, thumbnailsDir } = getAppPaths(getDataDir());
      for (let i = 0; i < dto.imagePaths.length; i++) {
        try {
          const srcPath = dto.imagePaths[i];
          const uuid = uuidv4();
          const ext = path.extname(srcPath).toLowerCase();
          const fileName = `${uuid}${ext}`;
          const destPath = path.join(imagesDir, fileName);

          fs.copyFileSync(srcPath, destPath);

          const dims = getImageDimensions(destPath);
          const stats = fs.statSync(destPath);

          let thumbRelPath: string | null = null;
          try { thumbRelPath = generateThumbnail(destPath, thumbnailsDir, uuid); } catch {}

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
}
