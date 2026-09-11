#!/usr/bin/env node
/*
 * 8x assignment - automatic agent capture.
 *
 * Wired in .claude/settings.json to two Claude Code hook events:
 *   UserPromptSubmit -> node capture-agent-log.js prompt
 *   Stop             -> node capture-agent-log.js response
 *
 * Writes one markdown file per session to .agent-logs/.
 * Captures ONLY the verbatim prompt and the final assistant response.
 * No thinking, no tool calls, no intermediate steps.
 *
 * This script must never break the session: every failure path exits 0
 * and reports to stderr (which Claude Code sends to its debug log only).
 * stdout is kept empty on purpose - UserPromptSubmit stdout would be
 * injected into the model's context.
 */

const fs = require('fs');
const path = require('path');

const MODE = process.argv[2]; // "prompt" | "response"
const ROOT = path.resolve(__dirname, '..', '..'); // <repo>/.claude/hooks -> <repo>
const LOG_DIR = path.join(ROOT, '.agent-logs');
const STATE_DIR = path.join(__dirname, '.state');
const CONFIG = loadConfig();

function loadConfig() {
  const defaults = { author: 'unknown', project: path.basename(ROOT), tool: 'claude-code' };
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'capture.config.json'), 'utf8');
    return Object.assign(defaults, JSON.parse(raw));
  } catch (_) {
    return defaults;
  }
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

/* Read the tail of a possibly-large file without loading all of it. */
function readTail(file, maxBytes) {
  const size = fs.statSync(file).size;
  const start = Math.max(0, size - maxBytes);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/*
 * The hook payload carries no model name, so read it off the transcript,
 * taking whichever of these appears last:
 *   - an assistant record's message.model
 *   - a "model" attachment record's identity.modelId (written when the
 *     model is selected or switched, so it can land before the first
 *     assistant reply of a session exists)
 * This is what makes a mid-build model switch visible in the log.
 */
function modelFromTranscript(transcriptPath) {
  if (!transcriptPath) return null;
  try {
    const lines = readTail(transcriptPath, 2 * 1024 * 1024).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;
      let rec;
      try { rec = JSON.parse(line); } catch (_) { continue; }
      if (rec.type === 'assistant' && rec.message && rec.message.model) return rec.message.model;
      if (rec.attachment && rec.attachment.type === 'model' && rec.attachment.identity &&
          rec.attachment.identity.modelId) {
        return rec.attachment.identity.modelId;
      }
    }
  } catch (err) {
    warn('could not read model from transcript: ' + err.message);
  }
  return null;
}

/*
 * Fallback for the final response text when the Stop payload omits
 * last_assistant_message. Takes the last assistant record and keeps only
 * its text blocks - thinking and tool_use blocks are dropped by design.
 */
function responseFromTranscript(transcriptPath) {
  if (!transcriptPath) return null;
  try {
    const lines = readTail(transcriptPath, 4 * 1024 * 1024).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('{')) continue;
      let rec;
      try { rec = JSON.parse(line); } catch (_) { continue; }
      if (rec.type !== 'assistant' || !rec.message) continue;
      const content = rec.message.content;
      if (typeof content === 'string') return content;
      if (!Array.isArray(content)) continue;
      const text = content
        .filter(b => b && b.type === 'text' && typeof b.text === 'string')
        .map(b => b.text)
        .join('\n')
        .trim();
      if (text) return text;
    }
  } catch (err) {
    warn('could not read response from transcript: ' + err.message);
  }
  return null;
}

function statePath(sessionId) {
  return path.join(STATE_DIR, sessionId + '.json');
}

function loadState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
  } catch (_) {
    return null;
  }
}

