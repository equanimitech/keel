/**
 * LinkedIn sensor — feed post impressions (observe tier).
 *
 * DOM knowledge inherited from the retired promoted-posts shield:
 * feed items are `div[role="listitem"]`; a child <p> with the exact
 * text "Promoted" marks sponsored posts. A post counts as SEEN when
 * ≥50% visible (IntersectionObserver), once per item.
 */

import { sendSensorEvent } from "@/modules/sensors/send";

function isPromoted(item: Element): boolean {
  for (const p of item.querySelectorAll("p")) {
    if (p.textContent?.trim() === "Promoted") {
      return true;
    }
  }
  return false;
}

export default defineContentScript({
  matches: ["*://*.linkedin.com/*"],
  main() {
    const seen = new WeakSet<Element>();
    const watched = new WeakSet<Element>();

    const intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !seen.has(entry.target)) {
            seen.add(entry.target);
            sendSensorEvent("post_seen", {
              promoted: isPromoted(entry.target),
            });
          }
        }
      },
      { threshold: 0.5 }
    );

    const watchAll = (): void => {
      for (const item of document.querySelectorAll('div[role="listitem"]')) {
        if (!watched.has(item)) {
          watched.add(item);
          intersection.observe(item);
        }
      }
    };

    watchAll();
    new MutationObserver(watchAll).observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});
