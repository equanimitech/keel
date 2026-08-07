# The intention is the active moment

**Date:** 2026-08-07
**Status:** accepted (keel half implemented; zenborg half outstanding)

## Problem

keel owned its intention. `watchIntentions` — a keel-local, day-scoped map of
watch → free text in `~/.keel/state.json`, set with `keel intention "…"` and
inferred by a per-session nudge.

But zenborg already has the intention primitive: a **moment** (1–3 words, an
area, a day, a phase). Two systems held the same concept and neither knew about
the other, so the string in keel's HUD and the moment on the board drifted apart
by construction.

kairos is the kernel. The intention belongs to it, the way areas and day notes
already do.

## Contract

A new vault file, `$KAIROS_HOME/activeMoment.json`:

```json
{ "momentId": "80d0f15a-b811-4262-95ab-5d6eb9e3399d", "at": "2026-08-07T13:40:12.222Z" }
```

Zenborg is the only writer — via MCP or the UI. keel reads it exactly as it
reads `areas.json` and `dayNotes.json`: same seam, same direction, never writes.

**Why a pointer file, not a flag on the moment.** 900+ moment records never need
rewriting, and "exactly one is active" becomes structural rather than an
invariant every writer must remember to clear.

## Resolution

`resolveActiveMoment(pointer, moments, areas, now)` is pure. It returns
`{ id, name, area, emoji }`, or `null` when the intention cannot be established:
no pointer, garbled JSON, an unknown id, or a moment belonging to another day.

An unreadable vault therefore degrades to *no intention*, never to a wrong one.

**Staleness needs no clearing pass.** The pointer is honoured only while the
moment it names sits on the current waking-day (`focusDayKey`, the 04:00 roll).
Yesterday's pointer stops resolving on its own.

**Phase is deliberately not matched.** An afternoon moment is still what you are
doing at 20:05 — until you switch it in zenborg.

## Surfacing

- **session-start** — `[keel] ◎ intention: staging release (Themia) — capture drift (idea/pain), hold the thread.`
- **HUD** — `◎ staging release`
- **user-submit** — once per session, only while nothing is active: keel lists
  today's board and asks the agent to infer what the session is actually doing,
  propose the closest moment (or a new one), and set it in zenborg **on the
  user's yes**. keel cannot set it itself; the writer lives outside the box.

## Removed

The watch-intention layer goes entirely, rather than staying as a fallback — one
source of truth was the point.

- State: `watchIntentions`, `intentionDay`
- core: `setIntention`, `rollIntentionDay`, `activeIntention`
- `keel intention "…"` no longer sets anything. It prints the active moment and
  points at zenborg, so an old caller degrades to a message instead of silence.
- `keel focus "<label>"` no longer names the stream. Focus is the gear; the
  active moment is the label.

## Outstanding — the zenborg half

Zenborg must ship a writer: a `set_active_moment` MCP tool and a UI affordance,
both writing `activeMoment.json`.

Until it does, keel resolves nothing, the nudge fires every session, and the
intention stays silent. That is the intended failure mode, not a broken one.
