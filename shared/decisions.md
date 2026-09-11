# Architecture Decisions

## 001 — Video provider

Decision:
Use an external video generation API.

Reason:
The challenge is focused on product execution rather than training
a proprietary video model.

## 002 — Provider abstraction

Decision:
AI provider must be replaceable.

Reason:
We may change providers later.

## 003 — Two providers behind one interface, selected at runtime

Decision:
`server/src/providers/` exposes one interface — `start(job)` / `poll(job)` —
with two implementations:

- `gemini` — Google Generative Language API (Veo for video, Gemini image, Gemini TTS)
- `simulator` — renders locally with ffmpeg

The provider is chosen per request by model id. If `GEMINI_API_KEY` is absent,
gemini-backed models are reported as unavailable by `/api/catalog` and the UI
disables them with the reason shown.

Reason:
Satisfies 002, and it means the product runs and demos end-to-end with no
third-party key or credit card. The simulator is never silently substituted for
a real model — an output produced by it is flagged `simulated: true` in the API
and watermarked in the render, so a demo can never be mistaken for real
model output.

## 004 — Database is `node:sqlite`

Decision:
Persist to SQLite via Node 22's built-in `node:sqlite`, not `better-sqlite3`.

Reason:
`better-sqlite3` needs a native toolchain, which is the usual way a Windows
clone of this repo fails on `npm install`. The built-in module has no compile
step. It prints an ExperimentalWarning; that is accepted and suppressed at
startup.

## 005 — No secret reaches the browser

Decision:
The frontend never sees a provider key. It calls our own `/api/*`; the server
holds the key and talks to the provider.

Reason:
Required by `.agents/ai.md`, `.agents/backend.md` and `.agents/devops.md`.
The Vite client is built with no `VITE_*` secret of any kind.

## 006 — Root `.env` was not actually ignored

Decision:
Rewrote `.gitignore`. The previous patterns were quoted (`".env"`), which git
reads literally, so the real `.env` — carrying live Azure credentials — was
exposed to the next `git add .`.

Reason:
`.agents/devops.md`: never commit API keys, secrets, credentials, .env files.
Verified with `git check-ignore -v .env`.

## 007 — Jobs run in-process

Decision:
A single in-process worker loop drains QUEUED jobs, with concurrency capped by
`JOB_CONCURRENCY` (default 2). No Redis, no external queue.

Reason:
`.agents/orchestrator.md`: prefer simple implementations. A queue service is
not justified at this scale, and it would add a process the reviewer has to
start before the app works. Jobs survive restart because state lives in SQLite;
anything left PROCESSING at boot is re-queued.
