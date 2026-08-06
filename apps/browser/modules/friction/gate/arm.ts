/**
 * Arm the dwell gate in a page.
 *
 * Polls the background rather than counting locally, for two reasons: the page
 * is untrusted (a local counter is a counter the page can reset by reloading),
 * and dwell must come from the same `bouts()` derivation everything else reads,
 * which lives where the log lives.
 *
 * A 30s poll is deliberately coarse. `shouldGate` is written to survive coarse
 * and skipped polls — it compares against the last firing rather than testing a
 * modulo, so a poll that lands late still fires, and one that misses an entire
 * interval still fires once. Cheaper than a push channel, with no correctness
 * cost.
 */

import { showGate } from "./overlay";

const POLL_MS = 30_000;

interface GateVerdictMessage {
  readonly fire?: boolean;
  readonly dwellMs?: number;
  readonly prompt?: string;
}

/** Start polling. Idempotent per page — a second call is a no-op. */
export function armDwellGate(): void {
  let showing = false;

  const check = async (): Promise<void> => {
    if (showing || document.hidden) {
      return; // Never gate a tab the user is not looking at.
    }
    let verdict: GateVerdictMessage;
    try {
      verdict = ((await browser.runtime.sendMessage({ type: "keel-gate-check" })) ??
        {}) as GateVerdictMessage;
    } catch {
      return; // Background asleep or reloading — try again next tick.
    }
    if (verdict.fire !== true) {
      return;
    }
    showing = true;
    const proceeded = await showGate({
      prompt: verdict.prompt ?? "Is this still what you came for?",
      dwellMinutes: Math.floor((verdict.dwellMs ?? 0) / 60_000),
      proceedLabel: "Keep watching",
      abortLabel: "Close the tab",
    });
    showing = false;
    if (!proceeded) {
      // The page cannot close a tab it did not open, so ask the background.
      void browser.runtime.sendMessage({ type: "keel-gate-leave" }).catch(() => {
        // Fall back to leaving the media paused — the gate already did that.
      });
    }
  };

  setInterval(() => void check(), POLL_MS);
  // Also check on return to the tab: a long background stretch accrues no
  // dwell, but coming back is exactly when a stopping cue lands well.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void check();
    }
  });
}
