# Retire every gate on the agent surface, and read the day's shape from kairos

**Date:** 2026-08-18
**Context:** `keel` (agent surface: `apps/agent`)

## Decision

The keel agent surface **denies nothing**. `PreToolUse` is observation only.

Three gates are removed, not disabled:

- **The night lock.** The clock-armed `block` rule (`rules[].notch: "block"`, `engagesAt: 1`) and the whole friction model beneath it: `frictionAt`, `frictionNow`, `phaseOf`, `nightWindow`, `denyingRule`, `isAllowedPath`, `denyReason`, `renderOrient`, and the `windDown` ramp.
- **The day-note gate.** `signOnBlocks`, `SIGNON_TOOLS`, `SIGNON_ALLOW`, `SIGNON_DENY`, the `signOnGate` flag, and `loadDayNotes`, which existed only to feed it.
- **The single-stream focus lock.** `FOCUS_DENY`, `claimFocus`, `focusBlocks`, and `State.focusSession`.

`keel focus` **survives as a marker**. It flips a flag, stamps `focusTs`, writes `focus_on` / `focus_off` to the log so read-side analysis can segment focus periods, shows `◉` in the HUD, and puts a breath on the AI-wait gap. It holds nothing.

keel also **stops declaring its own `watches`**. The day's shape is read from the kernel: `$KAIROS_HOME/phaseConfigs.json`, via `loadPhaseConfigs` and `bandAt`, the same one-way seam by which keel already reads `areas.json`, `moments.json`, and `activeMoment.json`. `Target` is now only `{ orient, voice }`.

The log's `keel_phase` field (`day` / `wind_down` / `lockdown`) is replaced by **`keel_band`** (`MORNING` / `AFTERNOON` / `EVENING` / `NIGHT`). A new name, not new values under the old one: the log is append-only, and silently changing what a field means would corrupt every read-side derivation that spans the boundary. Events before 2026-08-18 carry `keel_phase`; events after carry `keel_band`; neither is ambiguous.

## Rationale

**The exception carved in 2026-06-17 did not hold.** That decision retired the walls but kept `block` "for a single defensible case only: the late backstop, where the sleep-deprived self cannot self-assess." In practice the backstop fired against ordinary work, and the only way past it was to hand-edit the config that enforced it. The repo already named this failure mode when `keel signon` was removed on 2026-08-07: a key cut from inside the locked box. A wall whose documented escape hatch is editing the wall is not a commitment device, it is friction with extra steps.

**It contradicted keel's own evidence base.** `docs/references/attention-research-basis.md` puts hard cutoffs in the *Fails* column, records that blocking *increased* workload for high perceived-work-control users, and states principle 3 as "nudge rather than block." The 2026-06-17 decision cited that file and then carved one exception out of it. This removes the exception.

**It violated the invariant the browser surface enforces by type.** `AmbientRule.primitives` is `Exclude<PrimitiveSpec, CooldownSpec>`, so ambient observation can arm a gate but never a lock: locks are self-invoked only. A clock is ambient. The night lock was a clock-armed lock, which is precisely the construction `@keel/domain` makes unrepresentable on the other surface. The agent surface was the one place that invariant was written down and not obeyed.

**Two sources of truth for the same four names had drifted.** keel's `watches` said evening@19:00 and night@00:30; zenborg's `phaseConfigs` said EVENING 20:00→03:00 and NIGHT 03:00→09:00. Moments are placed against zenborg's bands, so keel already depended on that answer while carrying a private one beside it. Deleting keel's copy removes the disagreement rather than reconciling it.

**Alternatives rejected:** (a) keep the night lock and only widen its `allowPaths`, rejected because the problem is the wall, not its exemptions; (b) keep `watches` as a keel-local override of the kernel bands, rejected because an override is how the two drifted apart in the first place; (c) drop band tagging entirely and derive it read-side, rejected because the kernel's bands can be re-cut later and an event has to remember the day it was filed against.

## Consequences

- **The surface is smaller.** `core.mjs` 863 → 673 lines, `keel.mjs` 433 → 387. `lockdown.test.mjs` is gone. 119 agent tests pass; the agent typechecks clean.
- **`keel status` and the HUD lose their lock reporting.** No `f=`, no phase, no `🔒 locked till`, no `🌙 winding down` countdown. A countdown to a wall that no longer exists is worse than silence. `keel status` now reports band, gates (none), moment, focus, and granularity.
- **`keel rules` reports the kernel's bands** with provenance `(kairos)` rather than custom/default, because they are not keel's to default. It also states plainly that nothing is gated.
- **A stale `config.json` is inert, not dangerous.** `mergeTarget` drops `watches`, `windDown`, `rules`, and `signOnGate` outright, so a leftover key on an un-cleaned machine cannot re-arm anything. There is a test pinning exactly this.
- **The `/focus` skill and `close-up` need rewording.** Both describe focus as a lock that holds other sessions. The gate is gone; the marker is not. `docs/ideas/2026-08-14-kill-the-focus-skill.md` asked whether the gate was dying or only the skill arming it. This answers half of it: the gate died, the marker lives, and the skill still has something to arm.
- **Nothing observable is lost.** Every gate decision was already logged; there are simply no decisions to log now. The dispatch record, the band, and the focus periods all remain.

## Status

Unstamped. Recorded on branch `worktree-remove-agent-gates`; stamp after merge if it should carry an attestation.
