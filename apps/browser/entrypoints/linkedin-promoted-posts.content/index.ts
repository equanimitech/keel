import { shieldEnabled } from "@/utils/storage";
import { linkedinPromotedPosts } from "@/modules/shields/linkedin-promoted-posts/definition";

/**
 * Content script: LinkedIn Promoted Posts Hide
 *
 * JS-driven shield — finds div[role="listitem"] elements that contain
 * a <p> whose only text content is "Promoted", and hides them.
 */

const enabled = shieldEnabled(
  linkedinPromotedPosts.id,
  linkedinPromotedPosts.defaultEnabled,
);

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
  runAt: "document_idle",

  async main() {
    let active = await enabled.getValue();

    if (active) {
      hidePromotedPosts();
    }

    enabled.watch((newValue) => {
      active = newValue;
      if (active) {
        hidePromotedPosts();
      } else {
        showPromotedPosts();
      }
    });

    // LinkedIn loads feed items dynamically — observe for new ones.
    const observer = new MutationObserver(() => {
      if (active) {
        hidePromotedPosts();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },
});

const HIDDEN_ATTR = "data-keel-promoted-hidden";

function isPromotedItem(listitem: Element): boolean {
  for (const p of listitem.querySelectorAll("p")) {
    if (p.textContent?.trim() === "Promoted") {
      return true;
    }
  }
  return false;
}

function hidePromotedPosts(): void {
  for (const item of document.querySelectorAll('div[role="listitem"]')) {
    if (item.getAttribute(HIDDEN_ATTR) === "true") {
      continue;
    }
    if (isPromotedItem(item)) {
      (item as HTMLElement).style.display = "none";
      item.setAttribute(HIDDEN_ATTR, "true");
    }
  }
}

function showPromotedPosts(): void {
  for (const item of document.querySelectorAll(`[${HIDDEN_ATTR}="true"]`)) {
    (item as HTMLElement).style.display = "";
    item.removeAttribute(HIDDEN_ATTR);
  }
}
