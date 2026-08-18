# keel event taxonomy — the writers' contract

One grammar for every `ActivityEvent.kind`, across all surfaces. Kinds stay an
**open set** (they accrete per surface; never a central enum), but every kind
conforms to one of three patterns. Stamped basis:
`docs/decisions/2026-06-12-keel-productization.md` (surfaces),
`docs/decisions/2026-06-12-retire-the-intervention-layer-….md` (observe vs act),
`docs/references/2026-06-12-attention-observability-literature.md` (constructs).

## The grammar

| Pattern | Shape | Examples | Academic anchor |
|---|---|---|---|
| **Span** | `<state>_start` / `<state>_end`; `durationMs` on the end event when the start was observed | `idle_start`/`idle_end`, `focus_start`/`focus_end`, `session_start`/`session_end`, `video_paused`/`video_resumed` (brackets the paused interval; lets active-watch time exclude pauses) | AFK bracketing (ActivityWatch); interval substrate for resumption lag (Iqbal & Bailey 2006) |
| **Switch** | `<thing>_switched` / `<thing>_activated`; payload carries the *new* target; `durationMs` may close the previous span | `app_switched`, `tab_activated` | Switch events — fragmentation metrics (Mark CHI 2014); coarse breakpoints (Adamczyk & Bailey 2004) |
| **Completion** | past-tense action end | `navigation_committed`, `tool_completed`, `video_ended`, `post_seen`, `product_seen`, `tab_closed` (a dismissal) | Action completions = breakpoint candidates ("never clock-based", OASIS) |

Rules:

- `durationMs` appears **only** when the event closes an interval whose start
  this writer observed. A span end with an unobserved start (process restart,
  pause) is emitted **without** `durationMs` — the boundary is still real.
- Spans never survive a writer pause/sleep: drop span state, never fabricate.
- Payloads carry **domains, never full URLs**; window titles capped (256 chars);
  counts and timings, never content. `logDetail` dials extra depth per user.

## Per-surface vocabularies (live)

- **agent** (`apps/agent`): `session_start`, `session_end`, `prompt`,
  `tool_dispatched`, `tool_completed`, `tool_failed`, `turn_stop`,
  `subagent_stop`, `notification`, `pre_compact`, `permission_request`,
  `config_change`, `file_changed`, `rule_changed`, `intention_switched`.

  `intention_switched` is the odd one: keel does not author it. zenborg owns
  `activeMoment.json` and keel only ever reads it, so this is an *observed* switch
  — emitted when a hook notices the pointer differs from the last one seen. `ts` is
  therefore the observation, while `keel_declared_at` carries the pointer's own `at`,
  the true instant of declaration. The edge is taken on the raw pointer id rather
  than the resolved moment, because a pointer stops resolving by itself at the 04:00
  roll and that is not a switch. Detection is eventual by design: a change made away
  from the machine is recorded whenever the next hook fires, with its real time
  intact.

  **Actor — the agent stream carries two.** This surface is the only one whose
  events are not all authored by the human, and conflating them produces
  confident nonsense (see `read-side-pitfalls.md`, case 1).

  | Actor | Kinds | Reads as |
  |---|---|---|
  | **human** | `prompt`, `permission_request` (the answer), `config_change`, `rule_changed`, `intention_switched` | intent, effort, engagement |
  | **agent** | `tool_dispatched`, `tool_completed`, `tool_failed`, `subagent_stop`, `pre_compact`, `notification` | machine throughput — governed by model autonomy and harness version, NOT by human exertion |
  | **joint** | `session_start`, `session_end`, `turn_stop`, `file_changed` | a boundary both participate in |

  One human `prompt` can emit 80+ `tool_dispatched`. So agent-actor counts are
  **not** a workload proxy for the human, and their baseline shifts whenever the
  model or harness changes — a non-stationarity no other surface has. Any
  derivation about *the person* must be built from human-actor kinds.
- **desktop** (`apps/tray` — the body; the surface is keel desktop):
  `writer_started` (writer epoch, payload `appVersion`),
  `writer_paused`/`writer_resumed` (menubar pause toggle),
  `app_switched` (payload `app_name`, `window_title`, `is_full_screen`;
  `durationMs` = previous app's focus span), `idle_start` (payload
  `thresholdMs`, ts backdated to last input), `idle_end` (+`durationMs`),
  and — opt-in via `desktop.inputActivity` (default off) —
  `input_activity` (one 30s rollup carrying per-3s-bin counts:
  `keyDowns`/`mouseDowns`/`scrolls`/`mouseMoves`; counts only, never
  keycodes or content; fully-idle windows are skipped, ≤2.9k events/day).
