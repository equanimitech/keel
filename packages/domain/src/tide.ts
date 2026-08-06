/**
 * Tides — observational, never a protocol.
 *
 * A tide is a *read* of how attention is behaving. It is not an intervention
 * and it does not decide anything. This separation matters: the 2026-06-17
 * decision used "tide" for both the observation and the driver of friction,
 * which conflated describing with prescribing. Here a tide only describes.
 * Modes (protocols) are composed from tides elsewhere, and a tide may never
 * arm anything stronger than a gate.
 *
 * Two measured axes over a window of bouts:
 *
 *                   low volume    high volume
 *   low fragment    settled       absorbed
 *   high fragment   restless      drifting
 *
 * The same shape means different things by what held the attention, which is
 * why the domain classifier is required rather than optional:
 *
 *   absorbed × work    = flow
 *   absorbed × observe = binge
 *
 * The reading is a pure function over bouts, so it is swappable — a local
 * model reading raw bouts can replace this later without touching the
 * substrate, and this deterministic version is the baseline to evaluate any
 * such model against.
 */

import type { Bout } from "./bouts.js";
import { createDuration, type Domain, type Duration } from "./value-objects.js";

/** How a domain is classified in the watchlist ledger. */
export type DomainClass = "work" | "benign" | "observe";

/** Resolves a domain to its ledger class. Unknown domains classify `benign`. */
export type DomainClassifier = (domain: Domain) => DomainClass;

export type TideLabel = "settled" | "absorbed" | "restless" | "drifting";

/** What an `absorbed` tide means, given what held the attention. */
export type Absorption = "flow" | "binge";

export interface TideThresholds {
  /** Switches per attended hour above which attention reads fragmented. */
  readonly fragmentationPerHour: number;
  /** Attended time above which the window reads high-volume. */
  readonly volumeMs: number;
}

/**
 * Provisional defaults, derived by eyeballing one user's 14-day history.
 *
 * These SHOULD become personal baselines computed from the user's own
 * distribution — that is the whole observe-first posture, and absolute
 * constants are a placeholder standing in until ~21 days of data exist.
 * Treat a label produced with these as a hypothesis, not a fact.
 */
export const DEFAULT_THRESHOLDS: TideThresholds = {
  fragmentationPerHour: 20,
  volumeMs: 25 * 60 * 1000,
};

export interface TideReading {
  readonly label: TideLabel;
  /** Switches per attended hour. */
  readonly fragmentation: number;
  /** Total attended time across the window. */
  readonly attendedMs: Duration;
  /** Attended time on `observe`-class domains — the "watched" number. */
  readonly watchedMs: Duration;
  /** Longest unbroken single-domain stretch in the window. */
  readonly longestRunMs: Duration;
  readonly dominant: Domain | null;
  readonly dominantClass: DomainClass | null;
  /** Set only when the label is `absorbed`. */
  readonly absorption: Absorption | null;
  /** Bouts the reading was computed from — the provenance anchor. */
  readonly boutCount: number;
}

/** Read the tide over a window of bouts. Caller decides the window. */
export function tide(
  window: readonly Bout[],
  classify: DomainClassifier,
  thresholds: TideThresholds = DEFAULT_THRESHOLDS
): TideReading {
  let attendedMs = 0;
  let watchedMs = 0;
  let switches = 0;
  let longestRunMs = 0;
  const totals = new Map<Domain, number>();

  for (const bout of window) {
    attendedMs += bout.dwellMs;
    switches += bout.switches;
    longestRunMs = Math.max(longestRunMs, bout.longestRunMs);
    for (const [domain, ms] of bout.byDomain) {
      totals.set(domain, (totals.get(domain) ?? 0) + ms);
      if (classify(domain) === "observe") {
        watchedMs += ms;
      }
    }
  }

  let dominant: Domain | null = null;
  let best = 0;
  for (const [domain, ms] of totals) {
    if (ms > best) {
      best = ms;
      dominant = domain;
    }
  }

  // Guard the divide: a window with no attended time has no rate to report.
  const hours = attendedMs / 3_600_000;
  const fragmentation = hours > 0 ? switches / hours : 0;

  const fragmented = fragmentation >= thresholds.fragmentationPerHour;
  const voluminous = attendedMs >= thresholds.volumeMs;

  let label: TideLabel;
  if (fragmented) {
    label = voluminous ? "drifting" : "restless";
  } else {
    label = voluminous ? "absorbed" : "settled";
  }

  const dominantClass = dominant === null ? null : classify(dominant);
  let absorption: Absorption | null = null;
  if (label === "absorbed" && dominantClass !== null) {
    absorption = dominantClass === "work" ? "flow" : "binge";
  }

  return {
    label,
    fragmentation,
    attendedMs: createDuration(attendedMs),
    watchedMs: createDuration(watchedMs),
    longestRunMs: createDuration(longestRunMs),
    dominant,
    dominantClass,
    absorption,
    boutCount: window.length,
  };
}

/** Build a classifier from a watchlist-ledger map. Unknown → `benign`. */
export function classifierFromLedger(
  ledger: Readonly<Record<string, string>>
): DomainClassifier {
  return (domain: Domain): DomainClass => {
    const raw = ledger[domain];
    if (raw === "work" || raw === "observe" || raw === "benign") {
      return raw;
    }
    return "benign";
  };
}
