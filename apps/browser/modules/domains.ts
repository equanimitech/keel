/**
 * Domain normalization — shared by the watchlist and the DNR projection.
 *
 * Lived in `drogues/blocklist/store.ts` until that store was removed
 * (2026-08-06, when `~/.keel/rules/*.json` became the single source of blocked
 * domains). It has nothing to do with blocklists specifically; both callers
 * need a bare registrable host out of freeform input.
 */

/**
 * Normalize freeform input to a bare host. Accepts full URLs, www., ports,
 * paths. Returns null if it doesn't look like a domain.
 *   "https://example.com/"  -> "example.com"
 *   "www.Example.com/x"     -> "example.com"
 */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) {
    return null;
  }
  s = s.replace(/^[a-z]+:\/\//, ""); // scheme
  s = s.split("/")[0].split("?")[0].split("#")[0]; // path/query/hash
  s = s.replace(/^www\./, ""); // common subdomain (DNR matches subdomains anyway)
  s = s.replace(/:\d+$/, ""); // port
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) {
    return null;
  }
  return s;
}
