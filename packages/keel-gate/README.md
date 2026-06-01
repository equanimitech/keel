# keel-gate v0 — Claude Code focus gate

A pure Claude Code hook that, past a wind-down hard-stop, **denies coding tool calls** (Edit/Write/Bash/…) until a reset hour — **breakpoint-armed** (engages at a turn boundary, never mid-turn), escapable only by a scarce **skip credit**. Plus a wind-down nudge, a meta-awareness bell, and a scoreless daily reflection — all in **your own words**.

No daemon, no build. One Node script + `~/.keel/config.json`. **Fail-open**: if anything errors, Claude keeps working.

It's the first instance of the keel strategy model: a **target** (`claude-code`) with a **wind-down driver** (→ friction `f`) and **friction rules** (Drogue renderers on the drag scale). See `docs/superpowers/specs/2026-06-01-keel-ai-gate-design.md`.

## Install (one time)

```bash
# from the repo root:
mkdir -p ~/.keel
ln -sf "$(pwd)/packages/keel-gate/keel.mjs"  ~/.keel/keel.mjs
ln -sf "$(pwd)/packages/keel-gate/core.mjs"  ~/.keel/core.mjs    # keel.mjs imports these
ln -sf "$(pwd)/packages/keel-gate/store.mjs" ~/.keel/store.mjs
cp -n packages/keel-gate/config.sample.json  ~/.keel/config.json
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

> Note: the three `.mjs` files import each other, so symlink all three into `~/.keel` (the install does this). Alternatively, point the hook `command` at the repo path directly (`node <repo>/packages/keel-gate/keel.mjs …`) and skip the symlinks.

## Make it yours

Edit the `claude-code` target in `~/.keel/config.json`:
- **`driver`** — `windDown` / `hardStop` / `reset` (local `HH:MM`; the night wraps midnight).
- **`rules`** — what blocks: `tools`, `engagesAt` (the friction threshold), `arming` (`breakpoint` | `immediate`), `maxGraceMin`.
- **`skipBudget`** — `perMonth` + `cap` (credits carry over, capped).
- **`voice`** — **your words** for `windDownNudge`, `lockdown`, `substitution`, and opt-in `consequence` / `identity` (empty = off). `{reset}` and `{credits}` interpolate. This is the point — keel says what *you'd* say.

## Use

- Past `hardStop`, coding tools are denied until `reset`. Conversation still works.
- **Override** a night you judge worth it: `node ~/.keel/keel.mjs skip` (spends a credit). At 0 credits it holds until reset.
- `node ~/.keel/keel.mjs status` — current `f`, phase, credits.
- **Remove the gate:** delete the `hooks` block from `~/.claude/settings.json`.

## Dev

```bash
cd packages/keel-gate
node --test        # unit tests (pure core)
pnpm typecheck     # JSDoc + // @ts-check (no build)
```

Pure domain lives in `core.mjs` (the part that later lifts into `@keel/domain`); I/O in `store.mjs`; hook orchestration in `keel.mjs`.

## Not in v0 (later)

Breakpoint-arming on *desktop-OS* signals (app switch/idle — needs the observer), the Tauri daemon, the focus MCP, the visual `dim`/`blur` notches (no overlay on the Claude surface yet), the shared `Friction`/`frictionCurve` core (v0 inlines a linear ramp).
