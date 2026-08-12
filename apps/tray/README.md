# keel tray

Menubar-only macOS app (Tauri, no windows, no dock icon) that writes desktop
attention events to the keel activity log. The desktop writer of the
observability substrate (roadmap slice B).

## What it logs

Append-only JSONL, one event per line, mirroring `@keel/domain` `ActivityEvent`
(`{ id, surface: "desktop", kind, ts, sessionId, payload, durationMs? }`):

- `app_switched` — the frontmost app changed (app name, window title capped at
  256 chars, full-screen flag). Polled every ~1.5s, deduped: only written when
  the app or title actually changed.
- `idle_start` / `idle_end` — no input for ≥ 120s opens an idle span
  (`idle_start.ts` is backdated to when input stopped); the first activity
  after closes it (`idle_end` carries `durationMs`).
- `writer_started` / `writer_paused` / `writer_resumed` — the writer's own
  lifecycle, so gaps are attributable. (The `logger_*` spelling is the legacy
  alias; `canonicalKind` in `@keel/domain` folds it into `writer_*`.)

## Privacy posture

App names, capped window titles, and timings — nothing else. No keystroke
content, no screenshots, no URLs, no network: events are written to a local
file you own and never leave this machine.

## Where

`~/.keel/log/YYYY-MM-DD.desktop.jsonl` — local-date bucketing, same convention
as the agent surface. Fail-open: any write error drops the event; the logger
never crashes or blocks.

## Staying up

Install the LaunchAgent — without it the writer dies at reboot and stays dead:

**Quit any hand-launched keel.app first** — see the gotcha below.

```bash
cp apps/tray/com.equanimitech.keel.tray.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.equanimitech.keel.tray.plist

# healthy = `job state = running` with `runs` static
launchctl print gui/$(id -u)/com.equanimitech.keel.tray | grep -E 'runs|job state'
```

`launchctl bootout gui/$(id -u)/com.equanimitech.keel.tray` to remove it.

**Gotcha: a silent restart loop.** Bootstrapping while the app is already
running by hand makes launchd's copy hit the single-instance guard and exit
**0**; KeepAlive respawns it every `ThrottleInterval`, forever. Nothing
surfaces this — a clean exit produces no crash report — and the only tell is
`runs` climbing while `job state = exited`. Quit the manual instance and
launchd's copy takes the slot within 30s.

**Why it is not optional.** Over 2026-06-12..08-07 the writer was dark for
1096h of a 1342h span, and **670h of that was time the Mac was in use** — the
browser and agent surfaces logged through 55 separate gaps the tray missed,
the longest running 90.3h. No crash reports, no `writer_paused` events: it was
simply never relaunched.

That is not a cosmetic gap. Uptime that tracks *when the writer happened to be
running* silently biases every hour-of-day derivation on the read side, and
makes a daily rhythm unidentifiable no matter how good the model is. Coverage
is a precondition for the analysis, not a nice-to-have.

## Setting the granularity ceiling

Menubar icon → **Granularity** — the same day-scoped response-depth dial as
`keel granularity <level>`, moved to where it can be reached without a terminal.
The submenu title carries the ceiling in force (`Granularity — tldr`), one row
per level is checked, and "Reset to default (page)" clears it.

The dial itself is still the agent surface's: this menu is a second hand on the
same face. It writes exactly two fields of `~/.keel/state.json` (`granularity`
and its waking-day stamp `granularityDay`), reading the document first so the
agent's other fields — focus lock, session timestamps — survive. The rules are
restated in `domain.rs` from `apps/agent/core.mjs`: the four levels, the `page`
default, and the 04:00 day roll. **Change one, change both** — two writers
disagreeing about today's ceiling would be worse than no tray control at all.

Because the CLI writes the same file, and the waking day rolls under a menu
nobody clicked, the tray re-reads state every 30s (the rollup cadence) and
re-ticks the rows. That refresh runs above the pause check on purpose: pausing
the sensors stops logging, it does not freeze the menu's picture of the dial.

## How to pause

Menubar icon → "Pause logging" (toggles to "Resume logging"). Pausing and
resuming are themselves logged. "Open data folder" opens `~/.keel/log/`.

This is the off-switch, not quitting: pausing keeps the process alive and
leaves `writer_paused` in the log, so a deliberate stop is recorded as data
rather than becoming an indistinguishable hole. The LaunchAgent restarts a
quit process for exactly that reason.

## Installing a new build

```bash
pnpm install:tray     # build → sign → install → restart under launchd → verify
```

Do not hand-roll this. Three traps, each of which fails quietly:

- **The DMG bundler moves the app.** A default `tauri build` hands `keel.app` to
  the disk-image step, which takes it out of `bundle/macos/`; a copy written
  afterwards finds nothing there. The script builds `--bundles app`.
- **An unsigned rebuild loses the Screen Recording grant** (see below).
- **Bootstrapping over a live instance starts a respawn loop** — launchd's copy
  hits the single-instance guard, exits 0, and KeepAlive tries again forever.
  The script boots out, kills strays, then bootstraps, and checks the pid is
  stable rather than trusting one `job state` sample.

Rollback: the previous app is kept at
`~/Library/Application Support/keel-backups/keel.app.previous`.

## How to verify

```bash
pnpm check:tray       # or: node scripts/tray-title-health.mjs 10
```

**`tail -f` cannot verify this writer**, and neither can the menubar. Without
the Screen Recording grant, x-win still returns `Ok` and every window title
arrives as `""` — events keep landing at a healthy rate and the whole thing
looks fine. The only honest check is whether titles are non-empty, which is what
`check:tray` counts (counts only; titles are private and never printed).

## Permissions

macOS requires Screen Recording permission for window *titles* (x-win). If the
sensor errors, the tray stays alive, logs nothing, and the menu grows a
"permission needed — click to open settings" item plus "Relaunch keel". First
launch may also prompt for Accessibility.

**A fresh grant cannot take effect in a running process.**
`CGPreflightScreenCaptureAccess()` keeps returning false until restart, which is
why the menu offers the relaunch next to the settings link: grant, *then*
relaunch.

**Why the app is signed with a Developer ID.** macOS keys the grant to the app's
code identity. An ad-hoc signed build gets a fresh identity on every rebuild, so
each install silently dropped the permission — the Settings toggle kept pointing
at the previous binary, and re-toggling it changed nothing. Signing with a
stable Developer ID certificate makes the grant survive rebuilds.
`install-tray.sh` reads the identity out of the keychain rather than hardcoding
one, and refuses to install an ad-hoc build unless you insist with
`APPLE_SIGNING_IDENTITY="-"`.

## Dev

```bash
pnpm dev:tray                                    # tauri dev (user runs this)
pnpm build:tray                                  # tauri build (all bundles)
pnpm install:tray                                # build, sign, install, restart
cargo test --manifest-path src-tauri/Cargo.toml  # domain unit tests
```

Rust split: `src-tauri/src/domain.rs` is pure (event building, dedupe,
day-file naming, title capping, idle pairing, the granularity ceiling —
unit-tested); `src-tauri/src/writer.rs` is the only file I/O (append-only log,
plus the read/modify/write of `state.json`); `lib.rs` wires sensors + tray.