- **browser** (`apps/browser`): `writer_started`, `tab_opened` (payload `tab`,
  plus `domain` when the new tab already has a web URL; the open bracket of a
  tab's lifecycle — pairs with `tab_closed` and makes tab concurrency, e.g.
  "how many video tabs open at once", computable), `tab_activated` (payload
  `domain`), `tab_closed` (payload `domain`; a dismissal that also brackets a
  background tab no focus span saw), `navigation_committed` (payload
  `domain`), `focus_start`/`focus_end` (browser holds OS focus),
  `idle_start`/`idle_end` (chrome.idle; locked counts as idle), `log_pruned`,
  `cooldown_armed` (payload `source`: popup | keyboard | tray, `durationMs`,
  `domainCount` — every arming is recorded, because the arm-rate against
  watched-dwell is what shows whether the lock has become a coping ritual),
  `panic_pressed` (**retired 2026-08-05** — the popup button now arms a real
  cooldown rather than only labelling the moment; kept here because historical
  logs carry it), and — observe tier only — the sensor
  completions `video_started`, `video_ended`, `post_seen`, `game_finished`,
  `product_seen` (payload `tier`: microdata | layout — which generic
  detection recognised the card; one event per product card that held ≥50%
  visibility past a ~0.7s settle window, deduped per card and capped at 120
  per page so an infinite-scroll grid cannot flood the log; never a product
  name, price, image, or URL), plus the debounced watch-span pair
  `video_paused`/`video_resumed` (settles past ~2.5s so ad breaks and scrubs
  do not register).

- **garmin** (`apps/agent/garmin_sync.py`): `workout_completed` (ts = activity
  start, `durationMs` = elapsed; payload `activityType`, `manual`, and whichever
  of `distanceM`/`calories`/`avgHrBpm`/`maxHrBpm`/`steps`/`movingDurationS`/
  `aerobicTrainingEffect` Garmin reported — absent metrics are omitted, never
  nulled), `sleep_recorded` (ts = sleep **end** — the completion; `durationMs` =
  time asleep; payload `calendarDate`, stage seconds, `sleepScore`,
  `avgSleepStress`, `avgHrBpm`, `avgRespiration`).

  A **polling** writer, not an observing one: Garmin has no local sync event and
  no push for unofficial clients. Three consequences the read side must respect.
  (1) `durationMs` here is *transcribed* from a source that measured both
  boundaries, not observed live; the taxonomy's ban is on fabricating a duration,
  not on transcribing one. (2) Events arrive **late and out of order** relative
  to wall clock — a workout lands in its own day's file up to an hour after the
  fact, so a same-day read may be incomplete. (3) A night the watch missed
  produces **no event at all** — never read the absence of `sleep_recorded` as
  "did not sleep".

  Payloads carry type and numbers only. Garmin bakes place names into
  `activityName` (e.g. "&lt;suburb&gt; Soccer/Football"); that field, plus
  `locationName` and `startLatitude`/`startLongitude`, are dropped at the writer.

  Since 2026-08-18 the surface also carries four body-state kinds, added because
  the daily two could not support the join this section claims:

  - `body_sampled` — a **rollup**, one per complete local hour. `ts` = hour end,
    `durationMs` = the hour, payload `calendarDate`, `hour`, `binMinutes` (5),
    and the arrays `stress` / `bodyBattery` of `60 / binMinutes` entries. Same
    device as desktop's `input_activity`: a dense series enters the log as a few
    rollups, never one event per sample. **A bin with no reading is `null`, not
    absent** — position carries the time offset, so dropping empties would shift
    every later bin. An hour with no reading at all emits nothing. Garmin's
    stress sentinels (`-1` no reading, `-2` inside an activity) mean *unknown*
    and are dropped rather than read as calm.
  - `body_battery_changed` — Garmin's own segmentation of the body-battery curve
    into charge/drain periods. `ts` = period start, `durationMs` = the period,
    payload `eventType`, `bodyBatteryImpact`.
  - `readiness_recorded` — the morning reading joined with that night's HRV
    summary. Payload carries `score`, `level`, the factor percentages,
    `sleepScore`, `acuteLoad`, and `hrvLastNightMs` / `hrvWeeklyMs` /
    `hrvStatus` / the balanced baseline. Both are kept on purpose: readiness is
    Garmin's opaque composite, HRV status is the measure with a literature
    behind it, and the 21-day baseline question needs the latter to stand alone.
  - `day_summarized` — one per complete local day, `ts` = the day's last
    instant. Payload is the daily scalars: `steps`, `sedentaryS`,
    `highlyActiveS`, `restingHrBpm`, `avgStress`, body-battery charge/drain.
    `sedentaryS` is the reason it exists: Garmin measuring, independently, the
    same sitting the desktop surface measures.

  `body_sampled` and `day_summarized` are emitted **only once their interval is
  over**. A partial hour would be rewritten by the next poll with different
  numbers under the same deterministic id, which is the exact ambiguity the id
  exists to prevent.

  A stillness activity (`yoga`, `meditation`, `breathwork`, …) gets a
  `workout_completed` enriched with `stressBefore` / `stressAfter` /
  `stressDelta` / `bodyBatteryDelta` instead of the exertion metrics, which say
  nothing about a sit. Read from the series already fetched, so it costs no
  extra call.

  Deliberately **not** synced: badges, challenges and leaderboards (Garmin's
  engagement surface, which is what keel exists to counter); the athletic
  performance stack (VO2max, race predictions, FTP, power curves); nutrition,
  hydration and weigh-ins; splits, FIT files and activity weather. Recorded here
  as decisions, not oversights.

  Body state is the **covariate axis**, not the attention axis. Its value is the
  join — bouts and wait gaps against sleep debt — not standalone. Before
  2026-08-18 that join was not actually available: every Garmin kind was daily
  while every read-side derivation (`bouts.ts`, `tide.ts`) is intraday, so there
  was nothing at matching resolution to join against. `body_sampled` is what
  makes the claim true.

