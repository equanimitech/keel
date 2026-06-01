/**
 * Chess.com Post-Game Cooldown Shield
 *
 * After a game ends, dims "New Game" / "Rematch" / "Start Game" buttons
 * and shows a cooldown bar below them. Breaks the "one more game" loop.
 *
 * Also provides a floating button (FAB) to manually start a cooldown
 * for a chosen duration. Cooldown state persists across page reloads
 * via a stored end-timestamp.
 */

import { shieldEnabled, shieldSetting, domainCooldown } from "@/utils/storage";
import { chessPostGameCooldown } from "@/modules/shields/chess-post-game-cooldown/definition";
import "./style.css";

// ── Storage ──────────────────────────────────────────────────

const enabled = shieldEnabled(
  chessPostGameCooldown.id,
  chessPostGameCooldown.defaultEnabled
);

export const cooldownSecondsStore = shieldSetting<number>(
  chessPostGameCooldown.id,
  "cooldown-seconds",
  30
);

export const escalateOnLossStore = shieldSetting<boolean>(
  chessPostGameCooldown.id,
  "escalate-on-loss",
  true
);

/**
 * Generic domain-level cooldown. Shared with the popup and any other
 * content script on chess.com. Stores Unix-ms end timestamp.
 */
const cooldownUntilStore = domainCooldown("chess.com");

// ── Constants ────────────────────────────────────────────────

const CSS_CLASS = `keel-${chessPostGameCooldown.id}-active`;

/** Action buttons to disable during cooldown (by data-cy). */
const ACTION_BUTTON_SELECTORS = [
  // Post-game modal & sidebar
  '[data-cy="game-over-modal-new-game-button"]',
  '[data-cy="game-over-modal-rematch-button"]',
  '[data-cy="sidebar-game-over-new-game-button"]',
  '[data-cy="sidebar-game-over-rematch-button"]',
  // Home page play buttons
  '[data-cy="play-button"]',
  '[data-cy="quick-link-button"]',
  'a[href="/play/online"]',
  'a[href="/play/computer"]',
  'a[href="/live"]',
  // /play/online page
  '[data-cy="new-game-index-play"]',
  '.new-game-index-button',
  '.time-selector-button-button',
  '.selector-button-button',
  '.game-type-selector-component button',
];

/** URL patterns for pages where the primary action should be blocked. */
const BLOCKED_PATH_RE = /\/(puzzles?|daily|play|live)/i;

/** Possible board / play container selectors, tried in order. */
const BOARD_CONTAINER_SELECTORS = [
  "#board-layout-main",
  ".board-layout-component",
  ".puzzle-board-component",
  ".play-controller-component",
  ".play-layout-main",
  "wc-chess-board",
  ".board",
];

/** Text patterns for buttons in the "New Game" tab. */
const NEW_GAME_TAB_TEXT = /^(play|start\s*game|start)/i;

