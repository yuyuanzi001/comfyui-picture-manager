-- ComfyUI Prompt Manager - Initial Database Schema
-- Migration 001

-- ============================================
-- Prompts table: core prompt metadata
-- ============================================
CREATE TABLE prompts (
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
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_prompts_created ON prompts(created_at DESC);
CREATE INDEX idx_prompts_model ON prompts(model);

-- ============================================
-- Images table: associated images for each prompt
-- ============================================
CREATE TABLE images (
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
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_images_prompt ON images(prompt_id);
CREATE INDEX idx_images_primary ON images(prompt_id, is_primary);

-- ============================================
-- Tags: shared vocabulary
-- ============================================
CREATE TABLE tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE INDEX idx_tags_name ON tags(name COLLATE NOCASE);

-- ============================================
-- prompt_tags: many-to-many junction
-- ============================================
CREATE TABLE prompt_tags (
    prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (prompt_id, tag_id)
);

CREATE INDEX idx_pt_prompt ON prompt_tags(prompt_id);
CREATE INDEX idx_pt_tag ON prompt_tags(tag_id);

-- ============================================
-- FTS5 Full-Text Search
-- ============================================
CREATE VIRTUAL TABLE prompts_fts USING fts5(
    positive,
    negative,
    model,
    sampler,
    notes,
    content='prompts',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER prompts_ai AFTER INSERT ON prompts BEGIN
    INSERT INTO prompts_fts(rowid, positive, negative, model, sampler, notes)
    VALUES (new.id, new.positive, new.negative, new.model, new.sampler, new.notes);
END;

CREATE TRIGGER prompts_ad AFTER DELETE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, positive, negative, model, sampler, notes)
    VALUES ('delete', old.id, old.positive, old.negative, old.model, old.sampler, old.notes);
END;

CREATE TRIGGER prompts_au AFTER UPDATE ON prompts BEGIN
    INSERT INTO prompts_fts(prompts_fts, rowid, positive, negative, model, sampler, notes)
    VALUES ('delete', old.id, old.positive, old.negative, old.model, old.sampler, old.notes);
    INSERT INTO prompts_fts(rowid, positive, negative, model, sampler, notes)
    VALUES (new.id, new.positive, new.negative, new.model, new.sampler, new.notes);
END;

-- ============================================
-- Settings
-- ============================================
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Default settings
INSERT INTO settings (key, value) VALUES ('thumbnail_size', '256');
INSERT INTO settings (key, value) VALUES ('theme', 'system');
