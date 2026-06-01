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

const CSS_CLASS = `keel-${youtubeWatchTime.id}-active`;
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

// ── Counter intensity curve ───────────────────────────────────────
//
// The counter grows in size, opacity, and weight as watch time
// accumulates. Uses the same asymptotic curve as the stain:
// invisible growth before 5 min, ~95% intensity at 60 min.

const COUNTER_MIN_SECONDS = 5 * 60;
const COUNTER_MAX_SECONDS = 60 * 60;
const NEAR_MAX = -Math.log(0.05); // ≈ 2.996
const COUNTER_TAU = (COUNTER_MAX_SECONDS - COUNTER_MIN_SECONDS) / NEAR_MAX;

const COUNTER_FONT_MIN = 13;
const COUNTER_FONT_MAX = 18;

function timeProgress(seconds: number): number {
  if (seconds < COUNTER_MIN_SECONDS) return 0;
  const elapsed = seconds - COUNTER_MIN_SECONDS;
  return 1 - Math.exp(-elapsed / COUNTER_TAU);
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

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
  counterEl.className = "keel-watch-counter";
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

  // ── Counter text ────────────────────────────────────────────
  const hours = Math.floor(dailySeconds / 3600);
  const minutes = Math.floor((dailySeconds % 3600) / 60);
  const seconds = dailySeconds % 60;

  counterEl.textContent =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;

  // ── Counter styling — grows with time ─────────────────────
  const t = timeProgress(dailySeconds);
  const fontSize = lerp(COUNTER_FONT_MIN, COUNTER_FONT_MAX, t);
  const textAlpha = lerp(0.55, 1.0, t);
  const bgAlpha = lerp(0.3, 0.55, t);

  counterEl.style.fontSize = `${fontSize.toFixed(1)}px`;
  counterEl.style.color = `rgba(255, 255, 255, ${textAlpha.toFixed(2)})`;
  counterEl.style.background = `rgba(0, 0, 0, ${bgAlpha.toFixed(2)})`;
  counterEl.style.padding = "6px 12px";
  counterEl.style.borderRadius = "8px";
  counterEl.style.fontWeight = t > 0.5 ? "600" : "400";
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
