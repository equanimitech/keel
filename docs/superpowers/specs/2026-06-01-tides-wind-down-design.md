# Tides v1 — Nightly Wind-Down — design

**Date:** 2026-06-01
**Surface:** keel desktop (Tauri/macOS); consumes shared `@keel/domain` primitives
**Status:** design, approved in brainstorming — ready for implementation plan
**Lineage:** EquanimiTech *Strategic Friction* (`docs/superpowers/specs/2026-06-01-strategic-friction-design.md`); observer model adapted from **ActivityWatch** (buckets/events, heartbeat+pulsetime, watcher separation); persistence pattern from **Secretariat / Pensieve** (markdown-king for human-facing artifacts)
**Depends on:** the rename to `keel` (`docs/superpowers/plans/2026-06-01-rename-equanimi-to-keel.md`) and the shared `Friction` value object + `frictionCurve()` introduced by the Strategic Friction browser slice (Part IV). Both are shared primitives; whichever slice lands first creates them.

---

## Part I — Where it fits

keel desktop becomes an **observer and interventionist**. This slice builds the first honest version of both halves and makes desktop the first non-browser **arm** in the Strategic Friction model.

**The interventionist half** adds a fourth driver to Strategic Friction's roster. The parent doc names three driver slots — `usage-vs-budget`, `manual`, and the reserved-empty `detected-compulsion`. This adds:

- **`wind-down`** — computes `f` from your *declared* nightly intention crossed by the *clock*. Analogous to `usage-vs-budget`: you set the line (a wind-down time), the system raises the cost of crossing it. It makes **no claim to detect your inner state** — honesty constraint inherited from the primer (no validated instrument for equanimity / for "compulsion").

`detected-compulsion` stays reserved and unbuilt. But — see Part II — this slice begins **collecting its future training inputs**.

**The observer half** is generalized from ActivityWatch: a small set of **watchers** that each emit a stream of durationful **events**. Watchers are pluggable sensor sources; this slice ships exactly one (window) and reserves the rest.

```
 WATCHERS ──emit──▶ EVENTS ──derive──▶ cadence/rollup    (observer)
                       │
 CONFIG + CLOCK ──▶ wind-down driver ──▶ f ∈ [0,1] ──▶ stain → hard-lock   (interventionist)
```

### Two honesty guards (inherited, load-bearing)

- **No outcome claims.** Copy and comments may say keel *raises the cost of the compulsive path*; never that it *produces* equanimity or *detects* compulsion.
- **Near-enemy (indifference).** When a coding app is not frontmost, or the clock is before wind-down, `f = 0` and keel is invisible. Friction targets *drift past your own line*, not *coding*.

---

## Part II — The observer (watchers → events)

### Watchers (pluggable sensor sources)

| Watcher | Emits | Status |
|---|---|---|
| **window** | frontmost app + window title, with dwell duration | **built** |
| afk | `afk` / `not-afk` from keyboard/mouse idle (~3 min, AW default) | **reserved slot** — "different sensor source, not needed now" |
| editor | actively edited file / project / language | **reserved slot** (needs editor plugins) |

A watcher is a source of events. Adding `afk` later adds a stream and (optionally) a new presence gate on the driver — it does not touch the event model, persistence, or the wind-down driver.

### Event model (adapted from ActivityWatch)

The atom is a **durationful event**, not an on-change ping. keel's current Rust loop (`x_win`, emits only on app change, no duration) is upgraded:

```jsonc
// one JSON object per line
{
  "ts": "2026-06-01T23:41:07Z",   // ISO-8601 UTC, start of the event
  "duration_s": 184.2,             // dwell, seconds
  "watcher": "window",             // provenance (AW lesson #5)
  "host": "rafa-mbp",              // provenance — multi-device clean later
  "data": { "app": "Cursor", "title": "tides-design.md — keel" }
}
```

