import { describe, expect, it } from "vitest";
import {
  cooldownDuration,
  createRule,
  createRuleId,
  warningsFor,
  type AmbientRule,
  type CooldownSpec,
  type GateSpec,
  type Rule,
  type SelfArmedRule,
} from "./rules.js";

const gate: GateSpec = {
  kind: "gate",
  trigger: { type: "navigation" },
  frictionType: { type: "intention", prompt: "What are you here for?" },
  proceedAffordance: { label: "Continue", action: { type: "continue" } },
};

const cooldown: CooldownSpec = {
  kind: "cooldown",
  trigger: { type: "manual", affordances: [{ location: "tray", options: [{ label: "2h", seconds: 7200 }] }] },
  duration: { baseSeconds: 7200 },
  scope: { disabledTargets: { primary: "body", fallbacks: [] }, persistedKey: "cooldown:youtube" },
  unlockPath: { type: "wait" },
  surface: { templateId: "locked", anchors: { primary: "body", fallbacks: [] } },
};

function ruleWith(overrides: Partial<SelfArmedRule> = {}): SelfArmedRule {
  return {
    id: createRuleId("youtube-gate"),
    name: "YouTube gate",
    description: "A beat before the feed.",
    domains: ["youtube.com"],
    matches: ["*://youtube.com/*"],
    mechanism: "friction",
    defaultEnabled: true,
    fadeEligibility: "manual",
    persistAcrossSpaNavigation: true,
    arming: "self-now",
    primitives: [gate],
    ...overrides,
  };
}

describe("the ambient × cooldown invariant is structural", () => {
  it("permits a tide to arm a gate", () => {
    const ambient: AmbientRule = {
      ...ruleWith(),
      arming: "ambient",
      primitives: [gate],
    };
    expect(createRule(ambient).ok).toBe(true);
  });

  it("will not compile a tide-armed cooldown", () => {
    const illegal: AmbientRule = {
      ...ruleWith(),
      arming: "ambient",
      // @ts-expect-error — CooldownSpec is excluded from AmbientPrimitive by
      // construction. If this line ever stops erroring, the invariant that
      // keeps keel from imposing locks has silently been lost.
      primitives: [cooldown],
    };
    expect(illegal).toBeDefined();
  });

  it("permits the user to arm a cooldown themselves", () => {
    const armed: SelfArmedRule = ruleWith({ arming: "self-now", primitives: [cooldown] });
    expect(createRule(armed).ok).toBe(true);
  });

  it("permits a cooldown armed in foresight for a later self", () => {
    const armed: SelfArmedRule = ruleWith({ arming: "self-foresight", primitives: [cooldown] });
    expect(createRule(armed).ok).toBe(true);
  });
});

