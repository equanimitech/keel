# Strategic Friction — design

> **⊛ Reconciled with the umbrella** (`2026-06-01-keel-strategy.md`, canonical; this doc is detail). Superseded wording:
> - **`arm` → `target`** — the scope `f` is keyed by (read every "arm" below as "target").
> - **Structure is capabilities × surfaces**, not surface-bound contexts: *Shield* is a **capability** (intervene); browser/desktop are **surfaces**. The friction model here is the **shared core**, not browser-only.
> - **`usage-vs-budget` is demoted** to a weak/optional signal — kept as this slice's *plumbing-prover*, not the flagship. Primary drivers are intention-first (`wind-down` → Zenborg → `detected-compulsion`); see umbrella Part IV. ("give it another try" — kept, not dropped.)
> - The research-led renderer principles apply to *every* renderer here, including the YouTube cooldown: **breakpoint-arming, periphery-first, nudge>block, meta-awareness, personalization** (umbrella Part VI; `docs/references/attention-research-basis.md`).

**Date:** 2026-06-01
**Surface:** keel (browser extension first; model is platform-wide)
**Status:** design, approved in brainstorming — ready for implementation plan
**Lineage:** EquanimiTech *Strategic Friction* principle (Secretariat stamp-after-open, ai-mediated-async-comms, anti-atrophy exercises)

---

## Part I — The principle

### Strategic Friction, defined

> Make the **compulsive path structurally costlier than the intentional path**, by a margin that scales with how far you have drifted from your own declared intention.

Three things it is *not*:

- **Not a nudge.** No guilt prompt, no "are you sure?" dialog. The friction is built into the affordance itself — the way Secretariat hides the envelope body until you scroll, so you *cannot* stamp without reading. Structural, not persuasive.
- **Not a cage.** It never hard-blocks in the name of control. The budget that drives it is aspirational — *compass, not cage*. You set the intention; the system raises the cost of betraying it.
- **Not a constant.** A fixed wall is either too low (ignored) or too high (resented). Friction is a **dial**, not a switch — it rises as drift grows.

### Why friction is the right leverage point (Meadows)

Extractive platforms win by **strengthening a positive feedback loop**: autoplay → watch → recommend → watch more. In Meadows' terms that is the *backward push on Level 7* — adding gain to a reinforcing loop that should be slowed. Engagement-maximization is L7 pushed the wrong way, deliberately.

Strategic Friction is the corrective move, and its leverage is layered:

| Layer | Meadows level | The move |
|---|---|---|
| The dial *value* (is the stain 60% or 80% at an hour) | **L12 — parameters** | Lowest leverage. Tactics. Tune forever; changes little. |
| Naming friction as **one scalar `f` per arm**, with a driver→f→renderer structure | **L10 — structure of flows** + **L6 — information flow** | Closes the loop *usage → f → friction → behavior → usage* in one legible place. |
| **What drives `f`** — your aspirational budget, not the platform's engagement target | **L5 → L3 — rules & goals** | Your declared intention becomes the regulator. The system's goal becomes *your* equanimity, not someone's watch-time. |
| Tool serves intention rather than extracting attention | **L2 — paradigm** | The convivial alternative to extractive tech. |

**The sharp read:** reducing the *gain on the reinforcing loop* (L7, the right direction) beats braking harder after the fact (L8). Friction that rises *before* the limit is gain-reduction; a cooldown *at* the limit is the brake. We want both, in that order — which is exactly the YouTube slice (gradual rise, then lockout).

Do **not** spend the project tuning curve constants (L12 deck chairs). The leverage is the abstraction (L10) and the choice of driver (L3). The dial number is a tactic.

### The measurement constraint (inherited, load-bearing)

Per the EquanimiTech primer: **there is no validated instrument for measuring equanimity in a product.** Therefore this design claims only that friction creates **structural conditions** — the compulsive path is made costlier — and never that it *produces* equanimity. Any outcome language maps to constructs (ES-16 Non-reactivity, EQUA-S Hedonic Independence), not to measured effect.

### The near-enemy check

