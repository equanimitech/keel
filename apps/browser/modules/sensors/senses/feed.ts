/**
 * Feed sense — generic over feed-shaped pages. Type-level knowledge:
 * feed items render as articles / list items across platforms, and
 * sponsored items carry an industry-standard disclosure label.
 * A post counts as SEEN at ≥50% visible, once per item (post_seen).
 */

import { isSponsoredLabel } from "../events";
import { sendSensorEvent } from "../send";

const FEED_ITEM_SELECTOR = 'article, [role="article"], div[role="listitem"]';

function isSponsoredItem(item: Element): boolean {
  for (const label of item.querySelectorAll("p, span")) {
    if (isSponsoredLabel(label.textContent ?? "")) {
      return true;
    }
  }
  return false;
}

export function armFeedSense(): void {
  const seen = new WeakSet<Element>();
  const watched = new WeakSet<Element>();

  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !seen.has(entry.target)) {
          seen.add(entry.target);
          sendSensorEvent("post_seen", {
            promoted: isSponsoredItem(entry.target),
          });
        }
      }
    },
    { threshold: 0.5 }
  );

  const watchAll = (): void => {
    for (const item of document.querySelectorAll(FEED_ITEM_SELECTOR)) {
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
}
