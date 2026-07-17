import { ipcMain, dialog, BrowserWindow, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { IPC } from '../../../shared/ipc-channels';
import { getAppPaths, getDataDir, setDataDir, ensureDirectories } from '../../utils/paths';
import { queryOne, execute, getDb, saveDatabase } from '../../database';

function dbPath(): string {
  return path.join(getDataDir(), 'prompts.db');
}

export function registerAppHandlers(): void {
  ipcMain.handle(IPC.APP_GET_PATHS, () => {
    return getAppPaths(getDataDir());
  });

  ipcMain.handle(IPC.APP_GET_SETTING, (_event, key: string) => {
    const row = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row?.value ?? null;
  });

  ipcMain.handle(IPC.APP_SET_SETTING, (_event, key: string, value: string) => {
    execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    saveDatabase(dbPath());

    if (key === 'theme') {
      if (value === 'dark') nativeTheme.themeSource = 'dark';
      else if (value === 'light') nativeTheme.themeSource = 'light';
      else nativeTheme.themeSource = 'system';
    }

    return { success: true };
  });

  ipcMain.handle(IPC.APP_GET_DATA_DIR, () => getDataDir());

  ipcMain.handle(IPC.APP_OPEN_PATH, (_event, p: string) => {
    const { shell } = require('electron');
    shell.openPath(p);
    return { success: true };
  });

  ipcMain.handle(IPC.APP_SET_DATA_DIR, async (_event, dir: string) => {
    const { initDatabase: reInitDb, closeDb: doClose } = require('../../database');
    setDataDir(dir);
    doClose();
    const newDir = getDataDir();
    await reInitDb(newDir);
    saveDatabase(path.join(newDir, 'prompts.db'));

    ensureDirectories(newDir);
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('files-changed');
    }
    return { success: true };
  });

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

  // Export data: copy database + images + thumbnails to a chosen folder
  ipcMain.handle(IPC.APP_EXPORT_DATA, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select export destination',
    });
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, message: 'Cancelled' };
    }

    const destDir = path.join(result.filePaths[0], 'comfyui-picture-manager-export');
    const srcDir = getDataDir();

    try {
      fs.mkdirSync(destDir, { recursive: true });
      const dbSrc = path.join(srcDir, 'prompts.db');
      if (fs.existsSync(dbSrc)) fs.copyFileSync(dbSrc, path.join(destDir, 'prompts.db'));

      for (const sub of ['images', 'thumbnails']) {
        const srcSub = path.join(srcDir, sub);
        if (!fs.existsSync(srcSub)) continue;
        fs.mkdirSync(path.join(destDir, sub), { recursive: true });
        for (const file of fs.readdirSync(srcSub)) {
          const srcFile = path.join(srcSub, file);
          if (fs.statSync(srcFile).isFile()) {
            fs.copyFileSync(srcFile, path.join(destDir, sub, file));
          }
        }
      }

      let imageCount = 0;
      const destImages = path.join(destDir, 'images');
      if (fs.existsSync(destImages)) imageCount = fs.readdirSync(destImages).length;

      return { success: true, message: 'Exported to ' + destDir, count: imageCount };
    } catch (err: any) {
      return { success: false, message: err.message || 'Export failed' };
    }
  });
}
