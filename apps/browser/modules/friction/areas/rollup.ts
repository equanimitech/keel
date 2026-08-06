/**
 * Roll history up into the rows the Areas page sorts.
 *
 * Pure. The page hands in dwell-by-key and the area map; this decides what a
 * row is.
 *
 * Two things it does:
 *
 * 1. **Collapse paths under their host.** The ledger carries path-keyed entries
 *    (`youtube.com/shorts`, `linkedin.com/feed`) because they are genuinely
 *    different rooms behind one door. But four YouTube rows is noise when you
 *    are sorting — you want one YouTube row carrying all of it, and the paths
 *    only when they disagree about which area they belong to.
 *
 * 2. **Rank by attended time, not alphabetically.** The point of sorting your
 *    own history is that the biggest pulls come first. A list in alphabetical
 *    order asks you to find the important ones yourself.
 */

export interface PathRow {
  readonly key: string;
  readonly dwellMs: number;
  readonly areaId: string | null;
}

export interface DomainRow {
  /** The host, e.g. `youtube.com`. */
  readonly domain: string;
  /** Attended ms in the dwell window, including every path under it. */
  readonly dwellMs: number;
  /** All-time visits from browser history. 0 when history is unavailable. */
  readonly visits: number;
  /**
   * Did anything happen in the dwell window?
   *
   * Distinct from `dwellMs > 0` in intent: this is what lets the UI say "no
   * recent activity" instead of "0m". A zero implies a measurement was taken
   * and came back empty; absence means no measurement applies. Conflating them
   * is how `news.ycombinator.com` came to look like somewhere he had been.
   */
  readonly hasActivity: boolean;
  readonly areaId: string | null;
  /** Paths that carry their own assignment — the split case, shown nested. */
  readonly paths: readonly PathRow[];
}

/** The host part of a ledger key: everything before the first slash. */
export function hostOf(key: string): string {
  const slash = key.indexOf("/");
  return slash === -1 ? key : key.slice(0, slash);
}

/**
 * Build rows from dwell + assignments.
 *
 * Keys present in either input appear: a domain with history but no assignment
 * is exactly what needs sorting, and one assigned but not yet visited should
 * not silently vanish.
 */
export function rollup(
  dwellByKey: Readonly<Record<string, number>>,
  areaMap: Readonly<Record<string, string>>,
  visitsByHost: Readonly<Record<string, number>> = {}
): readonly DomainRow[] {
  const keys = new Set([
    ...Object.keys(dwellByKey),
    ...Object.keys(areaMap),
    ...Object.keys(visitsByHost),
  ]);
  const byHost = new Map<string, { dwellMs: number; paths: PathRow[]; areaId: string | null }>();

  for (const key of keys) {
    const host = hostOf(key);
    let entry = byHost.get(host);
    if (entry === undefined) {
      entry = { dwellMs: 0, paths: [], areaId: null };
      byHost.set(host, entry);
    }
    const dwellMs = dwellByKey[key] ?? 0;
    entry.dwellMs += dwellMs;
    if (key === host) {
      entry.areaId = areaMap[key] ?? null;
    } else if (areaMap[key] !== undefined) {
      // Only surface a path when it carries its own assignment; otherwise it
      // is already represented by the host row it rolled into.
      entry.paths.push({ key, dwellMs, areaId: areaMap[key] });
    }
  }

  const rows: DomainRow[] = [];
  for (const [domain, entry] of byHost) {
    rows.push({
      domain,
      dwellMs: entry.dwellMs,
      visits: visitsByHost[domain] ?? 0,
      hasActivity: entry.dwellMs > 0,
      areaId: entry.areaId,
      paths: [...entry.paths].sort((a, b) => b.dwellMs - a.dwellMs),
    });
  }
  // Attention outranks frequency: a site with hours on it should sit above one
  // merely opened often. Visits break the tie — they are the only signal for
  // anything outside the dwell window — and the name settles the rest, so ties
  // stay stable across reloads rather than shuffling on every open.
  return rows.sort(
    (a, b) =>
      b.dwellMs - a.dwellMs || b.visits - a.visits || a.domain.localeCompare(b.domain)
  );
}

/** Split rows into assigned (grouped by area) and unsorted. */
export function partition(
  rows: readonly DomainRow[]
): { readonly assigned: ReadonlyMap<string, readonly DomainRow[]>; readonly unsorted: readonly DomainRow[] } {
  const assigned = new Map<string, DomainRow[]>();
  const unsorted: DomainRow[] = [];
  for (const row of rows) {
    if (row.areaId === null && row.paths.length === 0) {
      unsorted.push(row);
      continue;
    }
    // A host with only path-level assignments belongs under each of them.
    const ids = new Set<string>(row.areaId === null ? [] : [row.areaId]);
    for (const path of row.paths) {
      if (path.areaId !== null) {
        ids.add(path.areaId);
      }
    }
    if (ids.size === 0) {
      unsorted.push(row);
      continue;
    }
    for (const id of ids) {
      const list = assigned.get(id) ?? [];
      list.push(row);
      assigned.set(id, list);
    }
  }
  return { assigned, unsorted };
}

/** All-time visit count, grouped for legibility. Blank at zero. */
export function visitsLabel(visits: number): string {
  return visits <= 0 ? "" : `${visits.toLocaleString()} visits`;
}

/** Compact dwell label. Blank when nothing was measured, never "0m". */
export function dwellLabel(ms: number): string {
  if (ms <= 0) {
    return "";
  }
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
