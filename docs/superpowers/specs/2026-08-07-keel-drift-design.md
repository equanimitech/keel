# keel drift: intention versus observation

**Date:** 2026-08-07
**Surface:** keel agent (`keel drift`) + `@keel/domain` (pure derivation)
**Status:** proposed
**Definition:** drift is the **delta between expectation and reality** — what was
meant versus what was observed. This spec measures it; the helm
(`2026-08-06-helm-design.md`) detects a proxy of it.
**Related:** `2026-08-06-helm-design.md` (how heading/tide/helm/gate compose),
`2026-08-07-active-moment-intention-design.md` (the moment that IS the intention),
`packages/domain/docs/event-taxonomy.md` (the writers' contract),
`docs/ideas/2026-07-13-keel-log-query-interface-cli-mcp.md` (the query substrate this answers),
`2026-06-14-keel-jitai-drift-guard-design.md` (parked — defined the *drift lens*, built the intervention half)

---

## Problem

Two records of the same life exist and never meet.

**sail** holds what was intended: moments, each a `(day, phase, areaId)` with a
1–3 word name. **keel** holds what was observed: the activity log, written by four
surfaces. Nothing joins them, so the question the whole instrument exists to
answer — *did the afternoon become what I meant it to be?* — is unanswerable
without an ad-hoc script, which is exactly the complaint logged on 2026-07-13.

## What this is not

No new domain type. **The kairos event is `ActivityEvent`.** The garmin writer
already proved the log accepts a source keel never watched live; supernote will be
the next. A parallel "kairos event" concept would have been a second name for a
thing that exists.

Rejected during design, each for a stated reason:

- **A stored wake collection.** Everything derived from the keel log is
  deterministic — dwell math, `area-map.json`, `cwd` — and a personal log recomputes
  in seconds at any plausible size.
  Storing it makes a cache that goes stale precisely when `area-map.json` changes.
- **Day-note storage.** `dayNotes.json` is four entries of `{date, title}` — what a
  day was *called* — and the gate reads it on every hook. A day carries 40–100+
  spans; putting them there bloats a hot file and conflates the day's name with its
  contents.
- **A bi-temporal fact layer** (`validFrom`/`validTo`/`learnedAt`/`invalidatedAt`/
  `sourceEventIds`, specced in `activity.ts` and never built). Provenance envelopes
  earn their keep when a *claim* can be retracted. Nothing here makes claims —
  recompute and the answer is current by construction. Deferred to wake, which is
  the only instrument that will infer rather than observe.
- **A graph database.** Graphiti needs Neo4j and an LLM because its input is
  unstructured prose and it must guess entities. This input is already structured.
- **Transplanting wake into keel.** See below — wake contributes a writer, not a merge.

## The three instruments

kairos is the OS; each instrument owns one thing and they share one vault.

- **sail** — intentions. Moments, areas, tags. Gives heading. (zenborg, renamed;
  that rename is separate work and this spec keeps saying "sail" for the role.)
- **keel** — observation and friction. The activity log, four writers, the gate.
- **wake** — PKM. Its contribution here is one thing, later: a fifth writer,
  turning Supernote prose into activity events. No merge, no transplant.

Entities are sail's, already: areas cover projects and life domains, and tags cover
places and modes. Both are read from the vault at runtime, never hardcoded. keel
reads them and defines none — which is why this spec adds no entity model.

---

## Design

### 1. Attribution: which area was this?

Per surface, and honest about what each can carry:

- **browser** — domain → area via `~/.keel/area-map.json`. Exists. Longest key wins,
  so `linkedin.com/feed` can sit in a different area than `linkedin.com`.
- **agent** — `cwd` is on every event and maps to nothing today. This spec adds
  `~/.keel/project-map.json`: absolute path prefix → `areaId`, **longest prefix
  wins** (mirroring `areaFor`'s existing rule). This is the highest-value addition
  in the spec — agent sessions are most of the craft time and currently all of it
  is invisible.
- **garmin** — `workout_completed` → the configured fitness area.
  `sleep_recorded` carries **no** area: sleep is a state, not a plot of the garden,
  and there is no Sleep area in sail. It prints on its own line.
- **desktop** — **nothing.** `window_title` is empty in the log, so `iTerm2` cannot
  be resolved to a project. Desktop remains what it already is: the at-the-machine
  gate that keeps unfocused time from accumulating. Guessing here would manufacture
  attribution that isn't in the data.

**`unattributed` is a first-class result**, printed as its own line, never
redistributed across known areas. Hours you can't name are a finding, not a defect.

### 2. Doings: coarse spans, derived not stored

```ts
interface Doing {
  readonly startTs: number;
  readonly endTs: number;
  readonly areaId: AreaId | null;   // null = unattributed
  readonly label: string;           // "youtube.com", "keel", "running"
  readonly surface: ActivitySurface;
  readonly sourceEventIds: readonly string[];
}
```

Per surface, reusing what exists:

- **browser** — `runs` from `bouts.ts`. Already the canonical dwell math: global
  timeline, focus/idle-gated, 30m segment cap, dedup by event id. One run is one
  continuous stretch on one domain, which is what a person recognises as a doing.
- **agent** — one doing per session: `session_start` → `session_end`, or the last
  event bearing that `sessionId` when the session never closed. Label is the
  `cwd` basename.
- **garmin** — the event *is* the span: `ts` + `durationMs`, straight through.
- **desktop** — contributes no doings, only the focus/idle gate that `bouts.ts`
  already consumes.

`sourceEventIds` is carried because it is free at derivation time and it is the
provenance anchor `activity.ts` promised. Nothing consumes it yet.

### 3. Phase bucketing

Phases come from `~/.kairos/phaseConfigs.json`, not from constants:
MORNING 9–13, AFTERNOON 13–20, EVENING 20–3, NIGHT 3–9.

Two edges to get right, both tested:

- **EVENING and NIGHT wrap midnight.** A phase whose `endHour < startHour` spans the
  boundary.
- **A doing can straddle a phase boundary.** It splits, and each phase receives the
  minutes that actually fell inside it. No doing is assigned wholesale to the phase
  it started in.

The waking day rolls at 04:00, consistent with the active-moment spec.

### 4. The diff

For each `(day, phase)`: intended is the moments sitting there, with their areas;
observed is the doings bucketed into it, aggregated per area with attended minutes,
plus unattributed.

**Descriptive only. No score, no adherence percentage, no verdict.** The output puts
the two columns next to each other and stops. An instrument that grades the day
would be the intervention layer arriving through the back door, and interventions
stay P5-gated per the 2026-06-12 decision.

### 5. CLI

```
keel drift                      # today
keel drift --day 2026-08-06
keel drift --week               # the last 7 waking days
keel drift --json               # same data, for skills and future MCP
```

Shape of the human output (areas and labels illustrative — all read from the vault):

```
2026-08-06 · Thursday

  MORNING     intended  <area> · <moment name>
              observed  <area>          1h29m   agent/<repo>
                        <area>            17m   browser/<domain>
                        unattributed      41m

  AFTERNOON   intended  <moment name>
              observed  <area>            32m   garmin/<activity type>
                        unattributed    4h16m

  NIGHT       observed  sleep           7h02m   garmin
```

`--json` is the same derivation, unformatted — the ritual skills (`/sign-off`,
`/week-review`) shell out to it, and it is the shape an MCP tool would wrap if one
is ever wanted.

---

## Where the code lives

- `packages/domain/src/drift.ts` — pure: `Doing`, span derivation per surface, phase
  bucketing with the midnight-wrap and boundary-split rules, the per-phase rollup.
  No I/O, no clock; callers pass events, moments, phase configs, and maps in.
- `packages/domain/src/areas.ts` — gains `areaForPath(map, cwd)`, the longest-prefix
  matcher. Sits next to `areaFor` because it is the same rule over a different key
  space.
- `apps/agent/store.mjs` — loads `project-map.json` and `phaseConfigs.json`;
  `moments.json` reading joins the areas/activeMoment reads already there.
- `apps/agent/keel.mjs` — the `drift` subcommand: read, call the derivation, render.

### The agent-imports-domain seam

The agent surface is plain `// @ts-check` JS with zero dependencies, and
`@keel/domain` ships raw `.ts` with no build step, so "call the domain from
`keel.mjs`" needs one enabling change. It is small, and it was verified against the
real package rather than assumed:

1. **Rewrite domain's relative import specifiers from `./x.js` to `./x.ts`**
   (16 non-test occurrences plus tests). `moduleResolution` is already `"bundler"`,
   which permits them.
2. **Add `allowImportingTsExtensions: true`** to `packages/domain/tsconfig.json` —
   legal because the package is `noEmit`.

Node 24 strips types natively (stable since 23.6), so with those two changes plain
`node` imports `index.ts`, `bouts.ts`, and `tide.ts` directly. Confirmed by running
`runs`, `tide`, `canonicalKind`, and `areaFor` from a bare `.mjs` entry point, and
by a clean `tsc -p` with the flag enabled.

This matters beyond convenience: it is what keeps the dwell methodology in **one**
place. Reimplementing bouts/runs in JS for the agent would fork the exact math the
2026-07-13 note asked to canonize.

**Cost:** the change must not break the two existing consumers — `pnpm --filter
@keel/domain test` (vitest) and the browser's WXT build/typecheck both resolve `.ts`
specifiers, but both are gates on this step.

**Caveat:** the plugin distribution ships the agent standalone, without the
monorepo, so `@keel/domain` is absent there. `keel drift` fails soft with a one-line
"needs the keel repo" message, the same way every other path in `keel.mjs` fails
open. Drift is personal read-side analytics, not a hook — no gate depends on it.

## Testing

Pure functions get real tests; the CLI seam gets one.

- `packages/domain/src/drift.test.ts` (vitest) — a doing straddling 12:59→13:01
  splits across MORNING and AFTERNOON; an EVENING doing at 23:30 and one at 01:30
  land in the same phase; `areaForPath` prefers the longer prefix; an unclosed agent
  session ends at its last event; unattributed time is never redistributed.
- `apps/agent/drift.test.mjs` (node --test) — the subcommand renders a known day
  from fixture events without touching the real vault.

## Garmin backfill

Rides along, since the diff is thin without history. `garmin_sync.py` currently
scans `get_activities(0, limit)` and a 3-day rolling sleep window, so the local log
only reaches back to whenever the poller was first run — while Garmin itself holds
years.

- page activities with `get_activities(start, limit)` in a loop until a page comes
  back empty or predates a floor date;
- walk sleep dates backward across the requested range rather than a 3-day window.

Both are bounded by an explicit `--since` and are safe to re-run: event ids are
`uuid5`-derived, so a double write is dedupable rather than duplicated.

## Build order

Each step leaves the repo green and is independently useful.

1. **The domain seam** — specifier rewrite plus the tsconfig flag. Gated on vitest
   and the browser build still passing. Ships nothing user-visible; unblocks
   everything after it.
2. **`areaForPath` + `project-map.json`** — agent `cwd` becomes attributable. This
   alone makes the log answer "how much of yesterday went to a given project".
3. **`drift.ts`** — doings, phase bucketing, the rollup, with its tests.
4. **`keel drift`** — the subcommand and the rendering, `--day` then `--week` then
   `--json`.
5. **Garmin backfill** — widen the poller, then re-run drift over the deeper range.

## The declared-interval join (unblocked, not yet built)

Phase bucketing is what *history* supports, and it stays the join for everything before
2026-08-07. But `(day, phase)` is a coarse unit: it compares a plan to a four-hour band.

`intention_switched` (shipped alongside this spec) records when the active-moment pointer
changes, which makes a tighter join possible going forward — *what happened while I was
actually holding intention X*, bounded by consecutive switches rather than by clock bands.
That is the only version that can answer whether **declaring** an intention changes what
follows, which is the mechanism the rest of the stack assumes and has never tested.

It is deliberately not built here: the events have to accrue first. Drift reads phases
today and gains the declared-interval view once there is enough history to read.

One consequence worth protecting: injecting moment- or attitude-derived context into
sessions would give declaring a *second* effect, on the agent as well as the person, and
the two could not be separated afterwards. If that lands before a baseline exists, the
injection must be recorded in the event so it can be controlled for.

## Deferred, and the trigger for each

- **Supernote as the fifth oracle** — wake extracts prose into activity events.
  When the drift view is worth reading and the gap in it is the off-screen life.
- **The bi-temporal fact layer** — when wake starts making claims it must retract.
  Not before: everything here recomputes.
- **Desktop attribution** — if `window_title` capture is ever enabled and consented.
- **Interventions off drift** — P5-gated. This spec measures the lens the parked
  2026-06-14 spec wanted to act on; acting stays out of scope.
- **An MCP tool** — `--json` is the seam. Add the wrapper when an agent needs it
  without a shell.

## The name

`drift` reads as slightly negative for something deliberately non-judgmental — but
drift *is* the delta between expectation and reality, and this report is the
measurement of that delta. The corpus already pointed at it (2026-06-14: "being
pulled off the cycle's heading"). It is kept.

The helm uses the same word in a different register: its `drifting` verdict is the
**detector** — weedy dwell past a floor is the operational proxy that the delta is
widening, not the delta itself. The report measures; the helm reacts. Revisit the
name only if the rendered output feels like it is grading the day.
