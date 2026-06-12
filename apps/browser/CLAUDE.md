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
│   ├── popup/                       # Status only (event count, watchlist size)
│   ├── manage/                      # Watchlist + drogue blocklist + log export
│   ├── block/                       # Drogue block page
│   ├── youtube-sensor.content/      # video_started / video_ended
│   ├── chess-sensor.content/        # game_finished {result}
│   └── linkedin-sensor.content/     # post_seen {promoted}
├── modules/
│   ├── activity/                    # Writer: events.ts (pure) + writer.ts (chrome.*) + log.ts (IndexedDB)
│   ├── sensors/                     # events.ts (pure validation/gate) + send.ts (content-script channel)
│   ├── watchlist/                   # observe-tier mirror (chrome.storage)
│   └── drogues/blocklist/           # Commitment device (seed + user, DNR) — the survivor
```

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

## Adding a sensor

1. Add the key-action kind to `SENSOR_KINDS` (completion grammar: past tense).
2. Create `entrypoints/<domain>-sensor.content/index.ts` — detect the page
   state change, `sendSensorEvent(kind, payload)`. Fail-open; never break the page.
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
