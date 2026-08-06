import { describe, expect, it } from "vitest";
import {
  EMPTY,
  activeAt,
  arm,
  blockedDomains,
  nextLapse,
  prune,
  type CooldownState,
} from "./state.js";

const HOUR = 3_600_000;
const T0 = 1_000_000_000_000;

describe("arm — write-forward-only", () => {
  it("arms a cooldown for the requested duration", () => {
    const state = arm(EMPTY, { ruleId: "r1", durationMs: 2 * HOUR, domains: ["youtube.com"], now: T0 });
    expect(state["r1"].until).toBe(T0 + 2 * HOUR);
  });

  it("extends when re-armed for longer", () => {
    let state = arm(EMPTY, { ruleId: "r1", durationMs: HOUR, domains: ["youtube.com"], now: T0 });
    state = arm(state, { ruleId: "r1", durationMs: 3 * HOUR, domains: ["youtube.com"], now: T0 });
    expect(state["r1"].until).toBe(T0 + 3 * HOUR);
  });

  it("REFUSES to shorten — a weak moment cannot undo a clear one", () => {
    let state = arm(EMPTY, { ruleId: "r1", durationMs: 3 * HOUR, domains: ["youtube.com"], now: T0 });
    state = arm(state, { ruleId: "r1", durationMs: 1, domains: ["youtube.com"], now: T0 });
    expect(state["r1"].until).toBe(T0 + 3 * HOUR);
  });

  it("refuses to shorten even as time passes", () => {
    let state = arm(EMPTY, { ruleId: "r1", durationMs: 3 * HOUR, domains: ["youtube.com"], now: T0 });
    // An hour later, arming for 10 minutes must not pull the stamp in.
    state = arm(state, { ruleId: "r1", durationMs: 10 * 60_000, domains: ["youtube.com"], now: T0 + HOUR });
    expect(state["r1"].until).toBe(T0 + 3 * HOUR);
  });

  it("treats a negative duration as zero rather than rewinding", () => {
    const state = arm(EMPTY, { ruleId: "r1", durationMs: -HOUR, domains: ["a.com"], now: T0 });
    expect(state["r1"].until).toBe(T0);
  });

  it("merges domains rather than replacing them", () => {
    let state = arm(EMPTY, { ruleId: "r1", durationMs: HOUR, domains: ["youtube.com"], now: T0 });
    state = arm(state, { ruleId: "r1", durationMs: HOUR, domains: ["chess.com"], now: T0 });
    expect([...state["r1"].domains].sort()).toEqual(["chess.com", "youtube.com"]);
  });

  it("keeps cooldowns from different rules independent", () => {
    let state = arm(EMPTY, { ruleId: "r1", durationMs: HOUR, domains: ["youtube.com"], now: T0 });
    state = arm(state, { ruleId: "r2", durationMs: 2 * HOUR, domains: ["chess.com"], now: T0 });
    expect(Object.keys(state).sort()).toEqual(["r1", "r2"]);
  });

  it("has no disarm — the only way out is the clock", () => {
    const api = { arm, prune, activeAt, blockedDomains, nextLapse };
    expect(Object.keys(api)).not.toContain("disarm");
  });
});

describe("lapsing", () => {
  it("stops reporting a cooldown once it lapses", () => {
    const state = arm(EMPTY, { ruleId: "r1", durationMs: HOUR, domains: ["youtube.com"], now: T0 });
    expect(activeAt(state, T0 + HOUR - 1)).toHaveLength(1);
    expect(activeAt(state, T0 + HOUR)).toHaveLength(0);
  });

  it("prunes lapsed entries on the next write", () => {
    let state: CooldownState = arm(EMPTY, { ruleId: "old", durationMs: HOUR, domains: ["a.com"], now: T0 });
    state = arm(state, { ruleId: "new", durationMs: HOUR, domains: ["b.com"], now: T0 + 2 * HOUR });
    expect(Object.keys(state)).toEqual(["new"]);
  });

  it("reports the soonest lapse to drive one alarm", () => {
    let state = arm(EMPTY, { ruleId: "r1", durationMs: 3 * HOUR, domains: ["a.com"], now: T0 });
    state = arm(state, { ruleId: "r2", durationMs: HOUR, domains: ["b.com"], now: T0 });
    expect(nextLapse(state, T0)).toBe(T0 + HOUR);
  });

  it("reports no lapse when nothing holds", () => {
    expect(nextLapse(EMPTY, T0)).toBeNull();
  });
});

describe("blockedDomains — what DNR projects", () => {
  it("unions domains across active cooldowns", () => {
    let state = arm(EMPTY, { ruleId: "r1", durationMs: HOUR, domains: ["youtube.com"], now: T0 });
    state = arm(state, { ruleId: "r2", durationMs: HOUR, domains: ["chess.com", "youtube.com"], now: T0 });
    expect([...blockedDomains(state, T0)].sort()).toEqual(["chess.com", "youtube.com"]);
  });

  it("drops domains whose cooldown has lapsed", () => {
    let state = arm(EMPTY, { ruleId: "short", durationMs: HOUR, domains: ["chess.com"], now: T0 });
    state = arm(state, { ruleId: "long", durationMs: 3 * HOUR, domains: ["youtube.com"], now: T0 });
    expect(blockedDomains(state, T0 + 2 * HOUR)).toEqual(["youtube.com"]);
  });

  it("returns nothing when all have lapsed", () => {
    const state = arm(EMPTY, { ruleId: "r1", durationMs: HOUR, domains: ["youtube.com"], now: T0 });
    expect(blockedDomains(state, T0 + 2 * HOUR)).toEqual([]);
  });
});
