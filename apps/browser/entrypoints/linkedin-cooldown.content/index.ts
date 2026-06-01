/**
 * LinkedIn Cooldown Mode
 *
 * Domain-level cooldown for LinkedIn. When active:
 *  - Shows a full-page overlay with "Take a break" message + countdown
 *  - "Leave LinkedIn" button navigates away
 *
 * Cooldown is started from the popup. Overlay only appears when
 * cooldown is active.
 *
 * Cooldown state is shared with the popup via domainCooldown("linkedin.com").
 *
 * This is NOT a shield — it's always available. Cooldown is a mode, not
 * an intervention.
 */

import { domainCooldown } from "@/utils/storage";
import "./style.css";

// ── Storage ──────────────────────────────────────────────────

const cooldownUntilStore = domainCooldown("linkedin.com");

// ── State ────────────────────────────────────────────────────

let cooldownRemaining = 0;
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

let overlay: HTMLElement | null = null;
let overlayTimerEl: HTMLElement | null = null;

// ── Content Script Entry ─────────────────────────────────────

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
  runAt: "document_idle",

  async main() {
    await resumePersistedCooldown();

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
    if (until) {
      await cooldownUntilStore.setValue(0);
    }
    return;
  }

  cooldownRemaining = Math.ceil((until - Date.now()) / 1000);
  applyCooldownUI();
}

function applyCooldownUI(): void {
  insertOverlay();

  cooldownTimer = setInterval(async () => {
    const until = await cooldownUntilStore.getValue();
    if (!until || until <= Date.now()) {
      clearCooldown(true);
      return;
    }
    cooldownRemaining = Math.ceil((until - Date.now()) / 1000);
    updateOverlay();
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

  removeOverlay();
}

// ── Full-Page Overlay ────────────────────────────────────────

function insertOverlay(): void {
  if (overlay) {
    return;
  }

  overlay = document.createElement("div");
  overlay.className = "keel-li-cooldown-overlay";

  const content = document.createElement("div");
  content.className = "keel-li-cooldown-content";

  const label = document.createElement("span");
  label.className = "keel-li-cooldown-label";
  label.textContent = "Take a break from LinkedIn.";

  overlayTimerEl = document.createElement("span");
  overlayTimerEl.className = "keel-li-cooldown-timer";
  overlayTimerEl.textContent = formatTime(cooldownRemaining);

  const leave = document.createElement("button");
  leave.className = "keel-li-cooldown-leave";
  leave.textContent = "Leave LinkedIn";
  leave.addEventListener("click", (e) => {
    e.stopPropagation();
    window.location.href = "https://www.google.com";
  });

  content.appendChild(label);
  content.appendChild(overlayTimerEl);
  content.appendChild(leave);
  overlay.appendChild(content);

  document.body.appendChild(overlay);
}

function removeOverlay(): void {
  overlay?.remove();
  overlay = null;
  overlayTimerEl = null;
}

function updateOverlay(): void {
  if (overlayTimerEl) {
    overlayTimerEl.textContent = formatTime(cooldownRemaining);
  }
}

// ── Helpers ──────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (seconds <= 0) {
    return "0s";
  }

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts: string[] = [];
  if (d > 0) { parts.push(`${d}d`); }
  if (h > 0) { parts.push(`${h}h`); }
  if (m > 0) { parts.push(`${m}m`); }
  if (s > 0 || parts.length === 0) { parts.push(`${s}s`); }
  return parts.join(" ");
}
