# Tides v1 — Nightly Wind-Down — design

> **⊛ Reconciled with the umbrella** (`2026-06-01-keel-strategy.md`, canonical). Superseded wording:
> - **`arm` → `target`**; the coding-app set is a *target*.
> - Desktop is a **surface column**, not "the Compass context": it hosts both capabilities — *Compass* (window-watcher, wind-down driver) and *Drogue* (stain overlay, AI-gate). Read "compass context" as "the desktop surface."
> - **Language: TS core, Rust thin edges.** The `wind-down` driver, `CadenceRollup`, and `SkipBudget` are **TS** (shared with the browser); the **Rust daemon** only senses (window/idle) and executes interventions. No heavy `Friction` Rust mirror.
> - The observer writes the **shared** observation substrate (umbrella Part V) that the browser `tab` watcher also writes — one event schema, not desktop-only.
> - `f = 1` state is **"cooldown"** (one word across surfaces); "lockdown" here = the desktop cooldown.

**Date:** 2026-06-01
**Surface:** keel desktop (Tauri/macOS); consumes shared `@keel/domain` primitives
**Status:** design, approved in brainstorming — ready for implementation plan
**Lineage:** EquanimiTech *Strategic Friction* (`docs/superpowers/specs/2026-06-01-strategic-friction-design.md`); observer model adapted from **ActivityWatch** (buckets/events, heartbeat+pulsetime, watcher separation); persistence pattern from **Secretariat / Pensieve** (markdown-king for human-facing artifacts)
**Equanimitech diagnostic:** passed. Sovereignty held via a finite **skip budget** (scarcity-as-friction) rather than a locked door; "lockdown" is honestly an attention + AI-tool barrier, not an OS cage — the residual OS-level exit is the safety floor (graceful-failure). The interventionist teeth are an **AI-gate** (local MCP/hook that makes Claude sessions decline at lockdown), not screen-blanking. Strategic Friction → ES-16 Non-reactivity; Fade applies to the *intervention*, not the daemon. No claim keel produces equanimity.
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
  "host": "operator-mbp",              // provenance — multi-device clean later
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

## Part IV — The interventionist (renderer + the teeth)

keel cannot reach inside Cursor / Terminal, and on macOS without special entitlements it **cannot physically lock the machine**. So intervention is **multi-channel**, escalating with `f`, and at lockdown the real teeth are at the *tool*, not the OS.

### The ladder (`hide < dim < delay < blur < block`)

