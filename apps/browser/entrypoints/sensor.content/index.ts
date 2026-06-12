/**
 * The sensor — ONE content script for every page, type-based.
 *
 * On load it asks the background whether this domain is on the
 * watchlist's observe tier (the arm handshake). If not, it does
 * NOTHING — no observers, no listeners. If observed, it arms the
 * generic senses (video, feed — they self-select by what the page
 * exhibits) plus the game sense where a site adapter exists.
 *
 * No company names here: domains are user-authored watchlist entries;
 * site-specific probes are data in modules/sensors/adapters.ts.
 */

import { siteAdapterFor } from "@/modules/sensors/adapters";
import { armFeedSense } from "@/modules/sensors/senses/feed";
import { armGameSense } from "@/modules/sensors/senses/game";
import { armVideoSense } from "@/modules/sensors/senses/video";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  async main() {
    let observed = false;
    try {
      const answer: unknown = await browser.runtime.sendMessage({
        type: "keel-sensor-arm",
      });
      observed =
        typeof answer === "object" &&
        answer !== null &&
        (answer as Record<string, unknown>).observed === true;
    } catch {
      return; // Background unavailable — stay dormant, fail-open.
    }
    if (!observed) {
      return;
    }

    armVideoSense();
    armFeedSense();

    const adapter = siteAdapterFor(window.location.hostname.replace(/^www\./, ""));
    if (adapter !== null) {
      armGameSense(adapter);
    }
  },
});
