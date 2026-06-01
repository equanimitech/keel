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
  if (active) {
    return;
  }
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
  if (!active) {
    return;
  }
  active = false;
  removeStain();
}

// ── DOM ──────────────────────────────────────────────────────────

function createStain(): void {
  stainEl = document.createElement("div");
  stainEl.className = "keel-watch-stain";
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
  if (!stainEl) {
    return;
  }

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
    `  rgba(0, 0, 0, ${(alpha * 0.975).toFixed(3)}) 25%,`,
    `  rgba(0, 0, 0, ${(alpha * 0.95).toFixed(3)}) 50%,`,
    `  rgba(0, 0, 0, ${(alpha * 0.925).toFixed(3)}) 75%,`,
    `  transparent 100%)`,
  ].join(" ");
}

// ── Math helpers ─────────────────────────────────────────────────

function stainProgress(seconds: number): number {
  if (seconds < tunnelMinSeconds) {
    return 0;
  }
  const elapsed = seconds - tunnelMinSeconds;
  return 1 - Math.exp(-elapsed / tau);
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}
