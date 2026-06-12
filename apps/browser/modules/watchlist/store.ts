/**
 * Watchlist mirror — the browser's copy of the observe tier.
 *
 * The source of truth is `~/.keel/config.json` (`watchlist.observe`),
 * shown by `keel rules`; extensions can't read the filesystem, so this
 * chrome.storage mirror is synced by hand on the manage page until a
 * relay exists. Domains here get DEEP sensors (key-action completions);
 * everything else gets coarse activity-writer logging only.
 *
 * Self-authored like the voice: keel never ships entries (the drogue's
 * seed blocklist is the lone, explicitly-consented exception).
 */

import { storage } from "wxt/storage";
import { normalizeDomain } from "../drogues/blocklist/store";

/** Observe-tier domains (normalized registrable hosts). */
export const observeDomains = storage.defineItem<string[]>(
  "local:watchlist:observe",
  { fallback: [] }
);

/** Add a domain to the observe tier. Returns the normalized host, or null. */
export async function addObserveDomain(input: string): Promise<string | null> {
  const domain = normalizeDomain(input);
  if (!domain) {
    return null;
  }
  const current = await observeDomains.getValue();
  if (!current.includes(domain)) {
    await observeDomains.setValue([...current, domain]);
  }
  return domain;
}

/** Remove a domain from the observe tier. */
export async function removeObserveDomain(domain: string): Promise<void> {
  const current = await observeDomains.getValue();
  if (current.includes(domain)) {
    await observeDomains.setValue(current.filter((d) => d !== domain));
  }
}
