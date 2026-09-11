# Capture Test

Proof that prompt/response capture is installed, automatic, and not bound to the
session that created it.

## Tool and model

| | |
|---|---|
| Tool | Claude Code CLI `2.1.263` (Windows 11, PowerShell + Git Bash) |
| Model (planning **and** execution) | `claude-opus-5` — single model, no planner/executor split |
| Canary sessions | `claude-haiku-4-5-20251001` (driven headlessly via `claude -p`, deliberately a different model so the `model:` field is visibly doing its job) |
| Author | `ulvi986` |
| Project | `8xVideoAI` |

The build itself runs on `claude-opus-5`. If that changes mid-build, every entry
records its own model, so the switch is visible in the log rather than announced.

## Mechanism

Claude Code has a first-class hooks system, so nothing needed wrapping. Two
lifecycle events are wired to one script:

| Event | Fires | Captures |
|---|---|---|
| `UserPromptSubmit` | every prompt submitted | the prompt, verbatim |
| `Stop` | end of every turn | the final assistant response |

**Config file changed:** `.claude/settings.json` (project-scoped and committed,
so it applies to every session started in this repo — not just mine, and not
just the session that installed it).

**Script:** `.claude/hooks/capture-agent-log.js` (Node 22, no dependencies).

**Logs land in:** `.agent-logs/`, one file per session, named
`YYYY-MM-DD_HH-MM-SS_<session-id>.md`.

### Why only the prompt and the final response

The `Stop` payload carries `last_assistant_message` — the final assistant text
for that turn, already stripped of thinking blocks and tool calls. That is
exactly the required granularity, so it is used directly. The transcript-parsing
fallback (used only if that field is ever absent) keeps `type: "text"` blocks and
explicitly drops `thinking` and `tool_use` blocks, to match.

### Design notes

- **Model name.** No hook payload carries the model, so the script reads it off
  the session transcript: the most recent `assistant` record's `message.model`,
  or a `model` attachment record's `identity.modelId`, whichever is later.
- **Entry numbering uses a sidecar state file** (`.claude/hooks/.state/<session>.json`),
  not a re-parse of the markdown. This matters: a prompt's *text* can itself
  contain a line like `[LOG_ENTRY type=PROMPT num=1 session=3f9c1a20]` — the
  assignment brief does exactly that — and re-parsing the log would miscount.
  Verified against that case before going live.
- **Entries are append-only.** The only bytes ever rewritten are the frontmatter
  counters (`total_exchanges`, `last_prompt_time`) and the one-time model
  backfill described under "What didn't work". Prompt and response content is
  never edited after it lands.
- **The hook cannot break a session.** Every failure path exits 0 and reports to
  stderr, which Claude Code routes to its debug log. `stdout` is kept empty on
  purpose — `UserPromptSubmit` stdout is injected into the model's context, and
  capture should be silent.
- **Duplicate `Stop` events are skipped.** `Stop` can fire again without a new
  prompt (wake-ups, resumed turns); the script only writes a RESPONSE when a
  PROMPT for that turn is outstanding.

## Canary log file

Both canaries were sent as **separate, fresh sessions**, driven headlessly, with
no manual logging step:

```
claude -p "CAPTURE TEST — 8x assignment, ulvi986" --model claude-haiku-4-5-20251001
claude -p "CAPTURE TEST 2 — 8x assignment, ulvi986 (second session, fresh)" --model claude-haiku-4-5-20251001
```

They landed in two different files, each named for its own session id:

- `.agent-logs/2026-09-11_12-37-45_e61e8498-0854-4492-8180-a6f4b93c9bb0.md`
- `.agent-logs/2026-09-11_12-39-19_11dd6d0e-04ef-4e5b-bc04-47939a2e35b1.md`

### Canary 1, pasted raw

From `.agent-logs/2026-09-11_12-37-45_e61e8498-0854-4492-8180-a6f4b93c9bb0.md`:

