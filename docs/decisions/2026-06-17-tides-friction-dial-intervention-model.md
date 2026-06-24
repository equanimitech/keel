---
$attestation:
  $type: tech.equanimi.secretariat.stamp
  signer: did:key:z6MkjB8PQaN1vuUzdtnJsxyXR2f8d3tckGHkUYZMDytQsfak
  act: attest
  docHash: sha256:c985c0e423846a1623ca974dc19796af91c584cf874721bd50248453b5e02e3d
  docFilename: 2026-06-17-tides-friction-dial-intervention-model.md
  stampedAt: 2026-06-16T22:14:18.739117Z
  signature: ed25519:sfQsMbhRC4wqCVmW+fT0jqLtY0R/jumymyIo6YklLOCZswr+1V90GRdqDXMA3UW2REdm/ReOlKef9SYGmuAODQ==
---
# Adopt tides driving a graduated friction dial as keel's intervention model

**Date:** 2026-06-17
**Context:** `keel` (agent surface first; the model is platform-wide)

## Decision

keel's intervention model is **a tide driving a graduated friction dial**. There are no walls.

- **Tide** is keel's temporal driver. For v1 it is read from **keel-native signals only**: the **declared session intention** (`keel intention`) and **actual work-rhythm** (the P3 baselines: focus-bout length, switch-rate, session cadence), plus a **minor clock** component (a fallback, never the primary signal). The tide flips *what gets friction*: a focused flood friction-protects the bout from distraction; a wind-down ebb caps granularity and discourages starting new deep work. (Zenborg phase + allocated moments are a **deferred** richer intention source, see Consequences, not a v1 dependency.)
- **Friction dial** is a scalar `f` the tide computes, rendered gross to subtle on the drag scale: **notice (meta-awareness) -> granularity ceiling -> implementation deterrent (delay / effort tax) -> one breakpoint-armed backstop**. Block is the degenerate top notch, kept for a single defensible case only: the late backstop, where the sleep-deprived self cannot self-assess.

This **supersedes** the nights / windows / lockdowns model and **retires** park, skip, credits, and vice (and the root LaunchDaemon vice needed). The streak was already removed (2026-06-16).

## Rationale

The agent surface had over-indexed on hard blocking, the one mechanism keel's own evidence base says fails. From `docs/references/attention-research-basis.md`: hard cutoffs sit in the *Fails* column ("frustration, workarounds, abandonment"); punitive feedback gets 6 to 10% adoption; **principle 3 is "nudge rather than block."** Personalization research is decisive for this user specifically: blocking *increased* workload for high perceived-work-control users. Meta-awareness, not blocking, is the strongest lever (d ~ 0.29 to 0.69).

The clock was always the wrong tide for this user: the nocturnal-confound analysis (`docs/2026-06-13-watchlist-seeding-from-history-design.md`) shows real work happens late (peak 17h, night a strong secondary), so a clock-driven brake punished legitimate on-intention work. Tides reading intention + rhythm (the `2026-06-04-tides-zenborg-seam.md` principle, "reads intention, not a clock") fixes this at the root.

The single concept already existed in `docs/superpowers/specs/2026-06-01-strategic-friction-design.md` (driver -> `f` -> renderers on a drag scale, with lockdown as the degenerate `engagesAt: 1` case). The model was specced but the agent surface shipped only the degenerate notch plus bolt-ons. This decision implements the graduated middle and removes the bolt-ons.

Claim discipline: flow theory is the organizing narrative only. The same research file marks flow-productivity *weak, do not cite as fact*. The dial is anchored to the strong rows (interruption recovery ~23 min, breakpoint deferral, sleep self-assessment, meta-awareness).

**Alternatives rejected:** (a) keep lockdown + skip-credits as the safety valve, rejected because credits exist only to make a wall survivable, and removing the wall dissolves them; (b) pure-soft with no hard stop at all, rejected because the 2am-self case is the one place the evidence justifies a true block.

## Consequences

- **Simplicity:** park, skip, credits, vice, and the root daemon are cut. Less code, less concept.
- **Updateable:** no root install means keel becomes a pure-hook plugin, one-command installable from the marketplace already scaffolded.
- **Self-contained (no Zenborg in v1):** the tide reads keel-native signals only. The Zenborg seam (`2026-06-04-tides-zenborg-seam.md`, the Moments -> Keel edge) is deferred to a later optional integration, so the published plugin stays generic (de-Rafa) and dependency-free.
- **Sequencing:** decision (this doc) -> implement the agent-surface rewrite -> *then* the essay + Show HN. The repo must embody catch-and-steer before the public prose claims it; publishing the "no walls" essay against a repo that still hard-blocks would be equanimitech-washing.
- **Off the table:** leading the launch with "the gate." keel leads with observe + tide + dial.
- **Downstream:** the agent README (rewritten 2026-06-16) needs another pass to lead dial-not-gate; the `vice-*` files archive at a tag alongside the desktop gems.

## Vision (horizon, not v1)

The tide should ultimately **learn the user's own attention rhythm** over time and **model when the tide shifts** (flood -> ebb), rather than read simple signals. That learned rhythm reflects **circadian** (diurnal alertness) and **ultradian** (~90 min) biology, but inferred **from the user's own data** (focus-bout length, switch-rate, cadence by time-of-day), never an imposed textbook curve. The nocturnal-confound finding (this user works late, peak 17h) is precisely the argument for learned-per-person over clock-assumed: keel follows *your* circadian rhythm because it observes yours.

Staging (already on the observability roadmap): **P3 describes** the day-rhythm (descriptive baselines), **P5 models** the tide-shifts (predictive). v1 reads only declared session intention + simple rhythm + a minor clock; the learned, predictive rhythm model is gated behind ~21 days of personal data (observe-first).

Claim discipline: circadian/sleep biology is strong evidence; ultradian (BRAC) is weaker. Model the rhythm from the user's data and validate it; never assert a rhythm curve as fact (same discipline as the flow-productivity flag).
