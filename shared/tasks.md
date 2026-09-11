# Tasks

## Completed

- [x] Dashboard layout
- [x] Sidebar
- [x] Create page
- [x] Fix `.gitignore` — quoted patterns left the real `.env` unignored
- [x] Project spec (`PROJECT.md`), design spec (`DESIGN.md`), decisions 003–007
- [x] Backend scaffold — Express 5 + `node:sqlite`, zero native deps
- [x] Auth — signup / login / logout, scrypt + HMAC session tokens
- [x] Credits — deduct on queue, refund on failure, ledger table
- [x] Provider interface with two implementations (gemini, simulator)
- [x] Gemini adapter — Veo long-running video, image, TTS (PCM→WAV)
- [x] Simulator adapter — real mp4 / png / m4a via ffmpeg, watermarked
- [x] Job worker — QUEUED → PROCESSING → COMPLETED/FAILED, restart-safe
- [x] Generation API — create, list, get, delete
- [x] Backend QA — 9 error paths + refund-on-failure verified
- [x] Frontend — Vite/React shell, studio pages, pricing, profile, auth
- [x] Browser QA — 20 checks over the critical flow, 3 consecutive clean runs
- [x] Fixed BUG-001 stuck-on-Queued race, BUG-002 47MB video, BUG-005 upload overflow
- [x] README + BUGS.md

## In Progress

Nothing — the build is at a stable point.

## Blocked

- [ ] Real video generation via Gemini — **no `GEMINI_API_KEY` supplied**.
      The `.env` in the repo root belongs to a different project (InvestVCS,
      Azure OpenAI). The adapter is written and wired; it needs only the key.
      Until then gemini models report `available: false` with the reason, and
      the local simulator serves the flow.

## Next

- [ ] Exercise the Gemini adapter against the live API once a key exists
- [ ] Deploy — needs SESSION_SECRET and object storage for generated media
