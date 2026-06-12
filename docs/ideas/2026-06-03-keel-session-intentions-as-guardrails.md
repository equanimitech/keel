# Session intentions as guardrails

> Captured 2026-06-03.

## The seed

Let the operator **declare an intention** at the start of a work session. Then keel uses that stated intention as a **guardrail** — checking subsequent actions/tools against it, the way [[keel-gate-live]] already gates late-night coding.

Raw capture, no body: *"keel: set intentions for sessions, use as guardrails."*

## What it is

Two beats:

1. **Declare.** "This session I'm landing the auth refactor." One line, said up front.
2. **Guard.** keel holds that line. Each subsequent action is checked: *on-intention, or drift?* Drift raises friction.

It's the same shape as the wind-down gate — except the proxy for "what you should be doing" is **your own stated intention**, not the clock.

## Why it fits keel

This is the **primary driver** the strategy already names, finally given a face. From the strategy (Part IV — Drivers, intention-first):

> Intention-alignment (primary). `f` rises as you drift from your *declared* intention.
> - `wind-down` — clock as an intention proxy (the v1, honest stand-in).
> - Zenborg intention — the real source.

`wind-down` was always the honest *stand-in* for "are you on-intention?". A **session intention** is a closer reading of the real signal — narrower than a season's intention, wider than a single tool call. It slots between clock-proxy and Zenborg-as-source: a per-session intention the operator sets by hand, today, without waiting on the Zenborg seam.

And it's intention-first by construction — no usage quota, no "conflate use with drift." The user *says* what counts; keel just holds them to it.

## Sketch (unshaped)

**Where the intention is declared.** Candidates, not decided:

- A `keel intend "…"` command (sibling to `keel skip` / `keel status`).
- A session-start prompt the operator fills (compass "bell" at the open of a block).
- Pulled from the active Zenborg moment when one exists (the future seam — but the hand-set path ships first).

**How it's checked.** The intention is a **driver** that computes `f` per target. Same kernel as wind-down: it reads the action (tool call, domain visited, file/project touched — the observation substrate already carries this) and asks *does this serve the declared intention?* Open: is the check a cheap heuristic (target/keyword match) or a model judgment (ask Claude "is this on-intention?")? Probably starts heuristic, earns the model later.

**What a violation does.** Nudge vs block — and keel's house rule is **nudge > block** (research backbone, Part VI):

- Low drift → **orient**: the bell surfaces it. "You said *land the refactor* — this is a new feature." No cost, just a mirror.
- Sustained drift → **Drogue friction** climbs the drag scale (`dim < delay < blur < block`), breakpoint-armed so it never bites mid-task.
- Hard block is the degenerate top notch, reserved — same as the gate. **Skip credits** override, scarce, as always.

The keel-gate hook is the proof the *block* end already works on Claude's tools. This idea reuses that renderer, swapping the clock driver for an intention driver.

## Relation to the gate

This is the **generalization** of [[keel-gate-live]]. The gate is the special case where the intention is implicit and time-bound: *"after midnight, your intention is to not be coding."* Session-intentions make the intention **explicit and arbitrary** — any declared aim, any time of day.

And it lands squarely on the [[2026-06-03-keel-gate-governs-claude]] observation: the gate didn't just nudge the human, it **governed the agent**. A declared session intention is a sharper leash on the same dynamic — "we're here to do X" curbs the agent's bias-to-action when it wanders toward X+4. *Wind-down governance is agent-alignment infrastructure* → *so is intention governance, and it's not limited to nighttime.*

## Open questions

- **Whose intention is checked — the human's or the agent's actions?** The gate already does both. Worth being deliberate: is this guarding *my* drift, or scoping *Claude's* tools to the stated task? Maybe both, same driver.
- **How is "on-intention" judged** without it becoming a nag or a brittle keyword match? Heuristic floor, model ceiling — but the model call costs tokens and latency on every action.
- **Granularity of "session."** A 90-min block? Until I say done? Until the next intention overwrites it? Does it expire?
- **Re-declaration / mid-session pivot.** Plans legitimately change. Cheap to update, but then the guardrail is only as honest as the operator — same tension as `skip`.
- **Interaction with wind-down.** Two intention-ish drivers composing by `max`. Fine in the model; needs a story for the human ("it's late *and* off-intention").
- **False-positive cost.** A guardrail that misreads honest work as drift trains you to ignore it. Worse than no guardrail.

## Don't shape yet

This is a seed, not a plan. It's attractive because it names the driver the strategy already calls primary — but the *check* (heuristic vs model, human vs agent, declaration UX) is genuinely unresolved, and the false-positive failure mode could sink it. Sit with it. Let the gate + wind-down driver mature first; this rides on that kernel.
