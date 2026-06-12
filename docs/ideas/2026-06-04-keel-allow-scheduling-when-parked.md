# keel should always allow scheduling when parked — and use it to delegate parked work

> Captured 2026-06-04. Pain (friction). Observed 2026-06-03 late-night session.

**Don't fix yet.** This is a captured friction report, not a work order. Capture and move on.

## The friction

Late-night session, past `hardStop`, coding parked (`f = 1`, phase `lockdown`). I was setting up a **remote routine** — scheduling work to run *later*, in the morning. The setup needed the wall clock, so the agent ran:

```
date -u
```

keel **denied it.** `Bash` is on the lockdown block rule's `tools` list, and the gate matches on `tool_name` alone — it never inspects what the command *is*. So `date -u`, called purely to compute a `run_once_at` timestamp for a deferred routine, got swept up as if it were ordinary 2am coding.

## Why it's backwards

Scheduling is not a wind-down violation — **it is the wind-down move.**

keel's whole thesis (per `2026-06-01-keel-strategy.md`) is "land, don't launch": resist *starting* deep work late, orient toward closing the loop. Deferring work to the morning via a scheduled routine does exactly that. It gets the work **out** of wind-down. It's the most keel-aligned thing you can do at 2am — the substitution behavior the gate already gestures at ("jot tomorrow's first task, then sleep"), just executed instead of jotted.

Blocking the very tool that lets you defer work is the gate fighting its own goal. The drogue is supposed to add drag to *launching*; here it added drag to *parking*.

## Two-part fix

**1. Allowlist scheduling, even when parked.** Scheduling tools are wind-down-aligned and must pass the lockdown block:
- `RemoteTrigger` (and kin — `CronCreate`, `schedule` routines) — never block these.
- `date` (and equivalent clock reads) when in service of a `run_once_at` / schedule — they're plumbing for deferral, not coding.

The mechanism gap: `denyingRule` in `packages/keel-gate/core.mjs` matches `Bash` by `tool_name` and ignores `input.tool_input.command`. A `date -u` is indistinguishable from an `npm run build`. The fix lives at command-level granularity — either an explicit allow-list of commands on the rule (e.g. `allowCommands: ["date", ...]`), or hoisting scheduling tools out of the blocked `tools` set entirely. `RemoteTrigger`/`CronCreate` are simpler — they're distinct tool names, so just keep them off the rule's `tools` list.

**2. keel should *proactively* offer to defer.** Today the gate only resists (Drogue). It should also *reveal a path* (Compass-orient): when it parks coding in `lockdown`, the orient line should offer to schedule the parked work for the morning, not just say "park it." Turn the block into a hand-off. "I can't build this now — want me to schedule it to run at 07:00?" The substitution becomes a one-tap delegation instead of a note-to-self.

## Where it lives

The gate is **pure hooks**, not the strategy doc's larger model:

- `packages/keel-gate/keel.mjs` — hook dispatch. `handlePreTool` calls `denyingRule(...)` and emits the `PreToolUse` `permissionDecision: "deny"`. This is where `date -u` got stopped.
- `packages/keel-gate/core.mjs` — `denyingRule(target, f, tool, state, now)` (the deny decision) + `DEFAULT_TARGET.rules[0].tools = ["Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"]` (the block set). **This is the load-bearing line** — `Bash` here is what catches every `date`/`schedule` plumbing command. Command-level granularity, if added, goes in `denyingRule`.
- `packages/keel-gate/config.sample.json` — the same `tools` array, user-editable. An allowlist field would surface here too.
- `renderOrient(...)` in `core.mjs` — where the proactive "want me to schedule it for morning?" offer (part 2) would attach to the lockdown orient line.

The wired-up rule is in `~/.keel/config.json` (runtime, outside the repo), hook entries in `~/.claude/settings.json`.

## Open questions

- **Granularity vs. fail-open.** The gate is deliberately `tool_name`-only for simplicity and to stay fail-open. Parsing `Bash` command strings to allow `date` is a step toward the thing keel avoided. Is a command allowlist worth the complexity, or is hoisting the distinct scheduling *tools* (`RemoteTrigger`, `CronCreate`) off the block set enough — accepting that raw `date -u` in Bash stays blocked?
- **Abuse surface.** If `date`/scheduling is always allowed, can a parked session smuggle real work through a "scheduled" routine that runs immediately (`run_once_at` = now)? Does "schedule" need a minimum defer horizon (e.g. ≥ next reset) to count as genuine deferral?
- **Whose move is the offer?** Part 2 has keel proposing to schedule. Does the agent then *execute* the schedule (a tool call that itself must pass the gate — hence part 1 must land first), or does it only draft the routine for the human to confirm at reset?
- **Is "defer to morning" always right?** Some parked work is better dropped than deferred. Should the orient offer distinguish "schedule it" from "let it go"?
