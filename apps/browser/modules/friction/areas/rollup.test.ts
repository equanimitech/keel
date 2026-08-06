import { describe, expect, it } from "vitest";
import { dwellLabel, hostOf, partition, rollup, visitsLabel } from "./rollup.js";

const MIN = 60_000;

describe("hostOf", () => {
  it("keeps a bare host", () => {
    expect(hostOf("youtube.com")).toBe("youtube.com");
  });
  it("strips a path", () => {
    expect(hostOf("youtube.com/shorts")).toBe("youtube.com");
  });
  it("leaves a subdomain alone — it is its own site", () => {
    expect(hostOf("web.whatsapp.com")).toBe("web.whatsapp.com");
  });
});

describe("rollup — collapse by domain", () => {
  it("sums a host's paths into one row", () => {
    const rows = rollup(
      {
        "youtube.com": 40 * MIN,
        "youtube.com/shorts": 20 * MIN,
        "youtube.com/watch": 17 * MIN,
      },
      {}
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].domain).toBe("youtube.com");
    expect(rows[0].dwellMs).toBe(77 * MIN);
  });

  it("hides paths that agree with their host", () => {
    const rows = rollup({ "youtube.com/shorts": 5 * MIN }, { "youtube.com": "ent" });
    expect(rows[0].paths).toEqual([]);
  });

  it("surfaces a path that disagrees — the split case", () => {
    const rows = rollup(
      { "linkedin.com": 10 * MIN, "linkedin.com/feed": 8 * MIN },
      { "linkedin.com": "themia", "linkedin.com/feed": "ent" }
    );
    expect(rows[0].areaId).toBe("themia");
    expect(rows[0].paths).toHaveLength(1);
    expect(rows[0].paths[0].areaId).toBe("ent");
  });

  it("ranks by attended time, not alphabetically", () => {
    const rows = rollup({ "aaa.com": 1 * MIN, "zzz.com": 90 * MIN }, {});
    expect(rows.map((r) => r.domain)).toEqual(["zzz.com", "aaa.com"]);
  });

  it("orders ties by name so reloads do not shuffle", () => {
    const rows = rollup({ "b.com": 0, "a.com": 0, "c.com": 0 }, {});
    expect(rows.map((r) => r.domain)).toEqual(["a.com", "b.com", "c.com"]);
  });

  it("keeps an assigned domain with no history", () => {
    const rows = rollup({}, { "lichess.org": "play" });
    expect(rows).toHaveLength(1);
    expect(rows[0].areaId).toBe("play");
  });

  it("keeps a visited domain with no assignment — that is the work to do", () => {
    const rows = rollup({ "newsite.example": 3 * MIN }, {});
    expect(rows[0].areaId).toBeNull();
  });
});

describe("partition", () => {
  it("separates sorted from unsorted", () => {
    const rows = rollup(
      { "youtube.com": 77 * MIN, "unknown.example": 5 * MIN },
      { "youtube.com": "ent" }
    );
    const { assigned, unsorted } = partition(rows);
    expect(assigned.get("ent")?.map((r) => r.domain)).toEqual(["youtube.com"]);
    expect(unsorted.map((r) => r.domain)).toEqual(["unknown.example"]);
  });

  it("lists a split host under both of its areas", () => {
    const rows = rollup(
      { "linkedin.com": 10 * MIN },
      { "linkedin.com": "themia", "linkedin.com/feed": "ent" }
    );
    const { assigned } = partition(rows);
    expect(assigned.get("themia")).toHaveLength(1);
    expect(assigned.get("ent")).toHaveLength(1);
  });

  it("treats a host assigned only at path level as sorted", () => {
    const rows = rollup({ "linkedin.com": 10 * MIN }, { "linkedin.com/feed": "ent" });
    const { assigned, unsorted } = partition(rows);
    expect(unsorted).toHaveLength(0);
    expect(assigned.get("ent")).toHaveLength(1);
  });
});

describe("two windows — visits (all time) and dwell (recent)", () => {
  it("carries all-time visits through from history", () => {
    const rows = rollup({ "youtube.com": 40 * MIN }, {}, { "youtube.com": 1204 });
    expect(rows[0].visits).toBe(1204);
    expect(rows[0].dwellMs).toBe(40 * MIN);
  });

  it("includes a site known only to browser history", () => {
    // Visited for years before keel existed — exactly what needs sorting.
    const rows = rollup({}, {}, { "old-forum.example": 88 });
    expect(rows.map((r) => r.domain)).toEqual(["old-forum.example"]);
    expect(rows[0].hasActivity).toBe(false);
  });

  it("marks a domain with visits but no recent dwell as inactive", () => {
    // The news.ycombinator.com case: assigned and visited historically, but
    // nothing in the window. Must not render as "0m".
    const rows = rollup({}, { "news.ycombinator.com": "ent" }, { "news.ycombinator.com": 12 });
    expect(rows[0].hasActivity).toBe(false);
    expect(rows[0].visits).toBe(12);
    expect(dwellLabel(rows[0].dwellMs)).toBe("");
  });

  it("marks a domain with dwell as active", () => {
    const rows = rollup({ "youtube.com": 1 }, {}, {});
    expect(rows[0].hasActivity).toBe(true);
  });

  it("defaults visits to zero when history is unavailable", () => {
    const rows = rollup({ "youtube.com": 40 * MIN }, {});
    expect(rows[0].visits).toBe(0);
  });
});

describe("ranking — attention outranks frequency", () => {
  it("puts the site with more dwell above the site with more visits", () => {
    const rows = rollup(
      { "youtube.com": 60 * MIN, "mail.example": 1 * MIN },
      {},
      { "youtube.com": 50, "mail.example": 5000 }
    );
    expect(rows.map((r) => r.domain)).toEqual(["youtube.com", "mail.example"]);
  });

  it("falls back to visits when neither has dwell", () => {
    const rows = rollup({}, {}, { "rare.example": 3, "common.example": 900 });
    expect(rows.map((r) => r.domain)).toEqual(["common.example", "rare.example"]);
  });

  it("falls back to name when nothing distinguishes them", () => {
    const rows = rollup({}, {}, { "b.example": 5, "a.example": 5 });
    expect(rows.map((r) => r.domain)).toEqual(["a.example", "b.example"]);
  });
});

describe("visitsLabel", () => {
  it("stays blank at zero rather than saying 0 visits", () => {
    expect(visitsLabel(0)).toBe("");
  });

  it("groups large counts for legibility", () => {
    expect(visitsLabel(1204)).toBe("1,204 visits");
  });
});

describe("dwellLabel", () => {
  it("stays blank rather than saying 0m", () => {
    expect(dwellLabel(0)).toBe("");
    expect(dwellLabel(-5)).toBe("");
  });
  it("uses minutes under an hour", () => {
    expect(dwellLabel(47 * MIN)).toBe("47m");
  });
  it("uses hours above one", () => {
    expect(dwellLabel(60 * MIN)).toBe("1h");
    expect(dwellLabel(137 * MIN)).toBe("2h 17m");
  });
});
