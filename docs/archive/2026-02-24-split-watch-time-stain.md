# Split YouTube Watch Time from Stain — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate the YouTube stain overlay into its own signal (`youtube-stain`) with an independent content script, reading shared `daily-seconds` from the watch time store.

**Architecture:** Two independent WXT content scripts on `youtube.com` — one for the counter (watch time), one for the blob (stain). They share data through `chrome.storage` via the `signalSetting` helper. The stain owns its tunnel configuration; the counter uses fixed styling.

**Tech Stack:** WXT, TypeScript, chrome.storage (via `wxt/storage`)

**Design doc:** `docs/plans/2026-02-24-split-watch-time-stain-design.md`

---

### Task 1: Create youtube-stain signal definition

**Files:**
- Create: `apps/browser/modules/signals/youtube-stain/definition.ts`

**Step 1: Create the definition file**

```ts
import type { SignalDefinition } from "../types";

export const youtubeStain: SignalDefinition = {
  id: "youtube-stain",
  name: "Watch Stain",
  description: "Dark ink blot that grows over the video as watch time accumulates",
  domain: "youtube.com",
  icon: "\uD83E\uDEE0",
  mechanism: "self-monitoring",
  defaultEnabled: true,
};
```

**Step 2: Register in signal registry**

- Modify: `apps/browser/modules/signals/registry.ts`

Add import and include `youtubeStain` in the `signals` array:

```ts
import { youtubeStain } from "./youtube-stain/definition";
// ...
export const signals: readonly SignalDefinition[] = [
  youtubeWatchTime,
  youtubeStain,
] as const;
```

**Step 3: Typecheck**

Run: `pnpm --filter browser exec tsc --noEmit`
Expected: PASS (no errors)

**Step 4: Commit**

```bash
git add apps/browser/modules/signals/youtube-stain/definition.ts apps/browser/modules/signals/registry.ts
git commit -m "feat(signals): add youtube-stain signal definition"
```

---

### Task 2: Create youtube-stain content script

**Files:**
- Create: `apps/browser/entrypoints/youtube-stain.content/index.ts`
- Create: `apps/browser/entrypoints/youtube-stain.content/style.css`

**Step 1: Create style.css**

Move the stain CSS from watch-time. This is the blob overlay only (not the counter):

```css
/*
 * Equanimi — Watch Stain Signal (CSS layer)
 *
 * Blob overlay inside #movie_player.
 * Size and background are computed continuously in JS.
 */

/* Lives inside #movie_player. Positioned randomly by JS.         */
/* width + padding-bottom trick keeps it circular regardless of   */
/* player aspect ratio. Height must be 0 (padding creates it).    */
/* z-index 25: above video, below YouTube controls (~30–60).      */
.equanimi-watch-stain {
  position: absolute;
  z-index: 25;
  height: 0;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
  transition: width 1s ease, padding-bottom 1s ease, background 1s ease,
    opacity 0.5s ease;
}
```

**Step 2: Create index.ts**

The stain content script reads `daily-seconds` from watch time's storage, owns tunnel config, and renders the blob:

