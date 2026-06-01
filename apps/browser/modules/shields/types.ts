/**
 * Shield domain types.
 *
 * A ShieldDefinition is a Value Object — immutable metadata describing
 * a single atomic attention intervention. The runtime state (enabled/disabled)
 * lives in chrome.storage, not here.
 *
 * The `mechanism` field uses `BehavioralMechanism` from the shared domain,
 * ensuring consistent behavioral classification across surfaces.
 */
import type { BehavioralMechanism } from "@keel/domain";

export interface ShieldDefinition {
  readonly id: string; // unique, kebab-case (e.g. "youtube-shorts-scroll-lock")
  readonly name: string; // human display name (e.g. "Shorts Scroll Lock")
  readonly description: string; // one-liner for popup tooltip
  readonly domain: string; // grouping key + badge matching (e.g. "youtube.com")
  readonly icon: string; // emoji for popup row
  readonly mechanism: BehavioralMechanism; // behavioral classification from shared domain
  readonly defaultEnabled: boolean; // initial state on first install
}
