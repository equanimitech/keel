# Remove `apps/desktop`; preserve the compass gems by tag + this note

**Date:** 2026-06-13
**Status:** Accepted
**Supersedes nothing; follows** `2026-06-12-retire-the-intervention-layer-….md` and `2026-06-12-keel-productization.md`.

## Context

`apps/desktop` was keel's first surface: a macOS "attention compass" (Tauri + React + fp-ts, full DDD — 4,750 LOC / 62 files). The shield/signal/budget **intervention** layer was retired on 2026-06-12 and `apps/desktop` absorbed its intervention value objects locally. Since then the app has been **frozen and unused**: the tray now owns desktop activity logging, and keel is observability-first (interventions return later as a separate module — "P5" — built on personal baselines).

Keeping a frozen, fp-ts-coupled React/Tauri app in the active tree costs CI time, carries the repo's *only* fp-ts dependency, and complicates the domain-purity rule for no current benefit.

## Decision

**Remove `apps/desktop` from the monorepo.** Preserve the genuinely reusable ideas two ways:

1. **Archive tag `desktop-archive-2026-06-13`** — points at the last commit that still contains the full `apps/desktop` tree. Recover any file with `git show desktop-archive-2026-06-13:apps/desktop/<path>` or `git checkout desktop-archive-2026-06-13 -- apps/desktop`.
2. **This note** — the map of what's worth reviving for P5, so the *reasoning* isn't lost in deleted history.

We deliberately **did not** extract the code into `packages/domain` now: every gem is fp-ts-coupled (`Option`/`TaskEither`), the domain must stay fp-ts-free, and P5 will reshape these shapes against personal baselines anyway. Premature extraction would ossify them. Extract when P5 starts, de-fp-ts'ing as you go (`Option<T>` → `T | null`, `TaskEither` → plain async/`Result`).

## What to revive for P5 (paths are inside the archive tag)

### Highest value — the "steer toward flourishing" engine
- **Drift-detection algorithm** — `src/domain/services/DriftDetectionService.ts` + `FocusSession.isDriftedApp` (`src/domain/aggregates/FocusSession.ts`). Detects deviation from a declared intention. This is *literally* the alignment engine P5 needs.
- **`FocusSession` aggregate** — `src/domain/aggregates/FocusSession.ts` (187 LOC). Session lifecycle + time-boxing + progress. Seeds personal-baseline tracking and "budget" concepts.
- **`DriftEvent` entity** — `src/domain/entities/DriftEvent.ts`. The *shape of drift-pattern data* ("how often do I drift to YouTube while writing?") the baseline engine will analyse.
- **`Capture` entity** — `src/domain/entities/Capture.ts`. Quick reflective thought-capture — the user-agency half of steering.

### The behavioral-science layer (reasoning > code)
- **Intervention model** — `src/domain/valueObjects/Intervention{Type,Protocol,Config,Settings,Metadata}.ts` + `TriggerCondition.ts`. Four intervention types (notification / compass / stain / dialog), composable triggers (immediate / delayed / threshold / budget), and a BCT↔PDP registry (Michie et al.; Oinas-Kukkonen & Harjumaa). The code was retired; the *science mapping* is timeless and is what P5 extends.
- **Strategy pattern** — `src/domain/interventions/IIntervention.ts` (port) + `Compass.ts` / `Notification.ts` / `Stain.ts` / `CommitmentDialog.ts` (implementations) + `src/application/services/InterventionOrchestrator.ts`. How to add a new intervention type cleanly. The `IIntervention` interface is the natural contract for P5's intervention module.
- Background: `src/domain/INTERVENTION_REFACTOR.md` records why the model is composable + BCT-grounded.

### Reference only
- DDD layering (domain → application → infrastructure → UI), ports-and-adapters, and the `ServiceContainer` DI/bootstrap pattern — a study guide for keeping P5's domain pure.

### Dropped without preservation
All React UI (`src/ui/*`), Tauri adapters/persistence (`src/infrastructure/*`, `src-tauri/*`), and Vite/Rust/TS boilerplate. Surface-specific; P5 will have its own.

## Consequences

- The repo's only fp-ts dependency leaves with `apps/desktop`; the "fp-ts isolated to apps/desktop" rule is now moot.
- `scripts/sync-versions.js` is repointed from desktop → **tray** (the live Tauri app).
- The **`"desktop"` activity surface stays** — it's the macOS surface concept in `@keel/domain`, the tray, and agent config, unrelated to this app.
