# keel agent — Claude Code surface

**Keep your attention from fragmenting, yours and your agent's, locally.**

keel is a single Node script wired into Claude Code's hook system. It makes your attention visible (where your focus goes, privately, on your own device), holds a session to one declared focus, and gates coding once you've signed off for the day. No daemon, no build, **fail-open**: if a hook errors, Claude keeps working.

## The goal: one drift, three timescales

Fragmentation is the enemy. It's the same drift (attention pulled off its line) showing up at three scales. keel is one keel against all three:

| Scale | What fragments | keel's answer |
|---|---|---|
| **Within a session** | your focus splinters across tools and tabs mid-task | a **session intention** holds the thread; a **granularity dial** holds response depth |
| **Across sessions** | continuity is lost, every session restarts cold | a **local activity log** is the connective tissue, your own baseline over time |
| **While AI works** | *two* things drift, not one | the **wind-down gate** keeps the *agent* on-thread (no 1am new-subsystem sprawl); the log keeps *you* honest about where you went while it generated |

The third row is the one nobody else sits in. Calm-tech tools watch the human; agent tools watch the model; keel sits on the seam, in the hook layer, watching both.

## What it does (observe-first)

keel accumulates attention signal now; steering comes later, built on your own baselines (a separate P5 module, gated behind ~21 days of personal data). v0 is mostly **see**, a little **steer**.

- **Activity log** (`keel log`, plus `SessionStart` / `UserPromptSubmit` hooks) writes every session event to `~/.keel/log/` as plain JSONL. Domains and timings, never prompts or content.
- **Session intention** (`keel intention "<focus>"`) names the session's focus. It surfaces in the statusline HUD each turn and holds the conversation to that thread. The agent infers and sets it silently if you don't. Resets on a fresh session or `/clear`, persists across resume/compact.
- **Granularity dial** (`keel granularity <level>`) sets how deep responses go this session. Floor is `tldr`. Levels: `sentence` (L1, claim only), `tldr` (L2, claim + mechanism), `page` (L3, worked example), `report` (L5, citations + edge cases).
- **Wind-down gate** (`PreToolUse` hook) denies Edit/Write/Bash once you've signed off, parked, or passed a backstop hour. **Breakpoint-armed** (engages at a turn boundary, never mid-edit), escapable only by a scarce **skip credit**. Conversation and journal/ritual writes (`allowPaths`) stay open, so closing the day is never blocked.

The gate is the surprise that made keel worth shipping: built to stop *you* coding past midnight, it ends up disciplining the *model*. Under the gate Claude declines to start new subsystems at 1am, decomposes instead, and tells you to bank it for morning. "It's late, wrap up" turns out to be an alignment primitive, a governor on bias-to-action exactly when judgment is worst, for the human and the agent both.

## Privacy posture (load-bearing)

Everything stays on your machine. Events write to `~/.keel/log/`. Payloads carry domains and timings, never full URLs, prompts, or content. Nothing leaves the device.

## Install (one time)

```bash
# from the repo root:
mkdir -p ~/.keel
ln -sf "$(pwd)/apps/agent/keel.mjs"  ~/.keel/keel.mjs
ln -sf "$(pwd)/apps/agent/core.mjs"  ~/.keel/core.mjs    # keel.mjs imports these
ln -sf "$(pwd)/apps/agent/store.mjs" ~/.keel/store.mjs
cp -n apps/agent/config.sample.json  ~/.keel/config.json
node ~/.keel/keel.mjs status
```

Merge into `~/.claude/settings.json` (create if absent):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash",
        "hooks": [ { "type": "command", "command": "node $HOME/.keel/keel.mjs hook pre-tool", "timeout": 30 } ] }
    ],
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "node $HOME/.keel/keel.mjs hook user-submit", "timeout": 20 } ] }
    ],
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node $HOME/.keel/keel.mjs hook session-start", "timeout": 20 } ] }
    ]
  }
}
```

> The three `.mjs` files import each other, so symlink all three into `~/.keel` (the install does this). Alternatively, point the hook `command` at the repo path directly and skip the symlinks.

## Make it yours

Edit the `claude-code` target in `~/.keel/config.json`:
- **`driver`** — `windDown` / `hardStop` / `reset` (local `HH:MM`, the night wraps midnight), plus `backstop`, the late hour an un-signed-off night locks anyway (set `""` for pure sovereign, no clock lockdown).
- **`rules`** — what blocks: `tools`, `engagesAt` (the friction threshold), `arming` (`breakpoint` | `immediate`), `maxGraceMin`, and `allowPaths` (write targets exempt even under lockdown, default `~/journals`, `~/.keel`).
- **`skipBudget`** — `perMonth` + `cap` (credits carry over, capped).
- **`voice`** — **your words** for the nudges and the lockdown line. This is the point: keel says what *you'd* say.

## Use

- After you **sign off** (or `park`), or past the **backstop**, coding tools are denied until `reset`. Conversation still works, and so do journal/ritual writes.
- **Override** a night you judge worth it: `node ~/.keel/keel.mjs skip` (spends a credit). At 0 credits it holds until reset.
- `keel status` — current friction, phase, credits. `keel intention` / `keel granularity` — see or set the session dials.
- **Remove the gate:** delete the `hooks` block from `~/.claude/settings.json`.

## Advanced: blocklist drogue

A sibling commitment device (`keel vice <on|off|skip|status>`) blocks vice sites via an `/etc/hosts` lock, raised alongside the coding gate on `signoff`. It needs a one-time root install (a small LaunchDaemon that reconciles `/etc/hosts` to keel's desired state, so a manual `off` mid-window self-heals). Optional and off by default. See `vice-install.sh`.

## Advanced: garmin sync (body state)

`garmin_sync.py` is a fourth activity-log writer — it polls Garmin Connect and appends `workout_completed` / `sleep_recorded` events to `~/.keel/log/YYYY-MM-DD.garmin.jsonl`. Polling, not push: Garmin has no local sync event, and push (the official Health API) needs partner approval and a public HTTPS endpoint — a server keel does not want.

Auth reuses the garth tokens already cached in `~/.garminconnect`; no credentials live in the repo. Deps are declared inline (PEP 723), so `uv` resolves them per-run — nothing to install.

```bash
cd apps/agent
./garmin_sync.py --dry-run       # print events, write nothing
./garmin_sync.py                 # incremental, since ~/.keel/garmin.cursor
./garmin_sync.py --backfill 30   # widen the sleep window

# hourly, via launchd — set the repo path in the plist first
cp com.equanimitech.keel.garmin.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.equanimitech.keel.garmin.plist
```

Payloads carry type and numbers only. Garmin bakes place names into `activityName` (e.g. "&lt;suburb&gt; Soccer/Football"); that field, `locationName`, and lat/lon are dropped at the writer.

## Dev

```bash
cd apps/agent
node --test                            # unit tests (pure core)
python3 -m unittest test_garmin_sync   # garmin mapping + cursor (no network)
pnpm typecheck                         # JSDoc + // @ts-check (no build)
```

Pure domain lives in `core.mjs` (the part that later lifts into `@keel/domain`); I/O in `store.mjs`; hook orchestration in `keel.mjs`.

## Not in v0 (later)

The P5 steering module (interventions on personal baselines, including the AI-wait-gap intervention that fills the third row of the table above), breakpoint-arming on desktop-OS signals (app switch/idle), the Tauri daemon, the focus MCP, and the shared `Friction` core (v0 inlines a linear ramp).