```ts
import { signalEnabled, signalSetting } from "@/utils/storage";
import { youtubeStain } from "@/modules/signals/youtube-stain/definition";
import { youtubeWatchTime } from "@/modules/signals/youtube-watch-time/definition";
import "./style.css";

/**
 * Content script: Watch Stain Signal
 *
 * A dark ink blot that grows over the YouTube video player as daily
 * watch time accumulates. Reads the shared daily-seconds counter
 * from the watch-time signal's storage.
 *
 * - Appears after a configurable minimum watch time.
 * - Grows asymptotically toward ~95% intensity at max minutes.
 * - Position is random per page load.
 * - Never fully covers the player. Compass, not cage.
 */

const enabled = signalEnabled(youtubeStain.id, youtubeStain.defaultEnabled);

// ── Tunnel time range ────────────────────────────────────────────
//
// The stain is invisible before `minMinutes` of watch time,
// then grows asymptotically toward ~95% intensity at `maxMinutes`.
//
// τ is derived: τ = (max − min) × 60 / −ln(0.05)
//   so the curve reaches ~95% right at maxMinutes.

const tunnelMinStore = signalSetting<number>(
  youtubeStain.id,
  "tunnel-min-minutes",
  5,
);
const tunnelMaxStore = signalSetting<number>(
  youtubeStain.id,
  "tunnel-max-minutes",
  60,
);

// ── Read watch-time's daily seconds (shared store) ───────────────

const dailySecondsStore = signalSetting<number>(
  youtubeWatchTime.id,
  "daily-seconds",
  0,
);

// ── Tunnel math ──────────────────────────────────────────────────

const NEAR_MAX = -Math.log(0.05); // ≈ 2.996
let tunnelMinSeconds = 5 * 60;
let tunnelMaxSeconds = 60 * 60;
let tau = (tunnelMaxSeconds - tunnelMinSeconds) / NEAR_MAX;

function deriveTau(minMin: number, maxMin: number): void {
  tunnelMinSeconds = minMin * 60;
  tunnelMaxSeconds = Math.max(minMin + 1, maxMin) * 60;
  tau = (tunnelMaxSeconds - tunnelMinSeconds) / NEAR_MAX;
}

// ── Blob constants ───────────────────────────────────────────────

const BLOB_SIZE_MIN = 3;
const BLOB_SIZE_MAX = 70;
const BLOB_ALPHA_MIN = 0.6;
const BLOB_ALPHA_MAX = 0.99;

let blobX = 50;
let blobY = 50;

function randomizeBlobPosition(): void {
  blobX = 20 + Math.random() * 60;
  blobY = 20 + Math.random() * 60;
}

// ── Player container ─────────────────────────────────────────────

const PLAYER_SELECTOR = "#movie_player";

function findPlayerContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(PLAYER_SELECTOR);
}

// ── Content script entry ─────────────────────────────────────────

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    if (isEnabled) {
      await activate();
    }

    enabled.watch(async (newValue) => {
      if (newValue) {
        await activate();
      } else {
        deactivate();
      }
    });
  },
});

// ── State ────────────────────────────────────────────────────────

let active = false;
let dailySeconds = 0;
let stainEl: HTMLElement | null = null;

// ── Lifecycle ────────────────────────────────────────────────────

async function activate(): Promise<void> {
  if (active) return;
  active = true;

  const minMin = await tunnelMinStore.getValue();
  const maxMin = await tunnelMaxStore.getValue();
  deriveTau(minMin, maxMin);

  tunnelMinStore.watch(async (newMin) => {
    deriveTau(newMin, await tunnelMaxStore.getValue());
    updateStain();
  });
  tunnelMaxStore.watch(async (newMax) => {
    deriveTau(await tunnelMinStore.getValue(), newMax);
    updateStain();
  });

  dailySeconds = await dailySecondsStore.getValue();

  // React to watch-time counter changes (updated every ~10s by the other script).
  dailySecondsStore.watch((newSeconds) => {
    dailySeconds = newSeconds;
    updateStain();
  });

  randomizeBlobPosition();
  createStain();
  updateStain();
}

function deactivate(): void {
  if (!active) return;
  active = false;
  removeStain();
}

// ── DOM ──────────────────────────────────────────────────────────

function createStain(): void {
  stainEl = document.createElement("div");
  stainEl.className = "equanimi-watch-stain";
  stainEl.style.left = `${blobX}%`;
  stainEl.style.top = `${blobY}%`;

  const player = findPlayerContainer();
  if (player) {
    player.appendChild(stainEl);
  } else {
    document.body.appendChild(stainEl);
    waitForPlayer();
  }
}

function waitForPlayer(): void {
  const observer = new MutationObserver(() => {
    const player = findPlayerContainer();
    if (player && stainEl) {
      player.appendChild(stainEl);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function removeStain(): void {
  stainEl?.remove();
  stainEl = null;
}

// ── Stain rendering ──────────────────────────────────────────────

function updateStain(): void {
  if (!stainEl) return;

  const t = stainProgress(dailySeconds);

  if (t <= 0) {
    stainEl.style.width = "0";
    stainEl.style.paddingBottom = "0";
    stainEl.style.opacity = "0";
    return;
  }

  const size = lerp(BLOB_SIZE_MIN, BLOB_SIZE_MAX, t);
  const alpha = lerp(BLOB_ALPHA_MIN, BLOB_ALPHA_MAX, t);

  stainEl.style.width = `${size.toFixed(1)}%`;
  stainEl.style.paddingBottom = `${size.toFixed(1)}%`;
  stainEl.style.opacity = "1";
  stainEl.style.background = [
    `radial-gradient(circle,`,
    `  rgba(0, 0, 0, ${alpha.toFixed(3)}) 0%,`,
    `  rgba(0, 0, 0, ${(alpha * 0.95).toFixed(3)}) 25%,`,
    `  rgba(0, 0, 0, ${(alpha * 0.85).toFixed(3)}) 50%,`,
    `  rgba(0, 0, 0, ${(alpha * 0.75).toFixed(3)}) 75%,`,
    `  transparent 100%)`,
  ].join(" ");
}

// ── Math helpers ─────────────────────────────────────────────────

function stainProgress(seconds: number): number {
  if (seconds < tunnelMinSeconds) return 0;
  const elapsed = seconds - tunnelMinSeconds;
  return 1 - Math.exp(-elapsed / tau);
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}
```

