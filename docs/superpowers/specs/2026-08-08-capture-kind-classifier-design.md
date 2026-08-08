# Capture Kind Classifier — Design Spec

**Date:** 2026-08-08
**Status:** approved, not yet implemented
**Relationship:** the shared foundation under
`2026-08-08-things-capture-routing-design.md` (spec A, area routing — blocked)
and under a future command-lane spec (spec B, unwritten).

## Problem

Captures land in the Things inbox all day and sit there undifferentiated. They
are not the same kind of thing: some are software work an agent could execute,
some are team work belonging in a tracker, some only the human can do, and some
are notes with no action at all. `/triage` sorts them correctly but only when
the human sits down, and it starts from zero every time.

The obvious move — classify each capture straight to its destination area — was
built and measured, and **it does not work**: 37% of the actions it took on real
captures were wrong (spec A, "Held-out eval on real captures"). Routing to an
area requires knowing who a person is, and no prompt over area descriptions
supplies that.

## Solution

Classify the **kind** of a capture rather than its destination, and **propose
rather than act**.

Kind is carried by verbs and sentence structure, not by private knowledge about
people, so it is reachable by a local model. The classifier writes one event per
capture and renders a daily digest. It never writes to Things, Linear, or any
repository, so there is no reversibility question to answer.

## Kinds

| kind | meaning |
|---|---|
| `agent_command` | concrete software work an AI coding agent could execute |
| `team_issue` | product/team work belonging in a tracker, not for an agent to just go do |
| `personal_action` | something only the human can do in the physical or social world |
| `reference` | a note, link, book, idea — no action implied |
| `unclear` | the vote split; see below |

An open set in spirit but a closed enum in the schema: adding a kind is a
deliberate edit, because each kind implies a lane.

## Architecture

```
Things.sqlite ──WatchPaths──► launchd: keel-classify
                                        │
                              classify (qwen3.6:35b ×5)
                                        │
                              unanimous? ──no──► unclear
                                        │              │
                                       yes             │
                                        └──────┬───────┘
                                               ▼
                                    keel activity log
                                               │
                                        daily digest
                                               │
                                          /triage reads it
```

No resident process. One launchd agent, `WatchPaths` on `main.sqlite` and
`main.sqlite-wal` (Things is WAL-mode; both change on write). Each fire
processes every capture newer than the offset, so bursts amortize into a single
model load.

## Components

### 1. Classifier

Reads captures newer than a last-seen id in `~/.kairos/keel/state/`. For each,
five samples from `qwen3.6:35b` over the local ollama HTTP API.

Request options, all established by measurement (see Evidence):

- `keep_alive: 0` — nothing resident between events. Idle draw stays at zero.
- `options.num_ctx: 2048` — uncapped, ollama sizes the context at the model's
  full window; the same call took 47s and reported 41 GB instead of ~1s.
- `options.temperature: 0.8` — sampling must vary or the vote is theatre.
- `format` — a JSON schema. A prompt asking for "JSON only" was ignored.

Unanimous across five samples → that kind. Otherwise → `unclear`.

**The vote distribution is retained either way.** On this task, unlike area
routing, splits genuinely mark ambiguity — so a split is a finding about the
capture, not noise to discard.

### 2. Log

One `ActivityEvent` per capture:

- `surface: "agent"` — no new surface; the union stays closed
- `kind: "capture_classified"` — past tense, a **completion** under the
  event-taxonomy grammar
- payload: capture id, classified kind, full vote distribution, model id, and
  the capture title

#### Privacy decision: the title is logged, capped at 256 chars

keel's stated posture is that payloads carry "domains and timings — never full
URLs, prompts, or page content." A capture title is user content, so this
widens the payload, and by the repo's own rule that is a design decision rather
than an implementation detail.

It is taken deliberately: a digest that cannot name what it classified is not
reviewable, and reviewability is the entire point of proposing instead of
acting. The cap is 256 characters, matching the existing window-title cap — the
established precedent for content-bearing strings in this log.

### 3. Digest

A daily render of those events, grouped by kind. For `agent_command` entries it
carries a ready-to-fire invocation built from the capture text.

**The invocation does not name a repository.** Inferring the target repo is a
second classification problem with the same entity-knowledge weakness that sank
area routing — the capture rarely names it, and guessing wrong sends work at
the wrong codebase. The rendered command is run from wherever the human already
is, which they know and the model does not. Revisit only if the digest shows
the repo being obvious in practice.

