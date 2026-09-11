import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

/*
 * Minimal .env reader - no dotenv dependency.
 * Anything already in the real environment wins, so a deployment can set
 * variables without the file existing at all.
 */
function loadEnvFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = trimmed.slice(eq + 1).trim();
    // strip one layer of matching quotes
    if (value.length > 1 && /^(".*"|'.*')$/s.test(value)) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

// server/.env first, then the repo-root .env, so either location works.
loadEnvFile(path.join(SERVER_ROOT, '.env'));
loadEnvFile(path.join(REPO_ROOT, '.env'));

function bool(value, fallback) {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

export const config = {
  port: Number(process.env.PORT || 8787),
  /*
   * Both default to the repo, which is what you want locally. In production
   * they are pointed at a mounted disk: a container's own filesystem is
   * discarded on every deploy, which would take the database and every
   * generated file with it.
   */
  dataDir: process.env.DATA_DIR || path.join(SERVER_ROOT, 'data'),
  storageDir: process.env.STORAGE_DIR || path.join(SERVER_ROOT, 'storage'),
  uploadsDir: path.join(process.env.STORAGE_DIR || path.join(SERVER_ROOT, 'storage'), 'uploads'),

  /*
   * Sessions are signed with this. A generated fallback keeps dev working
   * out of the box; it changes on restart, which logs everyone out - fine
   * locally, not for production, hence the warning in index.js.
   */
  sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  sessionSecretProvided: Boolean(process.env.SESSION_SECRET),
  sessionTtlMs: 1000 * 60 * 60 * 24 * 30,

  // The provider key. Absent is a supported, tested state.
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',

  /*
   * Azure OpenAI, used only to rewrite prompts - never to generate media.
   * These names match the repo-root .env that was already here.
   */
  azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
  azureApiKey: process.env.AZURE_AI_API_KEY || '',
  azureModel: process.env.AZURE_AI_MODEL || '',
  azureApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
  azureTimeoutMs: Number(process.env.LLM_TIMEOUT_SECONDS || 60) * 1000,

  /*
   * libSQL. Empty locally, where db.js falls back to a plain file so the
   * project runs with no account and no network.
   */
  databaseUrl: process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || '',
  databaseAuthToken: process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN || '',

  // Vercel Blob. Absent locally, where media is written to disk instead.
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || '',

  /*
   * How long a generation may run before it is abandoned and refunded.
   *
   * Per kind, because they are not comparable: a Veo render is around a
   * minute, while an image or a speech clip is closer to half that. All
   * three are env-tunable so the ceiling can be raised without a code change.
   */
  generationTimeoutSeconds: {
    video: Number(process.env.VIDEO_TIMEOUT_SECONDS || 50),
    image: Number(process.env.IMAGE_TIMEOUT_SECONDS || 120),
    audio: Number(process.env.AUDIO_TIMEOUT_SECONDS || 120),
  },

  jobConcurrency: Number(process.env.JOB_CONCURRENCY || 2),
  providerTimeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS || 300000),
  allowSimulator: bool(process.env.ALLOW_SIMULATOR, true),
  allowVercelPreviews: bool(process.env.ALLOW_VERCEL_PREVIEWS, true),

  startingCredits: Number(process.env.STARTING_CREDITS || 10),
  /*
   * Comma-separated, because production has at least two legitimate origins:
   * the Vercel production domain and its preview deployments.
   */
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
};

export const hasGemini = () => Boolean(config.geminiApiKey);
