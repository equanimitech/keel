/**
 * User-defined blocklist store — the "user can define a blocker" half.
 *
 * The seed list (seed.ts) is code/Claude-owned; this is the runtime,
 * user-owned half. State lives in chrome.storage.local — local-first, no server.
 * The effective blocklist is `unique(seed ∪ user)`.
 *
 * Seed domains are not removable here on purpose: removing one is a deliberate,
 * slightly-effortful act (edit seed.ts + rebuild) — compassionate friction, the
 * sovereignty-respecting resolution of "a block you opted into but can still
 * leave". User-added domains are freely removable.
 */

import { storage } from "wxt/storage";
import { SEED_BLOCKED_DOMAINS } from "./seed";

/** User-added blocked domains (normalized registrable hosts). */
export const userBlockedDomains = storage.defineItem<string[]>(
  "local:drogue:blocklist:domains",
  { fallback: [] }
);

/**
 * Normalize freeform input to a bare host. Accepts full URLs, www., ports,
 * paths. Returns null if it doesn't look like a domain.
 *   "https://beeg.com/"  -> "beeg.com"
 *   "www.PornHub.com/x"  -> "pornhub.com"
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

/** unique(seed ∪ user) — what actually gets blocked. */
export async function effectiveDomains(): Promise<string[]> {
  const user = await userBlockedDomains.getValue();
  return [...new Set([...SEED_BLOCKED_DOMAINS, ...user])];
}

export function isSeed(domain: string): boolean {
  return (SEED_BLOCKED_DOMAINS as readonly string[]).includes(domain);
}

/** Add a domain to the user list. Returns the normalized host, or null if invalid. */
export async function addDomain(input: string): Promise<string | null> {
  const domain = normalizeDomain(input);
  if (!domain) {
    return null;
  }
  const cur = await userBlockedDomains.getValue();
  if (!cur.includes(domain) && !isSeed(domain)) {
    await userBlockedDomains.setValue([...cur, domain]);
  }
  return domain;
}

/** Remove a user-added domain. Seed domains are not removable here (edit seed.ts). */
export async function removeDomain(domain: string): Promise<void> {
  const cur = await userBlockedDomains.getValue();
  if (cur.includes(domain)) {
    await userBlockedDomains.setValue(cur.filter((d) => d !== domain));
  }
}
