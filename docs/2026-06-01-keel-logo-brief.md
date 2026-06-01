# keel logo brief — sage, in the equanimitech family

**Date:** 2026-06-01
**Purpose:** Generate keel's mark "very similar" to the equanimi.tech logo, recolored to keel's **sage ensō** accent. Pairs with the [design-system alignment spec](superpowers/specs/2026-06-01-keel-design-system-alignment.md).

## Where the family mark comes from

equanimi.tech's logo is a **hand-authored stroke SVG** (`site/public/favicon.svg`) — there was no generation prompt. Its design DNA:

- `viewBox="0 0 32 32"`, `fill="none"`, `stroke="currentColor"`, `stroke-width≈3.6`, `stroke-linecap="round"`
- **Two calligraphic strokes**: a smooth wave (`∿`) over a horizontal bar
- **Single warm accent**, light/dark aware via a `prefers-color-scheme` block (`#b07a3a` light, `#d4944a` dark)
- Minimal, zen, one gesture — reads at 16 px

## The prompt (for a generator / designer)

> A minimal, single-stroke logo mark, 32×32 viewBox, calligraphic and zen. One continuous brush gesture — an **open ensō ring** (a circle with a small gap, drawn as if in one breath) — rendered as a rounded-cap stroke, weight ≈3.4, no fill, no background. Quiet, hand-drawn imperfection over geometric precision (wabi-sabi). Color: a muted **sage green** (`#7E9377`), brightening to `#93A88B` in dark mode. Nothing else in the frame. The same restraint and stroke language as a thin wave-over-a-line mark, but the gesture is a single ensō.

Swap the motif line if you prefer a different keel identity:

- **ensō ring** (recommended — spec identity): "an open circle drawn in one brush stroke, small gap at the top-right."
- **keel + waterline**: "a long horizontal stroke (the keel) with a single calm wave riding above it" — closest to equanimi's own wave-over-bar.
- **integral spine** (your earlier ask): "one elongated integral ∫ as a single vertical brush stroke."

## Color spec (sage, matches `@keel/ui` tokens)

| | light | dark |
| --- | --- | --- |
| stroke | `#7E9377` (≈ `oklch(0.66 0.045 145)`) | `#93A88B` (≈ `oklch(0.72 0.05 145)`) |

In-app, prefer `stroke="currentColor"` and set `color: var(--primary)` so the mark tracks the live theme token. For standalone files (favicon, toolbar PNG), bake the hex + a `prefers-color-scheme` block exactly like equanimi's favicon.

## Ready-to-use starting SVG (ensō, family stroke language)

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"
     stroke="currentColor" stroke-width="3.4" stroke-linecap="round">
  <style>
    :root { color: #7E9377; }
    @media (prefers-color-scheme: dark) { :root { color: #93A88B; } }
  </style>
  <!-- open ensō: ~310° arc, gap at upper-right, slight brush taper -->
  <path d="M21.5 7.2
           C 26.5 9.6, 28 15.5, 25.2 20.5
           C 22.4 25.5, 16 27.5, 10.8 25
           C 5.6 22.5, 3.8 16, 6.8 11
           C 9 7.3, 13.5 5.4, 18 6.2" />
</svg>
```

Tune the arc/gap and add a subtle brush taper (vary `stroke-width` along the path, or overlay a second shorter stroke) to get the hand-drawn ensō feel rather than a plain open circle.

## Asset checklist (once the mark is final)

- `apps/browser/public/keel-mark.svg` (currentColor, light/dark) — in-app inline use
- `apps/browser/public/icons/icon-{16,32,48,128}.png` — baked sage on transparent (`rsvg-convert -w N`)
- `apps/desktop/src-tauri/icons/*` — regenerate the Tauri/iOS set from the master
- `site` favicon stays equanimi's; keel's mark is keel-owned
