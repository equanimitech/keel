/**
 * Dwell scopes — the period the page is reading, as a control rather than a
 * caption.
 *
 * The Areas page originally showed one unlabelled number, which invited being
 * read as "what I did" and was in fact "since the last relay flush". Labelling
 * it fixed the lie; letting you *choose* it fixes the underlying problem, which
 * is that no single window answers every question.
 *
 * The same day reads differently at each zoom, and both readings are true: a
 * two-hour binge dominates `today` and disappears into `month`. That is
 * attentional granularity — the scope is part of the question, not a setting.
 *
 * Pure: no storage, no clock beyond what the caller passes.
 */

export type ScopeId = "day" | "week" | "month" | "all";

export interface Scope {
  readonly id: ScopeId;
  /** Control label. Lowercase — it is a choice, not a heading. */
  readonly label: string;
  /** Prose for the legend, reading naturally after "attended time in". */
  readonly phrase: string;
  readonly days: number;
}

/**
 * Ordered narrow → wide, so the zoom control is a single axis.
 *
 * `all` has no horizon: the store keeps everything and the channel is a local
 * pipe, so there is no reason to refuse a question about your own past. It is
 * the only scope whose cost grows without bound, which is why it sits at the
 * far end rather than being the default.
 */
export const SCOPES: readonly Scope[] = [
  { id: "day", label: "today", phrase: "today", days: 1 },
  { id: "week", label: "this week", phrase: "the last 7 days", days: 7 },
  { id: "month", label: "this month", phrase: "the last 30 days", days: 30 },
  { id: "all", label: "everything", phrase: "your whole log", days: Infinity },
];

export const DEFAULT_SCOPE: ScopeId = "week";

export function scopeById(id: string): Scope {
  return SCOPES.find((s) => s.id === id) ?? SCOPES[1];
}

/** One step wider, or null at the far end. */
export function wider(scope: Scope): Scope | null {
  const i = SCOPES.findIndex((s) => s.id === scope.id);
  return SCOPES[i + 1] ?? null;
}

/** One step narrower, or null at the near end. */
export function narrower(scope: Scope): Scope | null {
  const i = SCOPES.findIndex((s) => s.id === scope.id);
  return i > 0 ? SCOPES[i - 1] : null;
}

/**
 * Start of the scope's window.
 *
 * `day` means *today* — since local midnight, not the last 24 hours. Asked
 * "how much today", nobody means a rolling window; they mean since they woke
 * up. Wider scopes are rolling, where a calendar boundary would be arbitrary.
 */
export function scopeSince(scope: Scope, now: number): number {
  if (scope.id === "all") {
    return 0;
  }
  if (scope.id === "day") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return now - scope.days * 24 * 60 * 60 * 1000;
}
