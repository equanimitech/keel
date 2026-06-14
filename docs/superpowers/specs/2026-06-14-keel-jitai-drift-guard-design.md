# keel JITAI drift-guard: design (first self-authored intervention)

> **Status: SUPERSEDED / PARKED (2026-06-14).** Drafted as a "JITAI" intervention,
> then reframed during the keel corpus review: interventions are P5-gated (they
> re-enter only after ~21 days of clean baseline, per
> `docs/decisions/2026-06-12-retire-the-intervention-layer-shields-signals-and-six-domain.md`).
> What ships now in its place is a **commitment device** (the keel-gate / drogue
> family of explicitly-consented precommitment), not a JITAI. Kept for the loop
> mapping and behavioral grounding below. Do not implement as written.

**Date:** 2026-06-14
**Surface:** keel agent (Claude Code `pre-tool` hook + `~/.keel` state)
**Status:** superseded / parked (see banner above)
**Parent:** `docs/superpowers/specs/2026-06-01-keel-ai-gate-design.md` (the focus gate this extends)
**Related:** Things task "Design keel's JITAI loop (v0)" (the loop this is the first instance of); Things task "Retire keel's drogue once JITAI can replace it" (this is the replacement pattern)
**Method:** behavioral-design (BCT/PDP grounding, below) precedes code per the JITAI task's prescribed method. The falsifiable-hypothesis pass (hypothesis-shaper) applies to the *learned-baseline* interventions that follow; this v0 rule is hand-authored, so its claim is operational, not experimental (see Part I).

---

## Part I: Thesis, steer from day one

keel must steer from the first install, before it has observed anything. If steering waited on accumulated baselines, keel would be a logger holding a promissory note. The drift-guard proves it does not have to wait: it steers immediately off an **authored** signal (an active Zenborg cycle whose intention excludes a named project), not a learned one.

Baselines are an enhancement, never a gate. Later interventions (breathwork at the AI-wait breakpoint) learn their decision rules from personal data and need the receptivity/fade machinery to be statistically honest. This one does not. Its decision rule is grounded in a genuinely personal, explicit signal the principal already keeps (the cycle heading), so it sidesteps the "decision rules need a personal baseline or they are generic nagging" worry: the cycle *is* the baseline.

The concrete v0 need that motivates it: the active cycle **Aiguablava** (2026-06-11 to 2026-06-18) is a sea-swim bootcamp whose intention is the water, family tennis, and shoulder recovery, explicitly not work. The principal wants keel to hold him off the Themia codebase for the rest of the cycle, with a deliberate way through when it truly matters.

## Part II: The five-part JITAI loop, mapped

