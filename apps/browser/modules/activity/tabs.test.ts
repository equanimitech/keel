import { describe, it, expect } from "vitest";
import { tabUuid, type TabMap } from "./tabs";

describe("tabUuid", () => {
  it("mints a new uuid for an unseen tab and reuses it after", () => {
    const map: TabMap = {};
    const a = tabUuid(map, 7, () => "uuid-1");
    expect(a.uuid).toBe("uuid-1");
    expect(a.map).toEqual({ 7: "uuid-1" });

    const b = tabUuid(a.map, 7, () => "uuid-SHOULD-NOT-BE-USED");
    expect(b.uuid).toBe("uuid-1");
    expect(b.map).toEqual({ 7: "uuid-1" });
  });

  it("mints distinct uuids for concurrent same-domain tabs", () => {
    let n = 0;
    const factory = () => `uuid-${++n}`;
    const s1 = tabUuid({}, 1, factory);
    const s2 = tabUuid(s1.map, 2, factory);
    expect(s1.uuid).not.toBe(s2.uuid);
  });
});
