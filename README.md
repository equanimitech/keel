# keel

**Attentive technology — observe first.**

A pnpm monorepo: capabilities × surfaces over one shared domain. keel logs the raw signal of your attention — locally, privately — so awareness can be built on real data. The gentle interruption comes later, measured against your own baselines.

## Surfaces

keel is named by a capability × surface grammar — one core, many edges:

- **keel agent** (`apps/agent`) — a Claude Code surface: a focus gate + activity-log writer. Ships as a Claude Code plugin.
- **keel browser** (`apps/browser`) — a Chrome extension (WXT): an activity writer (coarse events) + watchlist-gated per-domain sensors (key-action completions) + the blocklist drogue, a commitment device.
- **keel desktop** (`apps/desktop`) — a macOS attention compass (Tauri + React). Frozen — demoted under the observability-first roadmap.
- **keel tray** (`apps/tray`) — a macOS menubar app (Tauri, no windows): the desktop activity-log writer. Ships as "keel".

## Shared domain (`packages/domain`)

Pure TypeScript: the `ActivityEvent` log substrate, immutable value objects, and the event-taxonomy contract the surfaces write against. No runtime dependencies, no fp-ts, no framework — types and pure functions only.

## What changed

The shield / signal / budget **intervention** layer was retired on 2026-06-12 (see `docs/decisions/`). keel is now **observability-first**: it accumulates raw attention signal now; interventions return as a separate module (P5) built on personal baselines. The blocklist drogue — a commitment device — is the retirement's lone survivor.

## Architecture

Dependencies flow inward: **Domain → Application → Infrastructure → UI.** fp-ts is isolated to `apps/desktop`; the shared domain never depends on it. The agent surface is standalone `// @ts-check` JS (no TS imports — it deploys on its own).

## Privacy posture (load-bearing)

Everything stays on your machine. Payloads carry **domains and timings, never full URLs or page content.** Browser events live in extension-local IndexedDB until you export them; desktop/tray events write to `~/.keel/log/`.

## Structure

```
keel/
├── apps/
│   ├── agent/     # Claude Code plugin — focus gate + activity-log writer
│   ├── browser/   # Chrome extension (WXT) — activity writer + sensors + drogue
│   ├── desktop/   # macOS attention compass (Tauri + React) — frozen
│   └── tray/      # macOS menubar activity-log writer (Tauri)
├── packages/
│   ├── domain/    # ActivityEvent substrate + event-taxonomy contract (@keel/domain)
│   └── ui/        # Shared design system — tokens + shadcn/ui (@keel/ui)
└── package.json   # Workspace scripts
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

## Philosophy

Platforms have removed the natural stopping cues and industrialized craving, aversion, and delusion at scale. keel is named for the keel of a boat — and for equanimity (*upekkha*), the balanced awareness that steadies a course through them. First it helps you **see** the pattern in your own data; the gentle interruption comes later, on your terms.

## License

MIT
