import { describe, expect, it } from "vitest";
import { LEGACY_KIND_ALIASES, canonicalKind } from "./activity.js";

describe("canonicalKind (read-side alias map for pre-taxonomy logs)", () => {
  it("maps the browser idle dialect to the span pattern", () => {
    expect(canonicalKind("browser_idle")).toBe("idle_start");
    expect(canonicalKind("browser_active")).toBe("idle_end");
  });

  it("maps the browser window-focus dialect to the focus span", () => {
    expect(canonicalKind("window_focus")).toBe("focus_start");
    expect(canonicalKind("window_blur")).toBe("focus_end");
  });

  it("maps the fake browser session to the writer-epoch kind", () => {
    expect(canonicalKind("browser_session_start")).toBe("writer_started");
  });

  it("maps the tray's logger_* kinds to the writer_* vocabulary", () => {
    expect(canonicalKind("logger_started")).toBe("writer_started");
    expect(canonicalKind("logger_paused")).toBe("writer_paused");
    expect(canonicalKind("logger_resumed")).toBe("writer_resumed");
  });

  it("maps the desktop focus dialect to the switch pattern", () => {
    expect(canonicalKind("app_focus")).toBe("app_switched");
  });

  it("passes canonical kinds through untouched", () => {
    expect(canonicalKind("idle_start")).toBe("idle_start");
    expect(canonicalKind("tool_completed")).toBe("tool_completed");
    expect(canonicalKind("tab_activated")).toBe("tab_activated");
  });

  it("passes the tab lifecycle + video play-state kinds through untouched", () => {
    expect(canonicalKind("tab_opened")).toBe("tab_opened");
    expect(canonicalKind("tab_closed")).toBe("tab_closed");
    expect(canonicalKind("video_paused")).toBe("video_paused");
    expect(canonicalKind("video_resumed")).toBe("video_resumed");
  });

  it("never maps onto a key of the alias table (no chains)", () => {
    for (const target of Object.values(LEGACY_KIND_ALIASES)) {
      expect(LEGACY_KIND_ALIASES[target]).toBeUndefined();
    }
  });
});