- **`dim` → StainOverlay (reused).** The existing full-screen radial wash (`StainOverlay.tsx`, its own Tauri WebviewWindow, opacity driven by a 0–100 `progress`) is driven by `f`: `stain.progress = f × 100`. A warm wash that deepens as the night goes — gain-reduction *before* the wall. (Today it's wired to drift and disabled-by-default; this slice re-points it at `f`.)
- **`delay` → meta-awareness bell (evidence-led, before the wall).** From `W`, an occasional bounded "digital bell" notices your state ("3h unbroken, 01:02") — scaffolds the noticing skill (strongest restoration evidence) and is the Fade engine. A nudge, never a block.
- **`block` → coding-block at lockdown** — the teeth, at the *tool*, **breakpoint-armed**:
  1. **AI-gate via a Claude Code hook (the reliable teeth).** A `PreToolUse` hook **denies coding actions** (`Edit/Write/MultiEdit/NotebookEdit/Bash`) — your coding assistant stops *producing*, while conversation still works. (MCP can't gate; the hook is the enforcement. Full design: `docs/superpowers/specs/2026-06-01-keel-ai-gate-design.md`.) A read-only MCP surfaces tide state so Claude is focus-aware.
  2. **Breakpoint-armed, not clock-slammed.** Crossing `H` enters `pending_lockdown`; the block asserts at the **next natural breakpoint** (app switch / idle / commit, from the observer) or a ~10-min max grace — never mid-keystroke (avoids the ~23-min interruption-residue cost).
  3. **Cooldown overlay (peripheral).** The stain at max + a gentle overlay; an attention barrier, not an OS lock.
  - **No full-turn block.** Dropped per the evidence (hard cutoffs get abandoned). keel withholds AI *code production* and raises friction; it never blocks conversation or traps the machine.

### The override: a finite, scarce **skip budget** (resolves Holistic Control)

Lockdown is escapable only by spending a **credit** — a scarce, granted (never *earned*) skip. This is a `budget` in the domain sense (a *skip budget*) and the costly signal that lets *you* classify a night as worth-it without keel having to detect crafting-vs-compulsion (which it can't do honestly).

- **Grant:** `N` per month with a small rollover cap (default **2/month, cap 3** — tactic, tune later). Granted flat, not earned by behavior (earning would gamify it → couples to hedonic reward → washing).
- **Spend:** a deliberate, confirmed action; stands lockdown down for the rest of that night (until **R**); decrements the visible remaining count; **logged as a `skip` event** (it's data — clustered skips are a future compulsion signal).
- **At 0 credits:** **no sanctioned exit until R** — the coding-block holds (AI won't produce code, stain/overlay hold, daemon won't stand down). The purist Ulysses pact, but in its softened form: it withholds AI code production, never conversation and never the machine.

### Sovereignty & Safety (honest boundaries)

- **"Locked" is not an OS cage.** keel offers no *sanctioned* exit at 0 credits, but cannot and must not physically trap the machine. A determined user can quit the process or use another device. The **hard-to-quit daemon raises the cost** of that unsanctioned exit; it never makes it impossible.
- **That residual exit is the safety floor.** A genuine emergency is never blocked by keel — satisfying Calm Interface's graceful-failure. We get the purist pact *and* safety precisely by being honest about the enforcement ceiling. No separate "break-glass" is built; the OS-level exit is it.
- **Holistic Control:** the *considered self* sets W/H/R, the coding-app list, and the skip budget in advance, and can edit them — but **not during an active lockdown** (editing config mid-lockdown is itself gated, else the override is trivial). Daytime, fully editable.
- **Modification Rights:** open Tauri repo, forkable, config in editable markdown. The user's ultimate exit.
- **Construct:** Strategic Friction here maps to **ES-16 Non-reactivity**. No claim that lockdown *produces* equanimity — only that it raises the cost of the compulsive path.

### Fade-by-Design (the intervention fades, not the daemon)

A tool you can't quit is in tension with Fade. Resolution: the **intervention** lessens as you stop drifting — fewer nights reach lockdown, and the daily rollup reflects *"you wound down on your own 5 of 7 nights"* (a teaching reflection, **not** a streak/score — scoring would gamify). A healthy 6-month outcome is you widening W or retiring the arm because you no longer drift. *Construct: EQUA-S Hedonic Independence.* The observer may persist; the friction should fade.

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
   (now, config, creditsSpentTonight) ──▶ windDownDriver: f = pure(...)
        │
        ├─ f → stain.progress (StainOverlay)
        └─ f == 1 (lockdown) ──┬─ AI-gate: MCP/hook returns "decline" to Claude sessions
                               ├─ cooldown overlay window (TauriOverlayManager)
                               └─ daemon holds until R or a credit is spent
```

A periodic tick (existing 1s cadence is fine) re-evaluates `f` even when the frontmost app doesn't change, because **the clock moves** — lockdown must arm at H without an app switch. Lockdown is a derived predicate (`f == 1 && !skippedTonight`), so spending a credit flips it off for the night purely through state.

### Components / units (each one purpose, clear interface)

- **`windDownDriver`** (pure) — `(frontmostApp, now, config, skippedTonight) → Friction`. No I/O. Owns curve + arm + skip logic.
- **`SkipBudget`** (domain) — a `budget` value object: grant/spend/remaining with the N-per-month + rollover-cap policy. Pure; spending is a transition, persistence is elsewhere.
- **`Observer`** — consumes `window_changed`, coalesces into events, appends JSONL, maintains the running rollup. Knows nothing about friction.
- **`CadenceRollup`** (pure) — `events[] → DailyRollup`. Derives switches/hr, median dwell, longest stretch, lockdowns, skips, "wound-down-on-own" reflection.
- **`AiGate`** — the lockdown→Claude bridge. A **local MCP server** and/or Claude Code hook exposing keel's lockdown state as a *decline* directive. Reads lockdown state; no business logic.
- **`Daemon`** — LaunchAgent + Accessory app: hidden (no dock / app-switcher), relaunches if killed, runs the tick. Raises the cost of the unsanctioned exit; never blocks it.
- **`ObservationRepository` / `ConfigRepository`** (ports) — `JsonlStore` + `MarkdownStore` implementations behind fp-ts `TaskEither` interfaces (matching the existing `FileSystemConfigRepository` pattern). The only units that touch the filesystem. Config edits are **refused while lockdown is active**.
- **Renderer wiring** — maps `f` onto `StainOverlay` progress and the cooldown window via `TauriOverlayManager`.

> **Ports (DIP/OCP).** `Watcher` (emits events), `FrictionDriver` (`→ Friction`), `ObservationRepository`, `ConfigRepository`, and `AiGate` are interfaces. The reserved `afk`/`editor` watchers and the future `detected-compulsion` driver slot in against these contracts without touching existing units.

### Files (indicative; finalized in the plan)

- Shared `@keel/domain`: `Friction` + `createFriction` + `frictionCurve` (shared with browser slice — create if absent); `SkipBudget` value object.
- Desktop new: `windDownDriver`, `Observer`, `CadenceRollup`, `AiGate` (MCP server / hook), `JsonlStore`, `MarkdownStore`, `TideConfig` type, repository ports.
- Desktop touched: `TauriOverlayManager` (add cooldown window), `StainOverlay` re-point to `f`, `appState` (friction + lockdown + credits state), Preferences pane (coding-app list + W/H/R + skip budget; locked during lockdown), Tauri capability scope (`$HOME/.keel/**` — already set by the rename plan).
- Rust / daemon: upgrade the tracker to durationful/heartbeat emission (or keep change-emit and coalesce in TS — chosen in the plan); LaunchAgent for hard-to-quit relaunch.

### Config (`~/.keel/config.md` frontmatter)

```yaml
coding_apps: ["Cursor", "Terminal", "iTerm2", "Claude"]
wind_down: "23:30"   # W
hard_stop: "01:00"   # H
reset: "05:00"       # R
skip_budget: { per_month: 2, rollover_cap: 3, remaining: 2 }
```

A `skip` is appended to the day's JSONL and surfaced in the rollup; `remaining` decrements on spend, replenishes monthly to the cap.

---

## Part VI — Out of scope (named, not built)

- **`afk` watcher** — idle/presence sensing. Reserved slot; "different sensor source, not needed now."
- **`editor` watcher** — file/project/language texture. Reserved slot (needs editor plugins).
- **`detected-compulsion` driver** — acting on switch cadence / texture. We *collect* its data; we do not drive `f` from it.
- **store.bin → markdown migration** for existing sessions / captures / drift.
- **Non-coding arms** (general "you should be winding down") and **multi-device** sync.
- **A separate emergency break-glass** — unnecessary; the OS-level unsanctioned exit *is* the safety floor (Part IV).

---

## Acceptance

- With a coding app frontmost after **W**, the stain wash appears and deepens as the clock approaches **H** (visible, escalating, *before* the wall).
- Below **W**, or with a non-coding app frontmost, `f = 0` and keel is invisible (near-enemy guard).
- From **W**, an escalating meta-awareness bell notices state (no block); crossing **H** enters `pending_lockdown` (coding still works) until the next breakpoint or a ~10-min grace, then the AI-gate hook **denies coding actions** (conversation still works) until **R** — **except** by spending a skip credit, which stands the block down for the night, decrements `remaining`, and logs a `skip` event. **No full-turn block.**
- At **0 remaining credits**, the coding-block holds until **R**; the daemon resists quitting but conversation, and the OS-level exit, always remain (honest enforcement ceiling / safety floor).
- Config (coding apps, W/H/R, budget) is editable when not in lockdown, and **refused** during lockdown.
- Every app switch is a coalesced, durationful event in `~/.keel/observations/YYYY/MM/DD.jsonl` with `watcher` + `host` provenance; the day's `…/DD.md` rollup reports coding minutes, switches/hr, median dwell, longest stretch, friction peak, lockdowns, skips, and the "wound-down-on-own" reflection (no streak/score).
- `windDownDriver`, `CadenceRollup`, and `SkipBudget` are pure and unit-tested without the GUI.
- No copy or comment claims keel *detects compulsion* or *produces equanimity*; the AI-gate and daemon are local-only.
- Adding the `afk` watcher later requires no change to the event model, persistence, or the wind-down driver.
