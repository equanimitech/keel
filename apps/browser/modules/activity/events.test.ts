import { describe, expect, it } from "vitest";
import {
  MAX_LOG_EVENTS,
  buildBrowserEvent,
  domainFromUrl,
  excessEventCount,
  exportFileName,
  focusTransition,
  idleTransition,
  shouldLogNavigation,
  startOfLocalDay,
  tallyCompletionsSince,
  toJsonl,
} from "./events";
import { routeFor, shouldLogRoute, routeChanged, shouldLogTabClose } from "./events";

describe("shouldLogTabClose", () => {
  it("logs a tab_closed only when the removed tab had a known domain", () => {
    expect(shouldLogTabClose("youtube.com")).toBe(true);
  });

  it("does not log when the tab's domain was never tracked (non-web / new tab)", () => {
    expect(shouldLogTabClose(null)).toBe(false);
  });
});

describe("domainFromUrl", () => {
  it("strips to a bare lowercase domain — never a full URL", () => {
    expect(domainFromUrl("https://www.YouTube.com/watch?v=abc&t=10s")).toBe(
      "youtube.com"
    );
  });

  it("drops a leading www.", () => {
    expect(domainFromUrl("https://www.example.com/")).toBe("example.com");
  });

  it("keeps non-www subdomains", () => {
    expect(domainFromUrl("https://mail.example.com/inbox")).toBe(
      "mail.example.com"
    );
  });

  it("never includes path, query, fragment, port, or credentials", () => {
    const domain = domainFromUrl(
      "https://user:pass@example.com:8443/a/b?q=1#frag"
    );
    expect(domain).toBe("example.com");
  });

  it("allows plain http", () => {
    expect(domainFromUrl("http://example.com/page")).toBe("example.com");
  });

  it("returns null for chrome:// pages", () => {
    expect(domainFromUrl("chrome://extensions")).toBeNull();
    expect(domainFromUrl("chrome://newtab/")).toBeNull();
  });

  it("returns null for other non-web schemes", () => {
    expect(domainFromUrl("about:blank")).toBeNull();
    expect(domainFromUrl("file:///etc/hosts")).toBeNull();
    expect(domainFromUrl("chrome-extension://abcdef/manage.html")).toBeNull();
    expect(domainFromUrl("data:text/html,<p>hi</p>")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(domainFromUrl("")).toBeNull();
    expect(domainFromUrl("not a url")).toBeNull();
    expect(domainFromUrl("https://")).toBeNull();
  });
});

describe("shouldLogNavigation", () => {
  it("logs the first domain seen on a tab", () => {
    expect(shouldLogNavigation(null, "example.com")).toBe(true);
  });

  it("logs when the domain changes", () => {
    expect(shouldLogNavigation("example.com", "youtube.com")).toBe(true);
  });

  it("dedupes SPA-path navigations on the same domain", () => {
    expect(shouldLogNavigation("youtube.com", "youtube.com")).toBe(false);
  });

  it("never logs a non-web destination", () => {
    expect(shouldLogNavigation("example.com", null)).toBe(false);
    expect(shouldLogNavigation(null, null)).toBe(false);
  });
});

describe("buildBrowserEvent", () => {
  it("pins the surface to browser and mirrors ActivityEvent shape", () => {
    const event = buildBrowserEvent({
      id: "11111111-1111-4111-8111-111111111111",
      kind: "tab_activated",
      ts: 1_765_000_000_000,
      sessionId: "22222222-2222-4222-8222-222222222222",
      payload: { domain: "example.com" },
    });
    expect(event).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      surface: "browser",
      kind: "tab_activated",
      ts: 1_765_000_000_000,
      sessionId: "22222222-2222-4222-8222-222222222222",
      payload: { domain: "example.com" },
    });
    expect("durationMs" in event).toBe(false);
  });

  it("defaults payload to an empty object", () => {
    const event = buildBrowserEvent({
      id: "a",
      kind: "writer_started",
      ts: 1,
      sessionId: "s",
    });
    expect(event.payload).toEqual({});
  });

  it("carries durationMs only when provided", () => {
    const event = buildBrowserEvent({
      id: "a",
      kind: "focus_end",
      ts: 1,
      sessionId: "s",
      durationMs: 500,
    });
    expect(event.durationMs).toBe(500);
  });
});

describe("focusTransition (focus span — browser holds OS focus)", () => {
  it("opens a span with focus_start when the browser gains focus", () => {
    expect(focusTransition(null, true, 1_000)).toEqual({
      kind: "focus_start",
      spanStart: 1_000,
    });
  });

  it("closes the span with focus_end + durationMs on blur", () => {
    expect(focusTransition(5_000, false, 12_000)).toEqual({
      kind: "focus_end",
      durationMs: 7_000,
      spanStart: null,
    });
  });

  it("dedupes window-to-window focus hops — span stays open", () => {
    expect(focusTransition(5_000, true, 9_000)).toEqual({
      kind: null,
      spanStart: 5_000,
    });
  });

  it("ignores blur when no span is open", () => {
    expect(focusTransition(null, false, 9_000)).toEqual({
      kind: null,
      spanStart: null,
    });
  });
});

