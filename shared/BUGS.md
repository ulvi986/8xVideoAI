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

- **No real video model is reachable.** No `GEMINI_API_KEY` was supplied, so
  every generation runs on the local simulator. Output is watermarked
  `SIMULATED` and flagged `simulated: true`.
- **The local audio model is not speech.** It synthesises a tone bed. There is
  no offline TTS engine here, and inventing one would misrepresent the output.
- **Checkout is presentational.** Plans render; no payment provider is wired.
