import { describe, expect, it } from "vitest";
import { SENSOR_KINDS, validateSensorMessage } from "../events";
import {
  IMPRESSION_SETTLE_MS,
  INITIAL_IMPRESSION,
  MAX_CARD_TEXT,
  detectionTier,
  impressionTransition,
  innermostOnly,
  isProductItemType,
  isProductShape,
  looksLikePrice,
  type CardShape,
} from "./shopping";

const card = (shape: Partial<CardShape> = {}): CardShape => ({
  itemType: null,
  text: "Chaise 49,99 €",
  hasLink: true,
  ...shape,
});

describe("looksLikePrice (generic over currency and locale, never over a store)", () => {
  it("matches symbol-before formats", () => {
    expect(looksLikePrice("€19,99")).toBe(true);
    expect(looksLikePrice("$1,299.00")).toBe(true);
    expect(looksLikePrice("£ 45")).toBe(true);
  });

  it("matches symbol-after formats (the French/Spanish convention)", () => {
    expect(looksLikePrice("49,99 €")).toBe(true);
    expect(looksLikePrice("1 299€")).toBe(true);
  });

  it("matches ISO codes and Nordic/Polish suffixes", () => {
    expect(looksLikePrice("EUR 19,99")).toBe(true);
    expect(looksLikePrice("USD 12")).toBe(true);
    expect(looksLikePrice("149 kr")).toBe(true);
    expect(looksLikePrice("99 zł")).toBe(true);
  });

  it("rejects text with no price in it", () => {
    expect(looksLikePrice("")).toBe(false);
    expect(looksLikePrice("Ajouter au panier")).toBe(false);
    expect(looksLikePrice("Livraison en 3 jours")).toBe(false);
    expect(looksLikePrice("4,5 étoiles sur 5")).toBe(false);
  });

  it("does not treat a bare currency word as a price", () => {
    expect(looksLikePrice("Prix en euros")).toBe(false);
    expect(looksLikePrice("kr")).toBe(false);
  });
});

describe("isProductItemType (the tier that needs no heuristic)", () => {
  it("accepts the schema.org Product family, http or https", () => {
    expect(isProductItemType("https://schema.org/Product")).toBe(true);
    expect(isProductItemType("http://schema.org/Product")).toBe(true);
    expect(isProductItemType("https://schema.org/IndividualProduct")).toBe(true);
    expect(isProductItemType("https://schema.org/ProductModel")).toBe(true);
    expect(isProductItemType("https://schema.org/SomeProducts")).toBe(true);
  });

  it("rejects other schema types and non-schema attributes", () => {
    expect(isProductItemType("https://schema.org/Article")).toBe(false);
    expect(isProductItemType("https://schema.org/BreadcrumbList")).toBe(false);
    expect(isProductItemType("https://example.com/product")).toBe(false);
    expect(isProductItemType(null)).toBe(false);
  });
});

describe("isProductShape (two tiers: declared, then commerce card shape)", () => {
  it("believes declared microdata unconditionally", () => {
    expect(
      isProductShape(
        card({ itemType: "https://schema.org/Product", text: "", hasLink: false })
      )
    ).toBe(true);
  });

  it("believes declared microdata even on a long detail page", () => {
    // A product detail page wraps the whole article in the Product scope —
    // that is one product seen, and the size guard must not veto it.
    expect(
      isProductShape(
        card({
          itemType: "https://schema.org/Product",
          text: "x".repeat(MAX_CARD_TEXT * 5),
        })
      )
    ).toBe(true);
  });

  it("accepts the layout tier: bounded region + link + price", () => {
    expect(isProductShape(card())).toBe(true);
  });

  it("rejects a region with a price but no link (a banner, a footer note)", () => {
    expect(isProductShape(card({ hasLink: false }))).toBe(false);
  });

  it("rejects a link with no price (navigation, a category tile)", () => {
    expect(isProductShape(card({ text: "Meubles de salon" }))).toBe(false);
  });

  it("rejects anything too big to be a card — the grid/page guard", () => {
    expect(
      isProductShape(card({ text: "49,99 € " + "x".repeat(MAX_CARD_TEXT) }))
    ).toBe(false);
  });
});

describe("detectionTier (what the payload reports — a bounded enum, nothing else)", () => {
  it("reports microdata when the page declared the product", () => {
    expect(detectionTier(card({ itemType: "https://schema.org/Product" }))).toBe(
      "microdata"
    );
  });

  it("reports layout when the shape heuristic matched", () => {
    expect(detectionTier(card())).toBe("layout");
  });
});

