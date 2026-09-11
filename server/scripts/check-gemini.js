#!/usr/bin/env node
/*
 * Verifies GEMINI_API_KEY without spending credits on a full generation.
 *
 *   node scripts/check-gemini.js
 *
 * Reports whether the key is present, whether it authenticates, and which of
 * the models this app uses are actually visible to it. Mirrors the
 * check_azure.py habit already used in this repo.
 */
import { config, hasGemini } from '../src/config.js';

const WANTED = [
  { id: 'veo-3.1-fast-generate-preview', use: 'video (fast)' },
  { id: 'veo-3.1-generate-preview', use: 'video (quality)' },
  { id: 'gemini-2.5-flash-image', use: 'image' },
  { id: 'gemini-2.5-flash-preview-tts', use: 'audio' },
];

const pad = (s, n) => String(s).padEnd(n);

if (!hasGemini()) {
  console.log('\n  GEMINI_API_KEY: NOT SET\n');
  console.log('  Add it to server/.env (or the repo-root .env):\n');
  console.log('      GEMINI_API_KEY=your-key-here\n');
  console.log('  Get one at https://aistudio.google.com/apikey');
  console.log('  Then restart the API. Until then, gemini models report');
  console.log('  themselves unavailable and the local simulator is used.\n');
  process.exit(1);
}

console.log(`\n  key      : set (${config.geminiApiKey.length} chars)`);
console.log(`  endpoint : ${config.geminiBaseUrl}\n`);

let response;
try {
  response = await fetch(`${config.geminiBaseUrl}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': config.geminiApiKey },
  });
} catch (err) {
  console.log(`  FAILED to reach Gemini: ${err.message}\n`);
  process.exit(1);
}

if (!response.ok) {
  const body = await response.text();
  let detail = body.slice(0, 300);
  try { detail = JSON.parse(body).error?.message ?? detail; } catch { /* keep raw */ }
  console.log(`  FAILED: HTTP ${response.status} — ${detail}\n`);
  if (response.status === 400 || response.status === 403) {
    console.log('  That usually means the key is wrong, or the Generative');
    console.log('  Language API is not enabled for the project.\n');
  }
  process.exit(1);
}

const data = await response.json();
const available = new Set((data.models ?? []).map(m => m.name.replace(/^models\//, '')));

console.log(`  authenticated OK — ${available.size} models visible\n`);
console.log(`  ${pad('MODEL', 40)} ${pad('USED FOR', 18)} STATUS`);
console.log(`  ${'-'.repeat(40)} ${'-'.repeat(18)} ------`);

let missing = 0;
for (const model of WANTED) {
  const ok = available.has(model.id);
  if (!ok) missing++;
  console.log(`  ${pad(model.id, 40)} ${pad(model.use, 18)} ${ok ? 'ok' : 'NOT AVAILABLE'}`);
}

if (missing) {
  console.log(`\n  ${missing} model(s) are not available to this key.`);
  console.log('  Veo in particular is gated: it needs a paid Google AI Studio');
  console.log('  project. Edit the ids in server/src/catalog.js if your project');
  console.log('  exposes different versions — the adapter itself is unchanged.\n');
  process.exit(2);
}

console.log('\n  All models this app uses are available.\n');
