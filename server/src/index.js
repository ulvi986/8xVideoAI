import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { config, hasGemini } from './config.js';
import { db, now, transaction, requeueOrphanedJobs } from './db.js';
import {
  attachUser, requireUser, hashPassword, verifyPassword,
  issueSession, revokeSession, publicUser,
} from './auth.js';
import { listModels, getModel, PLANS, VOICES, ASPECT_RATIOS, CREDIT_COST } from './catalog.js';
import { startWorker } from './jobs.js';

fs.mkdirSync(config.storageDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

const app = express();
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '25mb' }));
app.use(attachUser);

/* Generated media. Long cache: a generation's output never changes. */
app.use('/files', express.static(config.storageDir, {
  maxAge: '1y',
  setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
}));

const fail = (res, status, code, message, extra = {}) =>
  res.status(status).json({ error: { code, message, ...extra } });

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// ---------------------------------------------------------------- health

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    providers: {
      gemini: hasGemini() ? 'configured' : 'missing GEMINI_API_KEY',
      simulator: config.allowSimulator ? 'enabled' : 'disabled',
    },
    time: now(),
  });
});

// ------------------------------------------------------------------ auth

function handleFromEmail(email) {
  const base = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || 'creator';
  let handle = base;
  let n = 0;
  while (db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle)) {
    handle = `${base}${++n + 1000}`;
  }
  return handle;
}

app.post('/api/auth/signup', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || '').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail(res, 400, 'INVALID_EMAIL', 'Enter a valid email address.');
  }
  if (password.length < 8) {
    return fail(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters.');
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return fail(res, 409, 'EMAIL_TAKEN', 'An account with that email already exists.');
  }

  const { hash, salt } = hashPassword(password);
  const id = crypto.randomUUID();
  const handle = handleFromEmail(email);

  db.prepare(
    `INSERT INTO users (id, email, handle, display_name, password_hash, password_salt, plan, credits, created_at)
     VALUES (?,?,?,?,?,?,'free',?,?)`
  ).run(id, email, handle, displayName || handle, hash, salt, config.startingCredits, now());

  db.prepare('INSERT INTO credit_ledger (id, user_id, delta, reason, generation, created_at) VALUES (?,?,?,?,NULL,?)')
    .run(crypto.randomUUID(), id, config.startingCredits, 'signup:welcome_credits', now());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const { token } = issueSession(id);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Same response for unknown email and wrong password: no account enumeration.
  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  const { token } = issueSession(user.id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/auth/logout', requireUser, (req, res) => {
  revokeSession(req.token);
  res.json({ ok: true });
});

