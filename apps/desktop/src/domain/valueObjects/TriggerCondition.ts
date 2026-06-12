/**
 * TriggerCondition Value Object
 *
 * Desktop-local since the 2026-06-12 intervention-layer retirement
 * (was @keel/domain's trigger.ts; this frozen surface absorbed it).
 * Defines when an intervention should be triggered:
 * - immediate: Trigger immediately on drift detection
 * - delayed: Wait N ms before triggering
 * - threshold: Trigger after N drift events
 * - budget-based: Trigger when budget progress exceeds threshold
 */

export type TriggerCondition =
  | { readonly type: "immediate" }
  | { readonly type: "delayed"; readonly delayMs: number }
  | { readonly type: "threshold"; readonly eventCount: number }
  | { readonly type: "budget-based"; readonly progressThreshold: number };

export const createImmediateTrigger = (): TriggerCondition => ({
  type: "immediate",
});

export const createDelayedTrigger = (delayMs: number): TriggerCondition => ({
  type: "delayed",
  delayMs,
});

export const createThresholdTrigger = (
  eventCount: number,
): TriggerCondition => ({
  type: "threshold",
  eventCount,
});

export const createBudgetTrigger = (
  progressThreshold: number,
): TriggerCondition => ({
  type: "budget-based",
  progressThreshold,
});
