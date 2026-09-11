# Bugs

Found and fixed during the build. Kept because the reasoning is the useful part.

---

## BUG-001 — Generation stuck on "Queued" forever in the UI

**Severity:** Critical — the core flow appears broken to the user.

**Steps to reproduce**
1. Sign up, generate a video, then an image, then open the audio studio.
2. Generate speech.
3. Watch the canvas.

**Expected:** status moves QUEUED → PROCESSING → COMPLETED within seconds.

**Actual:** the canvas sat on "Queued · 931s elapsed" indefinitely, while the
server had completed the job about four seconds in. Credits were correctly
deducted, and the file existed on disk.

**Cause:** `setCredits` in `web/src/auth.tsx` returned a brand-new user object
on every poll, even when the credit value was unchanged. That changed `user`'s
identity, which changed the identity of `load` in `useStudio`, which re-ran the
"fetch the whole list" effect roughly once a second. Those refetches raced the
poller, and whenever a list response that had started before the job finished
landed after the poll's COMPLETED update, it overwrote it with the stale
QUEUED row. The cycle repeated, so the UI never recovered.

**Fix:** three changes, smallest first.
1. `setCredits` returns the existing object when the value has not changed.
2. `useStudio` keys its loader on `user.id`, not the whole `user` object.
3. The poller is now monotonic: a response can never move a job from a
   terminal status back to a non-terminal one.

**Note:** this passed QA once before it failed, which is what made it look like
flakiness. It was a real race the whole time. The suite now runs three times in
a row clean.

---

## BUG-002 — 5-second video weighed 47MB, and duration was ignored

**Severity:** High — unusable file sizes; the duration control did nothing.

**Steps to reproduce:** request a 6-second video from the local renderer.

**Expected:** roughly 200KB, exactly 6 seconds.

**Actual:** 47,635,435 bytes and 5.000000 seconds.

**Cause:** two mistakes in one ffmpeg invocation.
- `gradients` is a *source* filter. It was chained after a `color` input, which
  left the colour source unconnected and let ffmpeg decide the frame count
  itself, so `-t 6` did not produce 6 seconds.
- A `noise` filter was applied for grain. Film grain is close to the
  worst-case input for H.264 inter-frame prediction and inflated the bitrate
  by two orders of magnitude.

**Fix:** make `gradients` the actual input (`-f lavfi -i`), drop `noise`
entirely, and let the gradient's own `speed` supply the motion. Now 193KB and
exactly 6.000000 seconds.

---

## BUG-003 — `.env` with live credentials was not ignored

**Severity:** Critical — secret exposure.

**Steps to reproduce:** `git check-ignore -v .env` in the original repo.

**Expected:** the file is ignored.

**Actual:** exit code 1 — not ignored. A `git add .` would have committed
`AZURE_AI_API_KEY` and the rest to a repo intended to be public.

**Cause:** the patterns were written quoted — `".env"` — and `.gitignore` has
no quoting syntax, so git looked for a file whose name literally begins and
ends with a double-quote character.

**Fix:** unquoted patterns, plus `server/data/` (SQLite file with password
hashes) and `server/storage/` (generated media).

---

## BUG-004 — `db.transaction is not a function`

**Severity:** High — every generation returned a 500.

**Cause:** `db.transaction(fn)` is `better-sqlite3`'s API. This project uses
Node's built-in `node:sqlite`, which has no such helper. Left over from
choosing the driver after writing the route.

**Fix:** an explicit `transaction()` helper in `server/src/db.js` wrapping
BEGIN / COMMIT / ROLLBACK, used where credit deduction and job insertion must
both happen or neither.

---

## BUG-005 — Stack overflow on reference images over ~100KB

**Severity:** High — image-to-video was unusable with real photographs.

**Cause:** `btoa(String.fromCharCode(...new Uint8Array(buffer)))` spreads one
argument per byte into a function call. Anything beyond a small thumbnail
exceeds the argument limit and throws `RangeError: Maximum call stack size
exceeded`.

**Fix:** `web/src/fileToBase64.ts` uses `FileReader.readAsDataURL`, which has
no such limit, plus an 8MB guard with a real error message.

---

## Hardening, not bugs

