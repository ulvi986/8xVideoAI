import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'app.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  handle        TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  credits       INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generations (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  prompt         TEXT NOT NULL,
  model          TEXT NOT NULL,
  provider       TEXT NOT NULL,
  status         TEXT NOT NULL,
  params         TEXT NOT NULL DEFAULT '{}',
  credits_cost   INTEGER NOT NULL DEFAULT 0,
  simulated      INTEGER NOT NULL DEFAULT 0,
  provider_job   TEXT,
  output_url     TEXT,
  thumbnail_url  TEXT,
  error          TEXT,
  created_at     TEXT NOT NULL,
  started_at     TEXT,
  completed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_generations_user ON generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  generation  TEXT,
  created_at  TEXT NOT NULL
);
`);

/*
 * Migrations. The database already exists in dev, so new columns are added
 * in place rather than by recreating the table. Each step is guarded by
 * PRAGMA table_info so a second boot is a no-op.
 */
function addColumnIfMissing(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (existing.some(c => c.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

export function migrate() {
  const applied = [];

  // Community: a generation can be published to a shared feed.
  if (addColumnIfMissing('generations', 'published', 'INTEGER NOT NULL DEFAULT 0')) {
    applied.push('generations.published');
  }
  if (addColumnIfMissing('generations', 'published_at', 'TEXT')) {
    applied.push('generations.published_at');
  }
  if (addColumnIfMissing('generations', 'title', 'TEXT')) {
    applied.push('generations.title');
  }
  // Prompt enhancement keeps the original, so the rewrite is never silent.
  if (addColumnIfMissing('generations', 'original_prompt', 'TEXT')) {
    applied.push('generations.original_prompt');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
      user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at    TEXT NOT NULL,
      PRIMARY KEY (generation_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_likes_generation ON likes(generation_id);
    CREATE INDEX IF NOT EXISTS idx_generations_published
      ON generations(published, published_at DESC);
  `);

  return applied;
}

export const now = () => new Date().toISOString();

/*
 * node:sqlite has no `.transaction()` helper (that is better-sqlite3's API),
 * so wrap explicitly. Used where a partial write would corrupt the credit
 * balance - deduct and enqueue must both happen or neither.
 */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/*
 * Anything left mid-flight by a crash or restart goes back on the queue.
 * Credits were already deducted when the job was created, so re-queueing
 * does not double-charge.
 */
export function requeueOrphanedJobs() {
  const result = db
    .prepare(`UPDATE generations SET status = 'QUEUED', started_at = NULL WHERE status = 'PROCESSING'`)
    .run();
  return result.changes;
}