```
[LOG_ENTRY type=PROMPT num=1 session=e61e8498]
timestamp: 2026-09-11T12:37:45.466Z
model: unknown

CAPTURE TEST — 8x assignment, ulvi986

[LOG_ENTRY type=RESPONSE num=1 session=e61e8498]
timestamp: 2026-09-11T12:37:50.764Z
model: claude-haiku-4-5-20251001

Hello! I'm ready to help with the 8xvideoAI project. 

I notice your message is brief — could you clarify what you'd like me to do?

Are you asking me to:
- **Run a test** in the project?
- **Capture output** from a command or process?
- **Help with an assignment** related to 8x/video AI?
- **Something else?**

Let me know what you need, and I'll get started. I have the project context loaded and can access the working directory at `E:\8xvideoAI`.
```

Note the `model: unknown` on the prompt. That was a real defect, caught by this
canary and fixed before canary 2 — see below. The entry is left exactly as it was
written rather than retroactively corrected.

### Canary 2, pasted raw

From `.agent-logs/2026-09-11_12-39-19_11dd6d0e-04ef-4e5b-bc04-47939a2e35b1.md`:

```
[LOG_ENTRY type=PROMPT num=1 session=11dd6d0e]
timestamp: 2026-09-11T12:39:19.505Z
model: claude-haiku-4-5-20251001

CAPTURE TEST 2 — 8x assignment, ulvi986 (second session, fresh)

[LOG_ENTRY type=RESPONSE num=1 session=11dd6d0e]
timestamp: 2026-09-11T12:39:24.285Z
model: claude-haiku-4-5-20251001

I'm ready. I see:

- **Session**: Second, fresh start
- **Assignment**: 8x assignment for ulvi986
- **Working directory**: `E:\8xvideoAI` (git repo, main branch)
- **Status**: Initial commit only (`5b0afb5 init`)

The workspace is clean with `.agent-logs/` and `.claude/` directories present.

What's the task or goal for this session?
```

## What I tried first that did not work

**1. Writing the hook script with a bash heredoc — truncated it silently.**
`cat > capture-agent-log.js <<'EOF'` through the Bash tool cut the file off
mid-function at ~7KB and returned only a `warning: here-document ... delimited by
end-of-file`. The file looked written; `tail` showed it ended inside a string
literal. Switched to the editor tool for the file write. Worth knowing on this
setup: large heredocs are not reliable.

**2. First canary logged `model: unknown` on the prompt entry.**
At `UserPromptSubmit` time on the first prompt of a session, the transcript has
no `assistant` record yet, so there was nothing to read the model from. Two fixes:
the script now also recognises the `model` attachment record
(`attachment.identity.modelId`), which is written earlier; and if a prompt entry
still had to be written as `unknown`, the response for that same turn backfills
that single field once the model is known. The backfill matches the exact
three-line entry header, so it cannot touch text inside a logged message. Canary 2
confirms the fix — the prompt entry names the model correctly.

**3. Considered deriving entry numbers by re-parsing the markdown log — rejected.**
A prompt containing a literal `[LOG_ENTRY type=PROMPT ...]` line would inflate the
count, and the assignment brief itself contains exactly such lines. Replaced with
the sidecar state file, then verified by feeding the script a synthetic prompt
containing a fake `[LOG_ENTRY type=PROMPT num=99 session=deadbeef]` line: numbering
stayed correct.

**4. Unrelated pre-existing breakage, noted so it isn't mistaken for mine.**
An installed Render plugin registers its own `PostToolUse` hook and it errors on
every file write in this environment:

```
PostToolUse:Write hook blocking error ... C:/Users/Guven: line 1: syntax error near unexpected token `('
```

Its script path contains a space (`C:\Users\Guven Servis\...`) which its own
invocation does not quote. It is not part of capture, and capture is unaffected.

## Verifying it yourself

```bash
claude -p "CAPTURE TEST — verification" --model claude-haiku-4-5-20251001
ls .agent-logs/
```

A new `.md` file appears, containing that prompt and the response.