**Step 3: Typecheck**

Run: `pnpm --filter browser exec tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/browser/entrypoints/youtube-stain.content/
git commit -m "feat(signals): add youtube-stain content script with improved gradient"
```

---

### Task 3: Trim watch-time content script

**Files:**
- Modify: `apps/browser/entrypoints/youtube-watch-time.content/index.ts`
- Modify: `apps/browser/entrypoints/youtube-watch-time.content/style.css`

**Step 1: Remove stain CSS from style.css**

Remove the entire `.equanimi-watch-stain` block (lines 40–54) from `style.css`. Keep only the counter styles.

**Step 2: Rewrite index.ts**

Remove all stain-related code. The trimmed file keeps: video tracking, daily seconds, counter overlay, position, fullscreen. Counter uses fixed styling.

```ts
import { signalEnabled, signalSetting } from "@/utils/storage";
import { youtubeWatchTime } from "@/modules/signals/youtube-watch-time/definition";
import "./style.css";

/**
 * Content script: Watch Time Signal
 *
 * A self-monitoring signal that accumulates daily YouTube playback time.
 *
 * - Only counts seconds when a <video> element is actively playing.
 * - Persists accumulated seconds in extension storage (survives navigation).
 * - Uses MutationObserver to track videos across YouTube's SPA navigation.
 * - Resets at the start of each calendar day.
 * - Shows a timer counter (configurable corner position).
 */

const CSS_CLASS = `equanimi-${youtubeWatchTime.id}-active`;
const enabled = signalEnabled(
  youtubeWatchTime.id,
  youtubeWatchTime.defaultEnabled,
);

export type WatchTimePosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

const positionStore = signalSetting<WatchTimePosition>(
  youtubeWatchTime.id,
  "position",
  "bottom-right",
);

// ── Persisted daily accumulator ───────────────────────────────────
const dailySecondsStore = signalSetting<number>(
  youtubeWatchTime.id,
  "daily-seconds",
  0,
);
const dailyDateStore = signalSetting<string>(
  youtubeWatchTime.id,
  "daily-date",
  "",
);

const SAVE_INTERVAL = 10;

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    if (isEnabled) {
      await activate();
    }

    enabled.watch(async (newValue) => {
      if (newValue) {
        await activate();
      } else {
        deactivate();
      }
    });

    positionStore.watch((newPosition) => {
      if (counterEl) {
        counterEl.dataset.position = newPosition;
      }
    });
  },
});

// ── State ─────────────────────────────────────────────────────────

let active = false;
let dailySeconds = 0;
let videoPlaying = false;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let counterEl: HTMLElement | null = null;
let videoObserver: MutationObserver | null = null;
const trackedVideos = new WeakSet<HTMLVideoElement>();

// ── Lifecycle ─────────────────────────────────────────────────────

async function activate(): Promise<void> {
  if (active) return;
  active = true;

  const today = todayDateString();
  const storedDate = await dailyDateStore.getValue();

  if (storedDate === today) {
    dailySeconds = await dailySecondsStore.getValue();
  } else {
    dailySeconds = 0;
    await dailyDateStore.setValue(today);
    await dailySecondsStore.setValue(0);
  }

  document.documentElement.classList.add(CSS_CLASS);
  await createOverlay();
  updateDisplay();
  watchVideos();
  tickInterval = setInterval(tick, 1000);

  document.addEventListener("visibilitychange", handleVisibility);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  window.addEventListener("beforeunload", persistNow);
}

function deactivate(): void {
  if (!active) return;
  active = false;

  dailySecondsStore.setValue(dailySeconds);

  document.documentElement.classList.remove(CSS_CLASS);
  removeOverlay();
  unwatchVideos();

  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }

  document.removeEventListener("visibilitychange", handleVisibility);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  window.removeEventListener("beforeunload", persistNow);
}

// ── Video playback tracking ───────────────────────────────────────

function watchVideos(): void {
  for (const video of document.querySelectorAll("video")) {
    attachVideoListeners(video as HTMLVideoElement);
  }

  videoObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLVideoElement) {
          attachVideoListeners(node);
        }
        if (node instanceof HTMLElement) {
          for (const video of node.querySelectorAll("video")) {
            attachVideoListeners(video as HTMLVideoElement);
          }
        }
      }
    }
  });
  videoObserver.observe(document.body, { childList: true, subtree: true });
}

function unwatchVideos(): void {
  videoObserver?.disconnect();
  videoObserver = null;
  videoPlaying = false;
}

function attachVideoListeners(video: HTMLVideoElement): void {
  if (trackedVideos.has(video)) return;
  trackedVideos.add(video);

  const updateState = () => {
    videoPlaying = Array.from(document.querySelectorAll("video")).some(
      (v) => !v.paused && !v.ended,
    );
  };

  video.addEventListener("play", updateState);
  video.addEventListener("pause", updateState);
  video.addEventListener("ended", updateState);
  updateState();
}

// ── DOM ───────────────────────────────────────────────────────────

async function createOverlay(): Promise<void> {
  const position = await positionStore.getValue();

  counterEl = document.createElement("div");
  counterEl.className = "equanimi-watch-counter";
  counterEl.textContent = "0:00";
  counterEl.dataset.position = position;
  document.body.appendChild(counterEl);
}

function removeOverlay(): void {
  counterEl?.remove();
  counterEl = null;
}

// ── Timer tick ────────────────────────────────────────────────────

function tick(): void {
  if (!counterEl) return;

  if (!document.hidden && videoPlaying) {
    dailySeconds++;

    if (dailySeconds % SAVE_INTERVAL === 0) {
      dailySecondsStore.setValue(dailySeconds);
    }
  }

  updateDisplay();
}

function updateDisplay(): void {
  if (!counterEl) return;

  const hours = Math.floor(dailySeconds / 3600);
  const minutes = Math.floor((dailySeconds % 3600) / 60);
  const seconds = dailySeconds % 60;

  counterEl.textContent =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ── Fullscreen support ────────────────────────────────────────────

function handleFullscreenChange(): void {
  if (!counterEl) return;

  if (document.fullscreenElement) {
    document.fullscreenElement.appendChild(counterEl);
  } else {
    document.body.appendChild(counterEl);
  }
}

// ── Visibility / persistence ──────────────────────────────────────

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

function persistNow(): void {
  dailySecondsStore.setValue(dailySeconds);
}

// ── Helpers ───────────────────────────────────────────────────────

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```

