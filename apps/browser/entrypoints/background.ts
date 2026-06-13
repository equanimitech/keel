import { browser } from "wxt/browser";
import { startActivityWriter } from "@/modules/activity/writer";
import { userBlockedDomains } from "@/modules/drogues/blocklist/store";
import { syncBlocklistRules } from "@/modules/drogues/blocklist/sync";
import { flushToHost } from "@/modules/relay/client";

/**
 * Background service worker — pure observability plus the one surviving
 * commitment device.
 *
 * - Activity writer: coarse events for every domain (tab switches,
 *   navigations, focus/idle spans) + deep sensor events for watchlist
 *   observe-tier domains. See packages/domain/docs/event-taxonomy.md.
 * - Blocklist drogue: explicitly-consented precommitment (DNR rules) —
 *   NOT an attention shield; it survived the 2026-06-12 intervention
 *   retirement (docs/decisions/) by category.
 *
 * No shields, no signals, no budgets, no badges: interventions return
 * as a separate module (P5) measured against the baselines this writer
 * is accumulating.
 */
export default defineBackground(() => {
  // Registered synchronously so MV3 event wakeups re-attach listeners.
  startActivityWriter();

  // chrome.storage.local is the source of truth for the drogue; project
  // it onto DNR dynamic rules on startup and on every change.
  void syncBlocklistRules();
  userBlockedDomains.watch(() => void syncBlocklistRules());

  // Flush buffered events to the native host on cold start and on a periodic
  // alarm (eventual-consistency; no daemon, no open port).
  void flushToHost();
  browser.alarms.create("keel-relay-flush", { periodInMinutes: 5 });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keel-relay-flush") void flushToHost();
  });
});
