import { describe, expect, it } from "vitest";
import { gatePrompt, holdSeconds } from "./overlay";

describe("gatePrompt", () => {
  it("uses the author's words for an intention gate", () => {
    expect(gatePrompt({ type: "intention", prompt: "Is this still what you came for?" })).toBe(
      "Is this still what you came for?"
    );
  });

  it("does not invent a prompt for the mechanisms that have none", () => {
    // The bug this file exists to prevent: a delay gate rendered with the DEFAULT
    // intention prompt, so the author's mechanism was replaced by a different one.
    expect(gatePrompt({ type: "delay", seconds: 20 })).not.toContain("came for");
    expect(gatePrompt({ type: "confirmation" })).toBe("Continue?");
  });

  it("counts breaths in the singular when there is one", () => {
    expect(gatePrompt({ type: "breath", cycles: 1 })).toBe("One breath.");
    expect(gatePrompt({ type: "breath", cycles: 3 })).toBe("3 breaths.");
  });
});

describe("holdSeconds", () => {
  it("holds proceed for a delay", () => {
    expect(holdSeconds({ type: "delay", seconds: 20 })).toBe(20);
  });

  it("paces a breath gate at a real breathing rate", () => {
    expect(holdSeconds({ type: "breath", cycles: 3 })).toBe(30);
  });

  it("never holds the mechanisms that are not a wait", () => {
    expect(holdSeconds({ type: "intention", prompt: "x" })).toBe(0);
    expect(holdSeconds({ type: "confirmation" })).toBe(0);
  });

  it("clamps a negative or absurd declaration instead of trusting it", () => {
    expect(holdSeconds({ type: "delay", seconds: -5 })).toBe(0);
    expect(holdSeconds({ type: "breath", cycles: -1 })).toBe(0);
  });
});
