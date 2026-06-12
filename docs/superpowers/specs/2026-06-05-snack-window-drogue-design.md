# Snack-Window Drogue — design

> 2026-06-05. Reproduce keel-gate's time-driven lockdown on the web, inverted into a
> scheduled-allowance ("snack window") block on compulsion targets. Hardcoded v0;
> shaped to refactor into a shared driver→notch engine later.

## Problem

keel-gate (Claude Code hook) is a success: past a hard-stop it **denies** coding tools
until a reset hour, time-driven via `driver → friction → notch`. We want the same teeth
on the web — a hard lockdown on the operator's compulsion targets (YouTube, chess) — but
**inverted**: rather than blocking a sleep window, block *by default, all day*, and open
only during short scheduled windows. Intermittent-fasting for compulsion. The default
state is blocked; a "snack window" lifts it.

## Model

```
blocked(now) = NOT inAnyWindow(now, ALLOWED_WINDOWS)
```

- Default (every other minute): **blocked**, full lockdown, no UI escape.
- During an allowed window: block lifts; the targets load normally.
- Changing the config is deliberate, effortful (edit code + rebuild) — the same
  compassionate friction as removing a seed porn domain. Sovereignty preserved by cost,
  not by a one-click toggle.

### Config (hardcoded v0)

```ts
COMPULSION_DOMAINS = ["youtube.com", "chess.com"]   // DNR matches subdomains
ALLOWED_WINDOWS    = [
  { start: "12:30", end: "13:00" },   // lunch
  { start: "19:00", end: "20:00" },   // evening
]                                      // local time; windows do not wrap midnight
```

## Mechanism

A **second** DNR dynamic rule, `id: 2`, independent from the porn Drogue's `id: 1` so the
two never interfere. Plain `block` action, all resource types (main_frame + sub_frame +
rest), identical shape to `blocklist/sync.ts`. Page never loads → generic browser block
page (accepted — no branded page in v0).

- **Blocked** → rule 2 present (`requestDomains: COMPULSION_DOMAINS`).
- **In a window** → rule 2 removed.

Reconciliation is idempotent: `updateDynamicRules({ removeRuleIds: [2], addRules: maybe })`.

## Scheduling

DNR dynamic rules persist while the MV3 service worker sleeps, but flipping at a window
edge needs a reliable wake. A `chrome.alarms` periodic alarm (1-minute period) calls
`reconcileCompulsionBlock()`; this self-heals **both** edges, so a short window cannot leak
past its close while the SW is asleep. Reconcile also runs on `SessionStart`/SW startup.

`alarms` is the only new permission. It carries **no data access** — it cannot read URLs,
requests, or page bodies — so keel's "cannot see your browsing" posture is intact. Note it
in the manifest privacy comment.

## Files

| File | Change |
|---|---|
| `modules/drogues/schedule/compulsion.ts` | **new** — hardcoded config + pure `inWindow`/`inAnyWindow`/`compulsionBlocked(now)`. |
| `modules/drogues/schedule/sync.ts` | **new** — `reconcileCompulsionBlock()` projecting the predicate onto DNR rule `id: 2`. Mirrors `blocklist/sync.ts` (own rule id, own resource-type list, errors logged not swallowed). |
| `entrypoints/background.ts` | **edit** — `void reconcileCompulsionBlock()` on startup; `chrome.alarms.create` 1-min periodic + `onAlarm` → reconcile. |
| `wxt.config.ts` | **edit** — add `"alarms"` to `permissions`; extend the privacy comment. |

## Refactor seam

`compulsionBlocked(now)` is the single predicate. The deferred features attach here without
rewrites:

- **Big red button** (multi-day commitment driver) → `blocked = compulsionBlocked(now) || commitmentActive(now)`.
- **Standardized notch scale** (`hide < dim < delay < blur < block`) → the rule's action
  becomes the notch; `block` is today's instance.
- **Areas of compulsion / zenborg** → `COMPULSION_DOMAINS` becomes a named area's target
  list, sourced from config/zenborg instead of hardcoded.

The hardcode is a thin instance of the keel-gate model, not a dead end.

## Out of scope (v0)

Red button, softer notches (delay/dim ramp), zenborg sourcing, popup status UI, skip
credits. Captured as separate idea docs.

## Acceptance

- Outside both windows, navigating to `youtube.com` or `chess.com` (and subdomains) is
  blocked; the page does not load.
- Inside a window, both load normally.
- The block flips correctly across a window edge within ~1 minute, including after the
  service worker has slept.
- The porn Drogue (rule 1) is unaffected in every state.
- No `host_permissions`; only `alarms` added beyond the existing permission set.
