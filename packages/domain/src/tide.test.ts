import { describe, expect, it } from "vitest";
import type { Bout } from "./bouts.js";
import { classifierFromLedger, tide } from "./tide.js";
import { createDomain, createDuration, type Domain } from "./value-objects.js";

const MIN = 60_000;

const classify = classifierFromLedger({
  "youtube.com": "observe",
  "chess.com": "observe",
  "github.com": "work",
  "legifrance.gouv.fr": "work",
});

/** Build a bout with the shape the tide reads. */
function bout(args: {
  dwellMin: number;
  switches: number;
  domains: Readonly<Record<string, number>>;
  longestRunMin?: number;
}): Bout {
  const byDomain = new Map<Domain, ReturnType<typeof createDuration>>();
  for (const [domain, minutes] of Object.entries(args.domains)) {
    byDomain.set(createDomain(domain), createDuration(minutes * MIN));
  }
  let dominant: Domain | null = null;
  let best = 0;
  for (const [domain, ms] of byDomain) {
    if (ms > best) {
      best = ms;
      dominant = domain;
    }
  }
  return {
    startTs: 0,
    endTs: args.dwellMin * MIN,
    dwellMs: createDuration(args.dwellMin * MIN),
    switches: args.switches,
    byDomain,
    dominant,
    longestRunMs: createDuration((args.longestRunMin ?? args.dwellMin) * MIN),
  };
}

describe("tide — the 2x2", () => {
  it("reads drifting when attention is both fragmented and voluminous", () => {
    // 141 min, 417 switches — 2026-08-05, the day that prompted this work.
    const reading = tide(
      [bout({ dwellMin: 141, switches: 417, domains: { "youtube.com": 77, "chess.com": 47, "linkedin.com": 17 } })],
      classify
    );
    expect(reading.label).toBe("drifting");
  });

  it("reads absorbed when a long stretch holds without switching", () => {
    // The 02:20 binge: 34 min, barely any switching.
    const reading = tide([bout({ dwellMin: 34, switches: 4, domains: { "youtube.com": 34 } })], classify);
    expect(reading.label).toBe("absorbed");
  });

  it("reads restless when switching is high but little time accrues", () => {
    const reading = tide([bout({ dwellMin: 8, switches: 30, domains: { "youtube.com": 8 } })], classify);
    expect(reading.label).toBe("restless");
  });

  it("reads settled when neither axis is high", () => {
    const reading = tide([bout({ dwellMin: 10, switches: 2, domains: { "youtube.com": 10 } })], classify);
    expect(reading.label).toBe("settled");
  });
});

describe("tide — absorption is disambiguated by domain class", () => {
  it("calls a long unbroken work stretch flow", () => {
    const reading = tide([bout({ dwellMin: 90, switches: 3, domains: { "github.com": 90 } })], classify);
    expect(reading.label).toBe("absorbed");
    expect(reading.absorption).toBe("flow");
  });

  it("calls the same shape on a watched domain a binge", () => {
    const reading = tide([bout({ dwellMin: 90, switches: 3, domains: { "youtube.com": 90 } })], classify);
    expect(reading.label).toBe("absorbed");
    expect(reading.absorption).toBe("binge");
  });

  it("leaves absorption unset when the tide is not absorbed", () => {
    const reading = tide([bout({ dwellMin: 8, switches: 30, domains: { "youtube.com": 8 } })], classify);
    expect(reading.absorption).toBeNull();
  });
});

describe("tide — reported numbers", () => {
  it("counts watched time from observe-class domains only", () => {
    const reading = tide(
      [bout({ dwellMin: 100, switches: 5, domains: { "youtube.com": 60, "github.com": 40 } })],
      classify
    );
    expect(reading.watchedMs).toBe(60 * MIN);
    expect(reading.attendedMs).toBe(100 * MIN);
  });

  it("aggregates across bouts and keeps the longest run of any of them", () => {
    const reading = tide(
      [
        bout({ dwellMin: 30, switches: 5, domains: { "youtube.com": 30 }, longestRunMin: 30 }),
        bout({ dwellMin: 20, switches: 5, domains: { "chess.com": 20 }, longestRunMin: 12 }),
      ],
      classify
    );
    expect(reading.attendedMs).toBe(50 * MIN);
    expect(reading.longestRunMs).toBe(30 * MIN);
    expect(reading.boutCount).toBe(2);
  });

  it("expresses fragmentation as switches per attended hour", () => {
    const reading = tide([bout({ dwellMin: 120, switches: 40, domains: { "youtube.com": 120 } })], classify);
    expect(reading.fragmentation).toBe(20);
  });
});

describe("tide — edges", () => {
  it("reads settled over an empty window without dividing by zero", () => {
    const reading = tide([], classify);
    expect(reading.label).toBe("settled");
    expect(reading.fragmentation).toBe(0);
    expect(reading.dominant).toBeNull();
  });

  it("classifies domains absent from the ledger as benign", () => {
    expect(classify(createDomain("some-new-site.example"))).toBe("benign");
  });
});
