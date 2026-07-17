import { ipcMain } from 'electron';
import { IPC } from '../../../shared/ipc-channels';
import { queryAll, queryOne } from '../../database';
import type { SearchSuggestion } from '../../../shared/types';

export function registerSearchHandlers(): void {
  ipcMain.handle(IPC.SEARCH_QUERY, async (_event, params) => {
    try {
      const page = params.page || 1;
      const pageSize = params.pageSize || 48;
      const offset = (page - 1) * pageSize;

      const conditions: string[] = [];
      const bindings: any[] = [];

      if (params.query.trim()) {
        const tokens = params.query.trim().split(/\s+/).filter((t: string) => t.length > 0);
        if (tokens.length > 0) {
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

      const fromClause = `FROM prompts p
           LEFT JOIN images i ON i.prompt_id = p.id AND i.is_primary = 1`;

      let orderClause: string;
      if (params.sort === 'updated_at') {
        orderClause = 'ORDER BY p.updated_at DESC';
      } else {
        orderClause = 'ORDER BY p.created_at DESC';
      }

      const total = queryOne<{ total: number }>(
        `SELECT COUNT(*) as total ${fromClause} ${whereClause}`, bindings
      )?.total || 0;

      const items = queryAll<any>(
        `SELECT p.*, i.thumb_path AS primary_thumb_path, i.file_path AS primary_file_path
         ${fromClause} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
        [...bindings, pageSize, offset]
      );

      const enriched = items.map((item: any) => {
        const tags = queryAll<{ id: number; name: string }>(
          `SELECT t.id, t.name FROM tags t
           JOIN prompt_tags pt ON t.id = pt.tag_id
           WHERE pt.prompt_id = ?`, [item.id]
        );
        return { ...item, tag_ids: tags.map(t => t.id), tag_names: tags.map(t => t.name) };
      });

      return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    } catch (err: any) {
      console.error('[SEARCH] error:', err.message, err.stack);
      return { items: [], total: 0, page: params.page || 1, pageSize: params.pageSize || 48, totalPages: 0 };
    }
  });

  ipcMain.handle(IPC.SEARCH_SUGGEST, async (_event, prefix: string) => {
    if (!prefix || prefix.length < 1) return [];

    const like = `${prefix}%`;
    const tags = queryAll<SearchSuggestion>(
      `SELECT 'tag' as type, name as text, id FROM tags
       WHERE name LIKE ? COLLATE NOCASE LIMIT 5`, [like]
    );

    const models = queryAll<SearchSuggestion>(
      `SELECT DISTINCT 'model' as type, model as text, NULL as id
       FROM prompts WHERE model LIKE ? COLLATE NOCASE LIMIT 5`, [like]
    );

    return [...tags, ...models];
  });
}