- **ffmpeg could deadlock the queue.** The render promise is awaited while
  holding a worker concurrency slot. A hung ffmpeg would never settle it, and
  after `JOB_CONCURRENCY` hangs the queue would stop permanently. Added
  `-nostdin` and a 120s kill timer so the promise always settles.
- **Vulnerable dependencies.** `multer` 1.x was pulled in and never used —
  removed. Express 4 pinned a vulnerable `qs`; moved to Express 5 with a `qs`
  override. `npm audit` is clean.

---

## Known limitations (not defects)

- **The local fallback models are still fallbacks.** With no key configured the
  `sim-*` models serve the flow; their output is watermarked `SIMULATED` and
  flagged `simulated: true`. `sim-voice-1` in particular synthesises a tone bed,
  not speech — there is no offline TTS engine here, and inventing one would
  misrepresent the output.
- **Veo is occasionally flaky.** See the retry note below. Failures refund.
- **Checkout is presentational.** Plans render; no payment provider is wired.

---

## BUG-006 — Landing hero collapsed onto one line

**Severity:** Medium — the new landing page looked broken above the fold.

**Steps to reproduce:** open `/` at 1440px.

**Expected:** headline, paragraph, a centred CTA row, then a 3-column stat row.

**Actual:** the paragraph and the CTA buttons sat side by side on one line, and
the three stats stacked into a single column.

**Cause:** the `.rise` entrance-animation class set `display: inline-block`.
That is correct for the per-word headline spans it was written for, but the same
class is also applied to a `<p>`, a flex row and a `<dl class="grid">`. Forcing
inline-block on those overrode `display: grid` and let the block elements flow
inline.

**Fix:** `.rise` now animates only. A separate `.rise-word` carries
`display: inline-block` for the headline spans. A QA check asserts the computed
`display` of the hero stats is `grid` with 3 columns and the paragraph is
`block`, so it cannot regress silently.

---

## Resolved limitation — real generation is live

`GEMINI_API_KEY` is now configured and all three real providers were verified
end to end by `web/qa/real-providers.mjs`:

| Kind | Model | Result |
|---|---|---|
| image | `gemini-2.5-flash-image` | 12s, 1.9MB PNG, 1024×1024 |
| audio | `gemini-2.5-flash-preview-tts` | 8s, 250KB WAV, 24kHz mono |
| video | `veo-3.1-fast-generate-preview` | 52s, 7.3MB MP4, 1280×720, 24fps, **with an AAC audio track** |

The audio track is the clearest proof it is not the local renderer — the
simulator produces silent 30fps clips around 190KB.

**One real failure seen along the way.** The first Veo request came back
`Video generation failed due to an internal server issue` after ~40s. That is
Google's error, surfaced verbatim, and the 5 credits were refunded
automatically. An identical retry with a different prompt succeeded. Worth
knowing: Veo fails occasionally and the UI must not treat that as fatal — it
does not.

**Note on an earlier claim.** Two sessions of this build reported "no
`GEMINI_API_KEY`". The key is written as `GEMINI_API_KEY = "..."` with spaces
around the `=`; the check used was `^GEMINI_API_KEY=`, which does not match that
form. The server's own `.env` parser trims whitespace and strips quotes, so it
reads the file correctly either way — only the diagnostic grep was too strict.

---

## BUG-007 — The light theme never rendered

**Severity:** High — the redesign's primary look was unreachable.

**Steps to reproduce:** open the app with the OS set to light mode.

**Expected:** Paper White `#FBFAF4` ground, Offblack text.

**Actual:** the dark palette, in both themes.

**Cause:** the dark tokens were written as `@media (prefers-color-scheme: dark)
{ @theme { … } }`. Tailwind v4's `@theme` is a compile-time directive — it is
hoisted out of the media query and emitted unconditionally, so the dark values
overwrote the light ones and the query never gated anything.

**Fix:** `@theme` holds the light palette only. Dark overrides the same custom
property names in a plain `:root` block inside the media query, which is a
runtime cascade and actually switches.

**How it hid:** the first contrast check passed in both themes — because both
*were* dark, and dark has fine contrast. A check that measures one theme at a
time cannot see that the two are identical. There are now two extra assertions:
the themes must differ, and light must be exactly `rgb(251, 250, 244)`.

---