/** Manual cooldown duration options. */
const COOLDOWN_OPTIONS = [
  { label: "5 min", seconds: 5 * 60 },
  { label: "10 min", seconds: 10 * 60 },
  { label: "15 min", seconds: 15 * 60 },
  { label: "30 min", seconds: 30 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
];

// ── State ────────────────────────────────────────────────────

let active = false;
let observer: MutationObserver | null = null;
let cooldownSeconds = 30;
let escalateOnLoss = true;
let gameJustEnded = false;
let lastGameWasLoss = false;
let cooldownTimer: ReturnType<typeof setInterval> | null = null;
let cooldownRemaining = 0;
let currentUsername = "";

/** Track disabled buttons and inserted bars for cleanup. */
let cooldownState: {
  disabledButtons: HTMLElement[];
  bars: HTMLElement[];
} = { disabledButtons: [], bars: [] };

/** Floating action button references. */
let fab: HTMLElement | null = null;
let fabTimerEl: HTMLElement | null = null;
let fabDropdown: HTMLElement | null = null;

/** Puzzle board overlay reference. */
let puzzleOverlay: HTMLElement | null = null;
let puzzleOverlayTimer: HTMLElement | null = null;
let lastKnownPath = "";

// ── Content Script Entry ─────────────────────────────────────

export default defineContentScript({
  matches: ["*://*.chess.com/*"],
  runAt: "document_idle",

  async main() {
    detectUsername();

    const isEnabled = await enabled.getValue();
    if (isEnabled) await activate();

    enabled.watch(async (v) => {
      if (v) await activate();
      else deactivate();
    });
  },
});

// ── Lifecycle ────────────────────────────────────────────────

async function activate(): Promise<void> {
  if (active) return;
  active = true;
  document.documentElement.classList.add(CSS_CLASS);

  cooldownSeconds = await cooldownSecondsStore.getValue();
  escalateOnLoss = await escalateOnLossStore.getValue();

  cooldownSecondsStore.watch((v) => {
    cooldownSeconds = v;
  });
  escalateOnLossStore.watch((v) => {
    escalateOnLoss = v;
  });

  // Track current path for SPA navigation detection
  lastKnownPath = location.pathname;

  // Create the floating button
  createFab();

  // Check for a persisted cooldown
  await resumePersistedCooldown();

  // Watch DOM for game-over state and SPA navigation
  observer = new MutationObserver(onDomMutation);
  observer.observe(document.body, { childList: true, subtree: true });

  // Check if already in post-game
  checkForGameOver();
}

function deactivate(): void {
  if (!active) return;
  active = false;
  document.documentElement.classList.remove(CSS_CLASS);
  observer?.disconnect();
  observer = null;
  clearCooldown(false); // Don't clear stored timestamp on deactivate
  removeFab();
}

// ── Username Detection ───────────────────────────────────────

function detectUsername(): void {
  const navLink = document.querySelector<HTMLAnchorElement>(
    'nav a[data-user-activity-key="profile"]'
  );
  if (navLink) {
    const match = (navLink.getAttribute("href") ?? "").match(/\/member\/(.+)/);
    if (match) {
      currentUsername = match[1].toLowerCase();
      return;
    }
  }

  try {
    const ctx = (window as any).context;
    if (ctx?.user?.username) {
      currentUsername = ctx.user.username.toLowerCase();
    }
  } catch {
    /* best-effort */
  }
}

// ── DOM Mutation Observer ────────────────────────────────────

function onDomMutation(mutations: MutationRecord[]): void {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;

      if (
        node.classList?.contains("game-over-modal-container") ||
        node.querySelector?.(".game-over-modal-container") ||
        node.classList?.contains("board-modal-container-container") ||
        node.querySelector?.(".board-modal-container-container")
      ) {
        handleGameOver();
        return;
      }
    }
  }

  // If cooldown is active and new buttons appear, disable them
  if (cooldownRemaining > 0) {
    disableVisibleActionButtons();

    // SPA navigation detection: if path changed, re-apply puzzle overlay
    if (location.pathname !== lastKnownPath) {
      lastKnownPath = location.pathname;
      applyPuzzleOverlay();
    }

    // If a board appeared on a puzzle page without navigation
    if (isBlockedPage() && !puzzleOverlay) {
      applyPuzzleOverlay();
    }
  }
}

function checkForGameOver(): void {
  if (document.querySelector(".game-over-modal-container")) {
    handleGameOver();
  }
}

// ── Game Over Handling ───────────────────────────────────────

function handleGameOver(): void {
  if (gameJustEnded) return;
  gameJustEnded = true;
  lastGameWasLoss = detectLoss();

  // Delay to let chess.com finish rendering buttons
  setTimeout(() => {
    let duration = cooldownSeconds;
    if (escalateOnLoss && lastGameWasLoss) {
      duration = Math.round(duration * 2);
    }
    startCooldown(duration);
  }, 300);
}

function detectLoss(): boolean {
  const headerTitle = document.querySelector(".header-title-component");
  const title = (headerTitle?.textContent ?? "").trim().toLowerCase();

  if (title.includes("you won")) return false;
  if (title.includes("game aborted")) return false;
  if (title.includes("draw")) return false;
  if (title.includes("you lost")) return true;

  if (!currentUsername) return false;

  const chatMessages = document.querySelectorAll(".game-over-message-component");
  for (const msg of chatMessages) {
    const text = msg.textContent ?? "";
    const winnerMatch = text.match(/(\w+)\s+\(.+?\)\s+won/i);
    if (winnerMatch && winnerMatch[1].toLowerCase() !== currentUsername) {
      return true;
    }
  }

  return false;
}

// ── Cooldown Logic ───────────────────────────────────────────

