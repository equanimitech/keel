# Things Capture Routing — Design Spec

**Date:** 2026-08-08
**Status:** approved, not yet implemented

## Problem

Captures land in the Things inbox all day — from `/idea`, `/pain`, `/question`,
and by hand. Two things then fail to happen.

They are never **recalled**. The inbox is a write-only hole: a thought captured
in March never surfaces when you write about the same person or project in
August. Meanwhile `wake` already indexes four ponds of journals and can search
across them. Things is not one of them.

They are never **dispatched** without you. `/triage` routes the inbox correctly,
but only when you sit down and run it. Between runs the inbox accretes.

## Solution

Split the two along the invariant that already governs both codebases:

**wake reads, keel acts.**

Things joins wake as a fifth read-only pond, so captures become searchable
beside the diary. Separately, a keel dispatcher classifies new captures with a
local model and files the ones it can file **reversibly**, logging every
decision to keel's existing activity log.

Neither existing invariant bends. wake keeps sources read-only. keel writes only
its own subtree and never the kernel's collections.

## Architecture

```
Things.sqlite ──WatchPaths──► launchd agent
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
              export + reindex              dispatch
                    │                             │
              ~/things (pond)              classify (lfm2.5)
                    │                             │
              wake index ◄── recall          reversible? ──no──► leave
                                                  │
                                                 yes
                                                  │
                                        Things area │ Linear Backlog
                                                  │
                                        keel activity log
```

One launchd agent, `WatchPaths` on both `main.sqlite` and `main.sqlite-wal`
(Things is WAL-mode; both files change on write). No resident process. The
agent runs two steps in sequence and exits.

## Components

### 1. Exporter — `things-export`

Reads the Things SQLite **read-only**, writes one markdown file per day of
captures into `~/things`, a plain directory. Ponds do not require git —
`~/journals` is already a registered plain-dir pond.

Registered in `~/.wake/sources.yaml`:

```yaml
- { name: things, path: ~/things, private: true }
```

`private: true` keeps it behind wake's guard, matching every other pond.
Followed by `wake reindex ~/things`.

This component never writes to Things. Writes to Things, if ever needed, go
through the `things:///` URL scheme — never the database.

### 2. Dispatcher — keel agent surface

Reads captures newer than a last-seen id held in `~/.kairos/keel/state/`.
Classifies each with `lfm2.5` over the local ollama HTTP API at
`keep_alive: 0`, so no model stays resident between events.

Three request options are load-bearing, established by benchmark:

- `keep_alive: 0` — nothing resident; measured cold load ~3s.
- `options.num_ctx: 2048` — without a cap, ollama sizes the context at the
  model's full window and the same call took 47s and reported 41 GB.
- `format` — a JSON schema, not a prompt instruction. Asking for "JSON only"
  in the prompt was ignored.

The schema's `area` field is an **`enum` built at runtime** from
`~/.kairos/areas.json` through the existing `~/.kairos/things-area-map.json`.
Free-text areas were the single largest source of nonsense in testing: both
models invented areas (`"email"`, `"Inbox"`) when given no list. Constraining
the enum matters more than model size.

### 3. Reversibility gate

The safety spine. Enforced in construction, not intention — the dispatcher can
only emit destinations that are undoable:

| destination | action | reversible |
|---|---|---|
| `things-area` | move to a mapped area | yes |
| `linear-backlog` | create issue in Backlog | yes |
| `leave` | nothing | n/a |

Anything that is not a confident, mapped match becomes `leave`. Specifically:
confidence below **0.8**, an unmapped Things area, a malformed model response,
or an unreachable model. This is the guarantee `/triage` already makes —
ambiguous items stay in the inbox.

The 0.8 floor is a starting value, not a tuned one. It is deliberately high:
the cost of a wrong file is your trust in the whole mechanism, and the cost of
a `leave` is that the item sits where it already was. Move it only on evidence
from the log.

**Zenborg moment creation is out of scope.** It is the one obvious dispatch
target that is not cleanly reversible, and it would mean keel writing a kernel
collection.

## The log

Every decision — including `leave` — appends one `ActivityEvent`:

- `surface: "agent"` (no new surface; the union stays closed)
- `kind: "capture_dispatched"` — past tense, so a **completion** under the
  event-taxonomy grammar, not a span or a switch
- payload: capture id, destination, confidence, model id, and the capture
  title

### Privacy decision: the title is logged, capped at 256 chars

keel's stated posture is that payloads carry "domains and timings — never full
URLs, prompts, or page content." A capture title is user content, so this
widens the payload, and per the repo's own rule that is a design decision
rather than an implementation detail.

It is taken deliberately. An audit log that cannot name what was filed cannot
be audited — the log is the thing that keeps auto-dispatch honest, and a log of
opaque ids does not do that job. The title is capped at 256 characters, the
same cap already applied to window titles, which is the existing precedent for
content-bearing strings in this log.

## Error handling

- **Model unreachable or malformed output** — log the failure, leave the
  capture, retry on the next fire. No retry ladder.
- **Crash mid-dispatch** — the last-seen id advances *before* acting. A crash
  therefore skips a capture rather than filing it twice. This is the deliberate
  direction of failure: a skipped capture is visible to you in the inbox, where
  a duplicate Linear issue is silent noise.
- **launchd re-fires while running** — the offset file is the interlock; a
  second run sees no new captures and exits.

## Testing

`node --test` on plain `.mjs`, per the agent surface's convention. The ollama
call is stubbed; no model runs in the suite.

- the areas-enum builder produces the right enum from a fixture
  `areas.json` + `things-area-map.json`, and omits unmapped areas
- the reversibility gate returns `leave` for: below-floor confidence, an
  unmapped area, and a malformed response
- the offset advances before the action, and a second run over the same input
  dispatches nothing

## Deliberately skipped

No queue, no retry ladder, no resident daemon, no new MCP server, no dedicated
UI. The activity log is the evidence; add machinery when it shows a need.

## Open thread

The dispatcher is an *enforcer*, which sits against the position taken in
`docs/ideas/2026-08-07-keel-as-witness-not-enforcer.md`. The reconciliation
is that dispatch is bounded to reversible actions and fully logged, and that
`/triage` already dispatches with a human in the loop. If the log shows the
gate firing wrongly, the correct response is to narrow the destinations, not to
add confidence tuning.
