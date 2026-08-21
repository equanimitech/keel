import { describe, expect, it } from "vitest";
import type { PageTransform } from "../policy/store";
import { cssString, transformCss, transformsFor } from "./apply";

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

describe("cssString", () => {
  it("wraps plain text in quotes", () => {
    expect(cssString("the feed is off.")).toBe('"the feed is off."');
  });

  it("escapes a double quote so the declaration cannot be closed early", () => {
    // The failure this prevents: rule files are hand-edited, so an unescaped
    // quote ends the string and everything after it becomes live CSS.
    expect(cssString('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("escapes a backslash before it can escape the closing quote", () => {
    expect(cssString("a\\b")).toBe('"a\\\\b"');
  });

  it("encodes a newline as \\A rather than emitting a raw break", () => {
    // A literal newline inside a CSS string is a parse error, which discards
    // the whole stylesheet and silently un-hides the page.
    expect(cssString("one\ntwo")).toBe('"one\\A two"');
  });
});

describe("transformCss - text placeholder", () => {
  const text = (content: string): PageTransform => ({
    ruleId: "placeholder",
    domains: ["x.test"],
    targets: { primary: ".first", fallbacks: [] },
    replacement: { type: "text", content },
  });

  it("hides the element itself so its own content cannot show through", () => {
    expect(transformCss([text("the feed is off.")])).toContain(
      "visibility: hidden !important;"
    );
  });

  it("renders the content in a ::before that overrides the inherited hidden", () => {
    const css = transformCss([text("the feed is off.")]);
    expect(css).toContain(".first::before");
    expect(css).toContain('content: "the feed is off."');
    expect(css).toContain("visibility: visible !important;");
  });

  it("lays the placeholder over the element it replaces", () => {
    // Absolute inside a positioned ancestor: the placeholder occupies the
    // suppressed element's box instead of adding height of its own. Height is
    // load-bearing here — collapsing it is what set the feed reloading.
    const css = transformCss([text("the feed is off.")]);
    expect(css).toContain("position: relative !important;");
    expect(css).toContain("position: absolute !important;");
    expect(css).toContain("inset: 0 !important;");
  });

  it("emits the pseudo-element for fallbacks too, not just the primary", () => {
    const css = transformCss([
      {
        ruleId: "placeholder",
        domains: ["x.test"],
        targets: { primary: ".a", fallbacks: [".b"] },
        replacement: { type: "text", content: "gone" },
      },
    ]);
    expect(css).toContain(".a::before");
    expect(css).toContain(".b::before");
  });

  it("skips a text transform with blank content rather than emitting an empty placeholder", () => {
    expect(transformCss([text("   ")])).toBe("");
  });
});
