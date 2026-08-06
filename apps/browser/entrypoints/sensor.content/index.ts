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
import { armDwellGate } from "@/modules/friction/gate/arm";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  async main() {
    let observed = false;
    let gated = false;
    try {
      const answer: unknown = await browser.runtime.sendMessage({
        type: "keel-sensor-arm",
      });
      const reply = (answer ?? {}) as Record<string, unknown>;
      observed = reply.observed === true;
      gated = reply.gate !== null && reply.gate !== undefined;
    } catch {
      return; // Background unavailable — stay dormant, fail-open.
    }

    // The gate is independent of the observe tier: a domain can be gated
    // without being deep-sensed, and the dwell it reads comes from the coarse
    // writer events every domain produces.
    if (gated) {
      armDwellGate();
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
