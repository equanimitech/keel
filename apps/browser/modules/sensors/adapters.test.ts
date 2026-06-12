import { describe, expect, it } from "vitest";
import { classifyGameResult, siteAdapterFor } from "./adapters";

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
});
