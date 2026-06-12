# Rethink shields in light of the attention research

The current shield model (static, binary, per-site toggles — cue-removal/access-block/friction, always-on once enabled) predates the literature synthesis (`docs/references/2026-06-12-attention-observability-literature.md`). Several findings cut against it:

- **Hard static blocking is the documented failure mode** — cutoffs cause workarounds and abandonment; Mark et al.: blocking helps low-Conscientiousness users but *increases* workload/stress for high-perceived-control users. A shield that's identical for every person at every moment is the anti-pattern.
- **Timing beats strength** — breakpoint-timed delivery cut annoyance ~56% vs mid-task. Shields should engage at boundaries (navigation commit, video end, session start), never mid-flow. keel agent's turn-boundary arming already does this; web shields don't yet.
- **State-blind = the core flaw.** JITAI's vulnerability/opportunity distinction: a YouTube visit during an AI-wait gap (vulnerable, compulsion escape) ≠ deliberate evening leisure. Shields should become decision rules — *(attention state × target × driver) → notch* — consuming the log, not static toggles.
- **Habituation kills static shields** — fMRI response collapse by the 2nd identical exposure; polymorphic variation is the proven mitigator. The stain/watch-time intensity curves are accidentally right (graded, evolving); binary shields are accidentally wrong.
- **Budgets need personal baselines, not absolute limits** — no validated universal thresholds exist; "more than your usual" (z-score vs own rolling baseline) is the only defensible form. BudgetDimension should grow a baseline-relative variant.
- **The missing feedback loop**: shield interactions (shown / dismissed / clicked-through / effective) must be logged as ActivityEvents — intervention-outcome tracking was a flagged gap in the codebase inventory and is what personalization feeds on (receptivity models need outcomes).
- **Fade-by-design becomes measurable**: with the log, a shield's success metric is its own declining trigger rate. A shield that fires forever is failing.

Convergence: this lands exactly on the parked notch-scale idea ([[2026-06-05-keel-standardized-drogue-notch-scale]]) — `hide < dim < delay < blur < block` as the delivery vocabulary, drivers/state selecting the notch — now with empirical justification. Shields become *policies over the log* rather than DOM tweaks with a toggle.

- Questions:
  - Migration path: do existing 11 shields become (target, notch, decision-rule) triples with "always-on" as the degenerate rule?
  - Where does the decision rule evaluate — extension background (has the browser log) vs tray (has cross-surface view)?
  - Does `@keel/domain` TriggerCondition absorb state-conditions (wait-gap, switch-burst, baseline-exceeded) as new variants?
  - Sequencing: this is interventions-module territory (P5) — gated on baselines (P3). Only the *outcome logging* belongs earlier (it's observability).

Don't shape yet.
