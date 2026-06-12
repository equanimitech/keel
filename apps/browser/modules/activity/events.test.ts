import { describe, expect, it } from "vitest";
import {
  MAX_LOG_EVENTS,
  buildBrowserEvent,
  domainFromUrl,
  excessEventCount,
  exportFileName,
  focusTransition,
  idleKind,
  shouldLogNavigation,
  toJsonl,
} from "./events";

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
      kind: "browser_session_start",
      ts: 1,
      sessionId: "s",
    });
    expect(event.payload).toEqual({});
  });

  it("carries durationMs only when provided", () => {
    const event = buildBrowserEvent({
      id: "a",
      kind: "window_blur",
      ts: 1,
      sessionId: "s",
      durationMs: 500,
    });
    expect(event.durationMs).toBe(500);
  });
});

describe("focusTransition", () => {
  it("emits window_blur when leaving the browser", () => {
    expect(focusTransition(true, false)).toBe("window_blur");
  });

  it("emits window_focus when returning", () => {
    expect(focusTransition(false, true)).toBe("window_focus");
  });

  it("dedupes repeated states (window-to-window focus hops)", () => {
    expect(focusTransition(true, true)).toBeNull();
    expect(focusTransition(false, false)).toBeNull();
  });
});

describe("idleKind", () => {
  it("maps active to browser_active", () => {
    expect(idleKind("active")).toBe("browser_active");
  });

  it("maps idle and locked to browser_idle", () => {
    expect(idleKind("idle")).toBe("browser_idle");
    expect(idleKind("locked")).toBe("browser_idle");
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
      buildBrowserEvent({ id: "1", kind: "window_blur", ts: 1, sessionId: "s" }),
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