/**
 * Start (or restart) a cooldown for the given duration.
 * Persists the end timestamp to storage so it survives reloads.
 */
async function startCooldown(durationSeconds: number): Promise<void> {
  clearCooldownUI();

  const until = Date.now() + durationSeconds * 1000;
  await cooldownUntilStore.setValue(until);
  cooldownRemaining = durationSeconds;

  applyCooldownUI();
}

/**
 * Resume a persisted cooldown if the stored timestamp is still in the future.
 */
async function resumePersistedCooldown(): Promise<void> {
  const until = await cooldownUntilStore.getValue();
  if (!until || until <= Date.now()) {
    // Expired or not set — clean up
    if (until) await cooldownUntilStore.setValue(0);
    return;
  }

  cooldownRemaining = Math.ceil((until - Date.now()) / 1000);
  applyCooldownUI();
}

/**
 * Apply cooldown UI: disable buttons, insert bars, start countdown.
 */
function applyCooldownUI(): void {
  // Disable action buttons
  disableVisibleActionButtons();

  // Insert cooldown bars
  insertCooldownBars();

  // Overlay puzzle board if on a puzzle page
  applyPuzzleOverlay();

  // Watch for "New Game" tab clicks
  watchNewGameTab();

  // Update FAB to show timer
  updateFab();

  // Start countdown interval
  cooldownTimer = setInterval(async () => {
    const until = await cooldownUntilStore.getValue();
    if (!until || until <= Date.now()) {
      clearCooldown(true);
      return;
    }
    cooldownRemaining = Math.ceil((until - Date.now()) / 1000);
    updateAllBars();
    updatePuzzleOverlay();
    updateFab();
  }, 1000);
}

/**
 * Clear cooldown: stop timer, re-enable buttons, remove bars.
 * @param clearStorage Whether to also clear the stored timestamp.
 */
async function clearCooldown(clearStorage: boolean): Promise<void> {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
  cooldownRemaining = 0;
  gameJustEnded = false;

  if (clearStorage) {
    await cooldownUntilStore.setValue(0);
  }

  clearCooldownUI();
  updateFab();
}

function clearCooldownUI(): void {
  for (const btn of cooldownState.disabledButtons) {
    btn.classList.remove("keel-btn-disabled");
  }
  for (const bar of cooldownState.bars) {
    bar.remove();
  }
  cooldownState = { disabledButtons: [], bars: [] };
  removePuzzleOverlay();
}

// ── Button Discovery & Disabling ──────────────────────────────

function disableVisibleActionButtons(): void {
  const buttons = findActionButtons();
  for (const btn of buttons) {
    if (!cooldownState.disabledButtons.includes(btn)) {
      btn.classList.add("keel-btn-disabled");
      cooldownState.disabledButtons.push(btn);
    }
  }
}

/** Text patterns for play / start actions across the site. */
const PLAY_BUTTON_TEXT =
  /^(play|play online|play computer|new game|start|quick play|play now)$/i;

function findActionButtons(): HTMLElement[] {
  const buttons: HTMLElement[] = [];

  // 1. Explicit selectors (data-cy, hrefs)
  for (const sel of ACTION_BUTTON_SELECTORS) {
    const els = document.querySelectorAll<HTMLElement>(sel);
    for (const el of els) {
      if (!buttons.includes(el)) buttons.push(el);
    }
  }

  // 2. Game-over modal buttons
  const modal = document.querySelector(".game-over-modal-container");
  if (modal) {
    const allBtns = modal.querySelectorAll<HTMLElement>("button");
    for (const btn of allBtns) {
      const text = btn.textContent?.trim() ?? "";
      if (/new\s*\d/i.test(text) || /rematch/i.test(text)) {
        if (!buttons.includes(btn)) buttons.push(btn);
      }
    }
  }

  // 3. Broad text-match for play buttons anywhere on the page
  //    (home page, lobby, sidebar quick-play, etc.)
  const allButtons = document.querySelectorAll<HTMLElement>(
    'button, a[role="button"], .ui_v5-button-component'
  );
  for (const btn of allButtons) {
    const text = btn.textContent?.trim() ?? "";
    if (PLAY_BUTTON_TEXT.test(text) && !buttons.includes(btn)) {
      buttons.push(btn);
    }
  }

  // 4. Time control quick-play links (e.g. "1 min", "3 | 2", "10 min")
  const quickLinks = document.querySelectorAll<HTMLElement>(
    ".play-quick-links-link, .index-quick-link, .time-selector-button"
  );
  for (const link of quickLinks) {
    if (!buttons.includes(link)) buttons.push(link);
  }

  // 5. On /play or /live pages, catch all interactive elements in the play area
  if (/^\/(play|live)\b/i.test(location.pathname)) {
    const playArea = document.querySelector(
      ".play-controller-component, .new-game-index-component, #board-layout-sidebar"
    );
    if (playArea) {
      const allInteractive = playArea.querySelectorAll<HTMLElement>(
        'button, a[role="button"], .ui_v5-button-component, a.time-selector-button'
      );
      for (const el of allInteractive) {
        if (!buttons.includes(el)) buttons.push(el);
      }
    }
  }

  return buttons;
}

