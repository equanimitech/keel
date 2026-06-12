# keel roadmap — observability first

**Date:** 2026-06-12 · **Status:** direction, pre-pitch · **Companion:** `docs/references/2026-06-12-attention-observability-literature.md`

**The bet:** keel becomes the **attention observability layer** — one append-only event log (the substrate) with three thin writers (gate hooks, tray logger, browser extension). Interventions split into a separate later module. Models are gated on ≥21 days of accumulated personal data, because the literature says personal baselines beat population models only after ~3 weeks — and no universal thresholds exist to ship sooner.

**Why it matters:** every published detector (breakpoints, interruptibility, fragmentation) is built on the same substrate keel can start writing today. The log is also keel's standalone value (Power-Rangers test: "see your attention" needs no other ranger), and it's what the breathwork/intervention collaboration will consume later.

**The framing move** (same one as wake/Pond): *the product is the substrate, not the surfaces.* Surfaces are interchangeable writers/readers over `~/.keel/log/`.

---

## Where the surfaces stand (honest)

| Surface | Reality today | Roadmap role |
|---|---|---|
| **keel agent** (née keel-gate; Claude hooks) | The only surface in daily use. Already timestamps sessions/prompts/tool-calls — overwrites instead of appending. | **Writer #1.** Cheapest; ships first. Also the only novel dataset (AI-wait gaps — unpublished anywhere). Beachhead surface per the 2026-06-12 productization decision. |
| **Browser extension** | Installed, shields active. Sees `tabs.onActivated`/`onUpdated`; persists none of it. | **Writer #3.** Highest-volume signal (tab switches), needs a transport decision. |
| **Desktop app** | **Unused.** Full React app + compass/stain UI that never runs. | **Demoted to a tray-only logger** (secretariat/CleanMyMac posture: menubar icon, no windows). Freeze the React app — don't delete (the Pond-GUI move). Long-term it's also the browser↔gate relay (`docs/ideas/2026-06-05-keel-desktop-as-browser-gate-relay.md`), but not now. |

## Phases & gates

**P0 — Substrate + writers (now).**
- `ActivityEvent` in `@keel/domain` — `{ id, surface, kind, ts, durationMs?, payload }`, pure, factory-built. Log raw; 3s-bin/30s-window aggregation is read-side, never write-side.
- Append-only JSONL, one file/day/surface in `~/.keel/log/` (local-first; never in git).
- Writers in cost order: **gate** (hours — add PostToolUse/Stop hooks, append instead of overwrite) → **tray** (days — window events already emitted by `x-win`; add idle + input *counts*) → **browser** (after transport decision).

**P1 — Data quality & habit (weeks 1–3).** `keel log status`: events/day per surface, gap detection, file sizes. The observability needs observability — silent writer death is the failure mode that costs weeks. Privacy posture fixed here: counts and timings, never content; domains, never full URLs (full URL only for explicitly opted-in domains).

**P2 — Ground truth channel (week 2+).** Light ESM: occasional one-tap interruptibility probe (5-point, ≤2/hour ceiling per Fogarty) through the existing intention/appetite nudge channel. Plus implicit labels derived from the log itself (resumption lag, prompt-response latency, drift actions).

**P3 — Descriptive baselines (week 3+, still not modeling).** Personal distributions: switch-rate, focus-bout length, day rhythm. Rendered as a CLI report / one statusline line — *not* a dashboard (the literature's documented failure: overwhelming users with their own data).

**GATE → P4 — Models.** Requires ≥21 days with coverage on ≥2 surfaces. Then, in order of published viability: binary any-breakpoint detector (never 3-class), 3-state interruptibility ceiling, fragmentation z-scores vs personal baseline.

**P5 — Interventions module (separate, later).** JITAI decision layer (vulnerability vs receptivity), the notch scale (`hide<dim<delay<blur<block`) as delivery vocabulary, breathwork payload (partner collab), AI-wait-gap experiments. Nothing here blocks or is blocked by P0–P3.

## Scope tiers

- **Must-have:** `ActivityEvent` + JSONL store · gate writer · tray logger (frontmost app, idle, input counts) · `keel log status`.
- **Should-have:** browser writer · ESM probe · baselines report.
- **Nice-to-have:** calendar busy/free boundaries · scroll-stop events · keystroke/mouse *timing-feature* aggregates (stress proxies — within-subject only anyway, so they can start late).

## Pitch queue

| # | Slice | Appetite |
|---|---|---|
| A | Event-log substrate + keel agent writer (+ `log status`) | small |
| B | Tray logger (menubar-only Tauri; window/idle/input-count sensors) | medium |
| C | Browser event writer (transport decided) | small–medium |
| D | ESM probe channel | tiny–small |
| E | Baselines report (`keel log report`) | small |

## Decisions needed (not blocking A)

1. **Browser log transport:** extension-local IndexedDB with export (recommended now — don't block logging on plumbing) vs native-messaging host to `keel.mjs` vs desktop relay (the eventual home).
2. **Tray app body:** new lean Tauri target (recommended; desktop app frozen as-is) vs stripping `apps/desktop`.
3. **Baseline rendering surface:** statusline line vs CLI report vs both.

## Explicitly deferred

Interventions of any kind · gate generalization (driver kinds — `docs/2026-06-07-keel-generalization-exploration.md`) · multi-machine sync · semantic/topic drift · biometrics (literature: interaction data beats them anyway) · real-time cross-surface coordination.

---

_Drafted by Claude from the 2026-06-12 literature synthesis + codebase inventory + recent keel/equanimitech docs._