**Heartbeat + pulsetime coalescing (AW).** The tracker emits periodic heartbeats; consecutive heartbeats with identical `data` merge into one event whose `duration_s` spans them, tolerating gaps up to a `pulsetime` (so a 2-second blur of focus doesn't shatter a session). This yields accurate dwell without a per-second firehose. Implementation may coalesce in the Rust layer or in a thin TS observer consuming `window_changed`; either way the **written** stream is coalesced events.

### Switch cadence (the future-training payload)

From the event stream keel derives, per day:

- **switches/hour** (and a rolling rate)
- **median dwell** per app and overall
- **longest unbroken coding stretch**

This is the behavioral texture the reserved `detected-compulsion` driver will one day train on. **v1 records it and does not act on it.** Observe now, earn the right to intervene later.

### Persistence (split by access pattern)

Markdown is king for what a human or a future trainer *reads*; JSONL for the raw sensor firehose nobody reads by hand.

| Data | Nature | Format | Path |
|---|---|---|---|
| Raw window events | high-freq, append-only, machine | **JSONL** | `~/.keel/observations/YYYY/MM/DD.jsonl` |
| Daily rollup (coding mins, switches/hr, median dwell, friction peak, lockouts) | derived, human-readable | **Markdown + frontmatter** | `~/.keel/observations/YYYY/MM/DD.md` |
| Tide config (coding apps, W/H/R) | edited by the user | **Markdown frontmatter** | `~/.keel/config.md` |

- Writes are **append** for JSONL (no parse-rewrite per event).
- The daily `.md` is **generated/updated from** that day's `.jsonl` (rollup is derived, never hand-authored).
- The existing binary `store.bin` (sessions / captures / drift) is **untouched** this slice; migrating it to markdown is explicitly out of scope.

Example daily rollup frontmatter:

```markdown
---
date: 2026-06-01
coding_minutes: 412
switches: 287
switches_per_hour_peak: 61
median_dwell_s: 73
longest_coding_stretch_min: 96
friction_peak: 1.0
lockouts: [{ at: "2026-06-02T01:00:00Z", released: "2026-06-02T05:00:00Z" }]
---

# 2026-06-01

(prose notes / future annotations live here)
```

---

## Part III — The driver (`wind-down`)

### The arm

A **declared set of coding apps** (by macOS app name; bundle id where available), edited in Preferences and stored in `config.md` frontmatter. Friction on the coding arm is `0` whenever **no coding app is frontmost** or the clock is **before wind-down**.

### The curve (f over the night)

Three configurable times (per-person tactics — tune later; do not burn the project on constants):

| Knob | Default | Meaning |
|---|---|---|
| **W** — wind-down | 23:30 | `f` begins ramping from 0 |
| **H** — hard-stop | 01:00 | `f` reaches 1 |
| **R** — reset | 05:00 | `f` releases to 0; new observation day |

While a coding app is frontmost:

- `W ≤ now < H` → `f = frictionCurve(now, W, H)` (the **shared** curve from the Strategic Friction browser slice — same primitive, reused).
- `H ≤ now < R` → `f = 1`.
- otherwise → `f = 0`.

`f` is the shared branded `Friction` value object. The driver is a **pure function** `(frontmostApp, now, config) → f` — testable with no GUI, no clock injection beyond a passed `now`.

---

## Part IV — The renderer (ladder on desktop)

keel cannot reach inside Cursor / Terminal; it renders its own overlays on top (it already runs as a macOS **Accessory**, above fullscreen). Two rungs of the Strategic Friction ladder (`hide < dim < delay < blur < block`) apply:

- **`dim` → StainOverlay (reused).** The existing full-screen radial wash (`StainOverlay.tsx`, its own Tauri WebviewWindow, opacity driven by a 0–100 `progress`) is driven by `f`: `stain.progress = f × 100`. A warm wash that deepens as the night goes — gain-reduction *before* the wall. (Today it's wired to drift and disabled-by-default; this slice re-points it at `f`.)
- **`block` → hard-lock cooldown window.** At `f = 1`, a cooldown overlay window ("land the plane — break until 05:00"), minted via `TauriOverlayManager` the same way the stain window is. It re-asserts on any attempt to bring a coding app frontmost, until **R**.

### Decision recorded: hard lock overrides compass-not-cage for this arm

The parent doc is emphatic — *"Not a cage. It never hard-blocks in the name of control."* This slice **deliberately departs** from that for the deep-night coding arm: between **H** and **R** the lock has **no escape hatch**.

**Reasoning (and the risk):** the mission is literally *"stop me from coding until 3AM."* Sleep is a special case where the user's considered, declared intention ("do not let me code through the night") should beat the in-the-moment urge — the lock *is* the intention, asserted in advance against a predictably-compromised later self (Ulysses-pact framing). The accepted risk: resentment, or the user killing keel / switching machines. If that materialises, the fallback is the parent doc's escapable-with-friction model (hold-to-continue / type-why), or a ratchet (escapable early, hard-lock only 02:00–05:00). Those are *not* built now; this records why and the off-ramp.

---

## Part V — Architecture, data flow, components

### Data flow

```
Rust window tracker ──window_changed──▶ Observer (TS)
        │                                   │
        │                                   ├─ coalesce (heartbeat/pulsetime) ─▶ append JSONL
        │                                   ├─ classify frontmost vs coding-app set
        │                                   └─ update in-memory dwell/cadence ─▶ daily rollup .md
        ▼
   (now, config) ──▶ windDownDriver: f = (frontmostApp, now, config)
        │
        ├─ f → stain.progress (StainOverlay)
        └─ f == 1 → show/refresh hard-lock cooldown window;  f < 1 → hide it
```

A periodic tick (existing 1s cadence is fine) re-evaluates `f` even when the frontmost app doesn't change, because **the clock moves** — the lock must arm at H without an app switch.

### Components / units (each one purpose, clear interface)

- **`windDownDriver`** (pure) — `(frontmostApp: string, now: Date, config: TideConfig) → Friction`. No I/O. Owns the curve + arm logic.
- **`Observer`** — consumes `window_changed`, coalesces into events, appends JSONL, maintains the running rollup. Knows nothing about friction.
- **`CadenceRollup`** (pure) — `events[] → DailyRollup`. Derives switches/hr, median dwell, longest stretch.
- **`MarkdownStore` / `JsonlStore`** — thin persistence adapters over `~/.keel/observations/…` and `~/.keel/config.md`. The only units that touch the filesystem.
- **Renderer wiring** — maps `f` onto `StainOverlay` progress and the cooldown window via `TauriOverlayManager`.

### Files (indicative; finalized in the plan)

- Shared `@keel/domain`: `Friction` + `createFriction` + `frictionCurve` (shared with browser slice — create if absent).
- Desktop new: `windDownDriver`, `Observer`, `CadenceRollup`, `JsonlStore`, `MarkdownStore`, `TideConfig` type.
- Desktop touched: `TauriOverlayManager` (add cooldown window), `StainOverlay` re-point to `f`, `appState` (friction + cooldown state), Preferences pane (coding-app list + W/H/R), Tauri capability scope (`$HOME/.keel/**` — already set by the rename plan).
- Rust: upgrade the tracker to durationful/heartbeat emission (or keep change-emit and coalesce in TS — chosen in the plan).

---

## Part VI — Out of scope (named, not built)

- **`afk` watcher** — idle/presence sensing. Reserved slot; "different sensor source, not needed now."
- **`editor` watcher** — file/project/language texture. Reserved slot (needs editor plugins).
- **`detected-compulsion` driver** — acting on switch cadence / texture. We *collect* its data; we do not drive `f` from it.
- **Escapable / ratcheting lock** — the off-ramp if the hard lock proves wrong. Recorded in Part IV, not built.
- **store.bin → markdown migration** for existing sessions / captures / drift.
- **Non-coding arms** (general "you should be winding down") and **multi-device** sync.

---

## Acceptance

- With a coding app frontmost after **W**, the stain wash appears and deepens as the clock approaches **H** (visible, escalating, *before* the wall).
- Below **W**, or with a non-coding app frontmost, `f = 0` and keel is invisible (near-enemy guard).
- At **H** a hard-lock cooldown window appears and **cannot be escaped** until **R**; bringing a coding app frontmost re-asserts it. At **R** it clears and a new observation day begins.
- Every app switch is recorded as a coalesced, durationful event in `~/.keel/observations/YYYY/MM/DD.jsonl` with `watcher` + `host` provenance; the day's `…/DD.md` rollup reports coding minutes, switches/hr, median dwell, longest stretch, friction peak, and lockouts.
- `windDownDriver` and `CadenceRollup` are pure and unit-tested without the GUI.
- No copy or comment claims keel *detects compulsion* or *produces equanimity*.
- Adding the `afk` watcher later requires no change to the event model, persistence, or the wind-down driver.
