import crypto from 'node:crypto';
import { db, now } from './db.js';
import { getModel } from './catalog.js';
import { getProvider } from './providers/index.js';

/*
 * Job progression.
 *
 * This used to be a `setInterval` worker draining a queue. A serverless
 * runtime does not run code between requests, so that loop would simply never
 * fire — jobs would sit at QUEUED forever.
 *
 * Instead a job advances one step inside the request that asks about it. The
 * client already polls every 1.5s while a generation is running, so the poll
 * *is* the tick. No cron, no queue service, and progress is driven by exactly
 * the person waiting for it.
 *
 * See shared/decisions.md 013.
 */

/* Guards against two overlapping polls advancing the same job twice. */
const inFlight = new Set();

function parseParams(row) {
  try {
    return JSON.parse(row.params);
  } catch {
    return {};
  }
}

async function fail(job, message) {
  await db.run(
    `UPDATE generations SET status='FAILED', error=?, completed_at=? WHERE id=?`,
    String(message).slice(0, 1000),
    now(),
    job.id
  );
  // A failed generation produced nothing, so the credits go back.
  if (job.credits_cost) {
    await db.batch([
      {
        sql: 'UPDATE users SET credits = credits + ? WHERE id = ?',
        args: [job.credits_cost, job.user_id],
      },
      {
        sql: 'INSERT INTO credit_ledger (id, user_id, delta, reason, generation, created_at) VALUES (?,?,?,?,?,?)',
        args: [crypto.randomUUID(), job.user_id, job.credits_cost, 'refund:generation_failed', job.id, now()],
      },
    ]);
  }
}

/*
 * Advances one generation by a single step. Safe to call on a finished job —
 * it returns immediately — so callers do not need to check first.
 */
export async function advance(id) {
  if (inFlight.has(id)) return;
  inFlight.add(id);

  try {
    const row = await db.get('SELECT * FROM generations WHERE id = ?', id);
    if (!row) return;
    if (row.status === 'COMPLETED' || row.status === 'FAILED') return;

    const job = { ...row, params: parseParams(row) };
    const model = getModel(job.model);

    if (!model) {
      await fail(job, `Model "${job.model}" is no longer available.`);
      return;
    }

    const provider = getProvider(job.provider);

    try {
      if (row.status === 'QUEUED') {
        await db.run(
          `UPDATE generations SET status='PROCESSING', started_at=COALESCE(started_at, ?) WHERE id=?`,
          now(),
          job.id
        );
      }

      // Long-running providers need a start call before the first poll.
      if (!job.provider_job && provider.isLongRunning?.(job)) {
        const { providerJobId } = await provider.start(job, model);
        await db.run('UPDATE generations SET provider_job=? WHERE id=?', providerJobId, job.id);
        job.provider_job = providerJobId;
      }

      const result = await provider.run(job, model);

      // Still working: leave it PROCESSING for the next poll to pick up.
      if (result.status === 'PROCESSING') return;

      await db.run(
        `UPDATE generations
            SET status='COMPLETED', output_url=?, thumbnail_url=?, simulated=?, completed_at=?, error=NULL
          WHERE id=?`,
        result.outputUrl,
        result.thumbnailUrl ?? null,
        (result.simulated ?? provider.id === 'simulator') ? 1 : 0,
        now(),
        job.id
      );
    } catch (err) {
      if (err?.retryable) {
        // Transient. Record why, stay PROCESSING, let the next poll retry.
        await db.run(
          `UPDATE generations SET error=? WHERE id=?`,
          `Retrying: ${err.message}`.slice(0, 1000),
          job.id
        );
        return;
      }
      await fail(job, err?.message || 'Generation failed.');
    }
  } finally {
    inFlight.delete(id);
  }
}

/*
 * Advances every unfinished job for one user. Used by the list endpoint so a
 * generation started in another tab still progresses while you are looking at
 * the library.
 */
export async function advanceForUser(userId, limit = 4) {
  const rows = await db.all(
    `SELECT id FROM generations
      WHERE user_id = ? AND status IN ('QUEUED','PROCESSING')
      ORDER BY created_at ASC LIMIT ?`,
    userId,
    limit
  );
  await Promise.allSettled(rows.map(row => advance(row.id)));
}
