import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { AppPaths } from '../../shared/types';

let _dataDir: string | null = null;

export function ensureDirectories(dataDir: string): void {
  const dirs = [dataDir, path.join(dataDir, 'images'), path.join(dataDir, 'thumbnails')];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export function getDefaultDataDir(): string {
  return app.getPath('userData');
}

export function getDataDir(): string {
  if (_dataDir) return _dataDir;
  const cfg = readConfig();
  _dataDir = cfg.dataDir || getDefaultDataDir();
  return _dataDir;
}

export function setDataDir(newDir: string): void {
  const oldDir = getDataDir();
  const newPath = path.resolve(newDir);
  if (newPath === path.resolve(oldDir)) return;

  ensureDirectories(newPath);

  // copy DB
  const oldDb = path.join(oldDir, 'prompts.db');
  const newDb = path.join(newPath, 'prompts.db');
  if (fs.existsSync(oldDb) && !fs.existsSync(newDb)) fs.copyFileSync(oldDb, newDb);

  // copy images
  const oldImg = path.join(oldDir, 'images');
  const newImg = path.join(newPath, 'images');
  if (fs.existsSync(oldImg)) {
    for (const f of fs.readdirSync(oldImg)) {
      const src = path.join(oldImg, f), dst = path.join(newImg, f);
      if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
    }
  }

  // copy thumbnails
  const oldTh = path.join(oldDir, 'thumbnails');
  const newTh = path.join(newPath, 'thumbnails');
  if (fs.existsSync(oldTh)) {
    for (const f of fs.readdirSync(oldTh)) {
      const src = path.join(oldTh, f), dst = path.join(newTh, f);
      if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
    }
  }

  writeConfig({ dataDir: newPath });
  _dataDir = newPath;
}

export function getAppPaths(dataDir?: string): AppPaths {
  const d = dataDir || getDataDir();
  return { userData: d, imagesDir: path.join(d, 'images'), thumbnailsDir: path.join(d, 'thumbnails') };
}

export function resolveImagePath(dataDir: string, relativePath: string): string {
  return path.join(dataDir, relativePath);
}

// ---- internal config (always in default appData) ----

function configPath(): string { return path.join(getDefaultDataDir(), 'config.json'); }

function readConfig(): { dataDir?: string } {
  try {
    const p = configPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {}
  return {};
}

function writeConfig(cfg: { dataDir?: string }): void {
  const def = getDefaultDataDir();
  if (!fs.existsSync(def)) fs.mkdirSync(def, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}
