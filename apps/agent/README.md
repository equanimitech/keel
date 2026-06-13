# keel-gate v0 — Claude Code focus gate

A pure Claude Code hook that **denies coding tool calls** (Edit/Write/Bash/…) once you're in lockdown — **breakpoint-armed** (engages at a turn boundary, never mid-turn), escapable only by a scarce **skip credit**. Lockdown is **sovereign**: it engages when you **sign off** (or park), or at a late **backstop** hour — the wall-clock ramp only escalates wind-down *nudges*, it never hard-locks on its own. Journal/ritual writes (`allowPaths`) stay exempt so closing the day is never blocked. Plus a meta-awareness bell and a scoreless daily reflection — all in **your own words**.

No daemon, no build. One Node script + `~/.keel/config.json`. **Fail-open**: if anything errors, Claude keeps working.

It's the first instance of the keel strategy model: a **target** (`claude-code`) with a **wind-down driver** (→ friction `f`) and **friction rules** (Drogue renderers on the drag scale). See `docs/superpowers/specs/2026-06-01-keel-ai-gate-design.md`.

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

> Note: the three `.mjs` files import each other, so symlink all three into `~/.keel` (the install does this). Alternatively, point the hook `command` at the repo path directly (`node <repo>/apps/agent/keel.mjs …`) and skip the symlinks.

## Make it yours

Edit the `claude-code` target in `~/.keel/config.json`:
- **`driver`** — `windDown` / `hardStop` / `reset` (local `HH:MM`; the night wraps midnight), plus `backstop` — the late hour an un-signed-off night hard-locks anyway (set `""` for pure sovereign, no clock lockdown).
- **`rules`** — what blocks: `tools`, `engagesAt` (the friction threshold), `arming` (`breakpoint` | `immediate`), `maxGraceMin`, and `allowPaths` — write targets exempt even under lockdown (default `~/journals`, `~/.keel`; matches a path or any descendant).
- **`skipBudget`** — `perMonth` + `cap` (credits carry over, capped).
- **`voice`** — **your words** for `windDownNudge`, `lockdown`, `substitution`, and opt-in `consequence` / `identity` (empty = off). `{reset}` and `{credits}` interpolate. This is the point — keel says what *you'd* say.

## Use

- After you **sign off** (or park), or past the **backstop**, coding tools are denied until `reset`. Conversation still works — and so do journal/ritual writes (`allowPaths`). The clock before lockdown only nudges.
- **Override** a night you judge worth it: `node ~/.keel/keel.mjs skip` (spends a credit). At 0 credits it holds until reset.
- `node ~/.keel/keel.mjs status` — current `f`, phase, credits.
- **Remove the gate:** delete the `hooks` block from `~/.claude/settings.json`.

## Vice block (scheduled site lock)

A sibling Ulysses pact for vice sites (`vice-blocklist.txt`), enforced by an `/etc/hosts` block. Unlike the coding gate (pure hook, no privilege), the hosts block needs root — so it's enforced by a small **root LaunchDaemon** that reconciles `/etc/hosts` to keel's desired state every few minutes. That reconcile loop is the teeth: a manual `off` mid-window gets **re-asserted** within a tick.

Desired state = `viceShouldBlock`: a spent skip lifts everything; else a manual pact (`vice on` / `signoff`) or a scheduled window raises it.

- **Schedule** — `vice.windows` in config (`[{ "from": "23:00", "to": "05:00" }]`, wraps midnight). Empty ⇒ derived from the coding night (`driver.windDown→reset`). `reassertEveryMin` sets the daemon tick.
- **Commands** — `keel vice <on|off|skip|status|panic>`. `on`/`panic` raise a pact held to reset; `skip` spends a credit (shared with coding) to lift until reset; `off` drops a manual pact (refused if a window still bites — use `skip`).
- **signoff** raises vices alongside the coding lock — one seal closes both.
- **Enforcement install (one time, root):**
  ```bash
  osascript -e 'do shell script "/Users/rafa/.keel/vice-install.sh" with administrator privileges'
  ```
  Deploys `vice-block.sh` root-owned, installs the daemon + a passwordless-sudo rule scoped to that one script (so `keel vice` applies instantly). Reversible: `sudo ~/.keel/vice-uninstall.sh`.

Without the install, `keel vice on/off` still work (GUI auth per call); the daemon is what adds the *schedule* and *self-heal*.

## Dev

```bash
cd apps/agent
node --test        # unit tests (pure core)
pnpm typecheck     # JSDoc + // @ts-check (no build)
```

Pure domain lives in `core.mjs` (the part that later lifts into `@keel/domain`); I/O in `store.mjs`; hook orchestration in `keel.mjs`.

## Not in v0 (later)

Breakpoint-arming on *desktop-OS* signals (app switch/idle — needs the observer), the Tauri daemon, the focus MCP, the visual `dim`/`blur` notches (no overlay on the Claude surface yet), the shared `Friction`/`frictionCurve` core (v0 inlines a linear ramp).
