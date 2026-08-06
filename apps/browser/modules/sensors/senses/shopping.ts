/**
 * Shopping sense — generic over any page that shows product cards.
 *
 * Type-level knowledge only, never company-level: a product card is an
 * element that (a) declares itself as schema.org Product microdata, or
 * (b) exhibits the universal commerce card SHAPE — a bounded region
 * holding an image, a link, and a price-shaped string. Every storefront
 * on earth renders that shape; none of them agree on class names, so the
 * detection walks up from images instead of matching selectors.
 *
 * A product counts as SEEN once it has stayed ≥50% visible past a settle
 * window (product_seen). The settle window is the point: a grid flying
 * past under a fast scroll was not seen, and emitting it would turn one
 * flick of the thumb into fifty events.
 *
 * PRIVACY (load-bearing): the payload carries ONE bounded enum — which
 * detection tier matched. Never a product name, price, URL, image, or
 * page title. The domain is attached by the background from the
 * browser-attested sender tab. A count of products seen, nothing more.
 */

import { sendSensorEvent } from "../send";

// ── Pure detection ────────────────────────────────────────────────

/** How much text a thing can hold and still be a CARD rather than a
 * grid, a column, or the page. The single most load-bearing guard in
 * the heuristic tier: it is what stops an ancestor walk that overshoots
 * from declaring `<body>` a product. */
export const MAX_CARD_TEXT = 800;

/** How far up from a seed image a card may live. Deep enough for the
 * image-container-inside-a-figure-inside-a-tile nesting real grids use,
 * shallow enough that a stray banner image cannot climb to the page. */
export const MAX_ANCESTOR_WALK = 10;

/** Seed images examined per scan. A dense grid page has ~100; the cap
 * bounds the work on pathological pages. */
export const MAX_IMAGE_SEEDS = 300;

/** Hard ceiling on emissions per content-script lifetime. Infinite-scroll
 * marketplaces would otherwise stream events all afternoon. Past this the
 * sense disconnects: keel has already learned what it needed to. */
export const MAX_PRODUCTS_PER_PAGE = 120;

/** A card must hold ≥50% visibility this long to count as seen. Mirrors
 * the video sense's settle discipline (PAUSE_SETTLE_MS): raw impressions
 * are ambiguous, settled ones are not. */
export const IMPRESSION_SETTLE_MS = 700;

/** Mutation storms (lazy images, infinite scroll) are coalesced into one
 * rescan per window rather than one per mutation. */
export const SCAN_DEBOUNCE_MS = 500;

/** Which tier recognised the card. The ONLY thing a payload carries. */
export type DetectionTier = "microdata" | "layout";

/**
 * Price-shaped text, across the locales a European shopper meets:
 * symbol-before ("€19.99", "$1,299.00"), symbol-after ("19,99 €",
 * "1 299 €"), ISO code ("EUR 19,99"), and the Nordic/Polish suffixes
 * ("149 kr", "99 zł"). Type-level knowledge about how money is written,
 * not about any store.
 */
const PRICE_PATTERNS: readonly RegExp[] = [
  /[€$£¥₹₺₽]\s?\d/u,
  /\d\s?[€$£¥₹₺₽]/u,
  /\b(?:EUR|USD|GBP|CHF|SEK|NOK|DKK|PLN|CZK|JPY|CAD|AUD)\s?\d/i,
  // `\b` cannot close on "ł" (not a word character), so the Polish suffix
  // uses an explicit "not followed by a letter" instead.
  /\d\s?z[łl](?![\p{L}])/iu,
  /\d\s?kr\b/i,
];

