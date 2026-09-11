# Research — what makes ChatGPT and Perplexity feel simple

Reference shifted from Higgsfield to ChatGPT / Perplexity on request. This
records what those two actually do, structurally, so the redesign copies the
*behaviour* rather than the paint.

## The seven patterns that matter

**1. One input is the entire product.**
Neither product has a "create page". The composer *is* the home screen,
centred, with nothing above it but a logo. Everything else — history,
settings, account — is secondary navigation around that one box.

> For us: the prompt box is the product. Not a 360px rail of form fields
> beside a canvas.

**2. Mode is a property of the input, not a destination.**
ChatGPT switches between text, image and deep research from inside the
composer. Perplexity switches Search / Research / Labs the same way. You never
navigate to change what you are making.

> For us: Video / Image / Voice become pills in the composer. Today they are
> three separate pages with three near-identical layouts — the single biggest
> source of accidental complexity in the current build.

**3. Options are progressive.**
Model, aspect ratio, duration are one row of quiet controls inside the
composer. Nothing is a labelled form field. Nothing is visible until relevant —
duration only exists for video, voice only for speech.

**4. The content column is narrow.**
Both clamp to roughly 720–800px and centre it, on any screen width. Wide,
full-bleed layouts read as "dashboard", which is the opposite of calm.

**5. Chrome is nearly absent.**
Hairline borders, no drop shadows, no filled panels, no gradient tiles. Surfaces
are distinguished by *space*, not by boxes. Perplexity's stated goal was for the
brand to be "completely invisible" so nothing competes with the content.

**6. Results appear below the input, in order.**
A reverse-chronological column, not a thumbnail strip bolted under a canvas.
The newest result sits directly under the box that made it.

**7. Exactly one accent colour, on exactly one thing.**
The submit button. Everything else is neutral. Our current build uses lime for
nav links, borders, badges, credit dots, chips and buttons at once, which means
nothing reads as primary.

## Core journeys (unchanged from PROJECT.md)

| Journey | Steps |
|---|---|
| First generation | land → type → pick kind → generate → watch → download |
| Refine | result → edit prompt → regenerate |
| Share | result → publish → appears in community |
| Return | open → library shows everything previously made |

## What this redesign removes

- Three studio pages collapse into one composer with a mode switch
- The 360px form rail, replaced by inline composer controls
- The landing page's aurora blooms, marquee, count-up stats and scroll reveals
- Gradient tiles, badge pills, credit dot meters, the "how it works" tabs
- The top nav's row of disabled decoy links

## What it keeps

Everything behind the glass: providers, credits, job worker, polling, community
and the prompt rewriter are untouched. This is a presentation-layer rebuild —
no API change, no schema change, no decision reversed.

## Acceptance criteria

1. One composer serves all three kinds; `/video`, `/image`, `/audio` still work
   as deep links and preselect the right mode.
2. Nothing in the UI is accent-coloured except the primary action and the
   active nav item.
3. Content clamps to ≤ 820px and stays centred.
4. The critical flow from `.agents/qa.md` passes end to end after the rebuild.
5. Usable at 390px wide with no horizontal scroll.