describe("idleTransition (idle span — AFK bracketing)", () => {
  it("opens a span with idle_start when input stops", () => {
    expect(idleTransition(null, "idle", 2_000)).toEqual({
      kind: "idle_start",
      spanStart: 2_000,
    });
  });

  it("locked counts as idle", () => {
    expect(idleTransition(null, "locked", 2_000)).toEqual({
      kind: "idle_start",
      spanStart: 2_000,
    });
  });

  it("idle → locked stays inside the open span", () => {
    expect(idleTransition(2_000, "locked", 3_000)).toEqual({
      kind: null,
      spanStart: 2_000,
    });
  });

  it("closes the span with idle_end + durationMs on return", () => {
    expect(idleTransition(2_000, "active", 10_000)).toEqual({
      kind: "idle_end",
      durationMs: 8_000,
      spanStart: null,
    });
  });

  it("emits idle_end without durationMs when the span start was never observed (worker restarted mid-idle)", () => {
    expect(idleTransition(null, "active", 10_000)).toEqual({
      kind: "idle_end",
      spanStart: null,
    });
  });
});

describe("excessEventCount (prune decision)", () => {
  it("does nothing at or under the cap", () => {
    expect(excessEventCount(0)).toBe(0);
    expect(excessEventCount(MAX_LOG_EVENTS)).toBe(0);
  });

  it("deletes exactly the overflow beyond the cap", () => {
    expect(excessEventCount(MAX_LOG_EVENTS + 1)).toBe(1);
    expect(excessEventCount(250_000)).toBe(50_000);
  });

  it("honours a custom cap", () => {
    expect(excessEventCount(10, 5)).toBe(5);
    expect(excessEventCount(4, 5)).toBe(0);
  });
});

describe("toJsonl", () => {
  it("renders one JSON object per line with a trailing newline", () => {
    const events = [
      buildBrowserEvent({ id: "1", kind: "focus_end", ts: 1, sessionId: "s" }),
      buildBrowserEvent({
        id: "2",
        kind: "tab_activated",
        ts: 2,
        sessionId: "s",
        payload: { domain: "example.com" },
      }),
    ];
    const jsonl = toJsonl(events);
    const lines = jsonl.split("\n");
    expect(jsonl.endsWith("\n")).toBe(true);
    expect(lines.filter(Boolean)).toHaveLength(2);
    expect(JSON.parse(lines[1])).toEqual(events[1]);
  });

  it("renders an empty log as an empty string", () => {
    expect(toJsonl([])).toBe("");
  });
});

describe("exportFileName", () => {
  it("formats as YYYY-MM-DD-browser-export.jsonl", () => {
    const ts = new Date(2026, 5, 12, 15, 30).getTime();
    expect(exportFileName(ts)).toBe("2026-06-12-browser-export.jsonl");
  });

  it("zero-pads month and day", () => {
    const ts = new Date(2026, 0, 5).getTime();
    expect(exportFileName(ts)).toBe("2026-01-05-browser-export.jsonl");
  });
});

describe("route helpers", () => {
  it("routeFor extracts a normalized route from a url", () => {
    expect(routeFor("https://www.youtube.com/shorts/abc?x=1")).toEqual({
      domain: "youtube.com",
      route: "/shorts",
    });
  });
  it("routeFor returns null route for an unregistered host", () => {
    expect(routeFor("https://github.com/acme/keel")).toEqual({
      domain: "github.com",
      route: null,
    });
  });
  it("routeFor returns null domain for a non-web url", () => {
    expect(routeFor("chrome://extensions")).toEqual({ domain: null, route: null });
  });
  it("shouldLogRoute is true only for observe-tier + logDetail", () => {
    expect(shouldLogRoute("youtube.com", ["youtube.com"], true)).toBe(true);
    expect(shouldLogRoute("youtube.com", ["youtube.com"], false)).toBe(false);
    expect(shouldLogRoute("youtube.com", [], true)).toBe(false);
    expect(shouldLogRoute(null, ["youtube.com"], true)).toBe(false);
  });
  it("routeChanged is true only when the route actually changes", () => {
    expect(routeChanged("/shorts", "/watch")).toBe(true);
    expect(routeChanged("/shorts", "/shorts")).toBe(false);
    expect(routeChanged(null, "/shorts")).toBe(true);
    expect(routeChanged("/shorts", null)).toBe(false);
  });
});

describe("tallyCompletionsSince (popup deep-sensor mirror)", () => {
  const ev = (kind: string, ts: number) => ({ kind, ts });

  it("counts video_started / game_finished / post_seen at or after the cutoff", () => {
    const tally = tallyCompletionsSince(
      [
        ev("video_started", 100),
        ev("video_started", 150),
        ev("game_finished", 200),
        ev("post_seen", 210),
        ev("post_seen", 220),
        ev("focus_start", 230), // coarse event — ignored
      ],
      0
    );
    expect(tally).toEqual({ videos: 2, games: 1, posts: 2 });
  });

  it("excludes events before the cutoff", () => {
    const tally = tallyCompletionsSince(
      [ev("video_started", 50), ev("video_started", 500)],
      100
    );
    expect(tally).toEqual({ videos: 1, games: 0, posts: 0 });
  });

  it("ignores video_ended and coarse events in the tally", () => {
    const tally = tallyCompletionsSince(
      [
        ev("video_ended", 100),
        ev("tab_activated", 100),
        ev("navigation_committed", 100),
      ],
      0
    );
    expect(tally).toEqual({ videos: 0, games: 0, posts: 0 });
  });
});

describe("startOfLocalDay", () => {
  it("is at or before the timestamp and idempotent", () => {
    const ts = 1781370000000;
    const midnight = startOfLocalDay(ts);
    expect(midnight).toBeLessThanOrEqual(ts);
    expect(startOfLocalDay(midnight)).toBe(midnight);
  });
});
