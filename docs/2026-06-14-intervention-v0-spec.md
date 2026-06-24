# Intervention v0 — build spec (start here)

**Date:** 2026-06-14 · **Status:** ready to build (next session) · **Appetite:** small/medium — ship the two interventions + the measurement, nothing more.

## What this is

keel's first **interventions**, run as a **single-subject experiment**. Not "shields" (dead lexicon). An intervention = **mechanism (BCT) × delivery (trigger) × surface**. That 3-space is also the experiment's factor space.

The bet: AI-wait-gap micro-interventions + cue-removal, measured on Rafa's own data (no models, no 21-day gate — academic/heuristic prior now, personalize later). Drift is **binge-shaped** (youtube/shorts: 92% of views in runs of 5+), so the job is to break the chain.

## Reuse, don't rebuild

- **BCT science is LIVE:** `packages/domain/data/bct_taxonomy.csv` (93), `groupings.csv`, `mechanisms_of_action.csv`. Canonical — not the external skill's copy.
- **Intervention model (contract) is archived, science timeless:** `git show desktop-archive-2026-06-13:apps/desktop/src/domain/valueObjects/Intervention*.ts` + `TriggerCondition.ts` (triggers: immediate/delayed/threshold/budget) + `IIntervention` strategy. Reuse the contract; **do NOT** resurrect the desktop Tauri `InterventionOrchestrator`/UI.

## The two v0 interventions (points in mechanism × delivery × surface)

```
cue-removal :  BCT 12.3 (reduce cue exposure) +  × standing            × browser
               12.1 (restructure environment)                            (hide shorts shelf / feed)
breath-gap  :  BCT 8.4 (habit reversal) + 8.2     × JITAI               × tray or agent statusline
               (substitution) + 11.2 (reduce        (threshold: AI-gap    (guided breath; protocol
               neg. emotion) + 12.4 (distraction)   > ~30s)               model from archived stillwatch)
```

Caveat: axes are NOT orthogonal — **surface gates feasibility** (cue-removal needs an in-page/browser surface; breath needs tray/agent). Encode valid combos, not a free cartesian.

## Build (smallest that measures)

1. **Intervention as data** — a small file: each entry `{ id, bctIds[], delivery, surface, target }` referencing a live BCT id. Two entries. (Not an engine — data + a thin dispatch per surface.)
2. **cue-removal (Prong A, the proven win first):** a browser content script mirroring `entrypoints/sensor.content/` that injects `display:none` for shorts-shelf / feed selectors (selectors as data, like `adapters.ts`). The senses (`feed.ts`, `video.ts`) already run on these pages — reuse their DOM knowledge.
3. **phase-marker log (the experiment's spine):** when any intervention flips on/off, write a `intervention_phase` event `{id, on/off, ts}` through the existing writer → `~/.keel/log`. Now the log carries the A/B timeline beside the dependent variable (which is already logged: shorts `video_started`/day, feed `post_seen`/day, binge runs).
4. **breath-gap (Prong B):** gap heuristic from the agent log (`tool_dispatched` w/o completion > Ns) → guided breath (port stillwatch's `breathe::Protocol`/`Phase` *data*, ~20-line pacer, not the C++ engine). Must gate on receptivity (never mid-flow) — else it's an attention-grab, violating calm-tech.
5. **readout / visual analysis:** daily DV with phase-onset markers, surfaced in **weekly-review** (SCED is visual analysis — read the graph, no stats engine). This is also the over-time viz; Zenborg-cycle overlay bolts on later from the vault's cycle dates.

## Experimental design

**Multiple-baseline across vices** (recommended over ABAB): stagger intervention onset (shorts wk1 → feed wk2 → chess wk3). Causal if each drops only at *its own* onset — no withdrawal, so you keep escalating the help. Each (mechanism×delivery×surface) point = one staggered condition.

## Out of scope (v0)

- The distribution/carve refactor (parked — `~/.claude/plans/iridescent-meandering-cat.md`).
- Driver-kind generalization, `@keel/core` extraction, plugin packaging.
- DNR `/shorts` hard-block (optional add; v0 = CSS cue-removal).
- Wheel / rich intervention UI (after the breath nudge proves out).
- Stats engine, Zenborg overlay (visual analysis + later).

## Open

- Surface for breath: tray popup vs agent statusline nudge (tray = richer, agent = zero new surface).
- Receptivity gate for the breath JITAI (gap length + time-of-day heuristic to start).
