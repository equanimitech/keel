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
* `2026-06-01-keel-design-system-alignment.md` — the **presentation shared core** (`@keel/ui`: tokens + shadcn), how friction renderers look

***

## Part I — What keel is

> keel is **one friction model** applied across **two bounded contexts** over **one observation substrate**: a scalar `Friction f ∈ [0,1]` per **target**, computed by **intention-first drivers**, painted by **renderer ports** onto the ladder `hide<dim<delay<blur<block`, softened by the attention-research design principles, overridable by **scarce skip credits**, mirrored by **scoreless reflection**.

**Research stance (non-negotiable).** Every mechanism traces to `attention-research-basis.md` and leans on its *strong* rows (interruption cost, meta-awareness, breakpoints, personalization) and avoids its *weak/debunked* ones (capacity-decline myth, binaural, NSDR, flow figures). keel reduces **fragmentation/drift**; it never claims to restore lost *capacity* or to *produce* equanimity (constructs: ES-16 Non-reactivity, EQUA-S Hedonic Independence — measured in people, not products).

***

## Part II — Structure: capabilities × surfaces over one core

The top structure is **two orthogonal axes**, not one surface-bound split. **Capabilities** are concerns (what keel does); **surfaces** are deployment columns (where it runs). Binding a concern to a surface (the authoring spec's first cut — "Shield = browser, Compass = desktop") is a DDD smell and breaks the moment a third surface appears. So:

- **Shared core (surface-agnostic):** the **friction model** (`Friction` · drivers→`f` · ladder · `FrictionRenderer` port · skip credits · scoreless reflection) + the **observation substrate** (event schema). Neither shield nor compass, neither browser nor desktop. TS canonical, mirrored to Rust at the seam.
- **Capabilities (concerns / roles):**
  - **Shield** — *intervene*: render friction onto whatever the surface controls.
  - **Compass** — *observe + orient*: sense activity, feed the substrate, drive `f` from intention.
  - **Authoring** — *generate* interventions (the `AuthoringProvider` port).
- **Surfaces (deployment columns of adapters):** each surface supplies adapters for one or more capabilities.

| Capability ↓ / Surface → | **browser** | **desktop** | **app** *(future, not now)* |
|---|---|---|---|
| **Shield** (intervene) | DOM renderers | overlay (stain) + **AI-gate hook** | app-UI / notification renderers |
| **Compass** (observe+orient) | tab-watcher | window-watcher + OS sensing | usage-watcher |
| **Authoring** (generate) | BYOK-in-browser | desktop-connected · Claude-Code-MCP | — |

The only genuinely surface-bound bits are **physics** — DOM mutation (TS-in-browser), OS sensing (Rust-on-desktop). Everything above the adapter line is the shared core. "Align browser and desktop closely" = they're two columns over one core, not two contexts.

**The app test:** a future app is just a new column — it drops in adapters for Shield + Compass against the same core, zero model change. (Not built now; the structure simply doesn't preclude it.)

> This revises the authoring spec's framing: its "two bounded contexts" → "three capabilities × N surfaces." The authoring spec remains correct about the *physics* (shield logic is TS-in-browser; OS sensing is Rust) — that's now expressed as adapter-edge constraints, not a context boundary.

***

## Part III — The friction model (shared kernel)

* **`Friction`** — branded scalar `f ∈ [0,1]`, one per **`target`**. `0` = intentional path, unimpeded; `1` = max friction. *("target" replaces "arm" — the bandit metaphor misleads; a target is just the scope* *`f`* *is keyed by, instantiated per surface: a domain for a browser Shield target, an activity for a desktop Compass target.)*

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

## Part VII — Surface columns (the adapter packs we ship now)

Each surface is a column of adapters over the shared core. We build **browser** and **desktop** now; **app** is a future column.

* **browser** — Shield adapters: DOM renderers (RuleSpec + 7 primitives + validator + interpreter, TS, standalone). Compass adapter: tab-watcher. Authoring: BYOK-in-browser. Always-deployed (slice A).

* **desktop** — Compass adapters: hard-to-quit hidden daemon, window-watcher + OS sensing, the wind-down driver, the observation substrate writer. Shield adapters: the stain overlay + the **AI-gate hook** (a `FrictionRenderer` whose adapter denies Claude Code coding tools, breakpoint-armed). Plus a read-only **focus MCP** (distinct from the authoring MCP). Authoring: desktop-connected · Claude-Code-MCP.

> Note the cross-fill: the browser already does *Compass* (tab-watching) and the desktop already does *Shield* (overlay, AI-gate). Neither surface is "the shield" or "the compass" — each plays both roles. That is the alignment.

***

## Part VIII — Alignment plan (reverse the divergence)

Concrete moves that pull the surfaces together:

1. **One model, in TS.** `Friction`/`frictionCurve`/`FrictionRung`/`FrictionBand` + the drivers + rollup logic are canonical TS in `@keel/domain`, shared by both surfaces. Rust does **not** re-implement them (decided — see open-seam below); it senses and executes. JSONL substrate is language-agnostic.
2. **Kill the definition schism.** Browser `ShieldDefinition`/`SignalDefinition` become aliases of the canonical `InterventionDefinition` (parent spec already specifies this).
3. **One observation substrate** (Part V) both surfaces write.
4. **Shared driver/credit/reflection discipline** — same primitives, per-target tactics.
5. **Cross-surface friction modulation** (future) — once both write the substrate, a target's `f` can read cross-surface signals.

**Resolved — TS core, Rust thin edges.** The friction model, drivers, and rollup logic stay **TS** (same code-family as the browser shield → the core is genuinely *shared*, not duplicated). **Rust is tooling only**: the daemon, OS sensing (observation), and executing interventions (the AI-gate hook / overlay). The seam is the daemon boundary — Rust emits events (JSONL, language-agnostic) and executes what the TS core decides. So the heavy `Friction` Rust-mirror in item 1 shrinks to near-nothing: Rust passes raw events up and renders decisions down; it doesn't re-implement the model.

***

## Part IX — Unified build sequence

1. **Rename** equanimi → keel. *(plan written)*
2. **`packages/domain/src/rules/`** — RuleSpec + 7 primitives + `frictionBand` (TS). Upstream of everything (authoring spec).
3. **Friction core (shared kernel)** — `Friction`, `frictionCurve`, `FrictionRung`, `FrictionBand`, `FrictionRenderer` port. + the browser **reference slice** (renderer/credits/reflection plumbing; `usage-vs-budget` as the demoted proof-driver).
4. **Observation substrate** — watcher/event model + JSONL/rollup (shared; desktop `window` watcher + browser `tab` watcher).
5. **Tides desktop** — `wind-down` driver + stain renderer + skip budget on the coding target. *(driver/rollup logic in TS; Rust daemon senses + executes — Part VIII)*
6. **AI-gate** — hook renderer (breakpoint-armed) + meta-awareness bell + focus MCP.
7. **Authoring pipeline** — `AuthoringProvider` port + BYOK-in-browser + validation gate (own track; the Authoring capability, browser column first).
8. **Zenborg intention source** — replace clock-proxy with real declared intention. *(future)*

**Parallel track (cross-cutting):** the **design-system alignment** (`@keel/ui` presentation core — tokens + shadcn, light/dark) runs alongside steps 3–6, since the friction renderers (stain, cooldown overlay, popup) render through it. Coordinate the popup→React conversion with the popup toggle-removal (step 3 / strategic-friction Part IV).

***

## Measurement honesty (inherited, load-bearing)

No validated instrument measures equanimity in a product. keel targets **structural conditions** mapped to constructs (ES-16, EQUA-S, interruption-residue); whether that yields measured gains is open. Nothing claims to *produce* focus or equanimity. All local; no network beyond the user's own BYOK authoring call.
