/**
 * The transform script — separate from the sensor, and deliberately so.
 *
 * Two reasons it is not a branch inside `sensor.content`:
 *
 *   • `runAt: "document_start"`. Hiding after first paint is a flash of the
 *     exact thing the rule exists to remove, which trains the eye to look for
 *     it. The sensor runs at idle on purpose and must keep doing so.
 *   • No arm handshake. Transforms are independent of the observe tier, like
 *     the dwell gate — a domain can be de-cluttered without being sensed. The
 *     policy mirror is read straight from storage, so there is no background
 *     round-trip to lose a race with at document_start.
 *
 * It writes nothing and observes nothing. The only thing it can do to a page is
 * add one <style> element.
 */

import { pageTransforms } from "@/modules/friction/policy/store";
import { applyTransforms, transformsFor } from "@/modules/friction/transform/apply";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_start",
  async main() {
    const host = window.location.hostname;

    const render = (all: Awaited<ReturnType<typeof pageTransforms.getValue>>): void => {
      try {
        applyTransforms(transformsFor(all, host));
      } catch {
        // A malformed selector throws on insertion in some engines. One bad
        // rule must not take the page's other rules — or the page — with it.
      }
    };

    try {
      render(await pageTransforms.getValue());
    } catch {
      return; // No mirror yet: leave the page exactly as the site rendered it.
    }

    // A policy flush must reach an open tab. Without this, disabling a rule
    // leaves parts of every already-open page hidden until it is reloaded.
    pageTransforms.watch((next) => {
      render(next ?? []);
    });
  },
});
