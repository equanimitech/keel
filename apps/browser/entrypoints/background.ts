import { shields } from "@/modules/shields/registry";
import { signals } from "@/modules/signals/registry";
import { shieldEnabled, signalEnabled, domainCooldown } from "@/utils/storage";
import { userBlockedDomains } from "@/modules/drogues/blocklist/store";
import { syncBlocklistRules } from "@/modules/drogues/blocklist/sync";
import { startActivityWriter } from "@/modules/activity/writer";

/**
 * Background service worker.
 *
 * Tab-contextual badge (priority order):
 *   1. Active cooldown → purple badge with remaining minutes (e.g. "15m")
 *   2. Any shield/signal active → green checkmark
 *   3. Otherwise → hidden
 */

// ── Unified intervention list for badge logic ─────────────────────

type Intervention = {
  id: string;
  domain: string;
  defaultEnabled: boolean;
  getStore: () => ReturnType<typeof shieldEnabled>;
};

const allInterventions: Intervention[] = [
  ...shields.map((s) => ({
    id: s.id,
    domain: s.domain,
    defaultEnabled: s.defaultEnabled,
    getStore: () => shieldEnabled(s.id, s.defaultEnabled),
  })),
  ...signals.map((s) => ({
    id: s.id,
    domain: s.domain,
    defaultEnabled: s.defaultEnabled,
    getStore: () => signalEnabled(s.id, s.defaultEnabled),
  })),
];

const allDomains = [...new Set(allInterventions.map((i) => i.domain))];

// ── Cooldown stores (one per tracked domain) ──────────────────────

const cooldownStores = allDomains.map((d) => ({
  domain: d,
  store: domainCooldown(d),
}));

export default defineBackground(() => {
  // ── Activity writer: persist browser attention events (slice C) ──
  // Registered synchronously so MV3 event wakeups re-attach listeners.
  startActivityWriter();

  // ── Blocklist Drogue: keep DNR dynamic rules in sync with the store ──
  // chrome.storage.local is the source of truth; project it onto dynamic
  // rules on startup and on every change (add/remove from the manage page).
  void syncBlocklistRules();
  userBlockedDomains.watch(() => void syncBlocklistRules());

  // Update badge when any intervention's state changes.
  for (const intervention of allInterventions) {
    intervention.getStore().watch(() => refreshActiveBadge());
  }

  // Update badge when any cooldown store changes.
  for (const { store } of cooldownStores) {
    store.watch(() => refreshActiveBadge());
  }

  // Update badge when the active tab changes.
  browser.tabs.onActivated.addListener(({ tabId }) => {
    browser.tabs.get(tabId).then((tab) => {
      if (tab.url) updateBadgeForTab(tabId, tab.url);
    });
  });

  // Update badge when a tab navigates.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      updateBadgeForTab(tabId, changeInfo.url);
    }
  });

  // Refresh every 30s so the minute counter stays current.
  setInterval(() => refreshActiveBadge(), 30_000);
});

/**
 * Re-evaluate badge for whichever tab is currently active.
 */
async function refreshActiveBadge(): Promise<void> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id != null && tab.url) {
    await updateBadgeForTab(tab.id, tab.url);
  }
}

/**
 * Set badge for a specific tab.
 *
 * Priority:
 *   1. Active cooldown on the tab's domain → purple + "Xm"
 *   2. Active shield/signal → green checkmark
 *   3. None → hidden
 */
async function updateBadgeForTab(
  tabId: number,
  url: string
): Promise<void> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    await browser.action.setBadgeText({ text: "", tabId });
    return;
  }

  // ── 1. Cooldown takes priority ────────────────────────────────
  for (const { domain, store } of cooldownStores) {
    if (hostname.includes(domain)) {
      const until = await store.getValue();
      if (until && until > Date.now()) {
        const remainingSec = Math.ceil((until - Date.now()) / 1000);
        await browser.action.setBadgeText({
          text: formatBadgeTime(remainingSec),
          tabId,
        });
        await browser.action.setBadgeBackgroundColor({
          color: "#a855f7", // purple-500
          tabId,
        });
        return;
      }
    }
  }

  // ── 2. Shield / signal active → green checkmark ───────────────
  const domainInterventions = allInterventions.filter((i) =>
    hostname.includes(i.domain)
  );

  if (domainInterventions.length === 0) {
    await browser.action.setBadgeText({ text: "", tabId });
    return;
  }

  const states = await Promise.all(
    domainInterventions.map((i) => i.getStore().getValue())
  );
  const anyActive = states.some(Boolean);

  await browser.action.setBadgeText({
    text: anyActive ? "\u2713" : "",
    tabId,
  });
  await browser.action.setBadgeBackgroundColor({
    color: anyActive ? "#4ade80" : "#94a3b8",
    tabId,
  });
}

/**
 * Compact time format for the extension badge (max ~4 chars).
 */
function formatBadgeTime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  if (d > 0) {
    return `${d}d`;
  }
  const h = Math.floor(seconds / 3600);
  if (h > 0) {
    return `${h}h`;
  }
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m}m`;
}