describe("createRule — equanimous constraints", () => {
  it("rejects an empty match list", () => {
    const result = createRule(ruleWith({ matches: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("matches is empty");
    }
  });

  it("rejects global scope", () => {
    const result = createRule(ruleWith({ matches: ["*://*/*"] }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unresolvable dependency", () => {
    const result = createRule(ruleWith({ dependsOn: [createRuleId("nope")] }), []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("not committed");
    }
  });

  it("accepts a dependency that is already committed", () => {
    const dep = createRuleId("youtube-watch-time");
    expect(createRule(ruleWith({ dependsOn: [dep] }), [dep]).ok).toBe(true);
  });

  it("rejects an escalating cooldown unless escalation is accepted deliberately", () => {
    const escalating: CooldownSpec = {
      ...cooldown,
      duration: {
        baseSeconds: 600,
        modifiers: [{ condition: { op: "selector_exists", selector: ".loss" }, multiplier: 2 }],
      },
    };
    const denied = createRule(ruleWith({ primitives: [escalating] }));
    expect(denied.ok).toBe(false);

    const accepted = createRule(ruleWith({ primitives: [escalating], allowEscalation: true }));
    expect(accepted.ok).toBe(true);
  });

  it("gives errors an agent can act on", () => {
    const result = createRule(ruleWith({ matches: [] }));
    if (!result.ok) {
      // Actionable means it carries a correctly-formatted example.
      expect(result.errors[0]).toContain('["*://youtube.com/*"]');
    }
  });
});

describe("warningsFor — advisory, never blocking", () => {
  it("flags a delay long enough to lean on willpower", () => {
    const slow: GateSpec = { ...gate, frictionType: { type: "delay", seconds: 45 } };
    const codes = warningsFor(ruleWith({ primitives: [slow] })).map((w) => w.code);
    expect(codes).toContain("gate.delay.long");
  });

  it("flags a bare confirmation as dumb friction", () => {
    const dumb: GateSpec = { ...gate, frictionType: { type: "confirmation" } };
    const codes = warningsFor(ruleWith({ primitives: [dumb] })).map((w) => w.code);
    expect(codes).toContain("gate.friction.low_value");
  });

  it("flags a cooldown long enough to read as punishment", () => {
    const long: CooldownSpec = { ...cooldown, duration: { baseSeconds: 4000 } };
    const codes = warningsFor(ruleWith({ primitives: [long] })).map((w) => w.code);
    expect(codes).toContain("cooldown.duration.long");
  });

  it("stays quiet on a well-shaped rule", () => {
    expect(warningsFor(ruleWith())).toEqual([]);
  });

  it("does not make a warned rule invalid", () => {
    const dumb: GateSpec = { ...gate, frictionType: { type: "confirmation" } };
    expect(createRule(ruleWith({ primitives: [dumb] })).ok).toBe(true);
  });
});

describe("standing cooldowns — what the drogue always was", () => {
  const standing: CooldownSpec = {
    ...cooldown,
    duration: { standing: true },
    unlockPath: { type: "out_of_band", note: "edit ~/.keel/rules/vice-permanent.json" },
  };

  it("accepts a standing block with an out-of-band lift", () => {
    expect(createRule(ruleWith({ arming: "self-foresight", primitives: [standing] })).ok).toBe(true);
  });

  it("refuses to let a standing block claim waiting as its exit", () => {
    const lying: CooldownSpec = { ...standing, unlockPath: { type: "wait" } };
    const result = createRule(ruleWith({ arming: "self-foresight", primitives: [lying] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("out_of_band");
    }
  });

  it("has no duration to compute", () => {
    expect(cooldownDuration(standing)).toBeNull();
  });

  it("is not flagged as an over-long boundary", () => {
    const codes = warningsFor(ruleWith({ arming: "self-foresight", primitives: [standing] })).map((w) => w.code);
    expect(codes).not.toContain("cooldown.duration.long");
  });

  it("still cannot be armed by a tide", () => {
    const illegal: AmbientRule = {
      ...ruleWith(),
      arming: "ambient",
      // @ts-expect-error — standing or not, a cooldown is not ambient-armable.
      primitives: [standing],
    };
    expect(illegal).toBeDefined();
  });
});

describe("cooldownDuration", () => {
  it("returns the base duration when nothing applies", () => {
    expect(cooldownDuration(cooldown)).toBe(7_200_000);
  });

  it("applies a modifier only when its condition is active", () => {
    const condition = { op: "selector_exists", selector: ".loss" } as const;
    const escalating: CooldownSpec = {
      ...cooldown,
      duration: { baseSeconds: 600, modifiers: [{ condition, multiplier: 2 }] },
    };
    expect(cooldownDuration(escalating)).toBe(600_000);
    expect(cooldownDuration(escalating, [condition])).toBe(1_200_000);
  });
});

describe("every notch keel owns stays escapable", () => {
  it("requires a proceed affordance on gates", () => {
    // Structural: GateSpec.proceedAffordance is not optional. Omitting it is a
    // compile error, which is why there is no runtime check for it.
    const g: GateSpec = gate;
    expect(g.proceedAffordance.label).toBeTruthy();
  });

  it("requires an unlock path on cooldowns", () => {
    const c: CooldownSpec = cooldown;
    expect(c.unlockPath.type).toBe("wait");
  });

  it("has no wall primitive to construct", () => {
    const kinds = new Set<Rule["primitives"][number]["kind"]>([
      "transform",
      "gate",
      "cooldown",
      "observe",
      "schedule",
      "intercept",
      "actuate",
    ]);
    expect(kinds.has("wall" as never)).toBe(false);
  });
});
