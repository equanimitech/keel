/**
 * Gate decision — the effectful half. Reads the local event log, computes
 * dwell, and answers "should this page be gated right now?".
 *
 * Dwell is computed with `bouts()` from @keel/domain, deliberately: it is the
 * same function `tide` and every retrospective read through, so the number the
 * gate acts on is the number the analysis reports. A second dwell
 * implementation here would be a second answer to "how long was I on YouTube",
 * and the two would drift.
 */

import { bouts, createDomain } from "@keel/domain";
import { startOfLocalDay } from "@/modules/activity/events";
import { readEventsSince } from "@/modules/activity/log";
import { storage } from "wxt/storage";
import { nextFiredAt, shouldGate, type GateReading } from "./state";

/** A dwell gate as the extension sees it, pulled from ~/.keel/rules. */
export interface DwellGate {
  readonly ruleId: string;
  readonly domains: readonly string[];
  readonly everyMinutes: number;
  readonly prompt: string;
}

/** Dwell reading at which each gate last fired, keyed by rule id. Day-scoped. */
export const gateFiredAt = storage.defineItem<Record<string, number>>("local:friction:gateFiredAt", {
  fallback: {},
});

/** The day the fired-at map belongs to; a new day resets it. */
export const gateFiredDay = storage.defineItem<string>("local:friction:gateFiredDay", {
  fallback: "",
});

/**
 * Day key on the SAME boundary the dwell read uses.
 *
 * These must not disagree. `dwellTodayFor` reads from `startOfLocalDay`, so a
 * UTC-based key would leave a window (two hours, in Paris in August) where
 * dwell has already reset to ~0 while `lastFiredAtMs` still holds the previous
 * day's total — during which the gate silently never fires. That window falls
 * just after local midnight, which is exactly when a long night session is
 * running.
 */
function dayKey(now: number): string {
  return String(startOfLocalDay(now));
}

/** Attended ms today across `domains`, via the shared bout derivation. */
export async function dwellTodayFor(
  domains: readonly string[],
  now: number = Date.now()
): Promise<number> {
  const wanted = new Set(domains.map((d) => createDomain(d)));
  const events = await readEventsSince(startOfLocalDay(now));
  let total = 0;
  for (const bout of bouts(events)) {
    for (const [domain, ms] of bout.byDomain) {
      if (wanted.has(domain)) {
        total += ms;
      }
    }
  }
  return total;
}

export interface GateVerdict {
  readonly fire: boolean;
  readonly dwellMs: number;
  readonly prompt: string;
}

/**
 * Decide whether `gate` should fire, and record the firing if so.
 *
 * Recording happens here rather than in the content script because the content
 * script is untrusted and can be reloaded at will — a page that could decline
 * to report "I showed the gate" would get a free pass by refreshing.
 */
export async function evaluateGate(
  gate: DwellGate,
  now: number = Date.now()
): Promise<GateVerdict> {
  const today = dayKey(now);
  if ((await gateFiredDay.getValue()) !== today) {
    await gateFiredDay.setValue(today);
    await gateFiredAt.setValue({});
  }

  const dwellMs = await dwellTodayFor(gate.domains, now);
  const fired = await gateFiredAt.getValue();
  const reading: GateReading = {
    dwellMs,
    lastFiredAtMs: fired[gate.ruleId] ?? 0,
    everyMs: gate.everyMinutes * 60_000,
  };

  if (!shouldGate(reading)) {
    return { fire: false, dwellMs, prompt: gate.prompt };
  }
  await gateFiredAt.setValue({ ...fired, [gate.ruleId]: nextFiredAt(reading) });
  return { fire: true, dwellMs, prompt: gate.prompt };
}

/** The first gate covering `domain`, or null. */
export function gateFor(gates: readonly DwellGate[], domain: string): DwellGate | null {
  for (const gate of gates) {
    if (gate.domains.includes(domain)) {
      return gate;
    }
  }
  return null;
}
