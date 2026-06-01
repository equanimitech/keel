import { shieldEnabled } from "@/utils/storage";
import { youtubeShorts } from "@/modules/shields/youtube-shorts/definition";
import "./style.css";

/**
 * Content script: YouTube Shorts Scroll Lock
 *
 * Layers of defence against compulsive scrolling:
 * 1. CSS  — kills scroll-snap, overflow, and nav buttons (style.css)
 * 2. JS   — locks scroll position & intercepts wheel/touch/keyboard events
 *
 * The CSS is always loaded (WXT injects the stylesheet for matching URLs),
 * but all rules are scoped under `.keel-youtube-shorts-scroll-lock-active`
 * so they only take effect when the JS adds that class to <html>.
 */

const CSS_CLASS = `keel-${youtubeShorts.id}-active`;
const enabled = shieldEnabled(youtubeShorts.id, youtubeShorts.defaultEnabled);

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    if (isEnabled) {
      activate();
    }

    // React to toggle changes from the popup (live on/off).
    enabled.watch((newValue) => {
      if (newValue) {
        activate();
      } else {
        deactivate();
      }
    });
  },
});

// ── State ──────────────────────────────────────────────────────────

let active = false;
let observer: MutationObserver | null = null;

// ── Activation / deactivation ──────────────────────────────────────

function activate(): void {
  if (active) return;
  active = true;

  document.documentElement.classList.add(CSS_CLASS);
  applyShortsLock();

  // YouTube is an SPA — watch for navigation into /shorts.
  observer = new MutationObserver(() => applyShortsLock());
  observer.observe(document.body, { childList: true, subtree: true });
}

function deactivate(): void {
  if (!active) return;
  active = false;

  document.documentElement.classList.remove(CSS_CLASS);
  observer?.disconnect();
  observer = null;
  removeShortsLock();
}

// ── Scroll-lock logic ──────────────────────────────────────────────

const SCROLL_CONTAINER = "#shorts-inner-container";

function applyShortsLock(): void {
  if (!isShortsPage()) return;

  const container = document.querySelector<HTMLElement>(SCROLL_CONTAINER);
  if (!container) return;

  // Already patched?
  if (container.dataset.keelLocked === "true") return;
  container.dataset.keelLocked = "true";

  // Lock current scroll position.
  const lockPosition = container.scrollTop;

  container.addEventListener("scroll", handleScroll, { passive: true });
  container.addEventListener("wheel", preventEvent, { passive: false });
  container.addEventListener("touchmove", preventEvent, { passive: false });
  container.addEventListener("keydown", handleKeydown, { capture: true });

  // Belt-and-suspenders: reset scroll on every scroll event.
  function handleScroll(): void {
    container!.scrollTop = lockPosition;
  }
}

function removeShortsLock(): void {
  const container = document.querySelector<HTMLElement>(SCROLL_CONTAINER);
  if (!container) return;

  delete container.dataset.keelLocked;

  // We can't easily remove anonymous listeners, so we clone-replace the node
  // to strip all listeners.  YouTube will re-hydrate it on next navigation.
  const parent = container.parentNode;
  if (parent) {
    const clone = container.cloneNode(true) as HTMLElement;
    parent.replaceChild(clone, container);
  }
}

// ── Event handlers ─────────────────────────────────────────────────

function preventEvent(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
}

function handleKeydown(e: KeyboardEvent): void {
  const blockedKeys = new Set([
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    " ",
    "j",
    "k",
  ]);

  if (blockedKeys.has(e.key) && isShortsPage()) {
    e.preventDefault();
    e.stopPropagation();
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function isShortsPage(): boolean {
  return window.location.pathname.startsWith("/shorts");
}