Equanimity's near enemy is **indifference**. A friction system "succeeds" falsely if it makes you numb — if you stop visiting YouTube because the whole thing feels dead, that is avoidance, not freedom. The design must leave the **intentional path clean and fast**: when you are within budget, friction is ~0 and the experience is unimpeded. Friction targets *drift*, not *use*.

---

## Part II — The strategy (invariant)

The strategy is a fixed mechanism. It does not vary by domain or by person.

```
 DRIVER ──computes──▶  f ∈ [0,1]  ──renders──▶  INTERVENTIONS
                            │
              cooldown = a driver that pins f = 1
```

### Three contracts

1. **`Friction`** — a branded scalar `f ∈ [0,1]`, one per *arm* (a domain: youtube.com, chess.com, linkedin.com, and future arms like Claude). Lives in the shared domain next to `Duration`. `0` = intentional path, unimpeded. `1` = maximum friction.

2. **Driver** — anything that computes `f` for an arm. Three slots, composed by taking the **max**:
   - `usage-vs-budget` — `f` rises along a curve as usage approaches the user's aspirational budget. *(built)*
   - `manual` — user pins `f = 1` for a duration (today's popup cooldown). *(built)*
   - `detected-compulsion` — `f` bumps when compulsion is inferred. **Slot reserved, empty now** — the architecture leaves room; no detection ships in this slice.

3. **Renderer (a port)** — every intervention is a `FrictionRenderer`: given the current `f`, it paints itself. The interface is pure (`render(f): void` / `clear(): void`); the DOM adapters live in the browser surface, never in the domain. This respects the dependency arrow: the domain defines *what a friction rung means and the renderer contract*; browser infra/UI defines *how to paint it*.

   Each renderer declares its **band** on the **friction ladder**, a shared vocabulary of escalating cost:

   ```
   hide  <  dim  <  delay  <  blur  <  block
   ```

   - *hide* — remove the cue (recs, promoted posts)
   - *dim* — reduce salience (the watch-stain darkening the player is this)
   - *delay* — insert a speed bump / forced wait (chess post-game cooldown is this)
   - *blur* — require effort to perceive
   - *block* — pause / lock (shorts scroll-lock; cooldown overlay)

4. **`FrictionBand`** — `{ rung: FrictionRung; engagesAt: Friction }`. The rung is the ladder position the renderer expresses; `engagesAt` is the `f` threshold at which it begins. A **binary shield is the degenerate band** `{ rung, engagesAt: 1 }` — it engages fully only at `f = 1`. A **continuous renderer** (the stain) has a low `engagesAt` and scales with `f` up to its rung. This is why alignment can be *declarative*: every existing shield already has a band — `engagesAt: 1` — without any runtime change.

   **Cooldown = `f` pinned to 1 = every renderer on the arm at its rung at once.** "Turn all dials to max" is not a new mechanism — it is the cooldown we already have, finally named.

### Where the model lives (resolving the definition schism)

There are two parallel models of an intervention today: the canonical `InterventionDefinition` in `packages/domain` (nests `classification`, carries `metadata`) and the browser's flat `ShieldDefinition` / `SignalDefinition` — which never import the canonical type. Adding friction only to the browser side would deepen the split. So:

- `FrictionRung`, `FrictionBand`, `FrictionRenderer`, `Friction`, `frictionCurve` are **canonical in `packages/domain`**.
- `frictionBand?: FrictionBand` is added to the canonical `InterventionDefinition`.
- The browser `ShieldDefinition` / `SignalDefinition` become **aliases of `InterventionDefinition`** (one model; the shield/signal distinction lives in `classification.mechanism` — subtractive vs additive — and in the two registries).

The friction ladder is **native to the existing `BehavioralMechanism`**: `hide↔cue-removal`, `delay↔friction`, `block↔access-block`, `dim/blur↔environment`. A band is a range over the subtractive half of a union the domain already has.

### Declarative alignment (this slice)

Every shield and signal is classified onto a band — legible in the model even though only YouTube sets and reads `f` for real this slice:

| Intervention | Rung | engagesAt | Runtime this slice |
|---|---|---|---|
| youtube-sidebar-recs, -sponsored, -shorts-homepage, -comments-hide | hide | 1.0 | unchanged (binary) |
| linkedin-feed-hide, -promoted-posts, -notification-badge | hide | 1.0 | unchanged (binary) |
| youtube-shorts (scroll-lock) | block | 1.0 | unchanged (binary) |
| chess-post-game-cooldown | delay | 1.0 | unchanged (binary + timer) |
| youtube-stain (signal) | dim | ~0 | **upgraded** — reads `domainFriction` |
| youtube-watch-time (signal) | — (pure indicator) | — | visualizes `f` |
| **youtube cooldown overlay** | block | 1.0 | **the reference renderer** |

The 8 binary shields gain a *declared* band but keep their current on/off runtime. Upgrading them to multi-rung renderers that read `f` is the next slice, not this one.

### What the strategy reuses (already in code)

- The friction *curve* exists, implemented identically twice (`youtube-stain`, `youtube-watch-time`): `f(t) = t < min ? 0 : 1 − exp(−(t−min)/τ)`, τ derived so `f ≈ 0.95` at `max`. It will be extracted to one shared `frictionCurve()`.
- `domainCooldown(domain)` is already per-arm and is already the `f = 1` case.
- `computeOverallProgress` (budgets) exists with **zero consumers** — it becomes the `usage-vs-budget` driver.

---

## Part III — Tactics (deferred: per domain × per person)

> Think about the model as the strategy; the tactics defer per domain and per person.

Everything below is **out of the strategy** and configured independently. A new arm or a new person never touches the mechanism — they supply a tactics table.

| Tactic | Varies by | Example |
|---|---|---|
| Curve thresholds `(min, max)` | domain + person | my YT limit 60 min; yours 90 min |
| Which ladder rungs an intervention uses | domain | YT dims/blurs the player; LinkedIn only hides the feed |
| Band assignment (`f` → rung) | domain + person | recs hide at `f > 0.7` vs `f > 0.5` |
| Reset hour | person | `f` releases at 5am (configurable) |
| Detection signals *(future slot)* | domain | YT rapid-rewatch; chess tilt; LinkedIn scroll velocity |

---

## Part IV — The YouTube slice (build now)

The YouTube daily-limit feature is the **reference implementation of the `usage-vs-budget` driver** — it exercises the full strategy with one arm's tactics, proving the abstraction before any second arm consumes it.

### Behavior

1. **Gradual friction.** As today's YouTube watch time accumulates, `f("youtube.com")` rises along `frictionCurve(dailySeconds, softStartMin, dailyLimitMin)`. Friction is visible and escalating *before* the limit — gain-reduction on the loop.
2. **Limit → cooldown.** When `dailySeconds ≥ dailyLimitMin`, set `domainCooldown("youtube.com")` to the next **configurable reset hour (default 05:00 local)**. The existing `youtube-cooldown` overlay enforces it verbatim — pauses video, overlays "take a break," re-pauses on play attempts.
3. **Reset.** At the reset hour the cooldown expires, `dailySeconds` resets for the new day, `f` returns to 0, the intentional path is clean again.
4. **Skip credits (compassionate override via scarcity).** The auto-cooldown is *not* a locked door — but the exit is a **finite, scarce resource**, not a cheap repeatable speed bump. You hold a small monthly allowance of *skip credits* (**configurable, default 1/month**). Spending one lifts the cooldown for a fixed block (**configurable, default 2h**) via a `cooldown:<domain>:override-until` window; when the block lapses the cooldown reasserts. With zero credits left, the cooldown is firm until the reset hour (credits refill at the calendar-month boundary).

   Scarcity is the friction here, and it is *uncheatable* — unlike a "type a reason" prompt an impulse can fake, a credit simply runs out, so you won't spend a precious all-nighter on a 2am Shorts urge but you can on a genuine one. **`f` stays at 1 throughout an override** — the stain stays fully dark. You see the full cost while choosing to proceed: cost visible, choice yours, and the choice is rationed. The credit count is rendered as a *depleting resource* ("2 skips left this month"), never as a growing score (that would be gamification = washing).
5. **Reflection, not score.** When the limit is first crossed on a logical day, that day is appended to a 7-day `limit-history`. The overlay (and manage page) shows one quiet, muted line — "Limit reached N of the last 7 days." No streak, no badge, no number-to-grow. A mirror that builds judgment toward needing the limit less.

### Popup change

- **Remove the per-intervention on/off toggles from the popup.** Per-intervention control moves to the **manage page only** (manage keeps the real toggles + budget config).
- Popup becomes **cooldown + status**: start a cooldown, see remaining time, see what is active. No switches.

### Minimal first step (no shield rewrite)

1. `packages/domain/src/value-objects.ts` — add `Friction` branded type + `createFriction(n)` clamping to `[0,1]` (~8 lines, forces no consumer changes).
2. `apps/browser/utils/storage.ts` — add `domainFriction(domain)` → `local:friction:<domain>:value`, mirroring `domainCooldown`.
3. Extract the duplicated curve into `apps/browser/utils/friction.ts` as `frictionCurve(seconds, minMin, maxMin)`; `youtube-stain` and `youtube-watch-time` import it (pure refactor).
4. Add a YouTube daily-limit driver (in the watch-time content script or background) that ramps `domainFriction("youtube.com")` and flips `domainCooldown` at the limit to the configured reset hour.
5. Remove toggle rendering from `entrypoints/popup/main.ts` (keep the cooldown section + add a read-only status list); leave `entrypoints/manage/main.ts` toggles intact.
6. Add settings: `dailyLimitMin`, `softStartMin`, `resetHour` (reuse the existing `time-per-day` budget for `youtube.com` as `dailyLimitMin`).

Binary shields and DOM renderers are untouched in this slice. The stain/counter may later switch to reading `domainFriction` instead of recomputing — optional, incremental, not required here.

### Out of scope (named, not built)

- `detected-compulsion` driver and per-arm detection signals.
- **Upgrading the 8 binary shields into multi-rung renderers** that read `f` and progress `dim→blur→block`. This slice gives them a *declared* band only; their runtime stays binary on/off.
- Friction *drivers* for Chess / LinkedIn / Claude arms (their interventions get declared bands, but no driver sets their `f` yet).
- Equanimity / focus / diffuse-mode measurement.

---

## Equanimitech alignment (diagnostic on record)

Run against the nine principles + four layers. Foundation holds: **Local-First** ✅ (client-side, `chrome.storage.local`, survives company death), **Modification Rights** ✅ (open WXT extension, forkable, version-freezable). The two gaps the first cut had — and how this design closes them:

- **Holistic Control / Strategic Friction.** An auto-cooldown with no exit is a locked door (paternalism — a control failure even when well-meant; the framework names this exact tension). Resolved by **skip credits**: a real but *scarce* exit. Scarcity favors intention without being gameable. *Construct: ES-16 Non-reactivity — the rationed skip is the structural stand-in for the gap between stimulus and reaction.*
- **Fade-by-Design / Production layer (Franklin).** A pure blocker builds no judgment — a permanent crutch. Resolved by the **scoreless reflection** ("limit reached N of the last 7 days"): a mirror that builds self-knowledge toward needing the limit less. *Construct: EQUA-S Hedonic Independence.* No streak/score (that would re-couple to hedonic reward = washing).

**Measurement honesty (load-bearing):** these constructs are validated in *people*, not *products*. This design *targets the structural conditions* mapped to Non-reactivity / Hedonic Independence; whether that translates to measured equanimity gains is an open empirical question. Nothing here claims to *produce* equanimity.

## Acceptance

- Watching YouTube past the configured daily limit triggers a cooldown that holds until the configured reset hour, then clears.
- Below the limit, friction rises gradually and the experience remains usable (near-enemy: not numb).
- The auto-cooldown is overridable by spending a skip credit, which lifts it for the configured block; with zero credits it is firm until reset; credits refill monthly. `f` (and the stain) stay at max during an override.
- The skip count renders as a depleting resource, never a growing score; the overlay shows the scoreless "N of last 7 days" reflection.
- The popup shows no on/off toggles; the manage page still does.
- Every shield + signal carries a declared `frictionBand`; browser definitions are aliases of the canonical `InterventionDefinition` (one model).
- `Friction`, `domainFriction`, `frictionCurve`, `FrictionBand`, and the `FrictionRenderer` port exist as shared primitives a second arm could consume without touching the strategy.
- No claim, in copy or code comments, that the feature *produces* equanimity — only that it raises the cost of the compulsive path.
