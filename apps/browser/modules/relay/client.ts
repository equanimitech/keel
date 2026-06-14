/**
 * Relay client — flush buffered events to the keel native host and pull the
 * observe list back. Pure helpers (chunkEvents/unacked) are unit-tested; the
 * chrome.runtime.connectNative wiring is integration. Fail-open throughout.
 */
import { readAllEvents, deleteEventsByIds } from "../activity/log";
import { replaceObserveDomains } from "../watchlist/store";
import { chunkEvents } from "./batch";

export { chunkEvents, unacked } from "./batch";

const HOST_NAME = "tech.equanimi.keel";
const MAX_BATCH = 1000;

/** Connect once, flush all buffered events (ack-prune), pull observe list. */
export async function flushToHost(): Promise<void> {
  let port: ReturnType<typeof browser.runtime.connectNative>;
  try {
    port = browser.runtime.connectNative(HOST_NAME);
  } catch (e) {
    console.warn("[keel relay] connectNative threw:", e); // host not installed — stay on the export stopgap
    return;
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
      const msg = raw as { type?: string; ids?: string[]; domains?: string[] };
      if (msg.type === "ack" && msg.ids) void deleteEventsByIds(msg.ids);
      else if (msg.type === "observe" && msg.domains) void replaceObserveDomains(msg.domains);
    });
    const events = await readAllEvents();
    console.debug("[keel relay] flushing", events.length, "buffered events to", HOST_NAME);
    for (const batch of chunkEvents(events, MAX_BATCH)) {
      port.postMessage({ type: "events", events: batch });
    }
    port.postMessage({ type: "request_observe" });
  } catch {
    // host crashed mid-flush — buffered events stay in IndexedDB for the next flush
  } finally {
    setTimeout(() => port.disconnect(), 2000); // allow acks to arrive
  }
}
