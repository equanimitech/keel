import { describe, expect, it } from "vitest";
import {
  INTERVENTION_KINDS,
  interventionEvent,
  isSettlement,
  settlementKind,
} from "./events";

describe("interventionEvent — a delivery is a completion in `logs`", () => {
  it("builds a browser-surface event with the reserved kind", () => {
    const event = interventionEvent({
      kind: "intervention_shown",
      ruleId: "gate-linkedin",
      domain: "linkedin.com",
      primitive: "gate",
      id: "fixed-id",
      ts: 1_760_000_000_000,
      sessionId: "epoch",
    });
    expect(event).toEqual({
      id: "fixed-id",
      surface: "browser",
      kind: "intervention_shown",
      ts: 1_760_000_000_000,
      sessionId: "epoch",
      payload: { domain: "linkedin.com", ruleId: "gate-linkedin", primitive: "gate" },
    });
  });

  it("carries no duration, because no interval was measured", () => {
    const event = interventionEvent({
      kind: "intervention_dismissed",
      ruleId: "r",
      domain: "d.com",
      primitive: "gate",
      id: "i",
      ts: 1,
      sessionId: "s",
    });
    expect(event.durationMs).toBeUndefined();
  });

  it("carries domains only — never a url, a title, or a prompt", () => {
    const event = interventionEvent({
      kind: "intervention_clicked_through",
      ruleId: "r",
      domain: "chess.com",
      primitive: "cooldown",
      id: "i",
      ts: 1,
      sessionId: "s",
    });
    expect(Object.keys(event.payload).sort()).toEqual(["domain", "primitive", "ruleId"]);
  });

  it("claims exactly the three kinds the taxonomy reserved for a delivery", () => {
    expect([...INTERVENTION_KINDS]).toEqual([
      "intervention_shown",
      "intervention_dismissed",
      "intervention_clicked_through",
    ]);
  });
});

describe("isSettlement — the page reports its own outcome, and is not trusted", () => {
  it("accepts a well-formed settlement", () => {
    expect(isSettlement({ type: "keel-intervention-settled", ruleId: "r", proceeded: true })).toBe(
      true
    );
  });

  it("rejects anything else", () => {
    expect(isSettlement(null)).toBe(false);
    expect(isSettlement({ type: "keel-gate-check" })).toBe(false);
    expect(isSettlement({ type: "keel-intervention-settled", ruleId: 7, proceeded: true })).toBe(
      false
    );
    expect(isSettlement({ type: "keel-intervention-settled", ruleId: "", proceeded: true })).toBe(
      false
    );
    expect(isSettlement({ type: "keel-intervention-settled", ruleId: "r" })).toBe(false);
  });

  it("rejects a rule id long enough to be a payload rather than an id", () => {
    expect(
      isSettlement({ type: "keel-intervention-settled", ruleId: "x".repeat(129), proceeded: true })
    ).toBe(false);
  });
});

describe("settlementKind — proceeding and leaving are different facts", () => {
  it("maps proceeding to clicked_through", () => {
    expect(settlementKind(true)).toBe("intervention_clicked_through");
  });

  it("maps leaving to dismissed", () => {
    expect(settlementKind(false)).toBe("intervention_dismissed");
  });
});