**Step 3: Typecheck**

Run: `pnpm --filter browser exec tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/browser/entrypoints/youtube-watch-time.content/
git commit -m "refactor(signals): remove stain code from watch-time content script"
```

---

### Task 4: Update manage page

**Files:**
- Modify: `apps/browser/entrypoints/manage/main.ts`

**Step 1: Update storage stores**

Replace the watch-time stain/tunnel stores with stain-namespaced ones. Remove `stainEnabledStore`. Keep `watchTimePositionStore` as-is.

At the top of the watch-time settings section, change:

```ts
// Remove these:
const tunnelMinStore = signalSetting<number>("youtube-watch-time", "tunnel-min-minutes", 5);
const tunnelMaxStore = signalSetting<number>("youtube-watch-time", "tunnel-max-minutes", 60);
const stainEnabledStore = signalSetting<boolean>("youtube-watch-time", "stain-enabled", true);

// Add these:
const tunnelMinStore = signalSetting<number>("youtube-stain", "tunnel-min-minutes", 5);
const tunnelMaxStore = signalSetting<number>("youtube-stain", "tunnel-max-minutes", 60);
```

**Step 2: Move stain settings to youtube-stain intervention**

In the `renderDomainGroup` function, change the settings panel condition from `intervention.id === "youtube-watch-time"` to split into two blocks:

