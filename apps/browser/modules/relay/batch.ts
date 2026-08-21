/**
 * Pure relay batching helpers — split from client.ts so unit tests can import
 * them without loading the chrome-coupled flush path (wxt storage side-effects).
 */
import type { ActivityEvent } from "../domain";

export function chunkEvents(events: readonly ActivityEvent[], size: number): ActivityEvent[][] {
  const out: ActivityEvent[][] = [];
  for (let i = 0; i < events.length; i += size) out.push(events.slice(i, i + size));
  return out;
}

export function unacked(events: readonly ActivityEvent[], ackedIds: readonly string[]): ActivityEvent[] {
  const acked = new Set(ackedIds);
  return events.filter((e) => !acked.has(e.id));
}
