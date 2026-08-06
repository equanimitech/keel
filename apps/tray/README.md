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

## How to pause

Menubar icon → "Pause logging" (toggles to "Resume logging"). Pausing and
resuming are themselves logged. "Open data folder" opens `~/.keel/log/`.

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
