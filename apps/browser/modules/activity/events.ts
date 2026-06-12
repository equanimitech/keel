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

/**
 * Outcome of feeding one observation into a span (start/end + durationMs
 * pattern — see packages/domain/docs/event-taxonomy.md).
 *
 * `kind` is the event to emit (null = nothing to log); `durationMs` is set
 * only on an end event whose start was observed; `spanStart` is the state
 * the caller carries to the next observation.
 */
export interface SpanTransition {
  readonly kind: string | null;
  readonly durationMs?: number;
  readonly spanStart: number | null;
}

/**
 * Focus span — the browser holds OS focus (`focus_start`/`focus_end`).
 * Window-to-window hops inside the browser dedupe; the span stays open.
 */
export function focusTransition(
  spanStart: number | null,
  isFocused: boolean,
  now: number
): SpanTransition {
  if (isFocused) {
    return spanStart === null
      ? { kind: "focus_start", spanStart: now }
      : { kind: null, spanStart };
  }
  return spanStart === null
    ? { kind: null, spanStart: null }
    : { kind: "focus_end", durationMs: now - spanStart, spanStart: null };
}

/**
 * Idle span — AFK bracketing over chrome.idle states
 * ("active" | "idle" | "locked"; locked counts as idle).
 *
 * "active" with no open span means the service worker restarted mid-idle:
 * the boundary is real, so `idle_end` is emitted without a duration.
 */
export function idleTransition(
  spanStart: number | null,
  state: string,
  now: number
): SpanTransition {
  if (state !== "active") {
    return spanStart === null
      ? { kind: "idle_start", spanStart: now }
      : { kind: null, spanStart };
  }
  return spanStart === null
    ? { kind: "idle_end", spanStart: null }
    : { kind: "idle_end", durationMs: now - spanStart, spanStart: null };
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
