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

## How to pause

Menubar icon → "Pause logging" (toggles to "Resume logging"). Pausing and
resuming are themselves logged. "Open data folder" opens `~/.keel/log/`.

This is the off-switch, not quitting: pausing keeps the process alive and
leaves `writer_paused` in the log, so a deliberate stop is recorded as data
rather than becoming an indistinguishable hole. The LaunchAgent restarts a
quit process for exactly that reason.

## How to verify

```bash
tail -f ~/.keel/log/*.desktop.jsonl
```

The menubar status line shows "keel — N events today".

## Permissions

macOS requires Screen Recording permission for window *titles* (x-win). If the
sensor errors, the tray stays alive, logs nothing, and the menu grows a
"permission needed — click to open settings" item. First launch may also
prompt for Accessibility.

## Dev

```bash
pnpm dev:tray                                    # tauri dev (user runs this)
pnpm build:tray                                  # tauri build
cargo test --manifest-path src-tauri/Cargo.toml  # domain unit tests
```

Rust split: `src-tauri/src/domain.rs` is pure (event building, dedupe,
day-file naming, title capping, idle pairing — unit-tested);
`src-tauri/src/writer.rs` is the only file I/O; `lib.rs` wires sensors + tray.
