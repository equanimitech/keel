import { describe, it, expect } from "vitest";
import { normalizeRoute, ROUTE_REGISTRY } from "./route";

describe("normalizeRoute", () => {
  it("matches a registered route prefix", () => {
    expect(normalizeRoute("youtube.com", "/shorts/abc123")).toBe("/shorts");
    expect(normalizeRoute("youtube.com", "/watch")).toBe("/watch");
    expect(normalizeRoute("linkedin.com", "/feed/")).toBe("/feed");
  });
  it("falls back to the first path segment for an unregistered path on a registered host", () => {
    expect(normalizeRoute("youtube.com", "/results")).toBe("/results");
  });
  it("returns null for root / empty path", () => {
    expect(normalizeRoute("youtube.com", "/")).toBeNull();
    expect(normalizeRoute("youtube.com", "")).toBeNull();
  });
  it("never returns query or fragment", () => {
    expect(normalizeRoute("youtube.com", "/watch")).toBe("/watch");
    expect(normalizeRoute("youtube.com", "/shorts/x?t=1")).toBe("/shorts");
  });
  it("returns null for a host with no registry entry", () => {
    expect(normalizeRoute("github.com", "/rafa/keel")).toBeNull();
  });
  it("does not leak user-identifying @handle segments", () => {
    expect(normalizeRoute("youtube.com", "/@SomeCreator")).toBeNull();
    expect(normalizeRoute("youtube.com", "/@SomeCreator/videos")).toBeNull();
  });
  it("exposes the registry for reuse", () => {
    expect(ROUTE_REGISTRY["youtube.com"]).toContain("/shorts");
  });
});
