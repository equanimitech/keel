# Granularity — a ceiling, not a floor

**Date:** 2026-08-08
**Status:** design, not yet built
**Owner:** keel (`apps/agent/core.mjs`)
**First caller:** zenborg's sign-on screen
(`zenborg/docs/superpowers/specs/2026-08-08-sign-on-screen-design.md`)

## The bug, stated plainly

The response-depth dial never moves. Not because it is ignored — because it is
built to spring back:

```js
/** Set the session granularity (the response-depth dial). Session-scoped — a fresh
 * session resets it to the floor at session-start. */
export function setGranularity(state, level) { … }

export const DEFAULT_GRANULARITY = "tldr";
```

Every new Claude Code session opens at `tldr`. The only way to move it is saying
"page it" mid-session, and that dies when the session ends. Many sessions a day
means **always `tldr`, by construction**. A floor is a constant; calling it a dial
does not make it vary.

The four levels themselves are fine and stay as they are — `sentence` (L1),
`tldr` (L2), `page` (L3), `report` (L5), mapping to semantic-zoom.

## Why one dial cannot be precise

Depth varies at three different frequencies. keel currently models only the
coarsest, and then resets it.

**The day — how much you have.** One tap, at sign-on. Must survive every session
that day. This is `appetite`, which existed as a skill
(`_archived-appetite-2026-06-16`) and was retired 2026-06-16.

**The block — what kind of work this is.** A debug loop wants `sentence`; a design
conversation wants `report`. This turns over two or three times a day, and **keel
already knows it**: the active moment names its area and tags. `#data` at 10:00
and `admin` at 16:00 are different depth regimes and neither needs asking.

**The turn — what this particular ask deserves.** "Is X true?" wants a sentence
whatever the dial says; "let's think through X" wants depth even on a light day.
The finest signal, the most accurate, and free — it comes from reading the
message.

## The change

### 1. Day-scoped persistence

`granularity` moves from session state to day-keyed state on the **04:00 roll**,
the same boundary `focusDayKey` already uses everywhere else. A fresh session
inherits the day's setting instead of resetting it.

**This is a prerequisite for the sign-on tap**, not an enhancement: a tap that
evaporates at the next `claude` invocation sets nothing.

Releasing stays as it was — clear it explicitly, or let it lapse at the roll.

### 2. Floor becomes ceiling

Today `tldr` is the resting state. It becomes a **cap**, and the resting state
becomes *fit the answer to the ask*:

```
effective = min(what the ask deserves, block regime, day ceiling, night ceiling)
```

Ordinal by level: `sentence` < `tldr` < `page` < `report`. `min` already governs
the night ceiling; this applies the same rule to the resting state instead of
pinning it.

**Unset appetite caps at `page`.** Not `tldr` — that reinstates the bug — and not
uncapped, which invites a report for every passing question. `page` is the
"usable" level and a defensible neutral. *Proposed value; move it if a week of
use says otherwise.*

### 3. Modulation from the active moment

The block regime derives from the moment keel already reads. Craft blocks
(`#data` / `#ux` / `#offer`, equanimitech) lean deeper; `admin`, `support` and
`meeting` lean terser. No new input, no new state, and it changes when the block
changes.

Absent an active moment, the block regime contributes nothing — the day ceiling
and the ask decide. Fails soft, like everything else reading the vault.

### 4. Flag the cap, do not silently obey it

Preserved from the archived skill, and it matters more under a ceiling than under
a floor: when an ask genuinely wants more than the day allows, **say so and offer
the fork** rather than quietly under-answering.

> *"This wants a page and today's ceiling is tldr. Raise it, or want the short
> version and the rest captured?"*

Silent under-delivery is the failure mode a ceiling introduces, and this is its
only guard.

## The falsifiable check

**The granularity line must visibly change during a normal day.** If it reads the
same level every time it is looked at, the modulation is not working, however many
levels exist. That is the acceptance test — not that the code paths run.

Worth logging the effective level per turn so the claim can be checked against the
activity log rather than by impression.

## Scope

**must-have**

- Day-scoped persistence on the 04:00 roll
- `min()` composition with the resting state unpinned; unset caps at `page`
- The `granularity` line renders the ceiling and the resting rule, not one level
- Cap-flagging when an ask exceeds the day

