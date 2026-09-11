import fs from 'node:fs';
import path from 'node:path';

import { config } from './config.js';

/*
 * Data layer.
 *
 * Was `node:sqlite` (synchronous, one file on local disk). A serverless
 * runtime has no durable disk, so this now speaks libSQL — the same SQLite
 * dialect over HTTP. That choice matters: the SQL, the `?` placeholders and
 * even `PRAGMA table_info` in the migrations all carry over unchanged, so the
 * only real change is that every call is now async.
 *
 * Locally it still opens a plain file, so development needs no network and no
 * account. See shared/decisions.md 013.
 */

function databaseUrl() {
  if (config.databaseUrl) return config.databaseUrl;
  // Local: a file beside the code, created on demand.
  fs.mkdirSync(config.dataDir, { recursive: true });
  return `file:${path.join(config.dataDir, 'app.db').replace(/\\/g, '/')}`;
}

const url = databaseUrl();

/*
 * Two builds of the same client.
 *
 * The default export loads a native binary, which is fine locally but is
 * platform-specific — a bundle built on one OS carries the wrong binary for
 * the serverless host. `@libsql/client/web` is pure JavaScript and speaks the
 * remote protocol only, which is all production needs. The native build is
 * loaded solely for the local `file:` database.
 */
const remote = /^(libsql|https?|wss?):/.test(url);
const { createClient } = remote
  ? await import('@libsql/client/web')
  : await import('@libsql/client');

export const client = createClient({
  url,
  authToken: config.databaseAuthToken || undefined,
});

/*
 * A thin wrapper that keeps call sites readable. `db.get(sql, ...args)` rather
 * than the driver's `execute({ sql, args })` object form.
 */
export const db = {
  async get(sql, ...args) {
    const result = await client.execute({ sql, args });
    return result.rows[0] ?? null;
  },
  async all(sql, ...args) {
    const result = await client.execute({ sql, args });
    return result.rows;
  },
  async run(sql, ...args) {
    return client.execute({ sql, args });
  },
  async exec(sql) {
    return client.executeMultiple(sql);
  },
  /*
   * Atomic multi-statement write. Used where a partial write would corrupt the
   * credit balance — deduct and enqueue must both happen or neither.
   */
  async batch(statements) {
    return client.batch(statements, 'write');
  },
};

export const now = () => new Date().toISOString();

const SCHEMA = `
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

CREATE TABLE IF NOT EXISTS likes (
  generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (generation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_generation ON likes(generation_id);
`;
/*
 * The index on `published` is created after the migrations below, not here:
 * on a fresh database that column does not exist until the ALTER runs, and
 * indexing a missing column fails the whole schema step.
 */

async function addColumnIfMissing(table, column, definition) {
  const existing = await db.all(`PRAGMA table_info(${table})`);
  if (existing.some(c => c.name === column)) return false;
  await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

/*
 * Runs once per cold start. Cheap and idempotent: CREATE TABLE IF NOT EXISTS
 * plus guarded ALTERs. In a serverless runtime there is no boot step to hang
 * migrations off, so readiness is established lazily and memoised below.
 */
let ready = null;

export function ensureReady() {
  if (!ready) {
    ready = (async () => {
      await db.exec(SCHEMA);

      await addColumnIfMissing('generations', 'published', 'INTEGER NOT NULL DEFAULT 0');
      await addColumnIfMissing('generations', 'published_at', 'TEXT');
      await addColumnIfMissing('generations', 'title', 'TEXT');
      await addColumnIfMissing('generations', 'original_prompt', 'TEXT');

      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_generations_published
          ON generations(published, published_at DESC);
      `);
    })().catch(err => {
      // Let the next request retry rather than caching a failed migration.
      ready = null;
      throw err;
    });
  }
  return ready;
}

/*
 * Anything left mid-flight by a crash goes back on the queue. Credits were
 * already deducted when the job was created, so re-queueing does not
 * double-charge.
 */
export async function requeueOrphanedJobs() {
  const result = await db.run(
    `UPDATE generations SET status = 'QUEUED', started_at = NULL WHERE status = 'PROCESSING'`
  );
  return result.rowsAffected ?? 0;
}
