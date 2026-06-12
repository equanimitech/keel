# keel Browser - Development Guide

**A Chrome extension (WXT) that observes — activity writer + per-domain sensors + the blocklist drogue.**

Part of the [keel monorepo](../../CLAUDE.md). Run from root with `pnpm dev:browser` or locally with `pnpm dev`.

The shield/signal/budget intervention layer was retired on 2026-06-12
(`docs/decisions/2026-06-12-retire-the-intervention-layer-….md`). This surface
is pure observability until interventions return as a separate module (P5),
measured against the baselines this writer accumulates.

---

## Architecture

```
apps/browser/
├── entrypoints/
│   ├── background.ts                # SW — activity writer + drogue DNR sync
│   ├── popup/                       # Status (event count, watchlist size) + panic button
│   ├── manage/                      # Watchlist + drogue blocklist + log export
│   ├── block/                       # Drogue block page
│   └── sensor.content/              # ONE generic sensor, all pages, arm-gated
├── modules/
│   ├── activity/                    # Writer: events.ts (pure) + writer.ts (chrome.*) + log.ts (IndexedDB)
│   ├── sensors/
│   │   ├── events.ts                # Pure: kind allowlist, payload caps, observe gate, arm query
│   │   ├── senses/                  # TYPE-based detection: video.ts, feed.ts, game.ts
│   │   ├── adapters.ts              # Site-specific probes as DATA — the only place a domain may appear
│   │   └── send.ts                  # Content-script channel
│   ├── watchlist/                   # observe-tier mirror (chrome.storage)
│   └── drogues/blocklist/           # Commitment device (seed + user, DNR) — the survivor
```

Sensors are **type-based, never company-based**: the generic senses (video =
`<video>` playback, feed = article/listitem impressions + the industry
sponsored-disclosure labels) self-select by what an observed page exhibits, on
ANY watchlist domain. Site adapters exist only where a key action has no
generic DOM shape (a finished game) and live in `adapters.ts` as data. The
sensor content script runs on all pages but does NOTHING (no observers) unless
the background's arm handshake confirms the domain is on the observe tier.

Event vocabulary and grammar: `packages/domain/docs/event-taxonomy.md`. The
writer emits coarse events for every domain (tab switches, navigations,
focus/idle spans); sensors add key-action completions only for domains on the
watchlist's observe tier.

## The hostile-page boundary

Sensor content scripts are untrusted. The background:
- accepts only allowlisted kinds (`modules/sensors/events.ts` SENSOR_KINDS),
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
