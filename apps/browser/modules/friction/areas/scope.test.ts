import { describe, expect, it } from "vitest";
import { DEFAULT_SCOPE, SCOPES, narrower, scopeById, scopeSince, wider } from "./scope.js";

const DAY = 24 * 60 * 60 * 1000;

describe("scopeSince", () => {
  it("means since local midnight for `today`, not the last 24 hours", () => {
    // Asked "how much today", nobody means a rolling window.
    const now = new Date(2026, 7, 6, 14, 30).getTime();
    const midnight = new Date(2026, 7, 6, 0, 0, 0, 0).getTime();
    expect(scopeSince(scopeById("day"), now)).toBe(midnight);
  });

  it("counts nothing from yesterday under `today`, even at 00:05", () => {
    const now = new Date(2026, 7, 6, 0, 5).getTime();
    const since = scopeSince(scopeById("day"), now);
    expect(since).toBeLessThanOrEqual(now);
    expect(now - since).toBeLessThan(DAY);
    expect(new Date(since).getDate()).toBe(6);
  });

  it("rolls for wider scopes, where a calendar edge would be arbitrary", () => {
    const now = new Date(2026, 7, 6, 14, 30).getTime();
    expect(scopeSince(scopeById("week"), now)).toBe(now - 7 * DAY);
    expect(scopeSince(scopeById("month"), now)).toBe(now - 30 * DAY);
  });
});

describe("scopeById", () => {
  it("resolves each known scope", () => {
    for (const scope of SCOPES) {
      expect(scopeById(scope.id).id).toBe(scope.id);
    }
  });

  it("falls back rather than throwing on a stale stored value", () => {
    expect(scopeById("fortnight").id).toBe(DEFAULT_SCOPE);
  });
});

describe("scope horizons", () => {
  it("orders narrow to wide, so the control reads as one zoom axis", () => {
    const days = SCOPES.map((s) => s.days);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it("puts the unbounded scope at the far end, never in the middle", () => {
    // `all` is the only scope whose cost grows without limit, so it must be a
    // deliberate step outward rather than something you land on by accident.
    const unbounded = SCOPES.filter((s) => !Number.isFinite(s.days));
    expect(unbounded).toHaveLength(1);
    expect(SCOPES[SCOPES.length - 1].id).toBe("all");
  });

  it("reaches the whole log — the store is local and refuses nothing", () => {
    expect(scopeSince(scopeById("all"), Date.now())).toBe(0);
  });
});

describe("zoom stepping", () => {
  it("steps out one level at a time", () => {
    expect(wider(scopeById("day"))?.id).toBe("week");
    expect(wider(scopeById("week"))?.id).toBe("month");
    expect(wider(scopeById("month"))?.id).toBe("all");
  });

  it("steps in one level at a time", () => {
    expect(narrower(scopeById("all"))?.id).toBe("month");
    expect(narrower(scopeById("week"))?.id).toBe("day");
  });

  it("stops at each end rather than wrapping — so the control can disable", () => {
    expect(wider(scopeById("all"))).toBeNull();
    expect(narrower(scopeById("day"))).toBeNull();
  });
});