function insertCooldownBars(): void {
  const points = findBarInsertionPoints();
  for (const point of points) {
    if (point.nextElementSibling?.classList.contains("keel-cooldown-bar"))
      continue;
    const bar = createCooldownBar();
    point.after(bar);
    cooldownState.bars.push(bar);
  }
  updateAllBars();
}

function findBarInsertionPoints(): HTMLElement[] {
  const points: HTMLElement[] = [];

  const modalBtns = document.querySelector<HTMLElement>(
    ".game-over-buttons-component"
  );
  if (modalBtns) points.push(modalBtns);

  const sidebarBtns = document.querySelector<HTMLElement>(
    ".new-game-buttons-component .new-game-buttons-buttons"
  );
  if (sidebarBtns && !points.some((p) => p.contains(sidebarBtns))) {
    points.push(sidebarBtns);
  }

  return points;
}

// ── "New Game" Tab Handling ───────────────────────────────────

function watchNewGameTab(): void {
  const newGameTab = document.querySelector<HTMLElement>(
    '[data-tab="newGame"]'
  );
  if (!newGameTab) return;

  const handler = () => {
    setTimeout(() => {
      if (cooldownRemaining <= 0) return;

      const sidebarContent = document.querySelector(".sidebar-content");
      if (!sidebarContent) return;

      const buttons = sidebarContent.querySelectorAll<HTMLElement>("button");
      for (const btn of buttons) {
        const text = btn.textContent?.trim() ?? "";
        if (NEW_GAME_TAB_TEXT.test(text) || /new\s*\d/i.test(text)) {
          if (!cooldownState.disabledButtons.includes(btn)) {
            btn.classList.add("keel-btn-disabled");
            cooldownState.disabledButtons.push(btn);
          }
        }
      }

      const tabContent =
        sidebarContent.querySelector('[data-tab-content="newGame"]') ??
        sidebarContent;
      if (!tabContent.querySelector(".keel-cooldown-bar")) {
        const bar = createCooldownBar();
        tabContent.appendChild(bar);
        cooldownState.bars.push(bar);
        updateAllBars();
      }
    }, 300);
  };

  newGameTab.addEventListener("click", handler);
}

// ── Cooldown Bar ──────────────────────────────────────────────

function createCooldownBar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "keel-cooldown-bar";

  const top = document.createElement("div");
  top.className = "keel-cooldown-top";

  const label = document.createElement("span");
  label.className = "keel-cooldown-label";
  label.textContent = lastGameWasLoss ? "Tilt protection." : "Take a breath.";

  const timer = document.createElement("span");
  timer.className = "keel-cooldown-timer";
  timer.textContent = formatTime(cooldownRemaining);

  top.appendChild(label);
  top.appendChild(timer);

  const stop = document.createElement("button");
  stop.className = "keel-stop-playing";
  stop.textContent = "Stop playing";
  stop.addEventListener("click", (e) => {
    e.stopPropagation();
    // Navigate away but keep cooldown active — it should persist
    window.location.href = "https://www.chess.com/home";
  });

  bar.appendChild(top);
  bar.appendChild(stop);

  return bar;
}

function updateAllBars(): void {
  const timeStr = formatTime(cooldownRemaining);
  for (const bar of cooldownState.bars) {
    const timer = bar.querySelector<HTMLElement>(".keel-cooldown-timer");
    if (timer) timer.textContent = timeStr;
  }
}

// ── Floating Action Button (FAB) ──────────────────────────────