app.get('/api/me', requireUser, (req, res) => {
  const stats = db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS completed
     FROM generations WHERE user_id = ?`
  ).get(req.user.id);

  res.json({
    user: publicUser(req.user),
    stats: { total: stats.total || 0, completed: stats.completed || 0 },
  });
});

// --------------------------------------------------------------- catalog

app.get('/api/catalog', (req, res) => {
  res.json({
    models: listModels(req.query.kind),
    voices: VOICES,
    aspectRatios: ASPECT_RATIOS,
    costs: CREDIT_COST,
    plans: PLANS,
    providerStatus: {
      gemini: hasGemini(),
      simulator: config.allowSimulator,
    },
  });
});

// ----------------------------------------------------------- generations

function serialise(row) {
  let params = {};
  try { params = JSON.parse(row.params); } catch { /* ignore */ }
  // imageBase64 can be megabytes; never send it back to the client.
  delete params.imageBase64;

  return {
    id: row.id,
    kind: row.kind,
    prompt: row.prompt,
    model: row.model,
    provider: row.provider,
    status: row.status,
    params,
    creditsCost: row.credits_cost,
    simulated: Boolean(row.simulated),
    outputUrl: row.output_url,
    thumbnailUrl: row.thumbnail_url,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

app.post('/api/generations', requireUser, (req, res) => {
  const kind = String(req.body?.kind || '');
  const prompt = String(req.body?.prompt || '').trim();
  const modelId = String(req.body?.model || '');

  if (!['video', 'image', 'audio'].includes(kind)) {
    return fail(res, 400, 'INVALID_KIND', 'kind must be video, image or audio.');
  }
  if (prompt.length < 2) {
    return fail(res, 400, 'PROMPT_REQUIRED', 'Describe what you want to generate.');
  }
  if (prompt.length > 2000) {
    return fail(res, 400, 'PROMPT_TOO_LONG', 'Prompt must be under 2000 characters.');
  }

  const model = getModel(modelId);
  if (!model || model.kind !== kind) {
    return fail(res, 400, 'INVALID_MODEL', 'Choose a model that supports this generation type.');
  }

  const available = listModels(kind).find(m => m.id === modelId);
  if (!available?.available) {
    return fail(res, 503, 'MODEL_UNAVAILABLE', available?.reason || 'That model is not available.');
  }

  const cost = model.cost;
  if (req.user.credits < cost) {
    return fail(res, 402, 'INSUFFICIENT_CREDITS', `This costs ${cost} credits and you have ${req.user.credits}.`, {
      required: cost,
      balance: req.user.credits,
    });
  }

  const params = {
    aspectRatio: req.body?.aspectRatio || '16:9',
    duration: req.body?.duration,
    voice: req.body?.voice,
    negativePrompt: req.body?.negativePrompt,
    imageBase64: req.body?.imageBase64,
    imageMimeType: req.body?.imageMimeType,
  };

  const id = crypto.randomUUID();

  // Deduct and insert together: a crash between the two would either
  // charge for nothing or generate for free.
  transaction(() => {
    db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(cost, req.user.id);
    db.prepare(
      `INSERT INTO generations (id, user_id, kind, prompt, model, provider, status, params, credits_cost, created_at)
       VALUES (?,?,?,?,?,?,'QUEUED',?,?,?)`
    ).run(id, req.user.id, kind, prompt, model.id, model.provider, JSON.stringify(params), cost, now());
    db.prepare('INSERT INTO credit_ledger (id, user_id, delta, reason, generation, created_at) VALUES (?,?,?,?,?,?)')
      .run(crypto.randomUUID(), req.user.id, -cost, `spend:${kind}`, id, now());
  });

  const row = db.prepare('SELECT * FROM generations WHERE id = ?').get(id);
  const balance = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.user.id).credits;
  res.status(202).json({ generation: serialise(row), credits: balance });
});

app.get('/api/generations', requireUser, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const kind = req.query.kind;

  const rows = kind
    ? db.prepare('SELECT * FROM generations WHERE user_id=? AND kind=? ORDER BY created_at DESC LIMIT ?')
        .all(req.user.id, kind, limit)
    : db.prepare('SELECT * FROM generations WHERE user_id=? ORDER BY created_at DESC LIMIT ?')
        .all(req.user.id, limit);

  res.json({ generations: rows.map(serialise) });
});

app.get('/api/generations/:id', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM generations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return fail(res, 404, 'NOT_FOUND', 'No such generation.');
  res.json({ generation: serialise(row), credits: req.user.credits });
});

app.delete('/api/generations/:id', requireUser, (req, res) => {
  const row = db.prepare('SELECT * FROM generations WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return fail(res, 404, 'NOT_FOUND', 'No such generation.');

  for (const url of [row.output_url, row.thumbnail_url]) {
    if (!url) continue;
    const file = path.join(config.storageDir, path.basename(url));
    fs.rm(file, { force: true }, () => {});
  }
  db.prepare('DELETE FROM generations WHERE id=?').run(row.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- errors

app.use((_req, res) => fail(res, 404, 'NOT_FOUND', 'No such endpoint.'));

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  fail(res, 500, 'INTERNAL', 'Something went wrong on the server.');
});

// ----------------------------------------------------------------- boot

const requeued = requeueOrphanedJobs();
if (requeued) console.log(`[boot] re-queued ${requeued} job(s) interrupted by a restart`);

startWorker();

app.listen(config.port, () => {
  console.log(`\n  8xBuildAI API  →  http://localhost:${config.port}`);
  console.log(`  gemini         →  ${hasGemini() ? 'configured' : 'NOT configured (local simulator only)'}`);
  console.log(`  simulator      →  ${config.allowSimulator ? 'enabled' : 'disabled'}`);
  if (!config.sessionSecretProvided) {
    console.log('  note           →  SESSION_SECRET not set; sessions reset on restart\n');
  } else {
    console.log('');
  }
});
