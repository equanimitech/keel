# `/remind` — fuzzy reminders + spaced-repetition bubble-up

**Date:** 2026-06-08
**Status:** design approved, pending plan
**Scope:** small (one core addition, one CLI command group, one hook line, one test file, one skill)

## Problem

keel surfaces calm, day-scoped state (intention, appetite, wind-down) through a session-start nudge channel no other tool has. There is no way to ask it to *remind* you of something later. Hard-dated tasks already belong in Things. What's missing is the class of reminder a calendar handles badly:

- **Fuzzy-timed** — "around next week", "sometime in July" — where an exact timestamp is a lie.
- **Spaced learning** — things you want to *internalize*, not just be pinged about once: a decision's rationale, a tricky field name, a lesson. These should resurface on an expanding cadence and fade as they stick.

## Decision

keel owns the reminder **mechanism**; the skill is the natural-language front-end; secretariat is, at most, a deferred *source*.

- **Surfacing forces keel.** Only keel has an autonomous bubble-up channel (the session-start hook). secretariat is read-on-demand — it cannot nudge. So the surfacing path is keel regardless of where data sits.
- **SRS fights secretariat's model.** secretariat envelopes are immutable and Touch-ID-stamped — "moments that count." A Leitner box mutates on every recall rating; `nextTs` recomputes constantly. Re-stamping a recall item per rating is absurd, and a fuzzy nudge is not a commitment worth a ceremony. Mutable, ceremony-free state is exactly `state.json`.
- **The seam, deferred.** Some bubbles are *about* attested content (a `/decision` you stamped). A reminder carries an optional `ref` field for a later secretariat linkage (resurface a stamped envelope by reference, not copy). v1 reserves the field and does not wire it.

```
keel        = mechanism   reminders[], Leitner, nextTs, surfacing — mutable, no ceremony
secretariat = source (v2) a bubble may carry ref: <envelope>, read on surface
```

## Data model

A new array on keel state. `state.reminders[]`, each:

```js
{
  id:          "r3",            // short stable id, max(existing numeric suffix)+1
  text:        "why DC/travail migration decoupled",
  kind:        "approx" | "bubble",
  createdTs:   1780000000000,
  nextTs:      1780600000000,   // when it next becomes due to surface
  dismissedTs: 0,               // 0 = active; >0 = cleared/dropped
  ref:         undefined,       // reserved for secretariat envelope path (v2, unused)

  // approx only:
  softTs:      1780600000000,   // fuzzy target
  slackDays:   3,               // band half-width → band = [softTs−slack, softTs+slack]

  // bubble only:
  box:         0,               // Leitner box index into BOXES
  lastRatedTs: 0,
}
```

State default: absent `reminders` reads as `[]` (back-compatible; old state files have no key).

## Mode 1 — Approximate (`~`)

A one-shot soft-window reminder. The **skill** parses fuzzy natural language into `softTs` + `slackDays`:

| Phrase | softTs | slackDays |
|---|---|---|
| "in a few days" | +3d | 2 |
| "next week" | +7d | 3 |
| "in a couple weeks" | +14d | 4 |
| "sometime in July" | Jul 15 | 15 |
| "end of the month" | last day | 5 |

`nextTs = softTs − slackDays·day` (nudging begins at band start).

**Surfacing tiers** (computed from now vs band):
- `now < softTs − slack` → silent (not yet due).
- `softTs − slack ≤ now ≤ softTs + slack` → `≈ due: <text>`.
- `now > softTs + slack` → `⚠ overdue: <text>`.

Cleared with `keel remind done <id>` (sets `dismissedTs`). It does not re-arm.

## Mode 2 — Bubble-up (spaced repetition, Leitner)

A dateless item that resurfaces on an expanding cadence to make it *stick*. New on create: `box = 0`, `nextTs = now + BOXES[0]·day`.

Pure transition in `core.mjs`:

```js
const BOXES = [1, 3, 7, 16, 35, 90, 180, 365]; // days — long tail for things that really stick
const DAY = 86_400_000;

/** @param {"got"|"fuzzy"|"miss"} grade */
function rateBubble(rem, grade, now) {
  let box = rem.box;
  if (grade === "got")  box = Math.min(box + 1, BOXES.length - 1);  // promote
  else if (grade === "miss") box = 0;                                // reset
  // "fuzzy" → box unchanged
  return { ...rem, box, nextTs: now + BOXES[box] * DAY, lastRatedTs: now };
}
```

Re-arms forever — it is learning, not a task. Surfaces as `🧠 recall: <text>` once due (`nextTs ≤ now`). Rated with `keel remind got|fuzzy|miss <id>`. `keel remind done <id>` retires it for good.

## Surfacing

New pure function in `core.mjs`:

```js
/** Due reminder lines, tiered. Bubble: 🧠 recall. Approx: ≈ due / ⚠ overdue. */
function reminderLines(state, now) { /* returns string[] */ }
```

