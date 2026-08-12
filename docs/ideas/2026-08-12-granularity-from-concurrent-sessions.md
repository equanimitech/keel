# Granularity from concurrent sessions — a load signal, not a body signal

The ceiling should tighten when several sessions are live at once. The operator's
idea, 2026-08-12, alongside shipping the tray control for the same dial.

## Why this is a different argument from the sleep one

The design spec already rejected driving the ceiling from body state: *"body
state is a covariate, not a tide. It never drives"* — because tired-therefore-
shallower is an inference a machine makes about its principal, and it fails in
the direction that hurts (flat days are when the machine should carry more).

Session count dodges that objection, and it is worth being precise about how.
It is not an inference about how Rafa *feels*. It is an observation about how
many places one reader is being asked to read at once — the machine measuring
its own fan-out. Four agents each returning a page is four pages competing for
the same attention, and the ceiling exists to regulate exactly that.

So the claim is narrower and more defensible: **the ceiling should track how
divided the reader is, and concurrency is the one part of that keel can see
without guessing.**

## The signal already exists

`summarizeEvents` (`apps/agent/core.mjs`) already computes `activeSessions` —
distinct `sessionId`s seen in the log within a 15-minute window — for
`keel log status`. Nothing new needs observing; the read is there.

## What it must not become

- **Not a floor by another name.** One session must not *raise* the ceiling.
  The whole point of the 2026-08-08 redesign is that the resting state is the
  ask; a rule that pins depth upward when alone re-introduces the constant that
  made the old dial never move.
- **Not silent.** A ceiling that drops because three terminals are open, with no
  line saying so, is under-delivery the principal cannot attribute. The existing
  cap-flag machinery ("this wants a page and today's ceiling is tldr") is the
  precedent — reuse it, naming the reason.
- **Not unoverridable.** The hand-set ceiling wins. Concurrency proposes.

## Shape worth trying

Compose it the way the night ceiling already composes: `min()` over the day's
ceiling and a concurrency cap, never a replacement. Roughly — 1–2 active
sessions imposes nothing, 3+ caps at `tldr`. Numbers are a guess; the honest
first step is to log the effective level alongside `activeSessions` (already a
should-have in the spec: *"effective level logged per turn, so the check is
measurable"*) and look at whether the depth actually delivered in fan-out
moments was one the principal read.

## The failure mode to watch

Three sessions can mean scatter — or it can mean one deep task correctly
parallelized, which is the case where shallower answers are exactly wrong. If
the log shows concurrency mostly tracks the second, the rule is dead and the
reachable dial (`keel granularity`, now the tray submenu) was the whole fix.

Related: `docs/superpowers/specs/2026-08-08-granularity-ceiling-design.md`.