**Preparation is a rendered command, not staged work.** No worktrees, branches,
or plans are created speculatively — most proposals will not be run today, and
work done for them is waste. Prepare on demand, at the moment of firing.

This is the digest described in
`docs/ideas/2026-08-07-keel-as-witness-not-enforcer.md`; this spec gives it
something to report.

### 4. `/triage` integration

There is no accept flow, no second inbox, and no new UI. `/triage` already
reads the Things inbox and routes it with the human in the loop; it now finds
each item pre-labelled with a kind and a vote distribution, so the existing
ritual starts warm instead of cold.

The classifier competes with nothing. If it is switched off, `/triage` works
exactly as it does today.

## What this deliberately does not do

- **No area classification.** Measured at 37% wrong on real captures. It stays
  out until entity knowledge exists — see spec A's preconditions.
- **No execution.** `agent_command` means *this looks executable*, not *run
  it*. The human fires it. A wrong kind therefore costs a glance, not a
  rollback.
- No Linear writes, no Things writes, no worktree preparation, no queue, no
  retry ladder, no resident daemon, no new MCP server.

## Evidence

Measured on this machine, 2026-08-08, on real captures. Titles stay local and
are not reproduced here.

**Kind is reachable where area is not.** On 11 real captures, 7 classified
unanimously: software tasks as `agent_command`, a tracker-bound backfill as
`team_issue`, a social commitment as `personal_action`, a saved link and an
idea note as `reference`.

All seven look correct, but this is the spec author's judgement on a sample of
eleven, **not a labelled evaluation** — unlike the area eval, which was scored
against where the human had actually filed each capture. The claim here is much
weaker than the area result, and it is weaker in the safe direction: it argues
for proposing, not for acting.

**Splits landed on genuinely ambiguous captures** — a vague "turn this into a
proper CRM", a half-note about a book. This is the important contrast with area
routing, where the model was *confidently and consistently* wrong and unanimity
provided no protection at all. Sampling catches ambiguity; it cannot catch a
knowledge gap. Kind classification has ambiguity but no knowledge gap.

**Model.** `qwen3.6:35b` at 8.2s cold load, ~0.9s per vote; 55 calls in 37s. It
costs 23 GB transiently and then unloads. Smaller models were measured on the
harder area task, where `lfm2.5` (2.6B) reached 2 of 5 against the large model's
5 of 5; the small models have not been re-measured on kind classification, and
may well suffice — see Open threads.

## Error handling

- **Model unreachable or malformed output** — log the failure, leave the
  capture unclassified, retry on the next fire. No retry ladder.
- **Crash mid-run** — the offset advances before the event is written, so a
  crash skips a capture rather than double-classifying it. A skipped capture is
  visible in the inbox; a duplicated digest line is silent noise.
- **launchd re-fires while running** — the offset file is the interlock; a
  second run finds nothing new and exits.

Every failure mode degrades to "the capture is simply not labelled", which is
the status quo before this exists.

## Testing

`node --test` on plain `.mjs`, per the agent surface's convention. The ollama
call is stubbed; no model runs in the suite.

- the kind schema is built with the closed enum plus `unclear`
- five agreeing samples produce that kind; any disagreement produces `unclear`,
  and the vote distribution survives in both cases
- the digest renders grouped by kind from a fixture set of events, and
  `agent_command` entries carry an invocation
- the offset advances exactly once per capture, and a second run over the same
  input emits no events

## Open threads

**Model size — resolved, the large model is required.** Re-running the same 11
captures against `lfm2.5` (2.6B): 5 of 11 unanimous against the large model's
7, but the quality is far worse than the count suggests. The small model
collapses toward `reference` as a safe default — it labelled a plain UI code
task and an investigation task `reference`, one of them unanimously, and read a
tracker-ticket backfill as `agent_command` where the large model correctly said
`team_issue`.

That is the same failure signature as the area task: **unanimous and wrong**,
so the gate provides no protection. The 23 GB transient cost stands.

**The kinds may be wrong.** Four kinds is a guess that survived one sample of
eleven captures. The digest's own record is the evidence for splitting or
merging them, and that evidence should be read before the enum is edited.
