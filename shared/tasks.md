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

- [x] Animated landing page — aurora hero, staggered reveal, live marquee
- [x] Prompt rewriting via Azure (`/api/enhance`) with original kept + undo
- [x] Community — publish, feed, filters, sort, likes, lightbox
- [x] Real generation enabled — Veo 3.1, Gemini image, Gemini TTS, all verified
- [x] Split QA: free local suite (31 checks) + billed real-provider suite (7)
- [x] `check:gemini` / `check:azure` diagnostic scripts
- [x] Fixed BUG-006 landing hero layout

## In Progress

Nothing — the build is at a stable point.

## Blocked

Nothing.

## Next

- [ ] Rate-limit `/api/enhance` — it spends Azure tokens per click
- [ ] Moderation / reporting on the community feed
- [ ] Object storage — Veo files are ~7MB and local disk will not survive deploy
- [ ] Deploy — needs SESSION_SECRET
