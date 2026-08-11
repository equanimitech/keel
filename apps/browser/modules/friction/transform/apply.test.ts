import { describe, expect, it } from "vitest";
import type { PageTransform } from "../policy/store";
import { transformCss, transformsFor } from "./apply";

const hide = (ruleId: string, domains: string[], primary: string, fallbacks: string[] = []): PageTransform => ({
  ruleId,
  domains,
  targets: { primary, fallbacks },
  replacement: { type: "hide" },
});

describe("transformsFor", () => {
  const t = hide("shorts", ["youtube.com"], "#shelf");

  it("matches the domain and its subdomains", () => {
    expect(transformsFor([t], "youtube.com")).toHaveLength(1);
    expect(transformsFor([t], "www.youtube.com")).toHaveLength(1);
    expect(transformsFor([t], "m.youtube.com")).toHaveLength(1);
  });

  it("does not match a domain that merely ends in the same letters", () => {
    // The bug this exists to prevent: a suffix check without the dot boundary
    // hides half of an unrelated site.
    expect(transformsFor([t], "notyoutube.com")).toHaveLength(0);
    expect(transformsFor([t], "youtube.com.evil.test")).toHaveLength(0);
  });
});

describe("transformCss", () => {
  it("emits primary and fallbacks together, not primary-or-fallback", () => {
    const css = transformCss([hide("r", ["x.test"], ".a", [".b", ".c"])]);
    expect(css).toContain(".a");
    expect(css).toContain(".b");
    expect(css).toContain(".c");
    expect(css).toContain("display: none !important;");
  });

  it("is empty for no transforms, which the applier reads as 'remove the node'", () => {
    expect(transformCss([])).toBe("");
  });

  it("skips a transform whose selectors are all blank rather than emitting `{ }`", () => {
    expect(transformCss([hide("r", ["x.test"], "   ", ["", "  "])])).toBe("");
  });

  it("renders restyle as declarations", () => {
    const css = transformCss([
      {
        ruleId: "r",
        domains: ["x.test"],
        targets: { primary: ".a", fallbacks: [] },
        replacement: { type: "restyle", style: { opacity: "0.3", filter: "grayscale(1)" } },
      },
    ]);
    expect(css).toContain("opacity: 0.3 !important;");
    expect(css).toContain("filter: grayscale(1) !important;");
  });
});
