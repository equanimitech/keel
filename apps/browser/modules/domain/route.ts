/**
 * Route registry — the shared, normalized route vocabulary.
 *
 * Used by the browser writer (observe-tier route logging) AND the cold-start
 * bootstrap (history route classification) so both surfaces normalize
 * identically. Routes are coarse mechanic-level handles ("/shorts", "/feed"),
 * never full paths/queries/fragments — the privacy gradient is load-bearing.
 */

/** host → recognized route prefixes, longest-first within each host. */
export const ROUTE_REGISTRY: Readonly<Record<string, readonly string[]>> = {
  "youtube.com": ["/shorts", "/watch", "/feed", "/results"],
  "linkedin.com": ["/feed", "/messaging", "/jobs"],
};

/**
 * Normalize a (host, pathname) to a coarse route handle, or null.
 * - Registered prefix match wins ("/shorts/abc" → "/shorts").
 * - Else, on a registered host, the first path segment ("/results").
 * - Root/empty path, or a host with no registry entry, → null.
 * Defensive: strips anything from the first "?" or "#" if a caller passes more
 * than a bare pathname, and never returns query/fragment text.
 */
export function normalizeRoute(host: string, pathname: string): string | null {
  const prefixes = ROUTE_REGISTRY[host];
  if (prefixes === undefined) {
    return null;
  }
  const clean = pathname.split(/[?#]/, 1)[0] ?? "";
  for (const prefix of prefixes) {
    if (clean === prefix || clean.startsWith(prefix + "/")) {
      return prefix;
    }
  }
  const segment = clean.split("/").filter(Boolean)[0];
  if (segment === undefined || segment.startsWith("@")) {
    return null; // user-identifying handle (e.g. /@creator) is not a coarse route
  }
  return "/" + segment;
}
