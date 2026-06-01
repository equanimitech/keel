# keel - Attentive Technology Platform

A pnpm monorepo with two surfaces (browser extension + desktop app) sharing a pure domain types package.

## Structure

```
keel/
├── apps/
│   ├── browser/          # Chrome extension (WXT) — attention shields
│   └── desktop/          # macOS app (Tauri + React) — attention compass
├── packages/
│   └── domain/           # Shared domain types (@keel/domain)
└── package.json          # Workspace scripts
```

## Commands

```bash
pnpm dev:browser          # WXT dev server (browser extension)
pnpm dev:desktop          # Vite dev server (desktop frontend)
pnpm build:browser        # WXT production build
pnpm build:desktop        # Vite production build
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

- **`packages/domain`**: canonical shared types (value objects, behavioral science, interventions, triggers, budgets, sessions, drift)
- **`apps/browser`**: browser-specific shield/signal runtime built on shared types
- **`apps/desktop`**: full DDD architecture (aggregates, entities, services, repositories) extending shared types with fp-ts
