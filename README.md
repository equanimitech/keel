# keel

**See where your attention goes — and steer it from compulsion toward flourishing.**

keel makes your attention visible: where your time goes, how your focus fragments — privately, on your own device. That awareness is the first step; gentle steering toward what helps you flourish comes later, built on your own baselines. A pnpm monorepo: capabilities × surfaces over one shared domain.

## Surfaces

keel is named by a capability × surface grammar — one core, many edges:

- **keel agent** (`apps/agent`) — a Claude Code surface: a focus gate + activity-log writer. Ships as a Claude Code plugin.
- **keel browser** (`apps/browser`) — a Chrome extension (WXT): an activity writer (coarse events) + watchlist-gated per-domain sensors (key-action completions) + the blocklist drogue, a commitment device.
- **keel tray** (`apps/tray`) — a macOS menubar app (Tauri, no windows): the desktop activity-log writer. Ships as "keel".

## Shared domain (`packages/domain`)

Pure TypeScript: the `ActivityEvent` log substrate, the read-side derivations built on it (bouts and runs, the tide, areas, routes), the `RuleSpec` primitives the friction layer executes, and the event-taxonomy contract the surfaces write against. No runtime dependencies, no fp-ts, no framework — types and pure functions only.

## kairos

keel is one instrument of **kairos**, not a standalone product: keel reads what your attention *did*, zenborg holds what you *meant*. Some state belongs to the kernel rather than to keel — **areas** are defined in zenborg and read from `~/.kairos/areas.json` (override with `KAIROS_HOME`). keel never writes them. `docs/superpowers/specs/2026-08-06-helm-design.md` describes how the pieces compose.

## What changed

The shield / signal / budget **intervention** layer was retired on 2026-06-12 (see `docs/decisions/`), and keel became observability-first: accumulate raw attention signal, model later. The blocklist drogue — a commitment device — was the retirement's lone survivor.

Interventions came back on 2026-08-05, rebuilt on that accumulated signal, as the **friction interpreter** (`apps/browser/modules/friction/`). Rules are data (`RuleSpec`, see `docs/primitive-contracts.md`), the dwell gate is the one actuator, and everything is scoped by area. The invariant that makes it safe is a type, not a runtime check: ambient observation may arm a *gate*, never a *cooldown* — locks are self-invoked only.

The frozen macOS compass app (`apps/desktop`) was removed on 2026-06-13 — archived at tag `desktop-archive-2026-06-13`, with its reusable domain gems (drift detection, the BCT/PDP intervention model) mapped in `docs/decisions/`. Docs describing the retired shield layer live in `docs/archive/`.

## Architecture

Dependencies flow inward: **Domain → Application → Infrastructure → UI.** The shared domain stays pure — no fp-ts, no framework. The agent surface is standalone `// @ts-check` JS (no TS imports — it deploys on its own).

## Privacy posture (load-bearing)

Everything stays on your machine. Payloads carry **domains and timings, never full URLs or page content.** Browser events live in extension-local IndexedDB until you export them; desktop/tray events write to `~/.keel/log/`.

## Structure

```
keel/
├── apps/
│   ├── agent/     # Claude Code plugin — focus gate + activity-log writer
│   ├── browser/   # Chrome extension (WXT) — activity writer + sensors + drogue
│   └── tray/      # macOS menubar activity-log writer (Tauri)
├── packages/
│   ├── domain/       # ActivityEvent substrate + event-taxonomy contract (@keel/domain)
│   ├── ui/           # Shared design system — tokens + shadcn/ui (@keel/ui)
│   └── keel-alfred/  # Alfred workflow — global launcher for the ritual system
└── package.json      # Workspace scripts
```

## Getting started

```bash
pnpm install

pnpm dev:browser     # WXT dev server (browser extension)
pnpm dev:tray        # tauri dev (menubar logger)

pnpm typecheck       # typecheck all packages
pnpm build           # build all packages
```

### Loading the browser extension

After `pnpm build:browser`, open `chrome://extensions`, enable Developer mode, and load unpacked from `apps/browser/.output/chrome-mv3/`.

### Seeding the watchlist

`node apps/agent/keel.mjs watchlist scan` reads your browser history, ranks the domains/routes you return to compulsively, and (after you adjudicate) seeds the observe tier — the domains the browser deep-senses.

## Why "keel"

A keel is a boat's backbone — the deep fin that gives a vessel stability and holds its course against wind and current. It's also a near-homophone of *equanimity* (Pāli *upekkhā*): the steady, balanced awareness that doesn't capsize in rough conditions.

The vocabulary is nautical throughout, and it isn't decoration — it *is* the model:

- **keel** — what keeps your attention steady and on course.
- **drift** — being pulled off your intended course by the platforms' engineered currents.
- **drogue** — a sea-anchor that slows a vessel in a storm; here, the blocklist that slows compulsive momentum.

Platforms have removed the natural stopping cues and industrialized craving, aversion, and delusion at scale. keel doesn't block the sea — it gives you a keel to cross it. First it helps you **see** where you drift; the gentle steering toward what helps you flourish comes later, on your terms.

## License

MIT
