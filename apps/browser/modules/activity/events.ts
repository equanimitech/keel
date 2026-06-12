/**
 * Activity events — pure functions for the browser surface writer.
 *
 * Everything here is side-effect free: event building, domain stripping,
 * navigation dedupe, focus transitions, prune decisions, JSONL rendering.
 * The chrome.* wiring lives in `writer.ts`; IndexedDB persistence in `log.ts`.
 *
 * Privacy posture (load-bearing, from the observability roadmap):
 * payloads carry DOMAINS only — never full URLs, never page titles.
 */

import { createActivityEvent, createDomain } from "@keel/domain";
import type { ActivityEvent } from "@keel/domain";

/** Retention ceiling — on startup the writer prunes oldest events beyond this. */
export const MAX_LOG_EVENTS = 200_000;

/** chrome.idle detection interval, in seconds. */
export const IDLE_DETECTION_SECONDS = 120;

// ── Domain stripping ──────────────────────────────────────────────

/**
 * Extract a bare domain from a URL string.
 *
 * Returns `null` for anything that is not an ordinary web page: invalid
 * URLs, chrome:// / about: / file: / chrome-extension:// and every other
 * non-http(s) scheme. The result is lowercase with a leading "www." dropped
 * (the shared `Domain` value-object convention) and never contains a path,
 * query, fragment, port, or credentials.
 */
export function domainFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.hostname === "") {
    return null;
  }
  return createDomain(parsed.hostname);
}

// ── Event building ────────────────────────────────────────────────

export interface BrowserEventInput {
  readonly id: string;
  readonly kind: string;
  readonly ts: number;
  readonly sessionId: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly durationMs?: number;
}

/** Build an ActivityEvent pinned to the "browser" surface. */
export function buildBrowserEvent(input: BrowserEventInput): ActivityEvent {
  return createActivityEvent({ ...input, surface: "browser" });
}

// ── Dedupe / transition decisions ─────────────────────────────────

/**
 * Log a navigation only when the DOMAIN changes — never per-SPA-path.
 * `null` next-domain (non-web page) is never logged.
 */
export function shouldLogNavigation(
  previousDomain: string | null,
  nextDomain: string | null
): nextDomain is string {
  return nextDomain !== null && nextDomain !== previousDomain;
}

export type FocusEventKind = "window_focus" | "window_blur";

/**
 * Translate a focus-state change into an event kind, deduping repeats
 * (e.g. focus hopping between two browser windows stays "focused").
 */
export function focusTransition(
  wasFocused: boolean,
  isFocused: boolean
): FocusEventKind | null {
  if (wasFocused === isFocused) {
    return null;
  }
  return isFocused ? "window_focus" : "window_blur";
}

export type IdleEventKind = "browser_idle" | "browser_active";

/** Map a chrome.idle state ("active" | "idle" | "locked") to an event kind. */
export function idleKind(state: string): IdleEventKind {
  return state === "active" ? "browser_active" : "browser_idle";
}

// ── Retention ─────────────────────────────────────────────────────

/** How many oldest events to delete so the store fits under `max`. */
export function excessEventCount(
  total: number,
  max: number = MAX_LOG_EVENTS
): number {
  return total > max ? total - max : 0;
}

// ── Export (JSONL) ────────────────────────────────────────────────

/** Render events as JSONL — one JSON object per line, trailing newline. */
export function toJsonl(events: readonly ActivityEvent[]): string {
  let out = "";
  for (const event of events) {
    out += JSON.stringify(event) + "\n";
  }
  return out;
}

/** `YYYY-MM-DD-browser-export.jsonl` for the given timestamp (local time). */
export function exportFileName(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-browser-export.jsonl`;
}
