# keel Design System Alignment — Design

> **⊛ Reconciled with the umbrella** (`2026-06-01-keel-strategy.md`, canonical). How this fits the capabilities × surfaces model:
>
> * **`@keel/ui`** **is the presentation shared core** — surface-agnostic, consumed by the browser/desktop/(future app) columns. It sits beside the **logic shared core** (`@keel/domain`: friction model, drivers, observation substrate). Two faces of one core; both surface-agnostic, both inward of the surface columns.
>
> * **The "tokens-only" content-overlay tier == the browser Drogue-capability renderers** (cooldown, stain, feed-hide). So the drag scale's notches (`dim`/`delay`/`block`) render *through* `@keel/ui` tokens — this spec governs how the `FrictionRenderer` adapters *look*; the strategy governs what they *do*.
>
> * **Coordinate the popup→React conversion here with the popup toggle-removal** in `strategic-friction` Part IV (same files — do them as one move, not twice).
>
> * Naming is already `@keel/*` (post-rename) — consistent. Theme is per-surface (no sync), consistent with the umbrella's separate-storage reality.

**Date:** 2026-06-01
**Status:** Approved design, pre-plan
**Surfaces:** `apps/desktop` (Tauri), `apps/browser` (WXT), new `packages/ui`

## Goal

Bring keel's UI/UX onto the same design system as its sibling apps **zenborg** and **secretariat** — shadcn/ui + Tailwind v4 + oklch tokens, light + dark — while keeping keel's ensō identity as the accent. One coherent org family; keel still has its own face.

## Non-goals

* Redesigning *behavior* or information architecture. This is a visual/system alignment, not a UX re-think of what the shields or sessions do.

* Migrating content overlays to shadow-DOM isolation (deferred; see Risks).

* Cross-surface theme **sync** (desktop and extension are separate processes with separate storage; each remembers its own theme).

* Touching `packages/domain` (stays pure types, no styling).

## Decisions (locked during brainstorming)

| # | Decision                 | Choice                                                                                                                                             |
| - | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Identity under alignment | **Stone base + ensō (sage) accent.** Neutral stone surfaces/text like the siblings; keel's `primary`/`accent` = sage green; charcoal for emphasis. |
| 2 | Depth of adoption        | **Full shadcn rebuild** of every surface that can safely host it.                                                                                  |
| 3 | Surface scope            | **Both** desktop and browser extension.                                                                                                            |
| 4 | Dark mode                | **Full light + dark parity**, system-preference aware.                                                                                             |
| 5 | Where the system lives   | **New** **`@keel/ui`** **workspace package** as the single source of truth.                                                                        |
| 6 | Architecture given WXT   | **Tiered.** shadcn for app pages; token-aligned vanilla for injected overlays.                                                                     |

## Architecture

`@keel/ui` exposes **two independently consumable layers**:

### Layer ① `@keel/ui/tokens.css` — framework-free

Pure CSS custom properties. No JS, no React. The palette, radii, and font variables.

* Scoped to a **`[data-keel-theme]`** **root selector**, *not* `:root`. This is the critical WXT affordance: a content script injects keel UI into a host page (YouTube, LinkedIn) where `:root` and `html.dark` belong to the host. Scoping tokens to a keel-owned container lets the overlay carry keel's theme regardless of the host page's own light/dark state.

* Provides both themes: `[data-keel-theme="light"]` and `[data-keel-theme="dark"]`, plus a `system` resolver applied by each surface.

* Importable **anywhere** — extension pages, desktop, and raw content scripts alike.

### Layer ② `@keel/ui` (components) — React + shadcn/radix/lucide

Hand-maintained shadcn/ui component library mirroring **zenborg's exact stack**: `@radix-ui/*`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`. Exports **source TSX** (not pre-built); each consuming app's Tailwind v4 scans it via `@source "../../packages/ui/src"` so utilities are generated in the app's own build.

> Note: shadcn components are normally generated *into* an app by its CLI. Here we hand-maintain them in `@keel/ui` as a library — the same pattern zenborg already uses in its own `src`. This is deliberate and supported; it just means we own the component source.

### Three consumer tiers

| Tier            | Surfaces                                              | Consumes | Notes                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Full**        | Desktop (Tauri panel, preferences, overlays)          | ① + ②    | Already React 19 + Vite + `motion`. Direct import.                                                                                                                                                |
| **Full**        | Extension pages: popup, manage                        | ① + ②    | Convert to **React entrypoints** (`@wxt-dev/module-react`). Isolated extension pages → radix portals to `document.body` are safe.                                                                 |
| **Tokens only** | \~15 content overlays (cooldowns, stains, feed-hides) | ①        | Stay **vanilla DOM + CSS**. Restyle existing `style.css` against the token variables. Each overlay roots its DOM under a `[data-keel-theme]` container and sets keel's own theme. No React/radix. |