Wired into `handleSessionStart` only for v1 — appended to the existing
`[reflection, nudge, intention, appetite]` line stack. Per-turn (`handleUserSubmit`)
surfacing is **out of scope** — it would nag; session-open bubble-up is the contract.

Ordering within the block: overdue approx first, then due approx, then due bubbles
(most-overdue first within each). Cap output at a sane number (e.g. 5 lines) so a
backlog never floods the session header; a trailing `…+N more (keel remind list)`
when truncated.

## Commands (`keel.mjs`)

The skill calls these with structured flags; the CLI does no NL parsing.

```
keel remind add --bubble "<text>"
keel remind add --soft <epochMs> --slack <days> "<text>"
keel remind list                     # all active, with kind + state + next-due
keel remind got|fuzzy|miss <id>      # Leitner rate (bubble only; error on approx)
keel remind done <id>                # retire / dismiss (either kind)
```

`add` returns the new id. `list` prints one line per active reminder:
`r3 🧠 box2 next 7d · why DC/travail migration decoupled`.
Unknown id or wrong-kind rating prints a clear error, exit 0 (CLI stays fail-soft).

## Skill — `~/.claude/skills/remind/SKILL.md`

Mirrors the `intention` / `appetite` keel-wrapper skills.

- **Frontmatter:** `user-invocable: true`, `allowed-tools: [Bash]`.
- **Triggers:** `/remind`, "remind me …", "bubble this up", "I want to remember/learn X", "resurface X later".
- **Behavior:**
  1. Classify intent → `approx` (a fuzzy time named) or `bubble` (learn / no time).
  2. For approx, resolve the phrase → `softTs` (epoch ms) + `slackDays` per the table; call `keel remind add --soft … --slack … "<text>"`.
  3. For bubble, call `keel remind add --bubble "<text>"`.
  4. Conversational ratings ("got it" / "still fuzzy" / "forgot") map to `keel remind got|fuzzy|miss <id>`; "done with that" → `keel remind done <id>`.
  5. Confirm in one tight line (next-due, or box/interval for bubbles).
- **Rules:** skill owns language + time resolution; keel owns storage + surfacing. Never duplicate a stamped decision's prose into a bubble — note the handle and (v2) point a `ref` at the envelope.

## Testing — `reminders.test.mjs`

`node --test`, matching `core.test.mjs` style (pure functions only).

- `rateBubble`: `got` promotes one box; `got` at top box caps (stays at index 7, 365d); `miss` resets to 0; `fuzzy` leaves box unchanged; `nextTs` = now + BOXES[box]·day in each case.
- `reminderLines`: a not-yet-due approx is silent; in-band approx → `≈ due`; past-band → `⚠ overdue`; a due bubble → `🧠 recall`; a `dismissedTs>0` reminder never surfaces; ordering = overdue-approx → due-approx → due-bubble; truncation past the cap appends the `…+N more` line.
- back-compat: state with no `reminders` key yields `[]` and no lines.

## Reframe — ref-first (2026-06-08, post-approval) — RESCOPE BEFORE BUILDING

Rafa: *"most of my reminders are just the secretariat envelopes written to docs."* This flips the
center of gravity. The dominant case is **resurfacing already-stamped envelopes**, not authoring
free-text. Before implementing, rework the spec so:

- **Ref-bubble is primary.** A bubble's source is an envelope path (`ref`); `text` becomes a
  *cached headline* (display label resolved at enroll time), not the source of truth. Free-text
  bubbles remain, but secondary.
- **Verb shifts capture → enroll.** `/remind this <envelope>` (or auto-enroll on `/decision`
  stamp: "stamp → schedule its spaced return"). The skill resolves the envelope → headline via the
  secretariat MCP `read` at enroll time and passes it to `keel remind add --bubble --ref <path>
  "<headline>"`.
- **Surfacing stays keel-only.** keel renders the cached headline at session-start (no MCP, no
  plaintext — envelopes may be encrypted). "Dive" re-reads the full body via secretariat MCP
  `read`/`verify` on demand, Claude-side.
- **Architecture unchanged.** keel still owns mutable SRS state (`box`, `nextTs`) + `ref`; the
  envelope stays immutable + stamped. Storing reminders *inside* secretariat is still rejected.
  This only promotes the deferred `ref` seam to the front door.

The 7-task plan below was written pre-reframe (free-text-first). Adjust before execution: the `ref`
field moves from reserved-unwired to wired; add the enroll flow + headline caching; keel surfacing
reads `ref`-bearing bubbles the same way (text = cached headline).

## Out of scope (v1, deliberate — small appetite)

- Hard-dated reminders (→ Things).
- secretariat `ref` wiring (field reserved only).
- Front/back flashcards; SM-2 / FSRS (Leitner only).
- Recurring/cyclic reminders.
- Snooze.
- Per-turn (`handleUserSubmit`) re-surfacing.
