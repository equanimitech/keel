/**
 * Sync the effective blocklist → declarativeNetRequest *dynamic* rules.
 *
 * chrome.storage.local is the source of truth; this projects it onto a single
 * idempotent `block` rule. Re-running replaces it, so it stays in sync after any
 * add/remove with no leftover state.
 *
 * Why `block` and not `redirect` to a branded page: DNR's `redirect` (and
 * `modifyHeaders`) actions require *host permissions* for the target domain.
 * keel ships ZERO host_permissions on purpose — that's the structural guarantee
 * that it cannot read your browsing. `block` needs no host access, so it
 * preserves that property while actually stopping the page from loading. The
 * cost is the generic browser "blocked" page instead of the keel block page.
 *
 * Uses the native `chrome.declarativeNetRequest` (always present in MV3; the
 * WXT `browser` shim does not surface this namespace). Errors are logged, never
 * swallowed — a silently-failing blocker is worse than no blocker.
 */

import { effectiveDomains } from "./store";

const BLOCK_RULE_ID = 1;

// All resource types, main_frame + sub_frame included, so a blocked domain is
// stopped whether navigated to directly or embedded.
const ALL_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "script",
  "image",
  "media",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "font",
  "stylesheet",
  "websocket",
  "webtransport",
  "other",
] as const;

interface DnrRule {
  id: number;
  priority: number;
  action: { type: "block" };
  condition: { requestDomains: string[]; resourceTypes: readonly string[] };
}

type Dnr = {
  updateDynamicRules(options: {
    removeRuleIds?: number[];
    addRules?: DnrRule[];
  }): Promise<void>;
  getDynamicRules?(): Promise<unknown[]>;
};

function getDnr(): Dnr | null {
  const c = (globalThis as { chrome?: { declarativeNetRequest?: Dnr } }).chrome;
  return c?.declarativeNetRequest ?? null;
}

export async function syncBlocklistRules(): Promise<void> {
  const dnr = getDnr();
  if (!dnr) {
    console.error("[keel blocklist] chrome.declarativeNetRequest unavailable");
    return;
  }

  const domains = await effectiveDomains();

  const addRules: DnrRule[] =
    domains.length === 0
      ? []
      : [
          {
            id: BLOCK_RULE_ID,
            priority: 1,
            action: { type: "block" },
            condition: {
              requestDomains: domains,
              resourceTypes: ALL_RESOURCE_TYPES,
            },
          },
        ];

  try {
    await dnr.updateDynamicRules({
      removeRuleIds: [BLOCK_RULE_ID],
      addRules,
    });
    console.info(
      `[keel blocklist] synced ${domains.length} blocked domain(s)`,
      domains
    );
  } catch (err) {
    console.error("[keel blocklist] updateDynamicRules failed:", err);
  }
}
