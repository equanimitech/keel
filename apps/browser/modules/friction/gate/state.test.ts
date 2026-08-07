import { describe, expect, it } from "vitest";
import {
  dwellMinutes,
  MOMENT_GATE_REASK_MS,
  nextFiredAt,
  reaskDue,
  shouldGate,
} from "./state.js";

const MIN = 60_000;
const TEN = 10 * MIN;

describe("shouldGate", () => {
  it("holds off before the first interval", () => {
    expect(shouldGate({ dwellMs: 9 * MIN, lastFiredAtMs: 0, everyMs: TEN })).toBe(false);
  });

  it("fires exactly on the interval", () => {
    expect(shouldGate({ dwellMs: TEN, lastFiredAtMs: 0, everyMs: TEN })).toBe(true);
  });

  it("holds off again until the next interval", () => {
    expect(shouldGate({ dwellMs: 15 * MIN, lastFiredAtMs: TEN, everyMs: TEN })).toBe(false);
    expect(shouldGate({ dwellMs: 20 * MIN, lastFiredAtMs: TEN, everyMs: TEN })).toBe(true);
  });

  it("still fires when a coarse poll overshoots the boundary", () => {
    // The failure mode a modulo test has: poll lands at 10m30s, not 10m00s.
    expect(shouldGate({ dwellMs: 10.5 * MIN, lastFiredAtMs: 0, everyMs: TEN })).toBe(true);
  });

  it("fires when a poll skips a whole interval", () => {
    // Laptop asleep, or the service worker was evicted for 25 minutes.
    expect(shouldGate({ dwellMs: 25 * MIN, lastFiredAtMs: 0, everyMs: TEN })).toBe(true);
  });

  it("never fires on a zero or negative interval", () => {
    expect(shouldGate({ dwellMs: 60 * MIN, lastFiredAtMs: 0, everyMs: 0 })).toBe(false);
    expect(shouldGate({ dwellMs: 60 * MIN, lastFiredAtMs: 0, everyMs: -TEN })).toBe(false);
  });
});

describe("nextFiredAt — stays on interval centres", () => {
  it("snaps to the boundary, not to the overshoot", () => {
    // Fired at 10m30s of dwell; the next gate is due at 20m, not 20m30s.
    expect(nextFiredAt({ dwellMs: 10.5 * MIN, lastFiredAtMs: 0, everyMs: TEN })).toBe(TEN);
  });

  it("does not drift across many firings", () => {
    let last = 0;
    for (const dwell of [10.4, 20.7, 30.2, 40.9]) {
      last = nextFiredAt({ dwellMs: dwell * MIN, lastFiredAtMs: last, everyMs: TEN });
    }
    expect(last).toBe(40 * MIN);
  });

  it("credits every interval a long gap skipped", () => {
    expect(nextFiredAt({ dwellMs: 25 * MIN, lastFiredAtMs: 0, everyMs: TEN })).toBe(20 * MIN);
  });
});

describe("dwellMinutes", () => {
  it("floors rather than overstating what was watched", () => {
    expect(dwellMinutes(9.9 * MIN)).toBe(9);
    expect(dwellMinutes(TEN)).toBe(10);
  });
});

describe("reaskDue", () => {
  it("asks the first time it sees a host", () => {
    expect(reaskDue(0, Date.now())).toBe(true);
  });

  it("stays quiet across the polls that follow a firing", () => {
    // armDwellGate polls every 30s. Without this, one out-of-scope tab would be
    // asked the same question thirty times in a quarter of an hour.
    const firedAt = 1_000_000;
    expect(reaskDue(firedAt, firedAt + 30_000)).toBe(false);
    expect(reaskDue(firedAt, firedAt + 14 * MIN)).toBe(false);
  });

  it("asks again once the interval has passed", () => {
    const firedAt = 1_000_000;
    expect(reaskDue(firedAt, firedAt + MOMENT_GATE_REASK_MS)).toBe(true);
    expect(reaskDue(firedAt, firedAt + 60 * MIN)).toBe(true);
  });

  it("keeps the beat coarse enough not to become a nag", () => {
    expect(MOMENT_GATE_REASK_MS).toBeGreaterThanOrEqual(10 * MIN);
  });
});
