export interface Migration {
  name: string;
  sql: string;
}

const M001 = `
-- ComfyUI Picture Manager - Initial Schema
-- sql.js WASM does not include FTS5; search uses LIKE with indexed columns.

CREATE TABLE IF NOT EXISTS prompts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    positive   TEXT NOT NULL DEFAULT '',
    negative   TEXT NOT NULL DEFAULT '',
    model      TEXT NOT NULL DEFAULT '',
    sampler    TEXT NOT NULL DEFAULT '',
    steps      INTEGER NOT NULL DEFAULT 0,
    cfg        REAL NOT NULL DEFAULT 0.0,
    seed       INTEGER NOT NULL DEFAULT 0,
    width      INTEGER NOT NULL DEFAULT 0,
    height     INTEGER NOT NULL DEFAULT 0,
    notes      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_model ON prompts(model);
CREATE INDEX IF NOT EXISTS idx_prompts_sampler ON prompts(sampler);

CREATE TABLE IF NOT EXISTS images (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_id  INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    file_name  TEXT NOT NULL,
    file_path  TEXT NOT NULL,
    thumb_path TEXT DEFAULT NULL,
    width      INTEGER NOT NULL DEFAULT 0,
    height     INTEGER NOT NULL DEFAULT 0,
    file_size  INTEGER NOT NULL DEFAULT 0,
    is_primary INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_images_prompt ON images(prompt_id);
CREATE INDEX IF NOT EXISTS idx_images_primary ON images(prompt_id, is_primary);

CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS prompt_tags (
    prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (prompt_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_pt_prompt ON prompt_tags(prompt_id);
CREATE INDEX IF NOT EXISTS idx_pt_tag ON prompt_tags(tag_id);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('thumbnail_size', '256');
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');
`;

export const MIGRATIONS: Migration[] = [
  { name: '001_initial', sql: M001 },
];