/** Does this text contain a price? Generic over currency and locale. */
export function looksLikePrice(text: string): boolean {
  for (const pattern of PRICE_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Does an `itemtype` declare a schema.org product? Covers the family
 * (Product, IndividualProduct, ProductModel, ProductGroup, SomeProducts)
 * without enumerating it, and both http/https forms. This is the tier
 * that needs no heuristic at all — the page said so itself.
 */
export function isProductItemType(itemType: string | null): boolean {
  if (itemType === null) {
    return false;
  }
  return /schema\.org\/[a-z]*product/i.test(itemType);
}

/** The shape of a candidate, extracted from the DOM so the decision
 * itself stays pure and unit-testable without a browser. */
export interface CardShape {
  /** `itemtype` attribute, if the element declares one. */
  readonly itemType: string | null;
  /** Visible text, already truncated to MAX_CARD_TEXT + 1. */
  readonly text: string;
  /** Is it, or does it contain, a link? */
  readonly hasLink: boolean;
}

/**
 * Two tiers, in order of trust:
 *   1. microdata — the page declares a Product. Believed unconditionally,
 *      including on a detail page whose Product wraps the whole article.
 *   2. layout — a bounded region (≤ MAX_CARD_TEXT) with a link and a
 *      price. This is the commerce card shape, and the size bound is
 *      what keeps a grid or a page from qualifying as one product.
 */
export function isProductShape(shape: CardShape): boolean {
  if (isProductItemType(shape.itemType)) {
    return true;
  }
  if (shape.text.length > MAX_CARD_TEXT) {
    return false;
  }
  return shape.hasLink && looksLikePrice(shape.text);
}

/** Which tier matched — for the payload, and for the user to verify that
 * generic detection actually fires on their shops. */
export function detectionTier(shape: CardShape): DetectionTier {
  return isProductItemType(shape.itemType) ? "microdata" : "layout";
}

/**
 * Nesting dedupe: keep only candidates that contain no other candidate.
 * A "similar items" strip inside a card, or a row wrapper picked up by
 * an overshooting ancestor walk, is discarded in favour of the real
 * cards inside it — so one product is counted exactly once.
 * Pure and structure-agnostic: the caller supplies containment.
 */
export function innermostOnly<T>(
  items: readonly T[],
  contains: (outer: T, inner: T) => boolean
): readonly T[] {
  const kept: T[] = [];
  for (const candidate of items) {
    let wrapsAnother = false;
    for (const other of items) {
      if (other !== candidate && contains(candidate, other)) {
        wrapsAnother = true;
        break;
      }
    }
    if (!wrapsAnother) {
      kept.push(candidate);
    }
  }
  return kept;
}

// ── Pure impression state machine ─────────────────────────────────

export type ImpressionPhase = "waiting" | "pending" | "counted";

/** Per-card visibility state. `enteredTs` is when the current pending
 * impression began (null unless pending). */
export interface ImpressionState {
  readonly phase: ImpressionPhase;
  readonly enteredTs: number | null;
}

export const INITIAL_IMPRESSION: ImpressionState = {
  phase: "waiting",
  enteredTs: null,
};

export type ImpressionInput =
  | { readonly type: "enter"; readonly t: number }
  | { readonly type: "exit"; readonly t: number }
  | { readonly type: "tick"; readonly t: number };

export interface ImpressionResult {
  readonly state: ImpressionState;
  readonly emit: "product_seen" | null;
}

/**
 * Timer-free state machine for the settled impression. The DOM wiring
 * feeds it intersection enter/exit plus a `tick` scheduled at
 * enteredTs + settleMs:
 *   - entering view arms a pending impression (no emit yet),
 *   - leaving before the tick is a fly-past — back to waiting, uncounted,
 *   - a tick at/after the settle window emits `product_seen` once,
 *   - `counted` is terminal: a card re-scrolled into view never counts
 *     twice.
 * Pure so the debounce and the once-only dedupe are testable without
 * real timers or a real page.
 */
export function impressionTransition(
  state: ImpressionState,
  input: ImpressionInput,
  settleMs: number = IMPRESSION_SETTLE_MS
): ImpressionResult {
  switch (state.phase) {
    case "waiting":
      if (input.type === "enter") {
        return { state: { phase: "pending", enteredTs: input.t }, emit: null };
      }
      return { state, emit: null };
    case "pending":
      if (input.type === "exit") {
        return { state: INITIAL_IMPRESSION, emit: null };
      }
      if (
        input.type === "tick" &&
        state.enteredTs !== null &&
        input.t - state.enteredTs >= settleMs
      ) {
        return {
          state: { phase: "counted", enteredTs: state.enteredTs },
          emit: "product_seen",
        };
      }
      return { state, emit: null };
    case "counted":
      return { state, emit: null };
  }
  return { state, emit: null };
}

// ── DOM wiring ────────────────────────────────────────────────────

function describe(element: Element): CardShape {
  return {
    itemType: element.getAttribute("itemtype"),
    // Truncated read: the pure tier only needs to know whether the text
    // is over budget, and nothing downstream ever sees this string.
    text: (element.textContent ?? "").slice(0, MAX_CARD_TEXT + 1),
    hasLink:
      element.matches("a[href]") || element.querySelector("a[href]") !== null,
  };
}

/**
 * Walk up from a seed image to the nearest ancestor that is card-shaped.
 * Walking up (rather than matching selectors down) is what makes this
 * generic: every storefront names its card class differently, but all of
 * them put the image inside it. The walk stops at the first match, so
 * the result is the innermost card by construction, and never leaves the
 * page body.
 */
function nearestCard(seed: Element): Element | null {
  let node: Element | null = seed;
  for (let depth = 0; node !== null && depth <= MAX_ANCESTOR_WALK; depth += 1) {
    if (node === document.body || node === document.documentElement) {
      return null;
    }
    if (isProductShape(describe(node))) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function findProductCards(): readonly Element[] {
  const found = new Set<Element>();

  // Tier 1 — the page declares its own products. No heuristic needed.
  for (const element of document.querySelectorAll("[itemscope][itemtype]")) {
    if (isProductItemType(element.getAttribute("itemtype"))) {
      found.add(element);
    }
  }

  // Tier 2 — the commerce card shape, seeded from images.
  let seeds = 0;
  for (const image of document.querySelectorAll("img")) {
    if (seeds >= MAX_IMAGE_SEEDS) {
      break;
    }
    seeds += 1;
    const card = nearestCard(image);
    if (card !== null) {
      found.add(card);
    }
  }

  return innermostOnly(
    [...found],
    (outer, inner) => outer !== inner && outer.contains(inner)
  );
}

export function armShoppingSense(): void {
  const watched = new WeakSet<Element>();
  const states = new WeakMap<Element, ImpressionState>();
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  const tiers = new WeakMap<Element, DetectionTier>();
  let counted = 0;
  let stopped = false;

  let intersection: IntersectionObserver | null = null;
  let mutations: MutationObserver | null = null;
  let scanTimer: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    stopped = true;
    intersection?.disconnect();
    mutations?.disconnect();
    clearTimeout(scanTimer);
  };

  const feed = (element: Element, input: ImpressionInput): void => {
    const result = impressionTransition(
      states.get(element) ?? INITIAL_IMPRESSION,
      input
    );
    states.set(element, result.state);
    if (result.emit === null) {
      return;
    }
    counted += 1;
    sendSensorEvent(result.emit, { tier: tiers.get(element) ?? "layout" });
    if (counted >= MAX_PRODUCTS_PER_PAGE) {
      stop();
    }
  };

  intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const element = entry.target;
        clearTimeout(timers.get(element));
        if (!entry.isIntersecting) {
          feed(element, { type: "exit", t: Date.now() });
          continue;
        }
        const t = Date.now();
        feed(element, { type: "enter", t });
        // The one impurity: a tick fed back into the pure machine once
        // the settle window has elapsed. Cleared on exit, so a fly-past
        // never counts.
        timers.set(
          element,
          setTimeout(
            () => feed(element, { type: "tick", t: t + IMPRESSION_SETTLE_MS }),
            IMPRESSION_SETTLE_MS
          )
        );
      }
    },
    { threshold: 0.5 }
  );

  const scan = (): void => {
    if (stopped) {
      return;
    }
    for (const card of findProductCards()) {
      if (watched.has(card)) {
        continue;
      }
      watched.add(card);
      tiers.set(card, detectionTier(describe(card)));
      intersection?.observe(card);
    }
  };

  scan();
  mutations = new MutationObserver(() => {
    // Coalesce: a lazy-loading grid mutates continuously, and the scan
    // walks every image on the page.
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, SCAN_DEBOUNCE_MS);
  });
  mutations.observe(document.body, { childList: true, subtree: true });
}
