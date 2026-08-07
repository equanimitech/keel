/**
 * Gate decision — pure. No chrome APIs, no clock, no DOM.
 *
 * A dwell gate fires every N minutes of accumulated attended time on its
 * domains. The state it needs is one number: the dwell reading at which it
 * last fired. Everything else is arithmetic.
 *
 * Why dwell and not wall-clock: a wall-clock timer fires while the tab sits
 * backgrounded, which trains dismissal — the gate becomes noise you swat. Dwell
 * only accrues while attention is actually on the page (`bouts()` gates on
 * focus and idle), so every firing lands mid-watch, where it means something.
 */

/** Everything the decision needs. */
export interface GateReading {
  /** Attended ms on the gate's domains, today. */
  readonly dwellMs: number;
  /** Dwell reading when this gate last fired. 0 if never. */
  readonly lastFiredAtMs: number;
  /** Interval between firings, in ms. */
  readonly everyMs: number;
}

/**
 * Should the gate fire now?
 *
 * Fires when dwell has crossed the next multiple of the interval since the
 * last firing. Deliberately *not* "dwell % interval < epsilon" — polling is
 * coarse and a modulo test skips a firing whenever the poll straddles the
 * boundary, which is exactly when a long uninterrupted watch is happening.
 */
export function shouldGate(reading: GateReading): boolean {
  if (reading.everyMs <= 0) {
    return false;
  }
  return reading.dwellMs - reading.lastFiredAtMs >= reading.everyMs;
}

/**
 * The reading to record once it fires.
 *
 * Snaps to the interval boundary rather than to current dwell, so a poll that
 * lands late does not push the next gate out by the overshoot. Ten-minute
 * gates stay on ten-minute centres for the whole session.
 */
export function nextFiredAt(reading: GateReading): number {
  const elapsed = reading.dwellMs - reading.lastFiredAtMs;
  const intervals = Math.floor(elapsed / reading.everyMs);
  return reading.lastFiredAtMs + intervals * reading.everyMs;
}

/** Minutes of dwell, for display. Floored — never overstate what was watched. */
export function dwellMinutes(dwellMs: number): number {
  return Math.floor(dwellMs / 60_000);
}

// ── Moment gate cadence ─────────────────────────────────────────
//
// The moment gate has no dwell to count against — it fires because a host is
// outside what the moment is about, which is true from the first paint. So its
// state is wall-clock: when did we last ask about this host.

/**
 * How long before the moment gate asks about the same host again.
 *
 * A gate that fires on every 30s poll is a nag, and a nag gets dismissed
 * without being read — the one failure mode a stopping cue cannot survive.
 * Asking again a quarter of an hour later keeps it a beat.
 */
export const MOMENT_GATE_REASK_MS = 15 * 60_000;

/** Is the moment gate allowed to ask about this host again? */
export function reaskDue(
  lastFiredAtMs: number,
  now: number,
  everyMs: number = MOMENT_GATE_REASK_MS
): boolean {
  return now - lastFiredAtMs >= everyMs;
}
