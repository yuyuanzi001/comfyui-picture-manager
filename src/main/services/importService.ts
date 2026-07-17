import path from 'path';
import fs from 'fs';
import { nativeImage } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, saveDatabase } from '../database';
import { extractMetadata } from '../utils/png-metadata';
import { generateThumbnail } from '../utils/thumbnail';
import type { ExtractedMetadata } from '../../shared/types';

export const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

const noMeta: ExtractedMetadata = {
  positive: '', negative: '', model: '', sampler: '',
  steps: 0, cfg: 0, seed: 0, width: 0, height: 0,
};

/**
 * Import a single image file into the managed storage.
 * Copies the file, extracts metadata, generates thumbnail, inserts into DB.
 * Returns true if successfully imported.
 */
export function importOneFile(srcPath: string, dataDir: string): boolean {
  const ext = path.extname(srcPath).toLowerCase();
  if (!IMG_EXT.includes(ext)) return false;

  const base = path.basename(srcPath);

  // Dedup by original filename
  const existing = queryAll<{ id: number }>(
    'SELECT id FROM images WHERE file_name = ?', [base]
  );
  if (existing.length > 0) return false;

  const imagesDir = path.join(dataDir, 'images');

  try {
    const stats = fs.statSync(srcPath);
    const meta = extractMetadata(srcPath) || noMeta;
    const uuid = uuidv4();
    const storageName = uuid + ext;
    const destPath = path.join(imagesDir, storageName);

    if (path.resolve(srcPath) !== path.resolve(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }

    let thumbRel = '';
    try {
      thumbRel = generateThumbnail(destPath, path.join(dataDir, 'thumbnails'), uuid);
    } catch {}

    const img = nativeImage.createFromPath(destPath);
    const dims = img.isEmpty() ? { width: 0, height: 0 } : img.getSize();

    execute(
      'INSERT INTO prompts (positive, negative, model, sampler, steps, cfg, seed, width, height) VALUES (?,?,?,?,?,?,?,?,?)',
      [meta.positive, meta.negative, meta.model, meta.sampler, meta.steps, meta.cfg, meta.seed, meta.width || dims.width, meta.height || dims.height]
    );
    const row = queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
    if (row) {
      execute(
        'INSERT INTO images (prompt_id, file_name, file_path, thumb_path, width, height, file_size, is_primary) VALUES (?,?,?,?,?,?,?,1)',
        [row.id, path.basename(srcPath), 'images/' + storageName, thumbRel, dims.width, dims.height, stats.size]
      );
    }
    saveDatabase(path.join(dataDir, 'prompts.db'));
    return true;
  } catch (err: any) {
    console.error('[IMPORT]', path.basename(srcPath), err.message);
    return false;
  }
}

/** Check if a filename is a UUID-based storage name (to skip re-importing managed copies). */
export function isUuidFilename(name: string): boolean {
  const dotIdx = name.lastIndexOf('.');
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(base);
}

/**
 * Scan a directory for new image files and import them.
 * Used by startup scan and the refresh IPC handler.
 */
export function scanAndImport(dir: string, dataDir: string): { scanned: number; imported: number } {
  const files: string[] = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const ext = path.extname(f).toLowerCase();
      if (!IMG_EXT.includes(ext)) continue;
      if (f.startsWith('.')) continue;
      if (isUuidFilename(f)) continue;
      files.push(path.join(dir, f));
    }
  }

  let imported = 0;
  for (const fullPath of files) {
    if (importOneFile(fullPath, dataDir)) imported++;
  }
  return { scanned: files.length, imported };
}
