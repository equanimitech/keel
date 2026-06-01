import { shieldEnabled } from "@/utils/storage";
import { linkedinFeedHide } from "@/modules/shields/linkedin-feed-hide/definition";

/**
 * Content script: LinkedIn Feed Hide
 *
 * JS-driven shield — finds and hides the element with
 * data-testid="mainFeed", with a placeholder message.
 */

const enabled = shieldEnabled(linkedinFeedHide.id, linkedinFeedHide.defaultEnabled);
const PLACEHOLDER_ID = "keel-linkedin-feed-placeholder";
const HIDDEN_ATTR = "data-keel-feed-hidden";

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
  runAt: "document_idle",

  async main() {
    let active = await enabled.getValue();

    if (active) {
      hideFeed();
    }

    enabled.watch((newValue) => {
      active = newValue;
      if (active) {
        hideFeed();
      } else {
        showFeed();
      }
    });

    // LinkedIn is an SPA — watch for navigation and dynamic loading.
    const observer = new MutationObserver(() => {
      if (active) {
        hideFeed();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },
});

function hideFeed(): void {
  const feed = document.querySelector('[data-testid="mainFeed"]');
  if (!feed || feed.getAttribute(HIDDEN_ATTR) === "true") {
    return;
  }

  (feed as HTMLElement).style.display = "none";
  feed.setAttribute(HIDDEN_ATTR, "true");
  injectPlaceholder(feed);
}

function showFeed(): void {
  const feed = document.querySelector(`[${HIDDEN_ATTR}="true"]`);
  if (feed) {
    (feed as HTMLElement).style.display = "";
    feed.removeAttribute(HIDDEN_ATTR);
  }
  removePlaceholder();
}

function injectPlaceholder(feed: Element): void {
  if (document.getElementById(PLACEHOLDER_ID)) {
    return;
  }

  const parent = feed.parentElement;
  if (!parent) {
    return;
  }

  const placeholder = document.createElement("div");
  placeholder.id = PLACEHOLDER_ID;
  placeholder.textContent = "Feed hidden by keel";
  placeholder.style.cssText = `
    padding: 48px 24px;
    text-align: center;
    color: #666;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    border: 1px dashed #d1d5db;
    border-radius: 8px;
    margin: 16px 0;
  `;

  parent.insertBefore(placeholder, feed);
}

function removePlaceholder(): void {
  document.getElementById(PLACEHOLDER_ID)?.remove();
}