## Token system

Base neutral ramp is **stone** (warm grey), lifted directly from zenborg/secretariat so the family reads as one. keel's differentiator is the **sage** primary/accent ramp derived from the existing `--color-enso-green: #8B9D83`, plus charcoal (`#2D3436`) and cream (`#E8DCC4`) as ensō signature accents.

### shadcn token mapping (light)

```
--background        oklch(1 0 0)              /* stone-white */
--foreground        oklch(0.147 0.004 49.25)  /* stone-950 ink */
--card / --popover  oklch(1 0 0)
--muted             oklch(0.97 0.001 106.424) /* stone-100 */
--muted-foreground  oklch(0.553 0.013 58.071) /* stone-500 */
--border / --input  oklch(0.923 0.003 48.717) /* stone-200 */

/* ensō accent — sage as primary */
--primary             oklch(0.66 0.045 145)   /* ~#8B9D83 sage */
--primary-foreground  oklch(0.985 0.001 106)  /* near-white */
--accent              oklch(0.95 0.02 145)    /* sage tint surface */
--accent-foreground   oklch(0.30 0.03 150)    /* deep sage */
--ring                oklch(0.66 0.045 145)   /* sage focus ring */
--destructive         oklch(0.577 0.245 27.325)
--radius              0.625rem
```

