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

import { safeRedirect, type GateFriction } from "./decide";
import { showGate } from "./overlay";

const POLL_MS = 30_000;

interface GateVerdictMessage {
  readonly fire?: boolean;
  readonly dwellMs?: number;
  readonly friction?: GateFriction;
  readonly proceed?: { label?: string; action?: { type?: string; to?: string } };
  readonly abort?: { label?: string };
  /** @deprecated pre-2026-08-08 background. */
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
    // Labels and mechanism come from the rule now. The fallbacks are only for a
    // verdict from an older background; they are the same strings the page used to
    // hard-code, which is exactly what made the coercion invisible.
    const proceeded = await showGate({
      friction: verdict.friction ?? {
        type: "intention",
        prompt: verdict.prompt ?? "Is this still what you came for?",
      },
      dwellMinutes: Math.floor((verdict.dwellMs ?? 0) / 60_000),
      proceedLabel: verdict.proceed?.label ?? "Keep watching",
      abortLabel: verdict.abort?.label ?? "Close the tab",
    });
    showing = false;
    // A declared `redirect` now actually reroutes. It used to be parsed, stored, and
    // ignored — every proceed was a `continue`.
    const action = verdict.proceed?.action;
    if (proceeded && action?.type === "redirect" && typeof action.to === "string") {
      // Re-validate at the page even though the host already did. This runs in a
      // content script on every site, so the target reaches `location.assign` with the
      // page in scope — a `javascript:` or `data:` scheme here is script execution, not
      // a reroute. The host check stops a bad rule shipping; this one stops a mirror
      // that was written before the host had the check.
      const target = safeRedirect(action.to);
      if (target !== null) {
        window.location.assign(target);
      }
      return;
    }
    if (proceeded && action?.type === "abort") {
      void browser.runtime.sendMessage({ type: "keel-gate-leave" }).catch(() => {});
      return;
    }
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
