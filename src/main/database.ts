import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';

let db: SqlJsDatabase | null = null;
let SQL: SqlJsStatic | null = null;

/**
 * Initialize the SQLite database using sql.js (WASM-based, no native build required).
 */
export async function initDatabase(userDataPath: string): Promise<SqlJsDatabase> {
  const dbPath = path.join(userDataPath, 'prompts.db');

  // Initialize sql.js with WASM
  SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL-related pragmas (sql.js runs in memory, but these help)
  db.run('PRAGMA foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  // Save initial state
  saveDatabase(dbPath);

  return db;
}

function runMigrations(database: SqlJsDatabase): void {
  // Create migrations tracking
  database.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  const migrationName = '001_initial.sql';
  const result = database.exec('SELECT id FROM _migrations WHERE name = ?', [migrationName]);

  if (result.length > 0 && result[0].values.length > 0) {
    console.log('Migration already applied:', migrationName);
    return;
  }

  // Apply schema
  database.run(`
    CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      positive TEXT NOT NULL DEFAULT '',
      negative TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      sampler TEXT NOT NULL DEFAULT '',
      steps INTEGER NOT NULL DEFAULT 0,
      cfg REAL NOT NULL DEFAULT 0.0,
      seed INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  database.run('CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at DESC)');
  database.run('CREATE INDEX IF NOT EXISTS idx_prompts_model ON prompts(model)');

  database.run(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      thumb_path TEXT DEFAULT NULL,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      file_size INTEGER NOT NULL DEFAULT 0,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  database.run('CREATE INDEX IF NOT EXISTS idx_images_prompt ON images(prompt_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_images_primary ON images(prompt_id, is_primary)');

  database.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS prompt_tags (
      prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (prompt_id, tag_id)
    );
  `);

  database.run('CREATE INDEX IF NOT EXISTS idx_pt_prompt ON prompt_tags(prompt_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_pt_tag ON prompt_tags(tag_id)');

  // Full-text search using LIKE (sql.js default build doesn't include FTS5)
  // For a single-user desktop app with thousands of records, LIKE is sufficient
  // Indexes on model and sampler columns help with filtering performance

  // Settings
  database.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  database.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('thumbnail_size', '256')");

  database.run('INSERT INTO _migrations (name) VALUES (?)', [migrationName]);
  console.log('Migration applied:', migrationName);
}

/**
 * Save database to disk.
 */
export function saveDatabase(dbPath?: string): void {
  if (!db) return;
  if (!dbPath) {
    const { getDataDir } = require('./utils/paths');
    dbPath = path.join(getDataDir(), 'prompts.db');
  }
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

/**
 * Get database instance.
 */
export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDb(): void {
  if (db) { db.close(); db = null; }
  SQL = null;
}

// Helper to convert sql.js result to array of objects
export function resultToObjects<T = Record<string, unknown>>(
  stmt: SqlJsDatabase,
  sql: string,
  params: any[] = []
): T[] {
  stmt.run(sql, params); // need to execute first for lastID etc.
  // Actually for SELECT we use exec
  return [];
}

// Wrapper for SELECT queries - uses db.exec with manual value interpolation
// (more reliable than prepare/bind across sql.js versions)
export function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: any[] = []
): T[] {
  const database = getDb();
  // Replace ? with escaped values
  let idx = 0;
  const escapedSql = sql.replace(/\?/g, () => {
    const v = params[idx++];
    return escapeSqlValue(v);
  });
  try {
    const results = database.exec(escapedSql);
    if (results.length === 0) return [];
    const { columns, values } = results[0];
    return values.map(row => {
      const obj: any = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj as T;
    });
  } catch (err: any) {
    console.error('[DB] queryAll failed:', err.message);
    console.error('[DB] SQL preview:', escapedSql.substring(0, 300));
    throw err;
  }
}

function escapeSqlValue(v: any): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v.toString();
    return v.toString();
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Wrapper for SELECT one
export function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: any[] = []
): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Wrapper for INSERT/UPDATE/DELETE
// Uses db.run() which handles parameter binding correctly
export function execute(sql: string, params: any[] = []): { changes: number; lastID: number } {
  const database = getDb();
  database.run(sql, params);

  let lastID = 0;
  if (sql.trim().toUpperCase().startsWith('INSERT')) {
    const result = database.exec('SELECT last_insert_rowid() as id');
    if (result.length > 0 && result[0].values.length > 0) {
      lastID = result[0].values[0][0] as number;
    }
  }

  return {
    changes: database.getRowsModified(),
    lastID,
  };
}
