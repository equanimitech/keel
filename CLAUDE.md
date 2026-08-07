# keel - Attentive Technology Platform

A pnpm monorepo of capability × surface apps (Claude Code agent, browser extension, macOS tray) sharing a pure domain types package.

## Structure

```
keel/
├── apps/
│   ├── agent/            # Claude Code surface (@keel/agent) — focus gate + activity-log writer; ships as plugin
│   ├── browser/          # Chrome extension (WXT) — activity writer + per-domain sensors
│   └── tray/             # macOS menubar-only app (Tauri, no windows) — desktop activity-log writer; ships as "keel"
├── packages/
│   ├── domain/           # Shared domain types (@keel/domain)
│   ├── ui/               # Shared design system — tokens + shadcn/ui (@keel/ui)
│   └── keel-alfred/      # Alfred workflow — global launcher for the ritual system
└── package.json          # Workspace scripts
```

Surfaces are named by the capability × surface grammar (keel agent / keel browser / keel tray — see `docs/decisions/2026-06-12-keel-productization.md`). The agent surface is plain `// @ts-check` JS (no TS imports — it deploys standalone); its dev-mode deploy is symlinks from `~/.kairos/keel/`, its distribution is a Claude Code plugin (`apps/agent/.claude-plugin/`).

## Commands

```bash
pnpm dev:browser          # WXT dev server (browser extension)
pnpm dev:tray             # tauri dev (menubar logger)
pnpm build:browser        # WXT production build
pnpm build:tray           # tauri build (menubar logger bundle)
pnpm build                # Build all packages
pnpm typecheck            # Typecheck all packages
```

**Do not run dev commands.** The user runs them manually.

### Tests

There is no root `test` script — run per package:

```bash
pnpm -r test                                  # everything (tray needs a Rust toolchain)
pnpm --filter @keel/domain test               # vitest
pnpm --filter @keel/browser test              # vitest
pnpm --filter @keel/agent test                # node --test (plain .mjs)
pnpm --filter @keel/tray test                 # cargo test (src-tauri)

# single file — pass the path through to the package's test script
pnpm --filter @keel/domain test src/bouts.test.ts
pnpm --filter @keel/agent test store.test.mjs
```

## Shared Domain (`@keel/domain`)

Pure types. No runtime dependencies. The TypeScript surfaces import from this package.

Rules:
- Vanilla TypeScript only — no fp-ts, no React, no Tauri, no Chrome APIs
- All types are `readonly` / immutable
- Factory functions for construction, never classes
- No side effects — types and pure functions only
- Branded value objects (e.g., `Duration = number & { __brand: "Duration" }`)

**No fp-ts anywhere in the repo** — it left with `apps/desktop` (removed 2026-06-13). The shared domain stays vanilla TypeScript.

## Coding Conventions

- Prefer functional programming
- Use DDD principles
- Prefer `for...of` instead of `forEach`
- Always use JS blocks (no braceless `if`/`for`)
- Use pnpm (not npm or yarn)

## Architecture

Dependencies flow inward: Domain -> Application -> Infrastructure -> UI.

- **`packages/domain`**: the ActivityEvent log substrate (`activity.ts`) + the read-side derivations built on it — `bouts.ts` (bouts, runs), `tide.ts` (what your attention is actually doing), `areas.ts`, `route.ts` — plus `rules.ts`, the 7 primitive contracts (`docs/primitive-contracts.md`), and the event-taxonomy contract (`packages/domain/docs/event-taxonomy.md`).
- **`apps/browser`**: activity writer (coarse events) + watchlist-gated per-domain sensors (key-action completions) + `modules/friction/` (the gate, the cooldown, the policy) + the blocklist drogue (commitment device)
- **`apps/tray`**: macOS menubar app (Tauri) — the desktop activity-log writer. (The frozen `apps/desktop` compass was removed 2026-06-13; archived at tag `desktop-archive-2026-06-13`, reusable gems mapped in `docs/decisions/2026-06-13-remove-desktop-preserve-compass-gems.md`.)