1. **`youtube-watch-time`** keeps only the position picker (remove stain toggle and tunnel time range rows).
2. **`youtube-stain`** gets a new settings panel with the tunnel time range only (no separate stain toggle — the signal's own toggle handles enable/disable).

For the watch-time block (lines 291–398), trim to just:

```ts
if (intervention.id === "youtube-watch-time") {
  const settingsPanel = document.createElement("div");
  settingsPanel.className = "settings-panel";

  const store = intervention.getStore();
  store.getValue().then((v) => settingsPanel.classList.toggle("hidden", !v));
  toggle.input.addEventListener("change", () => {
    settingsPanel.classList.toggle("hidden", !toggle.input.checked);
  });
  store.watch((v) => settingsPanel.classList.toggle("hidden", !v));

  // ── Position picker ───────────────────────────────────────
  const posRow = document.createElement("div");
  posRow.className = "settings-row";

  const posLabel = document.createElement("span");
  posLabel.className = "settings-label";
  posLabel.textContent = "Timer position";

  const posGroup = document.createElement("div");
  posGroup.className = "position-picker";

  const currentPosition = await watchTimePositionStore.getValue();

  for (const pos of POSITIONS) {
    const btn = document.createElement("button");
    btn.className = `pos-btn${pos.value === currentPosition ? " active" : ""}`;
    btn.textContent = pos.label;
    btn.title = pos.value;
    btn.addEventListener("click", async () => {
      await watchTimePositionStore.setValue(pos.value);
      posGroup.querySelectorAll(".pos-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
    posGroup.appendChild(btn);
  }

  posRow.appendChild(posLabel);
  posRow.appendChild(posGroup);
  settingsPanel.appendChild(posRow);
  body.appendChild(settingsPanel);
}
```

Add a new block for stain:

```ts
if (intervention.id === "youtube-stain") {
  const settingsPanel = document.createElement("div");
  settingsPanel.className = "settings-panel";

  const store = intervention.getStore();
  store.getValue().then((v) => settingsPanel.classList.toggle("hidden", !v));
  toggle.input.addEventListener("change", () => {
    settingsPanel.classList.toggle("hidden", !toggle.input.checked);
  });
  store.watch((v) => settingsPanel.classList.toggle("hidden", !v));

  // ── Tunnel time range ─────────────────────────────────────
  const timeRow = document.createElement("div");
  timeRow.className = "settings-row";

  const timeLabel = document.createElement("span");
  timeLabel.className = "settings-label";
  timeLabel.textContent = "Stain range (min)";

  const timeGroup = document.createElement("div");
  timeGroup.className = "time-range-picker";

  const currentMin = await tunnelMinStore.getValue();
  const currentMax = await tunnelMaxStore.getValue();

  const minInput = createNumberInput("stain-starts-at", "Starts at", currentMin);
  const maxInput = createNumberInput("stain-full-at", "Full at", currentMax);

  minInput.input.addEventListener(
    "input",
    debounce(async () => {
      const val = Math.max(0, parseInt(minInput.input.value, 10) || 0);
      await tunnelMinStore.setValue(val);
    }, 400),
  );

  maxInput.input.addEventListener(
    "input",
    debounce(async () => {
      const val = Math.max(1, parseInt(maxInput.input.value, 10) || 1);
      await tunnelMaxStore.setValue(val);
    }, 400),
  );

  timeGroup.appendChild(minInput.wrapper);
  timeGroup.appendChild(maxInput.wrapper);
  timeRow.appendChild(timeLabel);
  timeRow.appendChild(timeGroup);
  settingsPanel.appendChild(timeRow);
  body.appendChild(settingsPanel);
}
```

**Step 3: Typecheck**

Run: `pnpm --filter browser exec tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/browser/entrypoints/manage/main.ts
git commit -m "refactor(manage): split stain settings into youtube-stain signal entry"
```

---

### Task 5: Final typecheck and cleanup

**Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages

**Step 2: Verify no stale references**

Search for old storage keys that should no longer exist in the codebase:

```bash
grep -r "youtube-watch-time.*stain-enabled" apps/browser/
grep -r "youtube-watch-time.*tunnel-min" apps/browser/
grep -r "youtube-watch-time.*tunnel-max" apps/browser/
```

Expected: No matches (all moved to `youtube-stain` namespace or removed).

**Step 3: Commit design and plan docs**

```bash
git add docs/plans/2026-02-24-split-watch-time-stain-design.md docs/plans/2026-02-24-split-watch-time-stain.md
git commit -m "docs: add design and plan for watch-time/stain split"
```
