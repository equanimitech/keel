/**
 * Budget and constraint types for the keel platform.
 *
 * Budgets are aspirational constraints that encode user intention.
 * They modulate intervention intensity — never block access.
 *
 * Desktop budgets: session-scoped (time-boxed focus sessions)
 * Browser budgets: rolling-window (per-day, per-week)
 *
 * Both use the same type system. The difference is in how
 * consumption is tracked — that's an infrastructure concern,
 * not a domain concern.
 */

// ── Session Unit ────────────────────────────────────────────────

/** What counts as a "session" depends on context. */
export type SessionUnit = "game" | "video" | "page-view" | "app-switch";

// ── Budget Dimension ────────────────────────────────────────────

/**
 * A single axis of constraint within a budget.
 *
 * Budgets are multi-dimensional — a user might set both
 * "max 60 min/day on YouTube" AND "max 3 videos/day".
 * The most-violated dimension drives overall progress.
 */
export type BudgetDimension =
  | { readonly kind: "days-per-week"; readonly limit: number }
  | { readonly kind: "time-per-day"; readonly limitMinutes: number }
  | {
      readonly kind: "sessions-per-day";
      readonly limit: number;
      readonly unit: SessionUnit;
    }
  | {
      readonly kind: "sessions-per-week";
      readonly limit: number;
      readonly unit: SessionUnit;
    }
  | {
      readonly kind: "session-duration";
      readonly limitMinutes: number;
    };

// ── Budget Definition ───────────────────────────────────────────

/**
 * A user's stated intention for a specific domain.
 *
 * Budgets are always aspirational — the user set them voluntarily
 * and can always override. They create awareness, not restriction.
 */
export interface BudgetDefinition {
  readonly domain: string;
  readonly dimensions: readonly BudgetDimension[];
  /**
   * Aspirational budgets inform signals and modulate shield intensity.
   * Enforced budgets (future) could hard-block access.
   * Default: true (aspirational).
   */
  readonly isAspirational: boolean;
}

// ── Budget Consumption ──────────────────────────────────────────

/** Consumption state for a single dimension. */
export interface DimensionConsumption {
  readonly kind: BudgetDimension["kind"];
  readonly consumed: number;
  readonly limit: number;
  /** consumed / limit — 0.0 to 1.0+ (can exceed 1.0 if over budget) */
  readonly progress: number;
}

/**
 * Aggregate consumption state for a domain's budget.
 *
 * overallProgress = max(all dimension progress ratios)
 * The most-violated constraint drives the response.
 */
export interface BudgetConsumption {
  readonly domain: string;
  readonly dimensions: readonly DimensionConsumption[];
  /** max(dimensions.map(d => d.progress)) */
  readonly overallProgress: number;
}

// ── Factories ───────────────────────────────────────────────────

export const createBudgetDefinition = (
  domain: string,
  dimensions: readonly BudgetDimension[],
): BudgetDefinition => ({
  domain,
  dimensions,
  isAspirational: true,
});

export const computeOverallProgress = (
  dimensions: readonly DimensionConsumption[],
): number =>
  dimensions.length === 0
    ? 0
    : Math.max(...dimensions.map((d) => d.progress));
