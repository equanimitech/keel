# keel AI-Gate — design (Claude Code focus gate)

> **⊛ Reconciled with the umbrella** (`2026-06-01-keel-strategy.md`, canonical). Superseded wording:
> - The AI-gate hook is a **Shield-capability renderer adapter on the desktop surface** (`block` rung) — not a standalone subsystem. It reads the shared core's `f`/gate decision.
> - **`arm` → `target`**; `f = 1` state is **"cooldown"** (one word; "lockdown" = the desktop cooldown).
> - **TS core, Rust thin edges:** the gate *decision* is the TS core's; the **Rust daemon** writes `state.json` and the hook enforces. Consistent with the resolved language decision.
> - The **focus MCP** (read-only tide state) is distinct from the **authoring MCP** (writes shields) — two adapters, two capabilities.

**Date:** 2026-06-01
**Surface:** keel desktop daemon ↔ Claude Code (hooks + local MCP server)
**Status:** design, approved in brainstorming — ready for implementation plan
**Parent:** `docs/superpowers/specs/2026-06-01-tides-wind-down-design.md` (this is the `AiGate` component, expanded)
**Facts cited from:** official Claude Code docs (hooks-guide, hooks, settings, mcp) via claude-code-guide, current 2026-05-30 — hook JSON schema is version-dependent; re-verify at build.
**Evidence guidance:** "Restoring Attention in Knowledge Work" synthesis — drove three revisions: (1) **no hard cutoff** (hard app cutoffs get abandoned; punitive approaches see 6–10% adoption → dropped the full-turn block, kept coding-block only); (2) **breakpoint-arming** (mid-task interrupts cost ~23 min recovery + residue, Mark 2008 / Leroy 2009 → assert the block at the next natural breakpoint, not the clock tick); (3) **meta-awareness layer** (Desbordes equanimity; meta-awareness has the strongest restoration evidence → a "digital bell" scaffolds noticing, and is the Fade engine). Personalization (credits, user-set times) and periphery-first (the stain) were validated. Claims map to *structural conditions* / interruption-residue / equanimity constructs — never "produces focus."

---

## Part I — Why hooks, not MCP (the load-bearing correction)

**An MCP server cannot gate Claude.** MCP only exposes tools / resources / prompts the agent *may* choose to call; it has no mechanism to block a response, deny a turn, or pause a session (Claude Code `mcp` docs). Therefore reliability cannot come from MCP.

**Hooks are the only deterministic lever.** Hooks run in the harness, not at the model's discretion, and can block:

- `UserPromptSubmit` — exit 2 + stderr **blocks the prompt** (user sees the reason); exit 0 + stdout **injects context**. Budget 30s.
- `PreToolUse` (matcher on tool name) — JSON `{permissionDecision: "deny", permissionDecisionReason}` **denies a tool call** with feedback.
- `SessionStart` — exit 0 + stdout injects once-per-session context.

So the design is **two surfaces**:

| Surface | Role | Reliable? |
|---|---|---|
| **Hook bundle** | the teeth — blocks coding / turns during lockdown | yes (harness-enforced) |
| **MCP server** | focus context — makes Claude tide-aware | no (voluntary) — and that's fine, it's not the enforcement |

---

## Part II — The hook bundle (the teeth)

### Policy lives in the daemon; the hook is a dumb enforcer

The keel daemon writes `~/.keel/state.json` each tick. It computes the **gate decision**; the hook script only maps that decision to an exit code. All policy (curve, times, credits, future Zenborg alignment) stays in the daemon's pure driver — the hook never reasons.

```jsonc
// ~/.keel/state.json — daemon-authored, hook-read
{
  "gate": "allow | coding_block",   // the decision the hook enforces — NO full-turn block
  "phase": "day | wind_down | pending_lockdown | lockdown",
  "friction": 0.42,
  "credits_remaining": 2,
  "reason": "keel: wind-down. Coding paused until 05:00. Spend a skip credit (`keel skip`) to override. Credits left: 2.",
  "context": "23:51, winding down — favor landing open work; avoid starting large new tasks.",
  "bell": "3h unbroken — 01:02. Worth landing the current thread soon.",  // meta-awareness nudge, daemon-authored, may be null
  "arming": { "awaiting_breakpoint": true, "max_grace_until": "01:10" },  // present only in pending_lockdown
  "reset_at": "05:00",
  "updated_at": "2026-06-01T23:51:02Z"
}
```