| Loop part | This intervention |
|---|---|
| **Tailoring variable** | The `drift` lens: being pulled off the cycle's heading. Context is an active cycle whose intention excludes the named project. |
| **Decision point** | A coding-tool call (`Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`Bash`) whose target path falls under the project root (`~/Developer/themia`). The moment of reach, already visible to the `pre-tool` hook. |
| **Intervention option** | Block notch coupled to a steer: surface the cycle heading in the principal's words, offer the alternative (close the laptop, go to the water). |
| **Decision rule** | `today within cycle window AND path under project root AND not held this session` produces `block + steer`. |
| **Receptivity + fade** | Delivered only at the moment of reach, never as a background nag (maximal receptivity). Auto-lifts at the cycle boundary. The sovereign pass re-arms after a session gap, so each genuine return re-confronts the heading (titration). |

## Part III: Wall versus steer, the drogue's successor

The drogue (host-level site block) is queued for retirement because it is a wall at the *destination*: it re-asserts, cannot be passed in the moment, and migrates the compulsion to another device. A crutch, not capacity.

The drift-guard is the opposite mechanism for the same user intent ("hold me off X"):

- **Drogue:** wall at the destination. No conscious pass. Leaks across devices.
- **Drift-guard:** catch-and-steer at the moment of reach. Surfaces the heading, offers the alternative, and lets the principal **consciously take the helm** via the sovereign pass.

This answers the open question in the retire-the-drogue task ("what does the JITAI replacement for 'block this site' look like at the moment of reach, and is there ever a place for a user-chosen wall?"): the wall becomes a catch with a sovereign pass, and there is no place for a pure wall.

The load-bearing consequence for the design: **the override is not an escape from a block, it is the steering act.** Passing through is the principal taking the helm on purpose, which is the point, not a leak. Three parts are therefore non-negotiable, not decoration:

1. the **steer** (heading + alternative) accompanies every block,
2. the pass is **sovereign and free** (no rationing, no credit cost), and
3. the intervention **fades** (auto-lifts at the cycle boundary; the pass re-arms each session).

A bare `deny` with none of these would be a drogue wearing a new name.

## Part IV: How it fits inside keel agent

No new surface, no new daemon, no bent driver. The wind-down `driver` and its friction `rules` stay exactly as they are.

- **New domain concept in `core.mjs`:** an `interventions: []` array on the target, parallel to `rules`. Each intervention is event-triggered (path + context window), not friction-ramp-triggered, which is why it is a sibling of `rules` rather than a new `rule`.
- **Decision point** is the existing `pre-tool` hook. It gains one pure check: for each active intervention, match tool and path and window and held-state, and if all hold, deny with the steer voice. Reuses the existing path-matching (the same matcher used for `allowPaths`, applied as a deny set here), the notch render, the voice block, and the state store. Fail-open like the rest of the gate: any error allows the tool.
- **Sovereign pass** is a new CLI verb (working name `keel intervene <id> off`; final naming is a spec detail, candidates `hold` / `steer`). It writes a session-stamped hold to state. The hold expires after a session gap (reuse `orient.sessionGapMin`, currently 30 min), so a genuine return re-confronts the heading.
- **Visibility** is `keel status`: list active interventions and whether each is held this session.
- **Fade** is the `activeUntil` field, resolved from the cycle and written in now. Live derivation from the Zenborg vault is a noted future option, not v0 (keeps keel from coupling to zenborg's vault format and keeps the hook fast and fail-open).

Generality, on purpose: the `trigger` is path-based today but shaped so a `domain`-based trigger is a later variant. When the drogue retires, a site-reach intervention is just another entry in the same `interventions` array, so the drogue has somewhere to land.

## Part V: Config shape

Added under the `claude-code` target in `~/.keel/config.json`:

```jsonc
"interventions": [
  {
    "id": "themia-rest",
    "lens": "drift",
    "trigger": {
      "tools": ["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"],
      "paths": ["~/Developer/themia"],
      "activeUntil": "2026-06-19"     // morning after Aiguablava ends (2026-06-18)
    },
    "notch": "block",
    "steer": {
      "voice": "Aiguablava cycle: mornings belong to the water, not Themia. This repo is on hold until the round-trip is done.",
      "alternative": "Close the laptop. The swim won't wait, and Themia will keep."
    },
    "pass": {
      "kind": "free",
      "scope": "session",            // re-arms after orient.sessionGapMin of quiet
      "verb": "keel intervene themia off"
    }
  }
]
```

`activeUntil` is an exclusive date boundary in local time: the intervention is inert once `today >= activeUntil`, so it lifts on the morning of 2026-06-19.

## Part VI: Decision logic (pure core)

```
interventionDecision(target, state, toolName, toolPath, now):
  for iv in target.interventions:
    if now's date >= iv.trigger.activeUntil: continue        // faded
    if toolName not in iv.trigger.tools: continue
    if toolPath not under any of iv.trigger.paths: continue  // reuse allowPaths matcher
    if heldThisSession(state, iv.id, now, sessionGapMin): continue  // sovereign pass active
    return deny(render(iv.steer))                            // catch + steer
  return allow
```

State for the pass:

```jsonc
// ~/.keel/state.json
"interventionHolds": {
  "themia-rest": "2026-06-14T18:42:11Z"   // last pass timestamp; expires after sessionGapMin
}
```

`keel intervene themia off` stamps `now` into `interventionHolds[id]`. `heldThisSession` returns true while `now - hold < sessionGapMin`. No credits are touched (the pass is free, distinct from the scarce `skip`).

The `pre-tool` hook composes the existing lockdown decision with the new intervention decision: deny if **either** the wind-down lockdown denies (existing behavior) **or** an active intervention denies (new). The two are independent; the intervention can bite at noon, the lockdown only at night.

## Part VII: Behavioral grounding (BCT / PDP)

**BCTs present**

- **Commitment / Behavioral contract** (Goals & Planning): the pact is a deliberate up-front commitment; the gate is its teeth. MoA: behavioral regulation.
- **Remove access to reward** (Associations): the block removes easy access to the Themia-work pull at the moment of reach. This is the BCT a pure wall would stop at, which is why it cannot stand alone here.
- **Behavioral substitution** (Repetition & Substitution): the `alternative` offers the water in place of the code. MoA: behavioral substitution.
- **Discrepancy between current behavior and goal** (Goals & Planning): the steer surfaces the gap between reaching for Themia and the cycle's heading.

**PDPs present**

- **Tailoring** (Primary Task): adapt to context (active cycle + project path). This is literally the JITAI tailoring variable.
- **Suggestion** (Dialogue): offer the fitting alternative at the right moment.
- **Reduction** (Primary Task): the sovereign pass reduces "work on Themia anyway" to a single intentional act, preserving agency.
- **Social role** (Dialogue): keel speaks as the steady course-holder, in the principal's own words.

**Calm-tech / washing check**

- No reward loop. The anti-pattern "well-timed interruption coupled to reward, the platform playbook in reverse" does not apply: this removes access and substitutes, it does not reward.
- Wall versus steer is resolved in Part III: the steer, the sovereign pass, and the fade are what keep it on keel's spine and off the drogue's.
- Receptivity is satisfied by delivery only at the moment of reach, never as a background nag.
- Fade is satisfied by the cycle-boundary auto-lift and the session re-arm.

## Part VIII: Testing

Pure-core unit tests (`core.test.mjs`, `node --test`), no I/O:

- path under / not under project root (including descendant and sibling-prefix edge cases, e.g. `~/Developer/themia-adjacent` must not match `~/Developer/themia`).
- tool in / not in trigger set.
- `now` before / on / after `activeUntil` (boundary lifts on the date, exclusive).
- held versus expired session (just under and just over `sessionGapMin`).
- composition: intervention denies while wind-down allows (noon), wind-down denies while intervention inert (post-cycle night), both deny, neither denies.
- fail-open: a malformed intervention entry allows the tool and does not throw.

State round-trip tests (`store.test.mjs`): stamp a hold, read it back, confirm expiry math.

## Part IX: Out of scope for v0 (named so it is not silently dropped)

- Live derivation of `activeUntil` from the Zenborg vault (v0 writes the resolved date; re-run setup if the cycle moves).
- `domain`-based triggers (the site-reach variant that lets the drogue retire).
- Learned decision rules / personal baselines (the breathwork-at-AI-wait intervention; needs the hypothesis-shaper falsifiability pass before code).
- A phone surface for cross-device holding.
- Any change to the wind-down driver, the friction ramp, the skip-credit budget, or the vice block.