function createFab(): void {
  if (fab) return;

  fab = document.createElement("div");
  fab.className = "keel-fab";

  const icon = document.createElement("span");
  icon.className = "keel-fab-icon";
  icon.textContent = "\u23F8"; // ⏸

  fabTimerEl = document.createElement("span");
  fabTimerEl.className = "keel-fab-timer";

  fab.appendChild(icon);
  fab.appendChild(fabTimerEl);

  // Dropdown
  fabDropdown = document.createElement("div");
  fabDropdown.className = "keel-fab-dropdown";
  fab.appendChild(fabDropdown);

  fab.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFabDropdown();
  });

  // Close dropdown on outside click
  document.addEventListener("click", () => closeFabDropdown());

  document.body.appendChild(fab);
  updateFab();
}

function removeFab(): void {
  fab?.remove();
  fab = null;
  fabTimerEl = null;
  fabDropdown = null;
}

function toggleFabDropdown(): void {
  if (!fabDropdown) return;
  // During active cooldown, FAB is display-only — no dropdown
  if (cooldownRemaining > 0) return;

  const isOpen = fabDropdown.classList.contains("open");
  if (isOpen) {
    closeFabDropdown();
  } else {
    openFabDropdown();
  }
}

function openFabDropdown(): void {
  if (!fabDropdown) return;

  // Clear previous items
  fabDropdown.innerHTML = "";

  {
    // No cooldown: show duration options
    for (const opt of COOLDOWN_OPTIONS) {
      const item = document.createElement("button");
      item.className = "keel-fab-option";
      item.textContent = opt.label;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        startCooldown(opt.seconds);
        closeFabDropdown();
      });
      fabDropdown.appendChild(item);
    }
  }

  fabDropdown.classList.add("open");
}

function closeFabDropdown(): void {
  fabDropdown?.classList.remove("open");
}

function updateFab(): void {
  if (!fab || !fabTimerEl) return;

  if (cooldownRemaining > 0) {
    fabTimerEl.textContent = formatTime(cooldownRemaining);
    fabTimerEl.style.display = "";
    fab.classList.add("keel-fab--active");
  } else {
    fabTimerEl.textContent = "";
    fabTimerEl.style.display = "none";
    fab.classList.remove("keel-fab--active");
  }
}

// ── Puzzle Page Detection & Board Overlay ─────────────────────

function isBlockedPage(): boolean {
  return BLOCKED_PATH_RE.test(location.pathname);
}

function findBoardContainer(): HTMLElement | null {
  for (const sel of BOARD_CONTAINER_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

function applyPuzzleOverlay(): void {
  if (!isBlockedPage()) return;
  if (cooldownRemaining <= 0) return;
  if (puzzleOverlay) return; // already applied

  const board = findBoardContainer();
  if (!board) return;

  // Ensure the board container is positioned for the overlay
  const computed = getComputedStyle(board);
  if (computed.position === "static") {
    board.style.position = "relative";
  }

  puzzleOverlay = document.createElement("div");
  puzzleOverlay.className = "keel-puzzle-overlay";

  const content = document.createElement("div");
  content.className = "keel-puzzle-overlay-content";

  const label = document.createElement("span");
  label.className = "keel-puzzle-overlay-label";
  label.textContent = "Take a break.";

  puzzleOverlayTimer = document.createElement("span");
  puzzleOverlayTimer.className = "keel-puzzle-overlay-timer";
  puzzleOverlayTimer.textContent = formatTime(cooldownRemaining);

  const stop = document.createElement("button");
  stop.className = "keel-stop-playing";
  stop.textContent = "Stop playing";
  stop.addEventListener("click", (e) => {
    e.stopPropagation();
    // Navigate away but keep cooldown active — it should persist
    window.location.href = "https://www.chess.com/home";
  });

  content.appendChild(label);
  content.appendChild(puzzleOverlayTimer);
  content.appendChild(stop);
  puzzleOverlay.appendChild(content);

  board.appendChild(puzzleOverlay);
}

function removePuzzleOverlay(): void {
  puzzleOverlay?.remove();
  puzzleOverlay = null;
  puzzleOverlayTimer = null;
}

function updatePuzzleOverlay(): void {
  if (puzzleOverlayTimer) {
    puzzleOverlayTimer.textContent = formatTime(cooldownRemaining);
  }
}

// ── Helpers ───────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
