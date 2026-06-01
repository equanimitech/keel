# keel — Areas (the Drogue grouping primitive)

**Date:** 2026-06-01
**Status:** child spec. Defines the `Area` primitive for the Drogue capability.
**Parent:** `2026-06-01-keel-strategy.md` (the stamped umbrella). This spec does
**not** modify the umbrella — the umbrella is attested. When the umbrella is next
re-stamped, add this file to its Children list.
**Grounded in:** strategy Part III (friction model / notch / `FrictionRenderer`
port) and Part IV (intention-first drivers).

***

## Why this exists

The browser surface already ships block- and delay-notch renderers — the
LinkedIn/YouTube cooldown (a `block` notch, time-boxed = *"cooldown = f pinned to
1"*) and the chess post-game cooldown (a `delay` notch on a transition). They are
per-domain and fired **manually from the popup**. What's missing is the unit that
(a) groups targets, (b) sets a default notch, and (c) binds them to a **driver**
so friction engages by *context*, not a manual tap.

That unit is **`Area`**.

## Area is load-bearing (not a display folder)

The test: if notch + engagement were per-target, `Area` would be mere grouping.
It survives for one reason — **Area is where the driver meets the targets.**

The Part IV driver asks *"is what you're doing now on-intention?"* Intention is
defined at **life-domain granularity** — a Zenborg `Area` — not per-domain. You
wind down from *"social,"* not from *"linkedin.com."* Without `Area` the intention
driver has nothing of the right grain to bind to. Grouping and the Zenborg seam
are bonuses; the **driver-join** is the justification.

## The model — one type, four orthogonal dials

```
Area {
  id          // "porn", "social", "games"
  targets[]   // the specific list: domains (+ optional per-target notch override)
  notch       // DEFAULT for its targets: hide < dim < delay < blur < block
  engagement  // when it fires: always | wind-down | intention | manual
}
```

Each dial is independent:

| dial         | what it answers      | porn          | social               |
| ------------ | -------------------- | ------------- | -------------------- |
| `targets`    | which scopes         | big category  | [linkedin, reddit]   |
| `notch`      | how hard             | `block`       | `block` \| `delay`   |
| `engagement` | when                 | `always`      | `wind-down`          |
| **adapter**  | **how rendered**     | **derived ↓** | **derived ↓**        |

**Notch is per-target; Area sets the default.** `social` may hold
`linkedin=delay, reddit=block`. Area still owns the *driver*.

**"Binary drogue" = `engagement: always`** (strategy's "one notch, engagesAt 1").
It is a property of the *engagement* dial, orthogonal to notch and adapter. Any
area can be binary; porn simply is.

## The adapter is derived, never hand-set

The render layer is computed by the kernel from `notch + breadth + host-perm
budget`. It is one of several adapters behind the single `FrictionRenderer` port
(strategy Part III: "adapters live in the surface — DOM, overlay, or the Claude
Code hook").

```
block + whole category + zero host perms   → NETWORK-DNR adapter
block + named site                          → DOM-overlay adapter   (linkedin cooldown)
delay / blur / dim / hide                   → DOM adapter           (chess gate)
```

**Host-permission rule (load-bearing).** DNR `redirect`/`modifyHeaders` need host
permissions; DNR `block` does not. keel ships **zero** host_permissions (the
structural "cannot read your browsing" guarantee). Therefore:

- **Network-DNR adapter** = `block` only, no branded page, but category-wide and
  host-perm-free. The bottom/coarsest rung of "how `block` is physically rendered."
- **DOM adapters** (overlay/gate/blur/…) need the target site's *own* narrow,
  declared match — never broad host perms. This is how the existing cooldowns
  already work.

So the "network renderer" is not a separate kind of area — it is the deepest
adapter the `block` notch resolves to when the target set is a whole category.

## Porn = the corner, not the exception

```
Area {
  id: "porn"
  targets: [ …big category list… ]   // gitignored seed + user list (local-first)
  notch: block
  engagement: always                  // binary
}
→ adapter: NETWORK-DNR   (derived: category + zero host perms)
```

Every dial at its coarse extreme. Same `Area` record as `social`, different dial
settings. Nothing is special-cased.

## Mapping what already exists

| existing                | Area          | notch  | engagement (today) | adapter      |
| ----------------------- | ------------- | ------ | ------------------ | ------------ |
| porn blocklist          | `porn`        | block  | always             | network-DNR  |
| linkedin/youtube cooldown | `social`    | block  | manual (popup)     | DOM-overlay  |
| chess post-game cooldown  | `games`     | delay  | manual (post-game) | DOM-gate     |

The work is not new renderers — it is lifting these under `Area` and (later)
replacing the manual trigger with a **driver**: `wind-down` first (tides), then
**Zenborg intention** (strategy Part IV).

## Zenborg seam

`keel Area.id` ↔ `Zenborg Area`. When the intention driver lands, a keel area's
`engagement` reads the matching Zenborg area's on-intention state. Until then,
`engagement` is `manual` or `always`. The seam is a port, not a dependency.

## Build order (no code in this spec)

1. **`Area` type + registry** — `{id, targets[], notch, engagement}`; porn,
   social, games as the first three. Targets keep the local-first / gitignored
   seed split already built for porn.
2. **Adapter resolver** — pure function `(notch, breadth, hostPermBudget) →
   adapter`. Encodes the host-perm rule above.
3. **Lift existing renderers** under the resolver (network-DNR block; DOM overlay
   block; DOM gate delay). No behavior change yet.
4. **Driver: `wind-down`** replaces manual popup trigger for non-`always` areas.
5. **Driver: Zenborg intention** (future) via the seam.

## Non-goals

- Not touching the stamped umbrella.
- Not adding broad host_permissions (would break the privacy guarantee).
- Not building the `wind-down`/Zenborg drivers here — only the seam they plug into.