**Cross-surface transport:** the browser extension relays events (`modules/relay`) to `apps/agent/native-host.mjs` — a command-less, append-only, schema-validating native-messaging host that writes to `~/.kairos/keel/log/`. Chrome frames messages with a uint32 LE length prefix, 1 MB max; responses are chunked to stay inside it.

## Privacy posture (load-bearing, not aspirational)

Everything stays on-device. Payloads carry **domains and timings — never full URLs, prompts, or page content.** Window titles are capped at 256 chars. Browser events live in extension-local IndexedDB until exported; agent/tray events write to `~/.kairos/keel/log/` as JSONL. Treat any change that widens a payload as a design decision, not an implementation detail.

`packages/domain/docs/event-taxonomy.md` is the writers' contract: every `ActivityEvent.kind` is a **span** (`_start`/`_end`), a **switch** (`_switched`/`_activated`), or a **completion** (past-tense). Kinds are an open set that accretes per surface — never centralize them into an enum. `durationMs` appears only when the writer observed the interval's start; never fabricate it across a restart or pause.

## Interventions: retired, then returned

Two dates, and conflating them is the fastest way to misread this repo.

- **2026-06-12** — the shield / signal / budget layer was retired
  (`docs/decisions/2026-06-12-retire-the-intervention-layer-….md`). keel became
  observability-first: accumulate raw signal, model later. The blocklist drogue
  survived as a commitment device.
- **2026-08-05** — interventions returned as the **friction interpreter**
  (`apps/browser/modules/friction/`), built on `RuleSpec` and the accumulated
  baselines. Not the old shield layer: rules are data, the gate is one actuator,
  and the whole thing is scoped by area.

The load-bearing invariant, enforced in `@keel/domain` types rather than at
runtime: **a tide (ambient observation) may arm a `gate`; it may never arm a
`cooldown`.** `AmbientRule.primitives` is `Exclude<PrimitiveSpec, CooldownSpec>`,
so an imposed lock cannot be constructed. Locks are self-invoked only.

## kairos — the shared kernel

keel is one instrument of **kairos**, not a standalone product. Some state is
owned by the kernel, not by keel, and is read from `$KAIROS_HOME` (default
`~/.kairos`).

Since 2026-08-07 keel's own files live **inside** that vault, at
`$KAIROS_HOME/keel/` (log, config, state, rules, area-map) — one directory to
back up, one knob to point at a dev vault. `~/.keel` remains as a symlink to it,
so any call site still saying `~/.keel` keeps working. The one-way seam is
unchanged, only stated more precisely: **keel never writes the kernel's
collections** (the JSON at the vault root); it writes only its own subtree.
`KEEL_HOME` still overrides the subtree outright, which is how the tests get a
scratch log instead of the real one.

The kernel-owned state:

- **areas** — `~/.kairos/areas.json`, defined in zenborg, read by both the agent
  surface (`apps/agent/store.mjs`) and the browser (`entrypoints/manage`,
  `modules/friction/policy`). Contract + schema live in the kairos repo at
  `kernel/areas.md`. keel never writes them.
- **the active moment** — `~/.kairos/activeMoment.json`, a pointer (`{momentId, at}`)
  to the moment that IS the current intention, resolved against `moments.json`.
  Set in zenborg (MCP or the UI), read by the agent surface; keel never writes it.
  It is honoured only while the moment it names sits on the current waking-day, so
  it retires itself at the 04:00 roll. This replaced keel's own watch-scoped
  intention strings on 2026-08-07 — see
  `docs/superpowers/specs/2026-08-07-active-moment-intention-design.md`.

`docs/superpowers/specs/2026-08-06-helm-design.md` is the current statement of
how keel's parts (heading, tide, helm, gate) compose inside kairos.