**should-have**

- Block regime derived from the active moment's area and tags
- Effective level logged per turn, so the check above is measurable

**nice-to-have**

- Reviving the `appetite` skill as an alias for setting the ceiling from a session

## What does not change

- **The night ceiling still wins.** Wind-down and lockdown already tighten
  granularity, and a `report` appetite at 23:00 still yields. Effective depth
  honours the floor of the day, not its ambition.
- **Per-response signal still works.** "page it", "in a sentence" continue to
  override for one turn, under the ceiling.
- **The four levels and their semantic-zoom mapping** are unchanged.

## Why this is not a mood feature

An earlier proposal was a "how do you feel" check-in at sign-on, driving the same
dial. Rejected, and worth recording why:

- **Feeling is not capacity.** Steering a response needs to know how deep to go,
  which `appetite` asks directly. Going via mood adds an inference step — tired
  therefore shallower — that a machine makes about its principal, and that can
  fail in the direction that hurts: flat days are often exactly when the machine
  should carry more.
- **The `/sign-on` skill forbids it outright.** *"No reflection beats. Gratitude /
  feelings / sleep are off-screen, on paper."*
- **It puts an introspection step in front of an already-retired dial**, making it
  harder to set rather than easier.

Body state may *inform* the ceiling later — a short night easing it — but per the
Garmin writer's own conclusion, body state is **a covariate, not a tide**. It never
drives.

## Addendum (2026-08-12): the tray sets it too

The dial was CLI-only, which is a reachability bug for a dial meant to move
daily: setting it cost a terminal, and the cheapest thing to do with a cost is
not pay it. The menubar tray now carries a `Granularity` submenu — the ceiling
in force in its title, one checked row per level, and a reset.

Two invariants this creates, both load-bearing:

- **The tray restates, it does not decide.** `apps/tray/src-tauri/src/domain.rs`
  mirrors `GRANULARITY_ORDER`, `DEFAULT_GRANULARITY`, and the 04:00 `focusDayKey`
  from `apps/agent/core.mjs`. Change one, change both. Two writers disagreeing
  about today's ceiling would be worse than leaving the tray out of it.
- **`state.json` now has two writers.** The tray owns exactly two fields and
  reads the whole document before writing it, so the agent's focus lock and
  session timestamps survive. It is still last-writer-wins on a collision, which
  is acceptable only because both writes are read-modify-write in one breath —
  never from a cached copy. A tray that held state in memory would silently roll
  back whatever the CLI changed since it opened.

The menu re-reads on the 30s rollup rather than on open: the CLI can move the
dial, and the waking day rolls, without anyone touching the tray.

## Addendum (2026-08-12): the ceiling is re-asserted when it moves

Making the dial reachable exposed the next link in the chain. The ceiling was
injected into the agent exactly once, at `session-start`; after that it lived
only in the statusline HUD — *"ambient by design: indicators live in the
statusline, not injected per-turn."* That held while the dial was CLI-only and
changed about once a day. It stopped holding the moment the tray put it one
click away: a ceiling moved mid-session never reached the agent, which kept
answering at the level it was told at open.

The symptom was not subtle, and it is worth recording in the operator's words:
**"I feel like the responses aren't really governed by the attention level no?"**
They were not. Ambience is a channel to the *principal's eyes*; it was being
counted on as a channel to the *agent's context*, and those are not the same
place.

`granularityNotice` keeps the ambience and closes the gap: silent on any turn
whose ceiling matches what that session was last told, re-surfaced the first
time a session meets a level it has not been told — including the 04:00 lapse
back to the default.

**Per session, not global.** With several sessions open (nine, the day this was
found), a global "already shown" flag would tell one and silence the rest,
leaving most of them steering by a stale contract. The marks are keyed by
session id, bounded by a day's TTL and a count, and last-writer-wins on a race —
the worst outcome is a session being told twice, which is why this is a notice
and not a gate.

**Still no enforcement, deliberately.** Nothing makes the agent obey. The spec's
existing guard is against silent *under*-delivery; over-delivery has no trip
wire at all. Being told is a precondition for obeying, not a substitute — if
over-delivery persists now that the telling is reliable, that is a separate and
better-posed problem.
