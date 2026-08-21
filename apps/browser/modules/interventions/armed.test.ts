import { describe, expect, it } from "vitest";
import {
  armedFor,
  armedGatesFor,
  browserStandingHosts,
  exitLine,
  gatesFrom,
  parseArmed,
  type ArmedIntervention,
} from "./armed";

/** A minimally well-formed standing host block, as the host projects one. */
function hostBlock(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ruleId: "shield-youtube",
    label: "YouTube",
    domains: ["youtube.com"],
    primitive: { kind: "cooldown", enforcement: "browser", standing: true },
    proceed: { label: "Lift it", action: { type: "out_of_band", note: "edit the rule file" } },
    deliveryProbability: 1,
    ...over,
  };
}

function dwell(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ruleId: "gate-linkedin",
    label: "LinkedIn",
    domains: ["linkedin.com"],
    primitive: {
      kind: "gate",
      everyMinutes: 20,
      friction: { type: "intention", prompt: "Still what you came for?" },
    },
    proceed: { label: "Keep going", action: { type: "continue" } },
    abort: { label: "Close the tab" },
    deliveryProbability: 1,
    ...over,
  };
}

describe("parseArmed — malformed input never clears the cache", () => {
  it("returns null for a non-object push", () => {
    expect(parseArmed(null)).toBeNull();
    expect(parseArmed("nope")).toBeNull();
    expect(parseArmed(42)).toBeNull();
    expect(parseArmed(undefined)).toBeNull();
  });

  it("returns null for an array, which is not a record collection", () => {
    expect(parseArmed([hostBlock()])).toBeNull();
  });

  it("honours an explicitly empty record — a deliberate lift must land", () => {
    expect(parseArmed({})).toEqual({ armed: {}, refused: [] });
  });
});

describe("parseArmed — invariant 6, no exit means no arming", () => {
  it("refuses an entry carrying no proceed affordance", () => {
    const parsed = parseArmed({ a: hostBlock({ proceed: undefined }) });
    expect(parsed?.armed).toEqual({});
    expect(parsed?.refused).toEqual([{ ruleId: "shield-youtube", reason: "no_exit" }]);
  });

  it("refuses an exit with no label — an invisible exit is not an exit", () => {
    const parsed = parseArmed({
      a: hostBlock({ proceed: { label: "   ", action: { type: "continue" } } }),
    });
    expect(parsed?.armed).toEqual({});
    expect(parsed?.refused[0]?.reason).toBe("no_exit");
  });

  it("refuses an exit whose action is not one the extension can offer", () => {
    const parsed = parseArmed({
      a: hostBlock({ proceed: { label: "Out", action: { type: "teleport" } } }),
    });
    expect(parsed?.armed).toEqual({});
    expect(parsed?.refused[0]?.reason).toBe("no_exit");
  });

  it("keeps the sound entries when one of several is exitless", () => {
    const parsed = parseArmed({ a: hostBlock(), b: dwell({ proceed: undefined }) });
    expect(Object.keys(parsed?.armed ?? {})).toEqual(["shield-youtube"]);
    expect(parsed?.refused).toEqual([{ ruleId: "gate-linkedin", reason: "no_exit" }]);
  });
});

describe("parseArmed — shape", () => {
  it("accepts a standing browser cooldown", () => {
    const parsed = parseArmed({ "shield-youtube": hostBlock() });
    expect(parsed?.armed["shield-youtube"]).toEqual<ArmedIntervention>({
      ruleId: "shield-youtube",
      label: "YouTube",
      domains: ["youtube.com"],
      primitive: { kind: "cooldown", enforcement: "browser", standing: true },
      proceed: { label: "Lift it", action: { type: "out_of_band", note: "edit the rule file" } },
      deliveryProbability: 1,
    });
  });

  it("accepts a dwell gate with both affordances", () => {
    const parsed = parseArmed({ "gate-linkedin": dwell() });
    const entry = parsed?.armed["gate-linkedin"];
    expect(entry?.primitive).toEqual({
      kind: "gate",
      everyMinutes: 20,
      friction: { type: "intention", prompt: "Still what you came for?" },
    });
    expect(entry?.abort).toEqual({ label: "Close the tab" });
  });

  it("falls back to the record key when the entry omits its own id", () => {
    const parsed = parseArmed({ "from-the-key": hostBlock({ ruleId: undefined }) });
    expect(parsed?.armed["from-the-key"]?.ruleId).toBe("from-the-key");
  });

  it("normalizes domains and drops the ones that are not hosts", () => {
    const parsed = parseArmed({
      a: hostBlock({ domains: ["https://www.Chess.com/play", "not a domain", "chess.com"] }),
    });
    expect(parsed?.armed["shield-youtube"]?.domains).toEqual(["chess.com"]);
  });

  it("refuses an entry left with no domains at all", () => {
    const parsed = parseArmed({ a: hostBlock({ domains: ["not a domain"] }) });
    expect(parsed?.armed).toEqual({});
    expect(parsed?.refused[0]?.reason).toBe("no_domains");
  });

  it("refuses a primitive the extension cannot actuate", () => {
    const parsed = parseArmed({ a: hostBlock({ primitive: { kind: "intercept" } }) });
    expect(parsed?.armed).toEqual({});
    expect(parsed?.refused[0]?.reason).toBe("unactuatable");
  });

  it("clamps deliveryProbability and defaults it to 1", () => {
    expect(parseArmed({ a: hostBlock({ deliveryProbability: 4 }) })?.armed["shield-youtube"]
      ?.deliveryProbability).toBe(1);
    expect(parseArmed({ a: hostBlock({ deliveryProbability: -1 }) })?.armed["shield-youtube"]
      ?.deliveryProbability).toBe(0);
    expect(parseArmed({ a: hostBlock({ deliveryProbability: undefined }) })?.armed[
      "shield-youtube"
    ]?.deliveryProbability).toBe(1);
  });
});

