import { describe, expect, it } from "vitest";
import { momentVerdict, NO_MOMENT_FRICTION, type MomentFriction } from "./moment-friction.js";

const friction = (f: Partial<MomentFriction>): MomentFriction => ({
  allow: [],
  deny: [],
  ...f,
});

describe("momentVerdict", () => {
  it("allows a hostname on the allow list", () => {
    expect(momentVerdict("linear.app", friction({ allow: ["linear.app"] }))).toBe("allow");
  });

  it("denies a hostname outside a declared allow list", () => {
    expect(momentVerdict("youtube.com", friction({ allow: ["linear.app"] }))).toBe("deny");
  });

  it("denies a hostname on the deny list", () => {
    expect(momentVerdict("youtube.com", friction({ deny: ["youtube.com"] }))).toBe("deny");
  });

  it("lets deny win when a hostname is on both lists", () => {
    // A commitment device outranks a convenience: the allow list must never
    // quietly lift something the deny list holds shut.
    const both = friction({ allow: ["youtube.com"], deny: ["youtube.com"] });
    expect(momentVerdict("youtube.com", both)).toBe("deny");
  });

  it("leaves a hostname to the area when only a deny list is declared", () => {
    expect(momentVerdict("linear.app", friction({ deny: ["youtube.com"] }))).toBe("area_policy");
  });

  describe("the fallback — neither list declared", () => {
    it("hands every hostname back to the area, blocking nothing", () => {
      for (const host of ["linear.app", "youtube.com", "en.wikipedia.org"]) {
        expect(momentVerdict(host, NO_MOMENT_FRICTION)).toBe("area_policy");
      }
    });

    it("does the same when no moment is running at all", () => {
      expect(momentVerdict("youtube.com", null)).toBe("area_policy");
      expect(momentVerdict("youtube.com", undefined)).toBe("area_policy");
    });

    it("never fails open into allowing everything", () => {
      // "area_policy" is a question handed back, not an answer. The one thing
      // it must never be is "allow".
      expect(momentVerdict("youtube.com", NO_MOMENT_FRICTION)).not.toBe("allow");
    });
  });

  describe("hostname normalization", () => {
    it("ignores case and a leading www., on both sides", () => {
      expect(momentVerdict("WWW.Linear.app", friction({ allow: ["linear.app"] }))).toBe("allow");
      expect(momentVerdict("linear.app", friction({ allow: ["WWW.LINEAR.APP"] }))).toBe("allow");
      expect(momentVerdict("youtube.com", friction({ deny: ["www.youtube.com"] }))).toBe("deny");
    });

    it("hands an empty hostname back to the area rather than guessing", () => {
      expect(momentVerdict("", friction({ allow: ["linear.app"] }))).toBe("area_policy");
      expect(momentVerdict("   ", friction({ allow: ["linear.app"] }))).toBe("area_policy");
    });
  });
});
