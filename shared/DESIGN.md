# Design

Read from the reference screenshots, not invented.

## Tokens

| Token | Value | Where it came from |
|---|---|---|
| `--bg` | `#0A0A0A` | page background, all screenshots |
| `--panel` | `#141414` | left creation rail, cards |
| `--panel-2` | `#1C1C1C` | inputs, chips, hover |
| `--line` | `#262626` | hairline borders |
| `--text` | `#F2F2F2` | primary |
| `--muted` | `#8A8A8A` | secondary labels |
| `--accent` | `#D8FF3E` | lime — Generate button, active nav, credit dots |
| `--accent-ink` | `#0A0A0A` | text on lime |
| `--hot` | `#FF2D78` | magenta — discount badges, Ultra plan |

Type is a condensed grotesque for display headings (`TURN TEXT INTO SPEECH`),
system sans for UI. Headings are uppercase and tight; body is sentence case.

## Layout

Two shells:

- **Marketing shell** — top nav + full-bleed content. Used by Explore, Pricing, Profile.
- **Studio shell** — top nav + fixed 360px left creation rail + canvas.
  Used by Video, Image, Audio. The rail holds mode tabs, inputs, model picker
  and the Generate button pinned to the bottom. The canvas holds
  `History / How it works` tabs.

Image generation is the exception: its prompt bar is docked bottom-centre over
the canvas rather than in a rail, matching `imagegeneration.png`.

## Rules taken from the reference

- The Generate button always shows its credit cost (`Generate ✦ 5`).
- Every surface is dark; there is no light theme.
- Empty states are a headline + one sentence + a single primary action
  ("Ready to show your projects?" → `Create project`).

## Deliberate departures

`.agents/ui.md` says to improve usability rather than copy blindly:

1. **Nav is honest.** The reference nav has 12+ items; unbuilt ones render
   disabled with a "not in this build" tooltip instead of linking nowhere.
2. **Generation state is explicit.** The reference hides queue position; ours
   shows QUEUED / PROCESSING with elapsed time, because local generation is
   slow enough that silence reads as breakage.
3. **Credit cost is shown before spending**, and a generation that cannot be
   afforded disables the button with the shortfall named, rather than failing
   after the click.