### Bands — coding-block only, breakpoint-armed (evidence-revised)

Three times — `W` wind-down, `H` hard-stop, `R` reset (defaults `23:30 / 01:00 / 05:00`; tactics, tune later). **No full-turn block and no clock-slam** — both are the failure modes the attention literature documents (hard cutoffs get abandoned; mid-flow interrupts cost ~23 min recovery + residue). The daemon maps clock + credits + the observer's breakpoint signal → `gate`:

| Band | `gate` | Hook behavior |
|---|---|---|
| `day` (f=0) | `allow` | silent — keel invisible (near-enemy guard) |
| `wind_down` (W≤now<H) | `allow` | `UserPromptSubmit` exit 0 + stdout = inject `context` + escalating `bell` (meta-awareness; no block) |
| `pending_lockdown` (now≥H, awaiting a breakpoint, within grace) | `allow` | stain maxed + `bell` intensifies; coding **still works** — keel will not slam you mid-flow |
| `lockdown` (first breakpoint after H, or grace expired; until R) | `coding_block` | `PreToolUse` **denies** `Edit\|Write\|MultiEdit\|NotebookEdit\|Bash` with `reason`; conversation still works |

**Breakpoint-arming (the headline evidence fix).** Crossing `H` does not block; it enters `pending_lockdown`. The daemon asserts `coding_block` at the **next natural breakpoint** — an app switch away, an idle gap, or (future) a git commit, all from the observer — or when a **max grace (~10 min)** expires so it can't be dodged forever. This turns the threshold from a mid-task interrupt into a boundary-respecting one.

**Meta-awareness ("digital bell").** From `W`, the daemon emits an occasional, bounded noticing cue (`bell`) — duration-unbroken + hour — injected on prompt and/or a peripheral desktop notification, intensifying toward `H`. It scaffolds *noticing your own state* (the contemplative mechanism with the best restoration evidence) rather than only blocking — and it is the Fade engine: internalize the noticing, need the wall less. Frequency is capped (the literature: overwhelming users with their own data fails).

**Override / floor.** Spending a credit (deliberate human act) flips the gate to `allow` for the night. At `0 credits`, `coding_block` holds until `R` — but note this only withholds AI *code production*; conversation continues and the machine is never trapped. The softest honest version of "stop me."

### The hook script

A tiny `keel hook <event>`: read `state.json`, branch on `gate`, emit the exit code / JSON. Pure I/O over a local file — no network, ~instant (well under the 30s `UserPromptSubmit` budget).

- **Fails *open*.** Missing file, parse error, or `updated_at` older than ~90s → exit 0, allow. A dead daemon must never trap the user (graceful-failure / safety floor).
- **`reason`/`context` are daemon-authored** — all user-facing messaging in one place, none hard-coded in the hook.

### Reliability ceiling (honest, recorded)

Hooks live in `~/.claude/settings.json`, which is **trivially user-editable** (only enterprise *managed policy* settings are read-only). So:

- keel **installs** the hook entries on setup and the **hard-to-quit daemon re-asserts** them if removed (writes them back each tick if absent).
- A determined user can still kill the daemon *and* delete the hook. That residual escape is the same honest ceiling as the rest of keel — **reliable by default, not unbreakable** — and doubles as the safety valve.
- A truly hard guarantee would require managed-policy settings (enterprise/MDM). **Out of scope** for personal use; noted as the only path to non-bypassable.

---

## Part III — The MCP server (focus context, voluntary)

Read-only, minimal, agent-facing. Applies `designing-mcp-tools`: tools map to agent tasks, concise default, semantic strings over codes, session context loaded once.

### Resource (load once/session) + mirror tool

`keel://focus` resource, mirrored by tool **`keel_focus_status`** for clients without `resources/read`:

- `readOnlyHint: true` (auto-allowable).
- Param `response_format: "concise" (default) | "full"`.
- Returns semantic state — never re-emitted per-request elsewhere:

```jsonc
{ "phase": "day|wind_down|lockdown|deep_lockdown", "friction": 0.42,
  "gate": "allow|coding_block|full_block", "credits_remaining": 2,
  "wind_down_at": "23:30", "reset_at": "05:00",
  "coding_minutes_today": 412, "session_intent": "land the rename PR" }
```

