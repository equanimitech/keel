import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Armed } from "../../interventions/armed";

/**
 * Migration step 5, at the surface that actually blocks.
 *
 * Slice E added a third DNR rule id because the extension had two sources for
 * "what is blocked": the policy mirror, projected host-side from
 * `~/.kairos/keel/rules/*.json`, and the armed cache, pushed from `fences`. It
 * said in a comment that the two collapse at step 5. They do, here: the armed
 * cache is the only source, so there is one rule id again and no way for the
 * two mirrors to disagree about which hosts are down.
 */

let armed: Armed = {};
let cooling: string[] = [];

vi.mock("../../interventions/store", () => ({
  armedCache: { getValue: async () => armed },
}));

vi.mock("../../friction/cooldown/store", () => ({
  cooldownDomains: async () => cooling,
}));

interface Captured {
  removeRuleIds?: number[];
  addRules?: {
    id: number;
    condition: { requestDomains: string[] };
  }[];
}

let captured: Captured | null = null;

beforeEach(() => {
  armed = {};
  cooling = [];
  captured = null;
  (globalThis as unknown as { chrome: unknown }).chrome = {
    declarativeNetRequest: {
      updateDynamicRules: async (options: Captured) => {
        captured = options;
      },
    },
  };
});

function standingBlock(id: string, domain: string): Armed[string] {
  return {
    ruleId: id,
    label: id,
    domains: [domain],
    primitive: { kind: "cooldown", enforcement: "browser", standing: true },
    proceed: { label: "Lift it", action: { type: "out_of_band", note: "out of band" } },
    deliveryProbability: 1,
  };
}

describe("syncBlocklistRules, on one store", () => {
  it("blocks what the armed cache carries, under the one blocklist rule id", async () => {
    armed = { a: standingBlock("a", "chess.com"), b: standingBlock("b", "youtube.com") };
    const { syncBlocklistRules } = await import("./sync");
    await syncBlocklistRules();

    const rules = captured?.addRules ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe(1);
    expect([...rules[0].condition.requestDomains].sort()).toEqual([
      "chess.com",
      "youtube.com",
    ]);
  });

  it("keeps the cooldown on its own rule id, so a lapse disturbs nothing standing", async () => {
    armed = { a: standingBlock("a", "chess.com") };
    cooling = ["news.example.com"];
    const { syncBlocklistRules } = await import("./sync");
    await syncBlocklistRules();

    const ids = (captured?.addRules ?? []).map((r) => r.id).sort();
    expect(ids).toEqual([1, 2]);
  });

  it("removes only the two rule ids it owns — the third is retired with the second store", async () => {
    const { syncBlocklistRules } = await import("./sync");
    await syncBlocklistRules();
    expect(captured?.removeRuleIds).toEqual([1, 2]);
  });

  it("adds nothing when nothing is armed, which is a fence taken down landing", async () => {
    const { syncBlocklistRules } = await import("./sync");
    await syncBlocklistRules();
    expect(captured?.addRules).toEqual([]);
  });

  it("does not block a resolver-enforced entry — it holds somewhere this surface is not", async () => {
    armed = {
      r: {
        ...standingBlock("r", "linkedin.com"),
        primitive: { kind: "cooldown", enforcement: "resolver", standing: true },
      },
    };
    const { syncBlocklistRules } = await import("./sync");
    await syncBlocklistRules();
    expect(captured?.addRules).toEqual([]);
  });
});
