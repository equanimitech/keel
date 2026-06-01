import { shieldEnabled } from "@/utils/storage";
import { youtubeCommentsHide } from "@/modules/shields/youtube-comments-hide/definition";
import "./style.css";

/**
 * Content script: Comments Hide
 *
 * CSS-driven shield with a small JS addition: injects a placeholder
 * message so users know comments are intentionally hidden, not broken.
 */

const CSS_CLASS = `keel-${youtubeCommentsHide.id}-active`;
const enabled = shieldEnabled(youtubeCommentsHide.id, youtubeCommentsHide.defaultEnabled);
const PLACEHOLDER_ID = "keel-comments-placeholder";

export default defineContentScript({
  matches: ["*://*.youtube.com/*"],
  runAt: "document_idle",

  async main() {
    const isEnabled = await enabled.getValue();
    toggle(isEnabled);

    enabled.watch((newValue) => toggle(newValue));

    // YouTube is an SPA — watch for navigation to inject placeholder.
    const observer = new MutationObserver(() => {
      if (isActive()) injectPlaceholder();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },
});

let active = false;

function isActive(): boolean {
  return active;
}

function toggle(on: boolean): void {
  active = on;
  document.documentElement.classList.toggle(CSS_CLASS, on);

  if (on) {
    injectPlaceholder();
  } else {
    removePlaceholder();
  }
}

function injectPlaceholder(): void {
  if (document.getElementById(PLACEHOLDER_ID)) return;

  const commentsSection = document.querySelector("#comments");
  if (!commentsSection) return;

  const placeholder = document.createElement("div");
  placeholder.id = PLACEHOLDER_ID;
  placeholder.textContent = "Comments hidden by keel";
  placeholder.style.cssText = `
    padding: 24px;
    text-align: center;
    color: #717171;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  commentsSection.parentNode?.insertBefore(placeholder, commentsSection.nextSibling);
}

function removePlaceholder(): void {
  document.getElementById(PLACEHOLDER_ID)?.remove();
}
