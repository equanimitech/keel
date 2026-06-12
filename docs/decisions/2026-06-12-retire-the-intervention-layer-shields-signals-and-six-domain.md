---
$signature:
  $type: tech.equanimi.secretariat.signature
  signer: did:key:z6MkpcX3mHt44yNEDPDWJic8ocJdagzERxx5u2Qh1dWcVRVN
  signerRole: agent
  docHash: sha256:33c7f6f05e466b69192ce3b227fec7dc14b35d1a4e76fdbdf0276c5bc332a745
  signedAt: 2026-06-12T17:25:10.766340Z
  signature: ed25519:VgyZrsgX2Ab6i5JezC5IUPa3k7d7bjvA2lKMPuS4/rWecR2q6VImafFQQ91S7SuXwpVALDeSeFCCiINW+cqiCA==
type: decision
---
# Retire the intervention layer — shields, signals, and six domain modules

**Date:** 2026-06-12
**Context:** `keel`

## Decision

keel retires its entire intervention layer now: the 9 browser shields and 2 signals (`apps/browser/modules/shields/`, `modules/signals/`, their content-script activations, and the budget UI), and six `@keel/domain` modules — `intervention.ts`, `behavior.ts`, `trigger.ts`, `budget.ts`, `drift.ts`, `session.ts` (~400 of 571 lines). The criterion is **observe vs act**: machinery that acts on attention retires; machinery that observes stays. Commitment devices survive as a distinct category — keel-gate and the porn drogue are explicitly-consented precommitment, not attention interventions. Decided by Rafa, 2026-06-12.

## Rationale

The observability-first directive (stamped roadmap, 2026-06-12) makes interventions a later module (P5), gated on personal baselines (P3). The literature synthesis (`docs/references/2026-06-12-attention-observability-literature.md`) indicts the current design specifically: static always-on interventions are the documented anti-pattern (blocking increases workload for high-perceived-control users; habituation collapses response by the second identical exposure; no universal thresholds exist). Keeping the types preserves a refuted design. Removing everything now buys the methodological prize: the coming weeks become a clean **unshielded baseline**, so each intervention re-enters one at a time as an interrupted time-series against the user's own data — effectiveness becomes a number.

**Rejected:** *disable-but-keep* (dead code anchors the wrong design and invites quiet re-enabling mid-baseline) and *document-and-keep* (the domain package must shrink to its thesis — the log is the product).

## Eulogy mapping (for the P5 rebuild's vocabulary)

| Retired concept | Returns at P5 as |
|---|---|
| Shield (static toggle) | JITAI **decision rule**: (attention state × target × driver) → notch |
| `TriggerCondition` | **Decision point** + **tailoring variables** |
| `BudgetDimension` (absolute limits) | **Baseline-relative constraint** (z-score vs own rolling baseline) |
| `DriftAction` | **Intervention outcome label** (receptivity training data) |
| `SessionContext` | Read-side **bout** (slice E) |
| BCT/PDP types | Grounding lives in `docs/references/` + bct-analyzer skill, not dead types |

## Obituary — per-mechanism trace + effectiveness testimony

Testimony is Rafa's, 2026-06-12, anecdotal and pre-baseline — recorded as **P5 re-entry priors**, not conclusions.

| Mechanism | Domain | Code class | Notch | Testimony |
|---|---|---|---|---|
| Post-Game Cooldown (30s) | chess.com | friction | delay | ★ **winner** — broke the rematch loop |
| Shorts Scroll Lock | youtube.com | access-block (element-level) | block, feature-scoped | ★ **winner** |
| Shorts Homepage removal | youtube.com | cue-removal | hide | ★ **winner** |
| Sidebar Recs Hide | youtube.com | cue-removal | hide | ★ **winner** |
| Comments Hide | youtube.com | access-block (arguably cue-removal) | hide | ★ **winner** |
| Feed Hide | linkedin.com | cue-removal | hide | ★ **winner** — removed the feed scroll loop |
| Sponsored Content removal | youtube.com | cue-removal | hide | unranked |
| Notification Badge | linkedin.com | cue-removal | hide | unranked |
| Promoted Posts | linkedin.com | cue-removal | hide | unranked |
| Watch Stain (signal) | youtube.com | self-monitoring | graded feedback | unranked; design retroactively validated — graded/evolving is habituation-correct |
| Watch Time (signal) | youtube.com | self-monitoring | feedback | unranked |

**Pattern in the testimony:** every winner targets an *in-page compulsion mechanic* (scroll loop, rematch loop, recs rabbit hole, comment bait, feed) — element-level removal or friction. None is a site-level cutoff. This independently matches the literature's split: hard *access* blocking is the failure mode; cue-removal and friction at the mechanic level survive. P5 re-entry should begin from these six.

## Consequences

- `@keel/domain` = `activity.ts` + `value-objects.ts` + the event-taxonomy schema doc. `UIPresentation` relocates into `apps/desktop` (sole consumer, frozen).
- DOM selector knowledge ("video ended", "post seen", "game over") is preserved as the sensor substrate before deletion (sensors-restart pitch).
- No intervention returns before P5; the drogue-or-nothing rule holds for the whole baseline window.
- Implements `docs/ideas/2026-06-12-shields-to-sensors-restart.md`; executed by `docs/pitches/2026-06-12-sensors-restart-shields-out-watchlist-in-domain-purged.md`; full shield code remains recoverable in git history.