describe("reading the cache", () => {
  const armed = parseArmed({ a: hostBlock(), b: dwell() })?.armed ?? {};

  it("armedFor matches on the exact host", () => {
    expect(armedFor(armed, "youtube.com").map((a) => a.ruleId)).toEqual(["shield-youtube"]);
    expect(armedFor(armed, "example.com")).toEqual([]);
  });

  it("armedFor matches a subdomain, because DNR does too", () => {
    expect(armedFor(armed, "m.youtube.com").map((a) => a.ruleId)).toEqual(["shield-youtube"]);
  });

  it("armedFor does not match a host that merely ends in the same letters", () => {
    expect(armedFor(armed, "notyoutube.com")).toEqual([]);
  });

  it("browserStandingHosts carries only what this surface can enforce", () => {
    expect(browserStandingHosts(armed)).toEqual(["youtube.com"]);
  });

  it("browserStandingHosts skips resolver- and device-enforced blocks", () => {
    const resolver =
      parseArmed({
        a: hostBlock({
          primitive: { kind: "cooldown", enforcement: "resolver", standing: true },
        }),
      })?.armed ?? {};
    expect(browserStandingHosts(resolver)).toEqual([]);
  });

  it("armedGatesFor returns only the gates covering the host", () => {
    expect(armedGatesFor(armed, "www.linkedin.com").map((g) => g.ruleId)).toEqual([
      "gate-linkedin",
    ]);
    // The standing block on youtube is a cooldown, not a gate.
    expect(armedGatesFor(armed, "youtube.com")).toEqual([]);
  });

  it("a gate carrying a cooldown-shaped exit degrades to continue, keeping its label", () => {
    const odd =
      parseArmed({
        a: dwell({ proceed: { label: "Push on", action: { type: "wait" } } }),
      })?.armed ?? {};
    expect(gatesFrom(odd)[0]?.proceed).toEqual({
      label: "Push on",
      action: { type: "continue" },
    });
  });

  it("gatesFrom projects the gates the dwell interpreter already speaks", () => {
    expect(gatesFrom(armed)).toEqual([
      {
        ruleId: "gate-linkedin",
        domains: ["linkedin.com"],
        everyMinutes: 20,
        friction: { type: "intention", prompt: "Still what you came for?" },
        proceed: { label: "Keep going", action: { type: "continue" } },
        abort: { label: "Close the tab" },
      },
    ]);
  });
});

describe("exitLine — the sentence the person reads", () => {
  it("says how a standing block is lifted", () => {
    const a = parseArmed({ a: hostBlock() })?.armed["shield-youtube"] as ArmedIntervention;
    expect(exitLine(a)).toBe("Lift it — edit the rule file");
  });

  it("says a wait is a wait", () => {
    const a = parseArmed({
      a: hostBlock({ proceed: { label: "Wait it out", action: { type: "wait" } } }),
    })?.armed["shield-youtube"] as ArmedIntervention;
    expect(exitLine(a)).toBe("Wait it out");
  });

  it("names the prompt an intention unlock asks for", () => {
    const a = parseArmed({
      a: hostBlock({
        proceed: { label: "Unlock", action: { type: "intention", prompt: "What for?" } },
      }),
    })?.armed["shield-youtube"] as ArmedIntervention;
    expect(exitLine(a)).toBe("Unlock — What for?");
  });

  it("names the cost of a delayed unlock", () => {
    const a = parseArmed({
      a: hostBlock({
        proceed: { label: "Unlock", action: { type: "delay", seconds: 90 } },
      }),
    })?.armed["shield-youtube"] as ArmedIntervention;
    expect(exitLine(a)).toBe("Unlock — after 90s");
  });
});
