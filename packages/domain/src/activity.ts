/**
 * Activity log — the observability substrate.
 *
 * One append-only stream of raw, immutable events per surface. The log is the
 * product: surfaces are writers, analytics/models are read-side consumers.
 * Raw events are never aggregated at write time; 3s-bin / rolling-window
 * features are derived downstream.
 *
 * Provenance contract (the Graphiti episode pattern): every event carries a
 * stable unique `id`. Derived facts (slice E) cite the events they were
 * computed from via `sourceEventIds`, and carry a bi-temporal envelope
 * `{ validFrom, validTo?, learnedAt, invalidatedAt? }` — superseded facts are
 * invalidated, never deleted.
 */

/** The surface that observed the event. */
export type ActivitySurface = "agent" | "desktop" | "browser";

/**
 * Event kinds are an open set — each surface contributes its own vocabulary
 * (agent: session_start, prompt, tool_dispatched, tool_completed, turn_stop…;
 * desktop: app_focus, idle_start…; browser: tab_activated, navigation…).
 * Kinds accrete; they are not centrally enumerated.
 */
export type ActivityEventKind = string;

/** A single raw observation. Immutable once written. */
export interface ActivityEvent {
  /** Stable unique id — the provenance anchor derived facts cite. */
  readonly id: string;
  readonly surface: ActivitySurface;
  readonly kind: ActivityEventKind;
  /** Epoch milliseconds at observation time. */
  readonly ts: number;
  /** Groups events of one session (agent: Claude session_id). Empty when unknown. */
  readonly sessionId: string;
  /** Full captured context, size-capped per field at the writer. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Set when the event closes a measurable interval (e.g. tool_completed). */
  readonly durationMs?: number;
}

/** Construct an ActivityEvent. The caller supplies the id (writers own
 * id generation — the domain stays free of randomness). */
export function createActivityEvent(args: {
  readonly id: string;
  readonly surface: ActivitySurface;
  readonly kind: ActivityEventKind;
  readonly ts: number;
  readonly sessionId?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly durationMs?: number;
}): ActivityEvent {
  const { id, surface, kind, ts, sessionId, payload, durationMs } = args;
  return durationMs === undefined
    ? { id, surface, kind, ts, sessionId: sessionId ?? "", payload: payload ?? {} }
    : { id, surface, kind, ts, sessionId: sessionId ?? "", payload: payload ?? {}, durationMs };
}
