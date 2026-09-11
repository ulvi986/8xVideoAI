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

## In Progress

- [ ] Frontend — Vite/React shell, studio pages, pricing, profile

## Blocked

- [ ] Real video generation via Gemini — **no `GEMINI_API_KEY` supplied**.
      The `.env` in the repo root belongs to a different project (InvestVCS,
      Azure OpenAI). The adapter is written and wired; it needs only the key.
      Until then gemini models report `available: false` with the reason, and
      the local simulator serves the flow.

## Next

- [ ] End-to-end QA of the critical flow in the browser
- [ ] `BUGS.md` from that pass
