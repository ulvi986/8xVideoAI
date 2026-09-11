# Project Status

## Current Phase

MVP complete and running locally.

## Working

- Explore / landing
- Signup, login, logout, session persistence
- Credits — 10 on signup, deducted on queue, refunded on failure, ledger kept
- Video studio — text-to-video and image-to-video, aspect ratio, duration
- Image studio — docked prompt bar, aspect ratio
- Audio studio — script, voice picker, model picker
- Generation lifecycle — QUEUED → PROCESSING → COMPLETED / FAILED with polling
- Preview and download for all three kinds
- History strip and profile grid
- Pricing page — three plans, monthly/annual toggle
- Model availability surfaced honestly when a provider key is missing

## Verified

`web/qa/flow.mjs` drives a real browser through the critical flow from
`.agents/qa.md` and asserts 20 checks, including that the produced video
actually loads and plays, that the download link serves bytes, and that the
page logs no console errors. **20/20, three consecutive runs.**

Backend checked separately: 9 error paths plus refund-on-failure.

## In Progress

Nothing. The build is at a stable point.

## Blocked

- **Real generation via Gemini.** No `GEMINI_API_KEY` was supplied — the `.env`
  in the repo root belongs to a different project (InvestVCS / Azure OpenAI).
  The adapter is written, wired and unit-shaped against the documented REST
  contract, but it has never executed against the live API. Treat it as
  untested until a key exists.

## Next Priority

1. Add `GEMINI_API_KEY` to `server/.env`, then re-run `web/qa/flow.mjs`
   selecting a Veo model, to exercise the adapter for real.
2. Deploy (`.agents/devops.md`) — needs `SESSION_SECRET` and object storage,
   since generated media currently lives on local disk.
