# LinkedIn Cooldown Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-page overlay to LinkedIn that enforces cooldowns triggered from the popup.

**Architecture:** A single content script watches `domainCooldown("linkedin.com")` for changes. When a cooldown is active, it shows a fixed full-page overlay with countdown and a "Leave LinkedIn" button. Follows the exact same pattern as the YouTube cooldown content script.

**Tech Stack:** WXT content scripts, `wxt/storage`, vanilla DOM

---

### Task 1: Create the content script

**Files:**
- Create: `apps/browser/entrypoints/linkedin-cooldown.content/index.ts`

**Step 1: Create the content script**

```ts
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
  overlay.className = "equanimi-li-cooldown-overlay";

  const content = document.createElement("div");
  content.className = "equanimi-li-cooldown-content";

  const label = document.createElement("span");
  label.className = "equanimi-li-cooldown-label";
  label.textContent = "Take a break from LinkedIn.";

  overlayTimerEl = document.createElement("span");
  overlayTimerEl.className = "equanimi-li-cooldown-timer";
  overlayTimerEl.textContent = formatTime(cooldownRemaining);

  const leave = document.createElement("button");
  leave.className = "equanimi-li-cooldown-leave";
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
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/browser/entrypoints/linkedin-cooldown.content/index.ts
git commit -m "feat(cooldown): add LinkedIn cooldown content script"
```

---

### Task 2: Create the overlay CSS

**Files:**
- Create: `apps/browser/entrypoints/linkedin-cooldown.content/style.css`

**Step 1: Create the stylesheet**

Follow the YouTube cooldown CSS pattern but use `position: fixed` and full viewport
coverage instead of targeting a specific player element.

```css
/* ── LinkedIn Cooldown Overlay ───────────────────────────── */

.equanimi-li-cooldown-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(8px);
  animation: equanimi-li-fade-in 0.3s ease;
}

@keyframes equanimi-li-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.equanimi-li-cooldown-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px;
}

.equanimi-li-cooldown-label {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 22px;
  font-weight: 600;
  color: #e2e8f0;
}

.equanimi-li-cooldown-timer {
  font-family: "SF Mono", "Fira Code", "Consolas", monospace;
  font-size: 36px;
  font-weight: 700;
  color: #c084fc;
  letter-spacing: 1px;
}

.equanimi-li-cooldown-leave {
  margin-top: 4px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  color: #f87171;
  background: none;
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 6px;
  cursor: pointer;
  padding: 6px 16px;
  transition: all 0.2s ease;
}

.equanimi-li-cooldown-leave:hover {
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.5);
  color: #fca5a5;
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/browser/entrypoints/linkedin-cooldown.content/style.css
git commit -m "feat(cooldown): add LinkedIn cooldown overlay styles"
```

---

### Task 3: Manual verification

**Step 1: Build and test**

Run: `pnpm build:browser`
Expected: PASS — verify `linkedin-cooldown.js` and `linkedin-cooldown.css` appear in `.output/chrome-mv3/content-scripts/`

**Step 2: Manual test**

1. Load extension, navigate to linkedin.com
2. Open popup, start a 5-minute cooldown
3. Verify full-page overlay appears with countdown
4. Verify "Leave LinkedIn" navigates to google.com
5. Navigate back to LinkedIn — overlay should still be active (persisted)
6. Wait for cooldown to expire — overlay should disappear
