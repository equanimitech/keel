# keel - Attentive Technology Platform

A pnpm monorepo of two surfaces: a Claude Code agent and a Chrome extension.

## Structure

```
keel/
├── apps/
│   ├── agent/            # Claude Code surface (@keel/agent) — activity-log writer, no gates; ships as plugin
│   └── browser/          # Chrome extension (WXT) — activity writer + per-domain sensors + its own inlined domain
├── integrations/
│   └── garmin/           # Garmin body-log poller (Python), run by zenborg's scheduler
├── packages/
│   └── keel-alfred/      # Alfred workflow — global launcher for the ritual system (shell, not a workspace package)
├── docs/
│   ├── event-taxonomy.md      # the writers' contract
│   ├── read-side-pitfalls.md  # how derivations go wrong
│   └── references/bct/        # the BCT taxonomy CSVs (93 techniques, groupings, mechanisms)
└── package.json          # Workspace scripts
```

**`apps/tray`, `packages/domain` and `packages/ui` were deleted on 2026-08-21** (slice B, step 6 of `kairos/docs/superpowers/specs/2026-08-18-the-garden-absorbs-keel-design.md`). zenborg's observer replaces the tray; the live half of the domain was inlined into `apps/browser/modules/domain/` (its sole remaining consumer) and the dead half (`rules.ts`, `tide.ts`, `areas.ts`) went with the package; `packages/ui`'s shadcn component set had no importer at all, so only its three CSS files and the Inter woff2 survived, into `apps/browser/styles/`. The three launchd plists went too.

The agent surface is plain `// @ts-check` JS (no TS imports — it deploys standalone); its dev-mode deploy is symlinks from `~/.kairos/keel/`, its distribution is a Claude Code plugin (`apps/agent/.claude-plugin/`).

## Commands

```bash
pnpm dev:browser          # WXT dev server (browser extension)
pnpm build:browser        # WXT production build
pnpm build                # Build all packages
pnpm typecheck            # Typecheck all packages
```

**Do not run dev commands.** The user runs them manually.

### Tests

There is no root `test` script — run per package:

```bash
pnpm -r test                                  # everything
pnpm --filter @keel/browser test              # vitest (includes the inlined domain)
pnpm --filter @keel/agent test                # node --test (plain .mjs)

# single file — pass the path through to the package's test script
pnpm --filter @keel/browser test modules/domain/bouts.test.ts
pnpm --filter @keel/agent test store.test.mjs
```

The Garmin integration is pytest: `python3 -m pytest integrations/garmin/test_garmin_sync.py`.

## The domain (`apps/browser/modules/domain`)

Pure types, no runtime dependencies. This was `@keel/domain`, a workspace package
shared by three surfaces; two of them are gone, so on 2026-08-21 it was inlined
into its one remaining consumer rather than kept as a package with a single
importer. The rules did not change with the address:
- Vanilla TypeScript only — no fp-ts, no React, no Tauri, no Chrome APIs
- All types are `readonly` / immutable
- Factory functions for construction, never classes
- No side effects — types and pure functions only
- Branded value objects (e.g., `Duration = number & { __brand: "Duration" }`)

**No fp-ts anywhere in the repo** — it left with `apps/desktop` (removed 2026-06-13). The domain stays vanilla TypeScript.

## Coding Conventions

- Prefer functional programming
- Use DDD principles
- Prefer `for...of` instead of `forEach`
- Always use JS blocks (no braceless `if`/`for`)
- Use pnpm (not npm or yarn)

## Architecture

Dependencies flow inward: Domain -> Application -> Infrastructure -> UI.

- **`apps/browser/modules/domain`**: the ActivityEvent log substrate (`activity.ts`) plus the read-side derivations built on it: `bouts.ts` (bouts, runs), `route.ts`, `moment-friction.ts`, `value-objects.ts`. The event-taxonomy contract is `docs/event-taxonomy.md`; the 7 primitive contracts are `docs/primitive-contracts.md`. `rules.ts` (the `RuleSpec` types), `tide.ts` and `areas.ts` were deleted with the package on 2026-08-21, because nothing imported them and the rule vocabulary is zenborg's now.
- **`apps/browser`**: activity writer (coarse events) + watchlist-gated per-domain sensors (key-action completions) + `modules/friction/` (the gate, the cooldown, the policy) + `modules/interventions/` (the armed cache) + the blocklist drogue (commitment device)
- **`apps/agent`**: the Claude Code surface, plus `native-host.mjs`, the native-messaging host the extension relays through.

**The desktop writer is gone.** `apps/tray` was the macOS menubar app (Tauri) that wrote desktop activity to `~/.kairos/keel/log/`; it was deleted on 2026-08-21 and its replacement is zenborg's observer, which ships **off** and writes to `keel/log-zenborg` in parity mode until it is turned on. Until Rafa enables it, **desktop activity is not being logged**. The operating instructions are `zenborg/docs/2026-08-21-background-agent-operating-the-observer-and-the-scheduler.md`. (The frozen `apps/desktop` compass was removed 2026-06-13; archived at tag `desktop-archive-2026-06-13`, reusable gems mapped in `docs/decisions/2026-06-13-remove-desktop-preserve-compass-gems.md`.)

