/**
 * Tab identity — an opaque per-tab uuid so read-side can reconstruct
 * per-tab journeys and disambiguate concurrent same-domain tabs.
 *
 * The map lives in chrome.storage.session (survives MV3 SW recycling within a
 * browser session). This module is the PURE reducer; the storage wiring is in
 * writer.ts. A uuid is not content — safe at every tier.
 */

export type TabMap = Readonly<Record<number, string>>;

/** Return the uuid for `tabId`, minting one via `mint()` if unseen. */
export function tabUuid(
  map: TabMap,
  tabId: number,
  mint: () => string
): { uuid: string; map: TabMap } {
  const existing = map[tabId];
  if (existing !== undefined) {
    return { uuid: existing, map };
  }
  const uuid = mint();
  return { uuid, map: { ...map, [tabId]: uuid } };
}
