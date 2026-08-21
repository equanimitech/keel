/**
 * Sync the effective blocklist → declarativeNetRequest *dynamic* rules.
 *
 * The `fences` collection is the source of truth, pushed into
 * chrome.storage.local by the native host as the armed record; this projects
 * that cache onto a single idempotent `block` rule. Re-running replaces it, so
 * it stays in sync after any add/remove with no leftover state.
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

import { normalizeDomain } from "../../domains";
import { cooldownDomains } from "../../friction/cooldown/store";
import { browserStandingHosts } from "../../interventions/armed";
import { armedCache } from "../../interventions/store";

// Standing blocks, from the armed cache. Slice E had to give the armed record a
// THIRD rule id, because the policy mirror carried a second list of blocked
// hosts projected from `~/.kairos/keel/rules/*.json` and the two refreshed on
// different schedules. Migration step 5 retired that store, so there is one
// source again and one rule id for it.
const BLOCK_RULE_ID = 1;
// Cooldowns get their own rule id so arming and lapsing never disturb the
// permanent blocklist — an expiring cooldown removes only its own rule. This one
// stays: a cooldown is armed by a local gesture, not by a push, so it genuinely
// does refresh on a different schedule from everything above.
const COOLDOWN_RULE_ID = 2;

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

  // Cooldowns are time-bound: included only while their stamp holds. When one
  // lapses the rule is simply not re-added and the sites come back — nothing
  // needs to actively unblock.
  //
  // A single malformed entry makes DNR reject the whole rule, which would fail
  // *open* and silently unblock everything. Normalize and drop the rest.
  const cooling = [
    ...new Set(
      (await cooldownDomains()).map(normalizeDomain).filter((d): d is string => d !== null)
    ),
  ];

  // The armed cache is the source, and it is read from local storage — no round
  // trip, so a navigation never waits on the host and a dead host never lifts a
  // shield. Only browser-enforced standing cooldowns arrive here; a resolver
  // block holds somewhere this surface is not.
  //
  // The reliability claim that used to belong to the policy mirror moves here
  // unchanged, and is stronger: `replaceArmed` keeps the previous cache when a
  // push is malformed and applies an explicitly empty one, so a dead host cannot
  // lift a standing block and a fence taken down still comes down. The uncovered
  // case is the same as before — a fresh profile that has never been pushed to
  // blocks nothing until the relay first answers.
  const domains = browserStandingHosts(await armedCache.getValue());

  const addRules: DnrRule[] = [];
  if (domains.length > 0) {
    addRules.push({
      id: BLOCK_RULE_ID,
      priority: 1,
      action: { type: "block" },
      condition: {
        requestDomains: [...domains],
        resourceTypes: ALL_RESOURCE_TYPES,
      },
    });
  }
  if (cooling.length > 0) {
    addRules.push({
      id: COOLDOWN_RULE_ID,
      priority: 1,
      action: { type: "block" },
      condition: {
        requestDomains: cooling,
        resourceTypes: ALL_RESOURCE_TYPES,
      },
    });
  }
  try {
    await dnr.updateDynamicRules({
      removeRuleIds: [BLOCK_RULE_ID, COOLDOWN_RULE_ID],
      addRules,
    });
    console.info(
      `[keel blocklist] synced ${domains.length} armed domain(s)` +
        (cooling.length > 0 ? ` + ${cooling.length} under cooldown` : ""),
      domains,
      cooling
    );
  } catch (err) {
    console.error("[keel blocklist] updateDynamicRules failed:", err);
  }
}