**Cross-surface transport:** the browser extension relays events (`modules/relay`) to `apps/agent/native-host.mjs`, a schema-validating native-messaging host that writes to `~/.kairos/keel/log/`. Chrome frames messages with a uint32 LE length prefix, 1 MB max; responses are chunked to stay inside it.

That host used to be described here as **command-less and append-only**, and that description is stale rather than a constraint. It answers questions (`request_observe`, `request_policy`, `request_armed`, `request_events`), it writes `area-map.json` on `set_area`, and since 2026-08-21 it **pushes the armed record**. `request_policy` no longer carries `standing`, `armable` or `gates`: migration step 5 made those the armed record's business, and one store deserves one projection. What is actually load-bearing survives unchanged and is worth stating in its own words:

- **the extension writes nothing but events**, and only append;
- **every inbound message is validated** before anything is written, because the extension is untrusted (`validateInbound`, `isValidEvent`);
- **the host is an unprivileged reader of the vault**, never a writer of the kernel's collections.

`kairos/kernel/substrate.md` records why the push exists: the extension has no filesystem access and never will, so it takes a **pusher rather than a loader**. Pushing is a read with extra steps, not a second writer — no copy lands on disk, so one-writer-per-collection still holds.

## Privacy posture (load-bearing, not aspirational)

Everything stays on-device. Payloads carry **domains and timings — never full URLs, prompts, or page content.** Window titles are capped at 256 chars. Browser events live in extension-local IndexedDB until exported; agent events write to `~/.kairos/keel/log/` as JSONL. Treat any change that widens a payload as a design decision, not an implementation detail.

`docs/event-taxonomy.md` is the writers' contract: every `ActivityEvent.kind` is a **span** (`_start`/`_end`), a **switch** (`_switched`/`_activated`), or a **completion** (past-tense). Kinds are an open set that accretes per surface — never centralize them into an enum. `durationMs` appears only when the writer observed the interval's start; never fabricate it across a restart or pause.

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

That layer once carried a load-bearing invariant enforced by a type rather than
at runtime: **a tide (ambient observation) may arm a `gate`; it may never arm a
`cooldown`.** `AmbientRule.primitives` was `Exclude<PrimitiveSpec, CooldownSpec>`,
so an imposed lock could not be constructed. That restriction was reversed on
2026-08-21 (below), and the type that held it was deleted the same day.

- **2026-08-21** — the extension gained an **armed cache**
  (`apps/browser/modules/interventions/`), the browser end of slice E of
  `kairos/docs/superpowers/specs/2026-08-18-the-garden-absorbs-keel-design.md`.
  The app decides what is armed and pushes the record; the extension decides
  when it fires and actuates from local storage, so nothing in the hot path
  makes a round trip. Deliveries are **completions in `logs`**
  (`intervention_shown`, `intervention_dismissed`,
  `intervention_clicked_through`) — there is no `interventions/` collection,
  because one fact with two homes is the drift that project exists to remove.

  That slice also **reverses the restricted category above** on the armed path:
  a rule may arm any primitive, and what protects the person is invariant 6 —
  every armed thing carries an exit. `parseArmed` refuses an entry with no
  reachable exit, and the popup renders the exit of everything in force. The
  `AmbientRule` type that encoded the old restriction was deleted with
  `packages/domain` on 2026-08-21, so the two paths no longer disagree.

## kairos — the shared kernel

keel is one instrument of **kairos**, not a standalone product. Some state is
owned by the kernel, not by keel, and is read from `$KAIROS_HOME` (default
`~/.kairos`).

Since 2026-08-07 keel's own files live **inside** that vault, at
`$KAIROS_HOME/keel/` (log, config, state, area-map) — one directory to
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
- **fences** — `~/.kairos/fences.json`, the rules currently in force, written by
  zenborg and read here. **Migration step 5, 2026-08-21: this is the only rule
  store.** `$KAIROS_HOME/keel/rules/*.json` was the second one and is retired;
  `store.mjs` no longer opens that directory, and a `RuleSpec` still sitting
  there does nothing. Re-declare it through zenborg (`set_host_block`,
  `set_browser_gate`, `seed_host_blocks`) — nothing here adopts it, because a
  reader that adopted files it found would be a second writer.
- **the active moment** — `~/.kairos/activeMoment.json`, a pointer (`{momentId, at}`)
  to the moment that IS the current intention, resolved against `moments.json`.
  Set in zenborg (MCP or the UI), read by the agent surface; keel never writes it.
  It is honoured only while the moment it names sits on the current waking-day, so
  it retires itself at the 04:00 roll. This replaced keel's own watch-scoped
  intention strings on 2026-08-07 — see
  `docs/superpowers/specs/2026-08-07-active-moment-intention-design.md`.

`docs/superpowers/specs/2026-08-06-helm-design.md` is the current statement of
how keel's parts (heading, tide, helm, gate) compose inside kairos.
