/**
 * Signal domain types.
 *
 * A SignalDefinition is a Value Object — immutable metadata describing
 * an additive awareness intervention. Unlike shields (which remove cues),
 * signals introduce information the platform deliberately hides.
 *
 * The `mechanism` field uses `BehavioralMechanism` from the shared domain,
 * ensuring consistent behavioral classification across surfaces.
 */
import type { BehavioralMechanism } from "@keel/domain";

export interface SignalDefinition {
  readonly id: string; // unique, kebab-case (e.g. "youtube-watch-time")
  readonly name: string; // human display name (e.g. "Watch Time")
  readonly description: string; // one-liner for popup tooltip
  readonly domain: string; // grouping key + badge matching (e.g. "youtube.com")
  readonly icon: string; // emoji for popup row
  readonly mechanism: BehavioralMechanism; // behavioral classification from shared domain
  readonly defaultEnabled: boolean; // initial state on first install
}
