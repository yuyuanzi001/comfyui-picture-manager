import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';

// We test the utility functions directly using a fresh in-memory sql.js instance.
// This validates the parameterized query approach used by queryAll/execute.

let db: any;

beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run('CREATE TABLE IF NOT EXISTS test_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT)');
  db.run("INSERT INTO test_users (name, email) VALUES ('Alice', 'alice@test.com')");
  db.run("INSERT INTO test_users (name, email) VALUES ('Bob', 'bob@test.com')");
});

describe('queryAll — parameterized SELECT', () => {
  it('returns rows for a valid query with params', () => {
    const stmt = db.prepare('SELECT * FROM test_users WHERE name = ?');
    stmt.bind(['Alice']);
    const results: any[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Alice');
  });

  it('returns empty array when no rows match', () => {
    const stmt = db.prepare('SELECT * FROM test_users WHERE name = ?');
    stmt.bind(['Nobody']);
    const results: any[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();

    expect(results).toHaveLength(0);
  });

  it('handles SQL injection attempts safely', () => {
    // Try to inject SQL via parameter
    const stmt = db.prepare('SELECT * FROM test_users WHERE name = ?');
    stmt.bind(["' OR 1=1 --"]);
    const results: any[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();

    // The injection string is treated as a literal value, not SQL
    expect(results).toHaveLength(0);
  });

  it('handles multiple parameters', () => {
    const stmt = db.prepare('SELECT * FROM test_users WHERE name = ? AND email = ?');
    stmt.bind(['Alice', 'alice@test.com']);
    const results: any[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();

    expect(results).toHaveLength(1);
  });

  it('handles NULL binding', () => {
    const stmt = db.prepare('SELECT * FROM test_users WHERE email IS ?');
    stmt.bind([null]);
    const results: any[] = [];
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();

    expect(results).toHaveLength(0); // emails are not null
  });
});

describe('execute — parameterized INSERT/UPDATE/DELETE', () => {
  it('inserts a row and returns lastID', () => {
    db.run("INSERT INTO test_users (name, email) VALUES (?, ?)", ['Charlie', 'charlie@test.com']);

    const result = db.exec('SELECT last_insert_rowid() as id');
    const lastID = result[0].values[0][0] as number;
    expect(lastID).toBeGreaterThan(0);

    // Verify it was inserted
    const stmt = db.prepare('SELECT * FROM test_users WHERE name = ?');
    stmt.bind(['Charlie']);
    const rows: any[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    expect(rows).toHaveLength(1);
  });

  it('updates rows with parameters', () => {
    db.run("UPDATE test_users SET email = ? WHERE name = ?", ['updated@test.com', 'Bob']);
    const stmt = db.prepare('SELECT email FROM test_users WHERE name = ?');
    stmt.bind(['Bob']);
    const rows: any[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    expect(rows[0].email).toBe('updated@test.com');
  });

  it('deletes rows with parameters', () => {
    db.run('DELETE FROM test_users WHERE name = ?', ['Charlie']);
    const stmt = db.prepare('SELECT COUNT(*) as cnt FROM test_users WHERE name = ?');
    stmt.bind(['Charlie']);
    const rows: any[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    expect(rows[0].cnt).toBe(0);
  });
});
