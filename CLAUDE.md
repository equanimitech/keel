# keel - Attentive Technology Platform

A pnpm monorepo with two surfaces (browser extension + desktop app) sharing a pure domain types package.

## Structure

```
keel/
├── apps/
│   ├── agent/            # Claude Code surface (@keel/agent) — focus gate + activity-log writer; ships as plugin
│   ├── browser/          # Chrome extension (WXT) — activity writer + per-domain sensors
│   ├── desktop/          # macOS app (Tauri + React) — attention compass (frozen; demoted per observability roadmap)
│   └── tray/             # macOS menubar-only app (Tauri, no windows) — desktop activity-log writer; ships as "keel desktop"
├── packages/
│   └── domain/           # Shared domain types (@keel/domain)
└── package.json          # Workspace scripts
```

Surfaces are named by the capability × surface grammar (keel agent / keel browser / keel desktop — see `docs/decisions/2026-06-12-keel-productization.md`). The agent surface is plain `// @ts-check` JS (no TS imports — it deploys standalone); its dev-mode deploy is symlinks from `~/.keel/`, its distribution is a Claude Code plugin (`apps/agent/.claude-plugin/`).

## Commands

```bash
pnpm dev:browser          # WXT dev server (browser extension)
pnpm dev:desktop          # Vite dev server (desktop frontend)
pnpm dev:tray             # tauri dev (menubar logger)
pnpm build:browser        # WXT production build
pnpm build:desktop        # Vite production build
pnpm build:tray           # tauri build (menubar logger bundle)
pnpm build                # Build all packages
pnpm typecheck            # Typecheck all packages
```

**Do not run dev commands.** The user runs them manually.

## Shared Domain (`@keel/domain`)

Pure types. No runtime dependencies. Both surfaces import from this package.

Rules:
- Vanilla TypeScript only — no fp-ts, no React, no Tauri, no Chrome APIs
- All types are `readonly` / immutable
- Factory functions for construction, never classes
- No side effects — types and pure functions only
- Branded value objects (e.g., `Duration = number & { __brand: "Duration" }`)

**fp-ts is isolated to `apps/desktop/`.** The shared domain must never depend on it.

## Coding Conventions

- Prefer functional programming
- Use DDD principles
- Prefer `for...of` instead of `forEach`
- Always use JS blocks (no braceless `if`/`for`)
- Use pnpm (not npm or yarn)

## Architecture

Dependencies flow inward: Domain -> Application -> Infrastructure -> UI.

- **`packages/domain`**: the ActivityEvent log substrate + value objects + the event-taxonomy contract (`packages/domain/docs/event-taxonomy.md`). The intervention layer was retired 2026-06-12 (see `docs/decisions/`) — it returns as a separate module (P5) built on personal baselines.
- **`apps/browser`**: activity writer (coarse events) + watchlist-gated per-domain sensors (key-action completions) + the blocklist drogue (commitment device — the retirement's lone survivor)
- **`apps/desktop`**: full DDD architecture (frozen; absorbed its intervention value objects locally on retirement)
