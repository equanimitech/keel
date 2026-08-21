# keel Browser - Development Guide

**A Chrome extension (WXT) that observes — activity writer + per-domain sensors + the blocklist drogue.**

Part of the [keel monorepo](../../CLAUDE.md). Run from root with `pnpm dev:browser` or locally with `pnpm dev`.

The shield/signal/budget intervention layer was retired on 2026-06-12
(`docs/decisions/2026-06-12-retire-the-intervention-layer-….md`). Interventions
returned on **2026-08-05** as the friction interpreter, built on `RuleSpec`
(`docs/primitive-contracts.md`) and the accumulated baselines — not as the old
shield layer.

**The invariant, enforced in `@keel/domain` types, not at runtime:** a tide
(ambient observation) may arm a `gate`; it may never arm a `cooldown`.
`AmbientRule.primitives` is `Exclude<PrimitiveSpec, CooldownSpec>`, so an
imposed lock cannot be constructed. Locks are self-invoked only.

**That restriction is reversed on the armed path, 2026-08-21.** A rule may arm
any primitive, teeth included, because a system that can only ever post a notice
has no consequence. What protects the person moved from authorship to exit:
**invariant 6 — every armed thing can be got out of** — and it is the whole of
the guarantee. `modules/interventions/armed.ts` refuses any pushed entry with no
reachable exit, and the popup renders the exit of everything in force. The
`AmbientRule` type above still encodes the old restriction; it retires with
`packages/domain`.

---

## Architecture

```
apps/browser/
├── entrypoints/
│   ├── background.ts                # SW — activity writer + DNR sync + cooldown lapse alarm
│   ├── popup/                       # Status (event count, watchlist size) + cooldown button
│   ├── manage/                      # Watchlist + drogue blocklist + log export
│   ├── block/                       # Drogue block page
│   └── sensor.content/              # ONE generic sensor, all pages, arm-gated
├── modules/
│   ├── activity/                    # Writer: events.ts (pure) + writer.ts (chrome.*) + log.ts (IndexedDB)
│   ├── sensors/
│   │   ├── events.ts                # Pure: kind allowlist, payload caps, observe gate, arm query
│   │   ├── senses/                  # TYPE-based detection: video.ts, feed.ts, shopping.ts, game.ts
│   │   ├── adapters.ts              # Site-specific probes as DATA — the only place a domain may appear
│   │   └── send.ts                  # Content-script channel
│   ├── watchlist/                   # observe-tier mirror (chrome.storage)
│   ├── interventions/               # the ARMED CACHE — armed.ts (pure) + store.ts + events.ts
│   ├── friction/
│   │   ├── cooldown/                # state.ts (pure) + store.ts (chrome) + arm.ts (the one gesture)
│   │   ├── gate/                    # dwell gate: state.ts + decide.ts (pure) + overlay.ts + arm.ts
│   │   ├── policy/                  # store.ts — the friction policy, areas read from ~/.kairos
│   │   └── areas/                   # scope.ts + days.ts — which areas a rule applies to, when
│   └── drogues/blocklist/           # Commitment device (seed + user, DNR) — the survivor
```

`friction/cooldown/state.ts` holds the behavioural rule: **arming is
write-forward-only.** Re-arming may push the stamp out, never pull it in, and
there is deliberately no `disarm` — the unlock path is `wait`. Adding a lift
would restore the symmetry the design exists to remove. Every surface that
offers the lock (popup, keyboard, later the tray) arms through `arm.ts`, so
that rule has exactly one place to be got wrong.

Sensors are **type-based, never company-based**: the generic senses (video =
`<video>` playback, feed = article/listitem impressions + the industry
sponsored-disclosure labels, shopping = schema.org Product microdata or the
universal commerce card shape — image + link + price inside a bounded region)
self-select by what an observed page exhibits, on ANY watchlist domain. Site adapters exist only where a key action has no
generic DOM shape (a finished game) and live in `adapters.ts` as data. The
sensor content script runs on all pages but does NOTHING (no observers) unless
the background's arm handshake confirms the domain is on the observe tier.

Event vocabulary and grammar: `packages/domain/docs/event-taxonomy.md`. The
writer emits coarse events for every domain (tab switches, navigations,
focus/idle spans); sensors add key-action completions only for domains on the
watchlist's observe tier.

## The armed cache (`modules/interventions/`)

**The app decides what is armed; the extension decides when it fires.** The
record is pushed over native messaging (`request_armed` → `armed`) and held in
`chrome.storage.local`; every actuation reads that cache and nothing else, so a
navigation never waits on a round trip and a dead host never lifts a shield.
`kairos/kernel/substrate.md` is the contract: this surface has no filesystem
access and never will, so it takes a **pusher rather than a loader**.

Three rules hold it together, and each exists because its opposite has a failure
mode worth naming:

1. **Malformed means keep what you have; empty means lift.** `parseArmed`
   returns `null` for a push that is not a record collection, so an older host
   or a garbled frame cannot read as "nothing is armed". An explicitly empty
   record IS honoured, because taking a fence down has to land or the person is
   trapped by a mirror nobody can edit.
2. **Invariant 6 is enforced at the door.** An entry with no reachable exit is
   refused and logged as an error, never armed. A block with no visible exit is
   a bug, not a stricter shield — and the host deliberately invents no exit, so
   the omission surfaces instead of being papered over.
3. **Interventions are log events, not a second collection.** A delivery writes
   `intervention_shown`; its settlement writes `intervention_dismissed` or
   `intervention_clicked_through`. All three are completions in `logs`.
   `intervention_effective` is the read side's verdict and this surface never
   writes it.

`ARMED_RULE_ID = 3` in `drogues/blocklist/sync.ts` is the DNR projection of
browser-enforced standing cooldowns. It has its own rule id because the two
mirrors refresh on different schedules; it collapses into `BLOCK_RULE_ID` at
migration step 5, when `~/.kairos/keel/rules/*.json` stops being a second
declared-rule store.

## The hostile-page boundary

Sensor content scripts are untrusted. The background:
- accepts only allowlisted kinds (`modules/sensors/events.ts` SENSOR_KINDS),
- accepts a delivery settlement only through `isSettlement` — the page names the
  rule and the choice, and nothing else; the domain still comes from the
  browser-attested sender tab,
- reduces payloads to capped scalars,
- derives `domain` from the browser-attested `sender.tab.url` — never the message,
- writes nothing unless `sensorAllowed(domain, observe)`.

## Adding a sense (type) or adapter (site)

1. New media type (e.g. "audio"): add the key-action kind to `SENSOR_KINDS`
   (completion grammar: past tense), write `modules/sensors/senses/<type>.ts`
   generically, arm it from `entrypoints/sensor.content/`.
2. New site whose key action defeats generic detection: add a `SiteAdapter`
   entry to `adapters.ts` — data only, no new entrypoints, no new code paths.
3. Domains opt in via the watchlist (manage page) — sensors never self-enable.

## Privacy posture (load-bearing)

- Payloads carry **domains only** — never full URLs, never page titles.
- Counts and timings, never content.
- Everything stays in extension-local IndexedDB until the manual JSONL export.

## Commands

```bash
pnpm dev          # WXT dev server (run from apps/browser)
pnpm build        # production build
pnpm test         # vitest (pure modules)
pnpm typecheck    # tsc --noEmit
```

- Never run the dev server. The user runs it manually.