describe("innermostOnly (one product counted exactly once)", () => {
  interface Node {
    readonly id: string;
    readonly children: readonly string[];
  }
  const contains = (outer: Node, inner: Node): boolean =>
    outer.children.includes(inner.id);

  it("drops a wrapper that contains other candidates", () => {
    const row: Node = { id: "row", children: ["a", "b"] };
    const a: Node = { id: "a", children: [] };
    const b: Node = { id: "b", children: [] };
    expect(innermostOnly([row, a, b], contains)).toEqual([a, b]);
  });

  it("keeps every candidate when none contains another", () => {
    const a: Node = { id: "a", children: [] };
    const b: Node = { id: "b", children: [] };
    expect(innermostOnly([a, b], contains)).toEqual([a, b]);
  });

  it("never drops a candidate for containing itself", () => {
    const self: Node = { id: "a", children: ["a"] };
    expect(innermostOnly([self], contains)).toEqual([self]);
  });

  it("handles an empty candidate set", () => {
    expect(innermostOnly([], contains)).toEqual([]);
  });
});

describe("impressionTransition (settled impression — a fly-past is not a look)", () => {
  it("entering view arms a pending impression without emitting", () => {
    const r = impressionTransition(INITIAL_IMPRESSION, { type: "enter", t: 1000 });
    expect(r.emit).toBeNull();
    expect(r.state).toEqual({ phase: "pending", enteredTs: 1000 });
  });

  it("leaving before the settle window counts nothing — the fast-scroll case", () => {
    const pending = impressionTransition(INITIAL_IMPRESSION, {
      type: "enter",
      t: 1000,
    }).state;
    const r = impressionTransition(pending, {
      type: "exit",
      t: 1000 + IMPRESSION_SETTLE_MS - 1,
    });
    expect(r.emit).toBeNull();
    expect(r.state).toEqual(INITIAL_IMPRESSION);
  });

  it("a tick before the settle window does not count", () => {
    const pending = impressionTransition(INITIAL_IMPRESSION, {
      type: "enter",
      t: 1000,
    }).state;
    const r = impressionTransition(pending, {
      type: "tick",
      t: 1000 + IMPRESSION_SETTLE_MS - 1,
    });
    expect(r.emit).toBeNull();
    expect(r.state.phase).toBe("pending");
  });

  it("a tick at or past the settle window emits product_seen", () => {
    const pending = impressionTransition(INITIAL_IMPRESSION, {
      type: "enter",
      t: 1000,
    }).state;
    const r = impressionTransition(pending, {
      type: "tick",
      t: 1000 + IMPRESSION_SETTLE_MS,
    });
    expect(r.emit).toBe("product_seen");
    expect(r.state.phase).toBe("counted");
  });

  it("counted is terminal — scrolling a grid up and down never double-counts", () => {
    let state = INITIAL_IMPRESSION;
    const emissions: string[] = [];
    for (const input of [
      { type: "enter", t: 1000 } as const,
      { type: "tick", t: 1000 + IMPRESSION_SETTLE_MS } as const,
      { type: "exit", t: 5000 } as const,
      { type: "enter", t: 9000 } as const,
      { type: "tick", t: 9000 + IMPRESSION_SETTLE_MS } as const,
      { type: "exit", t: 20000 } as const,
    ]) {
      const r = impressionTransition(state, input);
      state = r.state;
      if (r.emit !== null) {
        emissions.push(r.emit);
      }
    }
    expect(emissions).toEqual(["product_seen"]);
    expect(state.phase).toBe("counted");
  });

  it("a stale tick after a fly-past exit is a no-op", () => {
    const pending = impressionTransition(INITIAL_IMPRESSION, {
      type: "enter",
      t: 1000,
    }).state;
    const gone = impressionTransition(pending, { type: "exit", t: 1200 }).state;
    const r = impressionTransition(gone, {
      type: "tick",
      t: 1000 + IMPRESSION_SETTLE_MS,
    });
    expect(r.emit).toBeNull();
    expect(r.state.phase).toBe("waiting");
  });

  it("honors a custom settle window", () => {
    const pending = impressionTransition(INITIAL_IMPRESSION, {
      type: "enter",
      t: 0,
    }).state;
    expect(impressionTransition(pending, { type: "tick", t: 100 }, 50).emit).toBe(
      "product_seen"
    );
    expect(
      impressionTransition(pending, { type: "tick", t: 40 }, 50).emit
    ).toBeNull();
  });
});

describe("product_seen crosses the hostile-page boundary", () => {
  it("is on the sensor kind allowlist", () => {
    expect(SENSOR_KINDS).toContain("product_seen");
  });

  it("carries the detection tier and nothing else", () => {
    expect(
      validateSensorMessage({
        type: "keel-sensor",
        kind: "product_seen",
        payload: { tier: "microdata" },
      })
    ).toEqual({ kind: "product_seen", payload: { tier: "microdata" } });
  });

  it("would strip any product content a hostile page tried to attach", () => {
    const result = validateSensorMessage({
      type: "keel-sensor",
      kind: "product_seen",
      payload: { tier: "layout", price: { amount: 49.99 }, images: ["a.jpg"] },
    });
    expect(result).toEqual({ kind: "product_seen", payload: { tier: "layout" } });
  });
});
