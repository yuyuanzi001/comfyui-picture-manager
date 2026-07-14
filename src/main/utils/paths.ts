import fs from 'fs';
import path from 'path';
import type { AppPaths } from '../../shared/types';

export function ensureDirectories(userDataPath: string): void {
  const dirs = [
    userDataPath,
    path.join(userDataPath, 'images'),
    path.join(userDataPath, 'thumbnails'),
    path.join(userDataPath, 'logs'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function getAppPaths(userDataPath: string): AppPaths {
  return {
    userData: userDataPath,
    imagesDir: path.join(userDataPath, 'images'),
    thumbnailsDir: path.join(userDataPath, 'thumbnails'),
  };
}

export function resolveImagePath(userDataPath: string, relativePath: string): string {
  return path.join(userDataPath, relativePath);
}
