/**
 * Bouts — the read-side behavioral unit.
 *
 * The event taxonomy defines it: *"The behavioral unit is the read-side bout
 * (web-analytics 'visit'): derived by inactivity timeout over the merged log.
 * Writers never claim bouts."* This module is that derivation, and it is the
 * ONE place the dwell methodology lives.
 *
 * Canonized here so every retrospective uses the same math (the 2026-07-13
 * finding: ending a content retreat needed two ad-hoc Python scripts, and that
 * logic belongs in keel rather than a session scratchpad):
 *
 *   1. global timeline    — all surfaces merged, sorted by ts
 *   2. focus/idle-gated   — time while the browser lacks OS focus, or while
 *                           chrome.idle reports idle, does not accumulate
 *   3. 30m segment cap    — a single gap contributes at most SEGMENT_CAP_MS,
 *                           so a tab left open overnight cannot invent dwell
 *   4. dedup by event id  — the relay can deliver a batch twice; ids are stable
 *
 * Pure. No I/O, no clock — callers pass events in and the domain classifier
 * separately.
 */

import type { ActivityEvent } from "./activity.js";
import { canonicalKind } from "./activity.js";
import { createDomain, createDuration, type Domain, type Duration } from "./value-objects.js";

/** A gap longer than this ends the bout (web-analytics visit timeout). */
export const BOUT_GAP_MS = 30 * 60 * 1000;

/** Maximum dwell attributable to one gap between events. */
export const SEGMENT_CAP_MS = 30 * 60 * 1000;

/** One continuous span of attention, possibly spanning several domains. */
export interface Bout {
  readonly startTs: number;
  readonly endTs: number;
  /** Focus/idle-gated, segment-capped attended time. */
  readonly dwellMs: Duration;
  /** Domain changes within the bout — the fragmentation signal. */
  readonly switches: number;
  /** Attended time per domain within the bout. */
  readonly byDomain: ReadonlyMap<Domain, Duration>;
  /** Domain holding the most attended time, or null if none accumulated. */
  readonly dominant: Domain | null;
  /** Longest unbroken single-domain stretch — the binge signal. */
  readonly longestRunMs: Duration;
}

/** Kinds that mark attention leaving, and returning. */
const ATTENTION_OFF = new Set(["focus_end", "idle_start"]);
const ATTENTION_ON = new Set(["focus_start", "idle_end"]);

/** Pull a domain off an event payload, if it carries one. */
function domainOf(event: ActivityEvent): Domain | null {
  const raw = event.payload["domain"];
  return typeof raw === "string" && raw.length > 0 ? createDomain(raw) : null;
}

/** Dedup by id, then sort by ts. Stable for equal timestamps. */
function normalize(events: readonly ActivityEvent[]): readonly ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>();
  for (const event of events) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }
  return [...byId.values()].sort((a, b) => a.ts - b.ts);
}

/** Mutable accumulator; frozen into a Bout by `seal`. */
interface Draft {
  startTs: number;
  endTs: number;
  dwellMs: number;
  switches: number;
  byDomain: Map<Domain, number>;
  runDomain: Domain | null;
  runMs: number;
  longestRunMs: number;
}

function newDraft(ts: number): Draft {
  return {
    startTs: ts,
    endTs: ts,
    dwellMs: 0,
    switches: 0,
    byDomain: new Map(),
    runDomain: null,
    runMs: 0,
    longestRunMs: 0,
  };
}

function seal(draft: Draft): Bout {
  const longest = Math.max(draft.longestRunMs, draft.runMs);
  let dominant: Domain | null = null;
  let best = 0;
  for (const [domain, ms] of draft.byDomain) {
    if (ms > best) {
      best = ms;
      dominant = domain;
    }
  }
  const byDomain = new Map<Domain, Duration>();
  for (const [domain, ms] of draft.byDomain) {
    byDomain.set(domain, createDuration(ms));
  }
  return {
    startTs: draft.startTs,
    endTs: draft.endTs,
    dwellMs: createDuration(draft.dwellMs),
    switches: draft.switches,
    byDomain,
    dominant,
    longestRunMs: createDuration(longest),
  };
}

/**
 * Derive bouts from a merged event stream.
 *
 * Attribution is *backwards*: the gap between event N and N+1 is credited to
 * the domain in flight at N. That is what makes a single `navigation_committed`
 * followed by 30 minutes of silence count as 30 minutes on that domain rather
 * than zero — while the cap keeps an abandoned tab from counting as a night.
 */
export function bouts(events: readonly ActivityEvent[]): readonly Bout[] {
  const ordered = normalize(events);
  const out: Bout[] = [];
  let draft: Draft | null = null;
  let current: Domain | null = null;
  let attending = true;

  for (const event of ordered) {
    const kind = canonicalKind(event.kind);

    // Close the bout when the stream goes quiet for longer than the timeout.
    if (draft !== null && event.ts - draft.endTs > BOUT_GAP_MS) {
      out.push(seal(draft));
      draft = null;
      current = null;
    }

    // Credit the elapsed gap to whatever was in flight, if we were attending.
    if (draft !== null && current !== null && attending) {
      const elapsed = Math.min(event.ts - draft.endTs, SEGMENT_CAP_MS);
      if (elapsed > 0) {
        draft.dwellMs += elapsed;
        draft.byDomain.set(current, (draft.byDomain.get(current) ?? 0) + elapsed);
        if (draft.runDomain === current) {
          draft.runMs += elapsed;
        }
      }
    }

    if (ATTENTION_OFF.has(kind)) {
      attending = false;
    } else if (ATTENTION_ON.has(kind)) {
      attending = true;
    }

    const domain = domainOf(event);
    if (domain !== null) {
      if (draft === null) {
        draft = newDraft(event.ts);
      }
      if (current !== null && domain !== current) {
        draft.switches += 1;
      }
      if (draft.runDomain !== domain) {
        draft.longestRunMs = Math.max(draft.longestRunMs, draft.runMs);
        draft.runDomain = domain;
        draft.runMs = 0;
      }
      current = domain;
    }

    if (draft !== null) {
      draft.endTs = event.ts;
    }
  }

  if (draft !== null) {
    out.push(seal(draft));
  }
  return out;
}