function saveState(sessionId, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(statePath(sessionId), JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/* 2026-09-11T12:24:37.077Z -> ["2026-09-11", "12-24-37"] */
function stampParts(iso) {
  const parts = iso.split('T');
  return [parts[0], parts[1].slice(0, 8).replace(/:/g, '-')];
}

function frontmatter(state) {
  return [
    '---',
    'session_id: ' + state.sessionId,
    'date: ' + state.date,
    'author: ' + CONFIG.author,
    'model: ' + state.model,
    'tool: ' + CONFIG.tool,
    'project: ' + CONFIG.project,
    'total_exchanges: ' + state.count,
    'first_prompt_time: ' + state.firstPromptTime,
    'last_prompt_time: ' + state.lastPromptTime,
    '---',
  ].join('\n');
}

function createLogFile(state) {
  const stamp = stampParts(state.firstPromptTime);
  const file = path.join(LOG_DIR, stamp[0] + '_' + stamp[1] + '_' + state.sessionId + '.md');
  const header = [
    frontmatter(state),
    '',
    '# Session Log - ' + state.date,
    '',
    'Session: `' + state.short + '` | Project: `' + CONFIG.project + '` | Author: `' + CONFIG.author + '`',
    '',
    '---',
    '',
    '',
  ].join('\n');
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(file, header, 'utf8');
  return file;
}

/*
 * Rewrites only the frontmatter block (metadata that is counted, not content).
 * Entries themselves are append-only and are never touched again.
 */
function refreshFrontmatter(file, state) {
  const body = fs.readFileSync(file, 'utf8');
  const marker = '\n---\n';
  const end = body.indexOf(marker, 4);
  if (!body.startsWith('---\n') || end === -1) {
    warn('frontmatter not found in ' + file + '; leaving it alone');
    return;
  }
  fs.writeFileSync(file, frontmatter(state) + body.slice(end + marker.length - 1), 'utf8');
}

function appendEntry(file, type, num, state, timestamp, model, text) {
  const entry = [
    '[LOG_ENTRY type=' + type + ' num=' + num + ' session=' + state.short + ']',
    'timestamp: ' + timestamp,
    'model: ' + model,
    '',
    text,
    '',
    '',
  ].join('\n');
  fs.appendFileSync(file, entry, 'utf8');
}

/*
 * On the very first prompt of a session the transcript may not name a model
 * yet, so that PROMPT entry is written as "unknown". Once the response for
 * the SAME turn resolves the real model, fill that one field in.
 *
 * This completes a record the hook could not know at write time; it never
 * rewrites prompt or response content. The replacement targets the exact
 * three-line entry header, so it cannot touch text inside a logged message.
 */
function backfillPromptModel(file, state, model) {
  const needle = [
    '[LOG_ENTRY type=PROMPT num=' + state.count + ' session=' + state.short + ']',
    'timestamp: ' + state.promptTimestamp,
    'model: unknown',
    '',
  ].join('\n');
  const body = fs.readFileSync(file, 'utf8');
  const at = body.indexOf(needle);
  if (at === -1) return;
  const fixed = needle.replace('model: unknown', 'model: ' + model);
  fs.writeFileSync(file, body.slice(0, at) + fixed + body.slice(at + needle.length), 'utf8');
}

function warn(msg) {
  process.stderr.write('[capture-agent-log] ' + msg + '\n');
}

function main() {
  if (MODE !== 'prompt' && MODE !== 'response') {
    warn('unknown mode: ' + MODE);
    return;
  }

  const raw = readStdin();
  if (!raw.trim()) {
    warn('empty stdin payload');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    warn('unparseable stdin payload: ' + err.message);
    return;
  }

  const sessionId = payload.session_id;
  if (!sessionId) {
    warn('payload had no session_id');
    return;
  }

  const now = new Date().toISOString();
  const model = modelFromTranscript(payload.transcript_path);
  let state = loadState(sessionId);

  if (MODE === 'prompt') {
    const text = typeof payload.prompt === 'string' ? payload.prompt : '';
    if (!text.trim()) {
      warn('prompt event carried no text');
      return;
    }

    if (!state) {
      state = {
        sessionId: sessionId,
        short: sessionId.slice(0, 8),
        date: stampParts(now)[0],
        firstPromptTime: now,
        lastPromptTime: now,
        count: 0,
        model: model || 'unknown',
        awaitingResponse: false,
        file: null,
      };
      state.file = createLogFile(state);
    }

    state.count += 1;
    state.lastPromptTime = now;
    if (model) state.model = model;
    state.awaitingResponse = true;
    state.promptTimestamp = now;

    // Fall back to the last model seen in this session before giving up.
    const promptModel = model || state.model;
    state.promptModelUnknown = promptModel === 'unknown';

    appendEntry(state.file, 'PROMPT', state.count, state, now, promptModel, text);
    refreshFrontmatter(state.file, state);
    saveState(sessionId, state);
    return;
  }

  // MODE === "response"
  if (!state) {
    warn('stop event with no recorded prompt for session ' + sessionId + '; nothing to pair');
    return;
  }
  if (!state.awaitingResponse) {
    // Stop can fire again without a new prompt (wake-ups, resumed turns).
    // Skip rather than log a duplicate response.
    return;
  }

  let text = typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : '';
  if (!text.trim()) text = responseFromTranscript(payload.transcript_path) || '';
  if (!text.trim()) {
    warn('stop event carried no assistant text');
    text = '(no final assistant text captured for this turn)';
  }

  if (model) state.model = model;
  state.awaitingResponse = false;

  if (state.promptModelUnknown && model) {
    backfillPromptModel(state.file, state, model);
    state.promptModelUnknown = false;
  }

  appendEntry(state.file, 'RESPONSE', state.count, state, now, model || state.model, text.trim());
  refreshFrontmatter(state.file, state);
  saveState(sessionId, state);
}

try {
  main();
} catch (err) {
  warn('unexpected failure: ' + (err && err.stack ? err.stack : err));
}
process.exit(0);
