# Design

Rebuilt against the ChatGPT / Perplexity reference (see `RESEARCH.md`). The
previous dark-and-lime system taken from Higgsfield has been removed entirely,
not restyled.

## Tokens

Light is the default; dark is a straight variable swap. Palette follows
Perplexity's published brand colours.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FBFAF4` Paper White | `#191A1A` | page ground |
| `surface` | `#FFFFFF` | `#202222` | composer, cards |
| `surface2` | `#F3F3EE` | `#262828` | hover, active nav, skeletons |
| `border` | `#E3E2D9` | `#333535` | hairlines — the only separator |
| `text` | `#091717` Offblack | `#F3F3EE` | body |
| `muted` | `#5C6A6A` | `#9AA5A5` | secondary |
| `accent` | `#20808D` True Turquoise | `#1FB8CD` | the primary action, and nothing else |
| `danger` | `#B4413C` | `#E07A75` | errors only |

Turquoise lifts to `#1FB8CD` in dark because `#20808D` does not hold at small
sizes on a dark ground. Measured contrast: **17.5:1** light, **15.7:1** dark.

Type is Inter (FK Grotesk is proprietary), loaded with a system fallback so a
failed font request degrades rather than breaks. Headings use `.h`: weight 500,
`-0.021em` tracking. There is no display face, no uppercase, no condensed.

## Structure

```
┌────────────┬──────────────────────────────┐
│ rail 228px │  content, max 820px, centred │
│ Home       │                              │
│ Create     │  ┌────────────────────────┐  │
│ Community  │  │  the composer          │  │
│ Library    │  └────────────────────────┘  │
│            │  results, newest first       │
│ account    │                              │
└────────────┴──────────────────────────────┘
```

The rail becomes a four-item bottom bar under 768px.

## The composer

One box, on every creation surface, and it *is* the home screen. It carries:

- the prompt (auto-growing, Enter sends, Shift+Enter breaks)
- mode as pills — Video / Image / Voice
- model, and only the options that apply to the current mode
- Enhance, when the rewriter is configured
- the credit cost and one filled accent button

Three separate studio pages and three 360px form rails collapsed into this.

## Rules

1. **One accent, one action.** The filled turquoise button is the only filled
   accent element on any screen. Enforced by a QA check that counts filled
   accent backgrounds and fails above one.
2. **Hairlines, not boxes.** Separation is space and a 1px border. No shadows,
   no gradients, no filled panels.
3. **Progressive options.** Duration exists only for video, voice only for
   speech. Nothing is a labelled form field.
4. **Content clamps to 820px** and stays centred at any width.
5. **Motion is two keyframes** — a 0.4s fade-up for new results and a soft
   pulse for pending states. Both disabled under `prefers-reduced-motion`.

## What was removed

Aurora blooms, the scrolling marquee, count-up stats, scroll-reveal sections,
gradient tiles, "BEST VALUE" badges, discount flags, the credit-dot meter, the
`/explore` page, the profile page's follower counts and empty Blogs section,
and the five disabled decoy nav links. The stylesheet went from 36KB to 19KB.

## Deliberate departures from the reference

1. **Nav shows only real destinations.** No disabled entries.
2. **Cost is shown before spending**, and an unaffordable generation disables
   the button with the shortfall named.
3. **Generation state is explicit** — QUEUED / PROCESSING with elapsed time.
   Local renders are slow enough that silence reads as breakage.
4. **A signed-out visitor can still type and send.** They are taken to sign-up
   rather than being blocked by a balance they do not have yet.
