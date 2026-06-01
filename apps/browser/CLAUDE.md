# keel Browser - Development Guide

**A Chrome extension providing attention shields using WXT (WebExtension Toolkit)**

Part of the [keel monorepo](../../CLAUDE.md). Run from root with `pnpm dev:browser` or locally with `pnpm dev`.

---

## Shared Domain

Types from `@keel/domain` provide canonical intervention classification, behavioral mechanisms, budget dimensions, and trigger conditions. Browser-specific runtime logic (shield definitions, signal definitions, content script behavior) stays in this app.

---

## Architecture

```
apps/browser/
├── entrypoints/                    # WXT entrypoints (content scripts + UI)
│   ├── background.ts               # Service worker — badge state, messaging
│   ├── popup/                       # Extension popup UI
│   ├── manage/                      # Full-page settings UI
│   ├── youtube-shorts.content/      # Content script per shield
│   ├── youtube-cooldown.content/
│   └── ...
├── modules/                         # Domain logic registries
│   ├── shields/                     # Shield definitions + registry
│   │   ├── types.ts                 # ShieldDefinition interface
│   │   ├── registry.ts              # All shields exported
│   │   └── <name>/definition.ts     # Individual shield config
│   ├── signals/                     # Signal definitions
│   │   ├── types.ts                 # SignalDefinition interface
│   │   ├── registry.ts
│   │   └── <name>/definition.ts
│   └── budgets/                     # Budget types (re-exported from @keel/domain)
│       └── types.ts
├── utils/                           # Shared utilities (storage helpers)
└── public/                          # Static assets (icons, manifest)
```

Each shield has two parts:
1. **Definition** in `modules/shields/<name>/definition.ts` — metadata, toggle key, default state
2. **Content script** in `entrypoints/<name>.content/` — runtime behavior injected into pages

---

## Adding a New Shield

1. Create `modules/shields/<name>/definition.ts` exporting a `ShieldDefinition`
2. Register it in `modules/shields/registry.ts`
3. Create `entrypoints/<name>.content/index.ts` with the content script logic
4. Add `entrypoints/<name>.content/style.css` for injected styles
5. The content script reads its enabled state from `chrome.storage` via the definition's storage key

---

## Adding a New Signal

1. Create `modules/signals/<name>/definition.ts` exporting a `SignalDefinition`
2. Register it in `modules/signals/registry.ts`
3. Create a corresponding content script entrypoint if the signal needs page injection

---

## Commands

```bash
# Development (from monorepo root)
pnpm dev:browser

# Development (from apps/browser/)
pnpm dev

# Production build
pnpm build

# Type check (from monorepo root)
pnpm typecheck
```

---

## Key Conventions

- Storage keys follow pattern: `shield:<name>:enabled`, `signal:<name>:enabled`
- Content scripts use `defineContentScript()` from WXT
- Each content script targets specific URL patterns via `matches`
- Shields modify the DOM; signals observe and report
- All module types reference `BehavioralMechanism` from `@keel/domain`

---

- Never run the development. I'll run it myself.