The per-area key-action metric each sensor exists to produce: minutes watched
(video), posts seen (feed), games played (game), **products seen** (shopping).
These supersede raw dwell time — dwell says an hour passed, `product_seen`
says how much shopping happened in it.

Architecture note (OASIS mapping): the desktop observer emits the global
*switch stream* (application-independent layer); each per-app surface
(browser, agent) emits its own *spans + completions* (per-application
plug-ins). Sensors added later follow the same split.

## "Session" semantics — per surface, by design

| Surface | `sessionId` | Meaning |
|---|---|---|
| agent | Claude session id | Real, tool-imposed session. `session_start`/`session_end` are span events. |
| browser | uuid per service-worker lifetime | **Writer epoch** — mechanical provenance only. `writer_started` marks it. Never analyze as a behavioral session. |
| desktop | `""` | Sessionless. |

The behavioral unit is the read-side **bout** (web-analytics "visit"):
derived by inactivity timeout over the merged log. Writers never claim bouts.

## Read-side constants (slice E inherits these — do not reinvent)

- Feature cadence: **3 s bins**, **30 s rolling windows** (OASIS).
- Breakpoint/label alignment tolerance: **±10 s**.
- Personal baselines: **z-scores over rolling windows** — never absolute
  thresholds (none are validated; Mishra 2021: personalization wins after
  ~21 days of data).
- Attention/cost states: **≤ 3 classes**, ever (Fogarty 2005 ceiling). No
  derived fact may claim more.
- Named derivations: **wait gap** (long `tool_dispatched` → next user input;
  keel's novel construct), **resumption lag** (interruption end → first
  action in resumed task), **switch rate / fragmentation** (per-window switch
  counts vs own baseline).
- Derived facts carry the bi-temporal envelope
  `{ validFrom, validTo?, learnedAt, invalidatedAt?, sourceEventIds }` —
  superseded facts are invalidated, never deleted.

## Reserved kinds (named now, emitted later)

- ESM channel: `probe_shown`, `probe_answered` (~2/h max, one 5-point item).
- Intervention outcomes (P5): `intervention_shown`, `intervention_dismissed`,
  `intervention_clicked_through`, `intervention_effective`.

## Legacy alias map (read-side; raw files are never rewritten)

| Pre-2026-06-12 kind | Canonical |
|---|---|
| `browser_idle` | `idle_start` |
| `browser_active` | `idle_end` |
| `window_focus` | `focus_start` |
| `window_blur` | `focus_end` |
| `browser_session_start` | `writer_started` |
| `logger_started` | `writer_started` |
| `logger_paused` / `logger_resumed` | `writer_paused` / `writer_resumed` |
| `app_focus` | `app_switched` |

In code: `canonicalKind()` / `LEGACY_KIND_ALIASES` in `src/activity.ts`.
