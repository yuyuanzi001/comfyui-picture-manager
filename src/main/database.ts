import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { MIGRATIONS, type Migration } from './migrations';

let db: SqlJsDatabase | null = null;
let SQL: SqlJsStatic | null = null;

export async function initDatabase(userDataPath: string): Promise<SqlJsDatabase> {
  const dbPath = path.join(userDataPath, 'prompts.db');
  SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  saveDatabase(dbPath);
  return db;
}

function runMigrations(database: SqlJsDatabase): void {
  database.run("CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))");
  for (const migration of MIGRATIONS) {
    applyMigration(database, migration);
  }
}

function applyMigration(database: SqlJsDatabase, migration: Migration): void {
  const escaped = migration.name.replace(/'/g, "''");
  const result = database.exec("SELECT id FROM _migrations WHERE name = '" + escaped + "'");
  if (result.length > 0 && result[0].values.length > 0) {
    console.log('[DB] Migration already applied:', migration.name);
    return;
  }
  console.log('[DB] Applying migration:', migration.name);
  database.exec(migration.sql);
  database.run('INSERT INTO _migrations (name) VALUES (?)', [migration.name]);
  console.log('[DB] Migration applied:', migration.name);
}

export function saveDatabase(dbPath?: string): void {
  if (!db) return;
  if (!dbPath) {
    const { getDataDir } = require('./utils/paths');
    dbPath = path.join(getDataDir(), 'prompts.db');
  }
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function closeDb(): void {
  if (db) { db.close(); db = null; }
  SQL = null;
}

export function queryAll<T = Record<string, unknown>>(sql: string, params: any[] = []): T[] {
  const database = getDb();
  try {
    const stmt = database.prepare(sql);
    if (params.length > 0) { stmt.bind(params); }
    const results: T[] = [];
    while (stmt.step()) { results.push(stmt.getAsObject() as unknown as T); }
    stmt.free();
    return results;
  } catch (err: any) {
    console.error('[DB] queryAll failed:', err.message);
    console.error('[DB] SQL:', sql.substring(0, 300));
    throw err;
  }
}

export function queryOne<T = Record<string, unknown>>(sql: string, params: any[] = []): T | null {
  const rows = queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

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
  return { changes: database.getRowsModified(), lastID };
}
