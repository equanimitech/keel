# YouTube Watch Time: Cross-Tab Fix, Stain Toggle, Darker Stain

**Date**: 2026-02-23
**Status**: Approved

## Problem

1. **Cross-tab accumulation bug**: Each tab maintains its own `dailySeconds` in-memory counter loaded once on activation. When multiple tabs are open, the last tab to save overwrites the others' progress — a last-writer-wins race condition. Reloading a tab also reads a stale snapshot.

2. **Stain not independently toggleable**: The stain (growing dark blob) is tied to the watch time counter's enabled toggle. Users should be able to enable/disable each independently.

3. **Stain not dark enough**: Max core opacity is 0.92; should be closer to fully opaque.

## Solution

### 1. Cross-Tab Sync Fix

The `document.hidden` check already prevents simultaneous counting across tabs. The only gap is the **stale read** when switching back to a tab. Fix: re-read storage on visibility change to visible, take the higher value.

```ts
async function handleVisibility(): Promise<void> {
  if (document.hidden) {
    dailySecondsStore.setValue(dailySeconds);
  } else {
    const stored = await dailySecondsStore.getValue();
    if (stored > dailySeconds) {
      dailySeconds = stored;
      updateDisplay();
    }
  }
}
```

One function change, one file.

### 2. Separate Stain Toggle

- New storage key: `local:signal:youtube-watch-time:stain-enabled` (default: `true`)
- Counter lifecycle follows `enabled`; stain lifecycle follows `stainEnabled`
- `stainEnabledStore.watch()` creates/removes stain element live
- Manage page: stain gets its own top-level toggle card

### 3. Darker Stain

Bump `BLOB_ALPHA_MAX` from `0.92` to `0.96`.

## Files Changed

- `apps/browser/entrypoints/youtube-watch-time.content/index.ts` — all three changes
- `apps/browser/entrypoints/manage/` — new stain toggle card (if manage page exists for signals)
