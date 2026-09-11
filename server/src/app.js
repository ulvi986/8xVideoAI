import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';

import { config, hasGemini } from './config.js';
import { db, now, ensureReady } from './db.js';
import { usingBlob, remove as removeMedia } from './storage.js';
import {
  attachUser, requireUser, hashPassword, verifyPassword,
  issueSession, revokeSession, publicUser,
} from './auth.js';
import { listModels, getModel, PLANS, VOICES, ASPECT_RATIOS, CREDIT_COST } from './catalog.js';
import { advance, advanceForUser, timeoutFor } from './jobs.js';
import { enhancePrompt, hasAzure, AzureError } from './azure.js';

/*
 * The Express app, with no server attached.
 *
 * Exported rather than listened on, because it has two entry points: a local
 * one that calls listen(), and a serverless one that hands each request to
 * the app directly. See src/index.js and api/index.js.
 */
export const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: same-origin, curl, or a health check. Allow it.
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      // Vercel preview deployments get a generated subdomain per branch.
      if (config.allowVercelPreviews && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      /*
       * Refuse by omitting the CORS headers, not by throwing. Throwing here
       * reaches the error handler and answers 500, which reads as "the server
       * is broken" when the request was simply from an origin we do not serve.
       */
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '25mb' }));

/*
 * Schema readiness is lazy. There is no boot hook in a serverless runtime, so
 * the first request through establishes it; the promise is memoised, so this
 * costs one round trip per cold start rather than one per request.
 */
app.use((req, res, next) => {
  ensureReady().then(() => next(), next);
});

app.use(attachUser);

/*
 * Local media only. With Blob configured, files are served from the blob
 * store's own domain and this never runs.
 */
if (!usingBlob()) {
  fs.mkdirSync(config.storageDir, { recursive: true });
  app.use('/files', express.static(config.storageDir, {
    maxAge: '1y',
    setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
  }));
}

const fail = (res, status, code, message, extra = {}) =>
  res.status(status).json({ error: { code, message, ...extra } });

const route = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// ---------------------------------------------------------------- health

app.get('/api/health', route(async (_req, res) => {
  res.json({
    ok: true,
    providers: {
      gemini: hasGemini() ? 'configured' : 'missing GEMINI_API_KEY',
      simulator: config.allowSimulator ? 'enabled' : 'disabled',
      enhancer: hasAzure() ? 'configured' : 'missing Azure settings',
    },
    storage: usingBlob() ? 'blob' : 'local disk',
    database: config.databaseUrl ? 'libsql (remote)' : 'libsql (local file)',
    time: now(),
  });
}));

// ------------------------------------------------------------------ auth

async function handleFromEmail(email) {
  const base = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || 'creator';
  let handle = base;
  let n = 0;
  while (await db.get('SELECT 1 FROM users WHERE handle = ?', handle)) {
    handle = `${base}${++n + 1000}`;
  }
  return handle;
}

app.post('/api/auth/signup', route(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || '').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail(res, 400, 'INVALID_EMAIL', 'Enter a valid email address.');
  }
  if (password.length < 8) {
    return fail(res, 400, 'WEAK_PASSWORD', 'Password must be at least 8 characters.');
  }
  if (await db.get('SELECT 1 FROM users WHERE email = ?', email)) {
    return fail(res, 409, 'EMAIL_TAKEN', 'An account with that email already exists.');
  }

  const { hash, salt } = hashPassword(password);
  const id = crypto.randomUUID();
  const handle = await handleFromEmail(email);

  await db.batch([
    {
      sql: `INSERT INTO users (id, email, handle, display_name, password_hash, password_salt, plan, credits, created_at)
            VALUES (?,?,?,?,?,?,'free',?,?)`,
      args: [id, email, handle, displayName || handle, hash, salt, config.startingCredits, now()],
    },
    {
      sql: 'INSERT INTO credit_ledger (id, user_id, delta, reason, generation, created_at) VALUES (?,?,?,?,NULL,?)',
      args: [crypto.randomUUID(), id, config.startingCredits, 'signup:welcome_credits', now()],
    },
  ]);

  const user = await db.get('SELECT * FROM users WHERE id = ?', id);
  const { token } = await issueSession(id);
  res.status(201).json({ token, user: publicUser(user) });
}));

app.post('/api/auth/login', route(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const user = await db.get('SELECT * FROM users WHERE email = ?', email);
  // Same response for unknown email and wrong password: no account enumeration.
  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  const { token } = await issueSession(user.id);
  res.json({ token, user: publicUser(user) });
}));

app.post('/api/auth/logout', requireUser, route(async (req, res) => {
  await revokeSession(req.token);
  res.json({ ok: true });
}));

