# keel

**Attentive technology for the distracted age.**

A monorepo with two surfaces — a browser extension and a desktop app — sharing a common domain model grounded in behavioral science.

## What it does

Digital platforms have removed every natural stopping cue. keel puts them back.

- **Browser extension** (`apps/browser`): Shields that block compulsive UI patterns (Shorts scrolling, sidebar recommendations, post-game rematch loops) and signals that surface hidden information (watch time).
- **Desktop app** (`apps/desktop`): An attention compass for macOS. Declare an intention, start a focus session, and the app detects drift — gently guiding you back without judgment.
- **Shared domain** (`packages/domain`): Pure TypeScript types encoding behavioral science (BCT Taxonomy, Persuasive Design Principles) that both surfaces share.

## Structure

```
equanimi/
├── apps/
│   ├── browser/          # Chrome extension (WXT)
│   └── desktop/          # macOS app (Tauri + React)
├── packages/
│   └── domain/           # Shared domain types (@keel/domain)
├── package.json          # Workspace scripts
└── pnpm-workspace.yaml
```

## Getting started

```bash
# Install dependencies
pnpm install

# Develop browser extension (opens WXT dev server)
pnpm dev:browser

# Develop desktop app (opens Vite dev server)
pnpm dev:desktop

# Typecheck everything
pnpm typecheck

# Build everything
pnpm build
```

### Loading the browser extension

After `pnpm build:browser`, go to `chrome://extensions`, enable Developer mode, and load unpacked from `apps/browser/.output/chrome-mv3/`.

### Running the desktop app

The desktop app requires the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust toolchain, Xcode CLT on macOS). Then:

```bash
cd apps/desktop
pnpm tauri dev
```

## Philosophy

Platforms have industrialized craving, aversion, and delusion at global scale. keel is named after equanimity (*upekkha*) — the balanced awareness that interrupts compulsive cycles.

We don't block the internet. We put gaps back where platforms removed them.

## License

MIT
