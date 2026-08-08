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
                    ┌──────────── Things.sqlite ────────────┐
                    │          (Cultured Code's data)       │
              WatchPaths                              WatchPaths
                    │                                       │
                    ▼                                       ▼
        launchd: wake-things-sync              launchd: keel-dispatch
                    │                                       │
              export markdown                     classify (lfm2.5 ×5)
                    │                                       │
              ~/things  ── pond ──►  wake          unanimous? ──no──► leave
                                       │                    │
                                  wake index                yes
                                       │                    │
                                    recall          Things area │ Linear Backlog
                                                             │
                                                   keel activity log
```

**Two independent launchd agents**, each with `WatchPaths` on both
`main.sqlite` and `main.sqlite-wal` (Things is WAL-mode; both change on write).
No resident process; each runs and exits.

They share a trigger and nothing else. Either can be disabled without
affecting the other.

### Ownership

The `things` pond belongs to **wake**, over Cultured Code's data. keel does not
own it, appear in it, or read it — the dispatcher reads the Things SQLite
directly. Nothing in keel is a wake pond, and wake never reads keel's log.

The exporter is therefore a wake-side concern, not a keel one: it is the shape
`wake sync` already implements ("pull an external source into a repo's vault,
then reindex"), and it should live there rather than in keel's agent surface.

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
`~/.kairos/areas.json` through the existing `~/.kairos/things-area-map.json`,
restricted to the areas that actually carry a zenborg mapping (9 of 15 map
entries today). Free-text areas were the single largest source of nonsense in
testing: both models invented areas (`"email"`, `"Inbox"`) when given no list.

Two details of enum construction are load-bearing, both measured:

- **Strip emoji from the labels.** The raw labels are emoji-prefixed
  (`"🦦 Mindfulness"`, `"⚖️ Themia"`).
- **Gloss each area in the prompt.** The names are private vocabulary — a
  model cannot know that `Vereador` means friends, `Gomas` means the house, or
  `Wealthy` means accounting and taxes. A one-line gloss per area is required,
  and is the single highest-yield input in the pipeline.

Together these took accuracy from 1/6 to 3/6 on the same fixtures.

### 3. Reversibility gate

The safety spine. Enforced in construction, not intention — the dispatcher can
only emit destinations that are undoable:

| destination | action | reversible |
|---|---|---|
| `things-area` | move to a mapped area | yes |
| `linear-backlog` | create issue in Backlog | yes |
| `leave` | nothing | n/a |

Anything that is not a unanimous, mapped match becomes `leave`. Specifically: a
split vote (see below), an unmapped Things area, a malformed model response, or
an unreachable model. This is the guarantee `/triage` already makes — ambiguous
items stay in the inbox.

### The gate is unanimity, not confidence

The capture is classified **5 times at temperature 0.8**, and dispatches only
if all five samples agree. A split vote means `leave`.

This replaces an earlier design that gated on the model's self-reported
confidence. That was measured and does not work — see Evidence. Self-reported
confidence carries no information about correctness; sample agreement does.

The model stays loaded for the duration of one batch (`keep_alive: "5m"`) so
the five samples cost one load, then unloads.

**Zenborg moment creation is out of scope.** It is the one obvious dispatch
target that is not cleanly reversible, and it would mean keel writing a kernel
collection.

## The log

Every decision — including `leave` — appends one `ActivityEvent`:

- `surface: "agent"` (no new surface; the union stays closed)
- `kind: "capture_dispatched"` — past tense, so a **completion** under the
  event-taxonomy grammar, not a span or a switch
- payload: capture id, destination, model id, the **full vote distribution**
  (e.g. `{"Mindfulness": 2, "Themia": 3}`), and the capture title

The vote distribution rather than a score. It is the actual decision input, it
makes a `leave` self-explanatory, and it is the evidence for later tuning of
the area glosses — a capture that splits the same way repeatedly names a gloss
that needs work.

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

## Evidence

Measured on this machine, 2026-08-08, against the 9 real mapped areas. Six
fixture captures, five of them routable and one deliberately meaningless.

**Ollama request options.** Uncapped, ollama sized the context at the model's
full 256k window: the same call reported 41 GB and took 47s. With
`num_ctx: 2048` it took 1.4s. Asking for "JSON only" in the prompt was ignored;
`format` with a JSON schema was obeyed. `keep_alive: 0` leaves nothing
resident — `ollama serve` idled 18 days at 0.0% CPU and 22 MB RSS with no model
loaded.

**Model choice is not the lever.** `lfm2.5` and `qwen3:4b` both answered
correctly and fast on a trivial routing case (3.7s and 2.3s cold). Both
invented garbage areas when given no enum. The inputs — enum, glosses, gate —
dominate.

**Self-reported confidence is noise.** Single-shot with emoji labels and no
glosses scored 1/6, and returned 0.92 for every single capture including the
wrong ones. With clean labels and glosses it scored 3/6, and confidence still
failed to separate: correct answers scored 0.92 / 0.85 / 0.95, wrong ones
0.82 / 0.85 / 0.92. **A confidence floor at any threshold would have dispatched
roughly half the captures to the wrong area, silently and at high stated
confidence.** Two of the six single-shot failures were mis-files above 0.8,
not abstentions.

**Unanimity is signal.** Five samples at temperature 0.8, dispatching only on
5/5 agreement: 2 captures unanimous, both correct; 4 split, all left in the
inbox; **0 wrong dispatches**, including the meaningless one. Precision 2/2,
recall 2/5 of the routable captures.

That trade is the design: the dispatcher is silent more often than it acts, and
wrong essentially never. Recall is recovered by improving the glosses using the
logged vote distributions, not by lowering the gate.

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
  `areas.json` + `things-area-map.json`, omits unmapped areas, and strips emoji
- the unanimity gate returns `leave` for a split vote, an unmapped area, and a
  malformed response — and dispatches only on 5/5
- the offset advances before the action, and a second run over the same input
  dispatches nothing

## Deliberately skipped

No queue, no retry ladder, no resident daemon, no new MCP server, no dedicated
UI. The activity log is the evidence; add machinery when it shows a need.

## Open thread

The dispatcher is an *enforcer*, which sits against the position taken in
`docs/ideas/2026-08-07-keel-as-witness-not-enforcer.md`. The reconciliation is
that dispatch is bounded to reversible actions, gated on unanimity, and fully
logged — and that `/triage` already dispatches with a human in the loop.

If the log shows the gate firing wrongly, the correct response is to improve
the area glosses or narrow the destinations — never to weaken the gate. The
measured alternative to unanimity was a confidence floor that mis-filed half
the fixtures while reporting 0.92.

The fallback, if unanimity's recall proves too low in practice to be worth the
machinery, is the *suggest* shape: identical classification, but the dispatcher
only writes proposals and you accept them in a batch. That is a strictly
smaller change than it sounds — it removes the act step and keeps everything
else, and it is the shape the witness-not-enforcer note argues for.
