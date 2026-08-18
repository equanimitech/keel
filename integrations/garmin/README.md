# @keel/garmin — body state, polled

An activity-log writer that transcribes what Garmin Connect already measured
into `~/.keel/log/YYYY-MM-DD.garmin.jsonl`. See `../README.md` for what makes
this an integration rather than an app, and what the read side may and may not
conclude from its events.

Polling, not push: Garmin has no local sync event, and push (the official Health
API) needs partner approval and a public HTTPS endpoint, a server keel does not
want.

## Kinds

| Kind | `ts` | `durationMs` |
|---|---|---|
| `workout_completed` | activity start | elapsed |
| `sleep_recorded` | sleep end | time asleep |
| `body_sampled` | end of the hour | 1h (rollup) |
| `body_battery_changed` | period start | the period |
| `readiness_recorded` | the reading | — |
| `day_summarized` | end of local day | — |

`body_sampled` is the one that matters: 5-minute bins of stress and body
battery, one rollup per complete hour (~24/day, against the desktop surface's
~2,900). Everything else Garmin offers is daily, and every read-side derivation
(`bouts.ts`, `tide.ts`) is intraday, so before this existed the taxonomy's claim
that body state is the covariate axis had nothing at matching resolution to join
against.

A stillness activity (yoga, meditation, breathwork) gets stress and
body-battery deltas instead of distance and calories, which say nothing about a
sit. It reads the series already fetched, so it costs no extra call.

Bin semantics, the completeness rule, and the full list of what is deliberately
**not** synced (badges and challenges, the athletic performance stack, nutrition
and weigh-ins, splits and FIT files) are specified in
`packages/domain/docs/event-taxonomy.md`.

## Cost and privacy

Steady state is roughly four Garmin calls an hour: today's series, body-battery
periods and readiness are re-polled while the day is still open; a past day is
fetched once and then marked done in the cursor.

Payloads carry type and numbers only. Garmin bakes place names into
`activityName` (e.g. "&lt;suburb&gt; Soccer/Football"); that field,
`locationName`, lat/lon, and every free-text feedback phrase attached to
readiness and body-battery events are dropped at the writer.

Raw Garmin readers stay blocked for agents by `kairos/hooks/protect-kairos.sh`.
This writer is how that data reaches keel; the read side is how it is queried.

## Run

Auth reuses the garth tokens already cached in `~/.garminconnect`; no
credentials live in the repo. Deps are declared inline (PEP 723), so `uv`
resolves them per-run, nothing to install.

```bash
cd integrations/garmin
./garmin_sync.py --dry-run       # print events, write nothing
./garmin_sync.py                 # incremental, since ~/.keel/garmin.cursor
./garmin_sync.py --backfill 30   # widen the window on first run

# hourly, via launchd — set the repo path in the plist first
sed -e "s|REPLACE_WITH_REPO_PATH|$(git rev-parse --show-toplevel)|g" \
    -e "s|REPLACE_WITH_HOME|$HOME|g" \
    com.equanimitech.keel.garmin.plist > ~/Library/LaunchAgents/com.equanimitech.keel.garmin.plist
launchctl load ~/Library/LaunchAgents/com.equanimitech.keel.garmin.plist
```

## Dev

```bash
pnpm --filter @keel/garmin test   # or: python3 -m unittest
```

Fixtures are synthetic. Field names mirror garminconnect; every value is
invented. This repo is public, and the fields these tests exercise (place names,
coordinates, sleep architecture, HRV) are exactly the ones the writer exists to
strip, so a fixture that leaked them would defeat the tests written under it.
