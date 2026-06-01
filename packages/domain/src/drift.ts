/**
 * Drift signal types for the keel platform.
 *
 * A drift signal represents the moment a user moves away
 * from their declared intention toward a compulsive pattern.
 *
 * Desktop: drift = switching to a blocked app
 * Browser: drift = navigating to / staying on a shielded domain
 *
 * Both surfaces can emit drift signals. Cross-surface awareness
 * (future) would let desktop drift detection modulate browser
 * shield intensity and vice versa.
 */

// ── Drift Action ────────────────────────────────────────────────

/**
 * What the user did in response to a drift notification.
 *
 * - "dismissed": User acknowledged the notification
 * - "ignored": User saw it but continued drifting
 * - "returned": User went back to their intended task
 * - "acknowledged": User actively confirmed awareness (e.g., cooldown "I'm sure")
 */
export type DriftAction =
  | "dismissed"
  | "ignored"
  | "returned"
  | "acknowledged";

// ── Drift Signal ────────────────────────────────────────────────

/** A recorded instance of drift away from intention. */
export interface DriftSignal {
  readonly id: string;
  readonly sessionId: string;
  /** Target domain where drift occurred */
  readonly domain: string;
  /** Desktop-specific: the macOS app name */
  readonly appName?: string;
  readonly detectedAt: Date;
  readonly resolvedAt?: Date;
  readonly action?: DriftAction;
}
