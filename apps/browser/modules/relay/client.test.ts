import { describe, it, expect } from "vitest";
import { chunkEvents, unacked } from "./batch";

const ev = (id: string) => ({ id, surface: "browser", kind: "tab_activated", ts: 1, sessionId: "", payload: {} }) as const;

describe("relay batching", () => {
  it("chunkEvents splits into <= size batches", () => {
    const batches = chunkEvents([ev("a"), ev("b"), ev("c")], 2);
    expect(batches.map((b) => b.length)).toEqual([2, 1]);
  });
  it("unacked removes acked ids", () => {
    const remaining = unacked([ev("a"), ev("b"), ev("c")], ["a", "c"]);
    expect(remaining.map((e) => e.id)).toEqual(["b"]);
  });
});
