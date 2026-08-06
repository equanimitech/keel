/**
 * Browser history — the inventory half of the Areas page.
 *
 * keel's own log only knows what it has observed since install, and only for
 * as long as the retention guard keeps it. Browser history knows every domain
 * you have ever visited, including years before keel existed. That is the right
 * source for "which sites do I need to sort", and the wrong one for "how long
 * was I there": **history records visits, never durations.**
 *
 * So the two sources answer different questions and neither substitutes for the
 * other:
 *
 *   history   → inventory + visit counts, all time
 *   keel log  → dwell, focus/idle-gated, recent
 *
 * ── Privacy ─────────────────────────────────────────────────────────────
 *
 * The `history` permission is the largest keel holds: read access to every URL
 * ever visited. What makes it acceptable is that a URL never leaves this
 * function. Everything here reduces to a bare host on read, and only hosts are
 * returned, stored, or logged — the same rule the writer follows ("payloads
 * carry domains only, never full URLs").
 */

/** Chrome's default is 100; we want the whole inventory, not a page of it. */
const MAX_RESULTS = 20_000;

export interface VisitInventory {
  /** Host → all-time visit count. */
  readonly counts: Readonly<Record<string, number>>;
  /**
   * True when the search hit `MAX_RESULTS`, so the inventory is incomplete.
   * Surfaced in the UI rather than swallowed: a silently truncated list reads
   * as a complete one, which is the same class of lie this page was fixed for.
   */
  readonly truncated: boolean;
  /** False when the permission is absent or the API is unavailable. */
  readonly available: boolean;
}

const EMPTY: VisitInventory = { counts: {}, truncated: false, available: false };

/** Bare host, lowercased, `www.` stripped. Returns null for non-web URLs. */
function hostOfUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null; // chrome://, file://, extension pages — not browsing
    }
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * All-time visit counts per host.
 *
 * `HistoryItem.visitCount` is cumulative across all time and is NOT scoped to
 * the search's `startTime`/`endTime`. That is why this takes no window
 * parameter: any window would be a lie about the number it returns, and
 * mislabelling a number is precisely the bug this module exists to fix. A
 * genuinely windowed count needs `history.getVisits()` per URL — thousands of
 * calls for a figure an inventory does not need.
 *
 * Fail-open: no permission, no API, or a rejected call yields an empty
 * inventory marked unavailable, and the page falls back to keel's own log.
 */
export async function visitsByDomain(): Promise<VisitInventory> {
  const api = (globalThis as { chrome?: { history?: typeof browser.history } }).chrome?.history;
  if (api === undefined) {
    return EMPTY;
  }

  let items: { url?: string; visitCount?: number }[];
  try {
    items = await api.search({ text: "", startTime: 0, maxResults: MAX_RESULTS });
  } catch (e) {
    console.warn("[keel areas] history.search unavailable:", e);
    return EMPTY;
  }

  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.url === undefined) {
      continue;
    }
    const host = hostOfUrl(item.url);
    if (host === null) {
      continue;
    }
    counts[host] = (counts[host] ?? 0) + (item.visitCount ?? 1);
  }

  return { counts, truncated: items.length >= MAX_RESULTS, available: true };
}
