/**
 * YouTube Cooldown Mode
 *
 * Domain-level cooldown for YouTube. When active:
 *  - Pauses any playing video
 *  - Overlays #movie_player with a "Take a break" message + countdown
 *  - Re-pauses if user tries to play during cooldown
 *  - Shows a small countdown badge (bottom-right, above the watch-time counter)
 *
 * Cooldown is started from the popup. No FAB needed here — the overlay
 * and badge only appear when cooldown is active.
 *
 * Cooldown state is shared with the popup via domainCooldown("youtube.com").
 *
 * This is NOT a shield — it's always available. Cooldown is a mode, not
 * an intervention.
 */

import { domainCooldown } from "@/utils/storage";
import "./style.css";

// ── Storage ──────────────────────────────────────────────────

const cooldownUntilStore = domainCooldown("youtube.com");

// ── Constants ────────────────────────────────────────────────

const PLAYER_SELECTOR = "#movie_player";

// ── State ────────────────────────────────────────────────────

let cooldownRemaining = 0;
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

let overlay: HTMLElement | null = null;
let overlayTimerEl: HTMLElement | null = null;

let badge: HTMLElement | null = null;
let badgeTimerEl: HTMLElement | null = null;

let videoObserver: MutationObserver | null = null;

// ── Content Script Entry ─────────────────────────────────────

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",

  async main() {
    await resumePersistedCooldown();

    // Watch for cooldown changes from popup or other sources
    cooldownUntilStore.watch(async (until) => {
      if (until && until > Date.now()) {
        const remaining = Math.ceil((until - Date.now()) / 1000);
        if (cooldownRemaining <= 0) {
          cooldownRemaining = remaining;
          applyCooldownUI();
        }
      } else if (cooldownRemaining > 0) {
        clearCooldown(false);
      }
    });
  },
});

// ── Cooldown Logic ───────────────────────────────────────────

async function resumePersistedCooldown(): Promise<void> {
  const until = await cooldownUntilStore.getValue();
  if (!until || until <= Date.now()) {
    if (until) await cooldownUntilStore.setValue(0);
    return;
  }

  cooldownRemaining = Math.ceil((until - Date.now()) / 1000);
  applyCooldownUI();
}

function applyCooldownUI(): void {
  pauseAllVideos();
  startVideoEnforcement();
  insertPlayerOverlay();
  showBadge();

  cooldownTimer = setInterval(async () => {
    const until = await cooldownUntilStore.getValue();
    if (!until || until <= Date.now()) {
      clearCooldown(true);
      return;
    }
    cooldownRemaining = Math.ceil((until - Date.now()) / 1000);
    pauseAllVideos();
    updateOverlay();
    updateBadge();
  }, 1000);
}

async function clearCooldown(clearStorage: boolean): Promise<void> {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  cooldownRemaining = 0;

  if (clearStorage) {
    await cooldownUntilStore.setValue(0);
  }

  clearCooldownUI();
}

function clearCooldownUI(): void {
  removePlayerOverlay();
  hideBadge();
  stopVideoEnforcement();
}

// ── Video Pause Enforcement ──────────────────────────────────

function pauseAllVideos(): void {
  for (const video of document.querySelectorAll("video")) {
    if (!video.paused) {
      video.pause();
    }
  }
}

function startVideoEnforcement(): void {
  if (videoObserver) return;

  // Pause any video that starts playing during cooldown
  const onPlay = (e: Event) => {
    if (cooldownRemaining > 0 && e.target instanceof HTMLVideoElement) {
      e.target.pause();
    }
  };

  document.addEventListener("play", onPlay, true);

  // Also watch for new video elements (SPA navigation)
  videoObserver = new MutationObserver((mutations) => {
    if (cooldownRemaining <= 0) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLVideoElement) {
          node.pause();
        }
        if (node instanceof HTMLElement) {
          for (const video of node.querySelectorAll("video")) {
            (video as HTMLVideoElement).pause();
          }
        }
      }
    }

    // Re-apply overlay if player appeared after SPA navigation
    if (!overlay) {
      insertPlayerOverlay();
    }
  });

  videoObserver.observe(document.body, { childList: true, subtree: true });

  // Store cleanup reference
  (videoObserver as any).__playHandler = onPlay;
}

function stopVideoEnforcement(): void {
  if (videoObserver) {
    const handler = (videoObserver as any).__playHandler;
    if (handler) {
      document.removeEventListener("play", handler, true);
    }
    videoObserver.disconnect();
    videoObserver = null;
  }
}

// ── Player Overlay ───────────────────────────────────────────

function findPlayerContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(PLAYER_SELECTOR);
}

function insertPlayerOverlay(): void {
  if (overlay) return;

  const player = findPlayerContainer();
  if (!player) return;

  overlay = document.createElement("div");
  overlay.className = "equanimi-yt-cooldown-overlay";

  const content = document.createElement("div");
  content.className = "equanimi-yt-cooldown-content";

  const label = document.createElement("span");
  label.className = "equanimi-yt-cooldown-label";
  label.textContent = "Take a break.";

  overlayTimerEl = document.createElement("span");
  overlayTimerEl.className = "equanimi-yt-cooldown-timer";
  overlayTimerEl.textContent = formatTime(cooldownRemaining);

  const leave = document.createElement("button");
  leave.className = "equanimi-yt-cooldown-leave";
  leave.textContent = "Leave YouTube";
  leave.addEventListener("click", (e) => {
    e.stopPropagation();
    // Navigate away but keep cooldown active — it should persist
    window.location.href = "https://www.google.com";
  });

  content.appendChild(label);
  content.appendChild(overlayTimerEl);
  content.appendChild(leave);
  overlay.appendChild(content);

  player.appendChild(overlay);
}

function removePlayerOverlay(): void {
  overlay?.remove();
  overlay = null;
  overlayTimerEl = null;
}

function updateOverlay(): void {
  if (overlayTimerEl) {
    overlayTimerEl.textContent = formatTime(cooldownRemaining);
  }
}

// ── Cooldown Badge (small pill, only visible during cooldown) ─

function showBadge(): void {
  if (badge) return;

  badge = document.createElement("div");
  badge.className = "equanimi-yt-cooldown-badge";

  const icon = document.createElement("span");
  icon.className = "equanimi-yt-cooldown-badge-icon";
  icon.textContent = "\u23F8"; // ⏸

  badgeTimerEl = document.createElement("span");
  badgeTimerEl.className = "equanimi-yt-cooldown-badge-timer";
  badgeTimerEl.textContent = formatTime(cooldownRemaining);

  badge.appendChild(icon);
  badge.appendChild(badgeTimerEl);
  document.body.appendChild(badge);
}

function hideBadge(): void {
  badge?.remove();
  badge = null;
  badgeTimerEl = null;
}

function updateBadge(): void {
  if (badgeTimerEl) {
    badgeTimerEl.textContent = formatTime(cooldownRemaining);
  }
}

// ── Helpers ───────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (d > 0) {
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
