/**
 * Relay client — flush buffered events to the keel native host and pull the
 * observe list back. Pure helpers (chunkEvents/unacked) are unit-tested; the
 * chrome.runtime.connectNative wiring is integration. Fail-open throughout.
 */
import { storage } from "wxt/storage";
import { readEventsSince } from "../activity/log";
import { replaceObserveDomains } from "../watchlist/store";
import { replacePolicy } from "../friction/policy/store";
import { chunkEvents } from "./batch";

export { chunkEvents, unacked } from "./batch";

const HOST_NAME = "tech.equanimi.keel";
const MAX_BATCH = 1000;

/**
 * High-water mark: events at or before this ts have been acked by the host.
 *
 * Replaces delete-on-ack. The relay used to empty the local store as it
 * shipped, which left the Areas page computing dwell over a few minutes of
 * buffer while labelling it "all time". Now it ships a *copy* and remembers
 * how far it got.
 *
 * Advanced only on ack, so a connection that dies mid-flush simply resends.
 * The host appends without deduping, but `bouts()` dedupes by event id on the
 * read side, so a resent event costs a line in the log and never a wrong
 * number.
 */
export const flushedThrough = storage.defineItem<number>("local:relay:flushedThrough", {
  fallback: 0,
});

/**
 * Assign a domain to an area (empty `areaId` un-assigns).
 *
 * A separate short-lived connection rather than riding the flush: assignment is
 * interactive and must land now, while the flush runs on a 5-minute alarm. The
 * host replies `area_set`, which triggers a re-pull so every surface agrees.
 */
export async function setArea(domain: string, areaId: string): Promise<boolean> {
  let port: ReturnType<typeof browser.runtime.connectNative>;
  try {
    port = browser.runtime.connectNative(HOST_NAME);
  } catch {
    return false;
  }
  try {
    port.postMessage({ type: "set_area", domain, areaId });
    return true;
  } catch {
    return false;
  } finally {
    setTimeout(() => port.disconnect(), 1000);
  }
}

/** Connect once, ship everything since the watermark, pull observe + policy. */
export async function flushToHost(): Promise<void> {
  let port: ReturnType<typeof browser.runtime.connectNative>;
  try {
    port = browser.runtime.connectNative(HOST_NAME);
  } catch (e) {
    console.warn("[keel relay] connectNative threw:", e); // host not installed — stay on the export stopgap
    return;
  }
  // Read before wiring the ack listener — it closes over `highWater`.
  const since = await flushedThrough.getValue();
  // `readEventsSince` is inclusive, so step past the last acked event rather
  // than resending it on every flush forever.
  const events = await readEventsSince(since === 0 ? 0 : since + 1);
  let highWater = since;
  for (const event of events) {
    if (event.ts > highWater) {
      highWater = event.ts;
    }
  }

  try {
    // Surface a failed handshake instead of failing silently. connectNative
    // returns a port even when the host is unreachable; the failure only shows
    // up here as lastError on disconnect.
    port.onDisconnect.addListener(() => {
      const err = browser.runtime.lastError;
      if (err) console.warn("[keel relay] native host disconnected:", err.message);
    });
    port.onMessage.addListener((raw: unknown) => {
      const msg = raw as {
        type?: string;
        ids?: string[];
        domains?: string[];
        standing?: string[];
        armable?: string[];
        areas?: never;
        areaMap?: never;
      };
      // An ack advances the watermark instead of deleting. The relay ships a
      // COPY; the local store is what the Areas page computes dwell over, and
      // deleting on ack left it reading minutes of buffer while labelling it
      // "all time". Bounded by the retention guard (writer.ts, ~100 days).
      if (msg.type === "ack" && msg.ids) {
        console.debug("[keel relay] host acked", msg.ids.length, "events");
        void flushedThrough.setValue(highWater);
      }
      else if (msg.type === "observe" && msg.domains) void replaceObserveDomains(msg.domains);
      else if (msg.type === "policy") void replacePolicy(msg);
      else if (msg.type === "area_set") void flushToHost(); // re-pull so every surface agrees
    });
    console.debug("[keel relay] flushing", events.length, "new events to", HOST_NAME);
    for (const batch of chunkEvents(events, MAX_BATCH)) {
      port.postMessage({ type: "events", events: batch });
    }
    port.postMessage({ type: "request_observe" });
    port.postMessage({ type: "request_policy" });
  } catch {
    // host crashed mid-flush — buffered events stay in IndexedDB for the next flush
  } finally {
    setTimeout(() => port.disconnect(), 2000); // allow acks to arrive
  }
}
