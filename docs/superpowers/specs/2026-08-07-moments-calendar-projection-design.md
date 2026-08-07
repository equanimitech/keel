# Projecting kairos moments onto a calendar

**Status:** design approved 2026-08-07. Phase 1 specified in full; later phases sketched.

## Problem

Moments live in the kairos vault and are visible only where zenborg runs. They
should be readable beside real commitments — on a phone, away from the laptop.

A calendar is a hostile target for this. It is a grid of clock intervals, and a
moment is an intention with a day and a phase and deliberately no clock. The
whole design problem is refusing to fabricate the missing precision.

## What the vault actually asserts

Three fields carry a moment's position in time:

- `day` — the date it sits on
- `phase` — `MORNING` / `AFTERNOON` / `EVENING` / `NIGHT`, bands defined in `phaseConfigs.json`
- `order` — its rank within that phase

Since 2026-08-07 two optional fields carry real clock time:

- `Moment.startTime` — `"HH:MM"`
- `Moment.durationMin`

These are inherited from `Habit.schedule` (`{ weekdays, startTime, durationMin }`)
at allocation time and are overridable per instance. Most habits are ambient and
carry no schedule; that is the intended steady state, not a gap to be filled.

There is no status field. Zenborg is not a task manager: no checklists, no
"done". Nothing in the vault records that a moment started or finished.

## The rule

**A moment renders as a timed event if and only if it carries a `startTime`.**

| Moment | Rendering |
|---|---|
| `startTime` + `durationMin` | Timed event over exactly that interval |
| `startTime`, no `durationMin` | Timed event, 60 minutes |
| Neither | All-day row |

An all-day row is titled with the moment's emoji and name; its notes carry
`<Phase> · <Area>`. Phase does not appear in the title — at the density a day
actually holds, the ordering it would buy is not worth the noise. Revisit if
all-day rows ever crowd the banner.

The 60-minute default is the only invented number in the system. It fires only
when someone hand-sets a `startTime` override without a duration, which the
habit-schedule path never produces.

### Rejected: dividing the phase band

The first implementation split each phase band evenly among its moments, so a
7-hour afternoon holding two moments produced two 3.5-hour blocks. This was
wrong in a way worth recording, because it is the obvious thing to reach for.

It fabricates two numbers the vault never asserts — a start and a duration —
and renders them identically to real ones. A reader cannot tell which times
were chosen and which were computed by division. Worse, it makes every
afternoon read as fully booked, which inverts the meaning of an ambient
moment: an intention becomes an appointment.

All-day rows assert less and are therefore more truthful.

### Rejected: back-filling from `Habit.schedule`

The projection reads moments only, never `habits.json`. Moments inherit timing
at allocation, so the moment is the single source of truth and cannot drift
from it.

The cost is that moments allocated *before* a schedule was added to their habit
keep no timing and stay ambient until reallocated. This is accepted. Re-deriving
would mean the calendar disagreeing with the vault about what a moment is, which
is a worse failure than a stale row.

## Write model

- **Target:** a calendar named `zenborg`, matched by name. It may live under
  iCloud or Google — CalDAV makes this transparent, and the projection does not
  care. The calendar must be created once by hand; the projection never creates
  it, and exits with an explicit error when it is absent.
- **Window:** 14 days back, 60 days forward.
- **Full replace** inside the window on every write. A moment deleted in zenborg
  disappears with no bookkeeping, and no UID reconciliation is needed.
- **Cadence:** every 5 minutes. The projection is hashed; when it is unchanged
  the run is a no-op, so iCloud and the phone see churn only when the garden
  actually moves.
- **Direction:** strictly one-way. The vault is never written. An edit made in
  the calendar is discarded at the next sync — the calendar is a view, not an
  input surface.

### Why not a subscribed `.ics`

An `.ics` served over HTTP and subscribed to is the more natural read-only
shape, and it was built first. It fails on reach: Calendar.app refuses the
`file://` scheme, and a loopback URL cannot be fetched by iCloud or Google,
whose servers do the fetching. Serving it publicly would mean hosting personal
moment names outside the user's own accounts.

Writing events locally keeps the data inside an account the user already trusts
with their calendar, and survives the laptop being off — events already synced
stay on the phone.

## Lifecycle — the direction, not this phase

A moment moves along a time axis:

```
ambient ──> planned ──> started ──> happened
```

- **ambient** — a day and a phase. All-day row.
- **planned** — carries a `startTime`. Timed event. *Phase 1 ends here.*
- **started** — the moment is being lived right now.
- **happened** — the interval it actually occupied.

The last two cannot come from zenborg, which asserts intention and records no
outcome. They come from keel, which observes: `activeMoment.json` is an explicit
"I am on this now" signal, and `~/.keel/log/*.jsonl` carries real timestamped
activity.

This is the seam worth protecting: **zenborg holds intention, keel holds
observation, and the calendar is where they meet.** Phase 1 renders intention
only. Nothing in it should make the observed layer harder to add — which is why
the projection is a pure function of the vault with a full-replace write, so a
second contributing source can be added without reconciliation logic.

Deferred deliberately, in rough order of appeal:

1. **Started/happened from `activeMoment`** — requires logging pointer
   transitions; the pointer alone has no history.
2. **Closing intervals from the keel log** — most faithful to what happened,
   most machinery.
3. **Tentative placement into free gaps** — packing ambient moments into open
   time by duration. Needs durations on ambient habits, which do not exist, and
   a stability rule so blocks do not jitter every 5 minutes. This is the feature
   that turns the calendar from a mirror into a planner, and it should not be
   built until the mirror has been lived with.

## Failure handling

- **No `zenborg` calendar** — exit with instructions naming the account
  requirement. Never create the calendar; the account it lands in matters and
  cannot be inferred.
- **Automation permission denied** — surfaced by `osascript`. The first run must
  be interactive: a denial triggered from a background launchd job is sticky and
  invisible.
- **Malformed vault entries** — a moment with an unparseable `day` or an unknown
  `phase` is skipped, not fatal. One bad record must not stop the projection.

## Testing

The projection is a pure function from vault JSON to a list of events, so it is
tested directly, without Calendar.app:

- The rule table above: each of the three timing cases renders as specified.
- Skipped records: unknown phase, malformed `day`.
- A `startTime` that will not parse falls back to ambient rather than raising.
- AppleScript string escaping for quotes and backslashes in moment names.
- Window boundaries: a moment on the first and last day is included; one past
  the edge is not.
- Timed events sort before all-day rows within a day.

Note that phase *bands* (`startHour`/`endHour`) are not tested, because the
projection no longer reads them. Placement comes from `startTime` alone; the
phase contributes only its label to the notes. The band arithmetic — and its
`EVENING` wrap past midnight — existed solely to serve the rejected slicing
scheme and was deleted with it.

An end-to-end write is verified once by hand. It is not automated — the cost of
a Calendar.app fixture exceeds the value, and the AppleScript layer is a thin
serializer over already-tested data.

## Lessons from the first attempt

Recorded because each cost real time:

- **`WatchPaths` on the vault directory self-retriggers.** The generator's own
  reads were enough to fire it, looping every 10 seconds at launchd's throttle
  floor. Polling on `StartInterval` is simpler and cannot loop. Event-driven
  freshness was worthless anyway: Calendar's fastest subscription refresh is 5
  minutes, so the consumer could not use it.
- **Check the domain before inventing one.** `Habit.schedule` had been designed
  and merged hours earlier. The even-slicing scheme existed only because the
  projection was written without reading it.
