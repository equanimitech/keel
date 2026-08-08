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
