# Strategic Friction — design

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

3. **Renderer** — every intervention maps a given `f` onto the **friction ladder**, a shared vocabulary of escalating cost:

   ```
   hide  <  dim  <  delay  <  blur  <  block
   ```

   - *hide* — remove the cue (recs, promoted posts)
   - *dim* — reduce salience
   - *delay* — insert a speed bump / forced wait (chess post-game cooldown is really this)
   - *blur* — require effort to perceive
   - *block* — pause / lock

   An intervention occupies a **band** on this ladder. **Cooldown = `f` pinned to 1 = the top rung of every renderer on the arm at once.** "Turn all dials to max" is not a new mechanism — it is the cooldown we already have, finally named.

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
- Migrating binary shields to the renderer-band model.
- Friction for Chess / LinkedIn / Claude arms.
- Equanimity / focus / diffuse-mode measurement.

---

## Acceptance

- Watching YouTube past the configured daily limit triggers a cooldown that holds until the configured reset hour, then clears.
- Below the limit, friction rises gradually and the experience remains usable (near-enemy: not numb).
- The popup shows no on/off toggles; the manage page still does.
- `Friction`, `domainFriction`, and `frictionCurve` exist as the shared primitives a second arm could consume without touching the strategy.
- No claim, in copy or code comments, that the feature *produces* equanimity — only that it raises the cost of the compulsive path.
