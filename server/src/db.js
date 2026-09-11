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
