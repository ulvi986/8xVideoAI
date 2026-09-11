# Project Status

## Current Phase

Feature-complete MVP, running locally on real models.

## Working

- **Animated landing page** — aurora hero, staggered headline, scroll reveals,
  count-up stats, and a marquee fed by real community work
- **Real generation** — Veo 3.1 video, Gemini image, Gemini speech
- **Prompt rewriting** — Azure `gpt-5-mini-2` turns a rough prompt into a shot
  description; the original is kept, shown, and undoable
- **Community** — publish a video or image, browse the feed, filter by kind,
  sort by newest or most liked, like/unlike, lightbox
- Explore, three studios, pricing, profile, auth
- Credits — 10 on signup, deducted on queue, refunded on failure
- Generation lifecycle with polling, preview and download

## Verified

| Suite | Scope | Result |
|---|---|---|
| `web/qa/flow.mjs` | critical flow in a real browser, local models | **31/31** |
| `web/qa/real-providers.mjs` | Veo + Gemini image + Gemini TTS + Azure | **7/7** |
| `server/npm run check:gemini` | key auth + model availability | all 4 models ok |
| `server/npm run check:azure` | rewriter round trip | ok, ~6s |

Real output confirmed by `ffprobe`, not just a 200 response: the Veo clip is
1280×720, 24fps, 8s, **with an AAC audio track** — the local renderer produces
silent 30fps clips around 190KB.

## In Progress

Nothing. The build is at a stable point.

## Blocked

Nothing.

## Next Priority

1. **Rate limiting on `/api/enhance`** — it spends Azure tokens per click and is
   currently only gated by authentication.
2. **Moderation on the community feed** — anyone can publish anything to a
   shared surface; there is no report or takedown path.
3. **Object storage** — generated media is on local disk, which will not
   survive a deploy. Veo files are ~7MB each.
4. Deploy (`.agents/devops.md`) — needs `SESSION_SECRET` set.
