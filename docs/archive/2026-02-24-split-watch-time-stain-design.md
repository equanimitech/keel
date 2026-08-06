# Split YouTube Watch Time from Stain

**Date:** 2026-02-24

## Goal

Separate the YouTube stain (dark blob overlay) from the watch time counter into its own signal with an independent content script. The stain reads the shared `daily-seconds` store from watch time but otherwise operates independently.

## Design Decisions

- **2-way split:** counter vs stain (not 3-way, not module-only)
- **Shared data:** stain reads watch time's `daily-seconds` store — no message passing
- **Tunnel config lives with stain:** min/max minutes belong to the stain signal
- **No storage migration:** old tunnel keys under `youtube-watch-time` namespace are abandoned; stain uses fresh keys under its own namespace
- **Fixed counter styling:** the counter no longer scales font/opacity with time — simple fixed appearance
- **Aggressive gradient:** stain stays dark throughout (alpha * 0.75 at 75% radius), only fading at the very edge

## New Signal: `youtube-stain`

### Definition (`modules/signals/youtube-stain/definition.ts`)

```ts
export const youtubeStain: SignalDefinition = {
  id: "youtube-stain",
  name: "Watch Stain",
  description: "Dark ink blot that grows over the video as watch time accumulates",
  domain: "youtube.com",
  icon: "🫠",
  mechanism: "self-monitoring",
  defaultEnabled: true,
};
```

### Content Script (`entrypoints/youtube-stain.content/`)

Owns:
- Tunnel config stores (`tunnel-min-minutes`, `tunnel-max-minutes`) under `youtube-stain` namespace
- Blob position randomization, player container detection, `waitForPlayer`
- `stainProgress()` and `lerp()` helpers
- Reads `daily-seconds` from watch time's storage key via `signalSetting`
- Watches storage changes to update reactively

Gradient (aggressive, stays dark):
```
radial-gradient(circle,
  rgba(0,0,0, alpha)        0%,
  rgba(0,0,0, alpha * 0.95) 25%,
  rgba(0,0,0, alpha * 0.85) 50%,
  rgba(0,0,0, alpha * 0.75) 75%,
  transparent               100%)
```

### Style (`entrypoints/youtube-stain.content/style.css`)

The `.equanimi-watch-stain` CSS moves here from watch-time's stylesheet.

## Trimmed Watch Time

### Content Script (`entrypoints/youtube-watch-time.content/`)

Removes:
- All stain/blob code, constants, elements
- Tunnel config stores and `deriveTau`
- `stainEnabledStore`
- `stainProgress()`
- `PLAYER_SELECTOR` / `findPlayerContainer`

Keeps:
- Video playback tracking, daily seconds accumulator, persistence
- Counter overlay rendering and position picker
- Fullscreen re-parenting of counter

Counter gets fixed styling (no time-based scaling).

## Manage Page Updates

- Stain settings (tunnel min/max) appear under the new `youtube-stain` signal entry
- Watch time settings panel keeps only the position picker
- Remove `stainEnabledStore` toggle from watch time settings (the stain signal's own enabled toggle replaces it)
