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

## 008 — Prompt rewriting runs on Azure, generation runs on Gemini

Decision:
`server/src/azure.js` sends the user's prompt to Azure OpenAI
(`gpt-5-mini-2`, deployment surface) and returns a rewritten one. It never
generates media. Media generation stays with Gemini/Veo or the local renderer.

Reason:
The Azure credentials were already in this repo's `.env` for another project
and are a good fit for a text task. Splitting the two also means a rewriter
outage cannot stop generation — `/api/enhance` failing leaves the original
prompt intact and the Generate button still works.

Notes:
- The deployment is a reasoning model: reasoning tokens come out of the same
  budget as the answer, so `max_completion_tokens` is set to 2000. A tight cap
  returns an empty message with `finish_reason: "length"` rather than a short
  answer, which is handled explicitly.
- The original prompt is stored on the generation (`original_prompt`) and shown
  under the result. A rewrite is never silent.

## 009 — Community is a flag on a generation, not a separate entity

Decision:
Publishing sets `published`/`published_at` on the existing `generations` row.
`likes` is a join table keyed on (generation, user). There is no separate
"post" table.

Reason:
A post *is* a generation someone chose to show. Copying it into a second table
would create two sources of truth for the same media file and make deletion
ambiguous. Unpublishing is one UPDATE, and deleting a generation removes the
post with it via ON DELETE CASCADE.

Audio is excluded from the feed: it is a visual grid, and a row of identical
audio players adds nothing. The server enforces this, not just the UI.

## 010 — The test suite uses the local renderer, not the real models

Decision:
`web/qa/flow.mjs` explicitly selects `sim-*` models. Real providers are
exercised by `web/qa/real-providers.mjs`, which is run on demand.

Reason:
Once a Gemini key is configured, the first available model is Veo. A suite that
runs on every change would then bill a real video generation every pass and take
minutes. The free suite stays fast and deterministic; the billed one stays
deliberate.

## 011 — Interface rebuilt on the ChatGPT / Perplexity reference

Decision:
The presentation layer was rewritten. Three studio pages and their 360px form
rails collapsed into one composer, which is also the home screen. The top nav
became a slim rail. Light became the default theme, on Perplexity's brand
palette. `Explore` and `Profile` were deleted; `Library` replaces the latter.

Reason:
Requested. The structural lesson from both references (`RESEARCH.md`) is that
mode is a property of the input, not a destination — which removed two nearly
identical pages rather than restyling them. Everything behind the API is
untouched: same endpoints, same schema, no earlier decision reversed.

Constraint that came out of it:
One accent on one action. A QA check counts filled accent backgrounds on a page
and fails above one, because the previous design used the accent on nav links,
borders, badges, chips and buttons at once, which left nothing reading as
primary.

## 012 — The frontend deploys to Vercel; the API cannot

Decision:
`web/` deploys to Vercel as a static SPA. `server/` deploys as a container to a
host that runs a persistent process with a mounted disk (Render — the account
already connected). `render.yaml` and `server/Dockerfile` describe it.

Reason:
Vercel's runtime is serverless, and the API depends on four things it does not
provide:

| Needs | Where | Serverless reality |
|---|---|---|
| A writable disk for SQLite | `db.js` — `node:sqlite` opens `data/app.db` | filesystem is ephemeral and per-invocation |
| A writable disk for media | `index.js` serves `/files` from `storage/` | same — every generated file vanishes |
| A long-running background loop | `jobs.js` — `setInterval` drains the queue | functions do not run between requests, so jobs would never progress |
| The `ffmpeg` binary | `simulator.js` spawns it | not present in the runtime |

Splitting them costs one thing — the browser now talks cross-origin — which is
handled by `VITE_API_BASE` at build time and an origin allowlist on the server.
Media URLs come back relative, so the client resolves them through `asset()`;
without that every image and video 404s in production while the API itself
looks healthy.

Rejected: rewriting the backend for serverless (Postgres + a queue service +
blob storage). That is a different product's architecture and would throw away
decisions 004 and 007 to satisfy a hosting choice.

## 013 — Everything on Vercel: libSQL, Blob, and the poll as the tick

Decision:
Decision 012 is reversed. Both halves deploy to Vercel as one project: the
static site plus a single serverless function at `api/[...slug].js` that serves
the same Express app. `render.yaml` and `server/Dockerfile` are kept — a
container is still the simpler host — but they are no longer the deployed path.

Three things had to change, one per blocker:

**SQLite on disk → libSQL.** Same SQLite dialect, spoken over HTTP to Turso.
This is why libSQL rather than Postgres: the SQL, the `?` placeholders and even
`PRAGMA table_info` in the migrations carry over untouched, so the diff is
"every call is now async" instead of a dialect rewrite. Locally it still opens
a plain file, so the project runs with no account and no network.

**Local files → Vercel Blob.** One `save()` behind which either backend runs,
chosen by whether a Blob token is present.

**The background worker → the poll.** The worker was a `setInterval` draining a
queue; serverless runs no code between requests, so it would never fire and
every job would sit at QUEUED forever. Cron is not the answer either — Hobby
allows one run per day. Instead a job advances one step inside the request that
asks about it. The client already polls every 1.5s while a generation runs, so
the poll *is* the tick: no cron, no queue service, and progress is driven by
exactly the person waiting for it.

Why this is viable at all: Vercel's max duration is 300s even on Hobby. A Veo
render takes ~50s and a Gemini image ~12s, so a single invocation has room.

What it costs:
- The ffmpeg fallback cannot run on Vercel, so the `sim-*` models only work
  locally. In production a missing `GEMINI_API_KEY` means no generation at all,
  where before it meant watermarked local output.
- `@libsql/client/web` is used when the database is remote. The default build
  carries a platform-specific native binary, which is wrong for the serverless
  host when the bundle is built elsewhere.

## 014 — Generation time limits (added, then turned off)

Decision:
A generation is abandoned and refunded once it passes a per-kind ceiling.
**Superseded: the limits are now off by default (0 = no ceiling).** The
mechanism remains and is env-tunable (`VIDEO_TIMEOUT_SECONDS`,
`IMAGE_TIMEOUT_SECONDS`, `AUDIO_TIMEOUT_SECONDS`) because it is the only thing
that reclaims credits from a job that never resolves — but nothing is capped
unless someone sets a value.

Reason:
Requested — an open-ended wait is a bad experience, and a bounded one can be
shown in the UI while it runs rather than only explained after it fails.

**The 50s figure does not fit Veo, and this is measured, not assumed.**
Observed end-to-end times for `veo-3.1-fast`:

| Run | Time |
|---|---|
| production real-provider suite | 50s, 52s, 56s |
| local, against the 50s cap | 52s → timed out, 54s → timed out |

Both runs at the 50s cap failed. Veo sits right on the boundary, so at 50s
essentially every video generation is abandoned seconds before it would have
succeeded. Raising `VIDEO_TIMEOUT_SECONDS` to 75–90 makes video work while
still bounding the wait; the default is left at 50 because that is what was
asked for, and it is one environment variable to change.

Implementation notes:
- The check runs *before* the next provider step, so a job that blew the limit
  while nobody was polling is abandoned the moment someone looks.
- The provider is not cancelled, because Veo has no cancel. The remote render
  may finish and be discarded. The credits are returned either way.
- Because progress is poll-driven (DECISION 013), the ceiling is enforced when
  a request arrives. A job whose tab is closed sits until the owner returns,
  then ages out on the next poll rather than at the exact second.
