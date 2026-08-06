/**
 * Site adapters — the ONE place a company domain may appear, as data.
 *
 * The sensor architecture is type-based: generic senses (video, feed)
 * self-select by what a page exhibits, on any observe-tier domain. A
 * site adapter exists only where a key action has no generic DOM shape
 * (e.g. "a game ended") and supplies the page-specific probes. Adding a
 * domain here is adding DATA, never architecture.
 */

export type GameResult = "win" | "loss" | "draw" | "unknown";

/**
 * Classify a post-game modal title into a result. Wording-level knowledge,
 * shared across chess-style sites.
 *
 * Weak by construction, and deliberately so. chess.com titles its modal with
 * the WINNER'S NAME ("Cyclops Won" — observed live 2026-08-06), which is both
 * locale-dependent and a username the privacy posture forbids us from
 * recording. So the title only resolves a result when the site happens to
 * phrase it in the second person; everything else falls to "unknown" rather
 * than to a guess. `selfWonSelectors` carries the reliable win signal.
 *
 * The title string is read, classified, and DROPPED — it never enters a
 * payload.
 */
export function classifyGameResult(title: string): GameResult {
  const t = title.toLowerCase();
  if (t.includes("you won")) {
    return "win";
  }
  if (t.includes("you lost")) {
    return "loss";
  }
  if (t.includes("draw")) {
    return "draw";
  }
  return "unknown";
}

/**
 * Page-specific probes for one site: where to watch for a finished game.
 *
 * Both fields are ORDERED CANDIDATE LISTS, newest DOM first. A single
 * selector makes the sense silently die the day the site ships a redesign
 * (which is exactly what happened to chess.com — see the entry below), and
 * a dead sensor is indistinguishable from a quiet user. Keeping the
 * superseded selectors costs one `querySelector` per candidate and buys
 * continuity across one revision in either direction.
 */
export interface SiteAdapter {
  /** Elements whose presence marks a finished game. First match wins. */
  readonly gameOverSelectors: readonly string[];
  /** Elements inside it whose text classifies the result. First match wins. */
  readonly resultTitleSelectors: readonly string[];
  /**
   * Selectors present ONLY when the person at the keyboard won — a class,
   * not a phrase, so it survives translation and never reads a username.
   * Absence means "not a confirmed win", never "loss": the classification
   * falls back to the title, which fails to "unknown".
   */
  readonly selfWonSelectors: readonly string[];
}

/**
 * The one result rule: a confirmed self-win beats the title, and the title
 * is only consulted when there is no such confirmation. Pure so the
 * precedence is unit-testable.
 */
export function gameResult(selfWon: boolean, title: string): GameResult {
  return selfWon ? "win" : classifyGameResult(title);
}

const SITE_ADAPTERS: Readonly<Record<string, SiteAdapter>> = {
  // Verified against the live post-game modal on 2026-08-06. The pre-2026-08
  // selectors (`.game-over-modal-container` / `.header-title-component`) no
  // longer exist anywhere in chess.com's shipped CSS; the modal is now
  //   .board-modal-container-container
  //     └ .board-modal-component
  //        └ .game-over-modal-shell-container
  //           └ .game-over-modal-shell-content
  //              └ .game-over-modal-header-component
  //                 └ … .game-over-modal-title-component  ("You Won!" / …)
  // `.board-modal-container-container` is deliberately NOT a probe: it is the
  // generic board-modal wrapper (settings, welcome, upgrade all use it) and
  // would report a game that never finished.
  "chess.com": {
    gameOverSelectors: [
      ".game-over-modal-shell-container",
      ".game-over-modal-header-component",
      ".game-over-modal-container", // pre-2026-08
    ],
    resultTitleSelectors: [
      ".game-over-modal-title-component",
      ".header-title-component", // pre-2026-08
    ],
    // Confirmed absent on an observed loss (2026-08-06) and present in the
    // shipped stylesheet alongside the `whiteWon`/`blackWon` colour
    // modifiers, which say who won but not who was playing.
    selfWonSelectors: [".game-over-modal-header-userWon"],
  },
};

/**
 * First non-null result of `query` over an ordered candidate list.
 *
 * Pure and DOM-free (the caller supplies the lookup) so selector-fallback
 * order is unit-testable without a browser environment.
 */
export function firstMatch<T>(
  selectors: readonly string[],
  query: (selector: string) => T | null | undefined
): T | null {
  for (const selector of selectors) {
    const found = query(selector);
    if (found !== null && found !== undefined) {
      return found;
    }
  }
  return null;
}

/** Resolve the adapter for a domain (exact or subdomain), or null. */
export function siteAdapterFor(domain: string): SiteAdapter | null {
  for (const [entry, adapter] of Object.entries(SITE_ADAPTERS)) {
    if (domain === entry || domain.endsWith("." + entry)) {
      return adapter;
    }
  }
  return null;
}
