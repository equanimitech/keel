# keel: one big red button — multi-day compulsion commitment

> Captured 2026-06-05, late. Sibling to the snack-window Drogue spec.

## The want

One big red button on the website. Press it → fight a compulsion for **multiple days**.
A user-armed, fixed-end lockdown. Cold-turkey on a timer.

## In the model

It's a **commitment driver** — the second driver kind alongside the **schedule driver**
(nightly / snack-window). Same render path:

```
driver (commitment, armed for N days) → friction = block → notch → DNR block
blocked(now) = compulsionBlocked(now) || commitmentActive(now)
```

`commitmentActive(now) = now < armedUntilTs`. Set once, persisted in chrome.storage.local,
survives restart. No un-arm button (or only a scarce, effortful one) — the point is you
**can't** take it back for N days. That irreversibility is the feature.

## Open questions

- Duration: fixed (e.g. 3 days) or user-picks-at-arm-time?
- Targets: the same compulsion area as the snack window, or pick-per-arm?
- Any escape at all? keel-gate has scarce skip credits. A commitment button arguably should
  have *fewer* or *none* — it's a stronger promise than the nightly gate.
- Confirmation friction at arm-time (type-to-confirm?) so it isn't pressed idly.

## Why it matters

The schedule driver protects you on autopilot (every night/day). The commitment driver lets
you make a **deliberate stand** against a specific compulsion for a stretch — the thing you
reach for on a bad day. Two drivers, one drogue engine.

Depends on / extends: `docs/superpowers/specs/2026-06-05-snack-window-drogue-design.md`.