This makes Claude **tide-aware** — the everyday focus win: near wind-down it helps you *land* open work instead of starting a midnight refactor.

### `keel_set_session_intent`

`{ intent: string }` → compact `{ applied: true, intent }`. Goal-setting / self-monitoring (BCT); recorded to the observer and shown in the daily rollup.

### Deliberately NOT exposed

- **`keel_skip`** — spending a credit must be a deliberate *human* act (CLI / keel UI), never agent-callable. An agent-spendable skip collapses the whole friction (you'd just ask Claude to spend it). Hard exclusion.
- Any **write to W/H/D/R or the coding-app list** — config edits are refused during lockdown (parent spec) and are not an agent concern.

### Errors

Daemon down / state unreadable → `keel_focus_status` returns `{ "phase": "unknown", "gate": "allow", "note": "keel daemon not running" }` (fail-open, actionable) — never a bare error code.

---

## Part IV — The Zenborg seam (future intention source; lightweight now)

The clock (`W/H/D/R`) is an honest **stand-in** for the real signal. The actual "tide" is **alignment with declared intention**, and those intentions already live in **Zenborg** (cycle = season intention, moments = today's intentions, areas = life domains).

- **v1 (now):** gate decided by clock + credits. Lightweight. No Zenborg dependency.
- **Future:** the daemon's `FrictionDriver` consults Zenborg — "is coding *right now* on-intention (an allocated moment / aligned with the active cycle)?" — and sets `gate` from *that*, not the hour. Late coding that *is* the season's intention gets a lighter touch; off-intention drift gets the wall regardless of clock.
- **Seam:** `FrictionDriver` and an `IntentionSource` are **ports**. Clock-source is the v1 implementation; a `ZenborgIntentionSource` slots in later **without touching the hook bundle, the MCP surface, or `state.json`'s `gate` contract**. The hook stays a dumb enforcer either way.

---

## Part V — Components / files (indicative; finalized in the plan)

- **Daemon:** writes `~/.keel/state.json` each tick (gate + reason + context); installs & re-asserts hook entries in `~/.claude/settings.json`.
- **`keel hook <event>`** CLI subcommand — the thin enforcer (reads state, emits exit code / JSON). Fails open.
- **MCP server** — `keel://focus` resource + `keel_focus_status` + `keel_set_session_intent`. Reads the same `state.json`.
- **Ports:** `IntentionSource` (clock now, Zenborg later), `FrictionDriver` → `gate`.
- **Settings writer** — idempotent install/repair of the three hook entries (`UserPromptSubmit`, `PreToolUse` matcher, `SessionStart`).

---

## Out of scope (named)

- Zenborg intention source (Part IV) — seam only.
- Managed-policy / MDM enforcement (the only non-bypassable path).
- Active focus *coaching* (proactive thread-summaries, scope-policing) — risks nagging / Fade tension; revisit once tides are defined.
- Agent-spendable skip; agent-editable config.
- Non-`command` hook types; non-macOS daemon.

---

## Acceptance

- During `day`, Claude Code behaves normally; keel injects nothing.
- During `wind_down`, each prompt gets a one-line focus context + an escalating meta-awareness `bell` injected (no block).
- Crossing `H` enters `pending_lockdown`: coding still works; the gate asserts `coding_block` only at the **next breakpoint** (switch/idle/commit) or when the ~10-min grace expires — never mid-keystroke.
- During `lockdown`, `Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`Bash` are denied with keel's `reason`; conversation still works. **No full-turn block exists.**
- Spending a credit (human, via CLI/UI) flips the gate to `allow` for the night; at `0 credits` `coding_block` holds to `R` (withholds code production only; never traps the machine).
- Killing or pausing the daemon, or a stale/missing `state.json`, **fails open** (Claude works) — never traps.
- Removing the hook from settings is re-asserted by the daemon on next tick; a user who also kills the daemon can still remove it (honest ceiling).
- MCP `keel_focus_status` is read-only, concise-by-default, returns semantic `phase`/`gate`; no `keel_skip` tool exists.
- Swapping the clock `IntentionSource` for a Zenborg one requires no change to the hook bundle, the MCP surface, or the `state.json` `gate` contract.
- No claim that the gate *produces* focus/equanimity; it raises the cost of the compulsive path. Local-only; no network.
