# keel — Unified Strategy

**Date:** 2026-06-01
**Status:** umbrella. The single source of truth for how the pieces fit. Children hold the detail.
**Grounded in:** `docs/references/attention-research-basis.md` (the evidence base — every mechanism traces to it).
**Children:**

* `2026-06-01-keel-authoring-architecture.md` — the bounded-context boundary + how shields are authored

* `2026-06-01-strategic-friction-design.md` — the friction model + the browser (shield) reference slice

* `2026-06-01-tides-wind-down-design.md` — the desktop (compass) wind-down driver + observer

* `2026-06-01-keel-ai-gate-design.md` — the Claude Code focus gate (a compass renderer)

* `2026-05-31-always-deployed-browser-design.md` — the always-on browser surface

***

## Part I — What keel is

> keel is **one friction model** applied across **two bounded contexts** over **one observation substrate**: a scalar `Friction f ∈ [0,1]` per **target**, computed by **intention-first drivers**, painted by **renderer ports** onto the ladder `hide<dim<delay<blur<block`, softened by the attention-research design principles, overridable by **scarce skip credits**, mirrored by **scoreless reflection**.

**Research stance (non-negotiable).** Every mechanism traces to `attention-research-basis.md` and leans on its *strong* rows (interruption cost, meta-awareness, breakpoints, personalization) and avoids its *weak/debunked* ones (capacity-decline myth, binaural, NSDR, flow figures). keel reduces **fragmentation/drift**; it never claims to restore lost *capacity* or to *produce* equanimity (constructs: ES-16 Non-reactivity, EQUA-S Hedonic Independence — measured in people, not products).

***

## Part II — Structure: two contexts, one model, one substrate

The authoring spec's boundary is the top structure. The strategy is to **maximize the shared spine and keep the surface-specific edges thin** — that is what "align browser and desktop closely" means concretely.

| <br />                | **Shield context** (browser)                                           | **Compass context** (desktop)                                    | **Shared**                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owns                  | RuleSpec, 7 primitives, validator, DOM interpreter, authoring pipeline | daemon, sessions, drift, capture, wind-down, AI-gate             | —                                                                                                                                                               |
| Language              | TS (standalone, in-bundle)                                             | Rust (Tauri backend) + TS (current frontend) — *seam, Part VIII* | kernel mirrored TS↔Rust                                                                                                                                         |
| Scope key             | `target` = domain/matcher                                              | `target` = activity (e.g. coding-app set)                        | `Friction`, `Duration`                                                                                                                                          |
| **Shared spine**      | →                                                                      | ←                                                                | **friction model · driver discipline · renderer ports · ladder · skip credits · scoreless reflection · the observer/event substrate · the evidence principles** |
| Surface-specific edge | DOM mutation                                                           | OS sensing (frontmost app, idle)                                 | *(kept as thin as physics allows)*                                                                                                                              |

The only things that *must* differ are the DOM interpreter (shield) and OS sensing (compass) — both are physics. Everything else is shared.

***

## Part III — The friction model (shared kernel)

* **`Friction`** — branded scalar `f ∈ [0,1]`, one per **`target`**. `0` = intentional path, unimpeded; `1` = max friction. *("target" replaces "arm" — the bandit metaphor misleads; a target is just the scope* *`f`* *is keyed by, instantiated per context: domain in shield, activity in compass.)*

* **Driver** — computes `f` for a target; multiple compose by **max** (Part IV).

* **`FrictionRenderer`** (port) — given `f`, paints itself; declares a **`FrictionBand`** **`{rung, engagesAt}`** on the ladder `hide<dim<delay<blur<block`. Adapters live in the surface (DOM, overlay, **or the Claude Code hook**); the port + ladder live in the kernel. A binary shield is the degenerate band `engagesAt: 1`.

* **Skip credits** — the override: scarce, *granted not earned*, rendered as a depleting resource (never a score). Resolves Holistic Control via scarcity, not a locked door. Per-target tactic (count, lift duration, refill).

* **Scoreless reflection** — "limit reached / wound-down on own N of 7." A mirror that builds judgment → Fade. No streak/badge.

* **Cooldown =** **`f`** **pinned to 1** = every renderer on the target at its rung at once. One word for the f=1 state across both surfaces (supersedes desktop "lockdown").

***

## Part IV — Drivers: intention-first

Lived experience + the research + the model's own near-enemy all agree: a **usage quota conflates use with drift** and is the "hard time-limit that gets worked around." So drivers are ranked:

1. **Intention-alignment (primary).** `f` rises as you drift from your *declared* intention.

   * **`wind-down`** — clock as an intention proxy (the v1, honest stand-in). *(built next — tides)*

   * **Zenborg intention** — the real source: cycle/season intention + today's allocated moments. Is what you're doing *now* on-intention? *(future; the seam is a port)*

   * **`detected-compulsion`** — texture/thrashing inference. *(reserved; the observer collects its training data now)*
2. **`manual`** — you pin `f = 1` (cooldown).
3. **`usage-vs-budget`** **(demoted).** One *weak, optional* signal in the max-composition — not the flagship. The browser slice proves the *plumbing* (f → renderer → credits → reflection), explicitly **not** canonizing this driver.

***

