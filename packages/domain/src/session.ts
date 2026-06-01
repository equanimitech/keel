/**
 * Session context types for the keel platform.
 *
 * Sessions represent a bounded period of user activity.
 *
 * Desktop: explicit focus sessions — user declares intent,
 *   starts a timer, gets notified on drift.
 *
 * Browser: always-on — shields/signals activate continuously
 *   based on domain. No explicit "start" from the user.
 *
 * The shared SessionContext type allows both surfaces to
 * reason about "what is the user doing right now?" without
 * coupling to each other's activation model.
 */

import type { Duration } from "./value-objects.js";

// ── Session Types ───────────────────────────────────────────────

export type SessionType = "focus" | "always-on";
export type SessionStatus = "active" | "completed" | "paused";

// ── Session Context ─────────────────────────────────────────────

/**
 * Shared context describing a user's current session.
 *
 * Desktop creates these on "Start Session".
 * Browser infers them from tab activity (domain + time).
 */
export interface SessionContext {
  readonly id: string;
  readonly type: SessionType;
  readonly status: SessionStatus;
  readonly startedAt: Date;
  readonly endedAt?: Date;
  /** Optional task description (desktop: user-declared; browser: domain) */
  readonly intent?: string;
  /** Optional max duration for timeboxed sessions */
  readonly maxDuration?: Duration;
}
