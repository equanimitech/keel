# @keel/ui

keel's shared **presentation core** — the visual sibling of `@keel/domain` (logic core). Surface-agnostic; consumed by the browser extension, desktop app, and any future surface. keel follows the **equanimi.tech site** aesthetic: warm **stone** neutrals + a single muted **clay/ochre** accent, **Inter**, soft radius, light + dark. (This supersedes the sage-ensō palette in the [alignment spec](../../docs/superpowers/specs/2026-06-01-keel-design-system-alignment.md) — kept for the architecture, not the colors.)

## Two independently consumable layers

### ① `@keel/ui/tokens.css` — framework-free

Pure CSS custom properties. No JS, no React. Scoped to **`[data-keel-theme]`** (light/dark), **not** `:root` — so a content script can inject keel UI into a host page (YouTube, LinkedIn) and carry keel's own theme regardless of the host's light/dark.

```css
@import "@keel/ui/tokens.css";
```

Set the theme on a keel-owned root element:

```html
<div data-keel-theme="dark"> … keel UI … </div>
```

### ② `@keel/ui` — React + shadcn components

Hand-maintained shadcn/ui component library (radix + lucide + cva). Exported as **source TSX**; each consuming app's Tailwind v4 scans it via `@source` so utilities build in the app.

```ts
import { cn /*, Button, Card, Switch, … */ } from "@keel/ui";
```

Tailwind apps also import the theme mapping:

```css
@import "tailwindcss";
@import "@keel/ui/tokens.css";
@import "@keel/ui/theme.css";
@source "../../../packages/ui/src";
```

## Consumer tiers

| Tier | Surfaces | Consumes |
| --- | --- | --- |
| **Full** | Desktop; ext popup + manage (React) | ① + ② |
| **Tokens only** | ~15 content overlays (cooldown, stain, feed-hide) | ① |

## Notes

- **Fonts:** **Inter**, self-hosted as variable woff2 via `@keel/ui/fonts.css` (CSP-safe, no external requests) — matches the equanimi.tech site.
- **Clay** ramp (`oklch(0.62 0.10 60)` ≈ `#b07a3a`, brightening to `#d4944a` in dark) is keel's single accent. Sage/Geist were tried per the spec and rejected — do not reintroduce.