## Part V — The observation substrate (shared, cross-surface) — a key alignment artifact

Both surfaces already observe; today they diverge. Align them onto **one event model** (ActivityWatch-derived):

* **Watchers → durationful events** `{ts, duration_s, watcher, host, data}`, coalesced by heartbeat/pulsetime. **Browser tab-activity is a watcher; desktop window-tracking is a watcher** — same schema.

* **Substrate:** JSONL firehose (`~/.keel/observations/YYYY/MM/DD.jsonl`) + derived markdown rollup. JSONL is **language-agnostic**, so a Rust compass and a TS shield write the *same* substrate — alignment for free.

* **Feeds:** switch-cadence → the reserved `detected-compulsion` driver; and **cross-surface awareness** (the long-promised "desktop drift modulates browser friction and vice versa" — now mechanically possible because both write one substrate).

* Reserved watcher slots: `afk` (idle), `editor` (file/project/lang). Pluggable; build `window` + `tab` first.

***

## Part VI — Evidence-led renderer principles (the research backbone)

Every renderer on both surfaces inherits these (from `attention-research-basis.md`):

1. **Breakpoint-arming** — higher rungs engage at the next natural breakpoint (switch/idle/commit), never mid-task (avoids the ~23-min interruption-residue cost). *Applies to the YouTube cooldown too, not just desktop.*
2. **Periphery-first** — ambient (the stain) before focal.
3. **Nudge > block** — no hard cutoff; coding-block (AI stops *producing*, still converses) + scarce credits; never traps the machine.
4. **Meta-awareness is a primary mechanism, not a side feature** — the "digital bell" (notice duration/hour) + scoreless reflection. Strongest restoration evidence; also the Fade engine.
5. **Personalization** — user-set times, per-target tactics, credits. *The user is high-work-control → the research says blocking backfires for them → intention-alignment + meta-awareness fit better than quotas.*
6. **Wider context = Zenborg** — the intention source (Part IV).

> Reconciliation with the parent's "Not a nudge": the bell is **ambient meta-awareness**, not a persuasive guilt-prompt — still structural, not pleading.

***

## Part VII — Surfaces (thin edges)

* **Shield (browser, TS, standalone):** RuleSpec + 7 primitives + validator + DOM interpreter; authored via the `AuthoringProvider` port (BYOK-in-browser first). Renders friction on the DOM. Always-deployed (slice A).

* **Compass (desktop, Rust daemon):** hard-to-quit, hidden; runs the watchers, the wind-down driver, the overlays (stain), and the **AI-gate hook** (a `FrictionRenderer` whose adapter denies Claude Code coding tools, breakpoint-armed); exposes a read-only **focus MCP** (distinct from the authoring MCP).

***

## Part VIII — Alignment plan (reverse the divergence)

Concrete moves that pull the surfaces together:

1. **One model, mirrored.** `Friction`/`frictionCurve`/`FrictionRung`/`FrictionBand` canonical in TS `@keel/domain`; **mirrored to Rust at the seam** (authoring-spec open item). JSONL substrate needs no mirror (language-agnostic).
2. **Kill the definition schism.** Browser `ShieldDefinition`/`SignalDefinition` become aliases of the canonical `InterventionDefinition` (parent spec already specifies this).
3. **One observation substrate** (Part V) both surfaces write.
4. **Shared driver/credit/reflection discipline** — same primitives, per-target tactics.
5. **Cross-surface friction modulation** (future) — once both write the substrate, a target's `f` can read cross-surface signals.

**Open seam:** the *language* of compass friction logic. Authoring spec says compass = Rust; current desktop domain is TS (fp-ts). Decide per-component: the daemon/sensing is Rust; the pure driver/rollup could be Rust (matches authoring spec) or stay TS (matches today). `Friction` mirror is required either way. *Recorded, not yet decided.*

***

## Part IX — Unified build sequence

1. **Rename** equanimi → keel. *(plan written)*
2. **`packages/domain/src/rules/`** — RuleSpec + 7 primitives + `frictionBand` (TS). Upstream of everything (authoring spec).
3. **Friction core (shared kernel)** — `Friction`, `frictionCurve`, `FrictionRung`, `FrictionBand`, `FrictionRenderer` port. + the browser **reference slice** (renderer/credits/reflection plumbing; `usage-vs-budget` as the demoted proof-driver).
4. **Observation substrate** — watcher/event model + JSONL/rollup (shared; desktop `window` watcher + browser `tab` watcher).
5. **Tides desktop** — `wind-down` driver + stain renderer + skip budget on the coding target. *(needs* *`Friction`* *Rust mirror or TS compass — Part VIII)*
6. **AI-gate** — hook renderer (breakpoint-armed) + meta-awareness bell + focus MCP.
7. **Authoring pipeline** — `AuthoringProvider` port + BYOK-in-browser + validation gate (own track, shield-context).
8. **Zenborg intention source** — replace clock-proxy with real declared intention. *(future)*

***

## Measurement honesty (inherited, load-bearing)

No validated instrument measures equanimity in a product. keel targets **structural conditions** mapped to constructs (ES-16, EQUA-S, interruption-residue); whether that yields measured gains is open. Nothing claims to *produce* focus or equanimity. All local; no network beyond the user's own BYOK authoring call.