`.dark` (i.e. `[data-keel-theme="dark"]`) flips surfaces to the stone-900/950 set (zenborg's dark block) and **brightens sage** for contrast (`--primary ≈ oklch(0.72 0.05 145)`, lighter ring), matching how zenborg brightens its focus colors in dark mode. Exact oklch values tuned during implementation against WCAG AA on text/surface pairs.

A full sage ramp (`sage-50…900`) and charcoal/cream tints are authored as named variables for component variants (hover, active, subtle backgrounds), then mapped into the shadcn semantic tokens above.

### Typography & radii

* **Fonts:** adopt **Geist Sans + Geist Mono** (zenborg's choice), bundled as woff2 in the package, `--font-sans`/`--font-mono`. System stack fallback. Content overlays apply keel fonts **only inside** their own `[data-keel-theme]` container so the host page is untouched.

* **Radii:** zenborg/secretariat scale — `--radius: 0.625rem` with `-sm/-md/-lg/-xl` derivations in `@theme inline`.

## Component inventory & surface mapping

shadcn primitives to author in `@keel/ui` (driven by what the surfaces actually need):

`Button`, `Dialog`, `Select`, `Tabs`, `Switch`, `Tooltip`, `Card`, `Input`, `Label`, `Slider`, `DropdownMenu`, `Badge`, `Separator`, `ScrollArea`.

Surface → component map:

* **Desktop preferences pane** → `Tabs`, `Switch`, `Select`, `Slider`, `Input`, `Card`, `Button`.

* **Desktop panel (idle/active)** → `Button`, `Card`, `Badge`. **Custom, kept:** the ensō tray button (`BigRedButton`, image-based) and the circular session timer (`react-circular-progressbar`) — no shadcn equivalent; restyled to sage tokens.

* **Desktop overlays** (capture modal, stain, timer widget, waypoint) → `Dialog`/`Card` where they're keel-owned windows.

* **Ext popup** → `Card`, `Switch` (per-shield toggles), `Button`, `Badge` (cooldown state), `Separator`.

* **Ext manage page** → `Tabs`, `Switch`, `Select`, `Input`, `Card`.

* **Content overlays** → **no shadcn**; vanilla DOM restyled to token vars (cooldown overlay, countdown badge, stain, hidden-element placeholders).

## Theming mechanism (per surface)

No shared runtime exists between surfaces, so theme preference is **per-surface**, default = `system`.

* **Desktop:** theme stored via existing `@tauri-apps/plugin-store`; a small `ThemeProvider` sets `data-keel-theme` on the root and listens to `prefers-color-scheme` for `system`.

* **Ext popup / manage:** theme stored in `chrome.storage` (alongside existing shield/signal stores in `utils/storage`); same `ThemeProvider` pattern on each page root.

* **Content overlays:** read keel's stored theme from `chrome.storage`; set `data-keel-theme` on the overlay container. Overlays deliberately **do not** follow the host page's dark/light — they carry keel's own.

## WXT-specific concerns (the constraint that shaped this)

1. **Popup & manage become React.** Add `@wxt-dev/module-react`, `react`, `react-dom` to `apps/browser`. Replace `entrypoints/popup/main.ts` + `index.html` body with a React mount; same for `manage`. Shield/signal registry logic is reused unchanged — only the render layer changes.
2. **Tailwind v4 in the extension.** Each React entrypoint gets a CSS entry that `@import "tailwindcss"`, imports `@keel/ui/tokens.css`, and `@source`-scans `@keel/ui` + local entrypoints. WXT/Vite bundles per-entrypoint, so popup and manage each get their own scoped stylesheet — no global leakage.
3. **Content scripts stay lean.** They import **only** `@keel/ui/tokens.css` (compiled to a plain stylesheet) plus their own `style.css`. No Tailwind utility scan needed there — they use the token *variables* directly. This keeps injected payload small and avoids shipping React into host pages.
4. **radix portals.** Safe in popup/manage (own document). **Forbidden** in content scripts — enforced by simply not using radix there.
5. **oklch** is supported in all Chromium/Firefox versions the extension targets; no fallback needed.
6. **Stable extension identity** (manifest `key`, `chrome.storage`) is untouched — this is a render-layer change only.

## Build & workspace wiring

* New package `packages/ui` → `@keel/ui`, `"type": "module"`, exports map: `"."` → `src/index.ts` (components), `"./tokens.css"` → `src/tokens.css`.

* Peer deps: `react`, `react-dom`. Direct deps: `@radix-ui/*`, `lucide-react`, `cva`, `clsx`, `tailwind-merge`.

* `apps/desktop` and `apps/browser` add `"@keel/ui": "workspace:*"`.

* Root `pnpm build` / `pnpm typecheck` extended to include the package.

* Dependency direction stays inward-clean: `domain` (types) ← `ui` (presentation) ← apps. `ui` never imports `domain` runtime logic beyond types if needed.

## Migration sequence (phased; keep the live ext working)

The browser extension is **deployed and in daily use** (loaded unpacked in Brave). Desktop is dormant. Sequence protects the live surface:

1. **Scaffold** **`@keel/ui`**: package, `tokens.css` (light+dark, sage+stone), Geist fonts, build wiring. No consumers yet.
2. **Author core shadcn components** + a Storybook-less visual smoke (a dev route rendering each component in both themes).
3. **Desktop adoption** (dormant, lowest risk): swap `App.css` enso theme → `@keel/ui/tokens.css`; rebuild preferences + panel on shadcn; restyle custom ensō button + timer; add `ThemeProvider`.
4. **Ext popup → React + shadcn**, behind a parallel build; verify all shields/signals/cooldown still function before replacing.
5. **Ext manage → React + shadcn.**
6. **Content overlays**: restyle each `style.css` against token vars; root under `[data-keel-theme]`; wire theme read.
7. **Cleanup**: delete `--color-enso-*` ad-hoc theme block and dead CSS.

## Testing & verification

* **Typecheck/build:** `pnpm typecheck` + `pnpm build` green across all three packages.

* **Extension functional smoke:** load unpacked, confirm every shield/signal toggles, cooldown starts from popup and overlays render, manage page edits persist (`chrome.storage` intact).

* **Theme matrix:** each surface rendered in light, dark, and system; content overlay shown over a **dark** YouTube page and a **light** LinkedIn page to confirm keel carries its own theme.

* **Visual parity check:** side-by-side keel popup vs zenborg — same stone/radii/typography family, sage where zenborg is neutral.

* **No host-page bleed:** confirm content-overlay CSS does not alter host page styles outside keel's container.

## Risks & open questions

* **Hand-maintained shadcn library** drifts from upstream shadcn. Mitigation: pin component versions to zenborg's; document the source-of-truth.

* **Tailwind v4 cross-package** **`@source`** **scanning** must be verified early in both bundlers (Vite-for-Tauri and WXT/Vite) — a known sharp edge. De-risk in Phase 1.

* **Content overlay isolation** without shadow DOM means host CSS *can* still leak *into* keel's overlay. Accepted for now (status quo); shadow-DOM hardening is a deferred follow-up spec.

* **Geist font payload** in the extension adds \~100–200 KB. Acceptable; subset if needed.

* **Open:** do desktop and extension ever need a shared theme preference? Currently no shared backend — left per-surface. Revisit if a keel account/sync layer appears.

