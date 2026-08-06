import { describe, expect, it } from "vitest";
import { classifyGameResult, firstMatch, gameResult, siteAdapterFor } from "./adapters";

describe("classifyGameResult", () => {
  it("classifies wins, losses, and draws from the modal title", () => {
    expect(classifyGameResult("You Won!")).toBe("win");
    expect(classifyGameResult("you lost by checkmate")).toBe("loss");
    expect(classifyGameResult("Draw by repetition")).toBe("draw");
  });

  it("falls back to unknown", () => {
    expect(classifyGameResult("Game aborted")).toBe("unknown");
    expect(classifyGameResult("")).toBe("unknown");
  });

  it("refuses to guess from a winner-name title", () => {
    // Live chess.com titles the modal with the winner's NAME, not a verdict.
    // Guessing "someone Won, so I lost" would be wrong the moment that
    // someone is you — unknown is the honest answer.
    expect(classifyGameResult("Cyclops Won")).toBe("unknown");
    expect(classifyGameResult("MagnusCarlsen Won")).toBe("unknown");
  });
});

describe("gameResult", () => {
  it("trusts a confirmed self-win over the title", () => {
    expect(gameResult(true, "Cyclops Won")).toBe("win");
    expect(gameResult(true, "")).toBe("win");
  });

  it("reads the title when there is no win confirmation", () => {
    expect(gameResult(false, "You Lost")).toBe("loss");
    expect(gameResult(false, "Draw by repetition")).toBe("draw");
  });

  it("never infers a loss from a missing win marker", () => {
    // A site that stops shipping the marker must degrade to unknown, not
    // silently relabel every game a loss.
    expect(gameResult(false, "Cyclops Won")).toBe("unknown");
    expect(gameResult(false, "Game Aborted")).toBe("unknown");
  });
});

describe("siteAdapterFor", () => {
  it("resolves an adapter for a registered domain and its subdomains", () => {
    expect(siteAdapterFor("chess.com")).not.toBeNull();
    expect(siteAdapterFor("www.chess.com")).not.toBeNull();
  });

  it("returns null for domains without site-specific knowledge", () => {
    expect(siteAdapterFor("example.com")).toBeNull();
    expect(siteAdapterFor("notchess.com")).toBeNull();
  });

  it("probes the CURRENT chess.com post-game modal, not the retired one", () => {
    // Regression guard: the pre-2026-08 selectors were the whole bug —
    // 4h43m of attended chess.com dwell produced zero game_finished events
    // because `.game-over-modal-container` no longer exists on the page.
    const adapter = siteAdapterFor("chess.com");
    expect(adapter?.gameOverSelectors[0]).toBe(".game-over-modal-shell-container");
    expect(adapter?.resultTitleSelectors[0]).toBe(".game-over-modal-title-component");
  });

  it("keeps the retired selectors as later fallbacks, never as the probe", () => {
    const adapter = siteAdapterFor("chess.com");
    expect(adapter?.gameOverSelectors).toContain(".game-over-modal-container");
    expect(adapter?.resultTitleSelectors).toContain(".header-title-component");
  });

  it("never probes the generic board-modal wrapper (settings/welcome are not games)", () => {
    const adapter = siteAdapterFor("chess.com");
    expect(adapter?.gameOverSelectors).not.toContain(".board-modal-container-container");
  });

  it("carries a class-based win marker, so no username or locale is read", () => {
    const adapter = siteAdapterFor("chess.com");
    expect(adapter?.selfWonSelectors).toEqual([".game-over-modal-header-userWon"]);
  });
});

describe("firstMatch", () => {
  it("returns the first candidate that resolves", () => {
    const dom: Record<string, string> = { ".new": "current", ".old": "legacy" };
    expect(firstMatch([".new", ".old"], (s) => dom[s] ?? null)).toBe("current");
  });

  it("falls through to a later candidate when the earlier one is absent", () => {
    const dom: Record<string, string> = { ".old": "legacy" };
    expect(firstMatch([".new", ".old"], (s) => dom[s] ?? null)).toBe("legacy");
  });

  it("returns null when nothing matches, and on an empty candidate list", () => {
    expect(firstMatch([".a", ".b"], () => null)).toBeNull();
    expect(firstMatch([], () => "never")).toBeNull();
  });

  it("treats undefined like a miss (querySelector-shaped lookups)", () => {
    expect(firstMatch([".a", ".b"], (s) => (s === ".b" ? "hit" : undefined))).toBe("hit");
  });

  it("stops at the first hit — later candidates are never queried", () => {
    const seen: string[] = [];
    firstMatch([".a", ".b", ".c"], (s) => {
      seen.push(s);
      return s === ".a" ? "hit" : null;
    });
    expect(seen).toEqual([".a"]);
  });
});
