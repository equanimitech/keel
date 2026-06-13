/**
 * Relay client — flush buffered events to the keel native host and pull the
 * observe list back. Pure helpers (chunkEvents/unacked) are unit-tested; the
 * chrome.runtime.connectNative wiring is integration. Fail-open throughout.
 */
import type { ActivityEvent } from "@keel/domain";
import { readAllEvents, deleteEventsByIds } from "../activity/log";
import { replaceObserveDomains } from "../watchlist/store";

const HOST_NAME = "tech.equanimi.keel";
const MAX_BATCH = 1000;

export function chunkEvents(events: readonly ActivityEvent[], size: number): ActivityEvent[][] {
  const out: ActivityEvent[][] = [];
  for (let i = 0; i < events.length; i += size) out.push(events.slice(i, i + size));
  return out;
}

export function unacked(events: readonly ActivityEvent[], ackedIds: readonly string[]): ActivityEvent[] {
  const acked = new Set(ackedIds);
  return events.filter((e) => !acked.has(e.id));
}

/** Connect once, flush all buffered events (ack-prune), pull observe list. */
export async function flushToHost(): Promise<void> {
  let port: ReturnType<typeof browser.runtime.connectNative>;
  try {
    port = browser.runtime.connectNative(HOST_NAME);
  } catch {
    return; // host not installed — stay on the export stopgap
  }
  try {
    port.onMessage.addListener((raw: unknown) => {
      const msg = raw as { type?: string; ids?: string[]; domains?: string[] };
      if (msg.type === "ack" && msg.ids) void deleteEventsByIds(msg.ids);
      else if (msg.type === "observe" && msg.domains) void replaceObserveDomains(msg.domains);
    });
    const events = await readAllEvents();
    for (const batch of chunkEvents(events, MAX_BATCH)) {
      port.postMessage({ type: "events", events: batch });
    }
    port.postMessage({ type: "request_observe" });
  } finally {
    setTimeout(() => port.disconnect(), 2000); // allow acks to arrive
  }
}
