import { ipcMain } from 'electron';
import path from 'path';
import { IPC } from '../../../shared/ipc-channels';
import { getDataDir } from '../../utils/paths';
import { queryAll, queryOne, execute, saveDatabase } from '../../database';
import type { Tag } from '../../../shared/types';

function dbPath(): string {
  return path.join(getDataDir(), 'prompts.db');
}

export function registerTagHandlers(): void {
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
}