app.get('/api/me', requireUser, route(async (req, res) => {
  const stats = await db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS completed
       FROM generations WHERE user_id = ?`,
    req.user.id
  );

  res.json({
    user: publicUser(req.user),
    stats: { total: Number(stats?.total ?? 0), completed: Number(stats?.completed ?? 0) },
  });
}));

// --------------------------------------------------------------- catalog

app.get('/api/catalog', route(async (req, res) => {
  res.json({
    models: listModels(req.query.kind),
    voices: VOICES,
    aspectRatios: ASPECT_RATIOS,
    costs: CREDIT_COST,
    // Seconds a generation may run before it is abandoned and refunded.
    timeouts: {
      video: timeoutFor('video'),
      image: timeoutFor('image'),
      audio: timeoutFor('audio'),
    },
    plans: PLANS,
    providerStatus: {
      gemini: hasGemini(),
      simulator: config.allowSimulator,
      enhancer: hasAzure(),
    },
  });
}));

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
    creditsCost: Number(row.credits_cost),
    simulated: Boolean(row.simulated),
    outputUrl: row.output_url,
    thumbnailUrl: row.thumbnail_url,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    published: Boolean(row.published),
    publishedAt: row.published_at ?? null,
    title: row.title ?? null,
    originalPrompt: row.original_prompt ?? null,
  };
}

app.post('/api/generations', requireUser, route(async (req, res) => {
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

  // Present only when the prompt was rewritten, so the original is kept
  // alongside it rather than being thrown away.
  const rawOriginal = String(req.body?.originalPrompt || '').trim();
  const originalPrompt = rawOriginal && rawOriginal !== prompt ? rawOriginal.slice(0, 2000) : null;

  const id = crypto.randomUUID();

  // Deduct and insert atomically: a partial write would either charge for
  // nothing or generate for free.
  await db.batch([
    {
      sql: 'UPDATE users SET credits = credits - ? WHERE id = ?',
      args: [cost, req.user.id],
    },
    {
      sql: `INSERT INTO generations (id, user_id, kind, prompt, model, provider, status, params, credits_cost, created_at, original_prompt)
            VALUES (?,?,?,?,?,?,'QUEUED',?,?,?,?)`,
      args: [id, req.user.id, kind, prompt, model.id, model.provider, JSON.stringify(params), cost, now(), originalPrompt],
    },
    {
      sql: 'INSERT INTO credit_ledger (id, user_id, delta, reason, generation, created_at) VALUES (?,?,?,?,?,?)',
      args: [crypto.randomUUID(), req.user.id, -cost, `spend:${kind}`, id, now()],
    },
  ]);

  const row = await db.get('SELECT * FROM generations WHERE id = ?', id);
  const balance = (await db.get('SELECT credits FROM users WHERE id = ?', req.user.id)).credits;

  /*
   * Kick the job off without blocking the response. The client gets its id
   * immediately and starts polling; each poll advances it further.
   */
  advance(id).catch(() => {});

  res.status(202).json({ generation: serialise(row), credits: Number(balance) });
}));

app.get('/api/generations', requireUser, route(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const kind = req.query.kind;

  // Move anything unfinished along before reporting state.
  await advanceForUser(req.user.id);

  const rows = kind
    ? await db.all(
        'SELECT * FROM generations WHERE user_id=? AND kind=? ORDER BY created_at DESC LIMIT ?',
        req.user.id, kind, limit
      )
    : await db.all(
        'SELECT * FROM generations WHERE user_id=? ORDER BY created_at DESC LIMIT ?',
        req.user.id, limit
      );

  res.json({ generations: rows.map(serialise) });
}));

app.get('/api/generations/:id', requireUser, route(async (req, res) => {
  /*
   * The poll is the tick. There is no background worker in a serverless
   * runtime, so the request that asks "is it done yet" is what moves it on.
   */
  await advance(req.params.id);

  const row = await db.get('SELECT * FROM generations WHERE id=? AND user_id=?', req.params.id, req.user.id);
  if (!row) return fail(res, 404, 'NOT_FOUND', 'No such generation.');

  const balance = (await db.get('SELECT credits FROM users WHERE id = ?', req.user.id)).credits;
  res.json({ generation: serialise(row), credits: Number(balance) });
}));

app.delete('/api/generations/:id', requireUser, route(async (req, res) => {
  const row = await db.get('SELECT * FROM generations WHERE id=? AND user_id=?', req.params.id, req.user.id);
  if (!row) return fail(res, 404, 'NOT_FOUND', 'No such generation.');

  await Promise.all([removeMedia(row.output_url), removeMedia(row.thumbnail_url)]);
  await db.run('DELETE FROM generations WHERE id=?', row.id);
  res.json({ ok: true });
}));

// ------------------------------------------------------ prompt rewriting

app.post('/api/enhance', requireUser, route(async (req, res) => {
  const kind = String(req.body?.kind || '');
  const prompt = String(req.body?.prompt || '').trim();

  if (!['video', 'image', 'audio'].includes(kind)) {
    return fail(res, 400, 'INVALID_KIND', 'kind must be video, image or audio.');
  }
  if (prompt.length < 2) {
    return fail(res, 400, 'PROMPT_REQUIRED', 'Write something to rewrite first.');
  }
  if (prompt.length > 2000) {
    return fail(res, 400, 'PROMPT_TOO_LONG', 'Prompt must be under 2000 characters.');
  }
  if (!hasAzure()) {
    return fail(res, 503, 'ENHANCE_UNAVAILABLE', 'Prompt enhancement is not configured on the server.');
  }

  try {
    const result = await enhancePrompt({ kind, prompt });
    res.json({ original: prompt, ...result });
  } catch (err) {
    if (err instanceof AzureError) {
      return fail(res, err.status === 429 ? 429 : 502, 'ENHANCE_FAILED', err.message, {
        retryable: Boolean(err.retryable),
      });
    }
    throw err;
  }
}));

// ------------------------------------------------------------- community

app.post('/api/generations/:id/publish', requireUser, route(async (req, res) => {
  const row = await db.get('SELECT * FROM generations WHERE id=? AND user_id=?', req.params.id, req.user.id);
  if (!row) return fail(res, 404, 'NOT_FOUND', 'No such generation.');

  if (row.kind === 'audio') {
    return fail(res, 400, 'NOT_PUBLISHABLE', 'Only image and video generations can be shared.');
  }
  if (row.status !== 'COMPLETED' || !row.output_url) {
    return fail(res, 409, 'NOT_READY', 'Only a finished generation can be shared.');
  }

  const publish = req.body?.published !== false;
  const title = req.body?.title ? String(req.body.title).slice(0, 120) : row.title;

  await db.run(
    'UPDATE generations SET published=?, published_at=?, title=? WHERE id=?',
    publish ? 1 : 0,
    publish ? now() : null,
    title ?? null,
    row.id
  );

  const updated = await db.get('SELECT * FROM generations WHERE id=?', row.id);
  res.json({ generation: serialise(updated) });
}));

function communityRow(row, viewerId) {
  return {
    id: row.id,
    kind: row.kind,
    prompt: row.prompt,
    title: row.title,
    model: row.model,
    simulated: Boolean(row.simulated),
    outputUrl: row.output_url,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,
    author: { handle: row.handle, displayName: row.display_name },
    likes: Number(row.like_count ?? 0),
    likedByMe: viewerId ? Boolean(row.liked_by_me) : false,
    mine: viewerId ? row.user_id === viewerId : false,
  };
}

app.get('/api/community', route(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const kind = req.query.kind;
  const sort = req.query.sort === 'top' ? 'top' : 'new';
  const viewerId = req.user?.id ?? null;

  const where = ['g.published = 1', "g.status = 'COMPLETED'", 'g.output_url IS NOT NULL'];
  const args = [viewerId];
  if (kind === 'video' || kind === 'image') {
    where.push('g.kind = ?');
    args.push(kind);
  }

  const rows = await db.all(
    `SELECT g.*, u.handle, u.display_name,
            (SELECT COUNT(*) FROM likes l WHERE l.generation_id = g.id) AS like_count,
            EXISTS(SELECT 1 FROM likes l2 WHERE l2.generation_id = g.id AND l2.user_id = ?) AS liked_by_me
       FROM generations g
       JOIN users u ON u.id = g.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sort === 'top' ? 'like_count DESC, g.published_at DESC' : 'g.published_at DESC'}
      LIMIT ?`,
    ...args,
    limit
  );

  res.json({ posts: rows.map(r => communityRow(r, viewerId)) });
}));

app.post('/api/community/:id/like', requireUser, route(async (req, res) => {
  const row = await db.get(
    "SELECT * FROM generations WHERE id=? AND published=1 AND status='COMPLETED'",
    req.params.id
  );
  if (!row) return fail(res, 404, 'NOT_FOUND', 'That post is not available.');

  const existing = await db.get(
    'SELECT 1 FROM likes WHERE generation_id=? AND user_id=?',
    row.id, req.user.id
  );

  if (existing) {
    await db.run('DELETE FROM likes WHERE generation_id=? AND user_id=?', row.id, req.user.id);
  } else {
    await db.run(
      'INSERT INTO likes (generation_id, user_id, created_at) VALUES (?,?,?)',
      row.id, req.user.id, now()
    );
  }

  const { n } = await db.get('SELECT COUNT(*) n FROM likes WHERE generation_id=?', row.id);
  res.json({ likes: Number(n), likedByMe: !existing });
}));

// ---------------------------------------------------------------- errors

app.use((_req, res) => fail(res, 404, 'NOT_FOUND', 'No such endpoint.'));

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  fail(res, 500, 'INTERNAL', 'Something went wrong on the server.');
});

export default app;
