# integrations — polling writers

An integration is an activity-log writer that **transcribes what a third party
already measured**, as opposed to an app under `apps/`, which **observes a
surface live**. Both produce `ActivityEvent`s into `~/.keel/log/`; they differ in
what they can honestly claim about what they wrote.

The distinction is not organisational tidiness. It is already load-bearing in
`packages/domain/docs/event-taxonomy.md`, and it changes what the read side is
allowed to conclude:

| | `apps/*` (observing) | `integrations/*` (polling) |
|---|---|---|
| Sees the interval | live, both boundaries | never; the source saw them |
| `durationMs` | measured by this writer | transcribed from the source |
| Arrival | at the moment of the event | late, and out of order |
| Absence means | it did not happen | it may simply not be known |

Three consequences an integration must respect, and a reader of its events must
not forget:

1. **`durationMs` is transcribed, not observed.** The taxonomy bans *fabricating*
   a duration across a writer restart. Copying one from a source that measured
   both boundaries is a different act and is allowed.
2. **Events arrive late and out of order** relative to wall clock. A same-day
   read may be incomplete. This is why writers here keep bounded seen-sets
   rather than high-water marks: a watermark set at 13:00 silently skips a 10:00
   record that only landed at 13:30.
3. **Absence is not zero.** A night the watch missed produces no event. Reading
   the gap as "did not sleep" invents a fact.

## Why not `apps/`

`ActivitySurface` names garmin a peer of agent, desktop and browser, so `apps/`
was the obvious home. It is the wrong one for a practical reason: `apps/agent`
is a **published Claude Code plugin** (`.claude-plugin/marketplace.json`, source
`./apps/agent`), and everything in that directory ships to everyone who installs
it. The Garmin poller lived there until 2026-08-18 and was distributed to every
installer of a focus gate, none of whom asked for it, most of whom have no
Garmin account. It also never ran as a Claude Code surface: no hook invokes it,
it runs under launchd on its own schedule whether or not Claude Code exists.

Peer in the domain, separate in the tree. Both are true.

## Members

- **`garmin/`** — body state: sleep, workouts, and since 2026-08-18 the intraday
  stress and body-battery series that makes body state joinable to the read
  side's bouts and tides. Polls hourly under launchd.

`wake` (Supernote prose to activity events) is anticipated here as the second
member, per `docs/superpowers/specs/2026-08-07-keel-drift-design.md`. When it
lands, the thing worth factoring out is the polling and cursor machinery, not
the folder.

## Conventions

- Each member is a pnpm workspace package with a `test` script, so `pnpm -r test`
  covers it regardless of implementation language.
- Credentials never live in the repo. Integrations reuse tokens the vendor's own
  tooling already cached on the machine.
- Payloads carry counts, timings and enums. Never prose, never place names, never
  coordinates. What each integration deliberately drops is documented in its own
  README and in the taxonomy.
