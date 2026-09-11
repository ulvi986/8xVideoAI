import crypto from 'node:crypto';
import { db, now } from './db.js';
import { config } from './config.js';
import { getModel } from './catalog.js';
import { getProvider } from './providers/index.js';

/*
 * In-process job worker (DECISION 007).
 *
 * One loop drains QUEUED rows up to `jobConcurrency` at a time. Long-running
 * providers (video on Gemini) are started once and then polled; single-call
 * providers do all their work in run().
 *
 * State lives in SQLite, so a restart resumes rather than losing jobs.
 */

const running = new Set();
let timer = null;

function rowToJob(row) {
  let params = {};
  try { params = JSON.parse(row.params); } catch { /* stored bad JSON; treat as empty */ }
  return { ...row, params };
}

function fail(id, message) {
  db.prepare(`UPDATE generations SET status='FAILED', error=?, completed_at=? WHERE id=?`)
    .run(String(message).slice(0, 1000), now(), id);
}

function complete(id, { outputUrl, thumbnailUrl, simulated }) {
  db.prepare(
    `UPDATE generations
       SET status='COMPLETED', output_url=?, thumbnail_url=?, simulated=?, completed_at=?, error=NULL
     WHERE id=?`
  ).run(outputUrl, thumbnailUrl ?? null, simulated ? 1 : 0, now(), id);
}

/*
 * Credits are deducted up front so a user cannot queue more than they can
 * afford. A failed generation refunds them - the user got nothing.
 */
function refund(job) {
  if (!job.credits_cost) return;
  db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(job.credits_cost, job.user_id);
  db.prepare('INSERT INTO credit_ledger (id, user_id, delta, reason, generation, created_at) VALUES (?,?,?,?,?,?)')
    .run(crypto.randomUUID(), job.user_id, job.credits_cost, 'refund:generation_failed', job.id, now());
}

async function processJob(row) {
  const job = rowToJob(row);
  const model = getModel(job.model);

  if (!model) {
    fail(job.id, `Model "${job.model}" is no longer available.`);
    refund(job);
    return;
  }

  const provider = getProvider(job.provider);

  try {
    db.prepare(`UPDATE generations SET status='PROCESSING', started_at=COALESCE(started_at, ?) WHERE id=?`)
      .run(now(), job.id);

    // Long-running providers need a start call before the first poll.
    if (!job.provider_job && provider.isLongRunning?.(job)) {
      const { providerJobId } = await provider.start(job, model);
      db.prepare('UPDATE generations SET provider_job=? WHERE id=?').run(providerJobId, job.id);
      job.provider_job = providerJobId;
    }

    const result = await provider.run(job, model);

    if (result.status === 'PROCESSING') {
      // Not finished: drop back to QUEUED so the next tick polls it again.
      db.prepare(`UPDATE generations SET status='QUEUED' WHERE id=?`).run(job.id);
      return;
    }

    complete(job.id, {
      outputUrl: result.outputUrl,
      thumbnailUrl: result.thumbnailUrl,
      simulated: result.simulated ?? provider.id === 'simulator',
    });
  } catch (err) {
    if (err?.retryable) {
      // Transient: leave it queued, try again next tick.
      db.prepare(`UPDATE generations SET status='QUEUED', error=? WHERE id=?`)
        .run(`Retrying: ${err.message}`.slice(0, 1000), job.id);
      return;
    }
    fail(job.id, err?.message || 'Generation failed.');
    refund(job);
  }
}

function tick() {
  const free = config.jobConcurrency - running.size;
  if (free <= 0) return;

  const rows = db
    .prepare(`SELECT * FROM generations WHERE status='QUEUED' ORDER BY created_at ASC LIMIT ?`)
    .all(free)
    .filter(row => !running.has(row.id));

  for (const row of rows) {
    running.add(row.id);
    processJob(row)
      .catch(err => fail(row.id, err?.message || 'Worker error.'))
      .finally(() => running.delete(row.id));
  }
}

export function startWorker() {
  if (timer) return;
  timer = setInterval(tick, 1000);
  timer.unref?.();
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
