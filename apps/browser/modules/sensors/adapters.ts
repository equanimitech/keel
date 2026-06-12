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

/** Classify a post-game modal title into a result. Wording-level
 * knowledge, shared across chess-style sites. */
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

/** Page-specific probes for one site: where to watch for a finished game. */
export interface SiteAdapter {
  /** Element whose appearance marks a finished game. */
  readonly gameOverSelector: string;
  /** Element inside it whose text classifies the result. */
  readonly resultTitleSelector: string;
}

const SITE_ADAPTERS: Readonly<Record<string, SiteAdapter>> = {
  "chess.com": {
    gameOverSelector: ".game-over-modal-container",
    resultTitleSelector: ".header-title-component",
  },
};

/** Resolve the adapter for a domain (exact or subdomain), or null. */
export function siteAdapterFor(domain: string): SiteAdapter | null {
  for (const [entry, adapter] of Object.entries(SITE_ADAPTERS)) {
    if (domain === entry || domain.endsWith("." + entry)) {
      return adapter;
    }
  }
  return null;
}