## BUG-008 — Signed-out visitors could not start

**Severity:** High — the sign-up path from the home page was unreachable.

**Steps to reproduce:** open `/` signed out, type a prompt, try to send.

**Expected:** sending takes you to sign-up.

**Actual:** the send button was disabled, and a red "Needs 5 credits; you have
0" sat under the composer on first load.

**Cause:** the composer gates sending on `credits >= cost`. A signed-out
visitor has no balance, so the gate was permanently closed — and `Home` only
redirects to sign-in *inside* the submit handler, which could never fire.

**Fix:** the composer takes a `signedIn` prop. When false it skips the credit
gate and hides the cost readout and the warning; submitting hands off to the
parent, which redirects. Three QA checks cover it.

---

## BUG-009 — A square focus rectangle cut across the composer

**Severity:** Medium — visible the moment anyone starts typing, which is the
first thing anyone does.

**Steps to reproduce:** click into the composer on any page and type.

**Expected:** the rounded composer indicates focus.

**Actual:** a hard-cornered turquoise rectangle was drawn around the text area,
overlapping the rounded container. A scrollbar also flickered in and out of the
field as lines wrapped.

**Cause:** two separate things.

1. The global `:focus-visible { outline: 2px solid … }` rule and Tailwind's
   `outline-none` utility have the same specificity, and the custom rule comes
   later in the stylesheet, so it won. An outline follows the *focused
   element's* border-radius — and the textarea is a plain box inside the
   rounded container, with no radius of its own. Hence square corners.
2. The field was `overflow-y: auto` permanently, so the browser showed and hid
   a scrollbar on every wrap, even though the field auto-grows and normally
   never needs one.

**Fix:**
1. `.composer-field:focus-visible { outline: none }`, and the container now
   carries the focus state with a border and a ring — both of which follow its
   radius. The ring is suppressed on exactly one element; every button, link
   and other input keeps it.
2. The auto-grow effect toggles overflow: `hidden` while the content fits,
   `auto` only once it exceeds the 260px cap.

Four QA checks cover it: no outline on the field, a visible focus state on the
container, no scrolling on ordinary text, and capped height with scrolling
beyond it.

---

## BUG-010 — Every nested API route 404'd in production

**Severity:** Critical — sign-in, generation and everything else was dead on
the deployed site. Only the shallow routes worked, which made it look healthy.

**Steps to reproduce:** deploy, then `POST /api/auth/login`.

**Expected:** the API answers.

**Actual:** Vercel's own HTML 404 page. `GET /api/health` and
`GET /api/community` returned 200 the whole time, so `/api/health` being green
meant nothing.

**Cause:** the function is `api/[...slug].js`, which is Vercel's catch-all
syntax, but the build emitted

```
"src": "^/api/([^/]+)$"  ->  /api/[...slug]
```

`[^/]+` matches a single segment. One-segment paths routed; anything deeper
fell through to a blanket `^/api(/.*)?$ -> status 404`. So the split was by
path depth, not by method — `/api/health` worked and `/api/auth/login` did not.

**Fix:** an explicit `"/api/:path*" -> "/api/[...slug]"` rewrite in
`vercel.json`, which emits a pattern that matches any depth. Verified on a
preview before promoting: a nested POST now returns the app's own
`INVALID_CREDENTIALS` rather than Vercel's 404 page.

**Lesson:** the health check was the trap. It is one segment deep, so it kept
passing while the rest of the API was unreachable. `qa/production.mjs` now
drives a real signup and generation against the deployment instead.

---

## Open — "Like persists across a reload" is intermittently red

**Severity:** Low, and it is the test rather than the product.

The browser suite fails this roughly one run in six, only against the remote
database. The behaviour underneath was checked three ways and is correct:

- a browser click sends exactly one `POST /like`, confirmed 3/3
- the server reports `likedByMe: true` afterwards, 3/3
- 20 rapid reads straight after a write all returned the like — so it is not
  read-after-write lag on Turso

Waiting for the element rather than sampling once did not fix it, so the
assertion timing is not the whole story either. **Not root-caused.** The check
now dumps the server's view of the feed when it fails — token present, HTTP
status, post count, likes — so the next occurrence should say which half is
wrong instead of needing this investigation repeated.
