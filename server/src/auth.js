import crypto from 'node:crypto';
import { db, now } from './db.js';
import { config } from './config.js';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/*
 * Session token = random id + HMAC over it. The HMAC means a token this server
 * did not issue is rejected without a database lookup.
 */
export async function issueSession(userId) {
  const id = crypto.randomBytes(24).toString('hex');
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(id).digest('hex').slice(0, 32);
  const token = `${id}.${sig}`;
  const expires = new Date(Date.now() + config.sessionTtlMs).toISOString();
  await db.run(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    token,
    userId,
    now(),
    expires
  );
  return { token, expiresAt: expires };
}

function tokenIsWellFormed(token) {
  const [id, sig] = String(token).split('.');
  if (!id || !sig) return false;
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(id).digest('hex').slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function userForToken(token) {
  if (!token || !tokenIsWellFormed(token)) return null;
  const session = await db.get('SELECT * FROM sessions WHERE token = ?', token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.run('DELETE FROM sessions WHERE token = ?', token);
    return null;
  }
  return (await db.get('SELECT * FROM users WHERE id = ?', session.user_id)) || null;
}

export async function revokeSession(token) {
  await db.run('DELETE FROM sessions WHERE token = ?', token);
}

function bearer(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/* Attaches req.user when a valid token is present, but never rejects. */
export async function attachUser(req, _res, next) {
  try {
    req.token = bearer(req);
    req.user = req.token ? await userForToken(req.token) : null;
    next();
  } catch (err) {
    next(err);
  }
}

/* Rejects when there is no valid session. */
export function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
  }
  next();
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    handle: user.handle,
    displayName: user.display_name,
    plan: user.plan,
    credits: user.credits,
    createdAt: user.created_at,
  };
}
